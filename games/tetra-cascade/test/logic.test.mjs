import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_H,
  BOARD_W,
  COMBO_SCORE,
  HARD_DROP_SCORE,
  KICKS,
  LINES_PER_LEVEL,
  LINE_SCORES,
  LOCK_DELAY_MS,
  LOCK_RESETS_MAX,
  MILESTONES,
  PIECES,
  PIECE_IDS,
  SOFT_DROP_SCORE,
} from '../assets/data.js';
import {
  ACHIEVEMENTS,
  clearRows,
  collides,
  createBoard,
  createGame,
  createProfile,
  dailySeed,
  deserializeProfile,
  dexProgress,
  findFullRows,
  ghostY,
  gravityInterval,
  hardDrop,
  holdPiece,
  lockPiece,
  milestoneState,
  mulberry32,
  pieceCells,
  recordGame,
  refillQueue,
  serializeProfile,
  shuffle,
  softDrop,
  tick,
  tryMove,
  tryRotate,
} from '../src/logic.js';

/** 造一个干净的对局，并把当前方块放到指定位置。 */
function gameWith(pieceId, rot, x, y) {
  const game = createGame(42);
  game.board = createBoard();
  game.active = { id: pieceId, rot, x, y };
  return game;
}

/** 把底部若干行填满，只留最后若干列空着。 */
function fillRows(game, fromRow, count, gapCols) {
  for (let r = fromRow; r < fromRow + count; r += 1) {
    for (let c = 0; c < BOARD_W - gapCols; c += 1) game.board[r][c] = 'j';
  }
}

/* ── 数据完整性 ───────────────────────────────────── */

test('七种方块的旋转态都合法', () => {
  assert.equal(PIECE_IDS.length, 7);
  for (const id of PIECE_IDS) {
    const piece = PIECES[id];
    assert.ok(piece, `缺少方块 ${id}`);
    assert.equal(piece.states.length, 4, `${id} 应有 4 个旋转态`);
    for (const state of piece.states) {
      assert.equal(state.length, 4, `${id} 的每个旋转态应有 4 格`);
      for (const [r, c] of state) {
        assert.ok(r >= 0 && r < piece.size, `${id} 行越界`);
        assert.ok(c >= 0 && c < piece.size, `${id} 列越界`);
      }
    }
  }
});

test('旋转态之间是严格的 90° 旋转关系', () => {
  for (const id of PIECE_IDS) {
    const piece = PIECES[id];
    for (let k = 0; k < 4; k += 1) {
      const expected = piece.states[k]
        .map(([r, c]) => [c, piece.size - 1 - r])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const actual = piece.states[(k + 1) % 4]
        .slice()
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      assert.deepEqual(actual, expected, `${id} 的第 ${k} 个旋转态不自洽`);
    }
  }
});

test('方块颜色与文案齐全', () => {
  for (const id of PIECE_IDS) {
    assert.match(PIECES[id].color, /^#[0-9a-f]{6}$/, `${id} 颜色格式非法`);
    assert.ok(PIECES[id].zh && PIECES[id].en && PIECES[id].ja, `${id} 缺少三语名称`);
  }
});

/* ── 棋盘与碰撞 ───────────────────────────────────── */

test('棋盘尺寸正确且初始为空', () => {
  const board = createBoard();
  assert.equal(board.length, BOARD_H);
  assert.equal(board[0].length, BOARD_W);
  assert.equal(board.flat().filter(Boolean).length, 0);
});

test('碰撞检测能识别左右越界、底部越界与占用', () => {
  const board = createBoard();
  assert.equal(collides(board, 'i', 0, -3, 0), true, '左越界应判定为碰撞');
  assert.equal(collides(board, 'i', 0, BOARD_W - 1, 0), true, '右越界应判定为碰撞');
  assert.equal(collides(board, 'i', 1, 0, BOARD_H - 2), true, '底部越界应判定为碰撞');
  assert.equal(collides(board, 'i', 0, 0, -2), false, '棋盘上方应允许');
  board[5][3] = 't';
  assert.equal(collides(board, 'o', 0, 3, 4), true, '撞到已有方块应判定为碰撞');
});

test('方块占据的格子 = 原点 + 偏移', () => {
  const cells = pieceCells('i', 0, 2, 5);
  assert.equal(cells.length, 4);
  for (const [r, c] of cells) {
    assert.ok(r >= 5 && r < 5 + 4);
    assert.ok(c >= 2 && c < 2 + 4);
  }
});

/* ── 7-bag ────────────────────────────────────────── */

test('7-bag：每袋七种各一', () => {
  const game = createGame(2026);
  game.bag = [];
  game.queue = [];
  refillQueue(game);
  // 把这一袋彻底抽干：先取队列里的，再取袋里剩下的
  const fromQueue = game.queue.splice(0, game.queue.length);
  const fromBag = game.bag.splice(0, game.bag.length);
  const bag = fromQueue.concat(fromBag);
  assert.equal(bag.length, 7, `一袋应有 7 块，实际 ${bag.length}`);
  assert.equal(new Set(bag).size, 7, `一袋里应七种齐全: ${bag.join(',')}`);
});

test('7-bag：同一种方块不会连续缺席超过 12 块', () => {
  const game = createGame(2026);
  const seq = [game.active.id];
  while (seq.length < 210) {
    refillQueue(game);
    seq.push(game.queue.shift());
  }
  for (const id of PIECE_IDS) {
    const at = seq.map((v, i) => (v === id ? i : -1)).filter((i) => i >= 0);
    assert.ok(at.length > 10, `${id} 出现次数太少`);
    for (let k = 1; k < at.length; k += 1) {
      const gap = at[k] - at[k - 1] - 1;
      assert.ok(gap <= 12, `${id} 连续缺席 ${gap} 块，超过 12`);
    }
  }
});

test('洗牌不修改入参且结果唯一', () => {
  const src = PIECE_IDS.slice();
  const out = shuffle(src, mulberry32(5));
  assert.deepEqual(src, PIECE_IDS, '入参不应被修改');
  assert.equal(new Set(out).size, 7);
});

test('同一天的挑战种子一致，不同天不同', () => {
  assert.equal(dailySeed('2026-11-25'), dailySeed('2026-11-25'));
  assert.notEqual(dailySeed('2026-11-25'), dailySeed('2026-11-26'));
});

/* ── 消行与计分 ───────────────────────────────────── */

test('满行识别与消行后上方下落', () => {
  const board = createBoard();
  board[19] = new Array(BOARD_W).fill('i');
  board[18] = new Array(BOARD_W).fill('t');
  const rows = findFullRows(board);
  assert.deepEqual(rows, [18, 19]);
  const next = clearRows(board, rows);
  assert.equal(next.length, BOARD_H);
  assert.equal(next.flat().filter(Boolean).length, 0, '消行后应只剩空行');
});

test('消行计分按档位乘等级', () => {
  const cases = [[1, 100], [2, 300], [3, 500], [4, 800]];
  for (const [rows, base] of cases) {
    const game = gameWith('i', 1, 7, BOARD_H - rows);
    game.level = 3;
    fillRows(game, BOARD_H - rows, rows, 1);
    const event = lockPiece(game);
    assert.equal(event.cleared, rows, `应消 ${rows} 行`);
    assert.equal(event.gained, base * 3 + COMBO_SCORE * 1 * 3, `${rows} 行得分不符`);
  }
});

test('连击：连续消行递增，断开后归零', () => {
  const game = createGame(11);
  game.level = 1;

  fillRows(game, BOARD_H - 1, 1, 1);
  game.active = { id: 'i', rot: 1, x: 7, y: BOARD_H - 2 };
  const first = lockPiece(game);
  assert.equal(first.cleared, 1);
  assert.equal(game.combo, 1);

  fillRows(game, BOARD_H - 1, 1, 1);
  game.active = { id: 'i', rot: 1, x: 7, y: BOARD_H - 2 };
  const second = lockPiece(game);
  assert.equal(second.cleared, 1);
  assert.equal(game.combo, 2, '连续消行连击应 +1');

  game.active = { id: 'o', rot: 0, x: 4, y: 0 };
  lockPiece(game);
  assert.equal(game.combo, 0, '没消行应清零连击');
});

test('四行齐消会被记为 tetris', () => {
  const game = gameWith('i', 1, 7, BOARD_H - 4);
  fillRows(game, BOARD_H - 4, 4, 1);
  const event = lockPiece(game);
  assert.equal(event.cleared, 4);
  assert.equal(game.tetrises, 1);
});

test('等级每满 10 行提升一级', () => {
  const game = createGame(3);
  assert.equal(game.level, 1);
  game.lines = LINES_PER_LEVEL - 1;
  game.active = { id: 'o', rot: 0, x: 4, y: 0 };
  lockPiece(game);
  assert.equal(game.level, 1);
  game.lines = LINES_PER_LEVEL;
  game.active = { id: 'o', rot: 0, x: 4, y: 0 };
  lockPiece(game);
  assert.equal(game.level, 2);
});

/* ── 重力与锁定延迟 ───────────────────────────────── */

test('重力间隔随等级递减且不低于 60ms', () => {
  let previous = Infinity;
  for (let level = 1; level <= 30; level += 1) {
    const interval = gravityInterval(level);
    assert.ok(interval <= previous, `等级 ${level} 的间隔应更短`);
    assert.ok(interval >= 60, `间隔不应低于 60ms: ${interval}`);
    previous = interval;
  }
  assert.equal(gravityInterval(1), 1000);
});

test('落地后延迟锁定，移动可续命', () => {
  const game = gameWith('o', 0, 4, BOARD_H - 3);
  game.board[BOARD_H - 1][4] = 'j';
  game.board[BOARD_H - 1][5] = 'j';

  // 用真实帧长推进，直到落地
  let frames = 0;
  while (!game.grounded && frames < 300) {
    tick(game, 16);
    frames += 1;
  }
  assert.equal(game.grounded, true, '应当落地');

  // 不到锁定延迟不应锁定
  const before = game.pieces;
  while (game.lockTimer < LOCK_DELAY_MS - 100) tick(game, 16);
  assert.equal(game.pieces, before, '未到锁定延迟不应锁定');

  // 落地状态下移动可以续命
  const timerBefore = game.lockTimer;
  assert.equal(tryMove(game, -1, 0), true);
  assert.ok(game.lockTimer < timerBefore, '移动后锁定计时应被重置');
});

test('锁定延迟到期后自动锁定', () => {
  const game = gameWith('o', 0, 4, BOARD_H - 3);
  game.board[BOARD_H - 1][4] = 'j';
  game.board[BOARD_H - 1][5] = 'j';

  let frames = 0;
  let event = null;
  while (!event && frames < 600) {
    event = tick(game, 16);
    frames += 1;
  }
  assert.ok(event, '到期应触发锁定');
  assert.equal(game.pieces, 1, '锁定后应记一次落子');
  // 落地到锁定大约需要一个锁定延迟
  assert.ok(frames * 16 >= LOCK_DELAY_MS, `锁定耗时 ${frames * 16}ms 应不少于 ${LOCK_DELAY_MS}ms`);
});

test('落地后连续移动的续命次数有上限', () => {
  const game = gameWith('o', 0, 4, BOARD_H - 3);
  game.board[BOARD_H - 1][4] = 'j';
  game.board[BOARD_H - 1][5] = 'j';
  let frames = 0;
  while (!game.grounded && frames < 300) {
    tick(game, 16);
    frames += 1;
  }
  assert.equal(game.grounded, true);
  for (let i = 0; i < LOCK_RESETS_MAX + 5; i += 1) {
    tryMove(game, -1, 0);
    tryMove(game, 1, 0);
  }
  assert.ok(game.lockResets <= LOCK_RESETS_MAX, `续命次数不应超过上限: ${game.lockResets}`);
});

test('移动受边界限制', () => {
  const game = gameWith('i', 0, 0, 0);
  assert.equal(tryMove(game, -1, 0), false, '左移出界应失败');
  assert.equal(tryMove(game, 1, 0), true);
  const right = gameWith('i', 0, BOARD_W - 4, 0);
  assert.equal(tryMove(right, 1, 0), false, '右移出界应失败');
});

test('旋转在贴边时会被踢墙救回', () => {
  const game = gameWith('i', 0, 0, 0);
  // 横 I 在最左边转成竖 I 会越界，踢墙表应把它挪回来
  const ok = tryRotate(game, 1);
  assert.equal(ok, true, '贴边旋转应通过踢墙成功');
  assert.ok(game.active.x >= 0 && game.active.x + PIECES.i.size <= BOARD_W);
  assert.equal(collides(game.board, game.active.id, game.active.rot, game.active.x, game.active.y), false);
});

test('旋转四次回到原朝向', () => {
  const game = gameWith('t', 0, 3, 0);
  for (let i = 0; i < 4; i += 1) tryRotate(game, 1);
  assert.equal(game.active.rot, 0);
});

test('踢墙候选表非空且以原位优先', () => {
  assert.ok(KICKS.length >= 3);
  assert.equal(KICKS[0], 0);
});

test('暂存一次落地前只能用一次', () => {
  const game = createGame(8);
  assert.equal(holdPiece(game), true);
  assert.equal(holdPiece(game), false, '同一块落地前不能重复暂存');
  // 先把方块挪下来再锁定，避免直接堆到顶导致游戏结束
  for (let i = 0; i < 10; i += 1) tryMove(game, 0, 1);
  lockPiece(game);
  assert.equal(game.over, false, '不应提前结束');
  assert.equal(holdPiece(game), true, '落地后可以再次暂存');
});

test('暂存会交换暂存位与当前方块', () => {
  const game = createGame(8);
  const first = game.active.id;
  holdPiece(game);
  assert.equal(game.hold, first, '第一次暂存应把当前方块放进暂存位');
  const spawned = game.active.id;
  assert.notEqual(spawned, first, '暂存后应换成预备队列里的方块');

  for (let i = 0; i < 10; i += 1) tryMove(game, 0, 1);
  lockPiece(game); // 落地后暂存锁重置
  assert.equal(game.holdUsed, false, '落地后暂存锁应重置');

  const current = game.active.id;
  const inHold = game.hold;
  holdPiece(game);
  assert.equal(game.hold, current, '再次暂存应把当前方块放进暂存位');
  assert.equal(game.active.id, inHold, '暂存位里的方块应回到场上');
  assert.notEqual(game.active.id, spawned, '刚才锁定的那块不应再回来');
});

/* ── 硬降 / 软降 / 幽灵块 ─────────────────────────── */

test('硬降直接落底并锁定，按格计分', () => {
  const game = gameWith('o', 0, 4, 0);
  const { points, event } = hardDrop(game);
  assert.equal(points, (BOARD_H - 2) * HARD_DROP_SCORE, '硬降应按下落格数计分');
  assert.ok(event, '硬降应触发锁定');
  assert.equal(game.pieces, 1);
});

test('软降下落一格并加分', () => {
  const game = gameWith('o', 0, 4, 0);
  const before = game.score;
  const points = softDrop(game);
  assert.equal(points, SOFT_DROP_SCORE);
  assert.equal(game.score, before + SOFT_DROP_SCORE);
  assert.equal(game.active.y, 1);
});

test('幽灵块给出会落到的位置', () => {
  const game = gameWith('o', 0, 4, 0);
  game.board[BOARD_H - 1][4] = 'j';
  const gy = ghostY(game);
  assert.equal(gy, BOARD_H - 3, '幽灵块应停在障碍物正上方');
  assert.equal(collides(game.board, 'o', 0, 4, gy), false);
});

/* ── 游戏结束 ─────────────────────────────────────── */

test('出生点被占时游戏结束', () => {
  const game = createGame(6);
  // 顶部堆到很高，但给当前这块留出落点
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < BOARD_W; c += 1) {
      if (r <= 1 && c >= 4 && c <= 8) continue; // 给当前这块留落点（否则会凑满整行被消掉）
      if (r >= 2 && c === BOARD_W - 1) continue; // 别让下方整行被消掉
      game.board[r][c] = 'j';
    }
  }
  game.active = { id: 'o', rot: 0, x: 4, y: 0 };
  const event = lockPiece(game);
  assert.equal(event.over, true, '新方块放不下应判定游戏结束');
  assert.equal(game.over, true);
});

/* ── 图鉴与档案 ───────────────────────────────────── */

test('对局会累计每种方块的使用与消行', () => {
  const game = createGame(15);
  game.active = { id: 't', rot: 0, x: 4, y: 0 };
  lockPiece(game);
  assert.equal(game.used.t, 1);
  assert.equal(game.pieces, 1);
});

test('里程碑按使用次数与消行数判定', () => {
  const profile = createProfile();
  const empty = milestoneState(profile, 'i');
  assert.equal(empty.first, false);
  assert.equal(empty.adept, false);

  profile.pieces.i.used = 20;
  profile.pieces.i.lines = 3;
  const full = milestoneState(profile, 'i');
  assert.equal(full.first, true);
  assert.equal(full.adept, true);
  assert.equal(full.clearer, true);
});

test('结算一局会把成绩并入档案并解锁里程碑', () => {
  const profile = createProfile();
  const game = createGame(21);
  game.active = { id: 'i', rot: 0, x: 4, y: 0 };
  lockPiece(game);
  game.score = 1234;
  game.lines = 5;

  const { profile: next, unlocked, milestones } = recordGame(profile, game, '2026-11-25', false);
  assert.equal(next.pieces.i.used, 1);
  assert.equal(next.stats.games, 1);
  assert.equal(next.best.score, 1234);
  assert.equal(next.stats.lines, 5);
  assert.ok(milestones.length >= 1, '应解锁「初次登场」里程碑');
  assert.ok(unlocked.length >= 1, '应解锁「初次落子」成就');
});

test('今日挑战成绩单独记录', () => {
  const profile = createProfile();
  const game = createGame(22);
  game.score = 777;
  const { profile: next } = recordGame(profile, game, '2026-11-25', true);
  assert.equal(next.daily.date, '2026-11-25');
  assert.equal(next.daily.best, 777);
  assert.equal(next.best.score, 777);
});

test('档案往返与脏数据容错', () => {
  const profile = createProfile();
  profile.pieces.i.used = 12;
  profile.best.score = 999;
  const restored = deserializeProfile(serializeProfile(profile));
  assert.equal(restored.pieces.i.used, 12);
  assert.equal(restored.best.score, 999);

  const dirty = [
    null, '', 'not json', '[]', '"str"',
    '{"pieces": "oops"}',
    '{"pieces": {"i": {"used": "many"}}}',
    '{"best": {"score": -5}}',
    '{"stats": {"games": "x"}}',
    '{"achievements": {"nope": true}}',
  ];
  for (const raw of dirty) {
    const state = deserializeProfile(raw);
    assert.equal(typeof state, 'object');
    assert.ok(state.best.score >= 0);
    assert.ok(state.stats.games >= 0);
    for (const id of PIECE_IDS) {
      assert.ok(state.pieces[id].used >= 0);
      assert.ok(state.pieces[id].lines >= 0);
    }
  }
});

test('图鉴进度统计正确', () => {
  const profile = createProfile();
  assert.equal(dexProgress(profile).done, 0);
  assert.equal(dexProgress(profile).total, PIECE_IDS.length * MILESTONES.length);
  profile.pieces.i.used = 20;
  profile.pieces.i.lines = 3;
  assert.equal(dexProgress(profile).done, 3);
});

test('所有成就都有三语文案', () => {
  for (const ach of ACHIEVEMENTS) {
    assert.ok(ach.zh && ach.en && ach.ja, `${ach.id} 缺少文案`);
    assert.equal(typeof ach.test, 'function');
  }
});

/* ── 边界输入 ─────────────────────────────────────── */

test('未知方块不会炸出异常格子', () => {
  assert.deepEqual(pieceCells('nope', 0, 0, 0), []);
});

test('对局结束后不再响应输入', () => {
  const game = createGame(5);
  game.over = true;
  assert.equal(tryMove(game, 1, 0), false);
  assert.equal(tryRotate(game, 1), false);
  assert.equal(softDrop(game), 0);
  assert.equal(hardDrop(game).points, 0);
  assert.equal(holdPiece(game), false);
});

test('没有活动方块时 tick 不会崩', () => {
  const game = createGame(5);
  game.active = null;
  assert.equal(tick(game, 100), null);
  assert.equal(ghostY(game), 0);
});
