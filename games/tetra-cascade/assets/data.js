/**
 * Tetra Cascade 无尽方块 — 数据层
 *
 * 收录 7 种四格方块（tetramino）、它们的旋转态、配色、评分表与图鉴里程碑。
 * 全部为原创编写：旋转态是按「同一形状的 90° 旋转」手工排布的，
 * 与任何商业俄罗斯方块的具体踢墙表（SRS）无关。
 *
 * 约定：
 *   - `size`  方块的容纳框边长（2/3/4），所有旋转态共用同一个框
 *   - `states` 4 个旋转态，每个是一组 `[行, 列]` 偏移（0 基，框内）
 *   - `cells`  落子后占据的棋盘格 = 方块原点 + 偏移
 */

/** 棋盘尺寸。 */
export const BOARD_W = 10;
export const BOARD_H = 20;

/** 方块定义。rotation 0 为初始朝向。 */
export const PIECES = {
  i: {
    id: 'i',
    size: 4,
    color: '#45d0e6',
    zh: '长条块',
    en: 'Long Bar',
    ja: 'アイ',
    states: [
      [[1, 0], [1, 1], [1, 2], [1, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 1], [1, 1], [2, 1], [3, 1]],
    ],
  },
  j: {
    id: 'j',
    size: 3,
    color: '#5b8cff',
    zh: '左钩块',
    en: 'Left Hook',
    ja: 'ジェイ',
    states: [
      [[0, 0], [1, 0], [1, 1], [1, 2]],
      [[0, 1], [0, 2], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 0], [2, 1]],
    ],
  },
  l: {
    id: 'l',
    size: 3,
    color: '#ffb347',
    zh: '右钩块',
    en: 'Right Hook',
    ja: 'エル',
    states: [
      [[0, 2], [1, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [1, 2], [2, 0]],
      [[0, 0], [0, 1], [1, 1], [2, 1]],
    ],
  },
  o: {
    id: 'o',
    size: 2,
    color: '#ffe066',
    zh: '方块',
    en: 'Square',
    ja: 'オー',
    states: [
      [[0, 0], [0, 1], [1, 0], [1, 1]],
      [[0, 0], [0, 1], [1, 0], [1, 1]],
      [[0, 0], [0, 1], [1, 0], [1, 1]],
      [[0, 0], [0, 1], [1, 0], [1, 1]],
    ],
  },
  s: {
    id: 's',
    size: 3,
    color: '#6ee7a8',
    zh: '蛇形块',
    en: 'Snake',
    ja: 'エス',
    states: [
      [[0, 1], [0, 2], [1, 0], [1, 1]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 1], [1, 2], [2, 0], [2, 1]],
      [[0, 0], [1, 0], [1, 1], [2, 1]],
    ],
  },
  t: {
    id: 't',
    size: 3,
    color: '#c084fc',
    zh: '梅花块',
    en: 'Clover',
    ja: 'ティー',
    states: [
      [[0, 1], [1, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 1]],
      [[0, 1], [1, 0], [1, 1], [2, 1]],
    ],
  },
  z: {
    id: 'z',
    size: 3,
    color: '#ff6b81',
    zh: '反蛇块',
    en: 'Reverse Snake',
    ja: 'ゼット',
    states: [
      [[0, 0], [0, 1], [1, 1], [1, 2]],
      [[0, 2], [1, 1], [1, 2], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[0, 1], [1, 0], [1, 1], [2, 0]],
    ],
  },
};

/** 方块 id 顺序（也是 7-bag 的固定顺序）。 */
export const PIECE_IDS = ['i', 'j', 'l', 'o', 's', 't', 'z'];

/** 消行计分表（再乘以等级）。 */
export const LINE_SCORES = { 1: 100, 2: 300, 3: 500, 4: 800 };

/** 连消奖励：每多连一次 × 连击数 × 等级。 */
export const COMBO_SCORE = 50;

/** 软降 / 硬降每格得分。 */
export const SOFT_DROP_SCORE = 1;
export const HARD_DROP_SCORE = 2;

/** 每消满多少行升一级。 */
export const LINES_PER_LEVEL = 10;

/** 锁定延迟（毫秒）与最多重置次数。 */
export const LOCK_DELAY_MS = 500;
export const LOCK_RESETS_MAX = 15;

/** 旋转踢墙候选位移（自研简化踢墙表，非 SRS）。 */
export const KICKS = [0, -1, 1, -2, 2];

/** 方块图鉴里程碑（每个方块 3 条，全部解锁才算「全谱收藏」）。 */
export const MILESTONES = [
  { id: 'first', used: 1, zh: '初次登场', en: 'First Drop', ja: '初登場' },
  { id: 'adept', used: 20, zh: '熟手', en: 'Adept', ja: '熟练' },
  { id: 'clearer', lines: 3, zh: '消行者', en: 'Line Clearer', ja: '名手' },
];

/**
 * 取方块在某语言下的名称。
 * @param {object} piece
 * @param {string} lang
 */
export function pieceName(piece, lang) {
  if (!piece) return '';
  if (lang === 'en') return piece.en;
  if (lang === 'ja') return piece.ja;
  return piece.zh;
}
