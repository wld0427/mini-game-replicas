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
  composeImprovised,
  describeElement,
  GENERATIONS,
  RECIPE_MAP,
  TIER_IDS,
  applyDailyDraw,
  applyFusion,
  composeWord,
  computeStats,
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

/** @covers F-001 */
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

/** @covers F-006 */
test('基础元素层数为 0，其余词条层数大于 0', () => {
  for (const id of BASE_IDS) assert.equal(GENERATIONS.get(id), 0, `${id} 层数应为 0`);
  for (const id of ELEMENT_IDS) {
    if (BASE_IDS.includes(id)) continue;
    assert.ok(GENERATIONS.get(id) >= 1, `${id} 层数应 ≥ 1`);
  }
});

/** @covers F-001 */
test('词条总数与稀有度分档都符合预期', () => {
  assert.ok(ELEMENT_IDS.length >= 100, `词条过少: ${ELEMENT_IDS.length}`);
  for (const el of Object.values(ELEMENTS)) {
    assert.ok(TIER_IDS.includes(el.tier), `${el.id} 的稀有度非法: ${el.tier}`);
  }
  const tiers = new Set(Object.values(ELEMENTS).map((el) => el.tier));
  assert.equal(tiers.size, 5, '五种稀有度都应当有词条');
});

/* ── 配方键与确定性 ───────────────────────────────── */

/** @covers F-002 */
test('配方键与顺序无关', () => {
  assert.equal(recipeKey('water', 'fire'), recipeKey('fire', 'water'));
  assert.notEqual(recipeKey('water', 'fire'), recipeKey('water', 'wind'));
});

/** @covers F-003 */
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

/** @covers F-002 */
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

/** @covers F-002 */
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

/** @covers F-003 */
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

/** @covers F-009 */
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

/** @covers F-004 */
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

/** @covers F-004 */
test('增幅前缀池非空且各语言都有文案', () => {
  assert.ok(AMPLIFIERS.length >= 4);
  for (const amp of AMPLIFIERS) {
    assert.ok(amp.zh && amp.en && amp.ja, '增幅前缀缺少语言');
  }
});

/** @covers F-006 */
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

/** @covers F-005 */
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

/** @covers F-007 */
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

/** @covers F-008 */
test('连续未出传说时触发保底', () => {
  let state = createState();
  state.daily = { date: '2026-01-02', draws: 0, pity: DAILY_PITY_LIMIT, lastId: null };
  const { state: next, result } = applyDailyDraw(state, '2026-01-02');
  assert.equal(result.pity, true, '应触发保底');
  assert.ok(result.tier === 'ssr' || result.tier === 'ur', `保底应给传说以上: ${result.tier}`);
  assert.equal(next.daily.pity, 0, '保底后计数应清零');
});

/**
 * 保底必须走真实抽取路径才能验证，不能直接把 pity 填成 12 再抽一次——
 * 那样测的是「计数器有值时会怎样」，测不出「这个计数器能不能被攒到」。
 *
 * @covers F-008
 */
test('保底进度跨日累计：换日期抽取时 pity 不清零', () => {
  let state = createState();
  // 第一天抽满当天上限，全程只走真实路径（固定种子，结果可复现）
  for (let i = 0; i < DAILY_LIMIT; i += 1) {
    state = applyDailyDraw(state, '2026-11-01').state;
  }
  const pityAfterDay1 = state.daily.pity;
  assert.equal(pityAfterDay1, DAILY_LIMIT, `第一天的 5 抽都未出传说，进度应为 5，实际 ${pityAfterDay1}`);

  // 换到第二天：draws 归零，但 pity 必须保留（不跨日清零）
  const { state: next, result } = applyDailyDraw(state, '2026-11-02');
  assert.equal(next.daily.date, '2026-11-02');
  assert.equal(next.daily.draws, 1, '新的一天从第 1 次开始重新计数');
  assert.ok(
    result.tier !== 'ssr' && result.tier !== 'ur',
    `这次抽取出了传说 ${result.tier}，保底会被重置，本用例失去意义`,
  );
  assert.equal(
    next.daily.pity,
    pityAfterDay1 + 1,
    `跨日抽取后 pity 应在原进度上继续累积，而不是清零（原 ${pityAfterDay1}，现 ${next.daily.pity}）`,
  );
});

/**
 * 保底可达性：只走真实抽取路径（跨多天连续抽），
 * 断言「连续非传说抽取次数不超过阈值」且「保底确实触发过」。
 *
 * @covers F-008
 */
test('保底在真实抽取路径上可达：连续非传说抽取不超过阈值，且保底触发过', () => {
  let state = createState();
  let consecutiveNonLegendary = 0;
  let maxConsecutive = 0;
  let pityTriggered = 0;
  let firstTrigger = null;

  for (let day = 1; day <= 30; day += 1) {
    const key = `2026-03-${String(day).padStart(2, '0')}`;
    for (let i = 0; i < DAILY_LIMIT; i += 1) {
      const pityBefore = state.daily.pity;
      const { state: next, result } = applyDailyDraw(state, key);
      state = next;
      if (result.limited) break;
      const legendary = result.tier === 'ssr' || result.tier === 'ur';
      if (pityBefore >= DAILY_PITY_LIMIT) {
        pityTriggered += 1;
        if (!firstTrigger) firstTrigger = { day, draw: i + 1, tier: result.tier };
        assert.ok(legendary, '保底触发的那一次必须给传说及以上');
      }
      if (legendary) {
        consecutiveNonLegendary = 0;
      } else {
        consecutiveNonLegendary += 1;
        maxConsecutive = Math.max(maxConsecutive, consecutiveNonLegendary);
      }
    }
  }

  assert.ok(
    maxConsecutive <= DAILY_PITY_LIMIT,
    `连续非传说抽取 ${maxConsecutive} 次不应超过阈值 ${DAILY_PITY_LIMIT}`,
  );
  assert.ok(
    pityTriggered > 0,
    '30 天真实抽取内保底一次都没触发，说明保底计数被别的地方清零了',
  );
  assert.ok(firstTrigger, '应记录到首次保底触发');
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

/** @covers F-007 */
test('每日抽取优先给还没收集过的词条', () => {
  const state = createState();
  const { state: next } = applyDailyDraw(state, '2026-03-03');
  const picked = next.daily.lastId;
  assert.ok(picked);
  assert.ok(next.collection[picked], '抽到的元素应进入图鉴');
});

/* ── 成就 ─────────────────────────────────────────── */

/** @covers F-011 */
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

/** @covers F-012 */
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

/** @covers F-001 */
test('初始状态包含四个基础元素', () => {
  const state = createState();
  assert.equal(distinctCount(state), BASE_IDS.length);
  for (const id of BASE_IDS) assert.ok(state.collection[id]);
});

test('空权重时退化为普通档', () => {
  const rng = mulberry32(7);
  assert.equal(pickTierByWeight(rng, { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 }), 'n');
});

/** @covers F-003 */
test('原创合成的结果只由配方散列决定：同一对原料两次调用得到完全相同的名字', () => {
  const hash = hashString(recipeKey('water', 'steam'));
  const first = composeImprovised('water', 'steam', createState(), hash);
  const second = composeImprovised('water', 'steam', createState(), hash);
  assert.equal(first.names.zh, second.names.zh);
  assert.equal(first.names.en, second.names.en);
  assert.equal(first.names.ja, second.names.ja);
  assert.equal(first.id, second.id);
});

/** @covers F-004 */
test('重名检测统计同名原创词条，并排除正在生成的那一个', () => {
  const state = createState();
  const record = { count: 1, gen: 1, tier: 'n', improvised: true, names: { zh: '同名', en: 'Same', ja: '同名' }, glyph: '🧪' };
  state.collection['imp:a~b'] = { ...record };
  state.collection['imp:c~d'] = { ...record };
  assert.equal(countNameCollision(state, '同名', 'zh'), 2);
  assert.equal(countNameCollision(state, '同名', 'zh', 'imp:a~b'), 1);
  // 正式词条不参与原创词重名统计
  assert.equal(countNameCollision(state, '水', 'zh'), 0);
});

/** @covers F-004 */
test('原创词撞上已有同名原创词时会被加序号', () => {
  const state = createState();
  const hash = hashString(recipeKey('water', 'steam'));
  const first = composeImprovised('water', 'steam', state, hash);
  // 伪造一个同名但 id 不同的原创词条
  state.collection['imp:other~one'] = { count: 1, gen: 1, tier: 'n', improvised: true, names: { ...first.names }, glyph: '🧪' };
  const again = composeImprovised('water', 'steam', state, hash);
  assert.notEqual(again.names.zh, first.names.zh, '撞名后应改名字');
  assert.match(again.names.zh, /·\d+$/, '撞名后应追加序号');
});

/** @covers F-005 */
test('原创合成的稀有度权重：层数越深，普通档越轻、传说与神话档越重', () => {
  const shallow = improvisedTierWeights(1);
  const deep = improvisedTierWeights(6);
  assert.ok(shallow.n > deep.n, '普通档权重应随层数下降');
  assert.ok(deep.ssr > shallow.ssr, '传说档权重应随层数上升');
  assert.ok(deep.ur >= shallow.ur, '神话档权重不应随层数下降');
  // 层数被夹在 1..6，越界不改变权重
  assert.deepEqual(improvisedTierWeights(0), improvisedTierWeights(1));
  assert.deepEqual(improvisedTierWeights(99), improvisedTierWeights(6));
});

/** @covers F-006 */
test('合成层数表：基础元素 0 层，每熔炼一次 +1', () => {
  assert.equal(GENERATIONS.get('water'), 0);
  assert.equal(GENERATIONS.get('fire'), 0);
  assert.equal(GENERATIONS.get('steam'), 1);
  assert.equal(GENERATIONS.get('rain'), 2);
  // 层数随层严格递增：产物的层数大于两个原料的层数
  const state = createState();
  const fused = applyFusion(state, 'water', 'steam');
  const outId = fused.result.id;
  assert.ok(GENERATIONS.get(outId) > GENERATIONS.get('water'));
  assert.ok(GENERATIONS.get(outId) > GENERATIONS.get('steam'));
});

/** @covers F-009 */
test('图鉴词条描述与统计口径一致', () => {
  let state = createState();
  assert.equal(distinctCount(state), 4);
  const before = computeStats(state);
  assert.equal(before.distinct, 4);
  assert.equal(before.total, 4);
  assert.equal(before.maxGen, 0);

  state = applyFusion(state, 'water', 'fire').state;
  const after = computeStats(state);
  assert.equal(after.distinct, 5, '熔炼后应多一个词条');
  assert.equal(after.fusions, 1);
  assert.equal(after.discoveries, 1);
  assert.ok(after.maxGen >= 1, '最深层数应至少为 1');

  // 正式词条与原创词条用同一套描述口径
  const steam = describeElement('steam', state, 'zh');
  assert.equal(steam.name, '蒸汽');
  assert.equal(steam.improvised, false);
  assert.equal(steam.count, 1);
  assert.equal(describeElement('steam', state, 'en').name, 'Steam');
  assert.equal(describeElement('steam', state, 'ja').name, '蒸気');
  // 未收录的词条也能描述，但计数为 0
  const locked = describeElement('sun', state, 'zh');
  assert.equal(locked.count, 0);
  assert.equal(locked.improvised, false);
  // 完全不存在的 id 返回 null
  assert.equal(describeElement('not_an_element', state, 'zh'), null);
});

/** @covers F-009 */
test('原创词条在图鉴里被标记为原创，且能读到它的名字与层数', () => {
  const state = createState();
  // 选一对确定不在合成表里的原料，保证走的是原创分支
  assert.equal(RECIPE_MAP.has(recipeKey('water', 'smoke')), false, '该组合应当不在合成表内');
  const fused = applyFusion(state, 'water', 'smoke');
  const id = fused.result.id;
  const info = describeElement(id, fused.state, 'zh');
  assert.equal(info.improvised, true);
  assert.ok(info.name.length > 0);
  assert.ok(info.gen >= 1, '原创词条应有层数');
  assert.equal(fused.state.collection[id].improvised, true);
  // 原创词条不占用正式词条的位置
  assert.equal(Object.prototype.hasOwnProperty.call(ELEMENTS, id), false);
});

/** @covers F-010 */
test('每次熔炼都把配方记进手册，且键是顺序无关的', () => {
  let state = createState();
  state = applyFusion(state, 'water', 'fire').state;
  state = applyFusion(state, 'water', 'steam').state;
  assert.equal(Object.keys(state.recipes).length, 2, '手册应记录两条配方');
  const key = recipeKey('water', 'fire');
  assert.equal(state.recipes[key], 'steam', '手册键应为顺序无关的配方键');
  // 同一对原料重复熔炼不会新增配方条目
  state = applyFusion(state, 'fire', 'water').state;
  assert.equal(Object.keys(state.recipes).length, 2, '重复熔炼同一对原料不应新增配方');
});
