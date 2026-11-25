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

/** 读取图鉴里已解锁（可点击）的词条数量。 */
async function ownedCount(page) {
  return page.locator('#collection .chip:not(.is-locked)').count();
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

  /* 1. 基础渲染 */
  assert.match(await page.title(), /Element Forge/);
  await page.waitForSelector('#collection .chip');
  assert.equal((await page.textContent('#slot-a-name')).trim(), '空');
  assert.equal((await page.textContent('#slot-b-name')).trim(), '空');
  assert.equal(await page.isVisible('#result-card'), false, '初始不应显示产物卡');

  /* 2. 图鉴与成就面板 */
  const chips = await page.locator('#collection .chip').count();
  assert.equal(chips, 106, `图鉴格子数应为 106，实际 ${chips}`);
  const achItems = await page.locator('#achievements li').count();
  assert.equal(achItems, 10, `成就条目数应为 10，实际 ${achItems}`);
  assert.equal(await ownedCount(page), 4, '开局应只有 4 个基础元素');

  /* 3. 熔炼按钮在缺少原料时禁用 */
  assert.equal(await page.isDisabled('#fuse-btn'), true);

  /* 4. 点击图鉴里的元素 → 依次填入两个槽位 */
  await page.click('#collection .chip[data-element="water"]');
  assert.equal((await page.textContent('#slot-a-name')).trim(), '水');
  assert.equal(await page.isDisabled('#fuse-btn'), true, '只放一个原料时不能熔炼');

  await page.click('#collection .chip[data-element="fire"]');
  assert.equal((await page.textContent('#slot-b-name')).trim(), '火');
  assert.equal(await page.isDisabled('#fuse-btn'), false, '两个原料齐了应可熔炼');

  /* 5. 熔炼 → 产物卡显示蒸汽 */
  await page.click('#fuse-btn');
  await page.waitForSelector('#result-card:not([hidden])');
  assert.equal((await page.textContent('#result-name')).trim(), '蒸汽');
  assert.equal(await page.getAttribute('#result-card', 'data-tier'), 'n');
  assert.equal((await page.textContent('#stat-fusions')).trim(), '1');
  assert.ok(
    (await page.textContent('#result-formula')).includes('水 + 火'),
    '配方行应展示原料与产物',
  );

  /* 6. 产物进入图鉴，计数 +1 */
  await page.waitForFunction(
    () => document.querySelector('#collection .chip[data-element="steam"]:not(.is-locked)') !== null,
  );
  assert.equal(await ownedCount(page), 5);
  assert.equal((await page.textContent('#stat-dex')).trim(), '5/106');

  /* 7. 表外组合走原创合成，并带上原创标记 */
  // steam+water / steam+fire / steam+wind 都在合成表里，steam+earth 不在
  await page.click('#collection .chip[data-element="earth"]');
  await page.click('#collection .chip[data-element="steam"]');
  await page.click('#fuse-btn');
  await page.waitForFunction(
    () => document.getElementById('result-improv') && !document.getElementById('result-improv').hidden,
  );
  const improvName = (await page.textContent('#result-name')).trim();
  assert.ok(improvName.length > 0, '原创产物应有名字');
  assert.equal((await page.textContent('#stat-improvised')).trim(), '1');

  /* 8. 配方手册记录了两次熔炼 */
  const recipeRows = await page.locator('#recipes li').count();
  assert.equal(recipeRows, 2, `配方手册应有 2 条，实际 ${recipeRows}`);

  /* 9. 键盘 F 触发熔炼 */
  await page.click('#collection .chip[data-element="water"]');
  await page.click('#collection .chip[data-element="wind"]');
  await page.keyboard.press('f');
  await page.waitForFunction(
    () => document.getElementById('stat-fusions').textContent.trim() === '3',
  );

  /* 10. Escape 清空熔炉 */
  await page.click('#collection .chip[data-element="earth"]');
  assert.equal((await page.textContent('#slot-a-name')).trim(), '土');
  await page.keyboard.press('Escape');
  assert.equal((await page.textContent('#slot-a-name')).trim(), '空');

  /* 11. 每日灵感抽取 */
  await page.click('#daily-btn');
  await page.waitForFunction(
    () => document.getElementById('daily-left').textContent.trim() !== '5',
  );
  assert.ok(
    Number((await page.textContent('#stat-dex')).split('/')[0]) >= 5,
    '每日灵感应把元素加入图鉴',
  );

  /* 12. 搜索过滤（趁界面还是中文时做，避免受语言切换影响） */
  await page.fill('#search', '蒸汽');
  await page.waitForFunction(
    () => document.querySelectorAll('#collection .chip').length === 1,
  );
  assert.equal(
    await page.getAttribute('#collection .chip', 'data-element'),
    'steam',
    '搜索应只命中蒸汽',
  );
  await page.fill('#search', '');
  // 106 个正式词条 + 1 个原创词条
  await page.waitForFunction(
    () => document.querySelectorAll('#collection .chip').length === 107,
  );

  /* 13. 语言切换 */
  await page.click('.lang-btn[data-lang="en"]');
  await page.waitForFunction(
    () => document.getElementById('fuse-btn').textContent.trim() === 'FUSE',
  );
  assert.equal((await page.textContent('#slot-a-name')).trim(), 'Empty');
  assert.equal((await page.textContent('#collection-title')).trim(), 'Collection');

  /* 14. 刷新后进度保留（语言选择也应保留） */
  const dexBefore = (await page.textContent('#stat-dex')).trim();
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#collection .chip');
  assert.equal((await page.textContent('#stat-dex')).trim(), dexBefore, '刷新后图鉴进度丢失');
  assert.equal((await page.textContent('#stat-fusions')).trim(), '3');
  assert.equal((await page.textContent('#fuse-btn')).trim(), 'FUSE', '语言选择应持久化');

  /* 15. 无 JS 报错、无 console error */
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
  await page.waitForSelector('#collection .chip');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 2, `移动端横向溢出 ${overflow}px`);

  // 移动端也要能完成一次熔炼
  await page.click('#collection .chip[data-element="water"]');
  await page.click('#collection .chip[data-element="fire"]');
  await page.click('#fuse-btn');
  await page.waitForSelector('#result-card:not([hidden])');
  assert.equal((await page.textContent('#result-name')).trim(), '蒸汽');

  const overflowAfter = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflowAfter <= 2, `熔炼后移动端横向溢出 ${overflowAfter}px`);
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});
