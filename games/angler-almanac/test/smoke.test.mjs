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

/**
 * 玩一轮完整的钓鱼：抛竿 → 等咬钩 → 起竿 → 遛鱼。
 * 遛鱼时读取标记位置，在甜区内点击收线（模拟会玩的玩家）。
 */
async function playOneRound(page) {
  await page.click('#cast-btn');
  await page.waitForSelector('#hook-btn:visible', { timeout: 8000 });
  await page.click('#hook-btn');
  await page.waitForSelector('#reel-panel:visible', { timeout: 5000 });

  const box = await page.locator('#reel-panel').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const info = await page.evaluate(() => {
      const panel = document.getElementById('reel-panel');
      const scene = document.getElementById('scene');
      return {
        phase: scene.dataset.phase,
        marker: Number(panel.dataset.marker),
        sweet: Number(panel.dataset.sweet),
        width: Number(panel.dataset.width),
      };
    });
    if (info.phase !== 'reel') return info.phase;
    if (Math.abs(info.marker - info.sweet) <= info.width / 2) {
      await page.mouse.click(cx, cy);
    }
  }
  return 'timeout';
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
  assert.match(await page.title(), /Angler's Almanac/);
  await page.waitForSelector('#dex .dex-cell');
  assert.equal(await page.isDisabled('#cast-btn'), false, '开局应能抛竿');
  assert.equal(await page.isVisible('#hook-btn'), false, '开局不该出现起竿按钮');
  assert.equal(await page.isVisible('#reel-panel'), false, '开局不该出现遛鱼面板');

  /* 2. 鱼谱 / 成就 / 商店面板 */
  assert.equal(await page.locator('#dex .dex-cell').count(), 44, '鱼谱应有 44 格');
  assert.equal(await page.locator('#achievements li').count(), 10, '成就应有 10 条');
  assert.equal(await page.locator('#shop .shop-item').count(), 4, '商店应有 4 件装备');
  assert.equal(await page.locator('#dex .dex-cell.is-locked').count(), 44, '开局鱼谱应全部未解锁');

  /* 3. 完整走一轮：抛竿 → 咬钩 → 起竿 → 遛鱼 → 上钩 */
  const phase = await playOneRound(page);
  assert.equal(phase, 'result', `遛鱼应结束并进入结算阶段，实际 ${phase}`);

  /* 4. 上钩结果写进卡片与图鉴 */
  await page.waitForSelector('#catch-card:not([hidden])');
  const fishName = (await page.textContent('#catch-name')).trim();
  assert.ok(fishName.length > 0, '产物卡应显示鱼名');
  assert.ok((await page.textContent('#catch-size')).includes('cm'), '产物卡应显示体长');
  assert.equal(await page.locator('#dex .dex-cell:not(.is-locked)').count(), 1, '图鉴应解锁 1 种');
  assert.equal((await page.textContent('#stat-catches')).trim(), '1');
  assert.equal((await page.textContent('#stat-dex')).trim(), '1/44');
  assert.ok(Number((await page.textContent('#stat-coins')).trim()) > 0, '上钩应拿到铜钱');

  /* 5. 结算后可以继续抛竿 */
  assert.equal(await page.isDisabled('#cast-btn'), false, '结算后应能再次抛竿');

  /* 6. 空格键也能抛竿 */
  await page.keyboard.press('Space');
  await page.waitForSelector('#hook-btn:visible', { timeout: 8000 });
  assert.equal((await page.textContent('#phase-text')).trim(), '咬钩了！快起竿');
  await page.keyboard.press('Space');
  await page.waitForSelector('#reel-panel:visible', { timeout: 5000 });
  assert.equal((await page.textContent('#phase-text')).trim(), '收放线时机');

  /* 7. 商店：铜钱不够时按钮禁用 */
  const buyBtn = page.locator('#shop .shop-buy').first();
  assert.equal(await buyBtn.isDisabled(), true, '开局铜钱不足，升级按钮应禁用');

  /* 8. 语言切换 */
  await page.click('.lang-btn[data-lang="en"]');
  await page.waitForFunction(
    () => document.getElementById('cast-btn').textContent.trim() === 'CAST',
  );
  assert.equal((await page.textContent('#shop-title')).trim(), 'Gear');
  assert.equal((await page.textContent('#dex-title')).trim(), 'Almanac');

  /* 9. 刷新后进度保留（鱼谱与铜钱都要留住） */
  const dexBefore = (await page.textContent('#stat-dex')).trim();
  const coinsBefore = (await page.textContent('#stat-coins')).trim();
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#dex .dex-cell');
  assert.equal((await page.textContent('#stat-dex')).trim(), dexBefore, '刷新后鱼谱进度丢失');
  assert.equal((await page.textContent('#stat-coins')).trim(), coinsBefore, '刷新后铜钱丢失');
  assert.equal((await page.textContent('#cast-btn')).trim(), 'CAST', '语言选择应持久化');

  /* 10. 无 JS 报错、无 console error */
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
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
  await page.waitForSelector('#dex .dex-cell');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 2, `移动端横向溢出 ${overflow}px`);

  // 移动端也要能抛竿并进入咬钩状态
  await page.click('#cast-btn');
  await page.waitForSelector('#hook-btn:visible', { timeout: 8000 });
  await page.click('#hook-btn');
  await page.waitForSelector('#reel-panel:visible', { timeout: 5000 });

  const overflowAfter = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflowAfter <= 2, `遛鱼时移动端横向溢出 ${overflowAfter}px`);
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});
