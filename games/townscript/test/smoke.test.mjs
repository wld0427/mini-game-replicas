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

/**
 * @covers F-003 起楼与叠高
 * @covers F-004 右键拆除
 * @covers F-005 命中检测与渲染同几何
 * @covers F-006 地志图鉴与里程碑
 * @covers F-011 模式切换不丢城
 * @covers F-015 调色板解锁
 */
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

/**
 * @covers F-009 城镇代码往返（含拓地）
 * @covers F-010 旧码兼容与非法码处理
 */
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
  assert.ok(code.startsWith('TS2-'), `城镇代码格式异常: ${code}`);
  // TS2 带上拓地等级与建造计数，否则拓地后分享出去的码还原不了
  const segments = code.split('-');
  assert.equal(segments.length, 7, `TS2 代码应有 7 段，实际 ${segments.length}`);

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

/**
 * @covers F-019 鼠标与键盘双输入
 */
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

/**
 * 模式切换不丢城 + 刷新后模式与城都还在。
 *
 * 这是审计查出的 P0：早期版本切换模式会直接新建一座岛并立刻存档，
 * 玩家建的城被覆盖；每日模式的状态也只在内存里，刷新即丢。
 *
 * @covers F-011
 * @covers F-013
 */
test('切换模式不丢城，刷新后模式与城都还在', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
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

  // 建 3 块
  for (const [c, r] of [[6, 4], [7, 4], [6, 5]]) {
    const p = await cellPoint(page, c, r);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(120);
  }
  const built = await page.locator('#town-svg .block').count();
  assert.equal(built, 3, `应建出 3 块，实际 ${built}`);
  const codeBefore = await page.evaluate(() => window.localStorage.getItem('townscript-town-v1'));
  assert.ok(codeBefore, '自由岛的存档应存在');

  // 切到每日岛
  await page.click('#mode-toggle');
  await page.waitForTimeout(400);
  assert.equal(await page.getAttribute('#mode-toggle', 'aria-pressed'), 'true', '应切到每日模式');
  const dailyBlocks = await page.locator('#town-svg .block').count();
  assert.equal(dailyBlocks, 0, '每日岛是另一座城，不该有自由岛的楼');
  const freeCodeAfter = await page.evaluate(() => window.localStorage.getItem('townscript-town-v1'));
  assert.equal(freeCodeAfter, codeBefore, '切到每日岛后自由岛的存档不能被改动');

  // 切回自由岛：楼必须还在，存档必须一致
  await page.click('#mode-toggle');
  await page.waitForTimeout(400);
  assert.equal(await page.getAttribute('#mode-toggle', 'aria-pressed'), 'false', '应切回自由模式');
  assert.equal(await page.locator('#town-svg .block').count(), built, '切回来后楼必须还在');
  assert.equal(
    await page.evaluate(() => window.localStorage.getItem('townscript-town-v1')),
    codeBefore,
    '切回来后城镇代码必须与切换前完全一致',
  );

  // 刷新：模式与城都要还在
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#town-svg rect');
  assert.equal(await page.getAttribute('#mode-toggle', 'aria-pressed'), 'false', '刷新后应仍在自由模式');
  assert.equal(await page.locator('#town-svg .block').count(), built, '刷新后城必须还在');

  // 刷新后再切到每日模式，模式状态也要被记住
  await page.click('#mode-toggle');
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#town-svg rect');
  assert.equal(await page.getAttribute('#mode-toggle', 'aria-pressed'), 'true', '刷新后应仍在每日模式');

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});

/**
 * 拓地之后刷新，整座城必须还在（早期版本会把城静默丢掉）。
 *
 * @covers F-009
 * @covers F-013
 */
test('拓地升级后刷新，城不会丢', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
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

  // 直接注入一份「已经拓地 2 级」的档案
  await page.addInitScript(() => {
    window.localStorage.setItem('townscript-profile-v1', JSON.stringify({
      version: 1, coins: 4000, totalEarned: 4000,
      upgrades: { expand: 2, palette: 0, survey: 0, income: 0 },
      dex: {}, achievements: {},
      stats: { builds: 0, removals: 0, veinBuilds: 0, discovered: 0, bestHeight: 0 },
      startedAt: null,
    }));
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#town-svg rect');

  for (const [c, r] of [[6, 4], [7, 4], [6, 5]]) {
    const p = await cellPoint(page, c, r);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(120);
  }
  const built = await page.locator('#town-svg .block').count();
  assert.equal(built, 3, `应建出 3 块，实际 ${built}`);

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#town-svg rect');
  assert.equal(
    await page.locator('#town-svg .block').count(),
    built,
    '拓地后刷新，城被丢掉了（存档没带上拓地等级）',
  );

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});

/**
 * 三语切换 + 音效合成。
 *
 * @covers F-016
 * @covers F-017
 */
test('三语切换与音效合成', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
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

  // 扩展真实 AudioContext，只统计振荡器（不破坏音频链路）
  await page.addInitScript(() => {
    window.__oscCount = 0;
    window.__oscFreqs = [];
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      createOscillator() {
        window.__oscCount += 1;
        const osc = super.createOscillator();
        const param = osc.frequency;
        const orig = param.setValueAtTime.bind(param);
        param.setValueAtTime = (v, t) => {
          window.__oscFreqs.push(v);
          return orig(v, t);
        };
        return osc;
      }
    };
    window.webkitAudioContext = window.AudioContext;
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#town-svg rect');

  // 切到英文
  await page.click('.lang-btn[data-lang="en"]');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  const shopTitle = (await page.textContent('#shop-title')).trim();
  assert.ok(/Gear|Workshop|Shop/i.test(shopTitle), `英文下商店标题应为英文，实际「${shopTitle}」`);

  // 落子 → 有振荡器
  const p = await cellPoint(page, 6, 4);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
  const count = await page.evaluate(() => window.__oscCount);
  assert.ok(count >= 1, `落子应创建振荡器，实际 ${count}`);
  const freqs = await page.evaluate(() => window.__oscFreqs);
  assert.ok(freqs.length > 0, '应记录到振荡器频率');

  // 切到日文
  await page.click('.lang-btn[data-lang="ja"]');
  await page.waitForFunction(() => document.documentElement.lang === 'ja');

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});
