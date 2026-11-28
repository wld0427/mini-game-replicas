/**
 * 涟歌 Ripple Song — 粒子层（阶段 2）
 *
 * 中间层：叠在 WebGL 波场之上、DOM 标记层之下的 2D canvas 粒子。
 * 粒子只负责「好看」与「反馈」，**不参与任何判定** ——
 * 点亮与否永远由 src/logic.js 的振幅包络说了算。
 *
 * 粒子模拟本身写成纯函数（不改入参、返回新数组），因此可以被单测直接覆盖。
 */

/** 粒子种类。 */
export const PARTICLE_SPARK = 'spark';
export const PARTICLE_RIPPLE = 'ripple';

/**
 * 新建一个粒子。
 * @param {object} init
 * @returns {object}
 */
export function createParticle(init) {
  return {
    x: init.x,
    y: init.y,
    vx: init.vx || 0,
    vy: init.vy || 0,
    life: init.life,
    maxLife: init.maxLife || init.life,
    size: init.size || 2,
    hue: init.hue === undefined ? 190 : init.hue,
    kind: init.kind || PARTICLE_SPARK,
    drag: init.drag === undefined ? 1.6 : init.drag,
    gravity: init.gravity || 0,
  };
}

/**
 * 生成一圈爆发粒子（共鸣点被点亮时）。
 * @param {object[]} particles 目标数组（会被就地追加）
 * @param {number} x
 * @param {number} y
 * @param {object} [opts]
 * @returns {number} 新增粒子数
 */
export function spawnBurst(particles, x, y, opts) {
  const o = opts || {};
  const count = o.count || 18;
  const speed = o.speed || 26;
  const hue = o.hue === undefined ? 160 : o.hue;
  const rng = o.rng || Math.random;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + rng() * 0.4;
    const v = speed * (0.45 + rng() * 0.75);
    particles.push(createParticle({
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: 0.55 + rng() * 0.45,
      maxLife: 1.0,
      size: 1.4 + rng() * 2.2,
      hue: hue + (rng() * 40 - 20),
      kind: PARTICLE_SPARK,
      drag: 2.2,
      gravity: 6,
    }));
  }
  return count;
}

/**
 * 生成一串涟漪粒子（波源移动时溅起的水花）。
 * @param {object[]} particles
 * @param {number} x
 * @param {number} y
 * @param {object} [opts]
 * @returns {number} 新增粒子数
 */
export function spawnSplash(particles, x, y, opts) {
  const o = opts || {};
  const count = o.count || 10;
  const rng = o.rng || Math.random;
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (rng() - 0.5) * 2.4;
    const v = 10 + rng() * 16;
    particles.push(createParticle({
      x: x + (rng() - 0.5) * 4,
      y: y + (rng() - 0.5) * 4,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v * 0.6,
      life: 0.4 + rng() * 0.35,
      maxLife: 0.75,
      size: 1 + rng() * 1.6,
      hue: 190 + rng() * 30,
      kind: PARTICLE_RIPPLE,
      drag: 1.1,
      gravity: 14,
    }));
  }
  return count;
}

/**
 * 推进一帧粒子（纯函数：返回新数组，不改入参）。
 * @param {object[]} particles
 * @param {number} dt 秒
 * @returns {object[]} 存活的粒子
 */
export function stepParticles(particles, dt) {
  const out = [];
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const life = p.life - dt;
    if (life <= 0) continue;
    const drag = Math.max(0, 1 - p.drag * dt);
    out.push({
      ...p,
      life,
      x: p.x + p.vx * dt,
      y: p.y + p.vy * dt,
      vx: p.vx * drag,
      vy: p.vy * drag + p.gravity * dt,
    });
  }
  return out;
}

/**
 * 建一个绑定到 canvas 的粒子层。
 * @param {HTMLCanvasElement} canvas
 * @returns {{spawnBurst: Function, spawnSplash: Function, update: Function, render: Function, clear: Function, count: Function, particles: object[]}}
 */
export function createParticleLayer(canvas) {
  const ctx = canvas.getContext('2d');
  let particles = [];

  function resize() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round((canvas.clientWidth || 320) * dpr));
    canvas.height = Math.max(1, Math.round((canvas.clientHeight || 180) * dpr));
  }
  resize();

  return {
    get particles() { return particles; },
    spawnBurst(x, y, opts) {
      const added = spawnBurst(particles, x, y, opts);
      particles = particles.slice();
      return added;
    },
    spawnSplash(x, y, opts) {
      const added = spawnSplash(particles, x, y, opts);
      particles = particles.slice();
      return added;
    },
    update(dt) {
      particles = stepParticles(particles, dt);
    },
    render() {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const t = Math.max(0, Math.min(1, p.life / p.maxLife));
        const alpha = t * t;
        const size = p.size * (0.4 + t * 0.9) * (canvas.width / 320);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x * (canvas.width / 320), p.y * (canvas.height / 180), size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    clear() {
      particles = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    count() {
      return particles.length;
    },
    resize,
  };
}
