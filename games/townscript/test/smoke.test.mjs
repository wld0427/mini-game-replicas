import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockRect } from '../src/logic.js';
import { loadChromium, startServer } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let chromium;
try {
  chromium = await loadChromium();
} catch {
  chromium = null;
}

/** 把某个格子的中心换算成页面坐标。 */
async function cellPoint(page, c, r, level = 0) {
  const box = await page.locator('#town-svg').boundingBox();
  const view = await page.evaluate(() => {
    const v = document.getElementById('town-svg').viewBox.baseVal;
    return { x: v.x, y: v.y, width: v.width, height: v.height };
  });
  const rect = blockRect(c, r, level);
  return {
    x: box.x + (rect.x + rect.w / 2 - view.x) * (box.width / view.width),
    y: box.y + (rect.y + rect.h / 2 - view.y) * (box.height / view.height),
  };
}

test('浏览器冒烟测试', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { server, port } = await startServer(root);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  t.after(async () => {
    await browser.close();
    server.close();
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });

  /* 1. 首屏渲染 */
  assert.match(await page.title(), /Townscript/);
  await page.waitForSelector('#town-svg rect');
  assert.equal(await page.locator('#palette .swatch').count(), 9, '调色盘应有 9 种颜色');
  assert.equal(await page.locator('#palette .swatch:not(.is-locked)').count(), 5, '初始解锁 5 种');
  assert.equal(await page.locator('#dex .dex-item').count(), 10, '图鉴应有 10 条地标');
  assert.equal(await page.locator('#shop .shop-item').count(), 4, '工坊应有 4 项升级');
  assert.equal(await page.locator('#achievements li').count(), 8, '成就应有 8 条');
  assert.equal(await page.locator('#town-svg .block').count(), 0, '开局不该有建筑');

  /* 2. 点击地块起楼 */
  const p1 = await cellPoint(page, 5, 5);
  await page.mouse.click(p1.x, p1.y);
  await page.waitForFunction(() => document.querySelectorAll('#town-svg .block').length >= 1);
  assert.equal((await page.textContent('#stat-blocks')).trim(), '1', '地基数应为 1');
  assert.ok(Number((await page.textContent('#stat-coins')).trim()) > 0, '起楼应拿到铜钱');

  /* 3. 再点同一格会叠高 */
  await page.mouse.click(p1.x, p1.y);
  await page.waitForFunction(() => document.querySelectorAll('#town-svg .block').length >= 2);
  assert.equal((await page.textContent('#stat-height')).trim(), '2', '最高应到 2 层');

  /* 4. 右键拆除 */
  await page.mouse.click(p1.x, p1.y, { button: 'right' });
  await page.waitForFunction(() => document.querySelectorAll('#town-svg .block').length === 1);
  assert.equal((await page.textContent('#stat-height')).trim(), '1');

  /* 5. 拆除模式按钮 */
  await page.click('#demolish-mode');
  assert.equal(await page.getAttribute('#demolish-mode', 'aria-pressed'), 'true');
  await page.mouse.click(p1.x, p1.y);
  await page.waitForFunction(() => document.querySelectorAll('#town-svg .block').length === 0);
  assert.equal((await page.textContent('#stat-blocks')).trim(), '0');

  /* 6. 数字键换色 */
  await page.click('#build-mode');
  await page.keyboard.press('3');
  const active = await page.locator('#palette .swatch.is-active').getAttribute('title');
  assert.ok(active && active.includes('苔'), `数字键应切到第 3 号颜色，实际 ${active}`);

  /* 7. 每日岛屿切换 */
  await page.click('#mode-toggle');
  assert.equal(await page.getAttribute('#mode-toggle', 'aria-pressed'), 'true');
  assert.ok((await page.textContent('#mode-hint')).includes('所有人'), '提示应说明每日岛屿');

  /* 8. 语言切换 */
  await page.click('.lang-btn[data-lang="en"]');
  await page.waitForFunction(
    () => document.getElementById('build-mode').textContent.trim() === 'Build',
  );
  assert.equal((await page.textContent('#dex-title')).trim(), 'Gazetteer');
  assert.equal((await page.textContent('#shop-title')).trim(), 'Workshop');

  /* 9. 刷新后进度保留（地标计数与铜钱都要留住） */
  const coinsBefore = (await page.textContent('#stat-coins')).trim();
  const foundBefore = (await page.textContent('#stat-found')).trim();
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#town-svg rect');
  assert.equal((await page.textContent('#stat-coins')).trim(), coinsBefore, '刷新后铜钱丢失');
  assert.equal((await page.textContent('#stat-found')).trim(), foundBefore, '刷新后地标计数丢失');
  assert.equal((await page.textContent('#build-mode')).trim(), 'Build', '语言选择应持久化');

  /* 10. 无 JS 报错、无 console error */
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

test('城镇代码可以复制与还原', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { server, port } = await startServer(root);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  t.after(async () => {
    await browser.close();
    server.close();
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#town-svg rect');

  const p1 = await cellPoint(page, 7, 6);
  await page.mouse.click(p1.x, p1.y);
  await page.waitForFunction(() => document.querySelectorAll('#town-svg .block').length >= 1);

  const code = await page.inputValue('#code-field');
  assert.ok(code.startsWith('TS1-'), `城镇代码格式异常: ${code}`);

  // 清空后用代码还原
  await page.click('#clear-btn').catch(() => {});
  await page.fill('#code-field', code);
  await page.click('#load-btn');
  await page.waitForFunction(() => document.querySelectorAll('#town-svg .block').length >= 1);
  assert.equal((await page.textContent('#stat-blocks')).trim(), '1', '代码应还原出那一块地基');

  // 非法代码不该炸
  await page.fill('#code-field', 'garbage');
  await page.click('#load-btn');
  await page.waitForTimeout(120);
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});

test('移动端视口下布局不溢出且能建造', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { server, port } = await startServer(root);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  t.after(async () => {
    await browser.close();
    server.close();
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#town-svg rect');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 2, `移动端横向溢出 ${overflow}px`);

  const p1 = await cellPoint(page, 5, 5);
  await page.mouse.click(p1.x, p1.y);
  await page.waitForFunction(() => document.querySelectorAll('#town-svg .block').length >= 1);
  assert.equal((await page.textContent('#stat-blocks')).trim(), '1');

  const overflowAfter = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflowAfter <= 2, `建造后移动端横向溢出 ${overflowAfter}px`);
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});
