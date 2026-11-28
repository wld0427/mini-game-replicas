import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadChromium, startServer } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let chromium;
try {
  chromium = await loadChromium();
} catch {
  chromium = null;
}

const GL_ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/**
 * @covers F-017
 * @covers F-018
 */
test('音频：用户手势后建立上下文、程序化混响有脉冲响应、零音频文件请求', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { server, port } = await startServer(root);
  const browser = await chromium.launch({ args: GL_ARGS });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  const audioRequests = [];
  page.on('request', (req) => {
    if (/\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(req.url())) audioRequests.push(req.url());
  });

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  t.after(async () => {
    await browser.close();
    server.close();
  });

  // 扩展真实 AudioContext：只统计振荡器与卷积缓冲，不破坏音频链路
  await page.addInitScript(() => {
    window.__oscCount = 0;
    window.__convolverLength = 0;
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      createOscillator() {
        window.__oscCount += 1;
        return super.createOscillator();
      }
      createConvolver() {
        // 只留节点引用，断言时再读 buffer.length ——
        // 覆盖 buffer 的 setter 会破坏 WebAudio 节点本身（connect 解析失败）
        const node = super.createConvolver();
        window.__convolverNode = node;
        return node;
      }
    };
    window.webkitAudioContext = window.AudioContext;
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#sea');

  // 点击「开始」= 用户手势 → 音频上下文应当建立
  await page.click('#start-btn');
  await page.waitForTimeout(600);

  const convolverLength = await page.evaluate(() => {
    const node = window.__convolverNode;
    return node && node.buffer ? node.buffer.length : 0;
  });
  assert.ok(convolverLength > 0, `程序化混响的脉冲响应长度应大于 0，实际 ${convolverLength}`);

  // 移动波源 → 应有振荡器发声
  const before = await page.evaluate(() => window.__oscCount);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__oscCount);
  assert.ok(after > before, `移动波源应触发声音（振荡器 ${before} → ${after}）`);

  assert.deepEqual(audioRequests, [], `不应请求任何音频文件，但有：${audioRequests.join(', ')}`);
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});
