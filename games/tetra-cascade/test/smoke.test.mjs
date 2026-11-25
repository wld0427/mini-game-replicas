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

/** 图鉴里已记录的方块总次数。 */
async function totalUsed(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll('#dex .dex-item');
    let sum = 0;
    for (const item of items) sum += Number(item.dataset.used || 0);
    return sum;
  });
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
  assert.match(await page.title(), /Tetra Cascade/);
  await page.waitForSelector('#board .cell');
  assert.equal(await page.locator('#board .cell').count(), 200, '棋盘应有 200 格');
  assert.equal(await page.locator('#dex .dex-item').count(), 7, '图鉴应有 7 种方块');
  assert.equal(await page.locator('#achievements li').count(), 8, '成就应有 8 条');
  assert.equal(await page.isVisible('#overlay'), true, '开局应显示开始遮罩');
  assert.equal((await page.textContent('#start-btn')).trim(), '开始游戏');

  /* 2. 开始游戏：遮罩消失，棋盘出现活动方块 */
  await page.click('#start-btn');
  await page.waitForFunction(() => document.getElementById('overlay').hidden === true);
  await page.waitForFunction(() => document.getElementById('board').dataset.piece);
  const pieceId = await page.getAttribute('#board', 'data-piece');
  assert.ok(pieceId && pieceId.length === 1, `活动方块 id 异常: ${pieceId}`);

  /* 3. 键盘：左右移动 */
  const xBefore = Number(await page.getAttribute('#board', 'data-x'));
  await page.keyboard.press('ArrowLeft');
  const xAfterLeft = Number(await page.getAttribute('#board', 'data-x'));
  assert.equal(xAfterLeft, xBefore - 1, '左移应让横坐标 -1');
  await page.keyboard.press('ArrowRight');
  assert.equal(Number(await page.getAttribute('#board', 'data-x')), xBefore, '右移应回到原位');

  /* 4. 键盘：旋转 */
  const rotBefore = await page.getAttribute('#board', 'data-rot');
  await page.keyboard.press('ArrowUp');
  assert.notEqual(await page.getAttribute('#board', 'data-rot'), rotBefore, '旋转应改变朝向');

  /* 5. 键盘：暂存 */
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => document.querySelectorAll('#hold-box .mini-cell.on').length > 0);
  assert.ok((await page.locator('#hold-box .mini-cell.on').count()) > 0, '暂存位应有方块');

  /* 6. 硬降：方块落到棋盘底部，计分增加 */
  await page.keyboard.press('Space');
  await page.waitForFunction(() => Number(document.getElementById('board').dataset.pieces) >= 1);
  const filled = await page.locator('#board .cell.p').count();
  assert.ok(filled >= 4, `硬降后棋盘应有落子: ${filled}`);
  assert.ok(Number((await page.textContent('#stat-score')).trim()) > 0, '硬降应计分');

  /* 7. 图鉴与成就随进度更新 */
  assert.ok((await totalUsed(page)) >= 1, '图鉴应记录用过的方块');
  assert.ok((await page.locator('#achievements li.is-unlocked').count()) >= 1, '应解锁至少一个成就');

  /* 8. 暂停 / 继续 */
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => document.getElementById('overlay').hidden === false);
  assert.equal((await page.textContent('#overlay-title')).trim(), '暂停');
  await page.click('#start-btn');
  await page.waitForFunction(() => document.getElementById('overlay').hidden === true);

  /* 9. 语言切换 */
  await page.click('.lang-btn[data-lang="en"]');
  await page.waitForFunction(
    () => document.getElementById('start-btn').textContent.trim() === 'PLAY',
  );
  assert.equal((await page.textContent('#dex-title')).trim(), 'Piece Codex');

  /* 10. 刷新后进度保留（图鉴与纪录都要留住） */
  const usedBefore = await totalUsed(page);
  const bestBefore = (await page.textContent('#rec-score')).trim();
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#dex .dex-item');
  assert.equal(await totalUsed(page), usedBefore, '刷新后图鉴记录丢失');
  assert.equal((await page.textContent('#rec-score')).trim(), bestBefore, '刷新后纪录丢失');
  assert.equal((await page.textContent('#start-btn')).trim(), 'PLAY', '语言选择应持久化');

  /* 11. 无 JS 报错、无 console error */
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

test('触控按钮能完成一次落子', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
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
  await page.click('#start-btn');
  await page.waitForFunction(() => document.getElementById('board').dataset.piece);

  await page.click('.ctl[data-act="left"]');
  await page.click('.ctl[data-act="cw"]');
  await page.click('.ctl[data-act="down"]');
  await page.click('.ctl[data-act="drop"]');
  await page.waitForFunction(() => Number(document.getElementById('board').dataset.pieces) >= 1);
  assert.ok((await page.locator('#board .cell.p').count()) >= 4, '触控落子应留下方块');
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});

test('移动端视口下布局不溢出', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
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
  await page.waitForSelector('#board .cell');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 2, `移动端横向溢出 ${overflow}px`);

  await page.click('#start-btn');
  await page.waitForFunction(() => document.getElementById('board').dataset.piece);
  const overflowAfter = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflowAfter <= 2, `开始游戏后移动端横向溢出 ${overflowAfter}px`);
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});
