import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTICLE_RIPPLE,
  PARTICLE_SPARK,
  createParticle,
  spawnBurst,
  spawnSplash,
  stepParticles,
} from '../assets/fx.js';

/**
 * @covers F-015
 */
test('粒子爆发：数量正确、位置在爆点、寿命有限', () => {
  const ps = [];
  const added = spawnBurst(ps, 10, 20, { count: 12, rng: () => 0.5 });
  assert.equal(added, 12);
  assert.equal(ps.length, 12);
  for (const p of ps) {
    assert.equal(p.x, 10);
    assert.equal(p.y, 20);
    assert.ok(p.life > 0 && p.life <= 1.2, '粒子寿命应有限');
    assert.equal(p.kind, PARTICLE_SPARK);
    assert.ok(p.vx !== 0 || p.vy !== 0, '粒子应有初速度');
  }
});

/**
 * @covers F-015
 */
test('粒子水花：种类是 ripple，且向上飞', () => {
  const ps = [];
  spawnSplash(ps, 4, 4, { count: 8, rng: () => 0.25 });
  assert.equal(ps.length, 8);
  for (const p of ps) {
    assert.equal(p.kind, PARTICLE_RIPPLE);
    assert.ok(p.vy < 0, '水花应向上飞');
  }
});

/**
 * @covers F-015
 */
test('粒子推进：纯函数、不改入参、寿命耗尽即消失', () => {
  const ps = [createParticle({ x: 0, y: 0, vx: 10, vy: 0, life: 0.5, maxLife: 0.5, size: 2, hue: 10 })];
  const snapshot = JSON.stringify(ps);
  const next = stepParticles(ps, 0.2);
  assert.notEqual(next, ps, '应返回新数组');
  assert.equal(JSON.stringify(ps), snapshot, '入参不应被修改');
  assert.equal(next.length, 1, '未到寿命应仍存活');
  assert.ok(next[0].x > 0, '应按速度移动');

  const dead = stepParticles(next, 0.6);
  assert.equal(dead.length, 0, '寿命耗尽的粒子应被移除');
});

/**
 * @covers F-015
 */
test('粒子推进：阻尼让速度衰减，重力让竖直速度回升', () => {
  const ps = [createParticle({ x: 0, y: 0, vx: 20, vy: -10, life: 5, maxLife: 5, size: 1, hue: 0, drag: 2, gravity: 9 })];
  const next = stepParticles(ps, 0.1);
  assert.ok(Math.abs(next[0].vx) < 20, '横向速度应被阻尼衰减');
  assert.ok(next[0].vy > -10, '重力应把竖直速度往回拉');
});
