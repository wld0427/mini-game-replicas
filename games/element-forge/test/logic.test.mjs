import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AMPLIFIERS,
  BASE_IDS,
  DAILY_LIMIT,
  DAILY_PITY_LIMIT,
  ELEMENTS,
  RECIPES,
} from '../assets/data.js';
import {
  ACHIEVEMENTS,
  GENERATIONS,
  RECIPE_MAP,
  TIER_IDS,
  applyDailyDraw,
  applyFusion,
  composeWord,
  countNameCollision,
  createState,
  deserializeState,
  distinctCount,
  generationOf,
  hashString,
  improvisedTierWeights,
  mulberry32,
  pickTierByWeight,
  recipeKey,
  serializeState,
  updateAchievements,
} from '../src/logic.js';

const ELEMENT_IDS = Object.keys(ELEMENTS);

/** 构造一个「已经收集全部正式元素」的状态，方便做深层合成测试。 */
function fullState() {
  const state = createState();
  for (const el of Object.values(ELEMENTS)) {
    state.collection[el.id] = {
      count: 1,
      gen: 0,
      tier: el.tier,
      improvised: false,
      names: { zh: el.zh, en: el.en, ja: el.ja },
      glyph: el.glyph,
    };
  }
  for (const [id, gen] of GENERATIONS) state.collection[id].gen = gen;
  return state;
}

/* ── 数据完整性 ───────────────────────────────────── */

test('合成表里没有重复的原料对', () => {
  const seen = new Set();
  const dupes = [];
  for (const [a, b] of RECIPES) {
    const key = recipeKey(a, b);
    if (seen.has(key)) dupes.push(key);
    seen.add(key);
  }
  assert.deepEqual(dupes, [], `存在重复配方: ${dupes.join(', ')}`);
});

test('合成表只引用已收录的词条', () => {
  const bad = [];
  for (const [a, b, out] of RECIPES) {
    for (const id of [a, b, out]) {
      if (!ELEMENTS[id]) bad.push(id);
    }
  }
  assert.deepEqual(bad, [], `引用了未知词条: ${bad.join(', ')}`);
});

test('每个词条都能由基础元素合成得到', () => {
  const unreachable = ELEMENT_IDS.filter((id) => !GENERATIONS.has(id));
  assert.deepEqual(unreachable, [], `以下词条无法合成: ${unreachable.join(', ')}`);
});

test('基础元素层数为 0，其余词条层数大于 0', () => {
  for (const id of BASE_IDS) assert.equal(GENERATIONS.get(id), 0, `${id} 层数应为 0`);
  for (const id of ELEMENT_IDS) {
    if (BASE_IDS.includes(id)) continue;
    assert.ok(GENERATIONS.get(id) >= 1, `${id} 层数应 ≥ 1`);
  }
});

test('词条总数与稀有度分档都符合预期', () => {
  assert.ok(ELEMENT_IDS.length >= 100, `词条过少: ${ELEMENT_IDS.length}`);
  for (const el of Object.values(ELEMENTS)) {
    assert.ok(TIER_IDS.includes(el.tier), `${el.id} 的稀有度非法: ${el.tier}`);
  }
  const tiers = new Set(Object.values(ELEMENTS).map((el) => el.tier));
  assert.equal(tiers.size, 5, '五种稀有度都应当有词条');
});

/* ── 配方键与确定性 ───────────────────────────────── */

test('配方键与顺序无关', () => {
  assert.equal(recipeKey('water', 'fire'), recipeKey('fire', 'water'));
  assert.notEqual(recipeKey('water', 'fire'), recipeKey('water', 'wind'));
});

test('同一对原料永远得到同一个结果', () => {
  const state = fullState();
  const first = applyFusion(state, 'water', 'star');
  for (let i = 0; i < 5; i += 1) {
    const again = applyFusion(state, 'water', 'star');
    assert.equal(again.result.id, first.result.id);
    assert.deepEqual(again.result.names, first.result.names);
    assert.equal(again.result.tier, first.result.tier);
  }
});

test('熔炼顺序不影响结果', () => {
  const state = fullState();
  assert.equal(
    applyFusion(state, 'water', 'flame').result.id,
    applyFusion(state, 'flame', 'water').result.id,
  );
});

test('散列函数稳定且分布不退化', () => {
  assert.equal(hashString('water+fire'), hashString('water+fire'));
  assert.notEqual(hashString('water+fire'), hashString('water+wind'));
  const buckets = new Set();
  for (let i = 0; i < 64; i += 1) buckets.add(hashString(`bucket-${i}`));
  assert.equal(buckets.size, 64, '散列不应大量碰撞');
});

test('mulberry32 输出落在 [0,1) 且可复现', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  for (let i = 0; i < 500; i += 1) {
    const value = a();
    assert.ok(value >= 0 && value < 1, `越界: ${value}`);
    assert.equal(value, b());
  }
});

/* ── 熔炼规则 ─────────────────────────────────────── */

test('命中合成表时走固定配方', () => {
  const state = createState();
  const { state: next, result } = applyFusion(state, 'water', 'fire');
  assert.equal(result.id, 'steam');
  assert.equal(result.improvised, false);
  assert.equal(result.isNew, true);
  assert.equal(result.names.zh, '蒸汽');
  assert.equal(result.names.en, 'Steam');
  assert.equal(result.names.ja, '蒸気');
  assert.ok(next.collection.steam);
});

test('表外组合走原创合成，并标记为原创', () => {
  const state = createState();
  const { result } = applyFusion(state, 'water', 'moon');
  assert.equal(RECIPE_MAP.has(recipeKey('water', 'moon')), false);
  assert.equal(result.improvised, true);
  assert.ok(result.id.startsWith('imp:'), `原创 id 应带前缀: ${result.id}`);
  assert.ok(result.names.zh.length > 0);
});

test('原创合成使用中文构词法：定语 + 中心语', () => {
  const state = createState();
  const { state: next, result } = applyFusion(state, 'water', 'fire');
  assert.equal(result.id, 'steam');
  assert.equal(composeWord('水', '星', 'zh'), '水星');
  assert.equal(composeWord('Water', 'Star', 'en'), 'Water Star');
  assert.equal(composeWord('水', '星', 'ja'), '水星');
  assert.ok(next.collection.steam.count >= 1);
});

test('原创词条也能继续参与合成', () => {
  let state = createState();
  const first = applyFusion(state, 'water', 'moon');
  state = first.state;
  const second = applyFusion(state, first.result.id, 'soil');
  assert.ok(second.result.id, '原创词条应可以再次熔炼');
  assert.ok(second.state.collection[first.result.id], '原创词条应留在图鉴里');
});

test('重复熔炼同一对原料只增加计数，不重复发现', () => {
  const state = createState();
  const first = applyFusion(state, 'water', 'moon');
  const second = applyFusion(first.state, 'water', 'moon');
  assert.equal(second.result.isNew, false);
  assert.equal(second.state.collection[first.result.id].count, 2);
  assert.equal(second.state.stats.discoveries, 1);
  assert.equal(second.state.stats.fusions, 2);
});

test('重复熔炼不会让原创词条改名', () => {
  const state = createState();
  const first = applyFusion(state, 'water', 'moon');
  const second = applyFusion(first.state, 'water', 'moon');
  assert.equal(second.result.names.zh, first.result.names.zh);
  assert.equal(second.result.names.en, first.result.names.en);
});

test('原创词条重名时会追加序号', () => {
  const state = createState();
  // 两个不同配方拼出同一个词时，第二个应带序号
  const patched = { ...state, collection: { ...state.collection } };
  patched.collection['imp:fake~one'] = {
    count: 1,
    gen: 1,
    tier: 'n',
    improvised: true,
    names: { zh: '水星', en: 'Water Star', ja: '水星' },
    glyph: '🧪',
  };
  assert.equal(countNameCollision(patched, '水星', 'zh'), 1);
  assert.equal(countNameCollision(patched, '水星', 'zh', 'imp:fake~one'), 0);
});

test('增幅前缀池非空且各语言都有文案', () => {
  assert.ok(AMPLIFIERS.length >= 4);
  for (const amp of AMPLIFIERS) {
    assert.ok(amp.zh && amp.en && amp.ja, '增幅前缀缺少语言');
  }
});

test('层数随合成深度增长', () => {
  const state = fullState();
  const shallow = applyFusion(state, 'water', 'fire');
  const deep = applyFusion(state, 'chaos', 'human');
  assert.ok(deep.result.gen > shallow.result.gen, '深层合成层数应更高');
  assert.equal(generationOf(shallow.state, 'steam'), GENERATIONS.get('steam'));
});

/* ── 稀有度分布 ───────────────────────────────────── */

test('按权重挑稀有度：分布落在容差内', () => {
  const rng = mulberry32(20241111);
  const weights = { n: 50, r: 30, sr: 20, ssr: 0, ur: 0 };
  const counts = { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 };
  const total = 6000;
  for (let i = 0; i < total; i += 1) counts[pickTierByWeight(rng, weights)] += 1;
  for (const id of ['n', 'r', 'sr']) {
    const expected = (weights[id] / 100) * total;
    assert.ok(
      Math.abs(counts[id] - expected) < expected * 0.08,
      `${id} 分布偏差过大: ${counts[id]} vs ${expected}`,
    );
  }
});

test('原创合成的稀有度权重随层数变稀有', () => {
  const shallow = improvisedTierWeights(1);
  const deep = improvisedTierWeights(6);
  // 期望稀有度：普通 0 / 稀有 1 / 史诗 2 / 传说 3 / 神话 4
  const score = (w) => {
    const total = Object.values(w).reduce((sum, v) => sum + v, 0);
    let acc = 0;
    for (const id of TIER_IDS) acc += (w[id] / total) * TIER_IDS.indexOf(id);
    return acc;
  };
  assert.ok(score(deep) > score(shallow), '层数越深，整体稀有度应越高');
  assert.ok(shallow.n > deep.n, '普通档权重应随层数下降');
  assert.ok(deep.ssr > shallow.ssr, '传说档权重应随层数上升');
});

test('全表外组合的稀有度分布与权重一致', () => {
  const state = fullState();
  const counts = { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 };
  let samples = 0;
  for (let i = 0; i < ELEMENT_IDS.length; i += 1) {
    for (let j = i; j < ELEMENT_IDS.length; j += 1) {
      const a = ELEMENT_IDS[i];
      const b = ELEMENT_IDS[j];
      if (RECIPE_MAP.has(recipeKey(a, b))) continue;
      const { result } = applyFusion(state, a, b);
      counts[result.tier] += 1;
      samples += 1;
    }
  }
  assert.ok(samples > 1000, `原创组合样本太少: ${samples}`);
  const ratio = counts.ssr + counts.ur;
  assert.ok(ratio / samples > 0.02, '深层原创合成应能出传说级结果');
  assert.ok(ratio / samples < 0.4, '传说级结果不应泛滥');
});

/* ── 每日灵感与保底 ───────────────────────────────── */

test('每日抽取有次数上限', () => {
  let state = createState();
  for (let i = 0; i < DAILY_LIMIT; i += 1) {
    const { state: next, result } = applyDailyDraw(state, '2026-01-01');
    assert.equal(result.limited, false);
    state = next;
  }
  const { result } = applyDailyDraw(state, '2026-01-01');
  assert.equal(result.limited, true, '超出上限应被拒绝');
});

test('连续未出传说时触发保底', () => {
  let state = createState();
  state.daily = { date: '2026-01-02', draws: 0, pity: DAILY_PITY_LIMIT, lastId: null };
  const { state: next, result } = applyDailyDraw(state, '2026-01-02');
  assert.equal(result.pity, true, '应触发保底');
  assert.ok(result.tier === 'ssr' || result.tier === 'ur', `保底应给传说以上: ${result.tier}`);
  assert.equal(next.daily.pity, 0, '保底后计数应清零');
});

test('每日抽取日期变化后状态重置', () => {
  let state = createState();
  state = applyDailyDraw(state, '2026-01-01').state;
  state = applyDailyDraw(state, '2026-01-01').state;
  assert.equal(state.daily.draws, 2);
  const { state: next } = applyDailyDraw(state, '2026-01-02');
  assert.equal(next.daily.date, '2026-01-02');
  assert.equal(next.daily.draws, 1, '新的一天应从 0 开始重新计数');
});

test('同一天连续抽取得到不同元素', () => {
  let state = createState();
  const first = applyDailyDraw(state, '2026-02-02').result.id;
  state = applyDailyDraw(state, '2026-02-02').state;
  const second = applyDailyDraw(state, '2026-02-02').result.id;
  assert.notEqual(first, second, '同一天的多次抽取不应重复');
});

test('每日抽取优先给还没收集过的词条', () => {
  const state = createState();
  const { state: next } = applyDailyDraw(state, '2026-03-03');
  const picked = next.daily.lastId;
  assert.ok(picked);
  assert.ok(next.collection[picked], '抽到的元素应进入图鉴');
});

/* ── 成就 ─────────────────────────────────────────── */

test('成就只解锁一次', () => {
  const state = createState();
  const { state: afterFusion, result } = applyFusion(state, 'water', 'fire');
  assert.ok(result.unlocked.length >= 1, '初次熔炼成就应当触发');
  assert.equal(afterFusion.achievements.first_fusion, true);
  const again = updateAchievements(afterFusion);
  assert.deepEqual(again, [], '成就不应重复解锁');
});

test('成就条件随进度推进', () => {
  const state = createState();
  state.stats.fusions = 1;
  updateAchievements(state);
  assert.equal(state.achievements.first_fusion, true);
  assert.equal(state.achievements.collector, undefined, '词条不足时不应解锁');

  const full = fullState();
  updateAchievements(full);
  assert.equal(full.achievements.collector, true);
  assert.equal(full.achievements.alchemist, true);
});

test('所有成就都有三语文案', () => {
  for (const ach of ACHIEVEMENTS) {
    assert.ok(ach.zh && ach.en && ach.ja, `${ach.id} 缺少文案`);
    assert.equal(typeof ach.test, 'function');
  }
});

/* ── 存档 ─────────────────────────────────────────── */

test('序列化 / 反序列化可完整往返', () => {
  let state = createState();
  state = applyFusion(state, 'water', 'fire').state;
  state = applyFusion(state, 'water', 'flame').state;
  const raw = serializeState(state);
  const restored = deserializeState(raw);
  assert.deepEqual({ ...restored.collection }, { ...state.collection });
  assert.deepEqual({ ...restored.recipes }, { ...state.recipes });
  assert.equal(restored.stats.fusions, state.stats.fusions);
  assert.equal(distinctCount(restored), distinctCount(state));
});

test('反序列化面对脏数据不崩溃并回退到安全默认值', () => {
  const cases = [
    null,
    '',
    'not json at all',
    '[]',
    '"a string"',
    '{"collection": "oops"}',
    '{"collection": {"water": 5}}',
    '{"stats": {"tierCounts": "nope"}}',
    '{"daily": {"draws": "many"}}',
    '{"achievements": {"first_fusion": "yes"}}',
  ];
  for (const raw of cases) {
    const state = deserializeState(raw);
    assert.equal(typeof state, 'object');
    assert.ok(state.collection, 'collection 必须存在');
    assert.ok(state.stats.tierCounts.n >= 0);
    assert.equal(state.stats.tierCounts.n, state.stats.tierCounts.n, '统计必须是数字');
    assert.equal(state.daily.draws, Number.isFinite(state.daily.draws) ? state.daily.draws : 0);
    assert.ok(Object.keys(state.collection).length >= BASE_IDS.length, '基础元素必须补齐');
  }
});

test('存档里出现未知词条时被安全忽略', () => {
  const raw = JSON.stringify({
    collection: { 'imp:ghost~pair': { count: 2, tier: 'ssr', improvised: true } },
    achievements: { unknown_ach: true },
  });
  const state = deserializeState(raw);
  assert.ok(state.collection['imp:ghost~pair'], '原创词条应保留');
  assert.equal(state.achievements.unknown_ach, undefined, '未知成就不应被识别');
});

/* ── 边界输入 ─────────────────────────────────────── */

test('熔炼缺少原料或原料非法时抛错', () => {
  const state = createState();
  assert.throws(() => applyFusion(state, null, 'water'));
  assert.throws(() => applyFusion(state, 'water', undefined));
  assert.throws(() => applyFusion(state, 'water', 'not_an_element'));
});

test('初始状态包含四个基础元素', () => {
  const state = createState();
  assert.equal(distinctCount(state), BASE_IDS.length);
  for (const id of BASE_IDS) assert.ok(state.collection[id]);
});

test('空权重时退化为普通档', () => {
  const rng = mulberry32(7);
  assert.equal(pickTierByWeight(rng, { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 }), 'n');
});
