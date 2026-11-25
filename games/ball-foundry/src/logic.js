/**
 * 落球坊 Ball Foundry — 核心逻辑层（无 DOM 依赖，可完整单测）
 *
 * 玩法内核：
 *   1. 点击容器投放球体，球体在**确定性物理**下落 / 弹跳 / 堆叠（定步长 + 冲量解算）
 *   2. 7 种材质各有不同的弹性 / 摩擦 / 质量 / 特殊行为，堆叠起来手感完全不同
 *   3. 球静止即「落定」，结算铜钱；铜钱升级容器、投放器与材质解锁
 *   4. 保底：连续 N 颗没抽到当前能抽到的最好材质，下一颗必出那一档
 *   5. 材质图鉴：每种材质 3 条里程碑；容器堆满即本局结束
 *
 * 物理为什么是确定性的：
 *   固定步长 dt = 1/120，每帧固定步数，不依赖真实时间；同一初始状态 + 同一操作序列
 *   → 同一结果。所以物理可以逐帧单测（球该停在哪、该弹多高、该不该爆）。
 */

import {
  AUTO_DROP_INTERVAL,
  FEEL,
  MAX_STEPS_PER_FRAME,
  MATERIALS,
  MATERIAL_IDS,
  MATERIAL_WEIGHTS,
  MILESTONES,
  PHYSICS,
  PITY_LIMIT,
  UPGRADES,
  UPGRADE_IDS,
  WORLD,
} from '../assets/data.js';

export {
  AUTO_DROP_INTERVAL,
  FEEL,
  MAX_STEPS_PER_FRAME,
  MATERIALS,
  MATERIAL_IDS,
  MATERIAL_WEIGHTS,
  MILESTONES,
  PHYSICS,
  PITY_LIMIT,
  UPGRADES,
  UPGRADE_IDS,
  WORLD,
};

/** 各解锁等级对应的材质池（最后一档解锁磁球与金球）。 */
const UNLOCK_STEPS = [
  ['rubber'],
  ['rubber', 'iron'],
  ['rubber', 'iron', 'sticky'],
  ['rubber', 'iron', 'sticky', 'glass'],
  ['rubber', 'iron', 'sticky', 'glass', 'flame'],
  ['rubber', 'iron', 'sticky', 'glass', 'flame', 'magnet', 'gold'],
];

/* ── 确定性随机 ───────────────────────────────────── */

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
 * FNV-1a 字符串散列。
 * @param {string} str
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* ── 容器 ─────────────────────────────────────────── */

/**
 * 依据升级等级算出容器边界（世界单位，y 向下为正）。
 * @param {Record<string, number>} upgrades
 */
export function containerBounds(upgrades) {
  const width = WORLD.baseWidth + WORLD.widthPerLevel * (upgrades.width || 0);
  const height = WORLD.baseHeight + WORLD.heightPerLevel * (upgrades.height || 0);
  return {
    left: 0,
    right: width,
    top: 0,
    floor: height,
    width,
    height,
  };
}

/** 某个解锁等级下可抽到的材质。 */
export function unlockedMaterials(level) {
  const index = Math.min(Math.max(Math.floor(level || 0), 0), UNLOCK_STEPS.length - 1);
  return UNLOCK_STEPS[index].slice();
}

/** 自动投放间隔（毫秒）。 */
export function autoDropInterval(upgrades) {
  const level = upgrades.dropper || 0;
  return Math.max(AUTO_DROP_INTERVAL.min, AUTO_DROP_INTERVAL.base - AUTO_DROP_INTERVAL.perLevel * level);
}

/* ── 物理 ─────────────────────────────────────────── */

/**
 * @typedef {Object} Ball
 * @property {number} id
 * @property {string} mat 材质 id
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} r 半径
 * @property {number} mass
 * @property {boolean} asleep 是否已静止
 * @property {number} restFrames 连续低速的帧数
 * @property {boolean} paid 是否已经结算过
 */

/**
 * 新建一个物理场景。
 * @returns {{balls: Ball[], nextId: number}}
 */
export function createSim() {
  return { balls: [], nextId: 1, accumulator: 0 };
}

/**
 * 按真实帧时长推进物理：内部换算成固定步长，单帧最多 maxSteps 步。
 *
 * 为什么要有步数上限：页面卡顿后 dt 会变得很大，一次性补几十步会把球「甩飞」，
 * 宁可让画面慢放，也不能让物理失真。丢掉的余量直接清零，避免螺旋式追赶。
 *
 * @param {ReturnType<createSim>} sim
 * @param {object} bounds
 * @param {number} frameDt 真实帧时长（秒）
 * @param {number} maxSteps 单帧最多推进几步
 * @returns {{steps: number, events: object[], alpha: number}} alpha 是渲染插值比例 0–1
 */
export function advance(sim, bounds, frameDt, maxSteps = MAX_STEPS_PER_FRAME) {
  sim.accumulator += Math.min(frameDt, 0.25);
  let steps = 0;
  const events = [];
  while (sim.accumulator >= PHYSICS.dt && steps < maxSteps) {
    sim.accumulator -= PHYSICS.dt;
    steps += 1;
    for (const event of stepPhysics(sim, bounds, PHYSICS.dt)) events.push(event);
  }
  if (steps >= maxSteps) sim.accumulator = 0;
  return { steps, events, alpha: Math.min(1, Math.max(0, sim.accumulator / PHYSICS.dt)) };
}

/**
 * 投放一颗球。
 * @param {ReturnType<createSim>} sim
 * @param {string} matId
 * @param {number} x 投放位置（世界坐标）
 * @param {object} bounds
 * @returns {{ok: boolean, ball: Ball|null}} ok=false 表示投放点被占
 */
export function dropBall(sim, matId, x, bounds) {
  const mat = MATERIALS[matId];
  if (!mat) return { ok: false, ball: null };
  if (sim.balls.length >= PHYSICS.maxBalls) return { ok: false, ball: null };

  const clamped = Math.min(Math.max(x, bounds.left + mat.r), bounds.right - mat.r);
  const y = bounds.top + mat.r;

  // 投放点被「已经定住」的球占住 → 放不下。
  // 正在下落的球不算：它一会儿就走了，挡住下一颗会让手感莫名其妙地卡住。
  for (const other of sim.balls) {
    if (!other.asleep) continue;
    const dx = other.x - clamped;
    const dy = other.y - y;
    if (dx * dx + dy * dy < (other.r + mat.r) * (other.r + mat.r) * 0.72) {
      return { ok: false, ball: null };
    }
  }

  const ball = {
    id: sim.nextId,
    mat: matId,
    x: clamped,
    y,
    vx: 0,
    vy: 0,
    r: mat.r,
    mass: mat.mass,
    asleep: false,
    restFrames: 0,
    paid: false,
  };
  sim.nextId += 1;
  sim.balls.push(ball);
  return { ok: true, ball };
}

/**
 * 推进一帧物理。定步长调用，同一初始状态必然得到同一结果。
 *
 * @param {ReturnType<createSim>} sim
 * @param {object} bounds
 * @param {number} dt 秒
 * @returns {object[]} 事件列表：{ type: 'settle' | 'burst', ball }
 */
export function stepPhysics(sim, bounds, dt) {
  const events = [];
  const balls = sim.balls;

  /* 1. 磁力 */
  for (const a of balls) {
    if (a.asleep || MATERIALS[a.mat].special !== 'magnet') continue;
    for (const b of balls) {
      if (b === a || b.asleep) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > PHYSICS.magnetRange * PHYSICS.magnetRange || d2 < 0.04) continue;
      const d = Math.sqrt(d2);
      // 已经贴上了就不再吸，否则 1/d² 会把球直接吸穿过去
      if (d < a.r + b.r) continue;
      const f = Math.min(PHYSICS.magnetForce * b.mass / d2, PHYSICS.magnetMaxForce);
      b.vx -= (dx / d) * f * dt;
      b.vy -= (dy / d) * f * dt;
    }
  }

  /* 2. 重力、阻尼、速度上限与积分 */
  for (const b of balls) {
    if (b.asleep) continue;
    b.vy += PHYSICS.gravity * dt;
    const damp = 1 - PHYSICS.drag * dt;
    b.vx *= damp;
    b.vy *= damp;
    // 速度上限：单步位移必须小于最小半径，否则高速球会直接穿过别人
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > PHYSICS.maxSpeed) {
      const scale = PHYSICS.maxSpeed / speed;
      b.vx *= scale;
      b.vy *= scale;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  /* 3. 边界 */
  const bursting = [];
  for (const b of balls) {
    if (b.asleep) continue;
    const mat = MATERIALS[b.mat];

    if (b.x - b.r < bounds.left) {
      b.x = bounds.left + b.r;
      if (b.vx < 0) b.vx = -b.vx * mat.rest;
    }
    if (b.x + b.r > bounds.right) {
      b.x = bounds.right - b.r;
      if (b.vx > 0) b.vx = -b.vx * mat.rest;
    }
    if (b.y - b.r < bounds.top) {
      b.y = bounds.top + b.r;
      if (b.vy < 0) b.vy = -b.vy * mat.rest;
    }
    if (b.y + b.r > bounds.floor) {
      b.y = bounds.floor - b.r;
      if (b.vy > 0) {
        if (mat.special === 'burst' && b.vy > PHYSICS.burstSpeed) {
          bursting.push(b);
          continue;
        }
        b.vy = -b.vy * mat.rest * PHYSICS.bounceDamp;
      }
      b.vx *= 1 - mat.fric * 0.6;
    }
  }

  /* 4. 球球碰撞：先跑 N 趟位置修正（堆叠稳定性），再统一做速度解算 */
  const pairs = [];
  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i];
      const b = balls[j];
      if (a.asleep && b.asleep) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minDist * minDist || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      pairs.push({ a, b, nx: dx / d, ny: dy / d, overlap: minDist - d });
    }
  }

  for (let iter = 0; iter < PHYSICS.solverIterations; iter += 1) {
    for (const pair of pairs) {
      const { a, b, nx, ny } = pair;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minDist * minDist || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const overlap = minDist - d;

      if (a.asleep) {
        b.x += (dx / d) * overlap;
        b.y += (dy / d) * overlap;
      } else if (b.asleep) {
        a.x -= (dx / d) * overlap;
        a.y -= (dy / d) * overlap;
      } else {
        const invA = 1 / a.mass;
        const invB = 1 / b.mass;
        const corr = (overlap - PHYSICS.slop) / (invA + invB);
        a.x -= (dx / d) * corr * invA;
        a.y -= (dy / d) * corr * invA;
        b.x += (dx / d) * corr * invB;
        b.y += (dy / d) * corr * invB;
      }
    }
  }

  for (const pair of pairs) {
    const { a, b } = pair;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= (a.r + b.r) * (a.r + b.r) || d2 < 1e-9) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const e = Math.min(MATERIALS[a.mat].rest, MATERIALS[b.mat].rest);
    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) continue;

    if (a.asleep) {
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
      wakeIfHit(a, b, -vn); // 唤醒的是沉睡的那个
    } else if (b.asleep) {
      a.vx += (1 + e) * vn * nx;
      a.vy += (1 + e) * vn * ny;
      wakeIfHit(b, a, -vn);
    } else {
      const invA = 1 / a.mass;
      const invB = 1 / b.mass;
      const impulse = (-(1 + e) * vn) / (invA + invB);
      a.vx -= impulse * nx * invA;
      a.vy -= impulse * ny * invA;
      b.vx += impulse * nx * invB;
      b.vy += impulse * ny * invB;
      wakeIfHit(a, b, -vn);
      wakeIfHit(b, a, -vn);
    }
  }

  /* 5. 爆炸 */
  if (bursting.length > 0) {
    for (const ball of bursting) {
      const index = balls.indexOf(ball);
      if (index < 0) continue;
      balls.splice(index, 1);
      for (const other of balls) {
        const dx = other.x - ball.x;
        const dy = other.y - ball.y;
        const d = Math.hypot(dx, dy);
        if (d > PHYSICS.burstRadius || d < 1e-6) continue;
        const push = (PHYSICS.burstImpulse * (1 - d / PHYSICS.burstRadius)) / other.mass;
        other.vx += (dx / d) * push;
        other.vy += (dy / d) * push;
        wakeIfHit(other, ball, Math.abs(push));
      }
      events.push({ type: 'burst', ball });
    }
  }

  /* 6. 静止判定 */
  for (const b of balls) {
    if (b.asleep) continue;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed < PHYSICS.sleepSpeed) {
      b.restFrames += 1;
      if (b.restFrames >= PHYSICS.sleepFrames) {
        b.asleep = true;
        b.vx = 0;
        b.vy = 0;
        events.push({ type: 'settle', ball: b });
      }
    } else {
      b.restFrames = 0;
    }
  }

  return events;
}

/**
 * 撞击速度足够时把睡着的球唤醒。
 * 用**相对法向速度**判定而不是冲量：冲量会随质量放大，轻球砸下来也会把整堆叫醒。
 * @param {Ball} sleeper
 * @param {Ball} other
 * @param {number} speed 相对撞击速度
 */
function wakeIfHit(sleeper, other, speed) {
  if (!sleeper.asleep) return;
  if (other.asleep) return;
  if (speed < PHYSICS.wakeSpeed) return;
  sleeper.asleep = false;
  sleeper.restFrames = 0;
}

/**
 * 堆叠最高点（离容器底部的距离）。
 * @param {ReturnType<createSim>} sim
 */
export function stackHeight(sim) {
  let top = Infinity;
  for (const b of sim.balls) {
    if (!b.asleep) continue; // 只统计已经定住的球
    const y = b.y - b.r;
    if (y < top) top = y;
  }
  return top === Infinity ? 0 : top;
}

/**
 * 容器是否已经堆满（球顶越过投放线）。
 * @param {ReturnType<createSim>} sim
 * @param {object} bounds
 */
export function isOverflowing(sim, bounds) {
  for (const b of sim.balls) {
    if (!b.asleep) continue;
    if (b.y - b.r < bounds.top + WORLD.spawnMargin) return true;
  }
  return false;
}

/* ── 手感层（抖动 / 打击停顿） ─────────────────────── */

/**
 * @typedef {Object} Feel
 * @property {number} trauma  创伤值 0–1，抖动强度按它的平方算
 * @property {number} hitStop 剩余的打击停顿时长（秒）
 * @property {number} shakeStrength 抖动强度开关 0–1
 * @property {boolean} reduceMotion 是否关闭抖动与闪白
 * @property {number} phase 抖动相位累加器
 */

/** 创建手感状态。 */
export function createFeel() {
  return { trauma: 0, hitStop: 0, shakeStrength: 1, reduceMotion: false, phase: 0 };
}

/**
 * 累积创伤（撞击只会叠加，不会重置）。
 * @param {Feel} feel
 * @param {number} amount
 */
export function addTrauma(feel, amount) {
  feel.trauma = Math.min(1, feel.trauma + amount);
}

/**
 * 触发打击停顿。
 * @param {Feel} feel
 * @param {number} seconds
 */
export function addHitStop(feel, seconds) {
  feel.hitStop = Math.min(FEEL.hitStopMax, Math.max(feel.hitStop, seconds));
}

/**
 * 用**真实时间**推进手感状态，返回本次应使用的时间倍率。
 * 抖动衰减不能被打击停顿冻住，否则画面会卡在偏移状态。
 *
 * @param {Feel} feel
 * @param {number} realDt 真实经过的秒数
 * @returns {number} 时间倍率（1 = 正常，<1 = 停顿）
 */
export function updateFeel(feel, realDt) {
  feel.phase += realDt * 30;
  feel.trauma = Math.max(0, feel.trauma - FEEL.traumaDecay * realDt);
  if (feel.hitStop > 0) {
    feel.hitStop = Math.max(0, feel.hitStop - realDt);
    return FEEL.hitStopScale;
  }
  return 1;
}

/**
 * 抖动偏移：用不同频率的正弦叠加，而不是每帧随机（后者会像噪音）。
 * @param {Feel} feel
 * @returns {{x: number, y: number}}
 */
export function shakeOffset(feel) {
  if (feel.reduceMotion || feel.trauma <= 0) return { x: 0, y: 0 };
  const shake = feel.trauma * feel.trauma * feel.shakeStrength;
  return {
    x: FEEL.maxShake * shake * Math.sin(feel.phase * 1.7),
    y: FEEL.maxShake * shake * Math.sin(feel.phase * 2.3),
  };
}

/**
 * 事件分级：把游戏事件映射到手感强度。
 * @param {string} type 事件类型
 */
export function feelTier(type) {
  if (type === 'burst') return { trauma: 0.75, hitStop: 0.1, shake: 1 };
  if (type === 'settle') return { trauma: 0.12, hitStop: 0, shake: 0.4 };
  if (type === 'drop') return { trauma: 0.08, hitStop: 0, shake: 0.3 };
  if (type === 'over') return { trauma: 1, hitStop: 0.12, shake: 1 };
  return { trauma: 0, hitStop: 0, shake: 0 };
}

/* ── 掉落与保底 ───────────────────────────────────── */

/**
 * 当前保底指向的材质（可抽到的最好一档）。只有一种材质时保底休眠。
 * @param {Profile} profile
 */
export function pityTarget(profile) {
  const pool = unlockedMaterials(profile.upgrades.unlock);
  if (pool.length <= 1) return null;
  return pool[pool.length - 1];
}

/**
 * 摇一颗要投出的球。
 * @param {Profile} profile
 * @param {() => number} rng
 * @returns {{id: string, pity: boolean}}
 */
export function rollMaterial(profile, rng) {
  const pool = unlockedMaterials(profile.upgrades.unlock);
  const target = pityTarget(profile);

  if (target && profile.pity >= PITY_LIMIT) {
    return { id: target, pity: true };
  }

  let total = 0;
  for (const id of pool) total += MATERIAL_WEIGHTS[id] || 0;
  let roll = rng() * total;
  for (const id of pool) {
    roll -= MATERIAL_WEIGHTS[id] || 0;
    if (roll < 0) return { id, pity: false };
  }
  return { id: pool[0], pity: false };
}

/* ── 档案 ─────────────────────────────────────────── */

/**
 * @typedef {Object} Profile
 * @property {number} coins
 * @property {number} totalEarned
 * @property {Record<string, number>} upgrades
 * @property {Record<string, {dropped: number, settled: number, value: number}>} codex 材质图鉴
 * @property {Record<string, boolean>} achievements
 * @property {object} stats
 */

/** 创建初始档案。 */
export function createProfile() {
  const codex = {};
  for (const id of MATERIAL_IDS) codex[id] = { dropped: 0, settled: 0, value: 0 };
  return {
    version: 1,
    coins: 0,
    totalEarned: 0,
    upgrades: { width: 0, height: 0, dropper: 0, unlock: 0 },
    codex,
    achievements: Object.create(null),
    stats: { runs: 0, balls: 0, settled: 0, bursts: 0, bestCoins: 0, bestStack: 0 },
    pity: 0,
  };
}

/** 全局成就定义。 */
export const ACHIEVEMENTS = [
  { id: 'first_ball', icon: '⚪', en: 'First Ball', zh: '初次投球', ja: '初投球', test: (p) => p.stats.balls >= 1 },
  { id: 'settle_10', icon: '🪨', en: 'Ten Settled', zh: '十球落定', ja: '10個定着', test: (p) => p.stats.settled >= 10 },
  { id: 'first_gold', icon: '🪙', en: 'First Gold', zh: '首枚金球', ja: '初の金玉', test: (p) => (p.codex.gold?.dropped || 0) >= 1 },
  { id: 'burst_3', icon: '💥', en: 'Triple Burst', zh: '三次爆破', ja: '3回爆発', test: (p) => p.stats.bursts >= 3 },
  { id: 'coins_1000', icon: '💰', en: 'Thousand Coins', zh: '千钱在手', ja: '千銭', test: (p) => p.totalEarned >= 1000 },
  { id: 'stack_40', icon: '🗻', en: 'Tall Stack', zh: '堆叠四十', ja: '40個堆積', test: (p) => p.stats.bestStack >= 40 },
  { id: 'codex_all', icon: '🏆', en: 'Full Codex', zh: '全材质收藏', ja: '全材質制覇', test: (p) => MATERIAL_IDS.every((id) => (p.codex[id]?.dropped || 0) >= 12) },
  { id: 'rich', icon: '🏅', en: 'Rich Haul', zh: '一桶金山', ja: '金山', test: (p) => p.totalEarned >= 10000 },
];

/**
 * 某个材质的里程碑达成情况。
 * @param {Profile} profile
 * @param {string} matId
 */
export function milestoneState(profile, matId) {
  const record = profile.codex[matId] || { dropped: 0, settled: 0, value: 0 };
  const out = {};
  for (const m of MILESTONES) out[m.id] = record.dropped >= m.dropped;
  return out;
}

/** 图鉴完成度。 */
export function dexProgress(profile) {
  let done = 0;
  for (const id of MATERIAL_IDS) {
    const state = milestoneState(profile, id);
    for (const m of MILESTONES) {
      if (state[m.id]) done += 1;
    }
  }
  return { done, total: MATERIAL_IDS.length * MILESTONES.length };
}

/**
 * 处理一次事件并更新档案（不可变：返回新档案）。
 * @param {Profile} profile
 * @param {object} event { type: 'drop' | 'settle' | 'burst', mat, value }
 * @returns {{profile: Profile, unlocked: object[], milestones: object[]}}
 */
export function applyEvent(profile, event) {
  const codex = {};
  for (const id of MATERIAL_IDS) {
    const prev = profile.codex[id] || { dropped: 0, settled: 0, value: 0 };
    codex[id] = { ...prev };
  }

  const next = {
    version: 1,
    coins: profile.coins,
    totalEarned: profile.totalEarned,
    upgrades: { ...profile.upgrades },
    codex,
    achievements: Object.assign(Object.create(null), profile.achievements),
    stats: { ...profile.stats },
    pity: profile.pity,
  };

  if (event.type === 'drop' && codex[event.mat]) {
    codex[event.mat].dropped += 1;
    next.stats.balls += 1;
    const target = pityTarget(next);
    if (target && event.mat === target) next.pity = 0;
    else next.pity += 1;
  } else if (event.type === 'settle' && codex[event.mat]) {
    codex[event.mat].settled += 1;
    codex[event.mat].value += event.value || 0;
    next.coins += event.value || 0;
    next.totalEarned += event.value || 0;
    next.stats.settled += 1;
  } else if (event.type === 'burst') {
    next.stats.bursts += 1;
  }

  const milestones = [];
  for (const id of MATERIAL_IDS) {
    const now = milestoneState(next, id);
    const before = milestoneState(profile, id);
    for (const m of MILESTONES) {
      const key = `${id}:${m.id}`;
      if (now[m.id] && !before[m.id]) {
        next.achievements[key] = true;
        milestones.push({ key, matId: id, milestone: m });
      }
    }
  }

  const unlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (next.achievements[ach.id]) continue;
    if (ach.test(next)) {
      next.achievements[ach.id] = true;
      unlocked.push(ach);
    }
  }

  return { profile: next, unlocked, milestones };
}

/**
 * 记录一局结束。
 * @param {Profile} profile
 * @param {number} stack 本局最高堆叠数
 */
export function finishRun(profile, stack) {
  const next = {
    ...profile,
    upgrades: { ...profile.upgrades },
    codex: { ...profile.codex },
    achievements: Object.assign(Object.create(null), profile.achievements),
    stats: { ...profile.stats },
  };
  next.stats.runs += 1;
  next.stats.bestCoins = Math.max(next.stats.bestCoins, profile.coins);
  next.stats.bestStack = Math.max(next.stats.bestStack, stack);
  return next;
}

/* ── 装备 ─────────────────────────────────────────── */

/**
 * 某项装备升到下一级的价格。
 * @param {string} kind
 * @param {number} level
 */
export function upgradeCost(kind, level) {
  const def = UPGRADES[kind];
  if (!def) return Infinity;
  return Math.round(def.base * Math.pow(def.growth, level));
}

/**
 * 升级一件装备。铜钱不足或已满级时返回 null。
 * @param {Profile} profile
 * @param {string} kind
 * @returns {{profile: Profile, result: object}|null}
 */
export function applyUpgrade(profile, kind) {
  const def = UPGRADES[kind];
  if (!def) return null;
  const level = profile.upgrades[kind] || 0;
  if (level >= def.max) return null;
  const cost = upgradeCost(kind, level);
  if (profile.coins < cost) return null;

  const next = {
    ...profile,
    coins: profile.coins - cost,
    upgrades: { ...profile.upgrades, [kind]: level + 1 },
    codex: { ...profile.codex },
    achievements: Object.assign(Object.create(null), profile.achievements),
    stats: { ...profile.stats },
    pity: profile.pity,
  };
  const unlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (next.achievements[ach.id]) continue;
    if (ach.test(next)) {
      next.achievements[ach.id] = true;
      unlocked.push(ach);
    }
  }
  return { profile: next, result: { kind, level: level + 1, cost, unlocked } };
}

/* ── 存档 ─────────────────────────────────────────── */

/** 把档案安全地序列化。 */
export function serializeProfile(profile) {
  return JSON.stringify({
    version: profile.version,
    coins: profile.coins,
    totalEarned: profile.totalEarned,
    upgrades: profile.upgrades,
    codex: profile.codex,
    achievements: profile.achievements,
    stats: profile.stats,
    pity: profile.pity,
  });
}

/**
 * 从存档字符串恢复档案，任何字段异常都回退到安全默认值。
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

  const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const safeInt = (v) => Math.max(0, Math.floor(num(v)));

  const upgrades = { width: 0, height: 0, dropper: 0, unlock: 0 };
  if (parsed.upgrades && typeof parsed.upgrades === 'object' && !Array.isArray(parsed.upgrades)) {
    for (const id of UPGRADE_IDS) upgrades[id] = Math.min(UPGRADES[id].max, safeInt(parsed.upgrades[id]));
  }

  const codex = {};
  for (const id of MATERIAL_IDS) {
    const rec = parsed.codex && typeof parsed.codex === 'object' ? parsed.codex[id] : null;
    codex[id] = {
      dropped: rec && typeof rec === 'object' ? safeInt(rec.dropped) : 0,
      settled: rec && typeof rec === 'object' ? safeInt(rec.settled) : 0,
      value: rec && typeof rec === 'object' ? safeInt(rec.value) : 0,
    };
  }

  const achievements = Object.create(null);
  if (parsed.achievements && typeof parsed.achievements === 'object' && !Array.isArray(parsed.achievements)) {
    for (const ach of ACHIEVEMENTS) {
      if (parsed.achievements[ach.id] === true) achievements[ach.id] = true;
    }
    for (const id of MATERIAL_IDS) {
      for (const m of MILESTONES) {
        const key = `${id}:${m.id}`;
        if (parsed.achievements[key] === true) achievements[key] = true;
      }
    }
  }

  const stats = { runs: 0, balls: 0, settled: 0, bursts: 0, bestCoins: 0, bestStack: 0 };
  if (parsed.stats && typeof parsed.stats === 'object') {
    stats.runs = safeInt(parsed.stats.runs);
    stats.balls = safeInt(parsed.stats.balls);
    stats.settled = safeInt(parsed.stats.settled);
    stats.bursts = safeInt(parsed.stats.bursts);
    stats.bestCoins = safeInt(parsed.stats.bestCoins);
    stats.bestStack = safeInt(parsed.stats.bestStack);
  }

  return {
    version: 1,
    coins: safeInt(parsed.coins),
    totalEarned: safeInt(parsed.totalEarned),
    upgrades,
    codex,
    achievements,
    stats,
    pity: safeInt(parsed.pity),
  };
}
