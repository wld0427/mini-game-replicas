import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MATERIALS,
  MATERIAL_IDS,
  MILESTONES,
  PHYSICS,
  PITY_LIMIT,
  UPGRADES,
  UPGRADE_IDS,
  WORLD,
} from '../assets/data.js';
import {
  ACHIEVEMENTS,
  FEEL,
  MAX_STEPS_PER_FRAME,
  addHitStop,
  addTrauma,
  advance,
  applyEvent,
  applyUpgrade,
  autoDropInterval,
  containerBounds,
  createFeel,
  createProfile,
  createSim,
  deserializeProfile,
  dexProgress,
  dropBall,
  feelTier,
  finishRun,
  hashString,
  isOverflowing,
  milestoneState,
  mulberry32,
  pityTarget,
  rollMaterial,
  serializeProfile,
  shakeOffset,
  stackHeight,
  stepPhysics,
  unlockedMaterials,
  updateFeel,
  upgradeCost,
} from '../src/logic.js';

const LEVELS = { width: 0, height: 0, dropper: 0, unlock: 0 };

/** 造一个场景：按给定材质与位置投放。 */
function sceneWith(list, upgrades = LEVELS) {
  const sim = createSim();
  const bounds = containerBounds(upgrades);
  for (const [mat, x] of list) dropBall(sim, mat, x, bounds);
  return { sim, bounds };
}

/** 把场景跑到全部静止（或超时）。 */
function settleAll(sim, bounds, maxSteps = 6000) {
  const events = [];
  for (let i = 0; i < maxSteps; i += 1) {
    for (const event of stepPhysics(sim, bounds, PHYSICS.dt)) events.push(event);
    if (events.some((e) => e.type === 'settle')) break;
  }
  return events;
}

/* ── 数据完整性 ───────────────────────────────────── */

test('七种材质的物理参数合法', () => {
  assert.equal(MATERIAL_IDS.length, 7);
  for (const id of MATERIAL_IDS) {
    const m = MATERIALS[id];
    assert.ok(m, `缺少材质 ${id}`);
    assert.ok(m.r > 0, `${id} 半径非法`);
    assert.ok(m.mass > 0, `${id} 质量非法`);
    assert.ok(m.rest >= 0 && m.rest <= 1, `${id} 弹性非法`);
    assert.ok(m.fric >= 0 && m.fric <= 1, `${id} 摩擦非法`);
    assert.ok(m.value > 0, `${id} 售价非法`);
    assert.match(m.color, /^#[0-9a-f]{6}$/, `${id} 颜色非法`);
    assert.ok(m.zh && m.en && m.ja, `${id} 缺少三语名称`);
  }
});

test('质量比不超过 1:10（否则堆叠会炸开）', () => {
  const masses = MATERIAL_IDS.map((id) => MATERIALS[id].mass);
  const ratio = Math.max(...masses) / Math.min(...masses);
  assert.ok(ratio <= 10, `质量比过大: ${ratio.toFixed(2)}`);
});

/* ── 容器与解锁 ───────────────────────────────────── */

test('容器尺寸随升级变化', () => {
  const narrow = containerBounds(LEVELS);
  const wide = containerBounds({ ...LEVELS, width: 3, height: 2 });
  assert.equal(wide.width - narrow.width, WORLD.widthPerLevel * 3);
  assert.equal(wide.height - narrow.height, WORLD.heightPerLevel * 2);
  assert.equal(narrow.left, 0);
  assert.equal(narrow.floor, narrow.height);
});

test('材质随解锁等级开放，最后一档解锁磁球与金球', () => {
  assert.deepEqual(unlockedMaterials(0), ['rubber']);
  assert.deepEqual(unlockedMaterials(3), ['rubber', 'iron', 'sticky', 'glass']);
  const last = unlockedMaterials(5);
  assert.equal(last.length, 7);
  assert.ok(last.includes('gold'));
  assert.ok(last.includes('magnet'));
});

test('自动投放间隔随投放器等级变短且有下限', () => {
  const base = autoDropInterval(LEVELS);
  const better = autoDropInterval({ ...LEVELS, dropper: 6 });
  assert.ok(better < base);
  assert.ok(better >= 400);
});

/* ── 保底 ─────────────────────────────────────────── */

test('只有一种材质时保底休眠', () => {
  const profile = createProfile();
  assert.equal(pityTarget(profile), null);
  profile.upgrades.unlock = 1;
  assert.equal(pityTarget(profile), 'iron');
  profile.upgrades.unlock = 5;
  assert.equal(pityTarget(profile), 'gold');
});

test('保底满时必出当前最好的一档', () => {
  const profile = createProfile();
  profile.upgrades.unlock = 5;
  profile.pity = PITY_LIMIT;
  const rng = mulberry32(11);
  for (let i = 0; i < 30; i += 1) {
    const rolled = rollMaterial(profile, rng);
    assert.equal(rolled.id, 'gold');
    assert.equal(rolled.pity, true);
  }
});

test('保底未满时按权重分布抽取', () => {
  const profile = createProfile();
  profile.upgrades.unlock = 5;
  profile.pity = 0;
  const rng = mulberry32(2026);
  const counts = {};
  for (let i = 0; i < 20000; i += 1) {
    const rolled = rollMaterial(profile, rng);
    counts[rolled.id] = (counts[rolled.id] || 0) + 1;
  }
  assert.ok(counts.rubber / 20000 > 0.35, `普通材质占比过高: ${counts.rubber / 20000}`);
  assert.ok(counts.gold / 20000 > 0.002 && counts.gold / 20000 < 0.012, `金球比例异常: ${counts.gold / 20000}`);
  assert.ok(counts.rubber > counts.iron, '越稀有越少见');
  assert.ok(counts.iron > counts.glass);
});

test('抽到保底目标时保底计数清零', () => {
  const profile = createProfile();
  profile.upgrades.unlock = 1;
  profile.pity = 5;
  const applied = applyEvent(profile, { type: 'drop', mat: 'iron' });
  assert.equal(applied.profile.pity, 0);
  const other = applyEvent(applied.profile, { type: 'drop', mat: 'rubber' });
  assert.equal(other.profile.pity, 1);
});

/* ── 物理：确定性与帧率无关 ───────────────────────── */

test('同样的初始状态 + 同样的操作序列 → 同样的结果', () => {
  const run = () => {
    const { sim, bounds } = sceneWith([['rubber', 20], ['iron', 30]]);
    for (let i = 0; i < 500; i += 1) stepPhysics(sim, bounds, PHYSICS.dt);
    return sim.balls.map((b) => `${b.x.toFixed(6)},${b.y.toFixed(6)}`).join('|');
  };
  assert.equal(run(), run(), '物理必须是确定性的');
});

test('帧率无关：不同帧率下步数差不超过 1，余量被保留', () => {
  const at = (frameDt, frames) => {
    const { sim, bounds } = sceneWith([['rubber', 28]]);
    let steps = 0;
    for (let f = 0; f < frames; f += 1) steps += advance(sim, bounds, frameDt).steps;
    return { steps, y: sim.balls[0].y };
  };
  const a = at(1 / 30, 60);
  const b = at(1 / 144, 288);
  assert.ok(Math.abs(a.steps - b.steps) <= 1, `步数差过大: ${a.steps} vs ${b.steps}`);
  assert.ok(Math.abs(a.y - b.y) < 1.0, `位置差过大: ${a.y} vs ${b.y}`);
});

test('卡顿后单帧推进步数有上限（不会把球甩飞）', () => {
  const { sim, bounds } = sceneWith([['rubber', 28]]);
  const result = advance(sim, bounds, 5);
  assert.ok(result.steps <= MAX_STEPS_PER_FRAME, `单帧步数过多: ${result.steps}`);
  assert.ok(Math.abs(sim.balls[0].vy) <= PHYSICS.maxSpeed + 1, '速度应被上限约束');
});

test('速度上限保证单步位移小于最小半径（防穿模）', () => {
  const { sim, bounds } = sceneWith([['rubber', 28]]);
  for (let i = 0; i < 400; i += 1) stepPhysics(sim, bounds, PHYSICS.dt);
  const ball = sim.balls[0];
  const travel = Math.hypot(ball.vx, ball.vy) * PHYSICS.dt;
  const minRadius = Math.min(...MATERIAL_IDS.map((id) => MATERIALS[id].r));
  assert.ok(travel < minRadius * 0.8, `单步位移 ${travel.toFixed(3)} 应小于最小半径 ${minRadius}`);
});

/* ── 物理：堆叠与睡眠 ─────────────────────────────── */

test('球落到底后会停在地板上', () => {
  const { sim, bounds } = sceneWith([['rubber', 28]]);
  settleAll(sim, bounds);
  const ball = sim.balls[0];
  assert.equal(ball.asleep, true);
  assert.ok(Math.abs(ball.y - (bounds.floor - ball.r)) < 0.2, `停靠位置异常: ${ball.y}`);
});

test('堆叠的球不会互相穿透', () => {
  const { sim, bounds } = sceneWith([['rubber', 20], ['rubber', 26], ['rubber', 32], ['iron', 23]]);
  for (let i = 0; i < 4000; i += 1) stepPhysics(sim, bounds, PHYSICS.dt);
  let minGap = Infinity;
  for (let i = 0; i < sim.balls.length; i += 1) {
    for (let j = i + 1; j < sim.balls.length; j += 1) {
      const a = sim.balls[i];
      const b = sim.balls[j];
      const gap = Math.hypot(b.x - a.x, b.y - a.y) - (a.r + b.r);
      if (gap < minGap) minGap = gap;
    }
  }
  assert.ok(minGap > -0.2, `出现明显穿透: ${minGap.toFixed(3)}`);
  assert.equal(sim.balls.filter((b) => b.asleep).length, sim.balls.length, '所有球都应静止');
});

test('睡着的球被撞到会醒过来', () => {
  const { sim, bounds } = sceneWith([['iron', 20]]);
  for (let i = 0; i < 3000; i += 1) stepPhysics(sim, bounds, PHYSICS.dt);
  const sleeper = sim.balls[0];
  assert.equal(sleeper.asleep, true);
  dropBall(sim, 'iron', sleeper.x, bounds);
  const other = sim.balls[1];
  other.vy = 60;   // y 向下为正：给它一个向下的初速度砸过去
  other.asleep = false;
  let woke = false;
  for (let i = 0; i < 400 && !woke; i += 1) {
    stepPhysics(sim, bounds, PHYSICS.dt);
    if (!sleeper.asleep) woke = true;
  }
  assert.equal(woke, true, '被撞的球应醒来');
});

/* ── 特殊材质 ─────────────────────────────────────── */

test('磁球会吸引作用范围内的球，且不会把球吸穿过去', () => {
  const { sim, bounds } = sceneWith([['magnet', 24], ['iron', 32]]);
  const before = sim.balls[1].x - sim.balls[0].x;
  for (let i = 0; i < 200; i += 1) stepPhysics(sim, bounds, PHYSICS.dt);
  const after = sim.balls[1].x - sim.balls[0].x;
  assert.ok(after < before, `磁球应把铁球拉近: ${before.toFixed(2)} → ${after.toFixed(2)}`);
  const distance = Math.hypot(sim.balls[1].x - sim.balls[0].x, sim.balls[1].y - sim.balls[0].y);
  const minDist = sim.balls[0].r + sim.balls[1].r;
  assert.ok(distance > minDist - 0.3, `磁力把球吸穿了: ${distance.toFixed(2)} < ${minDist.toFixed(2)}`);
});

test('超出作用范围则不吸引', () => {
  const { sim, bounds } = sceneWith([['magnet', 20], ['iron', 20 + PHYSICS.magnetRange + 6]]);
  const before = sim.balls[1].x - sim.balls[0].x;
  for (let i = 0; i < 200; i += 1) stepPhysics(sim, bounds, PHYSICS.dt);
  const after = sim.balls[1].x - sim.balls[0].x;
  assert.ok(Math.abs(after - before) < 1.5, `超出范围不该被吸引: ${before.toFixed(2)} → ${after.toFixed(2)}`);
});

test('火球撞击够猛会爆裂并推动邻居', () => {
  const { sim, bounds } = sceneWith([['flame', 28], ['iron', 34]]);
  let burst = null;
  for (let i = 0; i < 800 && !burst; i += 1) {
    for (const event of stepPhysics(sim, bounds, PHYSICS.dt)) {
      if (event.type === 'burst') burst = event;
    }
  }
  assert.ok(burst, '火球应会爆裂');
  assert.equal(sim.balls.filter((b) => b.mat === 'flame').length, 0, '爆裂后自身应被移除');
});

test('黏球几乎不弹、铁球弹不高', () => {
  const peakOf = (mat) => {
    const { sim, bounds } = sceneWith([[mat, 28]]);
    let landed = false;
    let peak = 0;
    let base = 0;
    for (let i = 0; i < 900; i += 1) {
      const prevVy = sim.balls[0].vy;
      stepPhysics(sim, bounds, PHYSICS.dt);
      // 速度由正转负 = 刚落地反弹
      if (!landed && prevVy > 0 && sim.balls[0].vy < 0) {
        landed = true;
        base = sim.balls[0].y;
      }
      if (landed && sim.balls[0].vy < 0) peak = Math.max(peak, base - sim.balls[0].y);
    }
    return peak;
  };
  const rubber = peakOf('rubber');
  const iron = peakOf('iron');
  const sticky = peakOf('sticky');
  assert.ok(rubber > iron, `橡皮球应比铁球弹得高: ${rubber.toFixed(2)} vs ${iron.toFixed(2)}`);
  assert.ok(sticky < iron, `黏球几乎不弹: ${sticky.toFixed(2)} vs ${iron.toFixed(2)}`);
});

/* ── 投放与溢出 ───────────────────────────────────── */

test('投放点被「已定住」的球占住时拒绝投放', () => {
  const { sim, bounds } = sceneWith([['rubber', 28]]);
  // 正在下落的球不挡投放位（它马上就走了，挡住下一颗会让手感莫名其妙卡住）
  const whileFalling = dropBall(sim, 'rubber', 28, bounds);
  assert.equal(whileFalling.ok, true, '下落中的球不应挡住投放');

  // 堆到投放线附近时，同一位置就放不下了
  const sim2 = sceneWith([['rubber', 28]]).sim;
  const pile = sim2.balls[0];
  pile.asleep = true;
  pile.y = pile.r + 0.5;
  const blocked = dropBall(sim2, 'rubber', 28, bounds);
  assert.equal(blocked.ok, false, '堆到投放线的球应挡住该位置');
  const far = dropBall(sim2, 'rubber', 46, bounds);
  assert.equal(far.ok, true, '别的位置仍可投放');
});

test('球数达到上限时拒绝投放', () => {
  const sim = createSim();
  const bounds = containerBounds(LEVELS);
  let placed = 0;
  for (let i = 0; i < PHYSICS.maxBalls + 5; i += 1) {
    const x = 2 + (i % 12) * 4.4;
    if (dropBall(sim, 'rubber', x, bounds).ok) placed += 1;
  }
  assert.ok(placed <= PHYSICS.maxBalls, `球数应受上限约束: ${placed}`);
});

test('堆到顶会判定为溢出', () => {
  const { sim, bounds } = sceneWith([['rubber', 28]]);
  assert.equal(isOverflowing(sim, bounds), false, '刚投放还不算溢出');
  for (const b of sim.balls) {
    b.asleep = true;
    b.y = bounds.top + 1;
    b.r = 1;
  }
  assert.equal(isOverflowing(sim, bounds), true);
  assert.equal(stackHeight(sim), bounds.top + 0);
});

/* ── 图鉴与档案 ───────────────────────────────────── */

test('落定会结算铜钱并计入图鉴', () => {
  const profile = createProfile();
  const applied = applyEvent(profile, { type: 'settle', mat: 'gold', value: 170 });
  assert.equal(applied.profile.coins, 170);
  assert.equal(applied.profile.totalEarned, 170);
  assert.equal(applied.profile.codex.gold.settled, 1);
  assert.equal(applied.profile.codex.gold.value, 170);
  assert.equal(applied.profile.stats.settled, 1);
});

test('投放会累计图鉴并推进统计', () => {
  const profile = createProfile();
  let next = applyEvent(profile, { type: 'drop', mat: 'rubber' }).profile;
  next = applyEvent(next, { type: 'drop', mat: 'rubber' }).profile;
  assert.equal(next.codex.rubber.dropped, 2);
  assert.equal(next.stats.balls, 2);
});

test('里程碑按投放次数判定', () => {
  const profile = createProfile();
  assert.equal(milestoneState(profile, 'iron').first, false);
  profile.codex.iron.dropped = 12;
  const state = milestoneState(profile, 'iron');
  assert.equal(state.first, true);
  assert.equal(state.regular, true);
  assert.equal(state.collector, false);
});

test('图鉴进度统计正确', () => {
  const profile = createProfile();
  assert.equal(dexProgress(profile).done, 0);
  assert.equal(dexProgress(profile).total, MATERIAL_IDS.length * MILESTONES.length);
  profile.codex.iron.dropped = 45;
  assert.equal(dexProgress(profile).done, 3);
});

test('成就随进度解锁', () => {
  const profile = createProfile();
  const applied = applyEvent(profile, { type: 'drop', mat: 'rubber' });
  assert.ok(applied.unlocked.some((a) => a.id === 'first_ball'), '应解锁「初次投球」');
  assert.equal(applied.profile.achievements.first_ball, true);
});

test('所有成就都有三语文案', () => {
  for (const ach of ACHIEVEMENTS) {
    assert.ok(ach.zh && ach.en && ach.ja, `${ach.id} 缺少文案`);
    assert.equal(typeof ach.test, 'function');
  }
});

test('一局结束会记录局数与最高堆叠', () => {
  const profile = createProfile();
  const next = finishRun(profile, 23);
  assert.equal(next.stats.runs, 1);
  assert.equal(next.stats.bestStack, 23);
});

/* ── 装备 ─────────────────────────────────────────── */

test('升级扣钱、升级等级，价格随等级递增', () => {
  let profile = createProfile();
  profile.coins = 1000;
  const result = applyUpgrade(profile, 'width');
  assert.ok(result);
  assert.equal(result.profile.upgrades.width, 1);
  assert.equal(result.profile.coins, 1000 - upgradeCost('width', 0));
  assert.ok(upgradeCost('width', 3) > upgradeCost('width', 0), '价格应递增');

  assert.equal(applyUpgrade({ ...profile, coins: 0 }, 'width'), null, '钱不够不应升级');
  const maxed = { ...profile, upgrades: { ...profile.upgrades, width: UPGRADES.width.max } };
  assert.equal(applyUpgrade(maxed, 'width'), null, '满级不应再升级');
  assert.equal(applyUpgrade(profile, 'not_a_gear'), null, '未知装备不应升级');
});

/* ── 手感层 ───────────────────────────────────────── */

test('创伤值会在 1/decay 秒内归零', () => {
  const feel = createFeel();
  addTrauma(feel, 1);
  let elapsed = 0;
  while (feel.trauma > 0 && elapsed < 5) {
    updateFeel(feel, 1 / 60);
    elapsed += 1 / 60;
  }
  assert.ok(Math.abs(elapsed - 1 / FEEL.traumaDecay) < 0.05, `归零耗时 ${elapsed.toFixed(3)}s`);
});

test('打击停顿结束后时间倍率必须回到 1', () => {
  const feel = createFeel();
  addHitStop(feel, 0.1);
  let scale = 1;
  let restored = -1;
  for (let i = 0; i < 120; i += 1) {
    if (i === 2) addHitStop(feel, 0.1); // 30ms 内触发两次
    scale = updateFeel(feel, 1 / 60);
    if (scale === 1 && restored < 0 && i > 4) restored = i / 60;
  }
  assert.equal(scale, 1, '结束时倍率必须是 1');
  assert.ok(restored >= 0.13, `恢复太早: ${restored.toFixed(3)}s`);
});

test('抖动偏移是 trauma 的平方，且可被关闭', () => {
  const feel = createFeel();
  feel.phase = 1;
  addTrauma(feel, 0.5);
  const half = shakeOffset(feel);
  feel.trauma = 1;
  const full = shakeOffset(feel);
  assert.ok(Math.abs(full.x) > Math.abs(half.x), '创伤越大抖得越狠');
  feel.reduceMotion = true;
  assert.deepEqual(shakeOffset(feel), { x: 0, y: 0 }, '减少动效时应不抖');
});

test('事件分级：爆破比落定更重', () => {
  assert.ok(feelTier('burst').trauma > feelTier('settle').trauma);
  assert.ok(feelTier('burst').hitStop > feelTier('settle').hitStop);
  assert.ok(feelTier('over').trauma >= feelTier('burst').trauma);
});

/* ── 性能预算 ─────────────────────────────────────── */

test('满罐物理在预算内跑完（性能护栏）', () => {
  const sim = createSim();
  const bounds = containerBounds({ ...LEVELS, width: 3, height: 2 });
  for (let i = 0; i < PHYSICS.maxBalls; i += 1) {
    dropBall(sim, 'rubber', 4 + (i % 14) * 4.2, bounds);
  }
  const started = Date.now();
  for (let i = 0; i < 120; i += 1) stepPhysics(sim, bounds, PHYSICS.dt);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 500, `120 步满罐物理耗时 ${elapsed}ms，超出预算`);
});

/* ── 存档 ─────────────────────────────────────────── */

test('档案往返与脏数据容错', () => {
  const profile = createProfile();
  profile.coins = 777;
  profile.codex.gold.dropped = 9;
  profile.upgrades.unlock = 3;
  const restored = deserializeProfile(serializeProfile(profile));
  assert.equal(restored.coins, 777);
  assert.equal(restored.codex.gold.dropped, 9);
  assert.equal(restored.upgrades.unlock, 3);

  const dirty = [
    null, '', 'not json', '[]', '"str"',
    '{"codex": "oops"}',
    '{"codex": {"gold": {"dropped": "many"}}}',
    '{"upgrades": {"unlock": 9999}}',
    '{"coins": -12}',
    '{"stats": {"balls": "x"}}',
    '{"achievements": {"nope": true}}',
  ];
  for (const raw of dirty) {
    const state = deserializeProfile(raw);
    assert.equal(typeof state, 'object');
    assert.ok(state.coins >= 0);
    assert.ok(state.pity >= 0);
    for (const id of MATERIAL_IDS) {
      assert.ok(state.codex[id].dropped >= 0);
      assert.ok(state.codex[id].settled >= 0);
    }
    for (const id of UPGRADE_IDS) {
      assert.ok(state.upgrades[id] >= 0 && state.upgrades[id] <= UPGRADES[id].max);
    }
  }
});

/* ── 边界输入 ─────────────────────────────────────── */

test('未知材质不会被投放', () => {
  const sim = createSim();
  const bounds = containerBounds(LEVELS);
  const result = dropBall(sim, 'unobtainium', 20, bounds);
  assert.equal(result.ok, false);
  assert.equal(result.ball, null);
});

test('散列函数稳定', () => {
  assert.equal(hashString('ball'), hashString('ball'));
  assert.notEqual(hashString('ball'), hashString('balls'));
});
