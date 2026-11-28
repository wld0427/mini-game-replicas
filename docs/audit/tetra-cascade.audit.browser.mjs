import path from 'node:path';
import { startServer, loadChromium } from '/workspace/mini-game-replicas/games/tetra-cascade/test/helpers.mjs';

const root = '/workspace/mini-game-replicas/games/tetra-cascade';
const out = '/workspace/preview';
const chromium = await loadChromium();
const { server, port } = await startServer(root);
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const problems = [];
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { problems.push(m); console.log('  ✗', m); };

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
await page.waitForSelector('#board .cell');

console.log('=== A. 首屏：棋盘是否可见 ===');
{
  const info = await page.evaluate(() => {
    const board = document.getElementById('board');
    const overlay = document.getElementById('overlay');
    const br = board.getBoundingClientRect();
    const or = overlay.getBoundingClientRect();
    const cs = getComputedStyle(overlay);
    return {
      boardCells: board.querySelectorAll('.cell').length,
      boardH: Math.round(br.height),
      boardW: Math.round(br.width),
      overlayBg: cs.backgroundColor,
      overlayBlur: cs.backdropFilter,
      overlayCovers: or.height >= br.height && or.width >= br.width,
    };
  });
  console.log('   ', JSON.stringify(info));
  if (info.overlayCovers) {
    const alpha = parseFloat((info.overlayBg.match(/[\d.]+/g) || [])[3] || '0');
    if (alpha >= 0.7) bad(`首屏遮罩不透明度 ${alpha}，棋盘被盖住（棋盘 ${info.boardH}px 高全被罩住，玩家看不到网格）`);
    else ok(`首屏遮罩不透明度 ${alpha}，棋盘仍透出`);
  }
  await page.screenshot({ path: path.join(out, 'tc-audit-title.png'), fullPage: true });
}

console.log('\n=== B. 首屏：「下一个」与「暂存」预览框 ===');
{
  const info = await page.evaluate(() => ({
    holdBox: document.querySelectorAll('#hold-box .mini-cell').length,
    nextBox: document.querySelectorAll('#next-box *').length,
    nextExists: !!document.getElementById('next-box'),
  }));
  console.log('   ', JSON.stringify(info));
  if (info.nextExists && info.nextBox === 0) bad('「下一个」预览框在首屏整个是空的（看起来像没渲染）');
  else ok('「下一个」预览框有内容');
}

console.log('\n=== C. 开局后棋盘是否正常显示 ===');
{
  await page.click('#start-btn');
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const board = document.getElementById('board');
    const cells = board.querySelectorAll('.cell');
    // 空格子底色本就是 3.5% 透明度（网格线），不能拿它判断"可见"；
    // 要看的是**已落子的格子**有没有实心底色
    const solid = [];
    for (const c of board.querySelectorAll('.cell')) {
      const bg = getComputedStyle(c).backgroundColor;
      const m = bg.match(/[\d.]+/g);
      // rgb() 没有 alpha 分量 = 不透明；只有 rgba()/带 / 的才是半透明
      const alpha = m ? (m.length >= 4 ? parseFloat(m[3]) : 1) : 0;
      if (alpha > 0.5) solid.push(bg);
    }
    return {
      cells: cells.length,
      filled: board.querySelectorAll('.cell.filled, .cell.p, .cell.block').length,
      solidCells: solid.length,
      overlayHidden: document.getElementById('overlay').hidden,
      nextPieces: document.querySelectorAll('#next-box .next-piece, #next-box > *').length,
    };
  });
  console.log('   ', JSON.stringify(info));
  info.overlayHidden ? ok('开局后遮罩隐藏，棋盘可见') : bad('开局后遮罩没有隐藏');
  info.solidCells > 0 ? ok(`已落子的格子有实心底色（${info.solidCells} 个）`) : bad('棋盘上没有任何实心底色的格子');
  info.nextPieces > 0 ? ok('「下一个」预览有方块') : bad('「下一个」预览仍为空');
}

console.log('\n=== D. HUD 是否实时更新 ===');
{
  const before = (await page.textContent('#stat-score')).trim();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  const after = (await page.textContent('#stat-score')).trim();
  const lines = (await page.textContent('#stat-lines')).trim();
  console.log(`   分数 ${before} → ${after}，行数 ${lines}`);
  Number(after) > Number(before) ? ok('落子后分数会更新') : bad(`落子后分数没更新（${before} → ${after}）`);
}

console.log('\n=== E. 抛竿计数是否可见 ===');
{
  const has = await page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll('#hud .hud-item dt')).map((n) => n.textContent.trim());
    return ids;
  });
  console.log('   HUD 项目:', has.join(' / '));
  if (!has.some((t) => /抛|投|cast/i.test(t))) bad('HUD 没有抛竿计数（逻辑层记了 stats.casts，界面从不展示）');
  else ok('HUD 有抛竿计数');
}

console.log('\n=== F. 错误日志 ===');
errs.length ? bad(`页面报错：${errs.join(' | ')}`) : ok('无 JS 报错 / console error');

await browser.close();
server.close();
console.log('\n=== 结论 ===');
console.log(problems.length ? `发现 ${problems.length} 个问题` : '浏览器侧未发现问题');
