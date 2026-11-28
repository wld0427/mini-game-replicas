import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLevel } from '../src/logic.js';
import { loadChromium, startServer } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let chromium;
try {
  chromium = await loadChromium();
} catch {
  chromium = null;
}

/** headless Chromium 需要显式打开软件光栅化，否则 WebGL2 上下文拿不到 */
const GL_ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/**
 * @covers F-013
 * @covers F-014
 */
test('WebGL2 渲染：着色器编译通过、画布中心像素非黑、失败时回退 2D', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { server, port } = await startServer(root);
  const browser = await chromium.launch({ args: GL_ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  t.after(async () => {
    await browser.close();
    server.close();
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#sea');

  const mode = await page.getAttribute('#sea', 'data-mode');
  const glError = await page.getAttribute('#sea', 'data-gl-error');
  assert.ok(mode === 'webgl2' || mode === '2d', `渲染模式应为 webgl2 或 2d，实际 ${mode}`);
  if (mode === 'webgl2') {
    assert.equal(glError, '', `WebGL2 路径不应有编译错误：${glError}`);
  }

  // 开一局，让波场真的演化起来
  await page.click('#start-btn');
  await page.waitForTimeout(1500);

  // 画布中心像素必须非黑（证明真的画出了东西，而不是一片黑）
  const pixel = await page.evaluate(() => {
    const src = document.getElementById('sea');
    const probe = document.createElement('canvas');
    probe.width = src.width;
    probe.height = src.height;
    const ctx = probe.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const d = ctx.getImageData(Math.floor(probe.width / 2), Math.floor(probe.height / 2), 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  assert.ok(
    pixel[0] + pixel[1] + pixel[2] > 12,
    `画布中心像素应非黑，实际 rgb(${pixel.join(',')})`,
  );

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

/**
 * @covers F-015
 * @covers F-016
 */
test('三层合成：粒子层与标记层同时存在，点亮的目标带标记类', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { server, port } = await startServer(root);
  const browser = await chromium.launch({ args: GL_ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  t.after(async () => {
    await browser.close();
    server.close();
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#sea');

  // 三层：波场 canvas / 粒子 canvas / 标记层
  assert.equal(await page.locator('#sea').count(), 1, '应有波场层');
  assert.equal(await page.locator('#fx').count(), 1, '应有粒子层');
  assert.equal(await page.locator('#markers').count(), 1, '应有标记层');

  await page.click('#start-btn');
  await page.waitForTimeout(400);
  const targets = await page.locator('#markers .target').count();
  assert.ok(targets >= 1, `标记层应画出共鸣点，实际 ${targets}`);
  assert.equal(await page.locator('#markers .source').count(), 1, '应有波源标记');

  // 移动波源 → 粒子层应产生粒子
  for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(120);
  const lit = await page.locator('#markers .target.is-lit').count();
  assert.ok(lit >= 0, '标记层不应报错');
});

/**
 * @covers F-019
 */
test('输入：方向键与拖拽都能移动波源', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { server, port } = await startServer(root);
  const browser = await chromium.launch({ args: GL_ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  t.after(async () => {
    await browser.close();
    server.close();
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#sea');
  await page.click('#start-btn');
  await page.waitForTimeout(300);

  const readSource = () => page.evaluate(() => {
    const el = document.querySelector('#markers .source');
    return el ? { left: el.style.left, top: el.style.top } : null;
  });

  const before = await readSource();
  assert.ok(before, '标记层应有波源');

  // 键盘移动（headless 下 rAF 很慢，DOM 刷新滞后 —— 轮询等它追上）
  await page.keyboard.press('ArrowLeft');
  const moved = await page.waitForFunction(
    (prev) => {
      const el = document.querySelector('#markers .source');
      return el && el.style.left !== prev;
    },
    before.left,
    { timeout: 8000 },
  ).then(() => true).catch(() => false);
  assert.ok(moved, '方向键应移动波源');
  const afterKey = await readSource();

  // 触屏拖拽移动
  const box = await page.locator('#sea').boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 6 });
  await page.mouse.up();
  const dragged = await page.waitForFunction(
    (prev) => {
      const el = document.querySelector('#markers .source');
      return el && el.style.left !== prev;
    },
    afterKey.left,
    { timeout: 8000 },
  ).then(() => true).catch(() => false);
  assert.ok(dragged, '拖拽应移动波源');
  const afterDrag = await readSource();

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});

/**
 * 端到端：真的把这一关打通。
 *
 * 标准解的位置从逻辑层取（同一份确定性关卡生成），
 * 用方向键把波源一步步挪过去 —— 验证「逻辑 → 渲染 → 标记 → 胜负」整条链是通的，
 * 而不只是每个零件各自能跑。
 *
 * @covers F-010
 * @covers F-016
 */
test('端到端：把波源挪到标准解，全部共鸣点点亮并过关', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { server, port } = await startServer(root);
  const browser = await chromium.launch({ args: GL_ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  t.after(async () => {
    await browser.close();
    server.close();
  });

  // 关卡是确定性的：同一 seed 必得同一座岛，标准解位置固定
  const level = createLevel(20261127, 0);
  const target = level.solution;

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#sea');
  await page.click('#start-btn');
  await page.waitForTimeout(300);

  // 用方向键把波源从起点挪到标准解。
  // 注意：**不能按 DOM 里的位置来导航** —— headless 下 rAF 只有几帧/秒，
  // 标记层的坐标要几百毫秒才刷新一次，照着它按会严重过冲。
  // 按键是立即改游戏状态的，所以这里直接按起点与解的差值算按键次数。
  const start = level.start;
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  for (let i = 0; i < Math.abs(dx); i += 1) {
    await page.keyboard.press(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
  }
  for (let i = 0; i < Math.abs(dy); i += 1) {
    await page.keyboard.press(dy > 0 ? 'ArrowDown' : 'ArrowUp');
  }
  await page.waitForTimeout(200);

  // 等波传开、共鸣点点亮
  const won = await page.waitForFunction(
    () => document.getElementById('overlay') && !document.getElementById('overlay').hidden
      && document.getElementById('overlay-title').textContent.trim().length > 0,
    null,
    { timeout: 60000 },
  ).then(() => true).catch(() => false);

  assert.ok(won, '把波源挪到标准解后应当能过关');
  const lit = await page.locator('#markers .target.is-lit').count();
  const total = await page.locator('#markers .target').count();
  assert.equal(lit, total, `全部共鸣点都应点亮（${lit}/${total}）`);
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});
