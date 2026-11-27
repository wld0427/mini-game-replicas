/**
 * 城痕 Townscript — 核心逻辑层（无 DOM 依赖，可完整单测）
 *
 * 玩法内核：
 *   1. 在程序化生成的海域上点击地块起楼；每块地基的高度与颜色由**上下文规则**自动演化，
 *      邻居的形状决定它长成联排屋、孤塔、拱廊还是灯塔
 *   2. 每种地标第一次成形时记入《地志图鉴》并结算铜钱（图鉴 = 收集层）
 *   3. 铜钱升级工坊：拓地（网格变大）、调色（解锁更多配色）、勘测（提示下一处未发现地标）、
 *      营建（每块地基额外产出）
 *   4. 「每日岛屿」用日期做种子，全服同一座岛、同一批地脉，方便互相比较
 *
 * 生成与判定全部走**同一个带种子的 PRNG**，所以同一个种子必然长出同一座城，
 * 城镇代码可以互相分享（编码 / 解码成对可单测）。
 */

import {
  BASE_COLORS,
  VIEW,
  GRID,
  LANDMARK_IDS,
  LANDMARKS,
  MAX_HEIGHT,
  MILESTONES,
  PALETTE,
  UPGRADES,
  UPGRADE_IDS,
  VEIN_COUNT,
  dailySeed,
} from '../assets/data.js';

export {
  BASE_COLORS,
  VIEW,
  GRID,
  LANDMARK_IDS,
  LANDMARKS,
  MAX_HEIGHT,
  MILESTONES,
  PALETTE,
  UPGRADES,
  UPGRADE_IDS,
  VEIN_COUNT,
  dailySeed,
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
 * 二维整数散列（值噪声的格点值）。
 * @param {number} x
 * @param {number} y
 * @param {number} seed
 */
function hash2(x, y, seed) {
  let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** 平滑插值权重（smoothstep）。 */
function smooth(t) {
  return t * t * (3 - 2 * t);
}

/**
 * 二维值噪声：格点散列 + 双线性平滑插值。确定性，同种子同结果。
 * @param {number} x
 * @param {number} y
 * @param {number} seed
 * @returns {number} 0–1
 */
export function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

/**
 * 用种子生成一座城：网格尺寸 + 海域深度 + 地脉位置。
 * @param {number} seed
 * @param {number} expandLevel
 * @returns {object} town
 */
/** @feature F-001 岛屿生成与确定性：同种子必得同一座岛 */
export function createTown(seed, expandLevel = 0) {
  const level = Math.min(Math.max(Math.floor(expandLevel || 0), 0), UPGRADES.expand.max);
  const cols = GRID.baseCols + GRID.expandCols * level;
  const rows = GRID.baseRows + GRID.expandRows * level;

  const heights = new Array(cols * rows).fill(0);
  const colors = new Array(cols * rows).fill(0);
  const depth = new Array(cols * rows).fill(0);

  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const radius = Math.min(cols, rows) / 2;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const dx = (c - cx) / radius;
      const dy = (r - cy) / radius;
      const falloff = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const n = valueNoise(c * 0.34, r * 0.34, seed);
      // 中心高、边缘低；噪声让海岸线不规则
      const d = falloff * 0.72 + n * 0.42 - 0.22;
      depth[r * cols + c] = Math.max(0, Math.min(1, d));
    }
  }

  // 地脉：种子决定位置，深海之外的格子才有意义
  const rng = mulberry32((seed ^ 0x5bf03635) >>> 0);
  const veins = [];
  let guard = 0;
  while (veins.length < VEIN_COUNT && guard < 500) {
    guard += 1;
    const c = Math.floor(rng() * cols);
    const r = Math.floor(rng() * rows);
    const key = r * cols + c;
    if (veins.some((v) => v.key === key)) continue;
    veins.push({ key, c, r });
  }

  return {
    seed: seed >>> 0,
    expandLevel: level,
    cols,
    rows,
    heights,
    colors,
    depth,
    veins,
    builds: 0,
    removals: 0,
  };
}

/**
 * 每日岛屿：同一天所有人拿到同一座城。
 * @param {string} dateKey
 * @param {number} expandLevel
 */
/** @feature F-012 每日岛与跨天重置 */
export function createDailyTown(dateKey, expandLevel = 0) {
  return createTown(dailySeed(dateKey), expandLevel);
}

/** 网格尺寸（随拓地等级变化）。 */
export function gridSize(expandLevel = 0) {
  const level = Math.min(Math.max(Math.floor(expandLevel || 0), 0), UPGRADES.expand.max);
  return {
    cols: GRID.baseCols + GRID.expandCols * level,
    rows: GRID.baseRows + GRID.expandRows * level,
  };
}

/* ── 上下文规则 ───────────────────────────────────── */

/**
 * 取一格的上下文信息。
 * @param {object} town
 * @param {number} c 列
 * @param {number} r 行
 */
export function cellFacts(town, c, r) {
  const h = town.heights[r * town.cols + c];
  const color = town.colors[r * town.cols + c];
  const at = (cc, rr) => {
    if (cc < 0 || rr < 0 || cc >= town.cols || rr >= town.rows) return -1;
    return town.heights[rr * town.cols + cc];
  };
  const n = at(c, r - 1);
  const s = at(c, r + 1);
  const w = at(c - 1, r);
  const e = at(c + 1, r);
  const around = [n, s, w, e];
  let same = 0;
  let higher = 0;
  let lower = 0;
  let water = 0;
  let solid = 0;
  for (const v of around) {
    if (v < 0) continue;
    if (v === 0) { water += 1; continue; }
    solid += 1;
    if (v === h) same += 1;
    else if (v > h) higher += 1;
    else lower += 1;
  }
  // 边缘：这一格自己临着深海
  const myDepth = town.depth[r * town.cols + c];
  const deepEdge = (cc, rr) => {
    if (cc < 0 || rr < 0 || cc >= town.cols || rr >= town.rows) return true;
    return town.depth[rr * town.cols + cc] > 0.66;
  };
  return {
    h,
    color,
    same,
    higher,
    lower,
    water,
    solid,
    n,
    s,
    w,
    e,
    myDepth,
    deepEdge: deepEdge(c - 1, r) || deepEdge(c + 1, r) || deepEdge(c, r - 1) || deepEdge(c, r + 1),
    outOfBounds: c < 0 || r < 0 || c >= town.cols || r >= town.rows,
  };
}

/**
 * 判断一格命中了哪些地标（可能同时命中多种）。
 * @param {object} town
 * @param {number} c
 * @param {number} r
 */
/** @feature F-002 上下文规则与十种地标 */
export function matchLandmarks(town, c, r) {
  if (c < 0 || r < 0 || c >= town.cols || r >= town.rows) return [];
  const f = cellFacts(town, c, r);
  const out = [];

  if (f.h === 0) {
    // 一格水被四面高墙围住 → 内院
    if (f.water === 0 && f.solid === 4 && f.higher === 4) out.push('courtyard');
    return out;
  }

  if (town.builds === 1 && f.h === 1) out.push('foundation');
  if (f.same >= 1) out.push('house');
  // 孤塔：够高，且四邻没有等高的块 → 自己站成一栋
  if (f.h >= 2 && f.same === 0) out.push('spire');
  // 拱廊：左右都是水，但上下有陆地 → 一条架在海面上的窄道
  if (f.w === 0 && f.e === 0 && (f.n > 0 || f.s > 0)) out.push('arch');
  // 阶梯：与某个实心邻居正好差一阶，且自己没有等高的邻居 → 一处独立的小台阶
  if (f.same === 0 && f.solid >= 1) {
    const around = [f.n, f.s, f.w, f.e];
    if (around.some((v) => v > 0 && Math.abs(v - f.h) === 1)) out.push('stair');
  }
  // 2×2 同高为 1 → 方场。四个候选 2×2 都要试，
  // 否则只有左上角那一格会被判成方场，计数就不对称了。
  if (f.h === 1) {
    const blocks = [
      [[c, r], [c + 1, r], [c, r + 1], [c + 1, r + 1]],
      [[c - 1, r], [c, r], [c - 1, r + 1], [c, r + 1]],
      [[c, r - 1], [c + 1, r - 1], [c, r], [c + 1, r]],
      [[c - 1, r - 1], [c, r - 1], [c - 1, r], [c, r]],
    ];
    for (const block of blocks) {
      const ok = block.every(([cc, rr]) => cc >= 0 && rr >= 0 && cc < town.cols && rr < town.rows
        && town.heights[rr * town.cols + cc] === 1);
      if (ok) {
        out.push('plaza');
        break;
      }
    }
  }
  // 灯塔：细高塔身（只有唯一邻居），且与邻居颜色交替
  if (f.h >= 3 && f.same === 1 && f.solid === 1) {
    const mate = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]].find(([cc, rr]) => {
      if (cc < 0 || rr < 0 || cc >= town.cols || rr >= town.rows) return false;
      return town.heights[rr * town.cols + cc] === f.h;
    });
    if (mate && town.colors[mate[1] * town.cols + mate[0]] !== f.color) out.push('lighthouse');
  }
  if (f.h >= MAX_HEIGHT) out.push('tower');
  if (f.deepEdge) out.push('harbor');

  return out;
}

/**
 * 一格的渲染样式（命中的地标里优先级最高的那个）。
 * @param {object} town
 * @param {number} c
 * @param {number} r
 */
export function blockStyle(town, c, r) {
  const hits = matchLandmarks(town, c, r);
  if (hits.length === 0) return 'plain';
  const order = ['foundation', 'lighthouse', 'tower', 'plaza', 'arch', 'stair', 'courtyard', 'spire', 'house', 'harbor'];
  for (const id of order) {
    if (hits.includes(id)) return id;
  }
  return 'plain';
}

/**
 * 一次操作影响的邻域（自身 + 八邻），返回其中出现过的全部地标类型。
 * @param {object} town
 * @param {number} c
 * @param {number} r
 */
export function detectNeighborhood(town, c, r) {
  const found = new Set();
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      for (const id of matchLandmarks(town, c + dc, r + dr)) found.add(id);
    }
  }
  return [...found];
}

/** 城里所有地标的计数。 */
export function countLandmarks(town) {
  const counts = {};
  for (const id of LANDMARK_IDS) counts[id] = 0;
  for (let r = 0; r < town.rows; r += 1) {
    for (let c = 0; c < town.cols; c += 1) {
      if (town.heights[r * town.cols + c] === 0) continue;
      for (const id of matchLandmarks(town, c, r)) counts[id] += 1;
    }
  }
  return counts;
}

/* ── 几何与命中检测 ───────────────────────────────── */

/**
 * 某一格第 k 层方块的绘制矩形（2.5D 斜堆：越高越往右上偏）。
 * @param {number} c 列
 * @param {number} r 行
 * @param {number} k 层号（0 = 底层）
 */
/** @feature F-005 命中检测与渲染同几何 */
export function blockRect(c, r, k) {
  return {
    x: c * VIEW.cell + k * VIEW.off,
    y: r * VIEW.cell - k * VIEW.off,
    w: VIEW.cell - VIEW.gap,
    h: VIEW.cell - VIEW.gap,
  };
}

/**
 * 命中检测：返回点击落在的格子。
 * 先找方块（取最高的一层），找不到就落到该位置的地块本身。
 *
 * @param {object} town
 * @param {number} px 世界坐标 x
 * @param {number} py 世界坐标 y
 * @returns {{c: number, r: number, level: number}|null}
 */
export function hitTest(town, px, py) {
  let best = null;
  for (let r = 0; r < town.rows; r += 1) {
    for (let c = 0; c < town.cols; c += 1) {
      const h = town.heights[r * town.cols + c];
      for (let k = 0; k < h; k += 1) {
        const rect = blockRect(c, r, k);
        if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
          if (!best || k > best.level) best = { c, r, level: k };
        }
      }
    }
  }
  if (best) return best;

  const c = Math.floor(px / VIEW.cell);
  const r = Math.floor(py / VIEW.cell);
  if (c < 0 || r < 0 || c >= town.cols || r >= town.rows) return null;
  return { c, r, level: 0 };
}

/**
 * 勘测提示：找一个「在这块地起楼就能发现新地标」的位置。
 * @param {object} town
 * @param {string[]} known 已发现的地标 id
 * @returns {{c: number, r: number, landmark: string}|null}
 */
/** @feature F-014 勘测提示 */
export function findHint(town, known) {
  const found = new Set(known || []);
  for (let r = 0; r < town.rows; r += 1) {
    for (let c = 0; c < town.cols; c += 1) {
      const key = r * town.cols + c;
      if (town.heights[key] > 0) continue;
      const beforeH = town.heights[key];
      const beforeC = town.colors[key];
      const beforeBuilds = town.builds;
      town.heights[key] = 1;
      town.colors[key] = 0;
      town.builds += 1;
      const hits = detectNeighborhood(town, c, r);
      town.heights[key] = beforeH;
      town.colors[key] = beforeC;
      town.builds = beforeBuilds;
      const fresh = hits.find((id) => !found.has(id));
      if (fresh) return { c, r, landmark: fresh };
    }
  }
  return null;
}

/* ── 建造 ─────────────────────────────────────────── */

/**
 * 起楼 / 加层。已满层时改为换色。
 * @param {object} town
 * @param {number} c
 * @param {number} r
 * @param {number} color
 * @returns {{ok: boolean, changed: boolean, vein: boolean, landmarks: string[], style: string}}
 */
/** @feature F-003 起楼与叠高 */
export function placeBlock(town, c, r, color) {
  if (c < 0 || r < 0 || c >= town.cols || r >= town.rows) {
    return { ok: false, changed: false, vein: false, landmarks: [], style: 'plain' };
  }
  const key = r * town.cols + c;
  const before = town.heights[key];
  if (before >= MAX_HEIGHT) {
    if (town.colors[key] === color) return { ok: true, changed: false, vein: false, landmarks: [], style: blockStyle(town, c, r) };
    town.colors[key] = color;
  } else {
    town.heights[key] = before + 1;
    town.colors[key] = color;
  }
  town.builds += 1;
  const vein = town.veins.some((v) => v.key === key);
  const landmarks = detectNeighborhood(town, c, r);
  return { ok: true, changed: true, vein, landmarks, style: blockStyle(town, c, r) };
}

/**
 * 拆除一层。
 * @param {object} town
 * @param {number} c
 * @param {number} r
 */
/** @feature F-004 拆除 */
export function removeBlock(town, c, r) {
  if (c < 0 || r < 0 || c >= town.cols || r >= town.rows) {
    return { ok: false, changed: false, landmarks: [], style: 'plain' };
  }
  const key = r * town.cols + c;
  if (town.heights[key] === 0) return { ok: true, changed: false, landmarks: [], style: 'plain' };
  town.heights[key] -= 1;
  if (town.heights[key] === 0) town.colors[key] = 0;
  town.removals += 1;
  const landmarks = detectNeighborhood(town, c, r);
  return { ok: true, changed: true, landmarks, style: blockStyle(town, c, r) };
}

/** 城里最高的楼。 */
export function tallestBlock(town) {
  let best = 0;
  for (const h of town.heights) if (h > best) best = h;
  return best;
}

/** 已建成的地块数。 */
export function builtCells(town) {
  let n = 0;
  for (const h of town.heights) if (h > 0) n += 1;
  return n;
}

/* ── 城镇代码（可分享 / 可还原） ───────────────────── */

/**
 * 把城编码成一段文本：种子 + 拓地等级 + 建造/拆除计数 + 高度 + 颜色。
 *
 * 拓地等级**必须**进代码：它决定网格尺寸，少了它，解码时按 level 0 建城，
 * 长度校验必然失败 —— 于是玩家拓地后分享出去的城别人根本还原不了。
 * 建造/拆除计数同理：少了它，还原一座外来城市后第一次建造会重新触发「初基」里程碑。
 *
 * @param {object} town
 * @returns {string}
 */
/** @feature F-009 城镇代码往返（含拓地等级与建造计数） */
export function encodeTown(town) {
  const h = town.heights.map((v) => v.toString(36)).join('');
  const c = town.colors.map((v) => v.toString(36)).join('');
  const expand = (town.expandLevel || 0).toString(36);
  const builds = (town.builds || 0).toString(36);
  const removals = (town.removals || 0).toString(36);
  return `TS2-${town.seed.toString(36)}-${expand}-${builds}-${removals}-${h}-${c}`;
}

/**
 * 解码一段城镇代码。非法输入返回 null。
 *
 * 兼容两种格式：
 *   - `TS2-种子-拓地-建造-拆除-高度-颜色`（现行）
 *   - `TS1-种子-高度-颜色`（旧格式：拓地等级按 0 还原，计数按 0 还原）
 *
 * @param {string} code
 * @returns {object|null}
 */
/** @feature F-010 旧码兼容与非法码处理 */
export function decodeTown(code) {
  if (typeof code !== 'string') return null;
  const parts = code.trim().split('-');
  if (parts.length !== 4 && parts.length !== 7) return null;

  let seed36 = null;
  let expand36 = '0';
  let builds36 = '0';
  let removals36 = '0';
  let heightsPart = null;
  let colorsPart = null;

  if (parts.length === 4) {
    if (parts[0] !== 'TS1') return null;
    [, seed36, heightsPart, colorsPart] = parts;
  } else {
    if (parts[0] !== 'TS2') return null;
    [, seed36, expand36, builds36, removals36, heightsPart, colorsPart] = parts;
  }

  const seed = parseInt(seed36, 36);
  if (!Number.isFinite(seed)) return null;
  const expandLevel = parseInt(expand36, 36);
  if (!Number.isFinite(expandLevel) || expandLevel < 0) return null;
  const builds = parseInt(builds36, 36);
  if (!Number.isFinite(builds) || builds < 0) return null;
  const removals = parseInt(removals36, 36);
  if (!Number.isFinite(removals) || removals < 0) return null;

  const town = createTown(seed, expandLevel);
  if (heightsPart.length !== town.heights.length) return null;
  if (colorsPart.length !== town.colors.length) return null;
  for (let i = 0; i < town.heights.length; i += 1) {
    const h = parseInt(heightsPart[i], 36);
    const c = parseInt(colorsPart[i], 36);
    if (!Number.isFinite(h) || h < 0 || h > MAX_HEIGHT) return null;
    if (!Number.isFinite(c) || c < 0 || c >= PALETTE.length) return null;
    town.heights[i] = h;
    town.colors[i] = c;
  }
  town.builds = builds;
  town.removals = removals;
  return town;
}

/* ── 档案 ─────────────────────────────────────────── */

/**
 * @typedef {Object} Profile
 * @property {number} coins
 * @property {number} totalEarned
 * @property {Record<string, number>} upgrades
 * @property {Record<string, {count: number, firstAt: string}>} dex 地志图鉴
 * @property {Record<string, boolean>} achievements
 * @property {object} stats
 */

/** 创建初始档案。 */
export function createProfile() {
  const dex = {};
  for (const id of LANDMARK_IDS) dex[id] = { count: 0, firstAt: null };
  return {
    version: 1,
    coins: 0,
    totalEarned: 0,
    upgrades: { expand: 0, palette: 0, survey: 0, income: 0 },
    dex,
    achievements: Object.create(null),
    stats: { builds: 0, removals: 0, towns: 0, veinBuilds: 0, bestHeight: 0, discovered: 0 },
  };
}

/** 全局成就。 */
export const ACHIEVEMENTS = [
  { id: 'first_build', icon: '🧱', en: 'First Foundation', zh: '初奠一城', ja: '初築', test: (p) => p.stats.builds >= 1 },
  { id: 'all_landmarks', icon: '🗺️', en: 'Full Gazetteer', zh: '地志集全', ja: '地誌制覇', test: (p) => LANDMARK_IDS.every((id) => (p.dex[id]?.count || 0) >= 1) },
  { id: 'town_100', icon: '🏘️', en: 'Hundred Blocks', zh: '百块之城', ja: '百棟の町', test: (p) => p.stats.builds >= 100 },
  { id: 'height_4', icon: '🏢', en: 'Four Storeys', zh: '高楼四层', ja: '四層高層', test: (p) => p.stats.bestHeight >= 4 },
  { id: 'income_1k', icon: '💰', en: 'Thousand Coins', zh: '千枚铜钱', ja: '千銭', test: (p) => p.totalEarned >= 1000 },
  { id: 'vein_10', icon: '💎', en: 'Vein Digger', zh: '地脉十挖', ja: '地脈十掘り', test: (p) => p.stats.veinBuilds >= 10 },
  { id: 'expand_max', icon: '🗺️', en: 'Edge of the Map', zh: '拓至尽头', ja: '地図の端', test: (p) => p.upgrades.expand >= UPGRADES.expand.max },
  { id: 'palette_all', icon: '🎨', en: 'Full Palette', zh: '全色在握', ja: '全色掌握', test: (p) => p.upgrades.palette >= UPGRADES.palette.max },
];

/**
 * 某个地标的里程碑达成情况。
 * @param {Profile} profile
 * @param {string} id
 */
export function milestoneState(profile, id) {
  const count = profile.dex[id]?.count || 0;
  const out = {};
  for (const m of MILESTONES) out[m.id] = count >= m.count;
  return out;
}

/** 图鉴完成度。 */
export function dexProgress(profile) {
  let done = 0;
  for (const id of LANDMARK_IDS) {
    const state = milestoneState(profile, id);
    for (const m of MILESTONES) {
      if (state[m.id]) done += 1;
    }
  }
  return { done, total: LANDMARK_IDS.length * MILESTONES.length };
}

/**
 * 把一次建造结果并入档案（不可变：返回新档案）。
 * @param {Profile} profile
 * @param {object} event { type: 'build' | 'remove', landmarks: string[], coins, vein, height }
 * @returns {{profile: Profile, unlocked: object[], milestones: object[]}}
 */
/** @feature F-006 地志图鉴与里程碑 */
export function applyEvent(profile, event) {
  const dex = {};
  for (const id of LANDMARK_IDS) dex[id] = { ...(profile.dex[id] || { count: 0, firstAt: null }) };

  const next = {
    version: 1,
    coins: profile.coins + (event.coins || 0),
    totalEarned: profile.totalEarned + (event.coins || 0),
    upgrades: { ...profile.upgrades },
    dex,
    achievements: Object.assign(Object.create(null), profile.achievements),
    stats: { ...profile.stats },
  };

  if (event.type === 'build') {
    next.stats.builds += 1;
    if (event.vein) next.stats.veinBuilds += 1;
    if ((event.height || 0) > next.stats.bestHeight) next.stats.bestHeight = event.height || 0;
  } else if (event.type === 'remove') {
    next.stats.removals += 1;
  }

  const milestones = [];
  for (const id of event.landmarks || []) {
    const record = dex[id];
    if (!record) continue;
    record.count += 1;
    if (!record.firstAt) record.firstAt = new Date().toISOString();
    const now = milestoneState(next, id);
    const before = milestoneState(profile, id);
    for (const m of MILESTONES) {
      const key = `${id}:${m.id}`;
      if (now[m.id] && !before[m.id]) {
        next.achievements[key] = true;
        milestones.push({ key, landmarkId: id, milestone: m });
      }
    }
  }
  next.stats.discovered = LANDMARK_IDS.filter((id) => next.dex[id].count > 0).length;

  const unlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (next.achievements[ach.id]) continue;
    if (ach.test(next)) {
      /** @feature F-020 成就系统：按进度解锁且只解锁一次 */
      next.achievements[ach.id] = true;
      unlocked.push(ach);
    }
  }

  return { profile: next, unlocked, milestones };
}

/* ── 工坊 ─────────────────────────────────────────── */

/**
 * 某项升级的价格。
 * @param {string} kind
 * @param {number} level
 */
export function upgradeCost(kind, level) {
  const def = UPGRADES[kind];
  if (!def) return Infinity;
  return Math.round(def.base * Math.pow(def.growth, level));
}

/**
 * 升级一项工坊设施。
 * @param {Profile} profile
 * @param {string} kind
 */
/** @feature F-008 工坊升级 */
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
    dex: { ...profile.dex },
    achievements: Object.assign(Object.create(null), profile.achievements),
    stats: { ...profile.stats },
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

/** 当前解锁的配色数量。 */
/** @feature F-015 调色板解锁 */
export function paletteSize(profile) {
  return Math.min(PALETTE.length, BASE_COLORS + (profile.upgrades.palette || 0));
}

/** 每块地基的基础产出。 */
/** @feature F-007 铜钱经济（每块地基的基础收入） */
export function buildIncome(profile) {
  return 1 + (profile.upgrades.income || 0);
}

/* ── 存档 ─────────────────────────────────────────── */

/** 把档案安全地序列化。 */
export function serializeProfile(profile) {
  return JSON.stringify({
    version: profile.version,
    coins: profile.coins,
    totalEarned: profile.totalEarned,
    upgrades: profile.upgrades,
    dex: profile.dex,
    achievements: profile.achievements,
    stats: profile.stats,
  });
}

/**
 * 从存档字符串恢复档案，任何字段异常都回退到安全默认值。
 * @param {string|null} raw
 */
/** @feature F-018 存档脏数据回退 */
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

  const upgrades = { expand: 0, palette: 0, survey: 0, income: 0 };
  if (parsed.upgrades && typeof parsed.upgrades === 'object' && !Array.isArray(parsed.upgrades)) {
    for (const id of UPGRADE_IDS) upgrades[id] = Math.min(UPGRADES[id].max, safeInt(parsed.upgrades[id]));
  }

  const dex = {};
  for (const id of LANDMARK_IDS) {
    const rec = parsed.dex && typeof parsed.dex === 'object' ? parsed.dex[id] : null;
    dex[id] = {
      count: rec && typeof rec === 'object' ? safeInt(rec.count) : 0,
      firstAt: rec && typeof rec.firstAt === 'string' ? rec.firstAt : null,
    };
  }

  const achievements = Object.create(null);
  if (parsed.achievements && typeof parsed.achievements === 'object' && !Array.isArray(parsed.achievements)) {
    for (const ach of ACHIEVEMENTS) {
      if (parsed.achievements[ach.id] === true) achievements[ach.id] = true;
    }
    for (const id of LANDMARK_IDS) {
      for (const m of MILESTONES) {
        const key = `${id}:${m.id}`;
        if (parsed.achievements[key] === true) achievements[key] = true;
      }
    }
  }

  const stats = { builds: 0, removals: 0, towns: 0, veinBuilds: 0, bestHeight: 0, discovered: 0 };
  if (parsed.stats && typeof parsed.stats === 'object') {
    stats.builds = safeInt(parsed.stats.builds);
    stats.removals = safeInt(parsed.stats.removals);
    stats.towns = safeInt(parsed.stats.towns);
    stats.veinBuilds = safeInt(parsed.stats.veinBuilds);
    stats.bestHeight = Math.min(MAX_HEIGHT, safeInt(parsed.stats.bestHeight));
    stats.discovered = safeInt(parsed.stats.discovered);
  }

  return {
    version: 1,
    coins: safeInt(parsed.coins),
    totalEarned: safeInt(parsed.totalEarned),
    upgrades,
    dex,
    achievements,
    stats,
  };
}
