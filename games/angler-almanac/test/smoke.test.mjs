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

/** @covers F-001 F-003 F-004 F-006 F-007 F-010 F-012 F-013 F-014 F-016 */
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

/** @covers F-014 */
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

/* ═══════════════════════════════════════════════════════════
   审计盲区回归用例（D-1 ~ D-4）
   这些用例针对的都是「测试全绿但游戏有洞」的历史问题，
   每一条都必须能独立判定通过或失败。
   ═══════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'angler-almanac-state-v1';

/**
 * 在页面加载前写入一份存档，用来构造特定局面（升级等级、金钱等）。
 * @param {import('playwright').Page} page
 * @param {object} patch 要覆盖的字段
 */
async function seedState(page, patch = {}) {
  const base = {
    version: 1,
    coins: 0,
    totalEarned: 0,
    upgrades: { rod: 0, reel: 0, bait: 0, basket: 0 },
    dex: {},
    achievements: {},
    stats: {
      casts: 0, catches: 0, misses: 0, escapes: 0, bestCm: 0,
      tierCounts: { n: 0, r: 0, sr: 0, ssr: 0, ur: 0 },
    },
    pity: 0,
    startedAt: null,
  };
  const merged = {
    ...base,
    ...patch,
    upgrades: { ...base.upgrades, ...(patch.upgrades || {}) },
    stats: { ...base.stats, ...(patch.stats || {}) },
  };
  await page.addInitScript(([key, value]) => {
    window.localStorage.setItem(key, value);
  }, [STORAGE_KEY, JSON.stringify(merged)]);
}

/**
 * 抛竿 → 等咬钩 → 读出真实起竿窗口长度（不点击，让它自然超时）。
 * @returns {Promise<number>} 起竿窗口毫秒数
 */
async function measureHookWindow(browser, port, patch = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  await seedState(page, patch);
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#dex .dex-cell');
  await page.click('#cast-btn');
  await page.waitForSelector('#hook-btn:visible', { timeout: 8000 });
  const window = await page.evaluate(() => Number(document.getElementById('scene').dataset.hookWindow));
  await context.close();
  return window;
}

/** @covers F-002 F-006 */
test('D-1 咬钩后错过起竿窗口会判负：鱼跑掉、计入失手、产物卡不剧透', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
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
  await page.waitForSelector('#dex .dex-cell');

  await page.click('#cast-btn');
  await page.waitForSelector('#hook-btn:visible', { timeout: 8000 });

  const window = await page.evaluate(() => Number(document.getElementById('scene').dataset.hookWindow));
  assert.ok(window > 0, '咬钩时应把起竿窗口长度挂到 DOM 上供判定');

  // 关键：什么都不做，等窗口自然过期
  await page.waitForFunction(
    () => document.getElementById('scene').dataset.phase === 'result',
    null,
    { timeout: window + 5000 },
  );

  assert.equal((await page.textContent('#phase-text')).trim(), '鱼跑掉了', '窗口过期应判「鱼跑掉了」');
  assert.equal((await page.textContent('#stat-misses')).trim(), '1', '失手计数应为 1');
  assert.equal((await page.textContent('#stat-casts')).trim(), '1', '抛竿计数应为 1');
  assert.equal((await page.textContent('#stat-catches')).trim(), '0', '没有上钩，收获应为 0');
  assert.equal(await page.isVisible('#hook-btn'), false, '判负后起竿按钮应消失');
  assert.equal(await page.isVisible('#reel-panel'), false, '判负后不应进入遛鱼面板');

  // 产物卡不得剧透鱼种与体长
  assert.equal((await page.textContent('#catch-name')).trim(), '跑了');
  assert.equal((await page.textContent('#catch-size')).trim(), '没能钓上来');
  assert.equal((await page.textContent('#stat-dex')).trim(), '0/44', '未上钩不应解锁图鉴');
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});

/** @covers F-002 F-010 */
test('D-2 卷线器等级会真实改变起竿窗口长度（UI 级断言）', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
  const { server, port } = await startServer(root);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  t.after(async () => {
    await browser.close();
    server.close();
  });

  const base = await measureHookWindow(browser, port, { upgrades: { reel: 0 } });
  const up2 = await measureHookWindow(browser, port, { upgrades: { reel: 2 } });

  assert.equal(base, 1350, '卷线器 Lv.0 的起竿窗口应为 1350ms');
  assert.equal(up2, 1350 + 2 * 130, '卷线器 Lv.2 的起竿窗口应为 1610ms');
  assert.ok(up2 > base, '卷线器升级必须真实拉宽起竿窗口');
});

/** @covers F-006 F-015 */
test('D-3 遛鱼断线后产物卡不剧透鱼种，断线计数 +1，张力进入危险区', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
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
  await page.waitForSelector('#dex .dex-cell');

  await page.click('#cast-btn');
  await page.waitForSelector('#hook-btn:visible', { timeout: 8000 });
  await page.click('#hook-btn');
  await page.waitForSelector('#reel-panel:visible', { timeout: 5000 });

  // 完全不操作：张力按 REEL.drift 持续上涨，必然拉满断线
  await page.waitForFunction(
    () => document.getElementById('scene').dataset.phase === 'result',
    null,
    { timeout: 25000 },
  );

  assert.equal((await page.textContent('#phase-text')).trim(), '线断了！');
  assert.equal((await page.textContent('#stat-escapes')).trim(), '1', '断线计数应为 1');
  assert.equal((await page.textContent('#stat-misses')).trim(), '0', '断线不计入失手');
  assert.equal((await page.textContent('#stat-catches')).trim(), '0', '断线没有收获');

  // 失败时不得显示鱼种名与体长
  const name = (await page.textContent('#catch-name')).trim();
  const size = (await page.textContent('#catch-size')).trim();
  assert.equal(name, '跑了', `断线后产物卡不应显示鱼种，实际「${name}」`);
  assert.equal(size, '没能钓上来', `断线后产物卡不应显示体长，实际「${size}」`);
  assert.equal((await page.textContent('#stat-dex')).trim(), '0/44', '断线不应解锁图鉴');
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});

/** @covers F-011 */
test('D-4 饵升到 Lv.5 时水层名正常渲染，不出现 undefined', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
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

  await seedState(page, { upgrades: { bait: 5 } });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForSelector('#dex .dex-cell');

  const depth = (await page.textContent('#stat-depth')).trim();
  assert.equal(depth, '极渊 Lv.5', `Lv.5 的水层名应为「极渊 Lv.5」，实际「${depth}」`);

  const sceneDepth = (await page.textContent('#scene-depth')).trim();
  assert.equal(sceneDepth, '极渊 Lv.5', '场景水层徽标应显示同一个水层名');
  assert.ok(!sceneDepth.includes('undefined'), '场景水层徽标不得出现 undefined');

  // 整页不得出现 undefined
  const hasUndefined = await page.evaluate(() => document.body.innerText.includes('undefined'));
  assert.equal(hasUndefined, false, '页面不得出现 undefined 文案');
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});

/** @covers F-005 F-015 */
test('遛鱼命中甜区有视觉反馈与连击计数，张力配色随分区切换', { skip: chromium ? false : 'playwright 不可用' }, async (t) => {
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
  await page.waitForSelector('#dex .dex-cell');

  await page.click('#cast-btn');
  await page.waitForSelector('#hook-btn:visible', { timeout: 8000 });
  await page.click('#hook-btn');
  await page.waitForSelector('#reel-panel:visible', { timeout: 5000 });

  // 张力条与钓线必须共享同一个分区口径
  const zones = await page.evaluate(() => ({
    fill: document.getElementById('tension-fill').dataset.zone,
    line: document.getElementById('scene-line').dataset.zone,
    panel: document.getElementById('reel-panel').dataset.zone,
  }));
  assert.ok(['safe', 'warn', 'danger'].includes(zones.fill), `张力填充条应有合法分区，实际「${zones.fill}」`);
  assert.equal(zones.line, zones.fill, '钓线配色分区必须与张力条一致');
  assert.equal(zones.panel, zones.fill, '遛鱼面板分区必须与张力条一致');

  // 等标记进入甜区后立刻点击，应当判定为命中
  const box = await page.locator('#reel-panel').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  let hit = false;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline && !hit) {
    const info = await page.evaluate(() => {
      const panel = document.getElementById('reel-panel');
      return {
        phase: document.getElementById('scene').dataset.phase,
        marker: Number(panel.dataset.marker),
        sweet: Number(panel.dataset.sweet),
        width: Number(panel.dataset.width),
      };
    });
    if (info.phase !== 'reel') break;
    if (Math.abs(info.marker - info.sweet) <= info.width / 2) {
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(60);
      hit = await page.evaluate(() => document.getElementById('timing-marker').classList.contains('is-hit'));
    }
  }
  assert.ok(hit, '在甜区内点击后标记应带有 is-hit 反馈类');

  const combo = (await page.textContent('#reel-combo')).trim();
  assert.match(combo, /×\d+/, `命中后应显示连击计数，实际「${combo}」`);
  assert.deepEqual(pageErrors, [], `页面抛出异常: ${pageErrors.join(' | ')}`);
});
