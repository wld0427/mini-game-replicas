#!/usr/bin/env node
/**
 * 立项评审 + 设计文档 + 开发计划的结构与红线校验
 *
 * 对每个游戏校验 games/<slug>/docs/ 下的三份必备文档：
 *   proposal.md — 立项评审：章节齐全、评分达标、无否决项、结论为"通过"
 *   design.md   — 功能设计：章节齐全、功能 ID 连续、验收标准可判定、边界与打磨清单非空
 *   plan.md     — 开发计划：阶段数达标、每阶段有验收命令与完成标准
 *
 * 本脚本只做**机器可判定的部分**。好不好玩、够不够好看是人的判断，由人写在文档里。
 *
 * 用法：
 *   node scripts/design-review.mjs                 # 检查全部游戏
 *   node scripts/design-review.mjs games/foo-bar   # 只检查指定游戏
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const MIN_TOTAL_SCORE = 20;
const MIN_FEATURES = 5;
const MIN_STAGES = 3;
const MIN_EDGE_CASES = 3;
const MIN_POLISH_ITEMS = 3;

const PROPOSAL_SECTIONS = [
  '一句话定位', '为什么做它', '核心亮点', '核心循环引擎', '独特钩子', '参考调研',
  '独特玩法', '表现力', '差异化', '可测性', '风险与代价', '评分', '结论',
];

const DESIGN_SECTIONS = [
  '一句话定位', '核心玩法循环', '状态机', '数据结构',
  '功能清单', '难度契约', '边界与异常', '交互流程', '打磨清单',
];

/** 五个核心循环引擎之一。立项评审必须锁定类型，防止"什么都是一点"的平庸设计。 */
const CORE_LOOPS = [
  'puzzle-pressure',
  'strategy-combo',
  'skill-flow',
  'progression-rng',
  'sandbox-explore',
];

const SCORE_DIMS = [
  '玩法独特性', '核心表现力', '玩法闭环度', '可测性', '实现可行性', '差异化价值',
];

/** 把 markdown 按二级标题切分成 { 标题: 正文 } */
function splitSections(text) {
  const map = new Map();
  const parts = text.split(/\n(?=##\s)/);
  for (const part of parts) {
    const m = part.match(/^##\s+(.+?)\s*$/m);
    if (!m) continue;
    const body = part.slice(m.index + m[0].length);
    map.set(m[1].trim(), body);
  }
  return map;
}

/** 去掉 HTML 注释与占位提示后的实质内容 */
function substantive(body) {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tableRows(body) {
  return body
    .split('\n')
    .filter((l) => /^\|/.test(l))
    .filter((l) => !/^\|\s*-{2,}/.test(l))
    .filter((l) => !/^\|\s*ID\s*\|/i.test(l))
    .filter((l) => !/^\|\s*场景\s*\|/.test(l))
    .filter((l) => !/^\|\s*类别\s*\|/.test(l))
    .filter((l) => !/^\|\s*检查项\s*\|/.test(l))
    .filter((l) => !/^\|\s*风险\s*\|/.test(l));
}

async function reviewProposal(text, problems) {
  const sections = splitSections(text);
  for (const name of PROPOSAL_SECTIONS) {
    if (!sections.has(name)) {
      problems.push(`proposal.md 缺少章节「${name}」`);
      continue;
    }
    const body = substantive(sections.get(name));
    if (body.length < 10) problems.push(`proposal.md「${name}」没有实质内容`);
  }

  // 评分
  const scoreBody = sections.get('评分') || '';
  let total = null;
  const dims = {};
  for (const line of scoreBody.split('\n')) {
    const m = line.match(/^\s*[-*]\s*([^:：]+?)\s*[:：]\s*(\d+)\s*\/\s*(\d+)/);
    if (!m) continue;
    const key = m[1].trim();
    const val = Number(m[2]);
    const max = Number(m[3]);
    if (key === '总分') total = val;
    else dims[key] = { val, max };
  }
  for (const dim of SCORE_DIMS) {
    if (!dims[dim]) problems.push(`proposal.md 评分缺少维度「${dim}」`);
  }
  if (total === null) problems.push('proposal.md 评分缺少「总分」行');
  else if (total < MIN_TOTAL_SCORE) {
    problems.push(`proposal.md 总分 ${total} 未达门槛 ${MIN_TOTAL_SCORE}`);
  }

  // 否决项
  const vetoBody = sections.get('评分') || '';
  const vetoSection = vetoBody.split('### 否决项自查')[1] || '';
  let vetoCount = 0;
  for (const line of vetoSection.split('\n')) {
    const m = line.match(/^\s*[-*]\s*(.+?)\s*[:：]\s*(是|否)\s*$/);
    if (!m) continue;
    vetoCount += 1;
    if (m[2] === '是') {
      problems.push(`proposal.md 否决项被触发：「${m[1].trim()}」= 是，该选题不得开工`);
    }
  }
  if (vetoCount === 0) problems.push('proposal.md「否决项自查」没有逐条回答');

  // 结论
  const concl = substantive(sections.get('结论') || '');
  if (!/通过/.test(concl)) {
    problems.push(`proposal.md 结论不是「通过」（实际：${concl.slice(0, 30) || '空'}）`);
  }
  if (/放弃/.test(concl)) {
    problems.push('proposal.md 结论为「放弃」，该选题应退回候选池，不进入开发');
  }

  // 核心循环引擎：必须锁定到五类之一
  const loopBody = substantive(sections.get('核心循环引擎') || '');
  const hitLoops = CORE_LOOPS.filter((id) => loopBody.includes(id));
  if (hitLoops.length === 0) {
    problems.push(
      `proposal.md「核心循环引擎」必须锁定到下列之一：${CORE_LOOPS.join(' / ')}`,
    );
  } else if (hitLoops.length > 2) {
    problems.push(
      `proposal.md「核心循环引擎」最多选 1 主 1 辅，实际出现 ${hitLoops.length} 个：${hitLoops.join(', ')}`,
    );
  }

  // 独特钩子：Signature Twist 与 Peak Moment 都要有
  const hookBody = sections.get('独特钩子') || '';
  if (!/Signature\s*Twist/i.test(hookBody)) {
    problems.push('proposal.md「独特钩子」必须写明 Signature Twist（签名钩子）');
  }
  if (!/Peak\s*Moment/i.test(hookBody)) {
    problems.push('proposal.md「独特钩子」必须写明 Peak Moment（峰值时刻）');
  }

  // 参考调研：核心循环与空间布局两项是底线
  const refBody = substantive(sections.get('参考调研') || '');
  if (!/核心循环|签名张力/.test(refBody)) {
    problems.push('proposal.md「参考调研」必须覆盖参考游戏的核心循环与签名张力');
  }
  if (!/空间|布局|信息可见/.test(refBody)) {
    problems.push('proposal.md「参考调研」必须覆盖参考游戏的空间布局与信息可见性规则');
  }
}

async function reviewDesign(text, problems) {
  const sections = splitSections(text);
  for (const name of DESIGN_SECTIONS) {
    if (!sections.has(name)) {
      problems.push(`design.md 缺少章节「${name}」`);
      continue;
    }
    if (substantive(sections.get(name)).length < 10) {
      problems.push(`design.md「${name}」没有实质内容`);
    }
  }

  // 功能清单
  const featureBody = sections.get('功能清单') || '';
  const rows = tableRows(featureBody).filter((l) => /^\|\s*F-\d{3}\s*\|/.test(l));
  if (rows.length < MIN_FEATURES) {
    problems.push(`design.md 功能清单只有 ${rows.length} 项，少于门槛 ${MIN_FEATURES} 项`);
  }
  const ids = rows.map((l) => l.match(/^\|\s*(F-\d{3})\s*\|/)[1]);
  const expected = ids.map((_, i) => `F-${String(i + 1).padStart(3, '0')}`);
  if (ids.join(',') !== expected.join(',')) {
    problems.push(`design.md 功能 ID 不连续或未从 F-001 起：${ids.join(',')}`);
  }
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim());
    const id = cells[1];
    const acceptance = cells[4] || '';
    if (!acceptance || acceptance.length < 6) {
      problems.push(`design.md ${id} 的验收标准为空或过短，必须可被一条断言判定`);
    }
    if (/体验|流畅|好看|优化/.test(acceptance) && !/等于|为|\d|计数|不变|改变|返回/.test(acceptance)) {
      problems.push(`design.md ${id} 的验收标准不可判定：${acceptance.slice(0, 30)}`);
    }
  }

  // 边界与异常 / 打磨清单
  const edgeRows = tableRows(sections.get('边界与异常') || '').filter((l) => /^\|\s*[^|\s]+\s*\|/.test(l));
  if (edgeRows.length < MIN_EDGE_CASES) {
    problems.push(`design.md「边界与异常」只有 ${edgeRows.length} 条，少于门槛 ${MIN_EDGE_CASES} 条`);
  }
  const polishRows = tableRows(sections.get('打磨清单') || '').filter((l) => /^\|\s*[^|\s]+\s*\|/.test(l));
  if (polishRows.length < MIN_POLISH_ITEMS) {
    problems.push(`design.md「打磨清单」只有 ${polishRows.length} 条，少于门槛 ${MIN_POLISH_ITEMS} 条`);
  }

  // 难度契约：三档难度必须分开
  const contractBody = substantive(sections.get('难度契约') || '');
  for (const [label, re] of [
    ['参考路线（会玩的人能通关）', /参考路线/],
    ['弱化路线（水平一般的人会失败）', /弱化路线/],
    ['挂机路线（完全不操作会失败）', /挂机路线/],
  ]) {
    if (!re.test(contractBody)) {
      problems.push(`design.md「难度契约」缺少${label}一档`);
    }
  }
}

async function reviewPlan(text, problems) {
  const stages = text.match(/^###\s+阶段\s*\d+/gm) || [];
  if (stages.length < MIN_STAGES) {
    problems.push(`plan.md 只有 ${stages.length} 个阶段，少于门槛 ${MIN_STAGES} 个`);
  }
  const parts = text.split(/^###\s+阶段\s*\d+[^\n]*$/m).slice(1);
  parts.forEach((body, i) => {
    if (!/验收命令/.test(body)) problems.push(`plan.md 阶段 ${i + 1} 缺少「验收命令」`);
    if (!/期望输出/.test(body)) problems.push(`plan.md 阶段 ${i + 1} 缺少「期望输出」`);
    if (!/完成标准/.test(body)) problems.push(`plan.md 阶段 ${i + 1} 缺少「完成标准」`);
    if (!/```bash/.test(body)) problems.push(`plan.md 阶段 ${i + 1} 的验收命令没有给出可执行命令块`);
  });
}

async function reviewGame(gameDir) {
  const slug = path.basename(gameDir);
  const docsDir = path.join(gameDir, 'docs');
  const problems = [];

  const read = async (name) => {
    try {
      return await readFile(path.join(docsDir, name), 'utf8');
    } catch {
      return null;
    }
  };

  const proposal = await read('proposal.md');
  if (proposal === null) problems.push('缺少 docs/proposal.md（立项评审未做）');
  else await reviewProposal(proposal, problems);

  const design = await read('design.md');
  if (design === null) problems.push('缺少 docs/design.md（功能设计文档未做）');
  else await reviewDesign(design, problems);

  const plan = await read('plan.md');
  if (plan === null) problems.push('缺少 docs/plan.md（开发计划未做）');
  else await reviewPlan(plan, problems);

  return { slug, problems };
}

async function main() {
  const targets = process.argv.slice(2);
  let gameDirs;
  if (targets.length) {
    gameDirs = targets.map((t) => path.resolve(t));
  } else {
    const entries = await readdir(path.join(repoRoot, 'games'), { withFileTypes: true });
    gameDirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(repoRoot, 'games', e.name));
  }

  let failed = 0;
  for (const dir of gameDirs) {
    const r = await reviewGame(dir);
    if (r.problems.length) {
      failed += 1;
      console.log(`\n✗ ${r.slug} — ${r.problems.length} 项问题：`);
      for (const p of r.problems) console.log(`   · ${p}`);
    } else {
      console.log(`✓ ${r.slug} — 立项评审 / 设计文档 / 开发计划 齐备且达标`);
    }
  }

  console.log('');
  if (failed === 0) {
    console.log('✓ 设计评审全部通过。');
    process.exit(0);
  }
  console.log(`✗ ${failed} 个游戏未通过设计评审。`);
  process.exit(1);
}

main().catch((err) => {
  console.error('设计评审器自身出错：', err);
  process.exit(2);
});
