import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRID,
  LANDMARK_IDS,
  LANDMARKS,
  MAX_HEIGHT,
  MILESTONES,
  PALETTE,
  UPGRADES,
  UPGRADE_IDS,
  VIEW,
} from '../assets/data.js';
import {
  ACHIEVEMENTS,
  blockRect,
  buildIncome,
  countLandmarks,
  createDailyTown,
  createProfile,
  dexProgress,
  createTown,
  dailySeed,
  decodeTown,
  detectNeighborhood,
  encodeTown,
  findHint,
  gridSize,
  hitTest,
  matchLandmarks,
  milestoneState,
  mulberry32,
  paletteSize,
  placeBlock,
  removeBlock,
  serializeProfile,
  tallestBlock,
  builtCells,
  upgradeCost,
  applyUpgrade,
  applyEvent,
  deserializeProfile,
  valueNoise,
} from '../src/logic.js';

/**
 * 每种地标的最小构造：[列, 行, 颜色?][]，同一格连点 = 叠高层。
 */
const SCENARIOS = {
  foundation: [[5, 5]],
  house: [[5, 5], [6, 5]],
  spire: [[5, 5], [5, 5], [5, 5]],
  arch: [[5, 4], [5, 6], [5, 5]],
  stair: [[5, 5], [6, 5], [6, 5]],
  courtyard: [[4, 5], [6, 5], [5, 4], [5, 6]],
  plaza: [[5, 5], [6, 5], [5, 6], [6, 6]],
  lighthouse: [[5, 5], [5, 5], [5, 5], [6, 5], [6, 5], [6, 5, 1]],
  tower: [[5, 5], [5, 5], [5, 5], [5, 5]],
  harbor: [[1, 6], [0, 6]],
};

/* ── 数据完整性 ───────────────────────────────────── */

/** @covers F-001 */
test('地标 / 配色 / 里程碑 / 升级数据完整', () => {
  assert.equal(LANDMARK_IDS.length, 10);
  assert.equal(new Set(LANDMARK_IDS).size, 10);
  for (const lm of LANDMARKS) {
    assert.ok(lm.zh && lm.en && lm.ja, `${lm.id} 缺少三语名称`);
    assert.ok(lm.icon && lm.desc, `${lm.id} 缺少图标或说明`);
  }
  assert.equal(PALETTE.length, 9);
  for (const c of PALETTE) assert.match(c.fill, /^#[0-9a-f]{6}$/);
  assert.equal(MILESTONES.length, 2);
  for (const kind of UPGRADE_IDS) {
    assert.ok(UPGRADES[kind].base > 0 && UPGRADES[kind].growth > 1 && UPGRADES[kind].max > 0);
  }
  assert.equal(MAX_HEIGHT, 4);
  assert.ok(VIEW.cell > 0 && VIEW.off > 0);
});

/* ── 岛屿生成 ─────────────────────────────────────── */

/** @covers F-001 */
test('同种子生成同一座城，不同种子不同', () => {
  const a = createTown(1234, 0);
  const b = createTown(1234, 0);
  assert.deepEqual(a.depth, b.depth, '同种子的海深应一致');
  assert.deepEqual(a.heights, b.heights);
  assert.equal(a.seed, b.seed);
  const c = createTown(9999, 0);
  assert.notDeepEqual(a.depth, c.depth, '不同种子应长出不同的海岸线');
});

/** @covers F-001 */
test('海深都在 0–1 之间且有深浅变化', () => {
  const town = createTown(7, 0);
  assert.ok(town.depth.every((d) => d >= 0 && d <= 1));
  const max = Math.max(...town.depth);
  const min = Math.min(...town.depth);
  assert.ok(max - min > 0.2, '海深应有明显起伏');
});

/** @covers F-001 */
test('值噪声确定且连续', () => {
  const a = valueNoise(3.4, 2.1, 55);
  const b = valueNoise(3.4, 2.1, 55);
  assert.equal(a, b);
  assert.ok(a >= 0 && a <= 1);
  const near = valueNoise(3.41, 2.11, 55);
  assert.ok(Math.abs(a - near) < 0.05, '相邻采样应连续');
});

/** @covers F-008 */
test('网格尺寸随拓地等级增长', () => {
  const base = gridSize(0);
  assert.equal(base.cols, GRID.baseCols);
  assert.equal(gridSize(2).cols, GRID.baseCols + GRID.expandCols * 2);
  assert.equal(gridSize(99).cols, GRID.baseCols + GRID.expandCols * UPGRADES.expand.max, '等级应被夹在上限内');
  const town = createTown(3, 2);
  assert.equal(town.cols, gridSize(2).cols);
  assert.equal(town.heights.length, town.cols * town.rows);
});

/** @covers F-001 */
test('地脉数量正确且位置不重复', () => {
  const town = createTown(88, 0);
  assert.equal(town.veins.length, 3);
  assert.equal(new Set(town.veins.map((v) => v.key)).size, 3);
});

/** @covers F-012 */
test('每日岛屿同一天一致、不同天不同', () => {
  assert.equal(dailySeed('2026-11-25'), dailySeed('2026-11-25'));
  assert.notEqual(dailySeed('2026-11-25'), dailySeed('2026-11-26'));
  const a = createDailyTown('2026-11-25', 0);
  const b = createDailyTown('2026-11-25', 0);
  assert.deepEqual(a.depth, b.depth);
  assert.deepEqual(a.veins.map((v) => v.key), b.veins.map((v) => v.key));
});

/* ── 建造与拆除 ───────────────────────────────────── */

/** @covers F-003 */
test('起楼会加一层并记录建造次数', () => {
  const town = createTown(5, 0);
  const before = town.builds;
  const result = placeBlock(town, 3, 3, 2);
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(town.heights[3 * town.cols + 3], 1);
  assert.equal(town.colors[3 * town.cols + 3], 2);
  assert.equal(town.builds, before + 1);
});

/** @covers F-003 */
test('连续点击同一格会叠高，满层后改为换色', () => {
  const town = createTown(5, 0);
  for (let i = 0; i < MAX_HEIGHT; i += 1) placeBlock(town, 3, 3, 1);
  assert.equal(town.heights[3 * town.cols + 3], MAX_HEIGHT);
  placeBlock(town, 3, 3, 4);
  assert.equal(town.heights[3 * town.cols + 3], MAX_HEIGHT, '满层不该再长高');
  assert.equal(town.colors[3 * town.cols + 3], 4, '满层应改为换色');
});

/** @covers F-003 */
test('越界操作不生效', () => {
  const town = createTown(5, 0);
  const out = placeBlock(town, -1, 0, 0);
  assert.equal(out.ok, false);
  assert.equal(placeBlock(town, town.cols, 0, 0).ok, false);
  assert.equal(removeBlock(town, 0, town.rows, 0).ok, false);
});

/** @covers F-004 */
test('拆除会减层，且不会低于 0', () => {
  const town = createTown(5, 0);
  placeBlock(town, 3, 3, 0);
  placeBlock(town, 3, 3, 0);
  assert.equal(town.heights[3 * town.cols + 3], 2);
  removeBlock(town, 3, 3);
  assert.equal(town.heights[3 * town.cols + 3], 1);
  removeBlock(town, 3, 3);
  assert.equal(town.heights[3 * town.cols + 3], 0);
  const again = removeBlock(town, 3, 3);
  assert.equal(again.changed, false, '空地再拆不应有变化');
});

/** @covers F-005 */
test('统计：最高楼与已建地块数', () => {
  const town = createTown(5, 0);
  placeBlock(town, 3, 3, 0);
  placeBlock(town, 3, 3, 0);
  placeBlock(town, 4, 3, 0);
  assert.equal(tallestBlock(town), 2);
  assert.equal(builtCells(town), 2);
});

/* ── 地标规则 ─────────────────────────────────────── */

/** @covers F-002 */
test('十种地标都能被造出来', () => {
  for (const id of LANDMARK_IDS) {
    const steps = SCENARIOS[id];
    assert.ok(steps, `缺少 ${id} 的构造样本`);
    const town = createTown(999, 0);
    const found = new Set();
    for (const [c, r, color] of steps) {
      placeBlock(town, c, r, color ?? 0);
      for (const hit of detectNeighborhood(town, c, r)) found.add(hit);
    }
    assert.ok(found.has(id), `${id} 没被触发，实际触发: ${[...found].join(',')}`);
  }
});

/** @covers F-002 */
test('联排屋与孤塔互斥', () => {
  const town = createTown(999, 0);
  placeBlock(town, 5, 5, 0);
  placeBlock(town, 6, 5, 0);
  const hits = matchLandmarks(town, 6, 5);
  assert.equal(hits.includes('house'), true);
  assert.equal(hits.includes('spire'), false, '有等高邻居就不该是孤塔');

  const solo = createTown(999, 0);
  placeBlock(solo, 5, 5, 0);
  placeBlock(solo, 5, 5, 0);
  const soloHits = matchLandmarks(solo, 5, 5);
  assert.equal(soloHits.includes('spire'), true);
});

/** @covers F-002 */
test('高楼必须盖到第四层', () => {
  const town = createTown(999, 0);
  placeBlock(town, 5, 5, 0);
  placeBlock(town, 5, 5, 0);
  placeBlock(town, 5, 5, 0);
  assert.equal(matchLandmarks(town, 5, 5).includes('tower'), false);
  placeBlock(town, 5, 5, 0);
  assert.equal(matchLandmarks(town, 5, 5).includes('tower'), true);
});

/** @covers F-002 */
test('灯塔要求与唯一邻居颜色不同', () => {
  const town = createTown(999, 0);
  // 两座塔身等高、颜色相同
  for (let i = 0; i < 3; i += 1) placeBlock(town, 5, 5, 0);
  for (let i = 0; i < 3; i += 1) placeBlock(town, 6, 5, 0);
  assert.equal(matchLandmarks(town, 5, 5).includes('lighthouse'), false, '同色不该是灯塔');

  // 邻居改成异色（颜色在每次起楼时写入，第三层就能定色）
  const town2 = createTown(999, 0);
  for (let i = 0; i < 3; i += 1) placeBlock(town2, 5, 5, 0);
  placeBlock(town2, 6, 5, 0);
  placeBlock(town2, 6, 5, 0);
  placeBlock(town2, 6, 5, 1);
  assert.equal(matchLandmarks(town2, 6, 5).includes('lighthouse'), true, '异色应是灯塔');
});

/** @covers F-002 */
test('内院必须四面都是高墙围住的一格水', () => {
  const town = createTown(999, 0);
  placeBlock(town, 4, 5, 0);
  placeBlock(town, 6, 5, 0);
  placeBlock(town, 5, 4, 0);
  assert.equal(matchLandmarks(town, 5, 5).includes('courtyard'), false, '缺一面墙不算内院');
  placeBlock(town, 5, 6, 0);
  assert.equal(matchLandmarks(town, 5, 5).includes('courtyard'), true);
});

/** @covers F-002 */
test('方场需要 2×2 同高为 1', () => {
  const town = createTown(999, 0);
  placeBlock(town, 5, 5, 0);
  placeBlock(town, 6, 5, 0);
  placeBlock(town, 5, 6, 0);
  assert.equal(matchLandmarks(town, 5, 5).includes('plaza'), false, '缺一格不算方场');
  placeBlock(town, 6, 6, 0);
  assert.equal(matchLandmarks(town, 5, 5).includes('plaza'), true);
});

/** @covers F-002 */
test('全城地标计数与逐格统计一致', () => {
  const town = createTown(999, 0);
  for (const [c, r, color] of SCENARIOS.plaza) placeBlock(town, c, r, color ?? 0);
  const counts = countLandmarks(town);
  assert.equal(counts.plaza, 4, '2×2 的四格都算方场');
  let manual = 0;
  for (let r = 0; r < town.rows; r += 1) {
    for (let c = 0; c < town.cols; c += 1) {
      if (town.heights[r * town.cols + c] === 0) continue;
      if (matchLandmarks(town, c, r).includes('plaza')) manual += 1;
    }
  }
  assert.equal(counts.plaza, manual);
});

/* ── 命中检测 ─────────────────────────────────────── */

/** @covers F-005 */
test('命中检测：点方块落在那一格，点上层也是同一格', () => {
  const town = createTown(5, 0);
  placeBlock(town, 5, 5, 0);
  placeBlock(town, 5, 5, 0);
  const low = blockRect(5, 5, 0);
  const high = blockRect(5, 5, 1);
  assert.deepEqual(hitTest(town, low.x + 4, low.y + 4), { c: 5, r: 5, level: 0 });
  assert.deepEqual(hitTest(town, high.x + 4, high.y + 4), { c: 5, r: 5, level: 1 });
});

/** @covers F-005 */
test('命中检测：点空地落在那一格', () => {
  const town = createTown(5, 0);
  const hit = hitTest(town, 9 * VIEW.cell + 8, 9 * VIEW.cell + 8);
  assert.equal(hit.c, 9);
  assert.equal(hit.r, 9);
  assert.equal(hitTest(town, -50, -50), null);
});

/* ── 城镇代码 ─────────────────────────────────────── */

/** @covers F-009 */
test('城镇代码可以往返还原', () => {
  const town = createTown(31337, 0);
  placeBlock(town, 3, 3, 1);
  placeBlock(town, 3, 3, 2);
  placeBlock(town, 7, 5, 4);
  const code = encodeTown(town);
  const back = decodeTown(code);
  assert.ok(back);
  assert.deepEqual(back.heights, town.heights);
  assert.deepEqual(back.colors, town.colors);
  assert.equal(back.seed, town.seed);
});

/** @covers F-010 */
test('非法城镇代码返回 null', () => {
  assert.equal(decodeTown('nonsense'), null);
  assert.equal(decodeTown('TS1-zz!!'), null);
  assert.equal(decodeTown('TS0-abc-def'), null);
  assert.equal(decodeTown(''), null);
  assert.equal(decodeTown(null), null);
  assert.equal(decodeTown('TS1-abc-def'), null, '长度不符应被拒');
});

/* ── 勘测提示 ─────────────────────────────────────── */

/** @covers F-014 */
test('勘测提示只指向未发现的地标', () => {
  const town = createTown(999, 0);
  const hint = findHint(town, []);
  assert.ok(hint, '应能找到一个提示');
  assert.ok(LANDMARK_IDS.includes(hint.landmark));
  const known = LANDMARK_IDS.slice();
  assert.equal(findHint(town, known), null, '全都发现后不该再有提示');
});

/** @covers F-014 */
test('勘测提示不会改动城镇', () => {
  const town = createTown(999, 0);
  const before = [...town.heights];
  findHint(town, []);
  assert.deepEqual(town.heights, before, '提示计算不应留下痕迹');
});

/* ── 档案与成就 ───────────────────────────────────── */

/** @covers F-006 */
test('建造会结算铜钱并记入图鉴', () => {
  const profile = createProfile();
  const applied = applyEvent(profile, {
    type: 'build',
    landmarks: ['house'],
    coins: 5,
    vein: false,
    height: 1,
  });
  assert.equal(applied.profile.coins, 5);
  assert.equal(applied.profile.totalEarned, 5);
  assert.equal(applied.profile.dex.house.count, 1);
  assert.equal(applied.profile.stats.builds, 1);
  assert.equal(applied.profile.stats.discovered, 1);
  assert.ok(applied.milestones.length >= 1, '应解锁里程碑');
});

/** @covers F-007 */
test('地脉建造会累加地脉统计', () => {
  const profile = createProfile();
  const applied = applyEvent(profile, { type: 'build', landmarks: [], coins: 15, vein: true, height: 1 });
  assert.equal(applied.profile.stats.veinBuilds, 1);
});

/** @covers F-006 */
test('里程碑按数量判定', () => {
  const profile = createProfile();
  assert.equal(milestoneState(profile, 'house').first, false);
  profile.dex.house.count = 1;
  assert.equal(milestoneState(profile, 'house').first, true);
  assert.equal(milestoneState(profile, 'house').adept, false);
  profile.dex.house.count = 5;
  assert.equal(milestoneState(profile, 'house').adept, true);
});

/** @covers F-006 */
test('图鉴完成度统计正确', () => {
  const profile = createProfile();
  assert.equal(dexProgress(profile).done, 0);
  assert.equal(dexProgress(profile).total, LANDMARK_IDS.length * MILESTONES.length);
  profile.dex.house.count = 5;
  assert.equal(dexProgress(profile).done, 2);
});

/** @covers F-020 */
test('成就随进度解锁且只解锁一次', () => {
  const profile = createProfile();
  const applied = applyEvent(profile, { type: 'build', landmarks: [], coins: 1, vein: false, height: 1 });
  assert.equal(applied.profile.achievements.first_build, true);
  const again = applyEvent(applied.profile, { type: 'build', landmarks: [], coins: 1, vein: false, height: 1 });
  assert.equal(again.unlocked.length, 0, '成就不应重复解锁');
});

/** @covers F-020 */
test('所有成就都有三语文案', () => {
  for (const ach of ACHIEVEMENTS) {
    assert.ok(ach.zh && ach.en && ach.ja, `${ach.id} 缺少文案`);
    assert.equal(typeof ach.test, 'function');
  }
});

/* ── 工坊 ─────────────────────────────────────────── */

/** @covers F-008 */
test('升级扣钱、等级提升，价格递增', () => {
  let profile = createProfile();
  profile.coins = 5000;
  const result = applyUpgrade(profile, 'expand');
  assert.ok(result);
  assert.equal(result.profile.upgrades.expand, 1);
  assert.equal(result.profile.coins, 5000 - upgradeCost('expand', 0));
  assert.ok(upgradeCost('expand', 3) > upgradeCost('expand', 0));
  assert.equal(applyUpgrade({ ...profile, coins: 0 }, 'expand'), null);
  const maxed = { ...profile, upgrades: { ...profile.upgrades, expand: UPGRADES.expand.max } };
  assert.equal(applyUpgrade(maxed, 'expand'), null);
  assert.equal(applyUpgrade(profile, 'not_a_gear'), null);
});

/** @covers F-015 */
test('配色与产出随等级变化', () => {
  const profile = createProfile();
  assert.equal(paletteSize(profile), 5);
  profile.upgrades.palette = 4;
  assert.equal(paletteSize(profile), 9);
  assert.equal(buildIncome(profile), 1);
  profile.upgrades.income = 3;
  assert.equal(buildIncome(profile), 4);
});

/* ── 存档 ─────────────────────────────────────────── */

/** @covers F-017 */
test('档案往返与脏数据容错', () => {
  const profile = createProfile();
  profile.coins = 888;
  profile.dex.house.count = 3;
  profile.upgrades.expand = 2;
  const restored = deserializeProfile(serializeProfile(profile));
  assert.equal(restored.coins, 888);
  assert.equal(restored.dex.house.count, 3);
  assert.equal(restored.upgrades.expand, 2);

  const dirty = [
    null, '', 'not json', '[]', '"str"',
    '{"dex": "oops"}',
    '{"dex": {"house": {"count": "many"}}}',
    '{"upgrades": {"expand": 9999}}',
    '{"coins": -50}',
    '{"stats": {"builds": "x"}}',
    '{"achievements": {"nope": true}}',
  ];
  for (const raw of dirty) {
    const state = deserializeProfile(raw);
    assert.equal(typeof state, 'object');
    assert.ok(state.coins >= 0);
    for (const id of LANDMARK_IDS) assert.ok(state.dex[id].count >= 0);
    for (const id of UPGRADE_IDS) {
      assert.ok(state.upgrades[id] >= 0 && state.upgrades[id] <= UPGRADES[id].max);
    }
  }
});

/* ── 边界输入 ─────────────────────────────────────── */

/** @covers F-018 */
test('空档案的默认结构完整', () => {
  const profile = createProfile();
  assert.equal(profile.coins, 0);
  assert.equal(profile.stats.builds, 0);
  for (const id of LANDMARK_IDS) assert.ok(profile.dex[id]);
});

/** @covers F-001 */
test('散列与随机数可复现', () => {
  const a = mulberry32(2024);
  const b = mulberry32(2024);
  for (let i = 0; i < 50; i += 1) {
    const v = a();
    assert.ok(v >= 0 && v < 1);
    assert.equal(v, b());
  }
});

/* ── 本轮新增：审计查出的存档级缺陷 ─────────────────── */

/**
 * 拓地之后的城镇代码必须能还原。
 * 早期版本 `decodeTown()` 固定按 level 0 建城，长度校验必然失败 → 返回 null，
 * 于是玩家拓地后一刷新，整座城被静默丢弃。
 */
test('拓地等级 ≥1 的城镇代码可以完整往返', () => {
  for (const level of [1, 2, 3]) {
    const town = createTown(4242, level);
    placeBlock(town, 3, 3, 2);
    placeBlock(town, 4, 3, 3);
    placeBlock(town, 3, 4, 1);
    removeBlock(town, 5, 5);

    const code = encodeTown(town);
    assert.ok(code.startsWith('TS2-'), `代码应升到 TS2 格式，实际 ${code.slice(0, 6)}`);
    const back = decodeTown(code);
    assert.ok(back, `拓地 Lv.${level} 的城镇代码无法还原`);
    assert.equal(back.cols, town.cols, '还原后的列数应一致');
    assert.equal(back.rows, town.rows, '还原后的行数应一致');
    assert.equal(back.expandLevel, level, '还原后的拓地等级应一致');
    assert.deepEqual(back.heights, town.heights, '还原后每格高度应一致');
    assert.deepEqual(back.colors, town.colors, '还原后每格颜色应一致');
    assert.equal(back.builds, town.builds, '还原后建造次数应一致');
    assert.equal(back.removals, town.removals, '还原后拆除次数应一致');
  }
});

test('旧版 TS1 代码仍可还原（拓地等级按 0 处理）', () => {
  const town = createTown(777, 0);
  placeBlock(town, 2, 2, 1);
  const h = town.heights.map((v) => v.toString(36)).join('');
  const c = town.colors.map((v) => v.toString(36)).join('');
  const old = `TS1-${town.seed.toString(36)}-${h}-${c}`;

  const back = decodeTown(old);
  assert.ok(back, '旧版 TS1 代码应能还原');
  assert.deepEqual(back.heights, town.heights, '旧码还原后高度应一致');
  assert.equal(back.expandLevel, 0, '旧码的拓地等级按 0 还原');
});

test('还原外来城镇后不会白嫖「初基」：建造计数被带过去', () => {
  const town = createTown(31337, 0);
  placeBlock(town, 1, 1, 1);
  placeBlock(town, 2, 2, 1);
  const back = decodeTown(encodeTown(town));
  assert.equal(back.builds, 2, '还原后建造次数应与原城一致');
  assert.equal(back.builds !== 1, true, '还原后的建造次数不应等于 1（否则下一块会再次触发「初基」）');
});

test('非法代码仍然返回 null（不因格式升级而放松校验）', () => {
  assert.equal(decodeTown(''), null);
  assert.equal(decodeTown('garbage'), null);
  assert.equal(decodeTown('TS1-zz'), null);
  assert.equal(decodeTown('TS9-a-b-c-d-e-f'), null);
  // 高度超出 0–4 的码必须被拒
  const town = createTown(5, 0);
  const badH = '9'.repeat(town.heights.length);
  const bad = `TS2-${town.seed.toString(36)}-0-0-0-${badH}-${'0'.repeat(town.colors.length)}`;
  assert.equal(decodeTown(bad), null, '非法高度应被拒绝');
});

/* ── 难度契约：三档路线走同一套规则代码 ────────────────── */

/**
 * 弱化路线：随机乱点 200 次，图鉴拿不满 10 种地标。
 * 用的是和参考路线完全相同的规则代码（placeBlock → countLandmarks → applyEvent），
 * 差别只在「落子的策略」，不在判定逻辑。
 *
 * @covers F-002
 */
test('难度契约 · 弱化路线：随机乱点 200 次拿不满十种地标', () => {
  const town = createTown(20261127, 0);
  let profile = createProfile();
  const rng = mulberry32(9001);

  for (let i = 0; i < 200; i += 1) {
    const c = Math.floor(rng() * town.cols);
    const r = Math.floor(rng() * town.rows);
    const before = countLandmarks(town);
    const result = placeBlock(town, c, r, Math.floor(rng() * 5));
    if (!result.ok || !result.changed) continue;
    const after = countLandmarks(town);
    const fresh = Object.keys(after).filter((id) => (before[id] || 0) < (after[id] || 0));
    profile = applyEvent(profile, {
      type: 'build',
      landmarks: fresh,
      coins: 1 + fresh.length * 12,
      vein: result.vein,
      height: town.heights[r * town.cols + c],
    }).profile;
  }

  const found = Object.values(profile.dex).filter((d) => d.count > 0).length;
  assert.ok(found > 0, '随机乱点也该能撞上几种地标');
  assert.ok(
    found < 10,
    `随机乱点 200 次应拿不满十种地标（实际 ${found} 种）——若能拿满，说明地标判定太松`,
  );
});

/**
 * 挂机路线：完全不操作就没有任何进度。
 * 铜钱只由建造事件发放（doBuild → applyEvent），不存在时间驱动的被动收入。
 *
 * @covers F-007
 */
test('难度契约 · 挂机路线：不操作就没有铜钱与图鉴进度', () => {
  const profile = createProfile();
  // 空城：不调用 placeBlock / applyEvent
  assert.equal(profile.coins, 0, '挂机不应有铜钱');
  assert.equal(dexProgress(profile).done, 0, '挂机不应有任何图鉴进度');
  assert.equal(profile.stats.builds, 0, '挂机不应有建造次数');

  // 唯一的收入来源是建造事件
  const town = createTown(1, 0);
  const applied = applyEvent(profile, {
    type: 'build', landmarks: ['house'], coins: 13, vein: false, height: 1,
  });
  assert.equal(applied.profile.coins, 13, '建造事件才是铜钱来源');
  assert.equal(applied.profile.stats.builds, 1, '建造事件才计数');
});
