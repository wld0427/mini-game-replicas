import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PITY_LIMIT,
  SPECIES,
  SPECIES_BY_ID,
  TIERS,
  TIER_IDS,
  UPGRADES,
  UPGRADE_IDS,
} from '../assets/data.js';
import {
  ACHIEVEMENTS,
  REEL,
  REEL_PROFILE,
  applyCast,
  applyLoss,
  applyUpgrade,
  availableSpecies,
  catchValue,
  computeStats,
  createState,
  deepestTier,
  deserializeState,
  distinctCount,
  hasBigCatch,
  hookWindow,
  isBigCatch,
  landCatch,
  mulberry32,
  pickTierByWeight,
  rarityWeights,
  reelMarker,
  reelMarkerInfo,
  rollCatch,
  rollSize,
  serializeState,
  startReel,
  stepReel,
  tierRank,
  tierUnlocked,
  totalUpgradeLevels,
  upgradeCost,
  updateAchievements,
} from '../src/logic.js';

/** 造一个带装备等级的初始状态。 */
function stateWith(upgrades = {}) {
  const state = createState();
  Object.assign(state.upgrades, upgrades);
  return state;
}

/** 模拟「会玩」的玩家：标记进入甜区才收线。 */
function playReel(species, seed, mode = 'sharp') {
  const rng = mulberry32(seed);
  let reel = startReel(species, rng);
  const dt = 1 / 60;
  let frames = 0;
  while (!reel.landed && !reel.snapped && frames < 60 * 40) {
    const marker = reelMarkerInfo(reel);
    const inZone = Math.abs(marker.value - reel.sweetCenter) <= reel.sweetWidth / 2;
    let input = false;
    if (mode === 'sharp') input = inZone;
    else if (mode === 'ok') input = inZone && rng() < 0.7;
    else input = true;
    reel = stepReel(reel, input, dt);
    frames += 1;
  }
  return reel;
}

/* ── 数据完整性 ───────────────────────────────────── */

test('鱼种数据完整且 id 唯一', () => {
  const ids = SPECIES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, '鱼种 id 必须唯一');
  assert.ok(SPECIES.length >= 40, `鱼种过少: ${SPECIES.length}`);
  for (const sp of SPECIES) {
    assert.ok(TIER_IDS.includes(sp.tier), `${sp.id} 稀有度非法`);
    assert.ok(sp.minCm > 0 && sp.maxCm > sp.minCm, `${sp.id} 体长区间非法`);
    assert.ok(sp.value > 0, `${sp.id} 售价非法`);
    assert.ok(sp.zh && sp.en && sp.ja, `${sp.id} 缺少三语名称`);
    assert.ok(Number.isFinite(sp.hue) && sp.hue >= 0 && sp.hue <= 360, `${sp.id} 色相非法`);
  }
});

test('五个稀有度档位都有鱼种', () => {
  for (const id of TIER_IDS) {
    const count = SPECIES.filter((s) => s.tier === id).length;
    assert.ok(count > 0, `${id} 档没有鱼种`);
  }
});

/* ── 水层与鱼种池 ─────────────────────────────────── */

test('鱼种池随饵等级扩大', () => {
  let previous = 0;
  for (let bait = 0; bait <= 4; bait += 1) {
    const state = stateWith({ bait });
    const count = availableSpecies(state).length;
    assert.ok(count > previous, `饵 Lv.${bait} 的鱼种池没有变大`);
    previous = count;
  }
});

test('最深档位随饵等级推进', () => {
  assert.equal(deepestTier(stateWith({ bait: 0 })), 'n');
  assert.equal(deepestTier(stateWith({ bait: 1 })), 'r');
  assert.equal(deepestTier(stateWith({ bait: 2 })), 'sr');
  assert.equal(deepestTier(stateWith({ bait: 3 })), 'ssr');
  assert.equal(deepestTier(stateWith({ bait: 4 })), 'ur');
});

test('未解锁档位不可钓', () => {
  const state = stateWith({ bait: 0 });
  assert.equal(tierUnlocked(state, 'n'), true);
  assert.equal(tierUnlocked(state, 'r'), false);
  assert.equal(tierUnlocked(state, 'ur'), false);
  assert.equal(availableSpecies(state).every((sp) => sp.tier === 'n'), true);
});

/* ── 稀有度权重 ───────────────────────────────────── */

test('未解锁档位的权重并入当前最深档', () => {
  const weights = rarityWeights(stateWith({ bait: 0 }));
  const total = Object.values(weights).reduce((sum, v) => sum + v, 0);
  assert.equal(total, 100, '总权重应保持不变');
  assert.equal(weights.n, 100);
  assert.equal(weights.r, undefined);
});

test('鱼竿等级把权重推向稀有档', () => {
  const plain = rarityWeights(stateWith({ bait: 4, rod: 0 }));
  const lucky = rarityWeights(stateWith({ bait: 4, rod: 8 }));
  assert.ok(lucky.ssr > plain.ssr, '传说档权重应随幸运上升');
  assert.ok(lucky.ur > plain.ur, '神话档权重应随幸运上升');
  assert.ok(lucky.n < plain.n, '普通档权重应随幸运下降');
});

test('按权重抽取的稀有度分布与设定一致', () => {
  const state = stateWith({ bait: 4, rod: 0 });
  const weights = rarityWeights(state);
  const rng = mulberry32(20261125);
  const counts = { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 };
  const total = 40000;
  for (let i = 0; i < total; i += 1) counts[pickTierByWeight(rng, weights)] += 1;
  for (const id of ['n', 'r', 'sr']) {
    const expected = (weights[id] / 100) * total;
    assert.ok(
      Math.abs(counts[id] - expected) < expected * 0.06,
      `${id} 分布偏差过大: ${counts[id]} vs ${expected}`,
    );
  }
  assert.ok(counts.ur / total > 0.002 && counts.ur / total < 0.015, `神话档比例异常: ${counts.ur / total}`);
});

test('实际开竿抽到的稀有度分布与权重一致', () => {
  const state = stateWith({ bait: 4 });
  const rng = mulberry32(777);
  const counts = { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 };
  for (let i = 0; i < 20000; i += 1) counts[rollCatch(state, rng).tier] += 1;
  assert.ok(counts.n / 20000 > 0.5, '普通档应占多数');
  assert.ok(counts.ssr / 20000 > 0.005, '应能钓到传说鱼');
});

/* ── 保底 ─────────────────────────────────────────── */

test('保底触发时必出当前最深档', () => {
  const state = stateWith({ bait: 3 });
  state.pity = PITY_LIMIT;
  const rng = mulberry32(31337);
  for (let i = 0; i < 20; i += 1) {
    assert.equal(rollCatch(state, rng).tier, 'ssr');
  }
});

test('保底未满时按权重抽取', () => {
  const state = stateWith({ bait: 3 });
  state.pity = PITY_LIMIT - 1;
  const rng = mulberry32(4242);
  const tiers = new Set();
  for (let i = 0; i < 200; i += 1) tiers.add(rollCatch(state, rng).tier);
  assert.ok(tiers.size > 1, '保底未满时应出现多种稀有度');
});

test('只有浅滩时保底不累积', () => {
  let state = stateWith({ bait: 0 });
  for (let i = 0; i < 30; i += 1) {
    const roll = rollCatch(state, mulberry32(i + 1));
    state = landCatch(state, roll.species, roll.cm, roll.value).state;
  }
  assert.equal(state.pity, 0, '只钓得到最深档时保底应保持为 0');
});

test('没钓到最深档时保底累积，钓到时清零', () => {
  let state = stateWith({ bait: 2 });
  const plain = SPECIES.find((s) => s.tier === 'n');
  const best = SPECIES.find((s) => s.tier === 'sr');
  state = landCatch(state, plain, 20, 5).state;
  assert.equal(state.pity, 1);
  state = landCatch(state, plain, 20, 5).state;
  assert.equal(state.pity, 2);
  state = landCatch(state, best, 80, 40).state;
  assert.equal(state.pity, 0, '钓到最深档应清零');
});

test('换水层会重置保底进度', () => {
  let state = stateWith({ bait: 1 });
  state.coins = 1000;
  state.pity = 5;
  const result = applyUpgrade(state, 'bait');
  assert.ok(result, '升级应成功');
  state = result.state;
  assert.equal(state.pity, 0, '换水层后保底应重新计数');
  assert.equal(state.upgrades.bait, 2, '饵等级应升到 2');
});

/* ── 体长与售价 ───────────────────────────────────── */

test('体长落在鱼种区间内且偏向小个体', () => {
  const species = SPECIES_BY_ID.shark;
  const rng = mulberry32(99);
  let sum = 0;
  let minSeen = Infinity;
  let maxSeen = -Infinity;
  for (let i = 0; i < 3000; i += 1) {
    const cm = rollSize(species, rng);
    assert.ok(cm >= species.minCm && cm <= species.maxCm, `体长越界: ${cm}`);
    sum += cm;
    if (cm < minSeen) minSeen = cm;
    if (cm > maxSeen) maxSeen = cm;
  }
  const mean = sum / 3000;
  const midpoint = (species.minCm + species.maxCm) / 2;
  assert.ok(mean < midpoint, `平均体长应偏小: ${mean} vs ${midpoint}`);
  assert.ok(maxSeen > species.minCm, '应能摇出比最小更大个体的鱼');
});

test('大个体判定按区间后 15% 计算', () => {
  const species = SPECIES_BY_ID.shark;
  assert.equal(isBigCatch(species, species.minCm), false);
  assert.equal(isBigCatch(species, species.maxCm), true);
  assert.equal(isBigCatch(species, species.minCm + (species.maxCm - species.minCm) * 0.85), true);
});

test('售价随体型与鱼篓等级上升', () => {
  const species = SPECIES_BY_ID.carp;
  const plain = stateWith();
  const rich = stateWith({ basket: 5 });
  const small = catchValue(plain, species, species.minCm);
  const big = catchValue(plain, species, species.maxCm);
  assert.ok(big > small, '大鱼应更值钱');
  assert.ok(catchValue(rich, species, species.minCm) > small, '鱼篓应提升售价');
});

/* ── 遛鱼 ─────────────────────────────────────────── */

test('挣扎标记始终落在 0–1 之间', () => {
  const reel = startReel(SPECIES_BY_ID.carp, mulberry32(1));
  for (let i = 0; i < 400; i += 1) {
    const value = reelMarker({ ...reel, elapsed: i * 0.05 });
    assert.ok(value >= 0 && value <= 1, `标记越界: ${value}`);
  }
});

test('甜区越窄、挣扎越快：稀有鱼更难钓', () => {
  let prevWidth = Infinity;
  let prevFreq = 0;
  for (const id of TIER_IDS) {
    const profile = REEL_PROFILE[id];
    assert.ok(profile.width < prevWidth, `${id} 甜区应更窄`);
    assert.ok(profile.freq > prevFreq, `${id} 挣扎应更快`);
    prevWidth = profile.width;
    prevFreq = profile.freq;
  }
});

test('好时机收线降张力，坏时机升张力', () => {
  const species = SPECIES_BY_ID.carp;
  const reel = startReel(species, mulberry32(5));
  // 把标记停在甜区正中（三角波在 1/4 周期处过零）
  const centred = { ...reel, elapsed: 0.24, phase: 0, freq: 1, tension: 60 };
  assert.ok(Math.abs(reelMarker(centred) - 0.5) < 0.02, '标记应落在甜区正中');
  const afterGood = stepReel(centred, true, 0.016);
  assert.ok(afterGood.tension < 60, '好时机应降张力');
  const afterBad = stepReel({ ...centred, sweetWidth: 0.0001 }, true, 0.016);
  assert.ok(afterBad.tension > 60, '坏时机应升张力');
});

test('张力拉满会断线，张力归零则上钩', () => {
  const species = SPECIES_BY_ID.carp;
  const reel = startReel(species, mulberry32(9));
  // 坏时机收线把张力推满 → 断线
  const snapped = stepReel({ ...reel, tension: 95, sweetWidth: 0.0001 }, true, 0.016);
  assert.equal(snapped.snapped, true, '张力拉满应断线');
  assert.equal(snapped.landed, false);
  // 好时机收线把张力压到 0 以下 → 上钩
  const landed = stepReel({ ...reel, elapsed: 0.24, phase: 0, freq: 1, tension: 11 }, true, 0.016);
  assert.equal(landed.landed, true, '张力归零应上钩');
  assert.equal(landed.snapped, false);
});

test('会玩的玩家能把各档鱼钓上来', () => {
  for (const id of TIER_IDS) {
    const species = SPECIES.find((s) => s.tier === id);
    const reel = playReel(species, 2024);
    assert.equal(reel.landed, true, `${id} 档应该能钓上来`);
  }
});

test('乱点收线必然断线', () => {
  for (const id of TIER_IDS) {
    const species = SPECIES.find((s) => s.tier === id);
    const reel = playReel(species, 2024, 'spam');
    assert.equal(reel.landed, false, `${id} 档乱点不该钓上来`);
    assert.equal(reel.snapped, true, `${id} 档乱点应该断线`);
  }
});

test('点击冷却生效，连点不会连续判定', () => {
  const reel = startReel(SPECIES_BY_ID.carp, mulberry32(11));
  const once = stepReel(reel, true, 0.016);
  const twice = stepReel(once, true, 0.016);
  assert.equal(once.pulls, 1);
  assert.equal(twice.pulls, 1, '冷却期内不应再次判定');
});

/* ── 抛竿 ─────────────────────────────────────────── */

test('起竿窗口随卷线器变宽、随水层变窄，且有下限', () => {
  const base = hookWindow(stateWith());
  const better = hookWindow(stateWith({ reel: 5 }));
  const deeper = hookWindow(stateWith({ bait: 4 }));
  assert.ok(better > base, '卷线器应加宽起竿窗口');
  assert.ok(deeper < base, '水越深起竿窗口应越窄');
  assert.ok(deeper >= 480, '起竿窗口不应低于下限');
});

test('抛竿会增加投竿次数并给出等待时长', () => {
  const state = createState();
  const { state: next, biteDelay } = applyCast(state, mulberry32(3));
  assert.equal(next.stats.casts, 1);
  assert.ok(biteDelay >= 420, `等待时长过短: ${biteDelay}`);
  assert.ok(biteDelay <= 1900, `等待时长过长: ${biteDelay}`);
});

/* ── 上鱼与图鉴 ───────────────────────────────────── */

test('上鱼会进图鉴、给钱、记最大个体', () => {
  const state = createState();
  const species = SPECIES_BY_ID.carp;
  const { state: next, result } = landCatch(state, species, 33.3, 12);
  assert.equal(next.dex.carp.count, 1);
  assert.equal(next.dex.carp.bestCm, 33.3);
  assert.equal(next.coins, 12);
  assert.equal(next.stats.catches, 1);
  assert.equal(result.isNew, true);
});

test('重复上同一种只加计数，最大个体取较大者', () => {
  let state = createState();
  const species = SPECIES_BY_ID.carp;
  state = landCatch(state, species, 40, 10).state;
  const second = landCatch(state, species, 25, 10);
  state = second.state;
  assert.equal(state.dex.carp.count, 2);
  assert.equal(state.dex.carp.bestCm, 40);
  assert.equal(second.result.isNew, false);
});

test('钓到大个体会被记录', () => {
  const state = createState();
  const species = SPECIES_BY_ID.shark;
  const { state: next } = landCatch(state, species, species.maxCm, 100);
  assert.equal(hasBigCatch(next), true);
});

test('跑掉的鱼计入失误统计', () => {
  const state = createState();
  assert.equal(applyLoss(state, 'miss').stats.misses, 1);
  assert.equal(applyLoss(state, 'escape').stats.escapes, 1);
});

/* ── 装备 ─────────────────────────────────────────── */

test('升级扣钱、提升等级，钱不够或满级则拒绝', () => {
  let state = createState();
  state.coins = 1000;
  const first = applyUpgrade(state, 'rod');
  assert.ok(first);
  assert.equal(first.state.upgrades.rod, 1);
  assert.equal(first.state.coins, 1000 - upgradeCost('rod', 0));

  const poor = applyUpgrade({ ...state, coins: 0 }, 'rod');
  assert.equal(poor, null, '钱不够不应升级');

  const maxed = stateWith({ rod: UPGRADES.rod.max });
  assert.equal(applyUpgrade(maxed, 'rod'), null, '满级不应继续升级');
  assert.equal(applyUpgrade(state, 'not_a_gear'), null, '未知装备不应升级');
});

test('升级价格随等级递增', () => {
  let previous = 0;
  for (let level = 0; level < 5; level += 1) {
    const cost = upgradeCost('rod', level);
    assert.ok(cost > previous, '价格应递增');
    previous = cost;
  }
});

test('装备等级总和可统计', () => {
  const state = stateWith({ rod: 2, reel: 3, bait: 1, basket: 2 });
  assert.equal(totalUpgradeLevels(state), 8);
});

/* ── 成就 ─────────────────────────────────────────── */

test('成就只解锁一次', () => {
  const state = createState();
  const { state: afterCatch, result } = landCatch(state, SPECIES_BY_ID.carp, 20, 5);
  assert.ok(result.unlocked.length >= 1, '首次上钩应解锁成就');
  const unlocked = updateAchievements(afterCatch);
  assert.deepEqual(unlocked, [], '成就不应重复解锁');
  assert.equal(afterCatch.achievements.first_catch, true);
});

test('所有成就都有三语文案', () => {
  for (const ach of ACHIEVEMENTS) {
    assert.ok(ach.zh && ach.en && ach.ja, `${ach.id} 缺少文案`);
    assert.equal(typeof ach.test, 'function');
  }
});

test('装备等级足够时解锁「装备精良」', () => {
  const state = stateWith({ rod: 4, reel: 4 });
  updateAchievements(state);
  assert.equal(state.achievements.gear, true);
});

/* ── 存档 ─────────────────────────────────────────── */

test('序列化 / 反序列化可完整往返', () => {
  let state = createState();
  state = landCatch(state, SPECIES_BY_ID.carp, 30, 9).state;
  state = landCatch(state, SPECIES_BY_ID.shark, 300, 400).state;
  state.coins = 777;
  const restored = deserializeState(serializeState(state));
  assert.deepEqual({ ...restored.dex }, { ...state.dex });
  assert.equal(restored.coins, 777);
  assert.equal(restored.stats.catches, 2);
  assert.equal(distinctCount(restored), 2);
  assert.equal(restored.stats.bestCm, 300);
});

test('反序列化面对脏数据不崩溃并回退到安全默认值', () => {
  const cases = [
    null,
    '',
    'not json',
    '[]',
    '"string"',
    '{"dex": "oops"}',
    '{"dex": {"not_a_fish": {"count": 3}}}',
    '{"upgrades": {"rod": 9999, "reel": -5}}',
    '{"stats": {"tierCounts": "nope"}}',
    '{"coins": "many"}',
  ];
  for (const raw of cases) {
    const state = deserializeState(raw);
    assert.equal(typeof state, 'object');
    assert.ok(Number.isFinite(state.coins) && state.coins >= 0);
    assert.ok(Number.isFinite(state.pity) && state.pity >= 0);
    assert.equal(state.upgrades.rod, Math.min(UPGRADES.rod.max, state.upgrades.rod));
    assert.ok(state.stats.tierCounts.n >= 0);
    for (const id of UPGRADE_IDS) {
      assert.ok(state.upgrades[id] >= 0 && state.upgrades[id] <= UPGRADES[id].max);
    }
  }
});

test('存档里的未知鱼种会被安全忽略', () => {
  const raw = JSON.stringify({
    dex: { 'imp:ghost~fish': { count: 9, bestCm: 100 } },
    achievements: { unknown_ach: true },
  });
  const state = deserializeState(raw);
  assert.equal(state.dex['imp:ghost~fish'], undefined);
  assert.equal(state.achievements.unknown_ach, undefined);
});

/* ── 边界输入 ─────────────────────────────────────── */

test('档位排名随稀有度递增', () => {
  for (let i = 1; i < TIER_IDS.length; i += 1) {
    assert.ok(tierRank(TIER_IDS[i]) > tierRank(TIER_IDS[i - 1]));
  }
});

test('统计面板数据自洽', () => {
  const state = stateWith({ bait: 2, rod: 1 });
  const stats = computeStats(state);
  assert.equal(stats.distinct, 0);
  assert.equal(stats.totalSpecies, SPECIES.length);
  assert.equal(stats.pityLimit, PITY_LIMIT);
  assert.equal(stats.pityTarget, deepestTier(state));
  assert.equal(stats.pityArmed, true);
});

test('空档位的权重不会导致除零', () => {
  const rng = mulberry32(5);
  assert.equal(pickTierByWeight(rng, { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 }), 'n');
});

test('遛鱼参数不会让张力越界', () => {
  const reel = startReel(SPECIES_BY_ID.carp, mulberry32(2));
  let current = reel;
  for (let i = 0; i < 600; i += 1) current = stepReel(current, true, 1 / 60);
  assert.ok(current.tension <= REEL.maxTension, '张力不应超过上限');
  assert.ok(current.tension >= -60, '张力不应低于下限');
});
