import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CELL_COUNT,
  GRID_H,
  GRID_W,
  ENVELOPE_DECAY,
  LIT_RATIO,
  MAX_STEPS_PER_FRAME,
  SOURCE_AMP,
  SOURCE_PERIOD,
  STEP_MS,
  WAVE_C2,
  WAVE_DAMP,
  checkLose,
  checkWin,
  createField,
  createGame,
  createLevel,
  createProfile,
  deserializeProfile,
  evaluateTargets,
  hashString,
  moveSource,
  mulberry32,
  placeSource,
  recordClear,
  resonanceScore,
  serializeProfile,
  stepWave,
  tick,
  updateEnvelope,
} from '../src/logic.js';

/** 跑一局到稳定态：给定步数，返回游戏状态。 */
function run(game, steps) {
  for (let i = 0; i < steps; i += 1) tick(game, STEP_MS);
  return game;
}

/** @covers F-001 */
test('波场数据结构：160×90，三份浮点数组 + 礁石掩码', () => {
  const f = createField();
  assert.equal(f.w, GRID_W);
  assert.equal(f.h, GRID_H);
  assert.equal(f.u.length, CELL_COUNT);
  assert.equal(f.uPrev.length, CELL_COUNT);
  assert.equal(f.uNext.length, CELL_COUNT);
  assert.equal(f.env.length, CELL_COUNT);
  assert.equal(f.obstacles.length, CELL_COUNT);
  assert.equal(f.u.reduce((a, b) => a + b, 0), 0, '初始位移应全为 0');
  assert.equal(f.env.reduce((a, b) => a + b, 0), 0, '初始包络应全为 0');
});

/** @covers F-002 */
test('定步长积分：同一初态两次积分结果逐格相等，且不出现 NaN', () => {
  const mk = () => {
    const f = createField();
    return f;
  };
  const a = mk();
  const b = mk();
  const src = [{ x: 80, y: 45 }];
  for (let t = 0; t < 120; t += 1) {
    stepWave(a, src, t);
    stepWave(b, src, t);
  }
  for (let i = 0; i < CELL_COUNT; i += 1) {
    assert.equal(a.u[i], b.u[i], `第 ${i} 格两次积分结果应一致`);
    assert.ok(Number.isFinite(a.u[i]), '位移不应出现 NaN / Infinity');
    assert.ok(Math.abs(a.u[i]) <= 4, `位移不应失控（${a.u[i]}）`);
  }
});

/** @covers F-002 */
test('波不会在网格边界绕回：最外一圈恒为 0', () => {
  const f = createField();
  const src = [{ x: 3, y: 3 }];
  for (let t = 0; t < 200; t += 1) stepWave(f, src, t);
  for (let c = 0; c < GRID_W; c += 1) {
    assert.equal(f.u[c], 0, '上边界应恒为 0');
    assert.equal(f.u[(GRID_H - 1) * GRID_W + c], 0, '下边界应恒为 0');
  }
  for (let r = 0; r < GRID_H; r += 1) {
    assert.equal(f.u[r * GRID_W], 0, '左边界应恒为 0');
    assert.equal(f.u[r * GRID_W + GRID_W - 1], 0, '右边界应恒为 0');
  }
});

/** @covers F-003 */
test('波源驱动：源格位移等于相干正弦驱动值', () => {
  const f = createField();
  const src = [{ x: 60, y: 40 }];
  for (let t = 1; t <= 8; t += 1) {
    stepWave(f, src, t);
    const idx = 40 * GRID_W + 60;
    const expected = SOURCE_AMP * Math.sin(2 * Math.PI * (t % SOURCE_PERIOD) / SOURCE_PERIOD);
    assert.ok(Math.abs(f.u[idx] - expected) < 1e-5, `第 ${t} 步源格应等于驱动值`);
  }
});

/** @covers F-003 */
test('多个波源同相位（相干源才有干涉）', () => {
  const f = createField();
  const src = [{ x: 40, y: 40 }, { x: 90, y: 40 }];
  stepWave(f, src, 5);
  const i1 = 40 * GRID_W + 40;
  const i2 = 40 * GRID_W + 90;
  assert.ok(Math.abs(f.u[i1] - f.u[i2]) < 1e-6, '两个源应同相位');
});

/** @covers F-004 */
test('礁石吸收：礁石格恒为 0，且波穿不过去', () => {
  const f = createField();
  // 整列墙（不留绕行的缺口）
  for (let r = 1; r < GRID_H - 1; r += 1) f.obstacles[r * GRID_W + 80] = 1;
  const src = [{ x: 60, y: 25 }];
  for (let t = 0; t < 200; t += 1) stepWave(f, src, t);
  for (let r = 1; r < GRID_H - 1; r += 1) {
    assert.equal(f.u[r * GRID_W + 80], 0, '礁石格应恒为 0');
  }
  // 墙右侧不应收到左侧的波
  let rightEnergy = 0;
  for (let r = 1; r < GRID_H - 1; r += 1) {
    for (let c = 81; c < 100; c += 1) rightEnergy += Math.abs(f.u[r * GRID_W + c]);
  }
  assert.ok(rightEnergy < 1e-6, `礁石应挡住波（右侧能量 ${rightEnergy}）`);
});

/** @covers F-005 */
test('振幅包络：始终不小于当前振幅，且衰减后单调不增', () => {
  const f = createField();
  const src = [{ x: 80, y: 45 }];
  for (let t = 0; t < 60; t += 1) {
    stepWave(f, src, t);
    updateEnvelope(f);
  }
  for (let i = 0; i < CELL_COUNT; i += 1) {
    assert.ok(f.env[i] >= Math.abs(f.u[i]) - 1e-6, '包络应不小于当前振幅');
  }
  // 停掉源之后包络峰值只降不升
  const peak = (env) => {
    let m = 0;
    for (let i = 0; i < env.length; i += 1) if (env[i] > m) m = env[i];
    return m;
  };
  const before = peak(f.env);
  for (let t = 60; t < 240; t += 1) {
    stepWave(f, [], t);
    updateEnvelope(f);
  }
  const after = peak(f.env);
  assert.ok(after <= before, '包络峰值不应上升');
  assert.ok(after < before, `源停掉后包络峰值应下降（${before} → ${after}）`);
});

/** @covers F-005 */
test('包络衰减系数在 (0,1) 之间', () => {
  assert.ok(ENVELOPE_DECAY > 0 && ENVELOPE_DECAY < 1);
});

/** @covers F-006 */
test('共鸣点判定：包络越过各自阈值即点亮', () => {
  const level = createLevel(7, 0);
  assert.ok(level.targets.length >= 1, '关卡应至少有一个共鸣点');
  const game = createGame(level);
  // 人为把某个目标格的包络顶到阈值之上
  const t = game.targets[0];
  const idx = t.y * GRID_W + t.x;
  game.field.env[idx] = t.threshold * 2;
  const all = evaluateTargets(game);
  assert.equal(game.lit[0], true, '包络越过阈值应点亮');
  assert.equal(all, game.targets.length === 1, '全部点亮判定应与 lit 一致');

  game.field.env[idx] = t.threshold * 0.5;
  evaluateTargets(game);
  assert.equal(game.lit[0], false, '包络低于阈值应熄灭');
});

/** @covers F-006 */
test('点亮阈值是标准解峰值的固定比例', () => {
  const level = createLevel(7, 0);
  for (const t of level.targets) {
    assert.ok(Math.abs(t.threshold - t.peak * LIT_RATIO) < 1e-9, '阈值应等于峰值 × 比例');
  }
});

/** @covers F-007 */
test('关卡生成：同一 seed 两次生成完全一致', () => {
  const a = createLevel(2026, 2);
  const b = createLevel(2026, 2);
  assert.deepEqual(Array.from(a.obstacles), Array.from(b.obstacles), '礁石布局应一致');
  assert.deepEqual(a.targets, b.targets, '共鸣点应一致');
  assert.deepEqual(a.solution, b.solution, '标准解源位置应一致');
});

/** @covers F-007 */
test('关卡生成：用标准解源位置模拟后，每个共鸣点都达到阈值（保证有解）', () => {
  for (let index = 0; index < 3; index += 1) {
    const level = createLevel(99, index);
    assert.ok(level.targets.length >= 1, `第 ${index} 关应有共鸣点`);
    const game = createGame(level);
    // 必须把源放到标准解上再模拟，否则测的是起点而不是解
    placeSource(game, level.solution.x, level.solution.y);
    run(game, 460);
    for (let i = 0; i < game.targets.length; i += 1) {
      const t = game.targets[i];
      const idx = t.y * GRID_W + t.x;
      assert.ok(
        game.field.env[idx] >= t.threshold,
        `第 ${index} 关第 ${i} 个共鸣点用标准解也点不亮，关卡无解`,
      );
    }
  }
});

/** @covers F-008 */
test('波源移动：坐标更新，越界被拒', () => {
  const level = createLevel(3, 0);
  const game = createGame(level);
  const before = { ...game.sources[0] };
  assert.equal(moveSource(game, 2, -1), true, '合法移动应成功');
  assert.equal(game.sources[0].x, before.x + 2);
  assert.equal(game.sources[0].y, before.y - 1);

  assert.equal(moveSource(game, -999, 0), false, '越界移动应被拒');
  assert.equal(game.sources[0].x, before.x + 2, '越界后坐标不应改变');
  assert.equal(moveSource(game, 0, -999), false);
  assert.equal(game.sources[0].y, before.y - 1);
});

/** @covers F-009 */
test('移动波源不直接改判定：lit 不变，波场变', () => {
  const level = createLevel(5, 0);
  const game = createGame(level);
  run(game, 120);
  const litBefore = game.lit.slice();
  const envBefore = game.field.env.reduce((a, b) => a + b, 0);

  moveSource(game, 3, 0);
  assert.deepEqual(game.lit, litBefore, '移动不应直接改 lit');
  run(game, 30);
  const envAfter = game.field.env.reduce((a, b) => a + b, 0);
  assert.notEqual(envAfter, envBefore, '移动后波场应发生变化');
});

/** @covers F-010 */
test('胜负判定：全亮为胜，超时未全亮为负', () => {
  const level = createLevel(11, 0);
  const game = createGame(level);
  assert.equal(checkWin(game), false, '初始不应已胜');
  game.timeLeft = 0;
  assert.equal(checkLose(game), true, '超时且未全亮应判负');

  for (let i = 0; i < game.targets.length; i += 1) {
    const t = game.targets[i];
    game.field.env[t.y * GRID_W + t.x] = t.threshold * 2;
  }
  evaluateTargets(game);
  assert.equal(checkWin(game), true, '全亮应判胜');
  assert.equal(checkLose(game), false, '全亮时不应判负');
});

/** @covers F-011 */
test('共鸣值：全未亮为 0，全亮为 1，中间态落在 (0,1)', () => {
  const level = createLevel(13, 0);
  const game = createGame(level);
  game.field.env.fill(0);
  evaluateTargets(game);
  assert.equal(resonanceScore(game), 0, '全未亮时共鸣值应为 0');

  const t = game.targets[0];
  game.field.env[t.y * GRID_W + t.x] = t.threshold * 0.5;
  evaluateTargets(game);
  const mid = resonanceScore(game);
  assert.ok(mid > 0 && mid < 1, `中间态共鸣值应落在 (0,1)，实际 ${mid}`);

  for (const tg of game.targets) game.field.env[tg.y * GRID_W + tg.x] = tg.threshold * 2;
  evaluateTargets(game);
  assert.equal(resonanceScore(game), 1, '全亮时共鸣值应为 1');
});

/** @covers F-012 */
test('帧推进：定步长累加，单帧步数有上限', () => {
  const level = createLevel(17, 0);
  const game = createGame(level);
  const step0 = game.step;
  tick(game, 1000);
  const advanced = game.step - step0;
  assert.equal(advanced, MAX_STEPS_PER_FRAME, `单帧步数应被上限截断为 ${MAX_STEPS_PER_FRAME}`);
  assert.ok(Number.isFinite(game.timeLeft) && game.timeLeft >= 0, '剩余时间不应为负或非法');
});

/** @covers F-012 */
test('帧推进：定时长被正确消耗', () => {
  const level = createLevel(19, 0);
  const game = createGame(level);
  const t0 = game.timeLeft;
  for (let i = 0; i < 60; i += 1) tick(game, STEP_MS);
  assert.ok(Math.abs((t0 - game.timeLeft) - 1) < 0.05, '1 秒应消耗约 1 秒时间');
});

/** @covers F-020 */
test('档案：记录通关成绩并解锁下一关，存档往返一致', () => {
  const p = createProfile();
  const next = recordClear(p, 0, 12.5, 0.8);
  assert.equal(next.unlocked, 2, '通关第 1 关应解锁第 2 关');
  assert.equal(next.progress['0'].bestTime, 12.5);
  assert.equal(next.progress['0'].bestResonance, 0.8);

  const better = recordClear(next, 0, 9, 0.9);
  assert.equal(better.progress['0'].bestTime, 9, '更好的用时应覆盖');
  assert.equal(better.progress['0'].bestResonance, 0.9);

  const round = deserializeProfile(serializeProfile(better));
  assert.deepEqual(round, better, '档案往返应完全一致');
});

/** @covers F-020 */
test('档案：脏数据回退为初始档案', () => {
  for (const bad of ['{bad', '[]', 'null', '"str"']) {
    const p = deserializeProfile(bad);
    assert.equal(p.unlocked, 1);
    assert.deepEqual(p.progress, {});
  }
  const p = deserializeProfile(JSON.stringify({ progress: { x: { level: 'NaN' } }, unlocked: -3 }));
  assert.equal(p.unlocked, 1, '非法解锁数应回退');
  assert.deepEqual(p.progress, {}, '非法关卡记录应被丢弃');
});

/* ── 难度契约：三档路线走同一套规则代码 ────────────────── */

/**
 * 参考路线：会玩的人能通关 —— 用关卡记录的标准解源位置，应当在时限内全亮。
 */
test('难度契约 · 参考路线：标准解能在时限内点亮全部共鸣点', () => {
  const level = createLevel(31, 0);
  const game = createGame(level);
  placeSource(game, level.solution.x, level.solution.y);
  let won = false;
  for (let i = 0; i < 60 * level.timeLimit && !won; i += 1) {
    if (tick(game, STEP_MS) === 'won') won = true;
  }
  assert.ok(won, '标准解应当能过关');
  assert.equal(game.state, 'won');
  assert.equal(checkWin(game), true);
});

/**
 * 弱化路线：随机乱挪波源 200 次，没有一次能全亮。
 * 样本量固定 200 次（不是"可能会失败"）。
 */
test('难度契约 · 弱化路线：200 次随机走位没有一次通关', () => {
  const level = createLevel(37, 1);
  const rng = mulberry32(hashString('weak-route'));
  let wins = 0;
  let partial = 0;
  for (let trial = 0; trial < 200; trial += 1) {
    const game = createGame(level);
    const steps = 60 * 4;   // 4 秒：足够波传到目标（最远 46 格 ≈ 1.2 秒）
    for (let i = 0; i < steps; i += 1) {
      moveSource(game, Math.floor(rng() * 3) - 1, Math.floor(rng() * 3) - 1);
      if (tick(game, STEP_MS) === 'won') break;
    }
    if (game.state === 'won') wins += 1;
    else if (game.lit.some(Boolean)) partial += 1;
  }
  assert.equal(wins, 0, `200 次随机走位不应通关（实际赢了 ${wins} 次）`);
  // 关卡可解性由「参考路线」那条用例保证（用标准解源位置能过关），
  // 这里只断言随机走位赢不了。
  assert.ok(partial <= 200);
});

/**
 * 挂机路线：完全不操作波源 —— 倒计时走完必败，且不得分。
 */
test('难度契约 · 挂机路线：不动波源必然失败且拿不到分数', () => {
  const level = createLevel(41, 0);
  const game = createGame(level);
  let result = null;
  for (let i = 0; i < 60 * (level.timeLimit + 2) && !result; i += 1) {
    result = tick(game, STEP_MS);
  }
  assert.equal(result, 'lost', '挂机应判负');
  assert.equal(game.state, 'lost');
  assert.equal(game.score, 0, '挂机不得分');
  assert.ok(
    game.lit.every((x) => x === false),
    '挂机时不应有任何共鸣点被点亮',
  );
});
