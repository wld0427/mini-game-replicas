import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadChromium, startServer, waitFor } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let chromium;
try {
  chromium = await loadChromium();
} catch {
  chromium = null;
}

test('浏览器冒烟测试', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { server, port } = await startServer(root);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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

  // 1. 基础渲染
  assert.match(await page.title(), /Kanji Rush/);
  await page.waitForSelector('#card');
  assert.equal((await page.textContent('#card-glyph')).trim(), '?');

  // 2. 图鉴与成就面板已渲染
  const cells = await page.locator('#collection .cell').count();
  assert.equal(cells, 102, `图鉴格子数应为 102，实际 ${cells}`);
  const achItems = await page.locator('#achievements li').count();
  assert.equal(achItems, 9, `成就条目数应为 9，实际 ${achItems}`);

  // 3. 点击抽取 → 卡片显示汉字，计数 +1
  await page.click('#pull-btn');
  await page.waitForFunction(() => document.getElementById('card-glyph').textContent.trim() !== '?');
  const glyph = (await page.textContent('#card-glyph')).trim();
  assert.equal([...glyph].length, 1, `抽到的字应为单字，实际 "${glyph}"`);
  assert.equal((await page.textContent('#stat-pulls')).trim(), '1');
  assert.equal((await page.textContent('#stat-unique')).trim(), '1');

  // 4. 稀有度被正确标注到卡片
  const tier = await page.getAttribute('#card', 'data-tier');
  assert.ok(['n', 'r', 'sr', 'ssr', 'ur'].includes(tier), `未知稀有度: ${tier}`);

  // 5. 空格键也能抽
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('stat-pulls').textContent.trim() === '2');

  // 6. 自动模式：按 A 开启后会连续抽取
  await page.keyboard.press('a');
  assert.equal(await page.getAttribute('#auto-btn', 'aria-pressed'), 'true');
  const grew = await waitFor(
    async () => Number((await page.textContent('#stat-pulls')).trim()) >= 6,
    15000,
  );
  assert.ok(grew, '自动模式未继续抽取');
  await page.keyboard.press('a');
  assert.equal(await page.getAttribute('#auto-btn', 'aria-pressed'), 'false');

  // 7. 语言切换
  await page.click('.lang-btn[data-lang="en"]');
  await page.waitForFunction(
    () => document.getElementById('game-subtitle').textContent.includes('rarity') ||
      document.getElementById('game-subtitle').textContent.includes('Rarity'),
  );
  assert.equal((await page.textContent('#pull-btn')).trim(), 'PULL');

  // 8. 刷新后进度保留（localStorage 持久化）
  await page.reload({ waitUntil: 'load' });
  const pullsAfterReload = Number((await page.textContent('#stat-pulls')).trim());
  assert.ok(pullsAfterReload >= 2, `刷新后进度丢失: ${pullsAfterReload}`);

  // 9. 无 JS 报错、无 console error
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

test('移动端视口下布局不溢出', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { server, port } = await startServer(root);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();

  t.after(async () => {
    await browser.close();
    server.close();
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 2, `移动端横向溢出 ${overflow}px`);
});
