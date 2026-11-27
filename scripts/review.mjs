#!/usr/bin/env node
/**
 * 静态代码审查器
 *
 * 在推送 GitHub 之前对 games/* 下所有项目做一轮可重复的静态检查。
 * 规则分三类：
 *   - 缺陷检测（JS）：宽松相等、空 catch、eval、可疑全局泄漏等
 *   - 资产一致性（HTML）：引用的本地资源是否存在、是否引用了外部 CDN
 *   - 发布安全（全局）：是否泄漏密钥、是否残留调试语句、TODO 遗留
 *
 * 用法：node scripts/review.mjs [项目目录 ...]
 * 退出码：0 = 无问题；1 = 发现问题
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const findings = [];

function add(file, line, rule, message) {
  const rel = path.relative(repoRoot, file);
  findings.push({
    file: rel.startsWith('..') ? file : rel,
    line,
    rule,
    message,
  });
}

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ── JS 规则 ───────────────────────────────────────── */

/** 注释行不参与语义类规则判定。 */
const COMMENT_ONLY = /^\s*(?:\/\/|\/\*|\*|\*\/)/;

const JS_RULES = [
  {
    id: 'eqeqeq',
    re: /[^=!<>]==[^=]/,
    skip: (line) => COMMENT_ONLY.test(line),
    msg: '使用了宽松相等 ==，请改用 ===',
  },
  {
    id: 'eqeqeq',
    re: /[^!]!=[^=]/,
    skip: (line) => COMMENT_ONLY.test(line),
    msg: '使用了宽松不等 !=，请改用 !==',
  },
  {
    id: 'no-eval',
    re: /\beval\s*\(|new\s+Function\s*\(/,
    msg: '禁止使用 eval / new Function',
  },
  {
    id: 'no-debugger',
    re: /\bdebugger\b/,
    msg: '残留 debugger 语句',
  },
  {
    id: 'no-console-debug',
    re: /console\.(log|debug|info|trace)\s*\(/,
    skip: (line) => COMMENT_ONLY.test(line),
    msg: '残留 console 调试输出',
  },
  {
    id: 'no-empty-catch',
    re: /catch\s*(\([^)]*\))?\s*\{\s*\}/,
    msg: '空的 catch 块，请至少写注释说明',
  },
  {
    id: 'no-var',
    re: /(^|[^.\w])var\s+[A-Za-z_$]/,
    skip: (line) => COMMENT_ONLY.test(line),
    msg: '请使用 let / const 代替 var',
  },
  {
    id: 'no-set-timeout-string',
    re: /setTimeout\s*\(\s*['"`]/,
    msg: 'setTimeout 传入字符串会走 eval，请改用函数',
  },
  {
    id: 'no-implicit-globals',
    re: /^[A-Za-z_$][\w$]*\s*=[^=]/,
    skip: (line) => COMMENT_ONLY.test(line) || /^\s/.test(line),
    msg: '疑似隐式全局变量赋值（顶层未声明的赋值）',
  },
  {
    id: 'no-user-content-in-innerhtml',
    re: /\.innerHTML\s*=.*\$\{[^}]*\b(user|input|query|param|search|hash|location|url)\b/i,
    msg: 'innerHTML 插入了用户可控内容，存在 XSS 风险',
  },
  {
    id: 'no-document-write',
    re: /document\s*\.\s*writeln?\s*\(/,
    msg: '禁止 document.write',
  },
];

/* ── 密钥泄漏检测 ─────────────────────────────────── */

const SECRET_PATTERNS = [
  { re: /gh[pousr]_[A-Za-z0-9]{16,}/, msg: '疑似 GitHub token' },
  { re: /AKIA[0-9A-Z]{16}/, msg: '疑似 AWS Access Key' },
  { re: /sk-[A-Za-z0-9]{20,}/, msg: '疑似 OpenAI API key' },
  { re: /(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i, msg: '疑似硬编码凭证' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, msg: '疑似私钥文件内容' },
];

/* ── HTML 规则 ─────────────────────────────────────── */

async function reviewHtml(file) {
  const text = await readFile(file, 'utf8');
  const lines = text.split('\n');
  const base = path.dirname(file);

  lines.forEach((line, i) => {
    if (!/<meta\s+name=["']viewport["']/i.test(line) && /<head>/i.test(text)) {
      // 仅在整份文档缺失时报告，这里不逐行报
    }
    if (/on(click|load|error|mouseover)\s*=/i.test(line)) {
      add(file, i + 1, 'no-inline-handler', '存在内联事件处理器，请改用 addEventListener');
    }
    if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(line)) {
      add(file, i + 1, 'no-inline-script', '存在内联 <script>，请拆成独立文件');
    }
  });

  if (!/<meta\s+name=["']viewport["']/i.test(text)) {
    add(file, 0, 'missing-viewport', '缺少 viewport meta，移动端表现会退化');
  }
  if (!/<html[^>]+lang=/i.test(text)) {
    add(file, 0, 'missing-lang', '<html> 缺少 lang 属性');
  }
  if (!/<title>/i.test(text)) {
    add(file, 0, 'missing-title', '缺少 <title>');
  }

  // 本地资源引用必须存在
  const refs = [...text.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:)?\/\//i.test(ref) || ref.startsWith('data:') || ref.startsWith('#')) continue;
    if (/^(mailto:|tel:)/i.test(ref)) continue;
    const target = path.resolve(base, ref.split('?')[0].split('#')[0]);
    try {
      await stat(target);
    } catch {
      add(file, 0, 'missing-asset', `引用的本地资源不存在: ${ref}`);
    }
  }

  // 外部 CDN 依赖：静态站应自包含
  const externals = [...text.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)["']/g)].map((m) => m[1]);
  for (const url of externals) {
    add(file, 0, 'external-dep', `引用了外部资源（应自包含或注明授权）: ${url}`);
  }

  // 零 starter 残留：脚手架的默认标题、占位文案、空引用一旦漏进交付物，
  // 玩家一眼就能看出是半成品。这类问题机器最容易查，也最不该出现。
  const residue = [
    [/\bTODO\b/, '残留 TODO 标记'],
    [/\bFIXME\b/, '残留 FIXME 标记'],
    [/\blorem\s+ipsum\b/i, '残留 lorem ipsum 占位文案'],
    [/\b(?:your\s+)?(?:game|title)\s+here\b/i, '残留脚手架默认标题'],
    [/(?:src|href)=["']\s*["']/, '存在空资源引用（src="" / href=""）'],
  ];
  for (const [re, msg] of residue) {
    const m = re.exec(text);
    if (m) {
      const lineNo = text.slice(0, m.index).split('\n').length;
      add(file, lineNo, 'starter-residue', msg);
    }
  }
}

/* ── 主流程 ───────────────────────────────────────── */

async function main() {
  const targets = process.argv.slice(2);
  const gameDirs = targets.length
    ? targets.map((t) => path.resolve(t))
    : (await readdir(path.join(repoRoot, 'games'), { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => path.join(repoRoot, 'games', e.name));

  if (gameDirs.length === 0) {
    console.log('没有可审查的项目。');
    process.exit(0);
  }

  for (const dir of gameDirs) {
    const files = await walk(dir);
    const hasIndex = files.some((f) => path.basename(f) === 'index.html');
    if (!hasIndex) add(dir, 0, 'missing-entry', '项目缺少 index.html');
    if (!files.some((f) => /(^|\/)README\.md$/i.test(f))) {
      add(dir, 0, 'missing-readme', '项目缺少 README.md');
    }
    if (!files.some((f) => f.includes(`${path.sep}test${path.sep}`))) {
      add(dir, 0, 'missing-tests', '项目缺少测试目录');
    }

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const text = await readFile(file, 'utf8');
      const lines = text.split('\n');

      if (ext === '.js' || ext === '.mjs') {
        lines.forEach((line, i) => {
          for (const rule of JS_RULES) {
            if (rule.skip && rule.skip(line)) continue;
            const hit = rule.re.test(line);
            if (rule.invert ? !hit : hit) add(file, i + 1, rule.id, rule.msg);
          }
        });
      }

      for (const pattern of SECRET_PATTERNS) {
        lines.forEach((line, i) => {
          if (pattern.re.test(line)) add(file, i + 1, 'secret-leak', pattern.msg);
        });
      }

      if (ext === '.html') await reviewHtml(file);
    }
  }

  if (findings.length === 0) {
    console.log(`✓ 静态审查通过：检查了 ${gameDirs.length} 个项目，未发现问题。`);
    process.exit(0);
  }

  console.log(`✗ 静态审查发现 ${findings.length} 个问题：\n`);
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  for (const [file, list] of byFile) {
    console.log(`  ${file}`);
    for (const f of list) {
      console.log(`    ${f.line ? `L${f.line}`.padEnd(6) : '      '} [${f.rule}] ${f.message}`);
    }
    console.log('');
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('审查器自身出错：', err);
  process.exit(2);
});
