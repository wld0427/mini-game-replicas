import test from 'node:test';
import assert from 'node:assert/strict';

import { KANJI } from '../assets/data.js';
import {
  ACHIEVEMENTS,
  PITY_LIMIT,
  TEMPO,
  TIER_IDS,
  applyPull,
  computeStats,
  createState,
  currentDelay,
  deserializeState,
  distinctCount,
  distinctInTier,
  pickTierByWeight,
  poolFor,
  serializeState,
  tempoDelay,
  tierOf,
  updateAchievements,
} from '../src/logic.js';

/** 确定性 PRNG（mulberry32），保证测试可复现。 */
function seeded(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('字库结构合法：id 唯一、字段齐全、freq 在 0-100', () => {
  const ids = new Set();
  for (const k of KANJI) {
    assert.ok(!ids.has(k.id), `重复 id: ${k.id}`);
    ids.add(k.id);
    assert.ok(typeof k.c === 'string' && k.c.length === 1, `字形非法: ${k.id}`);
    assert.ok(typeof k.k === 'string' && k.k.length > 0, `读音缺失: ${k.id}`);
    assert.ok(typeof k.m === 'string' && k.m.length > 0, `释义缺失: ${k.id}`);
    assert.ok(typeof k.z === 'string' && k.z.length > 0, `中义缺失: ${k.id}`);
    assert.ok(Number.isInteger(k.freq) && k.freq >= 0 && k.freq <= 100, `freq 越界: ${k.id}`);
  }
  assert.ok(KANJI.length >= 100, `字库过小: ${KANJI.length}`);
});

test('每个稀有度档位都有可抽取的字', () => {
  for (const id of TIER_IDS) {
    const pool = poolFor(KANJI, id);
    assert.ok(pool.length > 0, `档位 ${id} 无候选字`);
  }
});

test('tierOf 依据 freq 分档，边界值归入正确档位', () => {
  assert.equal(tierOf({ freq: 0 }), 'n');
  assert.equal(tierOf({ freq: 34 }), 'n');
  assert.equal(tierOf({ freq: 35 }), 'r');
  assert.equal(tierOf({ freq: 57 }), 'r');
  assert.equal(tierOf({ freq: 58 }), 'sr');
  assert.equal(tierOf({ freq: 77 }), 'sr');
  assert.equal(tierOf({ freq: 78 }), 'ssr');
  assert.equal(tierOf({ freq: 92 }), 'ssr');
  assert.equal(tierOf({ freq: 93 }), 'ur');
  assert.equal(tierOf({ freq: 100 }), 'ur');
});

test('pickTierByWeight 服从权重分布（3000 次采样，容差内）', () => {
  const rng = seeded(42);
  const counts = { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 };
  const total = 3000;
  for (let i = 0; i < total; i += 1) counts[pickTierByWeight(rng)] += 1;

  const expected = { n: 100, r: 45, sr: 18, ssr: 5, ur: 1 };
  const sum = Object.values(expected).reduce((s, w) => s + w, 0);
  for (const id of TIER_IDS) {
    const actual = counts[id] / total;
    const want = expected[id] / sum;
    assert.ok(Math.abs(actual - want) < 0.035, `档位 ${id} 实际 ${actual.toFixed(3)} 偏离期望 ${want.toFixed(3)}`);
  }
  assert.ok(counts.ur > 0, '神话档应至少出现一次');
});

test('applyPull 递增计数并记录收藏', () => {
  const rng = seeded(7);
  let state = createState();
  const before = state.pulls;
  const out = applyPull(state, KANJI, rng);

  assert.equal(out.state.pulls, before + 1);
  assert.equal(out.state.collection[out.result.kanji.id], 1);
  assert.equal(out.state.tierCounts[out.result.tier], 1);
  assert.equal(out.result.isNew, true);
  assert.equal(state.pulls, 0, '入参 state 不应被修改');
});

test('重复抽到同字时 isNew 为 false 且数量递增', () => {
  const rng = seeded(11);
  let state = createState();
  let target = null;
  for (let i = 0; i < 40; i += 1) {
    const out = applyPull(state, KANJI, rng);
    state = out.state;
    if (!target) target = out.result.kanji.id;
    if (out.result.kanji.id === target) {
      assert.equal(out.result.isNew, state.collection[target] === 1);
      break;
    }
  }
  assert.ok(state.collection[target] >= 1);
});

test('连击：史诗及以上累加，普通/稀有清零', () => {
  const rng = seeded(2024);
  let state = createState();
  let sawHigh = false;
  let sawReset = false;

  for (let i = 0; i < 400; i += 1) {
    const prevCombo = state.combo;
    const out = applyPull(state, KANJI, rng);
    state = out.state;
    const rank = TIER_IDS.indexOf(out.result.tier);
    if (rank >= 2) {
      assert.equal(state.combo, prevCombo + 1);
      sawHigh = true;
    } else {
      if (sawHigh && prevCombo > 0) {
        assert.equal(state.combo, 0);
        sawReset = true;
      }
    }
  }
  assert.ok(sawHigh, '采样中应至少出现一次史诗及以上');
  assert.ok(state.bestCombo >= 1);
});

test('保底：连续 PITY_LIMIT 次未出传说则强制触发，且计数归零', () => {
  const rng = seeded(99);
  let state = createState();
  state = { ...state, pity: PITY_LIMIT };

  const out = applyPull(state, KANJI, rng);
  assert.equal(out.result.pity, true);
  assert.equal(out.result.tier, 'ssr');
  assert.equal(out.state.pity, 0);
  assert.equal(out.state.pityBreaks, 1);
});

test('保底计数：未出传说时递增，出传说时归零', () => {
  const rng = seeded(123);
  let state = createState();
  for (let i = 0; i < 50; i += 1) {
    const out = applyPull(state, KANJI, rng);
    state = out.state;
    if (out.result.tier === 'ssr' || out.result.tier === 'ur') {
      assert.equal(state.pity, 0);
    } else {
      assert.equal(state.pity, i + 1);
    }
  }
});

test('tempoDelay 随抽卡数单调不增，且不低于下限', () => {
  let prev = Infinity;
  for (let p = 0; p < 400; p += 1) {
    const d = tempoDelay(p);
    assert.ok(d <= prev, `第 ${p} 次间隔 ${d} 不应大于上一次 ${prev}`);
    assert.ok(d >= TEMPO.min, `间隔 ${d} 低于下限 ${TEMPO.min}`);
    prev = d;
  }
  assert.equal(tempoDelay(0), TEMPO.base);
  assert.equal(tempoDelay(-5), TEMPO.base);
});

test('currentDelay 在传奇加速期内为 8 折', () => {
  const base = tempoDelay(10);
  assert.equal(currentDelay({ pulls: 10, surge: 0 }), base);
  assert.equal(currentDelay({ pulls: 10, surge: 3 }), Math.round(base * 0.8));
});

test('成就按条件解锁且不重复解锁', () => {
  let state = createState();
  const rng = seeded(5);
  const seen = new Set();
  for (let i = 0; i < 150; i += 1) {
    const out = applyPull(state, KANJI, rng);
    state = out.state;
    for (const ach of out.result.unlocked) {
      assert.ok(!seen.has(ach.id), `成就 ${ach.id} 重复解锁`);
      seen.add(ach.id);
    }
  }
  assert.ok(seen.has('first_pull'), '应解锁首次抽取');
  assert.ok(state.achievements.first_pull === true);
});

test('成就表中的每一条都有可执行的判定函数', () => {
  const state = createState();
  for (const ach of ACHIEVEMENTS) {
    assert.equal(typeof ach.test, 'function', `${ach.id} 缺少判定函数`);
    assert.equal(typeof ach.test(state, KANJI), 'boolean');
  }
});

test('updateAchievements 返回新解锁成就且状态被记录', () => {
  const state = { ...createState(), pulls: 1 };
  const unlocked = updateAchievements(state, KANJI);
  assert.ok(unlocked.some((a) => a.id === 'first_pull'));
  assert.equal(state.achievements.first_pull, true);
  assert.equal(updateAchievements(state, KANJI).length, 0);
});

test('收集度统计正确', () => {
  const rng = seeded(31);
  let state = createState();
  for (let i = 0; i < 60; i += 1) state = applyPull(state, KANJI, rng).state;
  assert.equal(distinctCount(state), Object.keys(state.collection).length);
  const nPool = poolFor(KANJI, 'n');
  const ownedN = distinctInTier(state, KANJI, 'n');
  assert.ok(ownedN >= 0 && ownedN <= nPool.length);
});

test('computeStats 输出完整字段', () => {
  const stats = computeStats(createState());
  assert.equal(stats.pulls, 0);
  assert.equal(stats.pityLimit, PITY_LIMIT);
  assert.ok(typeof stats.delay === 'number');
  assert.deepEqual(Object.keys(stats.tiers).sort(), [...TIER_IDS].sort());
});

test('最近抽取日志最多保留 30 条', () => {
  const rng = seeded(77);
  let state = createState();
  for (let i = 0; i < 80; i += 1) state = applyPull(state, KANJI, rng).state;
  assert.equal(state.log.length, 30);
});

test('序列化 / 反序列化可完整往返', () => {
  const rng = seeded(64);
  let state = createState();
  for (let i = 0; i < 25; i += 1) state = applyPull(state, KANJI, rng).state;
  const restored = deserializeState(serializeState(state));
  assert.equal(restored.pulls, state.pulls);
  assert.equal(restored.pity, state.pity);
  assert.deepEqual({ ...restored.collection }, { ...state.collection });
  assert.deepEqual(restored.tierCounts, state.tierCounts);
  assert.deepEqual({ ...restored.achievements }, { ...state.achievements });
});

test('反序列化面对脏数据不崩溃并回退为安全默认值', () => {
  assert.deepEqual(deserializeState(null).pulls, 0);
  assert.deepEqual(deserializeState('not-json').pulls, 0);
  assert.deepEqual(deserializeState('[]').pulls, 0);
  assert.deepEqual(deserializeState('{"pulls":"x"}').pulls, 0);
  assert.deepEqual(deserializeState('{"pulls":-9}').pulls, 0);
  assert.deepEqual({ ...deserializeState('{"collection":null}').collection }, {});
  const dirty = deserializeState('{"collection":{"k001":-3,"k002":"x","k003":2},"achievements":{"nope":true}}');
  assert.equal(dirty.collection.k001, undefined);
  assert.equal(dirty.collection.k002, undefined);
  assert.equal(dirty.collection.k003, 2);
  assert.deepEqual({ ...dirty.achievements }, {});
  // 脏数据不得引入原型污染
  const polluted = deserializeState('{"collection":{"__proto__":{"x":1},"constructor":5}}');
  assert.equal(Object.getPrototypeOf(polluted.collection), null);
  assert.equal(polluted.collection.__proto__, undefined);
});
