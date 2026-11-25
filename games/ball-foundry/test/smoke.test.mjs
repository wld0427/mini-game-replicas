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

/** 图鉴里各材质的投放次数合计。 */
async function totalDropped(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll('#codex .codex-item');
    let sum = 0;
    for (const item of items) sum += Number(item.dataset.dropped || 0);
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
  assert.match(await page.title(), /Ball Foundry/);
  await page.waitForSelector('#field-svg');
  assert.equal(await page.locator('#codex .codex-item').count(), 7, '图鉴应有 7 种材质');
  assert.equal(await page.locator('#shop .shop-item').count(), 4, '商店应有 4 项升级');
  assert.equal(await page.locator('#achievements li').count(), 8, '成就应有 8 条');
  assert.equal(await page.locator('#balls .ball').count(), 0, '开局罐子应是空的');

  /* 2. 点击罐子投放 → 出现球体 */
  const box = await page.locator('#field-svg').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.2);
  await page.waitForFunction(() => Number(document.getElementById('field-svg').dataset.balls) >= 1);
  assert.equal(await page.locator('#balls .ball').count(), 1, '应出现一颗球');
  assert.equal(await totalDropped(page), 1, '图鉴应记录一次投放');

  /* 3. 球落定 → 结算铜钱 */
  await page.waitForFunction(
    () => Number(document.getElementById('field-svg').dataset.settled) >= 1,
    { timeout: 25000 },
  );
  const coins = Number((await page.textContent('#stat-coins')).trim());
  assert.ok(coins > 0, `落定应结算铜钱，实际 ${coins}`);
  assert.ok(Number((await page.getAttribute('#field-svg', 'data-dropped'))) >= 1);

  /* 4. 键盘：空格投放 */
  const before = Number(await page.getAttribute('#field-svg', 'data-balls'));
  await page.keyboard.press('Space');
  await page.waitForFunction(
    (n) => Number(document.getElementById('field-svg').dataset.balls) > n,
    before,
  );

  /* 5. 键盘：C 清空 */
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => Number(document.getElementById('field-svg').dataset.balls) === 0);
  assert.equal(await page.locator('#balls .ball').count(), 0, '清空后不应剩球');

  /* 6. 键盘：A 切换自动投放 */
  await page.keyboard.press('KeyA');
  assert.equal(await page.getAttribute('#auto-btn', 'aria-pressed'), 'true');
  await page.waitForFunction(() => Number(document.getElementById('field-svg').dataset.balls) >= 1, null, { timeout: 8000 });
  await page.keyboard.press('KeyA');
  assert.equal(await page.getAttribute('#auto-btn', 'aria-pressed'), 'false');

  /* 7. 语言切换 */
  await page.click('.lang-btn[data-lang="en"]');
  await page.waitForFunction(
    () => document.getElementById('drop-btn').textContent.trim() === 'DROP',
  );
  assert.equal((await page.textContent('#codex-title')).trim(), 'Material Codex');

  /* 8. 刷新后进度保留（图鉴与铜钱都要留住） */
  const droppedBefore = await totalDropped(page);
  const coinsBefore = (await page.textContent('#stat-coins')).trim();
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#codex .codex-item');
  assert.equal(await totalDropped(page), droppedBefore, '刷新后图鉴记录丢失');
  assert.equal((await page.textContent('#stat-coins')).trim(), coinsBefore, '刷新后铜钱丢失');
  assert.equal((await page.textContent('#drop-btn')).trim(), 'DROP', '语言选择应持久化');

  /* 9. 无 JS 报错、无 console error */
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

test('移动端视口下布局不溢出且能投放', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
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
  await page.waitForSelector('#codex .codex-item');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 2, `移动端横向溢出 ${overflow}px`);

  // 移动端点一下也能投放
  const box = await page.locator('#field-svg').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.2);
  await page.waitForFunction(() => Number(document.getElementById('field-svg').dataset.balls) >= 1);
  assert.equal(await page.locator('#balls .ball').count(), 1);

  const overflowAfter = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflowAfter <= 2, `投放后移动端横向溢出 ${overflowAfter}px`);
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});
