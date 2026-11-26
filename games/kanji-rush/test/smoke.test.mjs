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
  assert.equal(achItems, 9, `成就条目数应为 9，实际 ${achItems}`);

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
  const { page, consoleErrors, pageErrors } = await withPage(t, {
    initScript: () => {
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

      // 每抽一次消耗 2 个随机数：第 1 个定档位，第 2 个选字
      Math.random = () => {
        if (window.__rngPhase === 0) {
          window.__rngPhase = 1;
          return window.__nextRng;
        }
        window.__rngPhase = 0;
        return 0.5;
      };
    },
  });

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
