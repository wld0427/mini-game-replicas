/**
 * 渔汛录 Angler's Almanac — 核心逻辑层（纯函数，无 DOM 依赖，可完整单测）
 *
 * 玩法内核：
 *   1. 抛竿 → 等待咬钩 → 在起竿窗口内点中（时机）→ 遛鱼（收放线时机）→ 上鱼
 *   2. 每个水层有自己的鱼种池；饵等级决定能钓到多深，钓到越深越稀有也越难钓
 *   3. 图鉴记录鱼种、条数与最大个体；铜钱投入装备，形成「越钓越深」的增量循环
 *   4. 保底：连续 N 次没钓到当前水层最强的一档，下一竿必出那一档
 *
 * 本文件为原创实现，不含任何第三方素材或代码。
 */

import {
  PITY_LIMIT,
  SPECIES,
  SPECIES_BY_ID,
  TIERS,
  TIER_IDS,
  UPGRADES,
  UPGRADE_IDS,
} from '../assets/data.js';

export { PITY_LIMIT, SPECIES, SPECIES_BY_ID, TIERS, TIER_IDS, UPGRADES, UPGRADE_IDS };

/* ── 调参 ─────────────────────────────────────────── */

/** 抛竿后的等待时长（毫秒）区间基准。 */
export const BITE_DELAY = { base: 1000, spread: 900, perBait: 90, min: 420 };

/** 起竿窗口（毫秒）：卷线器加宽，水越深越窄。 */
export const HOOK_WINDOW = { base: 1350, perReel: 130, perBait: 70, min: 480 };

/** 遛鱼：好时机收线 / 坏时机收线的拉力变化、被动拉力、点击冷却。 */
export const REEL = {
  startTension: 60,
  maxTension: 100,
  good: 12,
  bad: 14,
  drift: 3.5,
  cooldown: 0.22,
};

/**
 * 张力分区阈值。**表现层的配色、轨道色带、文案全部读这里**，
 * 避免「填充条一套颜色、轨道另一套颜色」互相打架。
 *
 * - safe   张力低，鱼在往回游 —— 绿色
 * - warn   张力偏高，还能救 —— 琥珀色
 * - danger 张力逼近断裂（REEL.maxTension = 100）—— 红色
 */
export const TENSION_ZONE = { safe: 55, warn: 80 };

/**
 * 当前张力属于哪个分区。
 * @param {number} tension
 * @returns {'safe'|'warn'|'danger'}
 */
/** @feature F-015 张力分区口径 */
export function tensionZone(tension) {
  if (tension >= TENSION_ZONE.warn) return 'danger';
  if (tension >= TENSION_ZONE.safe) return 'warn';
  return 'safe';
}

/** 各稀有度在遛鱼阶段的难度：甜区宽度与鱼挣扎频率。 */
export const REEL_PROFILE = {
  n: { width: 0.30, freq: 0.8 },
  r: { width: 0.26, freq: 0.9 },
  sr: { width: 0.22, freq: 1.0 },
  ssr: { width: 0.19, freq: 1.05 },
  ur: { width: 0.17, freq: 1.1 },
};

/** 幸运（鱼竿等级）对稀有度权重的修正系数。 */
/**
 * 幸运系数。**必须覆盖文案承诺的每一个档位**：
 * 文案说「稀有档更容易上钩」，所以 r 档必须有系数 —— 之前漏了 r，
 * 玩家按文案理解会落空（文案已同步改为「稀有及以上」）。
 */
export const LUCK = { common: 0.28, rare: 0.24, epic: 0.22, legend: 0.5, mythic: 0.6 };

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

/* ── 状态 ───────────────────────────────────────────── */

/**
 * @typedef {Object} GameState
 * @property {number} version
 * @property {number} coins          铜钱
 * @property {number} totalEarned    累计收入
 * @property {Record<string, number>} upgrades 装备等级
 * @property {Record<string, object>} dex    图鉴：鱼种 id → 记录
 * @property {Record<string, boolean>} achievements 已解锁成就
 * @property {object} stats
 * @property {number} pity           连续未钓到当前水层最强档的次数
 * @property {string|null} startedAt
 */

/** 创建初始状态。 */
export function createState() {
  return {
    version: 1,
    coins: 0,
    totalEarned: 0,
    upgrades: { rod: 0, reel: 0, bait: 0, basket: 0 },
    dex: Object.create(null),
    achievements: Object.create(null),
    stats: {
      casts: 0,
      catches: 0,
      misses: 0,
      escapes: 0,
      bestCm: 0,
      tierCounts: { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 },
    },
    pity: 0,
    startedAt: null,
  };
}

/* ── 装备效果 ─────────────────────────────────────── */

/** 当前水层深度（= 饵等级）。 */
/** @feature F-011 水层解锁 */
export function depthOf(state) {
  return state.upgrades.bait;
}

/** 幸运值（= 鱼竿等级）。 */
export function luckOf(state) {
  return state.upgrades.rod;
}

/** 当前解锁的最强稀有度档位。 */
export function deepestTier(state) {
  const depth = depthOf(state);
  let best = 'n';
  for (const id of TIER_IDS) {
    if (TIERS[id].depth <= depth) best = id;
  }
  return best;
}

/** 该档位在当前装备下是否可钓。 */
export function tierUnlocked(state, tierId) {
  return TIERS[tierId].depth <= depthOf(state);
}

/** 稀有度排名（越大越稀有）。 */
export function tierRank(tierId) {
  return TIER_IDS.indexOf(tierId);
}

/**
 * 当前可钓的鱼种池。
 * @param {GameState} state
 */
export function availableSpecies(state) {
  return SPECIES.filter((sp) => tierUnlocked(state, sp.tier));
}

/**
 * 稀有度权重：基础权重 × 幸运修正；未解锁档位的权重并入当前最强档。
 * @param {GameState} state
 * @returns {Record<string, number>}
 */
/** @feature F-008 稀有度权重与幸运 */
export function rarityWeights(state) {
  const luck = luckOf(state);
  const depth = depthOf(state);
  const weights = {};
  let locked = 0;

  for (const id of TIER_IDS) {
    const base = TIERS[id].weight;
    if (TIERS[id].depth > depth) {
      locked += base;
      continue;
    }
    weights[id] = base;
  }

  if (weights.n) weights.n *= 1 / (1 + LUCK.common * luck);
  if (weights.r) weights.r *= 1 + LUCK.rare * luck;
  if (weights.sr) weights.sr *= 1 + LUCK.epic * luck;
  if (weights.ssr) weights.ssr *= 1 + LUCK.legend * luck;
  if (weights.ur) weights.ur *= 1 + LUCK.mythic * luck;

  const deepest = deepestTier(state);
  if (locked > 0) weights[deepest] = (weights[deepest] || 0) + locked;

  return weights;
}

/**
 * 按权重挑选稀有度。
 * @param {() => number} rng
 * @param {Record<string, number>} weights
 * @returns {string} tier id
 */
export function pickTierByWeight(rng, weights) {
  let total = 0;
  for (const id of TIER_IDS) total += weights[id] || 0;
  if (total <= 0) return 'n';
  let roll = rng() * total;
  for (const id of TIER_IDS) {
    roll -= weights[id] || 0;
    if (roll < 0) return id;
  }
  return 'n';
}

/**
 * 从某个档位里挑一个鱼种（同档位内等概率）。
 * @param {GameState} state
 * @param {string} tierId
 * @param {() => number} rng
 */
export function pickSpecies(state, tierId, rng) {
  const pool = availableSpecies(state).filter((sp) => sp.tier === tierId);
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * 摇体长：偏向小个体，大个体稀有。
 * @param {{minCm: number, maxCm: number}} species
 * @param {() => number} rng
 */
export function rollSize(species, rng) {
  const span = Math.max(1, species.maxCm - species.minCm);
  const u = rng();
  return Math.round((species.minCm + span * Math.pow(u, 1.8)) * 10) / 10;
}

/**
 * 某条鱼是否算「大个体」。
 * @param {{minCm: number, maxCm: number}} species
 * @param {number} cm
 */
export function isBigCatch(species, cm) {
  const span = Math.max(1, species.maxCm - species.minCm);
  return cm >= species.minCm + span * 0.85;
}

/**
 * 售价：基础价值 × 体型系数 × 鱼篓加成。
 * @param {GameState} state
 * @param {object} species
 * @param {number} cm
 */
export function catchValue(state, species, cm) {
  const span = Math.max(1, species.maxCm - species.minCm);
  const sizeFactor = 0.7 + 0.6 * ((cm - species.minCm) / span);
  const basket = 1 + 0.22 * state.upgrades.basket;
  return Math.max(1, Math.round(species.value * sizeFactor * basket));
}

/* ── 抛竿 / 起竿 / 遛鱼 ───────────────────────────── */

/**
 * 抛竿。返回等待时长与起竿窗口（毫秒）。
 * @param {GameState} state
 * @param {() => number} rng
 * @returns {{state: GameState, biteDelay: number, hookWindow: number}}
 */
/** @feature F-001 抛竿与咬钩等待 */
export function applyCast(state, rng) {
  const next = {
    ...state,
    upgrades: { ...state.upgrades },
    dex: Object.assign(Object.create(null), state.dex),
    achievements: Object.assign(Object.create(null), state.achievements),
    stats: { ...state.stats, tierCounts: { ...state.stats.tierCounts } },
    startedAt: state.startedAt || new Date().toISOString(),
  };
  next.stats.casts += 1;

  const raw = BITE_DELAY.base + rng() * BITE_DELAY.spread - BITE_DELAY.perBait * depthOf(state);
  const biteDelay = Math.round(Math.max(BITE_DELAY.min, raw));

  return { state: next, biteDelay, hookWindow: hookWindow(state) };
}

/**
 * 起竿窗口是否仍在有效期内。
 *
 * ⚠️ 这一条是玩法的核心：**窗口一过，鱼就跑了**。
 * 之前的实现里 `onHookTimeout` 从未被调用，倒计时只写进文字不参与判定，
 * 于是「抢时机」这个核心玩法被架空 —— 迟到 7.5 秒仍能起竿成功。
 * 现在表现层用本函数做兜底判定，逻辑层提供唯一口径。
 *
 * @param {number} deadline 起竿截止时刻（performance.now() 口径，毫秒）
 * @param {number} now 当前时刻（同一口径）
 */
/** @feature F-002 起竿窗口与超时判负 */
export function hookWindowOpen(deadline, now) {
  return now <= deadline;
}

/**
 * 当前起竿窗口（毫秒）。
 * @param {GameState} state
 */
export function hookWindow(state) {
  const raw =
    HOOK_WINDOW.base + HOOK_WINDOW.perReel * state.upgrades.reel - HOOK_WINDOW.perBait * depthOf(state);
  return Math.round(Math.max(HOOK_WINDOW.min, raw));
}

/**
 * 摇一条即将上钩的鱼（纯计算，不修改状态）。
 * 保底生效时直接给出当前水层最强的一档。
 * @param {GameState} state
 * @param {() => number} rng
 * @returns {{species: object, tier: string, cm: number, value: number, pityTriggered: boolean}}
 */
/** @feature F-009 保底机制 */
export function rollCatch(state, rng) {
  const target = deepestTier(state);
  const pityTriggered = state.pity >= PITY_LIMIT;
  const tier = pityTriggered ? target : pickTierByWeight(rng, rarityWeights(state));
  const species = pickSpecies(state, tier, rng);
  if (!species) {
    const fallback = availableSpecies(state);
    const chosen = fallback[Math.floor(rng() * fallback.length)] || SPECIES[0];
    const cm = rollSize(chosen, rng);
    return { species: chosen, tier: chosen.tier, cm, value: catchValue(state, chosen, cm), pityTriggered };
  }
  const cm = rollSize(species, rng);
  return { species, tier: species.tier, cm, value: catchValue(state, species, cm), pityTriggered };
}

/**
 * 鱼跑了（错过起竿窗口或遛鱼断线）。
 * @param {GameState} state
 * @param {'miss'|'escape'} kind
 */
/** @feature F-006 失败结算 */
export function applyLoss(state, kind) {
  const next = {
    ...state,
    upgrades: { ...state.upgrades },
    dex: Object.assign(Object.create(null), state.dex),
    achievements: Object.assign(Object.create(null), state.achievements),
    stats: { ...state.stats, tierCounts: { ...state.stats.tierCounts } },
  };
  if (kind === 'miss') next.stats.misses += 1;
  else next.stats.escapes += 1;
  return next;
}

/**
 * 开始遛鱼。
 * @param {object} species
 * @param {() => number} rng
 */
/** @feature F-003 起竿进入遛鱼 */
export function startReel(species, rng) {
  const profile = REEL_PROFILE[species.tier] || REEL_PROFILE.n;
  return {
    tier: species.tier,
    elapsed: 0,
    freq: profile.freq,
    phase: rng(),
    sweetCenter: 0.5,
    sweetWidth: profile.width,
    tension: REEL.startTension,
    cooldown: 0,
    pulls: 0,
    good: 0,
    lastHit: null,
    landed: false,
    snapped: false,
  };
}

/** 三角波，周期 1，值域 [-1, 1]。 */
function triangle(t) {
  const x = t - Math.floor(t);
  return x < 0.5 ? x * 4 - 1 : 3 - x * 4;
}

/**
 * 遛鱼时鱼挣扎标记的位置（0–1）。
 * @param {object} reel
 */
export function reelMarker(reel) {
  return 0.5 + 0.44 * triangle(reel.elapsed * reel.freq + reel.phase);
}

/**
 * 标记位置与运动方向。
 * @param {object} reel
 */
export function reelMarkerInfo(reel) {
  const t = reel.elapsed * reel.freq + reel.phase;
  const x = t - Math.floor(t);
  return { value: reelMarker(reel), dir: x < 0.5 ? 1 : -1 };
}

/**
 * 推进一帧遛鱼。
 * @param {object} reel
 * @param {boolean} input 本帧是否点击收线
 * @param {number} dt 秒
 * @returns {object} 新的 reel 状态
 */
/** @feature F-004 遛鱼甜区判定与张力 */
export function stepReel(reel, input, dt) {
  const next = { ...reel, elapsed: reel.elapsed + dt };
  next.cooldown = Math.max(0, reel.cooldown - dt);
  next.tension += REEL.drift * dt;

  if (input && next.cooldown <= 0) {
    const marker = reelMarker(next);
    const inZone = Math.abs(marker - next.sweetCenter) <= next.sweetWidth / 2;
    next.cooldown = REEL.cooldown;
    next.pulls += 1;
    // 记录本次点击的判定结果，表现层据此给命中/失误反馈
    next.lastHit = inZone ? 'good' : 'miss';
    if (inZone) {
      next.tension -= REEL.good;
      next.good += 1;
    } else {
      next.tension += REEL.bad;
    }
  }

  next.tension = Math.max(-60, Math.min(REEL.maxTension, next.tension));
  if (next.tension >= REEL.maxTension) next.snapped = true;
  if (next.tension <= 0) next.landed = true;
  return next;
}

/* ── 上鱼 ─────────────────────────────────────────── */

/**
 * 记录一条上钩的鱼：进图鉴、给铜钱、推进保底与成就。
 * @param {GameState} state
 * @param {object} species
 * @param {number} cm
 * @param {number} value
 * @returns {{state: GameState, result: object}}
 */
/** @feature F-006 上钩结算 F-007 鱼种图鉴 */
export function landCatch(state, species, cm, value) {
  const next = {
    ...state,
    coins: state.coins + value,
    totalEarned: state.totalEarned + value,
    upgrades: { ...state.upgrades },
    dex: Object.assign(Object.create(null), state.dex),
    achievements: Object.assign(Object.create(null), state.achievements),
    stats: { ...state.stats, tierCounts: { ...state.stats.tierCounts } },
    startedAt: state.startedAt || new Date().toISOString(),
  };

  const record = next.dex[species.id];
  const isNew = !record;
  const bestCm = record ? Math.max(record.bestCm, cm) : cm;
  next.dex[species.id] = {
    count: (record ? record.count : 0) + 1,
    bestCm,
    totalCm: Math.round(((record ? record.totalCm : 0) + cm) * 10) / 10,
    firstAt: record ? record.firstAt : new Date().toISOString(),
  };

  next.stats.catches += 1;
  next.stats.tierCounts[species.tier] = (next.stats.tierCounts[species.tier] || 0) + 1;
  if (cm > next.stats.bestCm) next.stats.bestCm = cm;

  // 保底：没钓到当前水层最强档就累计，钓到就清零
  if (tierRank(species.tier) < tierRank(deepestTier(next))) next.pity += 1;
  else next.pity = 0;

  const unlocked = updateAchievements(next);

  return {
    state: next,
    result: { species, cm, value, isNew, isBig: isBigCatch(species, cm), unlocked, tier: species.tier },
  };
}

/* ── 装备 ─────────────────────────────────────────── */

/**
 * 某项装备升到下一级的价格。
 * @param {string} kind
 * @param {number} level 当前等级
 */
export function upgradeCost(kind, level) {
  const def = UPGRADES[kind];
  if (!def) return Infinity;
  return Math.round(def.base * Math.pow(def.growth, level));
}

/**
 * 升级一件装备。铜钱不足或已满级时返回 null。
 * @param {GameState} state
 * @param {string} kind
 * @returns {{state: GameState, result: object}|null}
 */
/** @feature F-010 装备升级 */
export function applyUpgrade(state, kind) {
  const def = UPGRADES[kind];
  if (!def) return null;
  const level = state.upgrades[kind] || 0;
  if (level >= def.max) return null;
  const cost = upgradeCost(kind, level);
  if (state.coins < cost) return null;

  const next = {
    ...state,
    coins: state.coins - cost,
    upgrades: { ...state.upgrades, [kind]: level + 1 },
    dex: Object.assign(Object.create(null), state.dex),
    achievements: Object.assign(Object.create(null), state.achievements),
    stats: { ...state.stats, tierCounts: { ...state.stats.tierCounts } },
  };
  // 保底的目标档位变了（换水层）就重新计数，避免「升级即白嫖保底」
  if (tierRank(deepestTier(next)) !== tierRank(deepestTier(state))) next.pity = 0;
  const unlocked = updateAchievements(next);
  return { state: next, result: { kind, level: level + 1, cost, unlocked } };
}

/** 全部装备等级之和。 */
export function totalUpgradeLevels(state) {
  return UPGRADE_IDS.reduce((sum, id) => sum + (state.upgrades[id] || 0), 0);
}

/* ── 成就 ─────────────────────────────────────────── */

/** 成就定义。test 接收状态，返回 boolean。 */
export const ACHIEVEMENTS = [
  { id: 'first_catch', icon: '🎣', en: 'First Catch', zh: '初次上钩', ja: '初釣り', test: (s) => s.stats.catches >= 1 },
  { id: 'species_10', icon: '📒', en: 'Ten Species', zh: '十种鱼', ja: '10種', test: (s) => distinctCount(s) >= 10 },
  { id: 'species_25', icon: '📔', en: 'Twenty-Five Species', zh: '廿五种鱼', ja: '25種', test: (s) => distinctCount(s) >= 25 },
  { id: 'species_all', icon: '🏆', en: 'Complete Almanac', zh: '集齐全谱', ja: '全魚種制覇', test: (s) => distinctCount(s) >= SPECIES.length },
  { id: 'rare', icon: '💠', en: 'Rare Finder', zh: '稀有猎手', ja: 'レアハンター', test: (s) => (s.stats.tierCounts.r || 0) >= 1 },
  { id: 'epic', icon: '🔮', en: 'Epic Sighting', zh: '史诗现身', ja: 'エピック出現', test: (s) => (s.stats.tierCounts.sr || 0) >= 1 },
  { id: 'legend', icon: '🌟', en: 'Legendary Haul', zh: '传说之鱼', ja: '伝説の魚', test: (s) => (s.stats.tierCounts.ssr || 0) >= 1 },
  { id: 'myth', icon: '🕉️', en: 'Mythic Touch', zh: '神话降临', ja: '神話の降臨', test: (s) => (s.stats.tierCounts.ur || 0) >= 1 },
  { id: 'big', icon: '📏', en: 'Big One', zh: '大个体', ja: '大物', test: (s) => (s.stats.bestCm || 0) > 0 && hasBigCatch(s) },
  { id: 'gear', icon: '🎣', en: 'Well Equipped', zh: '装备精良', ja: '装備整備', test: (s) => totalUpgradeLevels(s) >= 8 },
];

/** 是否钓到过大个体。 */
export function hasBigCatch(state) {
  for (const id of Object.keys(state.dex)) {
    const species = SPECIES_BY_ID[id];
    const record = state.dex[id];
    if (species && record && isBigCatch(species, record.bestCm)) return true;
  }
  return false;
}

/**
 * 检查并解锁成就，返回本次新解锁的成就列表。
 * @param {GameState} state 会被就地更新的状态对象
 */
/** @feature F-012 成就系统 */
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

/* ── 统计 ─────────────────────────────────────────── */

/** 已收录的不同鱼种数。 */
export function distinctCount(state) {
  return Object.keys(state.dex).length;
}

/** 统计面板数据。 */
/** @feature F-016 统计面板数据 */
export function computeStats(state) {
  return {
    coins: state.coins,
    totalEarned: state.totalEarned,
    distinct: distinctCount(state),
    totalSpecies: SPECIES.length,
    catches: state.stats.catches,
    casts: state.stats.casts,
    misses: state.stats.misses,
    escapes: state.stats.escapes,
    bestCm: state.stats.bestCm,
    depth: depthOf(state),
    luck: luckOf(state),
    hookWindow: hookWindow(state),
    pity: state.pity,
    pityLimit: PITY_LIMIT,
    pityTarget: deepestTier(state),
    pityArmed: tierRank(deepestTier(state)) > 0,
    upgrades: { ...state.upgrades },
  };
}

/* ── 存档 ─────────────────────────────────────────── */

/** 把状态安全地序列化。 */
/** @feature F-013 本地存档 */
export function serializeState(state) {
  return JSON.stringify({
    version: state.version,
    coins: state.coins,
    totalEarned: state.totalEarned,
    upgrades: state.upgrades,
    dex: state.dex,
    achievements: state.achievements,
    stats: state.stats,
    pity: state.pity,
    startedAt: state.startedAt,
  });
}

/**
 * 从存档字符串恢复状态，任何字段异常都回退到安全默认值。
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
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;

  const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const safeInt = (v) => Math.max(0, Math.floor(num(v)));

  const upgrades = { rod: 0, reel: 0, bait: 0, basket: 0 };
  if (parsed.upgrades && typeof parsed.upgrades === 'object' && !Array.isArray(parsed.upgrades)) {
    for (const id of UPGRADE_IDS) {
      upgrades[id] = Math.min(UPGRADES[id].max, safeInt(parsed.upgrades[id]));
    }
  }

  const dex = Object.create(null);
  if (parsed.dex && typeof parsed.dex === 'object' && !Array.isArray(parsed.dex)) {
    for (const [id, rawRec] of Object.entries(parsed.dex)) {
      const species = SPECIES_BY_ID[id];
      if (!species || !rawRec || typeof rawRec !== 'object') continue;
      const count = Math.max(1, safeInt(rawRec.count));
      const bestCm = Math.max(species.minCm, num(rawRec.bestCm, species.minCm));
      dex[id] = {
        count,
        bestCm,
        totalCm: Math.max(bestCm, num(rawRec.totalCm, bestCm)),
        firstAt: typeof rawRec.firstAt === 'string' ? rawRec.firstAt : null,
      };
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

  let bestCm = 0;
  for (const rec of Object.values(dex)) {
    if (rec.bestCm > bestCm) bestCm = rec.bestCm;
  }

  return {
    version: 1,
    coins: safeInt(parsed.coins),
    totalEarned: safeInt(parsed.totalEarned),
    upgrades,
    dex,
    achievements,
    stats: {
      casts: safeInt(parsed.stats && parsed.stats.casts),
      catches: safeInt(parsed.stats && parsed.stats.catches),
      misses: safeInt(parsed.stats && parsed.stats.misses),
      escapes: safeInt(parsed.stats && parsed.stats.escapes),
      bestCm,
      tierCounts,
    },
    pity: safeInt(parsed.pity),
    startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
  };
}
