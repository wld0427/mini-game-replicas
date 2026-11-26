#!/usr/bin/env node
/**
 * 总门禁（gate）
 *
 * 一票否决：任何一项不过 → 退出码 1，本轮不得交付、**不得开始下一款游戏**。
 *
 * 依次执行：
 *   1. 静态代码审查      scripts/review.mjs
 *   2. 立项/设计/计划评审 scripts/design-review.mjs
 *   3. 功能追溯矩阵      scripts/feature-trace.mjs
 *   4. 全量测试          scripts/run-tests.mjs
 *   5. 验收记录核对      docs/acceptance.md 覆盖全部功能 ID
 *   6. 追踪表一致性      games/ 下的项目必须在 TRACKER.md 登记；
 *                       标记为「已交付」的项目必须全部通过以上检查
 *
 * 用法：
 *   node scripts/gate.mjs                 # 全仓门禁
 *   node scripts/gate.mjs games/foo-bar   # 只门禁指定游戏（仍会跑全仓测试）
 */

import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

function run(script, args = []) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(here, script), ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

function check(label, ok, detail = '') {
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main() {
  const targets = process.argv.slice(2);
  const entries = await readdir(path.join(repoRoot, 'games'), { withFileTypes: true });
  const allGames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

  const scope = targets.length
    ? targets.map((t) => path.basename(path.resolve(t)))
    : allGames;

  console.log('════════ 总门禁 ════════\n');
  let passed = true;

  // 1. 静态代码审查
  const review = await run('review.mjs', targets);
  passed = check('静态代码审查', review.code === 0) && passed;
  if (review.code !== 0) console.log(review.out.split('\n').map((l) => `      ${l}`).join('\n'));

  // 2. 立项 / 设计 / 计划评审
  const design = await run('design-review.mjs', targets);
  passed = check('立项评审 + 设计文档 + 开发计划', design.code === 0) && passed;
  if (design.code !== 0) console.log(design.out.split('\n').map((l) => `      ${l}`).join('\n'));

  // 3. 功能追溯矩阵
  const trace = await run('feature-trace.mjs', targets);
  passed = check('功能追溯矩阵（设计 ↔ 实现 ↔ 测试 ↔ 验收）', trace.code === 0) && passed;
  if (trace.code !== 0) console.log(trace.out.split('\n').map((l) => `      ${l}`).join('\n'));

  // 4. 全量测试
  const tests = await run('run-tests.mjs');
  passed = check('全量测试', tests.code === 0) && passed;
  if (tests.code !== 0) console.log(tests.out.split('\n').slice(-25).map((l) => `      ${l}`).join('\n'));

  // 5 + 6. 追踪表一致性：games/ 必须在 TRACKER.md 登记；「已交付」必须过门禁
  let trackerText = '';
  try {
    trackerText = await readFile(path.join(repoRoot, 'TRACKER.md'), 'utf8');
  } catch {
    /* 读不到则跳过 */
  }

  const registered = new Set();
  const delivered = new Set();
  for (const line of trackerText.split('\n')) {
    const m = line.match(/^\|\s*\d+\s*\|[^|]*\|[^|]*\|[^|]*\|\s*`games\/([^/]+)\/`/);
    if (!m) continue;
    registered.add(m[1]);
    if (/已交付/.test(line)) delivered.add(m[1]);
  }

  const unregistered = allGames.filter((g) => !registered.has(g));
  passed = check('追踪表登记完整', unregistered.length === 0,
    unregistered.length ? `未登记: ${unregistered.join(', ')}` : `${allGames.length} 款均已登记`) && passed;

  // 作用域内的「已交付」项目必须全部通过门禁。
  // 指定了游戏时只检查该游戏；全仓模式下检查所有已交付项目。
  const deliveredInScope = [...delivered].filter((g) => scope.includes(g));
  const deliveredNotPassed = deliveredInScope.filter(
    () => design.code !== 0 || trace.code !== 0 || tests.code !== 0,
  );
  passed = check('标记为「已交付」的项目均通过门禁', deliveredNotPassed.length === 0,
    deliveredNotPassed.length ? `未通过: ${deliveredNotPassed.join(', ')}` : `${deliveredInScope.length} 款已交付项目均达标`) && passed;

  console.log('');
  if (passed) {
    console.log('✓ 总门禁通过。');
    console.log('  → 允许交付当前游戏，并允许开始下一款。');
    process.exit(0);
  }
  console.log('✗ 总门禁未通过。');
  console.log('  → 本轮不得交付，**不得开始下一款游戏**。请先修复上述问题。');
  process.exit(1);
}

main().catch((err) => {
  console.error('门禁自身出错：', err);
  process.exit(2);
});
