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


/**
 * 注入确定性随机源 + 音频计数器。
 * 每次抽取消耗 2 个随机数：第 1 个定稀有度，第 2 个选字。
 */
function initStub() {
  window.__oscCount = 0;
  window.__nextRng = 0.01;
  window.__rngPhase = 0;
  window.__setRng = (v) => { window.__nextRng = v; };

  const Original = window.AudioContext;
  window.AudioContext = class extends Original {
    createOscillator() {
      window.__oscCount += 1;
      return super.createOscillator();
    }
  };

  Math.random = () => {
    if (window.__rngPhase === 0) {
      window.__rngPhase = 1;
      return window.__nextRng;
    }
    window.__rngPhase = 0;
    return 0.5;
  };
}

/** 起一个浏览器 + 页面，并把控制台错误收集起来。 */
async function withPage(t, { initScript } = {}) {
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

  if (initScript) await page.addInitScript(initScript);

  t.after(async () => {
    await browser.close();
    server.close();
  });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  return { page, consoleErrors, pageErrors };
}

/** @covers F-009 */
test('F-009 图鉴与多语言呈现', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { page, consoleErrors, pageErrors } = await withPage(t);

  // 基础渲染
  assert.match(await page.title(), /Kanji Rush/);
  await page.waitForSelector('#card');
  assert.equal((await page.textContent('#card-glyph')).trim(), '?');

  // 图鉴格子数 = 字库大小 102；成就条目数 = 9
  const cells = await page.locator('#collection .cell').count();
  assert.equal(cells, 102, `图鉴格子数应为 102，实际 ${cells}`);
  const achItems = await page.locator('#achievements li').count();
  assert.equal(achItems, 11, `成就条目数应为 11，实际 ${achItems}`);

  // 未获得的格子用占位符，不剧透字形
  const firstCellText = (await page.locator('#collection .cell').first().textContent()).trim();
  assert.equal(firstCellText, '·', `未解锁格子应显示占位符，实际 "${firstCellText}"`);

  // 切到 English：按钮文案与 html lang 同步
  await page.click('.lang-btn[data-lang="en"]');
  await page.waitForFunction(() => document.getElementById('pull-btn').textContent.trim() === 'PULL');
  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  assert.equal((await page.textContent('#collection-title')).trim(), 'Collection');

  // 切到日本語再切回中文，确认可来回切换
  await page.click('.lang-btn[data-lang="ja"]');
  await page.waitForFunction(() => document.getElementById('pull-btn').textContent.trim() === '引く');
  await page.click('.lang-btn[data-lang="zh"]');
  await page.waitForFunction(() => document.getElementById('pull-btn').textContent.trim() === '抽取');

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

/** @covers F-003 */
test('F-003 抽取更新卡面与计数', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { page, consoleErrors, pageErrors } = await withPage(t);

  await page.click('#pull-btn');
  await page.waitForFunction(() => document.getElementById('card-glyph').textContent.trim() !== '?');

  const glyph = (await page.textContent('#card-glyph')).trim();
  assert.equal([...glyph].length, 1, `抽到的字应为单字，实际 "${glyph}"`);
  assert.equal((await page.textContent('#stat-pulls')).trim(), '1');
  assert.equal((await page.textContent('#stat-unique')).trim(), '1');

  // 稀有度必须落在已知档位
  const tier = await page.getAttribute('#card', 'data-tier');
  assert.ok(['n', 'r', 'sr', 'ssr', 'ur'].includes(tier), `未知稀有度: ${tier}`);

  // 图鉴中应恰有 1 格被点亮
  const owned = await page.locator('#collection .cell.is-owned').count();
  assert.equal(owned, 1, `图鉴应有 1 格已收集，实际 ${owned}`);

  // 连续抽 5 次，计数与图鉴同步增长
  for (let i = 0; i < 5; i += 1) {
    await page.click('#pull-btn');
    await page.waitForTimeout(60);
  }
  assert.equal((await page.textContent('#stat-pulls')).trim(), '6');
  const ownedAfter = await page.locator('#collection .cell.is-owned').count();
  assert.ok(ownedAfter >= 1 && ownedAfter <= 6, `图鉴已收集数异常: ${ownedAfter}`);

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

/** @covers F-010 */
test('F-010 键盘与自动抽取', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { page, consoleErrors, pageErrors } = await withPage(t);

  // 空格抽取
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('stat-pulls').textContent.trim() === '1');

  // A 键开启自动 → 状态为 ON
  await page.keyboard.press('a');
  assert.equal(await page.getAttribute('#auto-btn', 'aria-pressed'), 'true');
  assert.equal((await page.textContent('#auto-state')).trim(), 'ON');

  // 自动模式应持续抽取
  const grew = await waitFor(
    async () => Number((await page.textContent('#stat-pulls')).trim()) >= 6,
    15000,
  );
  assert.ok(grew, '自动模式未继续抽取');

  // 再按 A 关闭 → 不再增长
  await page.keyboard.press('a');
  assert.equal(await page.getAttribute('#auto-btn', 'aria-pressed'), 'false');
  const frozen = (await page.textContent('#stat-pulls')).trim();
  await page.waitForTimeout(1200);
  assert.equal((await page.textContent('#stat-pulls')).trim(), frozen, '关闭自动后仍在抽取');

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

/** @covers F-011 */
test('F-011 音效按稀有度分层合成', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  // 桩掉 Math.random 以便确定性地指定稀有度，并统计振荡器创建次数
  const { page, consoleErrors, pageErrors } = await withPage(t, { initScript: initStub });

  // 普通档：1 个振荡器
  await page.evaluate(() => { window.__setRng(0.01); window.__oscCount = 0; });
  await page.click('#pull-btn');
  await page.waitForTimeout(150);
  const common = await page.evaluate(() => window.__oscCount);
  assert.equal(common, 1, `普通档应合成 1 个音，实际 ${common}`);
  assert.equal(await page.getAttribute('#card', 'data-tier'), 'n');

  // 神话档：4 个振荡器（上行四音）
  await page.evaluate(() => { window.__setRng(0.999); window.__oscCount = 0; });
  await page.click('#pull-btn');
  await page.waitForTimeout(150);
  const mythic = await page.evaluate(() => window.__oscCount);
  assert.equal(mythic, 4, `神话档应合成 4 个音，实际 ${mythic}`);
  assert.equal(await page.getAttribute('#card', 'data-tier'), 'ur');

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

/** @covers F-008 */
test('F-008 刷新后进度保留', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { page } = await withPage(t);

  for (let i = 0; i < 3; i += 1) {
    await page.click('#pull-btn');
    await page.waitForTimeout(60);
  }
  const before = (await page.textContent('#stat-pulls')).trim();
  const ownedBefore = await page.locator('#collection .cell.is-owned').count();

  await page.reload({ waitUntil: 'load' });
  const after = (await page.textContent('#stat-pulls')).trim();
  const ownedAfter = await page.locator('#collection .cell.is-owned').count();

  assert.equal(after, before, `刷新后抽取次数丢失: ${before} → ${after}`);
  assert.equal(ownedAfter, ownedBefore, `刷新后图鉴丢失: ${ownedBefore} → ${ownedAfter}`);
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

/** @covers F-015 */
test('F-015 稀有档演出：翻卡动画不被 fever 覆盖', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { page, consoleErrors, pageErrors } = await withPage(t, { initScript: initStub });

  // 普通档：只有翻卡动画
  await page.evaluate(() => { window.__setRng(0.01); });
  await page.click('#pull-btn');
  await page.waitForTimeout(120);
  let anim = await page.evaluate(() => getComputedStyle(document.getElementById('card')).animationName);
  assert.ok(anim.includes('card-in'), `普通档应有翻卡动画，实际 "${anim}"`);
  assert.ok(!anim.includes('fever'), `普通档不应有 fever 动画，实际 "${anim}"`);

  // 神话档：翻卡 + 光晕脉冲必须同时存在
  await page.evaluate(() => { window.__setRng(0.999); });
  await page.click('#pull-btn');
  await page.waitForTimeout(120);
  anim = await page.evaluate(() => getComputedStyle(document.getElementById('card')).animationName);
  assert.ok(anim.includes('card-in'), `神话档翻卡动画被覆盖了，实际 "${anim}"`);
  assert.ok(anim.includes('fever'), `神话档缺少光晕动画，实际 "${anim}"`);

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

/** @covers F-014 */
test('F-014 加速徽标在传说窗口内点亮', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { page, consoleErrors, pageErrors } = await withPage(t, { initScript: initStub });

  // 普通档：无加速徽标
  await page.evaluate(() => { window.__setRng(0.01); });
  await page.click('#pull-btn');
  await page.waitForTimeout(120);
  assert.equal(await page.isVisible('#surge-badge'), false, '普通档不应显示加速徽标');

  // 传说档：徽标出现
  await page.evaluate(() => { window.__setRng(0.9995); });
  await page.click('#pull-btn');
  await page.waitForTimeout(120);
  assert.equal(await page.isVisible('#surge-badge'), true, '传说档应显示加速徽标');

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

/** @covers F-012 */
test('F-012 分档分布随抽取更新', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { page, consoleErrors, pageErrors } = await withPage(t, { initScript: initStub });

  const chips = await page.locator('#tier-dist .tier-chip').count();
  assert.equal(chips, 5, `分档分布应有 5 个条目，实际 ${chips}`);

  // 抽一个神话档 → 神话计数为 1
  await page.evaluate(() => { window.__setRng(0.999); });
  await page.click('#pull-btn');
  await page.waitForTimeout(150);
  const mythicCount = await page.locator('#tier-dist .tier-chip').nth(4).locator('b').textContent();
  assert.equal(mythicCount.trim(), '1', '神话档计数应为 1');

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

/** @covers F-013 */
test('F-013 成就显示达成条件与进度', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { page, consoleErrors, pageErrors } = await withPage(t, { initScript: initStub });

  const items = await page.locator('#achievements li').count();
  assert.equal(items, 11, `成就条目数应为 11，实际 ${items}`);

  // 每项都要有条件文案
  const descs = await page.locator('#achievements .ach-desc').count();
  assert.equal(descs, items, '每个成就都应显示达成条件文案');

  // 未解锁项显示「当前/目标」进度
  const firstProgress = (await page.locator('#achievements .ach-progress').first().textContent()).trim();
  assert.match(firstProgress, /\d+\/\d+/, `未解锁成就应显示进度数字，实际 "${firstProgress}"`);

  // 抽一次后 first_pull 应显示为已解锁
  await page.click('#pull-btn');
  await page.waitForTimeout(150);
  const unlocked = await page.locator('#achievements li.is-unlocked').count();
  assert.ok(unlocked >= 1, '抽取后应至少解锁一项成就');

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

/** @covers F-010 */
test('F-010 自动模式下空格不再叠加抽取', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { page, consoleErrors, pageErrors } = await withPage(t, { initScript: initStub });

  await page.keyboard.press('a');
  assert.equal(await page.getAttribute('#auto-btn', 'aria-pressed'), 'true');

  // 等自动抽若干次，然后立刻连按空格若干次，抽取次数不应被额外拉高
  await page.waitForTimeout(1200);
  const before = Number((await page.textContent('#stat-pulls')).trim());
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Space');
  }
  const after = Number((await page.textContent('#stat-pulls')).trim());
  assert.ok(after - before <= 2, `空格在自动模式下叠加了抽取：${before} → ${after}`);

  await page.keyboard.press('a');
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});

/** @covers F-003 */
test('F-003 重置进度清空卡面与日志', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { page, consoleErrors, pageErrors } = await withPage(t, { initScript: initStub });

  page.on('dialog', (d) => d.accept());
  await page.click('#pull-btn');
  await page.waitForTimeout(150);
  assert.ok(Number((await page.textContent('#stat-pulls')).trim()) >= 1);
  assert.ok((await page.locator('#log li').count()) >= 1, '日志应有记录');

  await page.click('#reset-btn');
  await page.waitForTimeout(200);

  assert.equal((await page.textContent('#stat-pulls')).trim(), '0', '重置后抽取次数应归 0');
  assert.equal((await page.textContent('#card-glyph')).trim(), '?', '重置后卡面应复位');
  assert.equal(await page.locator('#log li').count(), 0, '重置后日志应清空');
  const classes = await page.getAttribute('#card', 'class');
  assert.ok(!classes.includes('is-fever'), `重置后不应残留 fever 类，实际 "${classes}"`);

  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
  assert.deepEqual(consoleErrors, [], `控制台报错: ${consoleErrors.join(' | ')}`);
});
