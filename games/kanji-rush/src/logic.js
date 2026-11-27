/**
 * Kanji Rush — 核心逻辑层（纯函数，无 DOM 依赖，可完整单测）
 *
 * 玩法内核参考「漢字ガチャ」类网页小游戏的通用范式：
 *   1. 每次抽取得到一张字卡，稀有度由该字的「使用频次百分位」决定（越生僻越稀有）
 *   2. 抽卡次数越多，出牌演出越快（tempo 递增），形成「越抽越上头」的节奏
 *   3. 收集图鉴 + 成就系统 + 保底机制（Pity）让长线游玩有目标
 *
 * 本文件为原创实现，不含任何第三方素材或代码。
 */

export const TIER_IDS = ['n', 'r', 'sr', 'ssr', 'ur'];

/** 稀有度配置。freq 为「生僻度百分位」，越大越稀有。 */
export const TIERS = {
  n: { id: 'n', minFreq: 0, weight: 100, label: 'Common', zh: '普通' },
  r: { id: 'r', minFreq: 35, weight: 45, label: 'Rare', zh: '稀有' },
  sr: { id: 'sr', minFreq: 58, weight: 18, label: 'Epic', zh: '史诗' },
  ssr: { id: 'ssr', minFreq: 78, weight: 5, label: 'Legendary', zh: '传说' },
  ur: { id: 'ur', minFreq: 93, weight: 1, label: 'Mythic', zh: '神话' },
};

export const TIER_LIST = TIER_IDS.map((id) => TIERS[id]);

/** 连续 N 次未出传说及以上时触发保底。 */
export const PITY_LIMIT = 60;

/** 演出节奏参数：抽卡越多，自动抽取间隔越短。 */
export const TEMPO = { base: 1400, min: 180, decay: 0.985 };

/**
 * @typedef {Object} GameState
 * @property {number} pulls          总抽取次数
 * @property {number} pity           距离保底还差几次
 * @property {number} pityBreaks     保底触发次数
 * @property {number} combo          当前连击（非普通稀有度连续计数）
 * @property {number} bestCombo      历史最高连击
 * @property {number} surge          传奇后的加速剩余次数
 * @property {Record<string, number>} collection  已收集字 → 数量
 * @property {Record<string, number>} tierCounts 各稀有度抽到次数
 * @property {string[]} log           最近若干次抽取记录
 * @property {Record<string, boolean>} achievements 已解锁成就
 * @property {string|null} startedAt  首次开始时间（ISO）
 */

/**
 * 已知汉字 id 白名单。逻辑层不直接依赖数据层，由数据层在启动时注入。
 * 未注入时退化为「不校验」，但注入后即为严格白名单。
 */
export const KNOWN_KANJI_IDS = new Set();

/**
 * 注入已知汉字 id（供数据层调用）。传入非数组时忽略。
 * @param {Array<{id: string}>} kanjiPool
 */
export function registerKanjiPool(kanjiPool) {
  if (!Array.isArray(kanjiPool)) return;
  for (const k of kanjiPool) {
    if (k && typeof k.id === 'string') KNOWN_KANJI_IDS.add(k.id);
  }
}

/** 创建一个初始对局状态。 */
export function createState() {
  return {
    pulls: 0,
    pity: 0,
    pityBreaks: 0,
    combo: 0,
    bestCombo: 0,
    surge: 0,
    collection: Object.create(null),
    tierCounts: { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 },
    log: [],
    achievements: Object.create(null),
    startedAt: null,
  };
}

/**
 * 按生僻度百分位判定稀有度。
 * @param {{freq: number}} kanji
 * @returns {string} tier id
  *
 * @feature F-001
 */
export function tierOf(kanji) {
  let result = 'n';
  for (const tier of TIER_LIST) {
    if (kanji.freq >= tier.minFreq) result = tier.id;
  }
  return result;
}

/**
 * 从字库中筛出某个稀有度的候选字。
 * @param {Array<{freq: number}>} kanjiPool
 * @param {string} tierId
 */
export function poolFor(kanjiPool, tierId) {
  return kanjiPool.filter((k) => tierOf(k) === tierId);
}

/**
 * 按权重抽取稀有度。
 * @param {() => number} rng 返回 [0,1) 的随机源
 * @returns {string} tier id
  *
 * @feature F-002
 */
export function pickTierByWeight(rng) {
  const total = TIER_LIST.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng() * total;
  for (const tier of TIER_LIST) {
    roll -= tier.weight;
    if (roll < 0) return tier.id;
  }
  return 'n';
}

/**
 * 根据总抽卡数计算自动抽取间隔（毫秒）。单调递减，下限 TEMPO.min。
 * @param {number} pulls
  *
 * @feature F-006
 */
export function tempoDelay(pulls) {
  const safe = Math.max(0, Math.floor(pulls));
  return Math.max(TEMPO.min, Math.round(TEMPO.base * Math.pow(TEMPO.decay, safe)));
}

/**
 * 结合保底、传奇加速等因素，计算当前实际抽取间隔。
 * @param {GameState} state
 */
export function currentDelay(state) {
  const base = tempoDelay(state.pulls);
  return state.surge > 0 ? Math.round(base * 0.8) : base;
}

/**
 * 已收集的不同字数。
 * @param {GameState} state
 */
export function distinctCount(state) {
  return Object.keys(state.collection).length;
}

/**
 * 某个稀有度下已收集的不同字数。
 * @param {GameState} state
 * @param {Array<{freq: number}>} kanjiPool
 * @param {string} tierId
 */
export function distinctInTier(state, kanjiPool, tierId) {
  const pool = poolFor(kanjiPool, tierId);
  return pool.reduce((sum, k) => sum + (state.collection[k.id] ? 1 : 0), 0);
}

/**
 * 执行一次抽取。返回新的 state（不修改入参）与本次抽取结果。
 * @param {GameState} state
 * @param {Array<{id: string, freq: number}>} kanjiPool
 * @param {() => number} rng
 * @returns {{state: GameState, result: object}}
  *
 * @feature F-003
 */
export function applyPull(state, kanjiPool, rng = Math.random) {
  /** @feature F-004 保底：连续未出传说达到阈值时强制传说 */
  const pityTriggered = state.pity >= PITY_LIMIT;
  const tierId = pityTriggered ? 'ssr' : pickTierByWeight(rng);

  const pool = poolFor(kanjiPool, tierId);
  if (pool.length === 0) {
    throw new Error(`no kanji available for tier ${tierId}`);
  }
  const kanji = pool[Math.floor(rng() * pool.length)];

  const next = {
    ...state,
    // collection / achievements 统一使用 null 原型，避免任何键名引发原型污染
    collection: Object.assign(Object.create(null), state.collection),
    tierCounts: { ...state.tierCounts },
    log: state.log.slice(),
    achievements: Object.assign(Object.create(null), state.achievements),
    pulls: state.pulls + 1,
    startedAt: state.startedAt || new Date().toISOString(),
  };

  const isNew = !next.collection[kanji.id];
  next.collection[kanji.id] = (next.collection[kanji.id] || 0) + 1;
  next.tierCounts[tierId] += 1;

  // 连击规则：稀有(r)及以上累加，普通(n)清零。
  // 曾经用「史诗及以上」累计，但 P(r+)≈40.8% vs P(sr+)≈14.2%，
  // 导致「15 连击」达成概率约 1.9e-13 —— 实测 30 万抽最高连击仅 7，该成就是死代码。
  // 改为 r+ 后实测：50 抽→3 连、200 抽→5 连、1000 抽→8 连，形成可达的里程碑阶梯。
  /** @feature F-005 连击：稀有及以上累加，普通清零 */
  const tierRank = TIER_IDS.indexOf(tierId);
  if (tierRank >= 1) {
    next.combo += 1;
    if (next.combo > next.bestCombo) next.bestCombo = next.combo;
  } else {
    next.combo = 0;
  }

  if (tierId === 'ssr' || tierId === 'ur') {
    next.pity = 0;
    next.surge = 5;
  } else {
    next.pity = state.pity + 1;
    next.surge = Math.max(0, state.surge - 1);
  }

  if (pityTriggered) next.pityBreaks = state.pityBreaks + 1;

  next.log.unshift({ kanjiId: kanji.id, tier: tierId, isNew, pity: pityTriggered });
  next.log = next.log.slice(0, 30);

  const unlocked = updateAchievements(next, kanjiPool);

  return {
    state: next,
    result: { kanji, tier: tierId, isNew, pity: pityTriggered, unlocked },
  };
}

/**
 * 成就定义。
 * - `test`      接收状态与字库，返回 boolean，决定是否解锁
 * - `goal`      达成所需的数量（数字，或由字库推出的函数）
 * - `progress`  当前进度（与 goal 同量纲），用于界面显示「7/10」
 * - `desc`      三语达成条件文案，界面上必须显示，玩家才知道怎么解锁
 *
 * ⚠️ 阈值必须**可达**：连击按「稀有及以上」累计，P(r+)≈40.8%，
 * 实测 50 抽→3 连、200 抽→5 连、1000 抽→8 连，因此三档里程碑均可达。
 * （曾用「史诗及以上」+ 15 连，概率约 1.9e-13，玩家永远拿不到。）
 */
export const ACHIEVEMENTS = [
  {
    id: 'first_pull', icon: '🎴', en: 'First Pull', zh: '初次抽取', ja: '初回抽選',
    desc: { zh: '抽取 1 次', en: 'Pull once', ja: '1 回抽選' },
    goal: 1, progress: (s) => s.pulls,
  },
  {
    id: 'collector_10', icon: '🗃️', en: 'Collector', zh: '藏家', ja: 'コレクター',
    desc: { zh: '收集 10 个不同的汉字', en: 'Collect 10 different kanji', ja: '異なる漢字を 10 個収集' },
    goal: 10, progress: (s) => distinctCount(s),
  },
  {
    id: 'common_master', icon: '📚', en: 'Common Master', zh: '常用字通', ja: '常用字精通',
    desc: { zh: '收齐全部普通档汉字', en: 'Collect every Common kanji', ja: 'コモン漢字を全て収集' },
    goal: (pool) => poolFor(pool, 'n').length,
    progress: (s, pool) => distinctInTier(s, pool, 'n'),
  },
  {
    id: 'lucky_hand', icon: '🍀', en: 'Lucky Hand', zh: '欧皇', ja: '幸运',
    desc: { zh: '累计抽到 3 次传说及以上', en: 'Get 3 Legendary+ in total', ja: 'レジェンダリー以上を累計 3 回' },
    goal: 3, progress: (s) => s.tierCounts.ssr + s.tierCounts.ur,
  },
  {
    id: 'mythic_hunter', icon: '🐉', en: 'Mythic Hunter', zh: '神话猎手', ja: 'ミシックハンター',
    desc: { zh: '抽到 1 次神话档', en: 'Get one Mythic kanji', ja: 'ミシックを 1 回獲得' },
    goal: 1, progress: (s) => s.tierCounts.ur,
  },
  {
    id: 'combo_3', icon: '🔥', en: 'Combo 3', zh: '三连击', ja: '3 コンボ',
    desc: { zh: '连续 3 次抽到稀有及以上', en: '3 in a row at Rare+', ja: 'レア以上 3 連続' },
    goal: 3, progress: (s) => s.bestCombo,
  },
  {
    id: 'combo_5', icon: '🔥', en: 'Combo 5', zh: '五连击', ja: '5 コンボ',
    desc: { zh: '连续 5 次抽到稀有及以上', en: '5 in a row at Rare+', ja: 'レア以上 5 連続' },
    goal: 5, progress: (s) => s.bestCombo,
  },
  {
    id: 'combo_8', icon: '🔥', en: 'Combo 8', zh: '八连击', ja: '8 コンボ',
    desc: { zh: '连续 8 次抽到稀有及以上', en: '8 in a row at Rare+', ja: 'レア以上 8 連続' },
    goal: 8, progress: (s) => s.bestCombo,
  },
  {
    id: 'dedicated', icon: '💎', en: 'Dedicated', zh: '百抽达成', ja: '100 回達成',
    desc: { zh: '累计抽取 100 次', en: '100 pulls in total', ja: '累計 100 回抽選' },
    goal: 100, progress: (s) => s.pulls,
  },
  {
    id: 'speed_demon', icon: '⚡', en: 'Speed Demon', zh: '极速档', ja: 'スピードデーモン',
    desc: { zh: '让演出间隔压到极速档', en: 'Push the tempo to its limit', ja: '間隔を最短まで提速' },
    goal: 1, progress: (s) => (tempoDelay(s.pulls) <= Math.round(TEMPO.min * 1.6) ? 1 : 0),
  },
  {
    id: 'pity_breaker', icon: '🎯', en: 'Pity Breaker', zh: '保底突破', ja: '天井突破',
    desc: { zh: '触发 1 次保底', en: 'Trigger the pity once', ja: '天井を 1 回発動' },
    goal: 1, progress: (s) => s.pityBreaks,
  },
];

/**
 * 检查并解锁成就，返回本次新解锁的成就列表。
 * @param {GameState} state 会被就地更新的状态对象
 * @param {Array<{id: string, freq: number}>} kanjiPool
  *
 * @feature F-007
 */
export function updateAchievements(state, kanjiPool) {
  const unlocked = [];
  for (const ach of ACHIEVEMENTS) {
    if (state.achievements[ach.id]) continue;
    if (achievementReached(ach, state, kanjiPool)) {
      state.achievements[ach.id] = true;
      unlocked.push(ach);
    }
  }
  return unlocked;
}

/**
 * 某个成就是否达成。判定统一走 progress/goal，避免 test 与展示口径不一致。
 * @param {typeof ACHIEVEMENTS[number]} ach
 * @param {GameState} state
 * @param {Array<{id: string, freq: number}>} kanjiPool
 */
export function achievementReached(ach, state, kanjiPool) {
  return achievementProgress(ach, state, kanjiPool).cur >= achievementGoal(ach, kanjiPool);
}

/**
 * 成就目标数量。
 * @param {typeof ACHIEVEMENTS[number]} ach
 * @param {Array<{id: string, freq: number}>} kanjiPool
 */
export function achievementGoal(ach, kanjiPool) {
  return typeof ach.goal === 'function' ? ach.goal(kanjiPool) : ach.goal;
}

/**
 * 成就当前进度（界面显示「7/10」用）。
 * @param {typeof ACHIEVEMENTS[number]} ach
 * @param {GameState} state
 * @param {Array<{id: string, freq: number}>} kanjiPool
 */
export function achievementProgress(ach, state, kanjiPool) {
  const cur = Math.max(0, Math.min(ach.progress(state, kanjiPool), achievementGoal(ach, kanjiPool)));
  return { cur, max: achievementGoal(ach, kanjiPool) };
}

/**
 * 统计面板数据。
 * @param {GameState} state
 */
export function computeStats(state) {
  return {
    pulls: state.pulls,
    distinct: distinctCount(state),
    pity: state.pity,
    pityLimit: PITY_LIMIT,
    combo: state.combo,
    bestCombo: state.bestCombo,
    delay: currentDelay(state),
    tiers: { ...state.tierCounts },
  };
}

/**
 * 把状态安全地序列化到 localStorage。遇到脏数据不会抛异常。
 * @param {GameState} state
  *
 * @feature F-008
 */
export function serializeState(state) {
  return JSON.stringify({
    pulls: state.pulls,
    pity: state.pity,
    pityBreaks: state.pityBreaks,
    combo: state.combo,
    bestCombo: state.bestCombo,
    surge: state.surge,
    collection: state.collection,
    tierCounts: state.tierCounts,
    achievements: state.achievements,
    log: state.log.slice(0, 30),
    startedAt: state.startedAt,
  });
}

/**
 * 从 localStorage 字符串恢复状态，任何字段异常都会回退到默认值。
 * @param {string|null} raw
 * @returns {GameState}
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
  if (!parsed || typeof parsed !== 'object') return base;

  const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  // 收藏只接受真实存在的汉字 id，避免伪造 id 解锁「藏家」等成就
  const collection = Object.create(null);
  if (parsed.collection && typeof parsed.collection === 'object') {
    for (const [k, v] of Object.entries(parsed.collection)) {
      // 白名单未注册时（逻辑层单独使用）不做过滤，避免误清空玩家进度
      if (KNOWN_KANJI_IDS.size > 0 && !KNOWN_KANJI_IDS.has(k)) continue;
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) collection[k] = Math.floor(v);
    }
  }
  const tierCounts = { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 };
  if (parsed.tierCounts && typeof parsed.tierCounts === 'object') {
    for (const id of TIER_IDS) tierCounts[id] = num(parsed.tierCounts[id]);
  }
  const achievements = Object.create(null);
  if (parsed.achievements && typeof parsed.achievements === 'object') {
    for (const ach of ACHIEVEMENTS) {
      if (parsed.achievements[ach.id] === true) achievements[ach.id] = true;
    }
  }

  // 最近抽取日志：只保留结构合法且 kanjiId 真实存在的记录
  const log = [];
  if (Array.isArray(parsed.log)) {
    for (const entry of parsed.log) {
      if (!entry || typeof entry !== 'object') continue;
      if (KNOWN_KANJI_IDS.size > 0 && !KNOWN_KANJI_IDS.has(entry.kanjiId)) continue;
      if (!TIER_IDS.includes(entry.tier)) continue;
      log.push({
        kanjiId: entry.kanjiId,
        tier: entry.tier,
        isNew: entry.isNew === true,
        pity: entry.pity === true,
      });
      if (log.length >= 30) break;
    }
  }

  return {
    pulls: Math.max(0, Math.floor(num(parsed.pulls))),
    pity: Math.max(0, Math.floor(num(parsed.pity))),
    pityBreaks: Math.max(0, Math.floor(num(parsed.pityBreaks))),
    combo: Math.max(0, Math.floor(num(parsed.combo))),
    bestCombo: Math.max(0, Math.floor(num(parsed.bestCombo))),
    surge: Math.max(0, Math.floor(num(parsed.surge))),
    collection,
    tierCounts,
    achievements,
    log,
    startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
  };
}
