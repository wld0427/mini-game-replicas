/**
 * Tetra Cascade 无尽方块 — 核心逻辑层（无 DOM 依赖，可完整单测）
 *
 * 玩法内核：
 *   1. 10×20 棋盘，7 种四格方块按 7-bag 抽取（每袋七种各一，杜绝长时间不来某块）
 *   2. 三段节奏：自由移动 / 旋转 → 落地锁定 → 消行结算，连消有连击加成
 *   3. 方块图鉴：每种方块累计「使用次数 / 消行数 / 最高连击」，配 3 条里程碑
 *   4. 今日挑战：同一天所有玩家拿到同一条方块序列（日期做种子），方便比较
 *
 * 分层说明：
 *   - 「对局」对象（棋盘 / 当前方块 / 队列）是**可变**的：它每帧都在变，复制整块棋盘
 *     反而是浪费。所有函数只读写传入的对局对象，不碰任何浏览器 API。
 *   - 「档案」对象（图鉴 / 记录 / 成就）是**不可变**的：每次结算返回一份新档案，
 *     便于单测比对与存档。
 */

import {
  BOARD_H,
  BOARD_W,
  COMBO_SCORE,
  HARD_DROP_SCORE,
  KICKS,
  LINES_PER_LEVEL,
  LINE_SCORES,
  LOCK_DELAY_MS,
  LOCK_RESETS_MAX,
  MILESTONES,
  PIECES,
  PIECE_IDS,
  SOFT_DROP_SCORE,
} from '../assets/data.js';

export {
  BOARD_H,
  BOARD_W,
  COMBO_SCORE,
  HARD_DROP_SCORE,
  KICKS,
  LINES_PER_LEVEL,
  LINE_SCORES,
  LOCK_DELAY_MS,
  LOCK_RESETS_MAX,
  MILESTONES,
  PIECES,
  PIECE_IDS,
  SOFT_DROP_SCORE,
};

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

/**
 * 用固定种子洗牌（不修改入参）。
 * @param {string[]} items
 * @param {() => number} rng
 */
export function shuffle(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * 今日挑战的种子：同一天所有玩家一致。
 * @param {string} dateKey YYYY-MM-DD
 */
export function dailySeed(dateKey) {
  return hashString(`tetra-cascade#${dateKey}`);
}

/* ── 棋盘 ───────────────────────────────────────────── */

/** 创建空棋盘。 */
export function createBoard() {
  const board = [];
  for (let r = 0; r < BOARD_H; r += 1) board.push(new Array(BOARD_W).fill(null));
  return board;
}

/**
 * 方块在棋盘上占据的格子。
 * @param {string} pieceId
 * @param {number} rot
 * @param {number} x 框原点的列
 * @param {number} y 框原点的行
 * @returns {Array<[number, number]>} [行, 列]
 */
export function pieceCells(pieceId, rot, x, y) {
  const piece = PIECES[pieceId];
  if (!piece) return [];
  const cells = piece.states[((rot % 4) + 4) % 4];
  return cells.map(([r, c]) => [y + r, x + c]);
}

/**
 * 判定位置是否越界或撞到已有方块（棋盘上方的格子算合法，允许方块从天而降）。
 * @param {Array<Array<string|null>>} board
 * @param {string} pieceId
 * @param {number} rot
 * @param {number} x
 * @param {number} y
 */
export function collides(board, pieceId, rot, x, y) {
  for (const [r, c] of pieceCells(pieceId, rot, x, y)) {
    if (c < 0 || c >= BOARD_W) return true;
    if (r >= BOARD_H) return true;
    if (r >= 0 && board[r][c] !== null) return true;
  }
  return false;
}

/** 找出所有已填满的行号。 */
export function findFullRows(board) {
  const rows = [];
  for (let r = 0; r < BOARD_H; r += 1) {
    let full = true;
    for (let c = 0; c < BOARD_W; c += 1) {
      if (board[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) rows.push(r);
  }
  return rows;
}

/**
 * 消行：移除指定行并在顶部补空行。
 * @param {Array<Array<string|null>>} board
 * @param {number[]} rows
 */
export function clearRows(board, rows) {
  const set = new Set(rows);
  const next = [];
  for (let r = BOARD_H - 1; r >= 0; r -= 1) {
    if (set.has(r)) continue;
    next.push(board[r].slice());
  }
  while (next.length < BOARD_H) next.push(new Array(BOARD_W).fill(null));
  return next;
}

/**
 * 某个等级下每下落一格需要的毫秒数（越高级越快，有下限）。
 * @param {number} level
 */
export function gravityInterval(level) {
  const l = Math.max(1, Math.floor(level));
  const seconds = Math.pow(0.8 - (l - 1) * 0.007, l - 1);
  return Math.max(60, Math.round(seconds * 1000));
}

/* ── 对局 ───────────────────────────────────────────── */

/**
 * @typedef {Object} Game
 * @property {Array<Array<string|null>>} board
 * @property {{id: string, rot: number, x: number, y: number}|null} active
 * @property {string[]} queue 预备队列
 * @property {string[]} bag   当前袋中剩余的方块
 * @property {string|null} hold
 * @property {boolean} holdUsed
 * @property {number} score
 * @property {number} lines
 * @property {number} level
 * @property {number} combo
 * @property {number} pieces
 * @property {number} tetrises
 * @property {number} maxCombo
 * @property {number} lockTimer
 * @property {number} lockResets
 * @property {boolean} grounded
 * @property {number} gravityAcc
 * @property {boolean} over
 * @property {Record<string, number>} used 每个方块的使用次数
 * @property {Record<string, number>} linesBy 每个方块累计消行
 * @property {Record<string, number>} comboBy 每个方块达到的最高连击
 */

/**
 * 新开一局。
 * @param {number} seed
 * @returns {Game}
 */
export function createGame(seed) {
  const rng = mulberry32(seed >>> 0);
  const game = {
    board: createBoard(),
    active: null,
    queue: [],
    bag: [],
    hold: null,
    holdUsed: false,
    score: 0,
    lines: 0,
    level: 1,
    combo: 0,
    pieces: 0,
    tetrises: 0,
    maxCombo: 0,
    lockTimer: 0,
    lockResets: 0,
    grounded: false,
    gravityAcc: 0,
    over: false,
    lastClear: 0,
    used: {},
    linesBy: {},
    comboBy: {},
    seed: seed >>> 0,
    rng,
  };
  refillQueue(game);
  spawnFromQueue(game);
  return game;
}

/**
 * 补满预备队列；袋子空了就重新洗一副（7 种各一）。
 * @param {Game} game
 */
export function refillQueue(game) {
  while (game.queue.length < 5) {
    if (game.bag.length === 0) game.bag = shuffle(PIECE_IDS.slice(), game.rng);
    game.queue.push(game.bag.pop());
  }
}

/**
 * 把指定方块放到出生位置。
 * @param {Game} game
 * @param {string} pieceId
 */
export function spawnPiece(game, pieceId) {
  const piece = PIECES[pieceId];
  const x = Math.floor((BOARD_W - piece.size) / 2);
  const y = 0;
  game.active = { id: pieceId, rot: 0, x, y };
  game.grounded = false;
  game.lockTimer = 0;
  game.lockResets = 0;
  game.gravityAcc = 0;
  if (collides(game.board, pieceId, 0, x, y)) {
    game.over = true;
    game.active = null;
  }
}

/** 从预备队列取下一个方块入场。 */
export function spawnFromQueue(game) {
  refillQueue(game);
  const id = game.queue.shift();
  spawnPiece(game, id);
}

/**
 * 落地后重置锁定计时（落地状态下移动/旋转可以续命，但次数有限）。
 * @param {Game} game
 */
function resetLock(game) {
  if (!game.grounded) return;
  if (game.lockResets < LOCK_RESETS_MAX) {
    game.lockResets += 1;
    game.lockTimer = 0;
  }
}

/**
 * 尝试移动当前方块。
 * @param {Game} game
 * @param {number} dx
 * @param {number} dy
 * @returns {boolean} 是否移动成功
 */
export function tryMove(game, dx, dy) {
  if (game.over || !game.active) return false;
  const { id, rot, x, y } = game.active;
  if (collides(game.board, id, rot, x + dx, y + dy)) return false;
  game.active.x = x + dx;
  game.active.y = y + dy;
  if (dy > 0) {
    game.grounded = false;
    game.lockTimer = 0;
  } else {
    resetLock(game);
  }
  return true;
}

/**
 * 尝试旋转当前方块（带自研简化踢墙）。
 * @param {Game} game
 * @param {number} dir 1 = 顺时针，-1 = 逆时针
 * @returns {boolean} 是否旋转成功
 */
export function tryRotate(game, dir) {
  if (game.over || !game.active) return false;
  const { id, rot, x, y } = game.active;
  const nextRot = (rot + (dir > 0 ? 1 : 3)) % 4;
  for (const kick of KICKS) {
    if (!collides(game.board, id, nextRot, x + kick, y)) {
      game.active.rot = nextRot;
      game.active.x = x + kick;
      resetLock(game);
      return true;
    }
  }
  return false;
}

/**
 * 软降：下一格并加分。
 * @param {Game} game
 * @returns {number} 本次得分
 */
export function softDrop(game) {
  if (game.over || !game.active) return 0;
  const moved = tryMove(game, 0, 1);
  if (!moved) return 0;
  game.score += SOFT_DROP_SCORE;
  return SOFT_DROP_SCORE;
}

/**
 * 硬降：直接落到底并锁定。
 * @param {Game} game
 * @returns {{points: number, event: object|null}}
 */
export function hardDrop(game) {
  if (game.over || !game.active) return { points: 0, event: null };
  let cells = 0;
  while (tryMove(game, 0, 1)) cells += 1;
  const points = cells * HARD_DROP_SCORE;
  game.score += points;
  const event = lockPiece(game);
  return { points, event };
}

/**
 * 预览落点（幽灵块）的行号。
 * @param {Game} game
 */
export function ghostY(game) {
  if (!game.active) return 0;
  const { id, rot, x } = game.active;
  let y = game.active.y;
  while (!collides(game.board, id, rot, x, y + 1)) y += 1;
  return y;
}

/**
 * 暂存方块（一次落地前只能用一次）。
 * @param {Game} game
 * @returns {boolean} 是否成功暂存
 */
export function holdPiece(game) {
  if (game.over || !game.active || game.holdUsed) return false;
  const current = game.active.id;
  game.holdUsed = true;
  if (game.hold) {
    const swap = game.hold;
    game.hold = current;
    spawnPiece(game, swap);
  } else {
    game.hold = current;
    spawnFromQueue(game);
  }
  return true;
}

/**
 * 锁定当前方块：落子 → 消行 → 计分 → 换下一个。
 * @param {Game} game
 * @returns {object} 结算事件
 */
export function lockPiece(game) {
  if (!game.active) return { cleared: 0, gained: 0, combo: 0, level: game.level, pieceId: null, over: game.over };
  const { id, rot, x, y } = game.active;

  for (const [r, c] of pieceCells(id, rot, x, y)) {
    if (r >= 0 && r < BOARD_H && c >= 0 && c < BOARD_W) game.board[r][c] = id;
  }

  game.pieces += 1;
  game.used[id] = (game.used[id] || 0) + 1;

  const rows = findFullRows(game.board);
  const cleared = rows.length;
  game.lastClear = cleared;

  let gained = 0;
  if (cleared > 0) {
    game.board = clearRows(game.board, rows);
    game.lines += cleared;
    game.combo += 1;
    if (game.combo > game.maxCombo) game.maxCombo = game.combo;
    gained = (LINE_SCORES[cleared] || 0) * game.level + COMBO_SCORE * game.combo * game.level;
    if (cleared === 4) game.tetrises += 1;
    game.linesBy[id] = (game.linesBy[id] || 0) + cleared;
    if (game.combo > (game.comboBy[id] || 0)) game.comboBy[id] = game.combo;
  } else {
    game.combo = 0;
  }

  game.score += gained;
  game.level = Math.floor(game.lines / LINES_PER_LEVEL) + 1;

  game.grounded = false;
  game.lockTimer = 0;
  game.lockResets = 0;
  game.gravityAcc = 0;
  // 新方块入场，暂存锁重置（每块只能暂存一次）
  game.holdUsed = false;

  spawnFromQueue(game);

  return {
    cleared,
    rows,
    gained,
    combo: game.combo,
    level: game.level,
    pieceId: id,
    over: game.over,
  };
}

/**
 * 推进一帧：重力 + 锁定延迟。
 * @param {Game} game
 * @param {number} dtMs
 * @returns {object|null} 若本帧发生锁定则返回结算事件
 */
export function tick(game, dtMs) {
  if (game.over || !game.active) return null;
  const interval = gravityInterval(game.level);
  game.gravityAcc += dtMs;

  if (game.gravityAcc >= interval) {
    game.gravityAcc = 0;
    const { id, rot, x, y } = game.active;
    if (!collides(game.board, id, rot, x, y + 1)) {
      game.active.y = y + 1;
      game.grounded = false;
      game.lockTimer = 0;
    } else {
      game.grounded = true;
    }
  }

  if (game.grounded) {
    game.lockTimer += dtMs;
    if (game.lockTimer >= LOCK_DELAY_MS) return lockPiece(game);
  }
  return null;
}

/* ── 档案（图鉴 / 记录 / 成就） ─────────────────────── */

/**
 * @typedef {Object} Profile
 * @property {Record<string, number>} best 各项最佳成绩
 * @property {{date: string, best: number}} daily 今日挑战
 * @property {Record<string, {used: number, lines: number, maxCombo: number}>} pieces 方块图鉴
 * @property {Record<string, boolean>} achievements
 * @property {object} stats
 */

/** 创建初始档案。 */
export function createProfile() {
  const pieces = {};
  for (const id of PIECE_IDS) pieces[id] = { used: 0, lines: 0, maxCombo: 0 };
  return {
    version: 1,
    best: { score: 0, lines: 0, level: 1, combo: 0 },
    daily: { date: '', best: 0 },
    pieces,
    achievements: Object.create(null),
    stats: { games: 0, pieces: 0, lines: 0, score: 0, maxCombo: 0, tetrises: 0, bestScore: 0, bestLevel: 1 },
  };
}

/** 全局成就定义。 */
export const ACHIEVEMENTS = [
  { id: 'first_piece', icon: '🧱', en: 'First Drop', zh: '初次落子', ja: '初落下', test: (p) => p.stats.pieces >= 1 },
  { id: 'first_clear', icon: '✨', en: 'First Clear', zh: '首消达成', ja: '初消去', test: (p) => p.stats.lines >= 1 },
  { id: 'tetris', icon: '🧨', en: 'Four in a Row', zh: '四行齐消', ja: '4ライン消去', test: (p) => p.stats.tetrises >= 1 },
  { id: 'combo5', icon: '🔥', en: 'Combo Five', zh: '五连消', ja: '5コンボ', test: (p) => p.stats.maxCombo >= 5 },
  { id: 'lines100', icon: '📏', en: 'Hundred Lines', zh: '百行成就', ja: '100ライン', test: (p) => p.stats.lines >= 100 },
  { id: 'level10', icon: '⚡', en: 'Level Ten', zh: '十级速降', ja: 'レベル10', test: (p) => p.stats.bestLevel >= 10 },
  { id: 'score10k', icon: '💠', en: 'Ten Thousand', zh: '万分达成', ja: '1万点', test: (p) => p.stats.bestScore >= 10000 },
  { id: 'dex_all', icon: '🏆', en: 'Full Codex', zh: '全谱收藏', ja: '全譜制覇', test: (p) => PIECE_IDS.every((id) => (p.pieces[id]?.used || 0) >= 20) },
];

/**
 * 某个方块的里程碑达成情况。
 * @param {Profile} profile
 * @param {string} pieceId
 * @returns {Record<string, boolean>}
 */
export function milestoneState(profile, pieceId) {
  const record = profile.pieces[pieceId] || { used: 0, lines: 0, maxCombo: 0 };
  const out = {};
  for (const m of MILESTONES) {
    if (m.used !== undefined) out[m.id] = record.used >= m.used;
    else if (m.lines !== undefined) out[m.id] = record.lines >= m.lines;
    else out[m.id] = false;
  }
  return out;
}

/**
 * 取一局的累计快照（用于和上次快照做差，算出增量）。
 * @param {Game} game
 */
export function snapshot(game) {
  return {
    pieces: game.pieces,
    lines: game.lines,
    score: game.score,
    tetrises: game.tetrises,
    maxCombo: game.maxCombo,
    level: game.level,
    used: { ...game.used },
    linesBy: { ...game.linesBy },
    comboBy: { ...game.comboBy },
  };
}

/**
 * 空快照（用于把「整局」当成一次增量并入）。
 */
export function emptySnapshot() {
  return {
    pieces: 0,
    lines: 0,
    score: 0,
    tetrises: 0,
    maxCombo: 0,
    level: 1,
    used: {},
    linesBy: {},
    comboBy: {},
  };
}

/**
 * 把一局的累计值与上次的快照做差，得到增量并并入档案。
 * 这样中途刷新页面也不会丢进度 —— 每次锁定方块就并一次。
 *
 * @param {Profile} profile
 * @param {object} current 当前累计快照
 * @param {object} previous 上次快照
 * @param {string} dateKey
 * @param {boolean} daily 是否为今日挑战
 * @param {boolean} final 是否为本局收尾（收尾时才结算最佳纪录）
 * @returns {{profile: Profile, unlocked: object[], milestones: object[]}}
 */
export function accumulate(profile, current, previous, dateKey, daily, final) {
  const pieces = {};
  for (const id of PIECE_IDS) {
    const prev = profile.pieces[id] || { used: 0, lines: 0, maxCombo: 0 };
    const dUsed = (current.used[id] || 0) - (previous.used[id] || 0);
    const dLines = (current.linesBy[id] || 0) - (previous.linesBy[id] || 0);
    pieces[id] = {
      used: prev.used + Math.max(0, dUsed),
      lines: prev.lines + Math.max(0, dLines),
      maxCombo: Math.max(prev.maxCombo, current.comboBy[id] || 0),
    };
  }

  const dPieces = Math.max(0, current.pieces - previous.pieces);
  const dLines = Math.max(0, current.lines - previous.lines);
  const dScore = Math.max(0, current.score - previous.score);
  const dTetris = Math.max(0, current.tetrises - previous.tetrises);

  const next = {
    version: 1,
    best: {
      score: Math.max(profile.best.score, current.score),
      lines: Math.max(profile.best.lines, current.lines),
      level: Math.max(profile.best.level, current.level),
      combo: Math.max(profile.best.combo, current.maxCombo),
    },
    daily: {
      date: daily ? dateKey : profile.daily.date,
      best: daily ? Math.max(profile.daily.best, current.score) : profile.daily.best,
    },
    pieces,
    achievements: Object.assign(Object.create(null), profile.achievements),
    stats: {
      games: profile.stats.games + (final ? 1 : 0),
      pieces: profile.stats.pieces + dPieces,
      lines: profile.stats.lines + dLines,
      score: profile.stats.score + dScore,
      maxCombo: Math.max(profile.stats.maxCombo, current.maxCombo),
      tetrises: profile.stats.tetrises + dTetris,
      bestScore: Math.max(profile.stats.bestScore, current.score),
      bestLevel: Math.max(profile.stats.bestLevel, current.level),
    },
  };

  // 先算里程碑，再算全局成就：里程碑是「全谱收藏」的前提
  const milestones = [];
  for (const id of PIECE_IDS) {
    const now = milestoneState(next, id);
    const before = milestoneState(profile, id);
    for (const m of MILESTONES) {
      const key = `${id}:${m.id}`;
      if (now[m.id] && !before[m.id]) {
        next.achievements[key] = true;
        milestones.push({ key, pieceId: id, milestone: m });
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
 * 结算一局，把成绩并入档案。
 * @param {Profile} profile
 * @param {Game} game
 * @param {string} dateKey
 * @param {boolean} daily 是否为今日挑战
 * @returns {{profile: Profile, unlocked: object[], milestones: object[]}}
 */
export function recordGame(profile, game, dateKey, daily) {
  return accumulate(profile, snapshot(game), emptySnapshot(), dateKey, daily, true);
}

/** 图鉴完成度（已解锁的里程碑数 / 总数）。 */
export function dexProgress(profile) {
  let done = 0;
  for (const id of PIECE_IDS) {
    const state = milestoneState(profile, id);
    for (const m of MILESTONES) {
      if (state[m.id]) done += 1;
    }
  }
  return { done, total: PIECE_IDS.length * MILESTONES.length };
}

/* ── 存档 ───────────────────────────────────────────── */

/** 把档案安全地序列化。 */
export function serializeProfile(profile) {
  return JSON.stringify({
    version: profile.version,
    best: profile.best,
    daily: profile.daily,
    pieces: profile.pieces,
    achievements: profile.achievements,
    stats: profile.stats,
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

  const best = { score: 0, lines: 0, level: 1, combo: 0 };
  if (parsed.best && typeof parsed.best === 'object') {
    best.score = safeInt(parsed.best.score);
    best.lines = safeInt(parsed.best.lines);
    best.level = Math.max(1, safeInt(parsed.best.level) || 1);
    best.combo = safeInt(parsed.best.combo);
  }

  const pieces = {};
  for (const id of PIECE_IDS) {
    const rec = parsed.pieces && typeof parsed.pieces === 'object' ? parsed.pieces[id] : null;
    pieces[id] = {
      used: rec && typeof rec === 'object' ? safeInt(rec.used) : 0,
      lines: rec && typeof rec === 'object' ? safeInt(rec.lines) : 0,
      maxCombo: rec && typeof rec === 'object' ? safeInt(rec.maxCombo) : 0,
    };
  }

  const achievements = Object.create(null);
  if (parsed.achievements && typeof parsed.achievements === 'object' && !Array.isArray(parsed.achievements)) {
    for (const ach of ACHIEVEMENTS) {
      if (parsed.achievements[ach.id] === true) achievements[ach.id] = true;
    }
    for (const id of PIECE_IDS) {
      for (const m of MILESTONES) {
        const key = `${id}:${m.id}`;
        if (parsed.achievements[key] === true) achievements[key] = true;
      }
    }
  }

  const stats = { games: 0, pieces: 0, lines: 0, score: 0, maxCombo: 0, tetrises: 0, bestScore: 0, bestLevel: 1 };
  if (parsed.stats && typeof parsed.stats === 'object') {
    stats.games = safeInt(parsed.stats.games);
    stats.pieces = safeInt(parsed.stats.pieces);
    stats.lines = safeInt(parsed.stats.lines);
    stats.score = safeInt(parsed.stats.score);
    stats.maxCombo = safeInt(parsed.stats.maxCombo);
    stats.tetrises = safeInt(parsed.stats.tetrises);
    stats.bestScore = safeInt(parsed.stats.bestScore);
    stats.bestLevel = Math.max(1, safeInt(parsed.stats.bestLevel) || 1);
  }

  const daily = {
    date: parsed.daily && typeof parsed.daily.date === 'string' ? parsed.daily.date : '',
    best: parsed.daily ? safeInt(parsed.daily.best) : 0,
  };

  return { version: 1, best, daily, pieces, achievements, stats };
}
