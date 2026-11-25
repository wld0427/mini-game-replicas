/**
 * 落球坊 Ball Foundry — 数据层
 *
 * 收录 7 种球体材质、它们的物理参数、装备升级与图鉴里程碑。
 * 全部为原创编写，物理参数为手工调校的通用常识量级，不引用任何第三方素材或数据。
 */

/**
 * 球体材质。
 *   - `r`      半径（世界单位）
 *   - `mass`   质量
 *   - `rest`   弹性系数（0 = 不弹，1 = 完全弹性）
 *   - `fric`   摩擦（0 = 滑，1 = 立刻停住）
 *   - `value`  静止后结算的铜钱
 *   - `special` 特殊行为：null 无 / 'stick' 极黏 / 'burst' 撞击爆裂 / 'magnet' 磁力
 */
export const MATERIALS = {
  rubber: {
    id: 'rubber',
    zh: '橡皮球',
    en: 'Rubber Ball',
    ja: 'ゴム玉',
    r: 2.2,
    mass: 1,
    rest: 0.76,
    fric: 0.14,
    value: 3,
    color: '#ff8a5c',
    special: null,
  },
  iron: {
    id: 'iron',
    zh: '铁球',
    en: 'Iron Ball',
    ja: '鉄玉',
    r: 1.9,
    mass: 3.2,
    rest: 0.3,
    fric: 0.3,
    value: 9,
    color: '#93a7bd',
    special: null,
  },
  sticky: {
    id: 'sticky',
    zh: '黏球',
    en: 'Sticky Ball',
    ja: '粘り玉',
    r: 2,
    mass: 1.6,
    rest: 0.04,
    fric: 0.94,
    value: 13,
    color: '#7bd88f',
    special: 'stick',
  },
  glass: {
    id: 'glass',
    zh: '玻璃球',
    en: 'Glass Ball',
    ja: 'ガラス玉',
    r: 1.5,
    mass: 0.7,
    rest: 0.9,
    fric: 0.06,
    value: 24,
    color: '#9fd8ff',
    special: null,
  },
  flame: {
    id: 'flame',
    zh: '火球',
    en: 'Flame Ball',
    ja: '炎の玉',
    r: 2.1,
    mass: 1.2,
    rest: 0.42,
    fric: 0.2,
    value: 32,
    color: '#ff6b4a',
    special: 'burst',
  },
  magnet: {
    id: 'magnet',
    zh: '磁球',
    en: 'Magnet Ball',
    ja: '磁石玉',
    r: 2.4,
    mass: 2,
    rest: 0.34,
    fric: 0.35,
    value: 48,
    color: '#c084fc',
    special: 'magnet',
  },
  gold: {
    id: 'gold',
    zh: '金球',
    en: 'Gold Ball',
    ja: '金玉',
    r: 2.3,
    mass: 2.2,
    rest: 0.45,
    fric: 0.25,
    value: 170,
    color: '#ffd166',
    special: null,
  },
};

/** 材质 id 顺序（图鉴与解锁顺序一致）。 */
export const MATERIAL_IDS = ['rubber', 'iron', 'sticky', 'glass', 'flame', 'magnet', 'gold'];

/** 稀有度：决定掉落概率权重（材质越稀有越值钱）。 */
export const MATERIAL_WEIGHTS = {
  rubber: 44,
  iron: 26,
  sticky: 14,
  glass: 9,
  flame: 5,
  magnet: 1.6,
  gold: 0.4,
};

/** 物理常数。 */
export const PHYSICS = {
  dt: 1 / 120,
  gravity: 44,
  drag: 1.35,          // 线性阻尼：让球很快安定下来，不至于弹十几秒
  bounceDamp: 0.86,    // 每次弹跳的额外衰减
  sleepSpeed: 0.6,
  sleepFrames: 30,
  slop: 0.03,
  floorRestitution: 0.34,
  maxBalls: 90,
  magnetRange: 17,
  magnetForce: 2600,
  magnetMaxForce: 140,
  burstSpeed: 26,
  burstRadius: 13,
  burstImpulse: 34,
  wakeSpeed: 12,       // 相对撞击速度超过它才唤醒沉睡的球（用速度而非冲量，避免质量影响判定）
  maxSpeed: 90,        // 速度上限：单步位移必须小于最小半径，否则会穿模
  solverIterations: 3, // 位置修正迭代趟数（堆叠稳定性的关键）
};

/** 单帧最多推进多少物理步：卡顿后的大 dt 会把球甩飞，宁可慢放也不能乱。 */
export const MAX_STEPS_PER_FRAME = 8;

/** 手感层参数（抖动 / 打击停顿）。 */
export const FEEL = {
  traumaDecay: 1.6,
  maxShake: 1.4,
  hitStopScale: 0.06,
  hitStopMax: 0.12,
};

/** 容器初始尺寸（世界单位），升级会改变它们。 */
export const WORLD = {
  baseWidth: 60,
  baseHeight: 76,
  widthPerLevel: 7,
  heightPerLevel: 6,
  spawnMargin: 3,
};

/**
 * 装备升级。
 *   - `base`    初始造价
 *   - `growth`  每级价格倍率
 *   - `max`     等级上限
 *   - `effect`  作用说明键
 */
export const UPGRADES = {
  width: { id: 'width', base: 60, growth: 2.1, max: 6 },
  height: { id: 'height', base: 90, growth: 2.2, max: 5 },
  dropper: { id: 'dropper', base: 120, growth: 2.05, max: 6 },
  unlock: { id: 'unlock', base: 200, growth: 2.6, max: 5 },
};

export const UPGRADE_IDS = ['width', 'height', 'dropper', 'unlock'];

/** 保底：连续 N 颗不是金球，下一颗必出金球。 */
export const PITY_LIMIT = 12;

/** 自动投放间隔（毫秒）随投放器等级变化。 */
export const AUTO_DROP_INTERVAL = { base: 1400, perLevel: 260, min: 420 };

/** 材质图鉴里程碑（每种材质 3 条，全部解锁才算「全材质收藏」）。 */
export const MILESTONES = [
  { id: 'first', dropped: 1, zh: '初次登场', en: 'First Drop', ja: '初登場' },
  { id: 'regular', dropped: 12, zh: '常客', en: 'Regular', ja: '常連' },
  { id: 'collector', dropped: 45, zh: '收藏家', en: 'Collector', ja: 'コレクター' },
];

/**
 * 取材质在某语言下的名称。
 * @param {object} mat
 * @param {string} lang
 */
export function materialName(mat, lang) {
  if (!mat) return '';
  if (lang === 'en') return mat.en;
  if (lang === 'ja') return mat.ja;
  return mat.zh;
}
