/**
 * 城痕 Townscript — 数据层
 *
 * 收录地块颜色、地标类型、勘测提示与工坊升级。全部原创编写。
 */

/** 地块配色（index 0 起，前 5 种初始解锁）。 */
export const PALETTE = [
  { id: 0, zh: '石白', en: 'Stone', ja: '石白', fill: '#e8e3d9', roof: '#b9b3a6' },
  { id: 1, zh: '砖红', en: 'Brick', ja: '煉瓦', fill: '#d98a72', roof: '#a85b46' },
  { id: 2, zh: '苔绿', en: 'Moss', ja: '苔色', fill: '#8fbf8a', roof: '#5f8f5d' },
  { id: 3, zh: '海蓝', en: 'Tide', ja: '海色', fill: '#7fb3d6', roof: '#4a7fa3' },
  { id: 4, zh: '暮紫', en: 'Dusk', ja: '薄紫', fill: '#b49bd4', roof: '#7e68a0' },
  { id: 5, zh: '蜜黄', en: 'Honey', ja: '蜜色', fill: '#e8c46a', roof: '#b3923c' },
  { id: 6, zh: '漆黑', en: 'Ink', ja: '漆黒', fill: '#5d6b7a', roof: '#3b4753' },
  { id: 7, zh: '珊瑚', en: 'Coral', ja: '珊瑚', fill: '#ef9a9a', roof: '#c26a6a' },
  { id: 8, zh: '雪青', en: 'Frost', ja: '雪色', fill: '#dfe9f2', roof: '#a8b8c6' },
];

/** 初始解锁的配色数量。 */
export const BASE_COLORS = 5;

/**
 * 地标类型：靠「上下文规则」自动判定，是本作的收集物。
 * 每条规则都写在 `src/logic.js` 的 `detectLandmark` 里，这里只放展示信息。
 */
export const LANDMARKS = [
  { id: 'foundation', zh: '初基', en: 'First Foundation', ja: '初基', icon: '🧱', desc: '第一块地基' },
  { id: 'house', zh: '联排屋', en: 'Row House', ja: '連棟', icon: '🏠', desc: '与等高邻居连成一片' },
  { id: 'spire', zh: '孤塔', en: 'Lone Spire', ja: '孤塔', icon: '🗼', desc: '四邻都没有等高的块' },
  { id: 'arch', zh: '拱廊', en: 'Arch', ja: '拱廊', icon: '🌉', desc: '悬空架在水面之上' },
  { id: 'stair', zh: '阶梯', en: 'Stairway', ja: '階段', icon: '🪜', desc: '两侧高度差一阶' },
  { id: 'courtyard', zh: '内院', en: 'Courtyard', ja: '中庭', icon: '🌿', desc: '被高墙围住的一格水' },
  { id: 'plaza', zh: '方场', en: 'Plaza', ja: '広場', icon: '⬛', desc: '四块同高拼成 2×2' },
  { id: 'lighthouse', zh: '灯塔', en: 'Lighthouse', ja: '灯台', icon: '🗼', desc: '细高塔身且颜色交替' },
  { id: 'tower', zh: '高楼', en: 'High Tower', ja: '高層', icon: '🏢', desc: '盖到第四层' },
  { id: 'harbor', zh: '码头', en: 'Harbor', ja: '桟橋', icon: '⚓', desc: '紧贴岛屿边缘下水' },
];

export const LANDMARK_IDS = LANDMARKS.map((l) => l.id);

/** 地标图鉴里程碑：每种地标 2 条。 */
export const MILESTONES = [
  { id: 'first', count: 1, zh: '初次建起', en: 'First Raised', ja: '初建設' },
  { id: 'adept', count: 5, zh: '五度匠心', en: 'Five Built', ja: '五度建設' },
];

/**
 * 工坊升级。
 *   - `base`    初始造价
 *   - `growth`  每级价格倍率
 *   - `max`     等级上限
 */
export const UPGRADES = {
  expand: { id: 'expand', base: 120, growth: 2.2, max: 3 },
  palette: { id: 'palette', base: 90, growth: 2.0, max: 4 },
  survey: { id: 'survey', base: 80, growth: 2.1, max: 3 },
  income: { id: 'income', base: 100, growth: 1.95, max: 6 },
};

export const UPGRADE_IDS = ['expand', 'palette', 'survey', 'income'];

/** 棋盘基础尺寸（列 × 行）。拓地升级会逐级放大。 */
export const GRID = {
  baseCols: 16,
  baseRows: 12,
  expandCols: 2,
  expandRows: 2,
};

/** 每块地基的最高层数。 */
export const MAX_HEIGHT = 4;

/**
 * 渲染与命中检测共用的几何（2.5D 斜堆）。
 *   - `cell`  一格地块的边长
 *   - `off`   每叠一层的水平 / 垂直偏移
 *   - `gap`   方块之间的缝隙
 */
export const VIEW = { cell: 26, off: 7, gap: 2 };

/** 每日岛屿里「稀有地脉」的数量（在这些地块上建造收益 ×3）。 */
export const VEIN_COUNT = 3;

/** 每日岛屿的时间戳种子（UTC 日期）。 */
export function dailySeed(dateKey) {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i += 1) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 取地标在某语言下的名称。
 * @param {object} lm
 * @param {string} lang
 */
export function landmarkName(lm, lang) {
  if (!lm) return '';
  if (lang === 'en') return lm.en;
  if (lang === 'ja') return lm.ja;
  return lm.zh;
}
