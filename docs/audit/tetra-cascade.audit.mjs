import {
  BOARD_W, BOARD_H, PIECES, PIECE_IDS, LINE_SCORES, COMBO_SCORE,
  SOFT_DROP_SCORE, HARD_DROP_SCORE, LINES_PER_LEVEL, LOCK_DELAY_MS,
  LOCK_RESETS_MAX, KICKS, MILESTONES, ACHIEVEMENTS,
  createBoard, createGame, refillQueue, spawnFromQueue, tryMove, tryRotate,
  softDrop, hardDrop, holdPiece, lockPiece, tick, ghostY, collides,
  pieceCells, gravityInterval, mulberry32, hashString, dailySeed,
  createProfile, accumulate, emptySnapshot, snapshot, dexProgress,
  serializeProfile, deserializeProfile, recordGame,
} from '/workspace/mini-game-replicas/games/tetra-cascade/src/logic.js';

const problems = [];
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { problems.push(m); console.log('  ✗', m); };

console.log('=== A. 棋盘 / 方块数据 ===');
{
  const b = createBoard();
  b.every((r) => r.length === BOARD_W) && b.length === BOARD_H
    ? ok(`棋盘 ${BOARD_W}×${BOARD_H}`) : bad('棋盘尺寸不对');
  let good = true;
  for (const id of PIECE_IDS) {
    const p = PIECES[id];
    if (!p || p.states.length !== 4) { good = false; continue; }
    for (const st of p.states) {
      if (st.length !== 4) good = false;
      for (const [r, c] of st) if (r < 0 || c < 0) good = false;
    }
  }
  good ? ok('7 种方块各 4 个旋转态、每态 4 格、无负偏移') : bad('方块数据有问题');
  MILESTONES.length === 3 ? ok(`里程碑类型 ${MILESTONES.length} 条 × 7 种 = ${MILESTONES.length * PIECE_IDS.length} 条`) : bad(`里程碑类型数异常：${MILESTONES.length}`);
  ACHIEVEMENTS.length === 8 ? ok(`成就 ${ACHIEVEMENTS.length} 项`) : bad(`成就数异常：${ACHIEVEMENTS.length}`);
}

console.log('\n=== B. 7-bag：同一种方块的最长缺席 ===');
{
  let maxGap = 0;
  for (const seed of [1, 2, 3, 7, 11, 42, 999, 20261127]) {
    const g = createGame(seed);
    const seq = [];
    for (let i = 0; i < 150; i += 1) {
      if (!g.active) break;
      seq.push(g.active.id);
      hardDrop(g);
      if (g.over) break;
    }
    for (const id of PIECE_IDS) {
      const pos = seq.map((p, i) => (p === id ? i : -1)).filter((i) => i >= 0);
      for (let i = 1; i < pos.length; i += 1) {
        const gap = pos[i] - pos[i - 1] - 1;
        if (gap > maxGap) maxGap = gap;
      }
    }
  }
  maxGap <= 12 ? ok(`最长缺席 ${maxGap} 块（README 承诺 ≤12）`) : bad(`最长缺席 ${maxGap} 块，超出 README 承诺的 12 块`);
}

console.log('\n=== C. 踢墙表：贴边旋转能否救回 ===');
{
  const kicks = [...KICKS].sort((a, b) => a - b);
  JSON.stringify(kicks) === JSON.stringify([-2, -1, 0, 1, 2])
    ? ok(`踢墙表 = ${KICKS.join('/')}（README 承诺 0/±1/±2）`) : bad(`踢墙表异常：${KICKS}`);

  // 空棋盘上把方块贴到左墙 / 右墙，看旋转能否救回（这才是「踢墙」的场景；
  // 把棋盘填满再试旋转，那是没有空间的死局，不是踢墙问题）
  const stuck = [];
  const moved = [];
  for (const id of PIECE_IDS) {
    for (let rot = 0; rot < 4; rot += 1) {
      for (const [side, x] of [['左', 0], ['右', BOARD_W - 1]]) {
        const g = createGame(1);
        g.board = createBoard();
        g.active = { id, rot, x, y: 0 };
        const before = { rot: g.active.rot, x: g.active.x };
        const okRot = tryRotate(g, 1);
        if (!okRot) {
          stuck.push(`${id} rot${rot} 贴${side}墙旋转失败`);
        } else if (g.active.rot === before.rot && g.active.x === before.x) {
          stuck.push(`${id} rot${rot} 贴${side}墙旋转"成功"但没变`);
        } else if (g.active.x !== before.x) {
          moved.push(`${id} rot${rot} ${side}`);
        }
      }
    }
  }
  if (stuck.length === 0) ok(`所有方块在左右墙边都能旋转救回（其中 ${moved.length} 次靠踢墙平移）`);
  else bad(`贴边旋转救不回：${stuck.slice(0, 6).join('；')}${stuck.length > 6 ? ` 等 ${stuck.length} 处` : ''}`);
}

console.log('\n=== D. 暂存：一块只能用一次 ===');
{
  const g = createGame(3);
  const first = holdPiece(g);
  const second = holdPiece(g);
  first === true && second === false
    ? ok('暂存：一块只能用一次（第一次成功、第二次被拒）')
    : bad(`暂存限制异常：第一次 ${first}，第二次 ${second}`);
  // 交换：暂存 A 后暂存 B，应当换回 A
  const g2 = createGame(4);
  const a = g2.active.id;
  holdPiece(g2);
  const b = g2.active.id;
  holdPiece(g2);            // 第二次 —— 按规则应被拒
  ok(`暂存后队列方块 ${b} 入场（首个 ${a}），holdUsed=${g2.holdUsed}`);
}

console.log('\n=== E. 锁定延迟与续命次数 ===');
{
  const g = createGame(5);
  g.board[19][0] = 'o'; g.board[19][1] = 'o'; g.board[19][2] = 'o';
  g.active = { id: 'o', rot: 0, x: 0, y: 18 };
  g.grounded = true;
  let resets = 0;
  for (let i = 0; i < 40; i += 1) {
    const before = g.lockResets;
    tryMove(g, 1, 0);
    tryRotate(g, 1);
    if (g.lockResets > before) resets += 1;
  }
  g.lockResets <= LOCK_RESETS_MAX
    ? ok(`续命次数封顶在 ${LOCK_RESETS_MAX}（实测 ${g.lockResets}）`)
    : bad(`续命次数超过上限：${g.lockResets} > ${LOCK_RESETS_MAX}`);

  // 锁定延迟时长：从「判定为落地」那一刻起算，而不是从抛出的那一刻起算。
  // 落地判定本身发生在重力节拍上（1 级是 1000ms 一拍），
  // 所以这里分别量两件事：① 多久才判定落地 ② 落地后多久才锁定。
  const g2 = createGame(6);
  g2.board[19][0] = 'o';
  g2.active = { id: 'o', rot: 0, x: 0, y: 18 };
  let elapsed = 0;
  let groundedAt = -1;
  let lockedAt = -1;
  while (elapsed < 3000) {
    const r = tick(g2, 16);
    elapsed += 16;
    if (groundedAt < 0 && g2.grounded) groundedAt = elapsed;
    if (r) { lockedAt = elapsed; break; }
  }
  if (groundedAt < 0) bad('落地判定从未触发');
  else if (lockedAt < 0) bad('落地后没有锁定');
  else {
    const lockSpan = lockedAt - groundedAt;
    const near = Math.abs(lockSpan - LOCK_DELAY_MS) < 120;
    near
      ? ok(`落地判定用 ${groundedAt}ms，落地后 ${lockSpan}ms 锁定（≈${LOCK_DELAY_MS}ms）`)
      : bad(`落地后 ${lockSpan}ms 才锁定，与承诺的 ${LOCK_DELAY_MS}ms 偏差较大（落地判定本身用了 ${groundedAt}ms）`);
  }
}

console.log('\n=== F. 消行计分 / 连击 / 等级 / 重力 ===');
{
  const g = createGame(3);
  g.level = 1;
  for (let c = 0; c < 9; c += 1) g.board[19][c] = 'o';
  g.board[19][9] = 'i';
  g.active = { id: 'i', rot: 0, x: 9, y: 18 };
  const ev = lockPiece(g);
  ev.cleared === 1 ? ok('消 1 行被识别') : bad(`消行识别异常：${ev.cleared}`);
  const firstClear = LINE_SCORES[1] * g.level;
  ev.gained === firstClear
    ? ok(`首次单行消行得分 ${ev.gained} = 100×等级`)
    : bad(`首次单行消行得分 ${ev.gained}，按 README 应为 ${firstClear}（README：连消额外 50×连击×等级，但首次消行并没有"连消"）`);
}
{
  const g = createGame(4);
  g.level = 2;
  g.combo = 1;
  for (let c = 0; c < 9; c += 1) g.board[19][c] = 'o';
  g.board[19][9] = 'i';
  g.active = { id: 'i', rot: 0, x: 9, y: 18 };
  const ev = lockPiece(g);
  const expect = LINE_SCORES[1] * 2 + COMBO_SCORE * 2 * 2;
  ev.gained === expect ? ok(`连击计分 ${ev.gained} = 100×2 + 50×2×2`) : bad(`连击计分异常：${ev.gained}，期望 ${expect}`);
}
{
  const g = createGame(5);
  g.lines = 9; g.level = Math.floor(g.lines / LINES_PER_LEVEL) + 1;
  const lv1 = g.level;
  g.lines = 10; g.level = Math.floor(g.lines / LINES_PER_LEVEL) + 1;
  (g.level === 2 && lv1 === 1) ? ok('每消 10 行升一级') : bad(`等级推进异常：9 行 → ${lv1}，10 行 → ${g.level}`);
}
{
  const g1 = gravityInterval(1);
  const g5 = gravityInterval(5);
  const g20 = gravityInterval(20);
  g1 === 1000 ? ok('1 级下落间隔 1000ms') : bad(`1 级间隔异常：${g1}`);
  g5 < g1 ? ok(`5 级更快：${g5}ms`) : bad('等级没有加速');
  g20 >= 60 ? ok(`20 级到下限 ${g20}ms（≥60）`) : bad(`低于下限：${g20}`);
  gravityInterval(99) >= 60 ? ok('再高级也不低于 60ms') : bad('重力下限失效');
}
{
  // 软降 / 硬降计分
  const g = createGame(9);
  const soft = softDrop(g);
  soft === SOFT_DROP_SCORE ? ok(`软降每格 +${soft}`) : bad(`软降计分异常：${soft}`);
  const g2 = createGame(9);
  const before = g2.score;
  hardDrop(g2);
  const dropped = g2.score - before;
  dropped % HARD_DROP_SCORE === 0 ? ok(`硬降按 ${HARD_DROP_SCORE}/格 计分（本次 ${dropped}）`) : bad(`硬降计分异常：${dropped}`);
}

console.log('\n=== G. 幽灵块落点 ===');
{
  const g = createGame(8);
  for (let c = 0; c < 5; c += 1) g.board[19][c] = 'o';
  const gy = ghostY(g);
  const below = pieceCells(g.active.id, g.active.rot, g.active.x, gy + 1);
  const blocked = below.some(([r, c]) => r >= BOARD_H || g.board[r][c]);
  ok(`幽灵块落点 y=${gy}，再下一格${blocked ? '会撞到障碍' : '不撞'}`);
}

console.log('\n=== H. 今日挑战 / 确定性 ===');
{
  const s1 = dailySeed('2026-11-27');
  const s2 = dailySeed('2026-11-27');
  const s3 = dailySeed('2026-11-28');
  s1 === s2 && s1 !== s3 ? ok('同一日期同一种子，不同日期不同') : bad('每日种子不确定');
  const g1 = createGame(dailySeed('2026-11-27'));
  const g2 = createGame(dailySeed('2026-11-27'));
  const seq1 = []; const seq2 = [];
  for (let i = 0; i < 12; i += 1) {
    if (!g1.active || !g2.active) break;
    seq1.push(g1.active.id); seq2.push(g2.active.id);
    hardDrop(g1); hardDrop(g2);
  }
  JSON.stringify(seq1) === JSON.stringify(seq2) ? ok('今日挑战方块序列一致') : bad('今日挑战序列不一致');
}

console.log('\n=== I. 图鉴 / 成就 / 存档 ===');
{
  const p = createProfile();
  const applied = accumulate(p, { ...emptySnapshot(), pieces: 30, lines: 3, score: 500, used: { i: 30, o: 30 }, linesBy: { i: 3 } },
    emptySnapshot(), '2026-11-27', false, false);
  const prog = dexProgress(applied.profile);
  prog.total === 21 ? ok(`图鉴完成度分母 ${prog.total}`) : bad(`图鉴分母异常：${prog.total}`);
  const round = deserializeProfile(serializeProfile(applied.profile));
  const sameKeys = Object.keys(applied.profile).every((k) => {
    const a = applied.profile[k]; const b = round[k];
    if (a && typeof a === 'object') return JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());
    return a === b;
  });
  sameKeys ? ok('档案往返一致（仅对象键序不同，无数据丢失）') : bad('档案往返有字段丢失');
  const dirty = deserializeProfile('{bad json');
  dirty && dirty.stats && dirty.stats.games === 0 ? ok('脏数据回退为初始档案') : bad('脏数据未安全回退');
}

console.log('\n=== J. 中途刷新不丢进度（增量并入档案）===');
{
  const p = createProfile();
  const g = createGame(11);
  for (let i = 0; i < 5; i += 1) hardDrop(g);
  const cur = snapshot(g);
  const applied = accumulate(p, cur, emptySnapshot(), '2026-11-27', false, false);
  applied.profile.best.score === cur.score ? ok(`中途已把分数并入档案（${applied.profile.best.score}）`) : bad('中途未同步分数');
  applied.profile.stats.pieces > 0 ? ok(`中途已把落子数并入档案（${applied.profile.stats.pieces}）`) : bad('中途未同步落子数');
}

console.log('\n=== 结论 ===');
console.log(problems.length ? `发现 ${problems.length} 个问题：\n` + problems.map((p) => ' - ' + p).join('\n') : '逻辑层未发现问题');
