#!/usr/bin/env node
/**
 * 跑遍 games/ 下所有项目的测试。
 * 用法：node scripts/run-tests.mjs
 * 退出码：0 = 全部通过；1 = 有项目失败
 */

import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const gamesDir = path.join(repoRoot, 'games');

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

const entries = await readdir(gamesDir, { withFileTypes: true });
const games = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

if (games.length === 0) {
  console.log('games/ 下没有项目。');
  process.exit(0);
}

let failed = 0;
for (const game of games) {
  console.log(`\n──────── 测试: ${game} ────────`);
  const code = await run('node', ['--test', 'test/*.test.mjs'], path.join(gamesDir, game));
  if (code !== 0) {
    failed += 1;
    console.error(`✗ ${game} 测试未通过（退出码 ${code}）`);
  }
}

console.log('\n════════ 汇总 ════════');
console.log(`项目总数: ${games.length}，失败: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
