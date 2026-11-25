/**
 * 字库数据（102 字）
 *
 * freq = 「生僻度百分位」0-100，越大越稀有。
 * 该分档依据各字在现代日文/中文中的常见程度手工归类，用于玩法稀有度判定。
 * 释义与读音为通用常识性标注，字形本身属于公共领域字体/汉字资源。
 */

export const KANJI = [
  // ── 普通（n）：高频常用字 ──────────────────────────────
  { id: 'k001', c: '年', k: 'ネン', m: 'year', z: '年', freq: 0 },
  { id: 'k002', c: '人', k: 'ジン', m: 'person', z: '人', freq: 1 },
  { id: 'k003', c: '日', k: 'ニチ', m: 'sun / day', z: '太阳 / 日', freq: 2 },
  { id: 'k004', c: '月', k: 'ゲツ', m: 'moon / month', z: '月亮 / 月', freq: 3 },
  { id: 'k005', c: '一', k: 'イチ', m: 'one', z: '一', freq: 4 },
  { id: 'k006', c: '二', k: 'ニ', m: 'two', z: '二', freq: 5 },
  { id: 'k007', c: '三', k: 'サン', m: 'three', z: '三', freq: 6 },
  { id: 'k008', c: '四', k: 'シ', m: 'four', z: '四', freq: 7 },
  { id: 'k009', c: '五', k: 'ゴ', m: 'five', z: '五', freq: 8 },
  { id: 'k010', c: '六', k: 'ロク', m: 'six', z: '六', freq: 9 },
  { id: 'k011', c: '七', k: 'ナナ', m: 'seven', z: '七', freq: 10 },
  { id: 'k012', c: '八', k: 'ハチ', m: 'eight', z: '八', freq: 11 },
  { id: 'k013', c: '九', k: 'キュウ', m: 'nine', z: '九', freq: 12 },
  { id: 'k014', c: '十', k: 'ジュウ', m: 'ten', z: '十', freq: 13 },
  { id: 'k015', c: '時', k: 'ジ', m: 'time / hour', z: '时间', freq: 14 },
  { id: 'k016', c: '分', k: 'ブン', m: 'minute / part', z: '分钟 / 分', freq: 15 },
  { id: 'k017', c: '火', k: 'カ', m: 'fire', z: '火', freq: 16 },
  { id: 'k018', c: '水', k: 'スイ', m: 'water', z: '水', freq: 17 },
  { id: 'k019', c: '木', k: 'モク', m: 'tree / wood', z: '树 / 木', freq: 18 },
  { id: 'k020', c: '金', k: 'キン', m: 'gold / metal', z: '金', freq: 19 },
  { id: 'k021', c: '土', k: 'ド', m: 'earth / soil', z: '土', freq: 20 },
  { id: 'k022', c: '大', k: 'ダイ', m: 'big', z: '大', freq: 21 },
  { id: 'k023', c: '小', k: 'ショウ', m: 'small', z: '小', freq: 22 },
  { id: 'k024', c: '中', k: 'チュウ', m: 'middle / inside', z: '中', freq: 23 },
  { id: 'k025', c: '上', k: 'ジョウ', m: 'up / above', z: '上', freq: 24 },
  { id: 'k026', c: '下', k: 'ゲ', m: 'down / below', z: '下', freq: 25 },

  // ── 稀有（r）：常见但非高频 ────────────────────────────
  { id: 'k027', c: '本', k: 'ホン', m: 'book / origin', z: '书 / 本', freq: 35 },
  { id: 'k028', c: '見', k: 'ケン', m: 'to see', z: '看', freq: 36 },
  { id: 'k029', c: '行', k: 'コウ', m: 'to go', z: '行', freq: 37 },
  { id: 'k030', c: '食', k: 'ショク', m: 'to eat', z: '吃', freq: 38 },
  { id: 'k031', c: '飲', k: 'イン', m: 'to drink', z: '喝', freq: 39 },
  { id: 'k032', c: '話', k: 'ワ', m: 'talk / story', z: '话', freq: 40 },
  { id: 'k033', c: '聞', k: 'ブン', m: 'to hear / listen', z: '听', freq: 41 },
  { id: 'k034', c: '読', k: 'ドク', m: 'to read', z: '读', freq: 42 },
  { id: 'k035', c: '書', k: 'ショ', m: 'to write', z: '写', freq: 43 },
  { id: 'k036', c: '学', k: 'ガク', m: 'to study', z: '学习', freq: 44 },
  { id: 'k037', c: '校', k: 'コウ', m: 'school', z: '学校', freq: 45 },
  { id: 'k038', c: '先', k: 'セン', m: 'previous / ahead', z: '先', freq: 46 },
  { id: 'k039', c: '生', k: 'セイ', m: 'life / birth', z: '生', freq: 47 },
  { id: 'k040', c: '死', k: 'シ', m: 'death', z: '死', freq: 48 },
  { id: 'k041', c: '子', k: 'シ', m: 'child', z: '子', freq: 49 },
  { id: 'k042', c: '女', k: 'ジョ', m: 'woman', z: '女', freq: 50 },
  { id: 'k043', c: '男', k: 'ダン', m: 'man', z: '男', freq: 51 },
  { id: 'k044', c: '友', k: 'ユウ', m: 'friend', z: '友', freq: 52 },
  { id: 'k045', c: '家', k: 'カ', m: 'home / house', z: '家', freq: 53 },
  { id: 'k046', c: '車', k: 'シャ', m: 'car / vehicle', z: '车', freq: 54 },

  // ── 史诗（sr）：中低频 ────────────────────────────────
  { id: 'k047', c: '心', k: 'シン', m: 'heart', z: '心', freq: 58 },
  { id: 'k048', c: '雨', k: 'ア', m: 'rain', z: '雨', freq: 59 },
  { id: 'k049', c: '花', k: 'カ', m: 'flower', z: '花', freq: 60 },
  { id: 'k050', c: '風', k: 'フウ', m: 'wind', z: '风', freq: 61 },
  { id: 'k051', c: '空', k: 'クウ', m: 'sky / empty', z: '天空 / 空', freq: 62 },
  { id: 'k052', c: '星', k: 'セイ', m: 'star', z: '星', freq: 63 },
  { id: 'k053', c: '海', k: 'カイ', m: 'sea', z: '海', freq: 64 },
  { id: 'k054', c: '森', k: 'シン', m: 'forest', z: '森', freq: 65 },
  { id: 'k055', c: '雪', k: 'セツ', m: 'snow', z: '雪', freq: 66 },
  { id: 'k056', c: '島', k: 'トウ', m: 'island', z: '岛', freq: 67 },
  { id: 'k057', c: '川', k: 'セン', m: 'river', z: '川', freq: 68 },
  { id: 'k058', c: '光', k: 'コウ', m: 'light', z: '光', freq: 69 },
  { id: 'k059', c: '石', k: 'セキ', m: 'stone', z: '石', freq: 70 },
  { id: 'k060', c: '虫', k: 'チュウ', m: 'insect', z: '虫', freq: 71 },
  { id: 'k061', c: '鳥', k: 'チョウ', m: 'bird', z: '鸟', freq: 72 },
  { id: 'k062', c: '池', k: 'チ', m: 'pond', z: '池', freq: 73 },
  { id: 'k063', c: '林', k: 'リン', m: 'woods / grove', z: '林', freq: 74 },
  { id: 'k064', c: '岩', k: 'ガン', m: 'rock / crag', z: '岩', freq: 75 },
  { id: 'k065', c: '泉', k: 'セン', m: 'spring / fountain', z: '泉', freq: 76 },
  { id: 'k066', c: '橋', k: 'キョウ', m: 'bridge', z: '桥', freq: 77 },

  // ── 传说（ssr）：低频 ────────────────────────────────
  { id: 'k067', c: '夢', k: 'ム', m: 'dream', z: '梦', freq: 78 },
  { id: 'k068', c: '幻', k: 'ゲン', m: 'illusion / phantasm', z: '幻', freq: 78 },
  { id: 'k069', c: '詩', k: 'シ', m: 'poem', z: '诗', freq: 79 },
  { id: 'k070', c: '謎', k: 'メイ', m: 'riddle / mystery', z: '谜', freq: 80 },
  { id: 'k071', c: '魂', k: 'コン', m: 'soul', z: '魂', freq: 81 },
  { id: 'k072', c: '龍', k: 'リュウ', m: 'dragon', z: '龙', freq: 81 },
  { id: 'k073', c: '炎', k: 'エン', m: 'flame / blaze', z: '炎', freq: 82 },
  { id: 'k074', c: '雷', k: 'ライ', m: 'thunder', z: '雷', freq: 83 },
  { id: 'k075', c: '霜', k: 'ソウ', m: 'frost', z: '霜', freq: 84 },
  { id: 'k076', c: '輝', k: 'キ', m: 'radiance', z: '辉', freq: 84 },
  { id: 'k077', c: '嵐', k: 'ラン', m: 'storm', z: '暴风', freq: 85 },
  { id: 'k078', c: '霧', k: 'ム', m: 'mist / fog', z: '雾', freq: 86 },
  { id: 'k079', c: '潮', k: 'チョ', m: 'tide', z: '潮', freq: 87 },
  { id: 'k080', c: '稀', k: 'キ', m: 'rare / scarce', z: '稀', freq: 87 },
  { id: 'k081', c: '碧', k: 'ヘキ', m: 'jade green', z: '碧', freq: 88 },
  { id: 'k082', c: '蒼', k: 'ソウ', m: 'azure / blue', z: '苍', freq: 89 },
  { id: 'k083', c: '焔', k: 'エン', m: 'flame', z: '焰', freq: 90 },
  { id: 'k084', c: '藍', k: 'アイ', m: 'indigo', z: '蓝', freq: 90 },
  { id: 'k085', c: '緋', k: 'ヒ', m: 'scarlet', z: '绯', freq: 91 },
  { id: 'k086', c: '翠', k: 'スイ', m: 'kingfisher green', z: '翠', freq: 92 },

  // ── 神话（ur）：极低频 ────────────────────────────────
  { id: 'k087', c: '鱗', k: 'リン', m: 'scale', z: '鳞', freq: 93 },
  { id: 'k088', c: '纈', k: 'ケツ', m: 'cheek', z: '颊', freq: 93 },
  { id: 'k089', c: '麒', k: 'キ', m: 'qilin (mythic beast)', z: '麒', freq: 94 },
  { id: 'k090', c: '麟', k: 'リン', m: 'qilin (mythic beast)', z: '麟', freq: 94 },
  { id: 'k091', c: '翡', k: 'ヒ', m: 'jade / kingfisher', z: '翡', freq: 95 },
  { id: 'k092', c: '玲', k: 'レイ', m: 'tinkling of jade', z: '玲', freq: 95 },
  { id: 'k093', c: '瓏', k: 'ロウ', m: 'exquisite jade', z: '珑', freq: 96 },
  { id: 'k094', c: '穹', k: 'キュウ', m: 'firmament / sky', z: '穹', freq: 96 },
  { id: 'k095', c: '琉', k: 'リュウ', m: 'lapis lazuli', z: '琉', freq: 97 },
  { id: 'k096', c: '璃', k: 'リ', m: 'crystal / glass', z: '璃', freq: 97 },
  { id: 'k097', c: '幽', k: 'ユウ', m: 'secluded / faint', z: '幽', freq: 98 },
  { id: 'k098', c: '霊', k: 'レイ', m: 'spirit', z: '灵', freq: 98 },
  { id: 'k099', c: '燐', k: 'リン', m: 'phosphorescence', z: '磷', freq: 99 },
  { id: 'k100', c: '玖', k: 'キュウ', m: 'black jade', z: '玖', freq: 99 },
  { id: 'k101', c: '鸞', k: 'ラン', m: 'mythic phoenix', z: '鸾', freq: 100 },
  { id: 'k102', c: '雫', k: 'スイ', m: 'droplet', z: '滴', freq: 100 },
];

/** 按 id 建立索引，便于 O(1) 查找。 */
export const KANJI_BY_ID = Object.freeze(
  KANJI.reduce((acc, k) => {
    acc[k.id] = k;
    return acc;
  }, Object.create(null)),
);
