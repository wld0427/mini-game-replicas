/**
 * 元素熔炉 Element Forge — 核心逻辑层（纯函数，无 DOM 依赖，可完整单测）
 *
 * 玩法内核：
 *   1. 从水 / 火 / 风 / 土 四个基础元素出发，把任意两个元素放进熔炉即可合成新元素
 *   2. 已收录的组合走「合成表」（结果唯一、可复现、可抄配方）
 *   3. 表里没有的组合走「原创合成」：按中文构词法把两个词的词素拼起来，
 *      结果由该组合本身派生 —— 同一对原料永远得到同一个结果
 *   4. 每条新发现进入图鉴，并按稀有度分档；每日还有「灵感抽取」，带保底
 *
 * 本文件为原创实现，不含任何第三方素材或代码。
 */

import {
  AMPLIFIERS,
  BASE_IDS,
  DAILY_LIMIT,
  DAILY_PITY_LIMIT,
  ELEMENTS,
  RECIPES,
  elementName,
  morphemes,
} from '../assets/data.js';

/** 稀有度档位，权重用于原创合成的概率分布。 */
export const TIER_IDS = ['n', 'r', 'sr', 'ssr', 'ur'];

/** @feature F-001 基础元素与五档稀有度（n/r/sr/ssr/ur） */
export const TIERS = {
  n: { id: 'n', weight: 100, label: 'Common', zh: '普通', ja: 'コモン' },
  r: { id: 'r', weight: 45, label: 'Rare', zh: '稀有', ja: 'レア' },
  sr: { id: 'sr', weight: 18, label: 'Epic', zh: '史诗', ja: 'エピック' },
  ssr: { id: 'ssr', weight: 5, label: 'Legendary', zh: '传说', ja: 'レジェンド' },
  ur: { id: 'ur', weight: 1, label: 'Mythic', zh: '神话', ja: 'ミシック' },
};

export const TIER_LIST = TIER_IDS.map((id) => TIERS[id]);

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
 * FNV-1a 字符串散列，用于把「配方」变成稳定的种子。
 * @param {string} str
 * @returns {number} 无符号 32 位整数
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
 * 配方键：顺序无关（AB 与 BA 等价）。
 * @param {string} a
 * @param {string} b
 */
export function recipeKey(a, b) {
  return a <= b ? `${a}+${b}` : `${b}+${a}`;
}

/* ── 合成表索引 ─────────────────────────────────────── */

/** 配方键 → 产物 id */
export const RECIPE_MAP = new Map();
/** 原料 id → 由它参与的所有配方 */
export const RECIPES_BY_INPUT = new Map();

for (const [a, b, out] of RECIPES) {
  RECIPE_MAP.set(recipeKey(a, b), out);
  for (const id of [a, b]) {
    if (!RECIPES_BY_INPUT.has(id)) RECIPES_BY_INPUT.set(id, []);
    RECIPES_BY_INPUT.get(id).push({ other: id === a ? b : a, out });
  }
}

/**
 * 计算每个词条的「合成层数」：基础元素为 0，每合成一次 +1。
 * 合成表若存在环，用迭代求不动点的方式收敛。
 * @param {Array<[string, string, string]>} recipes
 * @param {string[]} baseIds
 * @returns {Map<string, number>}
 */
/**
 * @feature F-006 合成层数计算：基础元素 0 层，每熔炼一次 +1
 */
export function computeGenerations(recipes, baseIds) {
  const gen = new Map();
  for (const id of baseIds) gen.set(id, 0);
  let changed = true;
  let guard = 0;
  while (changed && guard < 10000) {
    changed = false;
    guard += 1;
    for (const [a, b, out] of recipes) {
      if (!gen.has(a) || !gen.has(b)) continue;
      const next = Math.max(gen.get(a), gen.get(b)) + 1;
      if (!gen.has(out) || gen.get(out) > next) {
        gen.set(out, next);
        changed = true;
      }
    }
  }
  return gen;
}

/** 词条层数表（模块加载时算一次）。 */
export const GENERATIONS = computeGenerations(RECIPES, BASE_IDS);

/** 各语言下所有正式词条的名字集合，用于原创合成时的重名检测。 */
const CANONICAL_NAMES = {
  zh: new Set(Object.values(ELEMENTS).map((el) => el.zh)),
  en: new Set(Object.values(ELEMENTS).map((el) => el.en)),
  ja: new Set(Object.values(ELEMENTS).map((el) => el.ja)),
};

const LANGS = ['zh', 'en', 'ja'];

/* ── 词素与命名 ─────────────────────────────────────── */

/**
 * 取词条的定语 / 中心语。原创词条从存档里读，正式词条查 MORPH 表。
 * @param {string} id
 * @param {GameState} state
 * @param {string} lang
 * @returns {{mod: string, core: string}}
 */
/**
 * @feature F-003 词素取用：原创词条从存档取，正式词条查 MORPH 表
 */
export function morphemesFor(id, state, lang) {
  const rec = state.collection[id];
  if (rec && rec.improvised && rec.mod && rec.core) {
    return { mod: rec.mod[lang] || rec.mod.zh, core: rec.core[lang] || rec.core.zh };
  }
  const el = ELEMENTS[id];
  if (!el) return { mod: '', core: '' };
  return morphemes(el, lang);
}

/**
 * 把定语与中心语拼成新词。
 * @param {string} mod
 * @param {string} core
 * @param {string} lang
 */
export function composeWord(mod, core, lang) {
  if (lang === 'en') return `${mod} ${core}`.trim();
  return `${mod}${core}`;
}

/**
 * 原创合成：按词素拼词，必要时加「增幅前缀」避开重名。
 * 结果只取决于配方本身（哈希），因此同一对原料永远得到同一个结果。
 *
 * @param {string} aId
 * @param {string} bId
 * @param {GameState} state
 * @param {number} hash 该配方的稳定散列
 * @returns {{id: string, names: Record<string, string>, glyph: string, mod: Record<string, string>, core: Record<string, string>}}
 */
/**
 * @feature F-003 原创合成构词：定语 + 中心语，结果只由配方散列决定
 */
export function composeImprovised(aId, bId, state, hash) {
  // 中文复合词以「定语 + 中心语」为主，所以默认让 A 当定语；
  // 留 1/4 的比例反向拼词，制造一点「歪打正着」的荒诞感。
  const useForward = hash % 4 !== 0;
  const outId = `imp:${recipeKey(aId, bId).replace(/\+/g, '~')}`;
  const names = {};
  const mods = {};
  const cores = {};

  for (const lang of LANGS) {
    const ma = morphemesFor(aId, state, lang);
    const mb = morphemesFor(bId, state, lang);
    const forward = composeWord(ma.mod, mb.core, lang);
    const backward = composeWord(mb.mod, ma.core, lang);
    const base = useForward ? forward : backward;

    let name = base;
    const canonical = CANONICAL_NAMES[lang];
    if (canonical.has(name)) {
      // 依次尝试增幅前缀，起点由散列决定，保证同一配方结果一致
      const start = (hash >>> 3) % AMPLIFIERS.length;
      for (let i = 0; i < AMPLIFIERS.length; i += 1) {
        const amp = AMPLIFIERS[(start + i) % AMPLIFIERS.length];
        const candidate = composeWord(amp[lang], base, lang);
        if (!canonical.has(candidate)) {
          name = candidate;
          break;
        }
      }
    }

    // 与存档中已发现的原创词重名时追加序号，避免图鉴里出现两个同名条目
    const suffix = countNameCollision(state, name, lang, outId);
    if (suffix > 0) name = lang === 'en' ? `${name} ${suffix + 1}` : `${name}·${suffix + 1}`;

    names[lang] = name;
    const picked = useForward ? ma : mb;
    const pickedOther = useForward ? mb : ma;
    mods[lang] = picked.mod;
    cores[lang] = pickedOther.core;
  }

  return {
    id: outId,
    names,
    glyph: '🧪',
    mod: mods,
    core: cores,
  };
}

/**
 * 统计存档中与给定名字重合的原创词条数量。
 * @param {GameState} state
 * @param {string} name
 * @param {string} lang
 * @param {string} [excludeId] 计算时要排除的词条（正在生成的那一个）
 */
/**
 * @feature F-004 原创词重名消歧：撞正式词加增幅前缀，原创词之间重名加序号
 */
export function countNameCollision(state, name, lang, excludeId) {
  let hits = 0;
  for (const [id, rec] of Object.entries(state.collection)) {
    if (id === excludeId) continue;
    if (rec.improvised && rec.names && rec.names[lang] === name) hits += 1;
  }
  return hits;
}

/* ── 稀有度分布 ─────────────────────────────────────── */

/**
 * 原创合成的稀有度权重：层数越深越容易出稀有结果。
 * @param {number} gen 产物层数
 * @returns {Record<string, number>}
 */
/**
 * @feature F-005 原创合成稀有度随合成层数提高
 */
export function improvisedTierWeights(gen) {
  const depth = Math.min(Math.max(Math.floor(gen), 1), 6);
  return {
    n: Math.max(3, 54 - 8 * depth),
    r: 26,
    sr: 9 + 2 * depth,
    ssr: 3 + depth,
    ur: 1 + depth * 0.5,
  };
}

/**
 * 每日灵感抽取的稀有度权重。
 */
export const DAILY_WEIGHTS = { n: 60, r: 24, sr: 9, ssr: 5, ur: 2 };

/**
 * 按权重挑选一个稀有度。
 * @param {() => number} rng
 * @param {Record<string, number>} weights
 * @returns {string} tier id
 */
export function pickTierByWeight(rng, weights) {
  const total = TIER_IDS.reduce((sum, id) => sum + (weights[id] || 0), 0);
  if (total <= 0) return 'n';
  let roll = rng() * total;
  for (const id of TIER_IDS) {
    roll -= weights[id] || 0;
    if (roll < 0) return id;
  }
  return 'n';
}

/** 原创词条按稀有度取的图形标识。 */
const IMPROVISED_GLYPHS = { n: '🧪', r: '⚗️', sr: '🔮', ssr: '💠', ur: '🌀' };

/* ── 状态 ───────────────────────────────────────────── */

/**
 * @typedef {Object} GameState
 * @property {number} version
 * @property {Record<string, object>} collection 已发现词条 → 记录
 * @property {Record<string, string>} recipes 配方键 → 产物 id
 * @property {Record<string, boolean>} achievements 已解锁成就
 * @property {object} stats 统计
 * @property {{date: string, draws: number, pity: number, lastId: string|null}} daily 每日灵感
 * @property {string|null} startedAt
 */

/** 基础元素在图鉴里的初始记录。 */
function baseRecord(el) {
  return {
    count: 1,
    gen: 0,
    tier: el.tier,
    improvised: false,
    names: { zh: el.zh, en: el.en, ja: el.ja },
    glyph: el.glyph,
  };
}

/** 创建初始状态（四个基础元素一开始就在图鉴里）。 */
export function createState() {
  const state = {
    version: 1,
    collection: Object.create(null),
    recipes: Object.create(null),
    recipeOrder: Object.create(null),
    achievements: Object.create(null),
    stats: {
      fusions: 0,
      discoveries: 0,
      improvised: 0,
      dailyDraws: 0,
      maxGen: 0,
      tierCounts: { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 },
    },
    daily: { date: '', draws: 0, pity: 0, lastId: null },
    startedAt: null,
  };
  for (const id of BASE_IDS) {
    const el = ELEMENTS[id];
    if (el) state.collection[id] = baseRecord(el);
  }
  return state;
}

/** 已收集的不同词条数。 */
export function distinctCount(state) {
  return Object.keys(state.collection).length;
}

/** 某个词条的层数：原创词条从存档取，正式词条查层数表。 */
export function generationOf(state, id) {
  const rec = state.collection[id];
  if (rec && typeof rec.gen === 'number') return rec.gen;
  if (GENERATIONS.has(id)) return GENERATIONS.get(id);
  return 0;
}

/**
 * 取词条在当前语言下的展示信息。
 * @param {string} id
 * @param {GameState} state
 * @param {string} lang
 */
/**
 * @feature F-009 图鉴词条描述（正式与原创统一口径）
 */
export function describeElement(id, state, lang) {
  const rec = state.collection[id];
  if (rec) {
    return {
      id,
      name: rec.names[lang] || rec.names.zh || id,
      glyph: rec.glyph || '🧪',
      tier: rec.tier || 'n',
      improvised: !!rec.improvised,
      gen: typeof rec.gen === 'number' ? rec.gen : 0,
      count: rec.count || 0,
    };
  }
  const el = ELEMENTS[id];
  if (!el) return null;
  return {
    id,
    name: elementName(el, lang),
    glyph: el.glyph,
    tier: el.tier,
    improvised: false,
    gen: GENERATIONS.has(id) ? GENERATIONS.get(id) : 0,
    count: 0,
  };
}

/**
 * 执行一次熔炼。返回新 state（不修改入参）与本次结果。
 * @param {GameState} state
 * @param {string} aId
 * @param {string} bId
 * @returns {{state: GameState, result: object}}
 */
/**
 * @feature F-002 合成表命中与顺序无关
 * @feature F-009 图鉴收集与原创词条目
 */
export function applyFusion(state, aId, bId) {
  if (!aId || !bId) throw new Error('fusion needs two elements');
  const known = (id) => !!ELEMENTS[id] || !!state.collection[id];
  if (!known(aId) || !known(bId)) throw new Error(`unknown element: ${aId} / ${bId}`);

  const key = recipeKey(aId, bId);
  const hash = hashString(key);
  const canonicalOut = RECIPE_MAP.get(key);

  const genA = generationOf(state, aId);
  const genB = generationOf(state, bId);

  let outId;
  let names;
  let glyph;
  let tier;
  let improvised;
  let mod = null;
  let core = null;
  let gen;

  if (canonicalOut) {
    const el = ELEMENTS[canonicalOut];
    outId = canonicalOut;
    names = { zh: el.zh, en: el.en, ja: el.ja };
    glyph = el.glyph;
    tier = el.tier;
    improvised = false;
    gen = GENERATIONS.has(canonicalOut) ? GENERATIONS.get(canonicalOut) : Math.max(genA, genB) + 1;
  } else {
    const composed = composeImprovised(aId, bId, state, hash);
    outId = composed.id;
    names = composed.names;
    mod = composed.mod;
    core = composed.core;
    improvised = true;
    gen = Math.max(genA, genB) + 1;
    const rng = mulberry32(hash);
    tier = pickTierByWeight(rng, improvisedTierWeights(gen));
    glyph = IMPROVISED_GLYPHS[tier] || '🧪';
  }

  const next = {
    ...state,
    collection: Object.assign(Object.create(null), state.collection),
    recipes: Object.assign(Object.create(null), state.recipes),
    recipeOrder: Object.assign(Object.create(null), state.recipeOrder),
    achievements: Object.assign(Object.create(null), state.achievements),
    stats: {
      ...state.stats,
      tierCounts: { ...state.stats.tierCounts },
    },
    startedAt: state.startedAt || new Date().toISOString(),
  };

  const existing = next.collection[outId];
  const isNew = !existing;
  next.collection[outId] = {
    count: (existing ? existing.count : 0) + 1,
    gen,
    tier,
    improvised,
    names,
    glyph,
    ...(improvised ? { mod, core } : {}),
  };
  next.recipes[key] = outId;
  // 配方键是顺序无关的，但展示时沿用玩家实际放进去的顺序，
  // 否则配方手册里会显示成排序后的顺序，和产物卡对不上
  if (!next.recipeOrder[key]) next.recipeOrder[key] = [aId, bId];

  next.stats.fusions += 1;
  if (isNew) next.stats.discoveries += 1;
  if (improvised) next.stats.improvised += 1;
  next.stats.tierCounts[tier] = (next.stats.tierCounts[tier] || 0) + 1;
  if (gen > next.stats.maxGen) next.stats.maxGen = gen;

  const unlocked = updateAchievements(next);

  return {
    state: next,
    result: {
      id: outId,
      key,
      names,
      glyph,
      tier,
      gen,
      improvised,
      isNew,
      unlocked,
      inputs: [aId, bId],
    },
  };
}

/* ── 每日灵感 ───────────────────────────────────────── */

/**
 * 每日灵感抽取。带保底：连续 DAILY_PITY_LIMIT 次未出传说及以上，下一次必出传说。
 * @param {GameState} state
 * @param {string} dateKey 日期键（YYYY-MM-DD）
 * @returns {{state: GameState, result: object}}
 */
/**
 * @feature F-007 每日灵感抽取与每日上限
 * @feature F-008 每日灵感保底
 */
export function applyDailyDraw(state, dateKey) {
  const next = {
    ...state,
    collection: Object.assign(Object.create(null), state.collection),
    recipes: Object.assign(Object.create(null), state.recipes),
    achievements: Object.assign(Object.create(null), state.achievements),
    stats: { ...state.stats, tierCounts: { ...state.stats.tierCounts } },
    daily: { ...state.daily },
    startedAt: state.startedAt || new Date().toISOString(),
  };

  if (next.daily.date !== dateKey) {
    // 保底计数跨日累计：跨天只清「今日已抽次数」，保底进度必须保留。
    // 每日上限 DAILY_LIMIT(5) 小于保底阈值 DAILY_PITY_LIMIT(12)，
    // 若连同 pity 一起清零，保底就永远触发不了，等于把这条功能做成死代码。
    next.daily = { date: dateKey, draws: 0, pity: next.daily.pity || 0, lastId: null };
  }

  if (next.daily.draws >= DAILY_LIMIT) {
    return { state: next, result: { limited: true, id: next.daily.lastId, tier: null } };
  }

  const rng = mulberry32(hashString(`${dateKey}#daily#${next.daily.draws}`));
  const pityTriggered = next.daily.pity >= DAILY_PITY_LIMIT;
  let tier;
  if (pityTriggered) {
    tier = rng() < 0.25 ? 'ur' : 'ssr';
  } else {
    tier = pickTierByWeight(rng, DAILY_WEIGHTS);
  }

  // 优先抽还没收集到的同档词条
  let candidates = Object.values(ELEMENTS).filter((el) => el.tier === tier);
  const unowned = candidates.filter((el) => !next.collection[el.id]);
  if (unowned.length > 0) candidates = unowned;
  if (candidates.length === 0) {
    candidates = Object.values(ELEMENTS).filter((el) => el.tier === 'n');
  }
  if (candidates.length === 0) {
    return { state: next, result: { limited: true, id: next.daily.lastId, tier: null } };
  }

  const picked = candidates[Math.floor(rng() * candidates.length)];
  const existing = next.collection[picked.id];
  const isNew = !existing;
  next.collection[picked.id] = {
    count: (existing ? existing.count : 0) + 1,
    gen: GENERATIONS.has(picked.id) ? GENERATIONS.get(picked.id) : 0,
    tier: picked.tier,
    improvised: false,
    names: { zh: picked.zh, en: picked.en, ja: picked.ja },
    glyph: picked.glyph,
  };

  next.daily.draws += 1;
  next.daily.lastId = picked.id;
  if (picked.tier === 'ssr' || picked.tier === 'ur') {
    next.daily.pity = 0;
  } else {
    next.daily.pity += 1;
  }

  next.stats.dailyDraws += 1;
  if (isNew) next.stats.discoveries += 1;
  next.stats.tierCounts[picked.tier] = (next.stats.tierCounts[picked.tier] || 0) + 1;

  const unlocked = updateAchievements(next);

  return {
    state: next,
    result: {
      limited: false,
      id: picked.id,
      tier: picked.tier,
      glyph: picked.glyph,
      names: { zh: picked.zh, en: picked.en, ja: picked.ja },
      isNew,
      pity: pityTriggered,
      unlocked,
    },
  };
}

/* ── 成就 ───────────────────────────────────────────── */

/** 成就定义。test 接收状态，返回 boolean。 */
export const ACHIEVEMENTS = [
  { id: 'first_fusion', icon: '⚗️', en: 'First Fusion', zh: '初次熔炼', ja: '初熔錬', test: (s) => s.stats.fusions >= 1 },
  { id: 'novice', icon: '🧪', en: 'Novice', zh: '元素学徒', ja: '元素の徒弟', test: (s) => distinctCount(s) >= 10 },
  { id: 'collector', icon: '🗂️', en: 'Collector', zh: '收藏家', ja: 'コレクター', test: (s) => distinctCount(s) >= 30 },
  { id: 'alchemist', icon: '⚖️', en: 'Alchemist', zh: '炼金术士', ja: '錬金術士', test: (s) => distinctCount(s) >= 60 },
  { id: 'depth3', icon: '🪜', en: 'Tier III', zh: '三层之境', ja: '三層の世界', test: (s) => s.stats.maxGen >= 3 },
  { id: 'depth5', icon: '🏔️', en: 'Tier V', zh: '五层之境', ja: '五層の世界', test: (s) => s.stats.maxGen >= 5 },
  { id: 'improviser', icon: '🎲', en: 'Improviser', zh: '妙手偶得', ja: '妙手偶得', test: (s) => s.stats.improvised >= 1 },
  { id: 'legend', icon: '🌟', en: 'Legend Maker', zh: '传说制造者', ja: '伝説の鋳造者', test: (s) => (s.stats.tierCounts.ssr || 0) + (s.stats.tierCounts.ur || 0) >= 1 },
  { id: 'myth', icon: '🕉️', en: 'Mythic Touch', zh: '神话降临', ja: '神話の降臨', test: (s) => (s.stats.tierCounts.ur || 0) >= 1 },
  { id: 'daily7', icon: '📅', en: 'Daily Devotee', zh: '灵感常客', ja: 'インスピレーション', test: (s) => s.stats.dailyDraws >= 7 },
];

/**
 * 检查并解锁成就，返回本次新解锁的成就列表。
 * @param {GameState} state 会被就地更新的状态对象
 */
/**
 * @feature F-011 成就系统：按进度解锁且只解锁一次
 */
export function updateAchievements(state) {
  const unlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (state.achievements[ach.id]) continue;
    if (ach.test(state)) {
      state.achievements[ach.id] = true;
      unlocked.push(ach);
    }
  }
  return unlocked;
}

/* ── 统计 ───────────────────────────────────────────── */

/** 统计面板数据。 */
/**
 * @feature F-009 图鉴统计口径
 */
export function computeStats(state) {
  return {
    distinct: distinctCount(state),
    total: Object.values(state.collection).reduce((sum, rec) => sum + (rec.count || 0), 0),
    fusions: state.stats.fusions,
    discoveries: state.stats.discoveries,
    improvised: state.stats.improvised,
    dailyDraws: state.stats.dailyDraws,
    maxGen: state.stats.maxGen,
    dailyLeft: Math.max(0, DAILY_LIMIT - state.daily.draws),
    pity: state.daily.pity,
    pityLimit: DAILY_PITY_LIMIT,
    tiers: { ...state.stats.tierCounts },
  };
}

/* ── 存档 ───────────────────────────────────────────── */

/** 把状态安全地序列化。 */
export function serializeState(state) {
  return JSON.stringify({
    version: state.version,
    collection: state.collection,
    recipes: state.recipes,
    recipeOrder: state.recipeOrder,
    achievements: state.achievements,
    stats: state.stats,
    daily: state.daily,
    startedAt: state.startedAt,
  });
}

/**
 * 从存档字符串恢复状态，任何字段异常都回退到安全默认值。
 * @param {string|null} raw
 * @returns {GameState}
 */
/**
 * @feature F-012 本地存档与脏数据回退
 */
export function deserializeState(raw) {
  const base = createState();
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

  const collection = Object.create(null);
  if (parsed.collection && typeof parsed.collection === 'object' && !Array.isArray(parsed.collection)) {
    for (const [id, rawRec] of Object.entries(parsed.collection)) {
      if (!rawRec || typeof rawRec !== 'object') continue;
      const canonical = ELEMENTS[id];
      const improvised = rawRec.improvised === true && !canonical;
      const tier = TIER_IDS.includes(rawRec.tier) ? rawRec.tier : canonical ? canonical.tier : 'n';
      const names =
        rawRec.names && typeof rawRec.names === 'object'
          ? {
              zh: typeof rawRec.names.zh === 'string' ? rawRec.names.zh : '',
              en: typeof rawRec.names.en === 'string' ? rawRec.names.en : '',
              ja: typeof rawRec.names.ja === 'string' ? rawRec.names.ja : '',
            }
          : canonical
            ? { zh: canonical.zh, en: canonical.en, ja: canonical.ja }
            : { zh: id, en: id, ja: id };
      const record = {
        count: Math.max(1, safeInt(rawRec.count)),
        gen: safeInt(rawRec.gen),
        tier,
        improvised,
        names,
        glyph: typeof rawRec.glyph === 'string' && rawRec.glyph ? rawRec.glyph : canonical ? canonical.glyph : '🧪',
      };
      if (improvised && rawRec.mod && rawRec.core && typeof rawRec.mod === 'object' && typeof rawRec.core === 'object') {
        record.mod = {
          zh: typeof rawRec.mod.zh === 'string' ? rawRec.mod.zh : '',
          en: typeof rawRec.mod.en === 'string' ? rawRec.mod.en : '',
          ja: typeof rawRec.mod.ja === 'string' ? rawRec.mod.ja : '',
        };
        record.core = {
          zh: typeof rawRec.core.zh === 'string' ? rawRec.core.zh : '',
          en: typeof rawRec.core.en === 'string' ? rawRec.core.en : '',
          ja: typeof rawRec.core.ja === 'string' ? rawRec.core.ja : '',
        };
      }
      collection[id] = record;
    }
  }

  // 基础元素永远存在，即使存档被裁剪过
  for (const id of BASE_IDS) {
    const el = ELEMENTS[id];
    if (el && !collection[id]) collection[id] = baseRecord(el);
  }

  const recipes = Object.create(null);
  if (parsed.recipes && typeof parsed.recipes === 'object' && !Array.isArray(parsed.recipes)) {
    for (const [key, id] of Object.entries(parsed.recipes)) {
      if (typeof id === 'string' && id) recipes[key] = id;
    }
  }

  const recipeOrder = Object.create(null);
  if (parsed.recipeOrder && typeof parsed.recipeOrder === 'object' && !Array.isArray(parsed.recipeOrder)) {
    for (const [key, order] of Object.entries(parsed.recipeOrder)) {
      if (Array.isArray(order) && order.length === 2 && typeof order[0] === 'string' && typeof order[1] === 'string') {
        recipeOrder[key] = [order[0], order[1]];
      }
    }
  }

  const achievements = Object.create(null);
  if (parsed.achievements && typeof parsed.achievements === 'object' && !Array.isArray(parsed.achievements)) {
    for (const ach of ACHIEVEMENTS) {
      if (parsed.achievements[ach.id] === true) achievements[ach.id] = true;
    }
  }

  const tierCounts = { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 };
  if (parsed.stats && typeof parsed.stats === 'object' && parsed.stats.tierCounts && typeof parsed.stats.tierCounts === 'object') {
    for (const id of TIER_IDS) tierCounts[id] = safeInt(parsed.stats.tierCounts[id]);
  }

  let maxGen = 0;
  for (const rec of Object.values(collection)) {
    if (rec.gen > maxGen) maxGen = rec.gen;
  }

  const dailyRaw = parsed.daily && typeof parsed.daily === 'object' ? parsed.daily : {};

  return {
    version: 1,
    collection,
    recipes,
    recipeOrder,
    achievements,
    stats: {
      fusions: safeInt(parsed.stats && parsed.stats.fusions),
      discoveries: safeInt(parsed.stats && parsed.stats.discoveries),
      improvised: safeInt(parsed.stats && parsed.stats.improvised),
      dailyDraws: safeInt(parsed.stats && parsed.stats.dailyDraws),
      maxGen,
      tierCounts,
    },
    daily: {
      date: typeof dailyRaw.date === 'string' ? dailyRaw.date : '',
      draws: safeInt(dailyRaw.draws),
      pity: safeInt(dailyRaw.pity),
      lastId: typeof dailyRaw.lastId === 'string' ? dailyRaw.lastId : null,
    },
    startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
  };
}
