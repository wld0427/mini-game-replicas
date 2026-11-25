/**
 * 渔汛录 Angler's Almanac — 数据层
 *
 * 收录鱼种、装备升级与稀有度分档。全部为原创编写，只做「通用垂钓常识」层面的标注，
 * 不引用任何第三方素材或图片资源。
 *
 * 字段约定：
 *   - `id`      稳定标识，图鉴与存档都用它
 *   - `zh/en/ja` 三语名称
 *   - `tier`    稀有度：n 普通 / r 稀有 / sr 史诗 / ssr 传说 / ur 神话
 *               （对应水层深度：tier 越深，需要的饵等级越高）
 *   - `hue`     色相（0–360），用于 CSS/SVG 自绘的鱼身配色
 *   - `minCm/maxCm` 体长区间（厘米）
 *   - `value`   基础售价（铜钱）
 */

/** 稀有度分档。weight 为基础权重，被鱼竿幸运值与保底机制修正。 */
export const TIERS = {
  n: { id: 'n', weight: 62, label: 'Common', zh: '普通', ja: 'コモン', depth: 0 },
  r: { id: 'r', weight: 26, label: 'Rare', zh: '稀有', ja: 'レア', depth: 1 },
  sr: { id: 'sr', weight: 9, label: 'Epic', zh: '史诗', ja: 'エピック', depth: 2 },
  ssr: { id: 'ssr', weight: 2.5, label: 'Legendary', zh: '传说', ja: 'レジェンド', depth: 3 },
  ur: { id: 'ur', weight: 0.5, label: 'Mythic', zh: '神话', ja: 'ミシック', depth: 4 },
};

export const TIER_IDS = ['n', 'r', 'sr', 'ssr', 'ur'];

/** 鱼种表。 */
export const SPECIES = [
  /* ── 普通（深度 0） ── */
  { id: 'crucian', zh: '鲫鱼', en: 'Crucian Carp', ja: 'フナ', tier: 'n', hue: 42, minCm: 12, maxCm: 26, value: 6 },
  { id: 'carp', zh: '鲤鱼', en: 'Carp', ja: 'コイ', tier: 'n', hue: 28, minCm: 20, maxCm: 48, value: 9 },
  { id: 'grasscarp', zh: '草鱼', en: 'Grass Carp', ja: 'ソウギョ', tier: 'n', hue: 78, minCm: 30, maxCm: 72, value: 11 },
  { id: 'silvercarp', zh: '白鲢', en: 'Silver Carp', ja: 'シラゴイ', tier: 'n', hue: 200, minCm: 28, maxCm: 60, value: 10 },
  { id: 'bigheadcarp', zh: '花鲢', en: 'Bighead Carp', ja: 'ハギハネ', tier: 'n', hue: 190, minCm: 30, maxCm: 65, value: 11 },
  { id: 'catfish', zh: '鲶鱼', en: 'Catfish', ja: 'ナマズ', tier: 'n', hue: 18, minCm: 25, maxCm: 70, value: 12 },
  { id: 'yellowcat', zh: '黄颡鱼', en: 'Yellow Catfish', ja: 'ヒガイ', tier: 'n', hue: 48, minCm: 18, maxCm: 40, value: 10 },
  { id: 'loach', zh: '泥鳅', en: 'Loach', ja: 'ドジョウ', tier: 'n', hue: 35, minCm: 10, maxCm: 24, value: 7 },
  { id: 'gudgeon', zh: '麦穗鱼', en: 'Gudgeon', ja: 'ハヤ', tier: 'n', hue: 55, minCm: 6, maxCm: 12, value: 4 },
  { id: 'tilapia', zh: '罗非鱼', en: 'Tilapia', ja: 'ティラピア', tier: 'n', hue: 340, minCm: 16, maxCm: 42, value: 10 },
  { id: 'mussel', zh: '河蚌', en: 'Freshwater Mussel', ja: 'シジミ', tier: 'n', hue: 320, minCm: 6, maxCm: 14, value: 5 },
  { id: 'shrimp', zh: '小虾', en: 'Shrimp', ja: 'エビ', tier: 'n', hue: 8, minCm: 4, maxCm: 11, value: 4 },
  { id: 'snail', zh: '螺蛳', en: 'River Snail', ja: 'カワウズ', tier: 'n', hue: 30, minCm: 3, maxCm: 8, value: 3 },
  { id: 'whitebait', zh: '白条', en: 'Whitebait', ja: 'ハゼ', tier: 'n', hue: 205, minCm: 6, maxCm: 14, value: 5 },
  { id: 'icefish', zh: '银鱼', en: 'Icefish', ja: 'シラユ', tier: 'n', hue: 210, minCm: 8, maxCm: 18, value: 6 },

  /* ── 稀有（深度 1） ── */
  { id: 'seabass', zh: '鲈鱼', en: 'Sea Bass', ja: 'スズキ', tier: 'r', hue: 165, minCm: 30, maxCm: 80, value: 26 },
  { id: 'rainbowtrout', zh: '虹鳟', en: 'Rainbow Trout', ja: 'ニジマス', tier: 'r', hue: 330, minCm: 28, maxCm: 62, value: 28 },
  { id: 'skipjack', zh: '鲣鱼', en: 'Skipjack Tuna', ja: 'カツオ', tier: 'r', hue: 200, minCm: 60, maxCm: 110, value: 34 },
  { id: 'salmon', zh: '三文鱼', en: 'Salmon', ja: 'サケ', tier: 'r', hue: 20, minCm: 45, maxCm: 110, value: 32 },
  { id: 'eel', zh: '鳗鱼', en: 'Eel', ja: 'ウナギ', tier: 'r', hue: 38, minCm: 40, maxCm: 130, value: 30 },
  { id: 'puffer', zh: '河豚', en: 'Pufferfish', ja: 'フグ', tier: 'r', hue: 55, minCm: 15, maxCm: 40, value: 28 },
  { id: 'pomfret', zh: '鲳鱼', en: 'Pomfret', ja: 'ヒイラギ', tier: 'r', hue: 195, minCm: 25, maxCm: 65, value: 27 },
  { id: 'seabream', zh: '黑鲷', en: 'Black Sea Bream', ja: 'クロダイ', tier: 'r', hue: 12, minCm: 35, maxCm: 95, value: 36 },
  { id: 'saury', zh: '竹荚鱼', en: 'Saury', ja: 'サンマ', tier: 'r', hue: 70, minCm: 25, maxCm: 45, value: 25 },
  { id: 'mackerel', zh: '鲭鱼', en: 'Mackerel', ja: 'サバ', tier: 'r', hue: 180, minCm: 20, maxCm: 45, value: 24 },
  { id: 'sweetfish', zh: '香鱼', en: 'Sweetfish', ja: 'アユ', tier: 'r', hue: 45, minCm: 15, maxCm: 30, value: 26 },
  { id: 'pearloyster', zh: '珍珠贝', en: 'Pearl Oyster', ja: 'アコガイ', tier: 'r', hue: 300, minCm: 12, maxCm: 26, value: 30 },

  /* ── 史诗（深度 2） ── */
  { id: 'tuna', zh: '金枪鱼', en: 'Tuna', ja: 'マグロ', tier: 'sr', hue: 215, minCm: 90, maxCm: 240, value: 105 },
  { id: 'squid', zh: '鱿鱼', en: 'Squid', ja: 'イカ', tier: 'sr', hue: 345, minCm: 30, maxCm: 90, value: 78 },
  { id: 'octopus', zh: '章鱼', en: 'Octopus', ja: 'タコ', tier: 'sr', hue: 330, minCm: 35, maxCm: 110, value: 88 },
  { id: 'lobster', zh: '龙虾', en: 'Lobster', ja: 'イセエビ', tier: 'sr', hue: 5, minCm: 25, maxCm: 70, value: 92 },
  { id: 'crab', zh: '螃蟹', en: 'Crab', ja: 'カニ', tier: 'sr', hue: 358, minCm: 12, maxCm: 34, value: 66 },
  { id: 'abalone', zh: '鲍鱼', en: 'Abalone', ja: 'アワビ', tier: 'sr', hue: 275, minCm: 8, maxCm: 20, value: 82 },
  { id: 'seacucumber', zh: '海参', en: 'Sea Cucumber', ja: 'ナマコ', tier: 'sr', hue: 25, minCm: 12, maxCm: 35, value: 74 },
  { id: 'turtle', zh: '海龟', en: 'Sea Turtle', ja: 'ウミガメ', tier: 'sr', hue: 130, minCm: 60, maxCm: 150, value: 110 },
  { id: 'jellyfish', zh: '水母', en: 'Jellyfish', ja: 'クラゲ', tier: 'sr', hue: 290, minCm: 15, maxCm: 60, value: 70 },

  /* ── 传说（深度 3） ── */
  { id: 'shark', zh: '鲨鱼', en: 'Shark', ja: 'サメ', tier: 'ssr', hue: 205, minCm: 150, maxCm: 420, value: 320 },
  { id: 'whaleshark', zh: '鲸鲨', en: 'Whale Shark', ja: 'ジンベザメ', tier: 'ssr', hue: 190, minCm: 400, maxCm: 1200, value: 420 },
  { id: 'hairtail', zh: '带鱼', en: 'Hairtail', ja: 'タチウオ', tier: 'ssr', hue: 220, minCm: 180, maxCm: 380, value: 350 },
  { id: 'manta', zh: '魔鬼鱼', en: 'Manta Ray', ja: 'マンタ', tier: 'ssr', hue: 185, minCm: 200, maxCm: 520, value: 380 },
  { id: 'kingsalmon', zh: '王鲑', en: 'King Salmon', ja: 'キングサーモン', tier: 'ssr', hue: 15, minCm: 90, maxCm: 160, value: 340 },

  /* ── 神话（深度 4） ── */
  { id: 'kun', zh: '鲲鹏', en: 'Kun', ja: 'クン', tier: 'ur', hue: 45, minCm: 400, maxCm: 1800, value: 1600 },
  { id: 'leviathan', zh: '利维坦', en: 'Leviathan', ja: 'レヴィアタン', tier: 'ur', hue: 255, minCm: 600, maxCm: 2400, value: 1900 },
  { id: 'arowana', zh: '龙鱼', en: 'Arowana', ja: 'アロワナ', tier: 'ur', hue: 355, minCm: 30, maxCm: 120, value: 2400 },
];

/** 按 id 索引的鱼种表。 */
export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/**
 * 装备升级定义。
 *   - `base`    初始造价
 *   - `growth`  每级价格倍率
 *   - `max`     等级上限
 */
export const UPGRADES = {
  rod: { id: 'rod', base: 45, growth: 1.85, max: 10 },
  reel: { id: 'reel', base: 70, growth: 1.9, max: 8 },
  bait: { id: 'bait', base: 110, growth: 2.05, max: 5 },
  basket: { id: 'basket', base: 140, growth: 1.95, max: 8 },
};

export const UPGRADE_IDS = ['rod', 'reel', 'bait', 'basket'];

/** 保底：连续 N 次钓到的鱼不是传说及以上，下一竿必出传说。 */
export const PITY_LIMIT = 10;

/**
 * 取鱼种在三语下的名称。
 * @param {{zh: string, en: string, ja: string}} sp
 * @param {string} lang
 */
export function speciesName(sp, lang) {
  if (!sp) return '';
  if (lang === 'en') return sp.en;
  if (lang === 'ja') return sp.ja;
  return sp.zh;
}
