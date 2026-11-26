/**
 * 元素熔炉 Element Forge — 数据层
 *
 * 收录 100+ 个元素词条与它们的配方（合成表）。数据全部为原创编写，
 * 只做「通用自然常识」层面的标注，不引用任何第三方素材。
 *
 * 约定：
 *   - `id`    稳定标识，存档与图鉴都用它
 *   - `zh/en/ja` 三语名称
 *   - `glyph` 图形标识（系统 emoji 字形，非第三方图片素材）
 *   - `tier`  稀有度档位：n 普通 / r 稀有 / sr 史诗 / ssr 传说 / ur 神话
 *   - MORPH   可选的「词素」标注：mod 作定语（放在前面），core 作中心语（放在后面）。
 *             未标注时默认 mod = core = 自身名称，原创合成会据此拼出新词。
 */

/** 四个基础元素。 */
export const BASE_IDS = ['water', 'fire', 'wind', 'earth'];

/** 全部词条。 */
export const ELEMENTS = {
  /* ── 基础元素 ── */
  water: { id: 'water', zh: '水', en: 'Water', ja: '水', glyph: '💧', tier: 'n' },
  fire: { id: 'fire', zh: '火', en: 'Fire', ja: '火', glyph: '🔥', tier: 'n' },
  wind: { id: 'wind', zh: '风', en: 'Wind', ja: '風', glyph: '🌬️', tier: 'n' },
  earth: { id: 'earth', zh: '土', en: 'Earth', ja: '土', glyph: '🪨', tier: 'n' },

  /* ── 第二层 ── */
  lake: { id: 'lake', zh: '湖', en: 'Lake', ja: '湖', glyph: '💧', tier: 'n' },
  steam: { id: 'steam', zh: '蒸汽', en: 'Steam', ja: '蒸気', glyph: '♨️', tier: 'n' },
  mist: { id: 'mist', zh: '雾', en: 'Mist', ja: '霧', glyph: '☁️', tier: 'n' },
  mud: { id: 'mud', zh: '泥浆', en: 'Mud', ja: '泥', glyph: '🟤', tier: 'n' },
  flame: { id: 'flame', zh: '火焰', en: 'Flame', ja: '炎', glyph: '🔥', tier: 'n' },
  smoke: { id: 'smoke', zh: '烟雾', en: 'Smoke', ja: '煙', glyph: '💨', tier: 'n' },
  lava: { id: 'lava', zh: '岩浆', en: 'Lava', ja: '溶岩', glyph: '🌋', tier: 'r' },
  tornado: { id: 'tornado', zh: '龙卷风', en: 'Tornado', ja: '竜巻', glyph: '🌪️', tier: 'r' },
  dust: { id: 'dust', zh: '尘土', en: 'Dust', ja: '塵', glyph: '🟫', tier: 'n' },
  rock: { id: 'rock', zh: '岩石', en: 'Rock', ja: '岩', glyph: '🪨', tier: 'n' },

  /* ── 第三层 ── */
  ocean: { id: 'ocean', zh: '海洋', en: 'Ocean', ja: '海', glyph: '🌊', tier: 'r' },
  salt: { id: 'salt', zh: '盐', en: 'Salt', ja: '塩', glyph: '🧂', tier: 'n' },
  rain: { id: 'rain', zh: '雨', en: 'Rain', ja: '雨', glyph: '🌧️', tier: 'n' },
  cloud: { id: 'cloud', zh: '云', en: 'Cloud', ja: '雲', glyph: '⛅', tier: 'r' },
  engine: { id: 'engine', zh: '引擎', en: 'Engine', ja: 'エンジン', glyph: '⚙️', tier: 'sr' },
  dew: { id: 'dew', zh: '露珠', en: 'Dew', ja: '露', glyph: '💧', tier: 'n' },
  soot: { id: 'soot', zh: '烟灰', en: 'Soot', ja: '煤煙', glyph: '🖤', tier: 'n' },
  clay: { id: 'clay', zh: '黏土', en: 'Clay', ja: '粘土', glyph: '🧱', tier: 'n' },
  brick: { id: 'brick', zh: '砖块', en: 'Brick', ja: 'レンガ', glyph: '🧱', tier: 'n' },
  swamp: { id: 'swamp', zh: '沼泽', en: 'Swamp', ja: '沼', glyph: '🐊', tier: 'r' },
  torch: { id: 'torch', zh: '火把', en: 'Torch', ja: 'たいまつ', glyph: '🔥', tier: 'n' },
  heat: { id: 'heat', zh: '热量', en: 'Heat', ja: '熱', glyph: '♨️', tier: 'n' },
  wildfire: { id: 'wildfire', zh: '野火', en: 'Wildfire', ja: '野火', glyph: '🔥', tier: 'r' },
  ash: { id: 'ash', zh: '灰烬', en: 'Ash', ja: '灰', glyph: '🖤', tier: 'n' },
  stone: { id: 'stone', zh: '石头', en: 'Stone', ja: '石', glyph: '🪨', tier: 'n' },
  volcano: { id: 'volcano', zh: '火山', en: 'Volcano', ja: '火山', glyph: '🌋', tier: 'sr' },
  wave: { id: 'wave', zh: '波浪', en: 'Wave', ja: '波', glyph: '🌊', tier: 'n' },
  sand: { id: 'sand', zh: '沙子', en: 'Sand', ja: '砂', glyph: '🏖️', tier: 'n' },

  /* ── 第四层 ── */
  sea: { id: 'sea', zh: '海', en: 'Sea', ja: '海', glyph: '🌊', tier: 'r' },
  tide: { id: 'tide', zh: '潮汐', en: 'Tide', ja: '潮', glyph: '🌊', tier: 'n' },
  river: { id: 'river', zh: '河', en: 'River', ja: '川', glyph: '🏞️', tier: 'r' },
  rainbow: { id: 'rainbow', zh: '彩虹', en: 'Rainbow', ja: '虹', glyph: '🌈', tier: 'sr' },
  sky: { id: 'sky', zh: '天空', en: 'Sky', ja: '空', glyph: '🌌', tier: 'r' },
  fog: { id: 'fog', zh: '浓雾', en: 'Fog', ja: '濃霧', glyph: '🌁', tier: 'n' },
  gear: { id: 'gear', zh: '齿轮', en: 'Gear', ja: '歯車', glyph: '⚙️', tier: 'n' },
  wall: { id: 'wall', zh: '墙壁', en: 'Wall', ja: '壁', glyph: '🧱', tier: 'n' },
  halite: { id: 'halite', zh: '岩盐', en: 'Halite', ja: '岩塩', glyph: '🧂', tier: 'n' },
  soil: { id: 'soil', zh: '泥土', en: 'Soil', ja: '土', glyph: '🟫', tier: 'n' },
  boulder: { id: 'boulder', zh: '巨石', en: 'Boulder', ja: '巨岩', glyph: '🪨', tier: 'n' },
  flint: { id: 'flint', zh: '火石', en: 'Flint', ja: '火石', glyph: '🪨', tier: 'n' },
  glass: { id: 'glass', zh: '玻璃', en: 'Glass', ja: '硝子', glyph: '🫙', tier: 'r' },
  sandstorm: { id: 'sandstorm', zh: '沙尘暴', en: 'Sandstorm', ja: '砂嵐', glyph: '🌪️', tier: 'r' },
  tar: { id: 'tar', zh: '焦油', en: 'Tar', ja: 'タール', glyph: '🛢️', tier: 'n' },
  geyser: { id: 'geyser', zh: '间歇泉', en: 'Geyser', ja: '間欠泉', glyph: '⛲', tier: 'r' },
  firestorm: { id: 'firestorm', zh: '火龙卷', en: 'Firestorm', ja: '火竜巻', glyph: '🔥', tier: 'sr' },
  hotspring: { id: 'hotspring', zh: '温泉', en: 'Hot Spring', ja: '温泉', glyph: '♨️', tier: 'r' },
  energy: { id: 'energy', zh: '能量', en: 'Energy', ja: 'エネルギー', glyph: '⚡', tier: 'r' },
  plant: { id: 'plant', zh: '植物', en: 'Plant', ja: '植物', glyph: '🌱', tier: 'n' },

  /* ── 第五层 ── */
  sun: { id: 'sun', zh: '太阳', en: 'Sun', ja: '太陽', glyph: '☀️', tier: 'sr' },
  moon: { id: 'moon', zh: '月亮', en: 'Moon', ja: '月', glyph: '🌙', tier: 'sr' },
  star: { id: 'star', zh: '星星', en: 'Star', ja: '星', glyph: '⭐', tier: 'n' },
  tree: { id: 'tree', zh: '树', en: 'Tree', ja: '樹', glyph: '🌳', tier: 'r' },
  rice: { id: 'rice', zh: '稻', en: 'Rice', ja: '稲', glyph: '🌾', tier: 'r' },
  dandelion: { id: 'dandelion', zh: '蒲公英', en: 'Dandelion', ja: 'たんぽぽ', glyph: '🌼', tier: 'r' },
  charcoal: { id: 'charcoal', zh: '木炭', en: 'Charcoal', ja: '炭', glyph: '⚫', tier: 'n' },
  moss: { id: 'moss', zh: '苔藓', en: 'Moss', ja: '苔', glyph: '🌿', tier: 'n' },
  echo: { id: 'echo', zh: '回声', en: 'Echo', ja: 'エコー', glyph: '📢', tier: 'n' },
  metal: { id: 'metal', zh: '金属', en: 'Metal', ja: '金属', glyph: '🔩', tier: 'r' },

  /* ── 第六层 ── */
  light: { id: 'light', zh: '光', en: 'Light', ja: '光', glyph: '✨', tier: 'sr' },
  shadow: { id: 'shadow', zh: '影', en: 'Shadow', ja: '影', glyph: '🌑', tier: 'n' },
  gold: { id: 'gold', zh: '金', en: 'Gold', ja: '金', glyph: '💰', tier: 'r' },
  steel: { id: 'steel', zh: '钢', en: 'Steel', ja: '鋼', glyph: '⚔️', tier: 'r' },
  bulb: { id: 'bulb', zh: '灯泡', en: 'Bulb', ja: '電球', glyph: '💡', tier: 'r' },
  reflection: { id: 'reflection', zh: '倒影', en: 'Reflection', ja: '映り', glyph: '🪞', tier: 'n' },
  galaxy: { id: 'galaxy', zh: '银河', en: 'Galaxy', ja: '銀河', glyph: '🌌', tier: 'sr' },
  pottery: { id: 'pottery', zh: '陶器', en: 'Pottery', ja: '陶器', glyph: '🏺', tier: 'r' },
  porcelain: { id: 'porcelain', zh: '瓷器', en: 'Porcelain', ja: '磁器', glyph: '🍵', tier: 'r' },
  hourglass: { id: 'hourglass', zh: '沙漏', en: 'Hourglass', ja: '砂時計', glyph: '⏳', tier: 'sr' },
  dark: { id: 'dark', zh: '黑暗', en: 'Darkness', ja: '闇', glyph: '🌑', tier: 'r' },
  life: { id: 'life', zh: '生命', en: 'Life', ja: '生命', glyph: '🌱', tier: 'sr' },

  /* ── 第七层 ── */
  void_: { id: 'void_', zh: '虚空', en: 'Void', ja: '虚無', glyph: '🕳️', tier: 'ur' },
  chaos: { id: 'chaos', zh: '混沌', en: 'Chaos', ja: '混沌', glyph: '🌀', tier: 'ur' },
  fish: { id: 'fish', zh: '鱼', en: 'Fish', ja: '魚', glyph: '🐟', tier: 'r' },
  bird: { id: 'bird', zh: '鸟', en: 'Bird', ja: '鳥', glyph: '🐦', tier: 'r' },
  insect: { id: 'insect', zh: '昆虫', en: 'Insect', ja: '虫', glyph: '🐛', tier: 'r' },
  dragon: { id: 'dragon', zh: '龙', en: 'Dragon', ja: '竜', glyph: '🐉', tier: 'ssr' },
  human: { id: 'human', zh: '人', en: 'Human', ja: '人', glyph: '👤', tier: 'sr' },
  time: { id: 'time', zh: '时间', en: 'Time', ja: '時間', glyph: '⏳', tier: 'ssr' },
  magic: { id: 'magic', zh: '魔法', en: 'Magic', ja: '魔法', glyph: '🔮', tier: 'sr' },

  /* ── 第八层 ── */
  tool: { id: 'tool', zh: '工具', en: 'Tool', ja: '道具', glyph: '🔨', tier: 'r' },
  farmer: { id: 'farmer', zh: '农夫', en: 'Farmer', ja: '農夫', glyph: '👨‍🌾', tier: 'r' },
  dream: { id: 'dream', zh: '梦', en: 'Dream', ja: '夢', glyph: '💭', tier: 'sr' },
  art: { id: 'art', zh: '艺术', en: 'Art', ja: '芸術', glyph: '🎨', tier: 'r' },
  hiding: { id: 'hiding', zh: '秘密', en: 'Secret', ja: '秘密', glyph: '🤫', tier: 'r' },
  hero: { id: 'hero', zh: '英雄', en: 'Hero', ja: '英雄', glyph: '🏅', tier: 'ssr' },
  fossil: { id: 'fossil', zh: '化石', en: 'Fossil', ja: '化石', glyph: '🦴', tier: 'ssr' },
  universe: { id: 'universe', zh: '宇宙', en: 'Universe', ja: '宇宙', glyph: '🌌', tier: 'ur' },
  deity: { id: 'deity', zh: '神', en: 'Deity', ja: '神', glyph: '🕉️', tier: 'ur' },
  spell: { id: 'spell', zh: '咒语', en: 'Spell', ja: '呪文', glyph: '📜', tier: 'sr' },

  /* ── 第九层 ── */
  grain: { id: 'grain', zh: '粮食', en: 'Grain', ja: '穀物', glyph: '🌾', tier: 'n' },
  bread: { id: 'bread', zh: '面包', en: 'Bread', ja: 'パン', glyph: '🍞', tier: 'r' },
  sword: { id: 'sword', zh: '剑', en: 'Sword', ja: '剣', glyph: '⚔️', tier: 'r' },
  language: { id: 'language', zh: '语言', en: 'Language', ja: '言語', glyph: '🗣️', tier: 'r' },
  mythology: { id: 'mythology', zh: '神话', en: 'Mythology', ja: '神話', glyph: '📜', tier: 'ssr' },
  toast: { id: 'toast', zh: '烤面包', en: 'Toast', ja: 'トースト', glyph: '🍞', tier: 'n' },
  characters: { id: 'characters', zh: '文字', en: 'Characters', ja: '文字', glyph: '✍️', tier: 'n' },
  nightmare: { id: 'nightmare', zh: '噩梦', en: 'Nightmare', ja: '悪夢', glyph: '😱', tier: 'r' },
  memory: { id: 'memory', zh: '记忆', en: 'Memory', ja: '記憶', glyph: '🧠', tier: 'ssr' },
  eternity: { id: 'eternity', zh: '永恒', en: 'Eternity', ja: '永遠', glyph: '♾️', tier: 'ur' },

  /* ── 最深层 ── */
  spirit: { id: 'spirit', zh: '精灵', en: 'Spirit', ja: '精霊', glyph: '👻', tier: 'ssr' },
  soul: { id: 'soul', zh: '灵魂', en: 'Soul', ja: '魂', glyph: '💀', tier: 'ssr' },
  consciousness: { id: 'consciousness', zh: '意识', en: 'Consciousness', ja: '意識', glyph: '🤖', tier: 'ur' },
};

/**
 * 词素标注：定语（mod）与中心语（core）。
 * 原创合成时按「定语 A + 中心语 B」拼出新词，因此这里的拆分直接决定成品好不好玩。
 * 未标注的词条默认 mod = core = 自身名称。
 */
export const MORPH = {
  water: { mod: { zh: '水', en: 'Water', ja: '水' }, core: { zh: '水', en: 'Water', ja: '水' } },
  fire: { mod: { zh: '火', en: 'Fire', ja: '火' }, core: { zh: '火', en: 'Fire', ja: '火' } },
  wind: { mod: { zh: '风', en: 'Wind', ja: '風' }, core: { zh: '风', en: 'Wind', ja: '風' } },
  earth: { mod: { zh: '土', en: 'Earth', ja: '土' }, core: { zh: '地', en: 'Earth', ja: '地' } },
  steam: { mod: { zh: '蒸', en: 'Steam', ja: '蒸' }, core: { zh: '汽', en: 'Vapour', ja: '気' } },
  lava: { mod: { zh: '熔', en: 'Molten', ja: '溶' }, core: { zh: '岩浆', en: 'Lava', ja: '溶岩' } },
  rock: { mod: { zh: '岩', en: 'Rock', ja: '岩' }, core: { zh: '石', en: 'Stone', ja: '石' } },
  dust: { mod: { zh: '尘', en: 'Dust', ja: '塵' }, core: { zh: '土', en: 'Earth', ja: '土' } },
  mud: { mod: { zh: '泥', en: 'Mud', ja: '泥' }, core: { zh: '浆', en: 'Slurry', ja: '漿' } },
  star: { mod: { zh: '星', en: 'Star', ja: '星' }, core: { zh: '星', en: 'Star', ja: '星' } },
  sun: { mod: { zh: '日', en: 'Sun', ja: '日' }, core: { zh: '光', en: 'Light', ja: '光' } },
  moon: { mod: { zh: '月', en: 'Moon', ja: '月' }, core: { zh: '亮', en: 'Moon', ja: '月' } },
  rain: { mod: { zh: '雨', en: 'Rain', ja: '雨' }, core: { zh: '水', en: 'Water', ja: '水' } },
  cloud: { mod: { zh: '云', en: 'Cloud', ja: '雲' }, core: { zh: '层', en: 'Cloud', ja: '雲' } },
  sky: { mod: { zh: '天', en: 'Sky', ja: '天' }, core: { zh: '空', en: 'Air', ja: '空' } },
  sea: { mod: { zh: '海', en: 'Sea', ja: '海' }, core: { zh: '洋', en: 'Ocean', ja: '洋' } },
  mountain: { mod: { zh: '山', en: 'Mountain', ja: '山' }, core: { zh: '峰', en: 'Peak', ja: '峰' } },
  tree: { mod: { zh: '树', en: 'Tree', ja: '樹' }, core: { zh: '木', en: 'Wood', ja: '木' } },
  life: { mod: { zh: '生', en: 'Life', ja: '生' }, core: { zh: '命', en: 'Living', ja: '命' } },
  soul: { mod: { zh: '灵', en: 'Soul', ja: '霊' }, core: { zh: '魂', en: 'Soul', ja: '魂' } },
  time: { mod: { zh: '时', en: 'Time', ja: '時' }, core: { zh: '间', en: 'Span', ja: '間' } },
  dream: { mod: { zh: '梦', en: 'Dream', ja: '夢' }, core: { zh: '境', en: 'Vision', ja: '夢' } },
  light: { mod: { zh: '光', en: 'Light', ja: '光' }, core: { zh: '芒', en: 'Light', ja: '芒' } },
  shadow: { mod: { zh: '影', en: 'Shadow', ja: '影' }, core: { zh: '子', en: 'Shade', ja: '影' } },
  dark: { mod: { zh: '黑', en: 'Dark', ja: '黒' }, core: { zh: '暗', en: 'Darkness', ja: '闇' } },
  dragon: { mod: { zh: '龙', en: 'Dragon', ja: '竜' }, core: { zh: '龙', en: 'Dragon', ja: '竜' } },
  fish: { mod: { zh: '鱼', en: 'Fish', ja: '魚' }, core: { zh: '鱼', en: 'Fish', ja: '魚' } },
  bird: { mod: { zh: '鸟', en: 'Bird', ja: '鳥' }, core: { zh: '羽', en: 'Bird', ja: '羽' } },
  human: { mod: { zh: '人', en: 'Human', ja: '人' }, core: { zh: '类', en: 'Being', ja: '類' } },
  metal: { mod: { zh: '金', en: 'Metal', ja: '金' }, core: { zh: '属', en: 'Metal', ja: '属' } },
  glass: { mod: { zh: '玻', en: 'Glass', ja: '硝' }, core: { zh: '璃', en: 'Glass', ja: '子' } },
  void_: { mod: { zh: '虚', en: 'Void', ja: '虚' }, core: { zh: '空', en: 'Void', ja: '無' } },
  chaos: { mod: { zh: '混', en: 'Chaos', ja: '混' }, core: { zh: '沌', en: 'Chaos', ja: '沌' } },
};

/**
 * 合成表：每条是 `[原料A, 原料B, 产物]`。
 * 顺序无关（AB 与 BA 等价），同一对原料只允许有一条配方。
 */
export const RECIPES = [
  /* 第二层 */
  ['water', 'water', 'lake'],
  ['water', 'fire', 'steam'],
  ['water', 'wind', 'mist'],
  ['water', 'earth', 'mud'],
  ['fire', 'fire', 'flame'],
  ['fire', 'wind', 'smoke'],
  ['fire', 'earth', 'lava'],
  ['wind', 'wind', 'tornado'],
  ['wind', 'earth', 'dust'],
  ['earth', 'earth', 'rock'],

  /* 第三层 */
  ['lake', 'water', 'ocean'],
  ['lake', 'fire', 'salt'],
  ['steam', 'water', 'rain'],
  ['steam', 'wind', 'cloud'],
  ['steam', 'fire', 'engine'],
  ['mist', 'water', 'dew'],
  ['mist', 'fire', 'soot'],
  ['mud', 'earth', 'clay'],
  ['mud', 'fire', 'brick'],
  ['mud', 'water', 'swamp'],
  ['flame', 'fire', 'torch'],
  ['flame', 'water', 'heat'],
  ['flame', 'wind', 'wildfire'],
  ['smoke', 'wind', 'ash'],
  ['lava', 'water', 'stone'],
  ['lava', 'earth', 'volcano'],
  ['tornado', 'water', 'wave'],
  ['dust', 'earth', 'sand'],

  /* 第四层 */
  ['ocean', 'water', 'sea'],
  ['ocean', 'wind', 'tide'],
  ['rain', 'earth', 'river'],
  ['rain', 'flame', 'rainbow'],
  ['cloud', 'wind', 'sky'],
  ['cloud', 'water', 'fog'],
  ['engine', 'rock', 'gear'],
  ['brick', 'brick', 'wall'],
  ['salt', 'rock', 'halite'],
  ['ash', 'earth', 'soil'],
  ['stone', 'stone', 'boulder'],
  ['stone', 'flame', 'flint'],
  ['sand', 'flame', 'glass'],
  ['sand', 'wind', 'sandstorm'],
  ['swamp', 'flame', 'tar'],
  ['volcano', 'water', 'geyser'],
  ['tornado', 'flame', 'firestorm'],
  ['heat', 'water', 'hotspring'],
  ['heat', 'flame', 'energy'],
  ['mud', 'rain', 'plant'],

  /* 第五层 */
  ['sky', 'flame', 'sun'],
  ['sky', 'water', 'moon'],
  ['dust', 'flame', 'star'],
  ['soil', 'plant', 'tree'],
  ['plant', 'water', 'rice'],
  ['plant', 'wind', 'dandelion'],
  ['plant', 'flame', 'charcoal'],
  ['plant', 'rock', 'moss'],
  ['wave', 'rock', 'echo'],
  ['lava', 'stone', 'metal'],

  /* 第六层 */
  ['sun', 'moon', 'light'],
  ['light', 'rock', 'shadow'],
  ['metal', 'rock', 'gold'],
  ['metal', 'heat', 'steel'],
  ['glass', 'flame', 'bulb'],
  ['water', 'light', 'reflection'],
  ['sky', 'star', 'galaxy'],
  ['heat', 'clay', 'pottery'],
  ['brick', 'flame', 'porcelain'],
  ['sand', 'glass', 'hourglass'],
  ['light', 'shadow', 'dark'],
  ['plant', 'energy', 'life'],

  /* 第七层 */
  ['dark', 'light', 'void_'],
  ['void_', 'energy', 'chaos'],
  ['life', 'water', 'fish'],
  ['life', 'wind', 'bird'],
  ['life', 'rock', 'insect'],
  ['life', 'flame', 'dragon'],
  ['life', 'moon', 'human'],
  ['hourglass', 'star', 'time'],
  ['dark', 'flame', 'magic'],

  /* 第八层 */
  ['human', 'rock', 'tool'],
  ['human', 'soil', 'farmer'],
  ['human', 'star', 'dream'],
  ['human', 'light', 'art'],
  ['human', 'shadow', 'hiding'],
  ['dragon', 'human', 'hero'],
  ['time', 'ash', 'fossil'],
  ['galaxy', 'energy', 'universe'],
  ['chaos', 'human', 'deity'],
  ['magic', 'wind', 'spell'],

  /* 第九层 */
  ['farmer', 'soil', 'grain'],
  ['grain', 'water', 'bread'],
  ['human', 'metal', 'sword'],
  ['echo', 'human', 'language'],
  ['hero', 'moon', 'mythology'],
  ['bread', 'flame', 'toast'],
  ['language', 'light', 'characters'],
  ['dream', 'shadow', 'nightmare'],
  ['time', 'dream', 'memory'],
  ['universe', 'time', 'eternity'],

  /* 最深层 */
  ['spell', 'life', 'spirit'],
  ['memory', 'star', 'soul'],
  ['soul', 'dream', 'consciousness'],
];

/** 原创合成时给新词加的「增幅前缀」，用来解决重名。 */
export const AMPLIFIERS = [
  { zh: '超', en: 'Ultra ', ja: '超' },
  { zh: '巨', en: 'Great ', ja: '巨' },
  { zh: '太', en: 'Super ', ja: '超' },
  { zh: '古', en: 'Ancient ', ja: '古' },
  { zh: '梦', en: 'Dream ', ja: '夢' },
  { zh: '幻', en: 'Phantom ', ja: '幻' },
];

/** 每日灵感：每日可抽取次数上限。 */
export const DAILY_LIMIT = 5;

/** 每日灵感保底：连续 N 次未出传说及以上，下一次必出传说。 */
export const DAILY_PITY_LIMIT = 12;

/**
 * 取词条在指定语言下的名称。
 * @param {{zh: string, en: string, ja: string}} el
 * @param {string} lang
 */
export function elementName(el, lang) {
  if (!el) return '';
  if (lang === 'en') return el.en;
  if (lang === 'ja') return el.ja;
  return el.zh;
}

/**
 * 取词条的定语 / 中心语。
 * @param {{id: string, zh: string, en: string, ja: string}} el
 * @param {string} lang
 * @returns {{mod: string, core: string}}
 */
export function morphemes(el, lang) {
  const override = MORPH[el.id];
  const self = elementName(el, lang);
  if (!override) return { mod: self, core: self };
  return {
    mod: override.mod[lang] || self,
    core: override.core[lang] || self,
  };
}
