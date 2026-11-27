/**
 * 涟歌 Ripple Song — 核心逻辑层（纯函数，无 DOM 依赖，可完整单测）
 *
 * 玩法内核：
 *   1. 一片 160×90 的波场，按定步长 1/60 秒显式积分波动方程
 *      u_next = (2u − u_prev + C²·∇²u) × damp
 *   2. 玩家唯一的操作是**移动波源**；共鸣点不可交互，
 *      只能靠波的干涉把振幅包络顶到阈值以上才被点亮
 *   3. 礁石是吸收边界：波撞上去被吃掉，同时形成驻波
 *   4. 关卡的目标点由「标准解」模拟产出 —— 每一关都保证有解
 *
 * 架构约束（不可动摇）：
 *   **波场模拟只在 JS 里跑，GPU 只负责把波场画出来。**
 *   本文件不引用 document / window / localStorage / performance /
 *   requestAnimationFrame，渲染层不得参与任何判定。
 */

/* ── 常量 ───────────────────────────────────────────── */

/** 波场网格尺寸。 */
export const GRID_W = 160;
export const GRID_H = 90;
export const CELL_COUNT = GRID_W * GRID_H;

/** 波速平方（C²）。显式积分的稳定上限是 0.5，这里留出余量。 */
export const WAVE_C2 = 0.45;
/** 每步阻尼。 */
export const WAVE_DAMP = 0.995;
/** 波源周期（步）。与 C² 一起决定波长 ≈ C × 周期 格。 */
export const SOURCE_PERIOD = 24;
/** 波源驱动振幅。 */
export const SOURCE_AMP = 1;
/** 振幅包络的每步衰减系数（峰值保持 + 衰减）。 */
export const ENVELOPE_DECAY = 0.99;
/** 定步长：1/60 秒。 */
export const STEP_MS = 1000 / 60;
/** 单帧最多推进多少步（防止标签页切回来时一次补上几千步）。 */
export const MAX_STEPS_PER_FRAME = 5;

/** 点亮阈值 = 标准解峰值 × 该系数。 */
export const LIT_RATIO = 0.6;
/** 共鸣点之间的最小间距（格）。 */
export const MIN_TARGET_GAP = 16;
/** 共鸣点允许离波源的最大距离（格）—— 远于此波传播不到，响应太慢。 */
export const MAX_TARGET_RANGE = 46;

/* ── 确定性随机 ─────────────────────────────────────── */

/**
 * mulberry32：可复现的伪随机数发生器。
 * @param {number} seed
 * @returns {() => number} 返回 [0, 1) 的随机源
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 字符串散列（FNV-1a 变体）。
 * @param {string} str
 * @returns {number}
 */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 整数哈希，用于把坐标映射成稳定随机。 */
function hash2(x, y, seed) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x + 0x9e3779b9), 0x85ebca6b);
  h = Math.imul(h ^ (y + 0xc2b2ae35), 0x27d4eb2f);
  return (h ^ (h >>> 15)) >>> 0;
}

/* ── 波场 ───────────────────────────────────────────── */

/**
 * @typedef {Object} Field
 * @property {number} w
 * @property {number} h
 * @property {Float32Array} u 当前位移
 * @property {Float32Array} uPrev 上一帧位移（显式积分的第二个历史量）
 * @property {Float32Array} uNext 下一帧位移（轮转缓冲）
 * @property {Float32Array} env 振幅包络（近期峰值，峰值保持 + 衰减）
 * @property {Uint8Array} obstacles 礁石掩码（1 = 吸收边界）
 */

/**
 * 新建一片空波场。
 * @returns {Field}
 */
/** @feature F-001 波场数据结构 */
export function createField() {
  return {
    w: GRID_W,
    h: GRID_H,
    u: new Float32Array(CELL_COUNT),
    uPrev: new Float32Array(CELL_COUNT),
    uNext: new Float32Array(CELL_COUNT),
    env: new Float32Array(CELL_COUNT),
    obstacles: new Uint8Array(CELL_COUNT),
  };
}

/**
 * 推进一个定步长：波动方程显式积分 + 波源驱动 + 礁石吸收。
 *
 * 边界条件：网格外一圈恒为 0（吸收），礁石格也恒为 0。
 * 因此礁石会把波吃掉，并在其两侧留下驻波。
 *
 * @param {Field} field
 * @param {{x: number, y: number}[]} sources 波源（相干，同相位）
 * @param {number} t 全局步计数（决定源的相位）
 */
/** @feature F-002 定步长波动方程积分 */
export function stepWave(field, sources, t) {
  const { w, h, u, uPrev, uNext, obstacles } = field;
  const c2 = WAVE_C2;
  const damp = WAVE_DAMP;

  for (let r = 1; r < h - 1; r += 1) {
    const row = r * w;
    for (let c = 1; c < w - 1; c += 1) {
      const i = row + c;
      if (obstacles[i]) {
        /** @feature F-004 礁石吸收边界：波撞上去被吃掉 */
        uNext[i] = 0;
        u[i] = 0;
        uPrev[i] = 0;
        continue;
      }
      const cur = u[i];
      const lap = u[i - 1] + u[i + 1] + u[i - w] + u[i + w] - 4 * cur;
      uNext[i] = (2 * cur - uPrev[i] + c2 * lap) * damp;
    }
  }

  // 吸收边界：最外一圈恒为 0
  for (let c = 0; c < w; c += 1) {
    uNext[c] = 0;
    uNext[(h - 1) * w + c] = 0;
  }
  for (let r = 0; r < h; r += 1) {
    uNext[r * w] = 0;
    uNext[r * w + w - 1] = 0;
  }

  // 波源驱动：所有源同相位（相干源才有干涉）
  /** @feature F-003 波源驱动：相干正弦振子，周期 24 步 */
  const phase = (t % SOURCE_PERIOD) / SOURCE_PERIOD;
  const drive = SOURCE_AMP * Math.sin(2 * Math.PI * phase);
  for (let s = 0; s < sources.length; s += 1) {
    const src = sources[s];
    const i = src.y * w + src.x;
    if (i < 0 || i >= CELL_COUNT) continue;
    uNext[i] = drive;
  }

  // 三缓冲轮转
  const spare = field.uPrev;
  field.uPrev = field.u;
  field.u = field.uNext;
  field.uNext = spare;
}

/**
 * 更新振幅包络：峰值保持 + 每步衰减。
 * 包络代表「最近一段时间这里的最大振幅」，用来判断共鸣点是否被点亮。
 *
 * @param {Field} field
 */
/** @feature F-005 振幅包络：峰值保持 + 衰减 */
export function updateEnvelope(field) {
  const { u, env } = field;
  const decay = ENVELOPE_DECAY;
  for (let i = 0; i < u.length; i += 1) {
    const a = Math.abs(u[i]);
    const e = env[i] * decay;
    env[i] = a > e ? a : e;
  }
}

/* ── 关卡生成 ───────────────────────────────────────── */

/**
 * 在网格上摆一块矩形礁石。
 * @param {Uint8Array} obstacles
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 */
function carveObstacle(obstacles, x, y, w, h) {
  for (let r = y; r < y + h; r += 1) {
    for (let c = x; c < x + w; c += 1) {
      if (r < 1 || c < 1 || r >= GRID_H - 1 || c >= GRID_W - 1) continue;
      obstacles[r * GRID_W + c] = 1;
    }
  }
}

/**
 * 找一个不在礁石上的空地。
 * @param {Uint8Array} obstacles
 * @param {number} seed
 * @param {number} attempt
 * @returns {{x: number, y: number}}
 */
function findOpenSpot(obstacles, seed, attempt) {
  for (let k = 0; k < 200; k += 1) {
    const h = hash2(attempt, k, seed);
    const x = 6 + (h % (GRID_W - 12));
    const y = 6 + ((h >>> 12) % (GRID_H - 12));
    const i = y * GRID_W + x;
    if (!obstacles[i]) return { x, y };
  }
  return { x: GRID_W >> 1, y: GRID_H >> 1 };
}

/**
 * 收集包络的局部极大值。
 * @param {Float32Array} env
 * @returns {{x: number, y: number, value: number}[]}
 */
function findPeaks(env) {
  const peaks = [];
  for (let r = 2; r < GRID_H - 2; r += 1) {
    for (let c = 2; c < GRID_W - 2; c += 1) {
      const i = r * GRID_W + c;
      const v = env[i];
      if (v <= 0) continue;
      if (
        v >= env[i - 1] && v >= env[i + 1] &&
        v >= env[i - GRID_W] && v >= env[i + GRID_W] &&
        v > env[i - GRID_W - 1] && v > env[i - GRID_W + 1] &&
        v > env[i + GRID_W - 1] && v > env[i + GRID_W + 1]
      ) {
        peaks.push({ x: c, y: r, value: v });
      }
    }
  }
  peaks.sort((a, b) => b.value - a.value);
  return peaks;
}

/**
 * 生成一关。
 *
 * 关键：**共鸣点不是手摆的**，而是用「标准解」源位置模拟一次波场，
 * 从振幅包络的局部极大值里挑出来 —— 于是每一关都保证存在解。
 *
 * @param {number} seed 随机种子
 * @param {number} index 关卡序号（0 起）
 * @returns {object} 关卡描述
 */
/** @feature F-007 关卡生成：共鸣点由标准解模拟产出，保证有解 */
/**
 * 用给定的波源位置模拟一次，返回振幅包络。
 * @param {Uint8Array} obstacles
 * @param {{x: number, y: number}} source
 * @returns {Float32Array}
 */
function simulateEnvelope(obstacles, source) {
  const field = createField();
  field.obstacles.set(obstacles);
  const sources = [{ x: source.x, y: source.y }];
  for (let t = 0; t < 420; t += 1) {
    stepWave(field, sources, t);
    updateEnvelope(field);
  }
  return field.env;
}

export function createLevel(seed, index) {
  const rng = mulberry32(hashString(`ripple-song:${seed}:${index}`));
  const obstacles = new Uint8Array(CELL_COUNT);

  // 礁石：1~3 块矩形墙
  const wallCount = 1 + Math.min(2, Math.floor(index / 2));
  const walls = [];
  for (let k = 0; k < wallCount; k += 1) {
    const w = 6 + Math.floor(rng() * 10);
    const h = 3 + Math.floor(rng() * 3);
    const x = 8 + Math.floor(rng() * (GRID_W - w - 16));
    const y = 8 + Math.floor(rng() * (GRID_H - h - 16));
    carveObstacle(obstacles, x, y, w, h);
    walls.push({ x, y, w, h });
  }

  // 标准解：源放在开阔地
  const solution = findOpenSpot(obstacles, hashString(`sol:${seed}:${index}`), index);

  // 用标准解模拟一次，取包络的局部极大值当共鸣点
  const solutionEnv = simulateEnvelope(obstacles, solution);

  const peaks = findPeaks(solutionEnv);
  const globalMax = peaks.length ? peaks[0].value : 1;
  const want = Math.min(4, 1 + Math.floor(index / 2));   // 目标数随关卡增长
  const chosen = [];
  for (const p of peaks) {
    if (chosen.length >= want) break;
    if (p.value < globalMax * 0.3) continue;
    const dist = Math.hypot(p.x - solution.x, p.y - solution.y);
    if (dist > MAX_TARGET_RANGE) continue;
    const tooClose = chosen.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < MIN_TARGET_GAP);
    if (tooClose) continue;
    chosen.push(p);
  }

  const targets = chosen.map((p, i) => ({
    id: `${index}-${i}`,
    x: p.x,
    y: p.y,
    peak: p.value,
    threshold: p.value * LIT_RATIO,
  }));

  // 起点：必须与解足够远，且站在起点时不能已经全亮 ——
  // 否则玩家什么都不做就能通关，「只能移动波」这条规则也就形同虚设。
  let start = { x: 0, y: 0 };
  let startOk = false;
  for (let attempt = 0; attempt < 24 && !startOk; attempt += 1) {
    const cand = findOpenSpot(obstacles, hashString(`start:${seed}:${index}:${attempt}`), index + 977);
    if (Math.hypot(cand.x - solution.x, cand.y - solution.y) < 26) continue;
    const startEnv = simulateEnvelope(obstacles, cand);
    const allLit = targets.length > 0
      && targets.every((t) => startEnv[t.y * GRID_W + t.x] >= t.threshold);
    if (!allLit) {
      start = cand;
      startOk = true;
    }
  }
  if (!startOk) {
    // 兜底：把起点挪到网格角落（离解最远的方向），那里几乎不可能全亮
    start = {
      x: solution.x < GRID_W / 2 ? GRID_W - 8 : 8,
      y: solution.y < GRID_H / 2 ? GRID_H - 8 : 8,
    };
  }

  return {
    index,
    seed,
    obstacles,
    walls,
    start,
    solution,
    targets,
    timeLimit: 45 + index * 10,
  };
}

/* ── 对局 ───────────────────────────────────────────── */

/**
 * 开一局。
 * @param {object} level 关卡
 * @returns {object} 游戏状态
 */
export function createGame(level) {
  const field = createField();
  field.obstacles.set(level.obstacles);
  return {
    level,
    field,
    sources: [{ x: level.start.x, y: level.start.y }],
    targets: level.targets.map((t) => ({ ...t })),
    lit: level.targets.map(() => false),
    timeLeft: level.timeLimit,
    elapsed: 0,
    resonance: 0,
    score: 0,
    levelFactor: 1 + level.index * 0.2,
    step: 0,
    acc: 0,
    state: 'playing',
  };
}

/**
 * 移动波源 —— 玩家唯一的操作。
 *
 * 重要：**移动只改变波场，不直接改任何共鸣点状态**（F-009）。
 * 目标点亮不亮完全由波场算出来。
 *
 * @param {object} game
 * @param {number} dx
 * @param {number} dy
 * @returns {boolean} 是否移动成功
 */
/** @feature F-008 波源移动：玩家唯一的操作，越界被拒 */
export function moveSource(game, dx, dy) {
  /** @feature F-009 移动不直接改判定：只改源坐标，不动 lit */
  if (!game || game.state !== 'playing') return false;
  const src = game.sources[0];
  const nx = src.x + dx;
  const ny = src.y + dy;
  if (nx < 1 || ny < 1 || nx >= game.field.w - 1 || ny >= game.field.h - 1) return false;
  src.x = nx;
  src.y = ny;
  return true;
}

/**
 * 把波源放到指定位置（沙盒模式 / 测试用）。
 * @param {object} game
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function placeSource(game, x, y) {
  if (!game || game.state !== 'playing') return false;
  if (x < 1 || y < 1 || x >= game.field.w - 1 || y >= game.field.h - 1) return false;
  game.sources[0].x = x;
  game.sources[0].y = y;
  return true;
}

/**
 * 判定各共鸣点是否点亮。
 *
 * 每个共鸣点带自己的阈值（标准解峰值的 LIT_RATIO 倍），
 * 振幅包络越过阈值即亮。
 *
 * @param {object} game
 * @returns {boolean} 是否全部点亮
 */
/** @feature F-006 共鸣点判定：包络越过各自阈值即点亮 */
export function evaluateTargets(game) {
  const { field, targets } = game;
  let all = true;
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    const idx = t.y * field.w + t.x;
    const lit = field.env[idx] >= t.threshold;
    game.lit[i] = lit;
    if (!lit) all = false;
  }
  return all;
}

/**
 * 共鸣值：各共鸣点「离阈值还有多远」的平均值，0–1。
 * @param {object} game
 * @returns {number}
 */
/** @feature F-011 共鸣值与反馈量 */
export function resonanceScore(game) {
  const { field, targets } = game;
  if (!targets.length) return 0;
  let sum = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    const idx = t.y * field.w + t.x;
    const ratio = t.threshold > 0 ? field.env[idx] / t.threshold : 0;
    sum += Math.max(0, Math.min(1, ratio));
  }
  return sum / targets.length;
}

/**
 * 是否过关：所有共鸣点同时点亮。
 * @param {object} game
 * @returns {boolean}
 */
/** @feature F-010 胜负判定 */
export function checkWin(game) {
  if (!game.targets.length) return false;
  for (let i = 0; i < game.lit.length; i += 1) {
    if (!game.lit[i]) return false;
  }
  return true;
}

/**
 * 是否失败：倒计时归零且仍有未点亮目标。
 * @param {object} game
 * @returns {boolean}
 */
export function checkLose(game) {
  return game.timeLeft <= 0 && !checkWin(game);
}

/**
 * 推进一帧：定步长累加器 + 积分 + 判定。
 *
 * @param {object} game
 * @param {number} dtMs 经过的毫秒
 * @returns {null|'won'|'lost'}
 */
/** @feature F-012 帧推进与计时 */
export function tick(game, dtMs) {
  if (!game || game.state !== 'playing') return null;
  game.acc += dtMs;
  let steps = 0;
  while (game.acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
    game.acc -= STEP_MS;
    steps += 1;
    game.step += 1;
    stepWave(game.field, game.sources, game.step);
    updateEnvelope(game.field);
    game.elapsed += STEP_MS / 1000;
    game.timeLeft = Math.max(0, game.timeLeft - STEP_MS / 1000);
  }
  // 积压过多（标签页切回来）就丢弃，绝不一次性补几千步
  if (game.acc > STEP_MS * MAX_STEPS_PER_FRAME) game.acc = 0;

  const allLit = evaluateTargets(game);
  game.resonance = resonanceScore(game);

  if (allLit) {
    game.state = 'won';
    // 分数只在过关时结算：过程中显示的是「共鸣值」，不是已到手的分。
    // 这样「什么都不做」就一定拿不到分 —— 挂机不能无限得分。
    game.score = Math.round(game.resonance * 1000 * game.levelFactor);
    return 'won';
  }
  if (checkLose(game)) {
    game.state = 'lost';
    return 'lost';
  }
  return null;
}

/* ── 档案 ───────────────────────────────────────────── */

/**
 * @typedef {Object} Profile
 * @property {number} version
 * @property {Record<string, {level: number, bestTime: number, bestResonance: number}>} progress 每关最好成绩
 * @property {number} unlocked 已解锁关卡数
 * @property {string} lang 语言
 */

/**
 * 新建初始档案。
 * @returns {Profile}
 */
export function createProfile() {
  return {
    version: 1,
    progress: {},
    unlocked: 1,
    lang: 'zh',
  };
}

/**
 * 记录一次通关成绩。
 * @param {Profile} profile
 * @param {number} levelIndex
 * @param {number} timeUsed
 * @param {number} resonance
 * @returns {Profile}
 */
/** @feature F-020 存档与关卡进度 */
export function recordClear(profile, levelIndex, timeUsed, resonance) {
  const key = String(levelIndex);
  const prev = profile.progress[key];
  const next = {
    level: levelIndex,
    bestTime: prev ? Math.min(prev.bestTime, timeUsed) : timeUsed,
    bestResonance: prev ? Math.max(prev.bestResonance, resonance) : resonance,
  };
  return {
    ...profile,
    progress: { ...profile.progress, [key]: next },
    unlocked: Math.max(profile.unlocked, levelIndex + 2),
  };
}

/**
 * 序列化档案。
 * @param {Profile} profile
 * @returns {string}
 */
export function serializeProfile(profile) {
  return JSON.stringify(profile);
}

/**
 * 从存档恢复档案，异常一律回退为初始档案。
 * @param {string|null} raw
 * @returns {Profile}
 */
export function deserializeProfile(raw) {
  const base = createProfile();
  if (!raw) return base;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;

  const progress = {};
  if (parsed.progress && typeof parsed.progress === 'object' && !Array.isArray(parsed.progress)) {
    for (const [key, rec] of Object.entries(parsed.progress)) {
      if (!rec || typeof rec !== 'object') continue;
      const level = Number(rec.level);
      if (!Number.isFinite(level)) continue;
      const bestTime = Number(rec.bestTime);
      const bestResonance = Number(rec.bestResonance);
      progress[key] = {
        level,
        bestTime: Number.isFinite(bestTime) ? bestTime : 0,
        bestResonance: Number.isFinite(bestResonance) ? bestResonance : 0,
      };
    }
  }
  const unlocked = Number(parsed.unlocked);
  const lang = typeof parsed.lang === 'string' ? parsed.lang : 'zh';
  return {
    version: 1,
    progress,
    unlocked: Number.isFinite(unlocked) && unlocked >= 1 ? Math.floor(unlocked) : 1,
    lang,
  };
}
