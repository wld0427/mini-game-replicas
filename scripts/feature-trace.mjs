#!/usr/bin/env node
/**
 * 功能可追溯矩阵校验
 *
 * 本项目防"粗制滥造"的核心闸门。对每个游戏校验三处痕迹是否对齐：
 *
 *   设计文档 docs/design.md 的功能清单  | F-001 |
 *            ↕ 必须一一对应
 *   代码实现标记  @feature F-001
 *            ↕
 *   测试断言标记  @covers F-001  或测试名以 F-001 开头
 *            ↕
 *   验收记录 docs/acceptance.md 中的 F-001 行
 *
 * 缺任何一处 → 该功能判为"未完成"，退出码 1。
 * 代码里有标记但设计文档里没有 → 孤儿实现，也判失败（说明文档没跟上代码）。
 *
 * 用法：
 *   node scripts/feature-trace.mjs                 # 检查全部游戏
 *   node scripts/feature-trace.mjs games/foo-bar   # 只检查指定游戏
 *   node scripts/feature-trace.mjs --report        # 只输出矩阵，不做失败判定
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

/** 从设计文档的功能清单表里解析出全部功能 ID。 */
function parseDesignFeatures(text) {
  const ids = [];
  const seen = new Set();
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*(F-\d{3})\s*\|/);
    if (!m) continue;
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** 从验收记录里解析出已验收的功能 ID。 */
function parseAcceptanceIds(text) {
  const ids = new Set();
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*(F-\d{3})\s*\|/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

/** 相对仓库根的路径；超出仓库则用绝对路径，避免出现一长串 ../ */
function displayPath(full) {
  const rel = path.relative(repoRoot, full);
  return rel.startsWith('..') ? full : rel;
}

/** 扫描目录内所有文件，收集 @feature / @covers 标记的 ID 及其出处。 */
async function collectMarkers(dir, tag) {
  const found = new Map();
  let files;
  try {
    files = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of files) {
    if (!entry.isFile()) continue;
    if (!/\.(m?js|css|html)$/.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const text = await readFile(full, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!line.includes(tag)) return;
      // 允许一行写多个 ID：@feature F-001 F-002
      const ids = line
        .slice(line.indexOf(tag) + tag.length)
        .match(/F-\d{3}/g);
      if (!ids) return;
      for (const id of ids) {
        if (!found.has(id)) found.set(id, []);
        found.get(id).push(`${displayPath(full)}:${i + 1}`);
      }
    });
  }
  return found;
}

/** 测试标记也接受「测试名以 F-xxx 开头」这种写法。 */
async function collectTestMarkers(dir) {
  const found = await collectMarkers(dir, '@covers');
  const re = /test\(\s*['"`](F-\d{3})/g;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.m?js$/.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const text = await readFile(full, 'utf8');
    let m;
    while ((m = re.exec(text)) !== null) {
      const lineNo = text.slice(0, m.index).split('\n').length;
      if (!found.has(m[1])) found.set(m[1], []);
      found.get(m[1]).push(`${displayPath(full)}:${lineNo}`);
    }
  }
  return found;
}

async function auditGame(gameDir, { reportOnly }) {
  const slug = path.basename(gameDir);
  const problems = [];
  const designPath = path.join(gameDir, 'docs', 'design.md');
  const acceptancePath = path.join(gameDir, 'docs', 'acceptance.md');

  let designText;
  try {
    designText = await readFile(designPath, 'utf8');
  } catch {
    // 没有设计文档 = 根本没有功能清单可追溯 = 未完成，必须判失败（不能当成"跳过"）
    return {
      slug,
      skipped: false,
      reason: null,
      problems: ['缺少 docs/design.md：没有功能清单就没有追溯基准，本游戏判定为未完成'],
      matrix: [],
    };
  }

  const features = parseDesignFeatures(designText);
  if (features.length === 0) {
    problems.push('design.md 的「功能清单」表里没有解析到任何 `| F-xxx |` 行');
  }

  const impl = await collectMarkers(path.join(gameDir, 'src'), '@feature');
  const implAssets = await collectMarkers(path.join(gameDir, 'assets'), '@feature');
  for (const [k, v] of implAssets) {
    impl.set(k, [...(impl.get(k) || []), ...v]);
  }
  const tests = await collectTestMarkers(path.join(gameDir, 'test'));

  let accepted = new Set();
  try {
    accepted = parseAcceptanceIds(await readFile(acceptancePath, 'utf8'));
  } catch {
    problems.push('缺少 docs/acceptance.md（功能验收记录）');
  }

  const matrix = features.map((id) => {
    const hasImpl = impl.has(id);
    const hasTest = tests.has(id);
    const hasAccept = accepted.has(id);
    if (!hasImpl) problems.push(`${id} 没有实现标记（代码里找不到 @feature ${id}）`);
    if (!hasTest) problems.push(`${id} 没有测试覆盖（测试里找不到 @covers ${id} 或以 ${id} 开头的用例）`);
    if (!hasAccept) problems.push(`${id} 没有验收记录（docs/acceptance.md 里缺 ${id} 行）`);
    return {
      id,
      impl: hasImpl ? impl.get(id)[0] : null,
      test: hasTest ? tests.get(id)[0] : null,
      accept: hasAccept,
      ok: hasImpl && hasTest && hasAccept,
    };
  });

  // 孤儿实现：代码里标了功能，但设计文档没登记
  for (const id of impl.keys()) {
    if (!features.includes(id)) {
      problems.push(`孤儿实现 ${id}：代码里有 @feature 标记，但设计文档功能清单里没有这一条`);
    }
  }

  return { slug, skipped: false, problems, matrix };
}

async function main() {
  const argv = process.argv.slice(2);
  const reportOnly = argv.includes('--report');
  const targets = argv.filter((a) => !a.startsWith('--'));

  let gameDirs;
  if (targets.length) {
    gameDirs = targets.map((t) => path.resolve(t));
  } else {
    const entries = await readdir(path.join(repoRoot, 'games'), { withFileTypes: true });
    gameDirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(repoRoot, 'games', e.name));
  }

  const results = [];
  for (const dir of gameDirs) results.push(await auditGame(dir, { reportOnly }));

  let totalProblems = 0;
  for (const r of results) {
    if (r.skipped) {
      console.log(`\n⏭  ${r.slug} — ${r.reason}`);
      continue;
    }
    const okCount = r.matrix.filter((m) => m.ok).length;
    console.log(`\n── ${r.slug} ── 功能 ${r.matrix.length} 项，追溯完整 ${okCount} 项`);
    for (const m of r.matrix) {
      const mark = m.ok ? '✅' : '❌';
      console.log(`  ${mark} ${m.id}  impl:${m.impl || '缺失'}  test:${m.test || '缺失'}  accept:${m.accept ? '✓' : '缺失'}`);
    }
    if (r.problems.length) {
      console.log(`  ⚠️  ${r.problems.length} 个问题：`);
      for (const p of r.problems) console.log(`     · ${p}`);
    }
    totalProblems += r.problems.length;
  }

  console.log('');
  if (totalProblems === 0) {
    console.log('✓ 功能追溯矩阵完整：无缺失实现、无缺失测试、无缺失验收、无孤儿实现。');
    process.exit(0);
  }
  if (reportOnly) {
    console.log(`（--report 模式）共发现 ${totalProblems} 个追溯缺口。`);
    process.exit(0);
  }
  console.log(`✗ 功能追溯校验失败：共 ${totalProblems} 个缺口。`);
  process.exit(1);
}

main().catch((err) => {
  console.error('追溯校验器自身出错：', err);
  process.exit(2);
});
