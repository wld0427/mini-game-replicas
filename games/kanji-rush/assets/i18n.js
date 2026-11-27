/** 多语言文案（zh / en / ja） */

export const STRINGS = {
  zh: {
    subtitle: '按使用频次决定稀有度 · 越抽越快',
    reset: '重置进度',
    pull: '抽取',
    auto: '自动',
    hint: '空格键抽取 · A 切换自动',
    stat_pulls: '抽取',
    stat_unique: '收集',
    stat_pity: '保底',
    stat_combo: '连击',
    stat_tempo: '间隔',
    collection: '图鉴',
    achievements: '成就',
    log: '最近抽取',
    footer: '原创实现 · 玩法致敬汉字扭蛋类网页小游戏',
    new_badge: 'NEW',
    surge: '加速中',
    pity_toast: '保底触发！',
    ach_toast: '成就解锁',
    tier: { n: '普通', r: '稀有', sr: '史诗', ssr: '传说', ur: '神话' },
    reset_confirm: '确定要清空全部进度吗？',
    owned: '已收集',
    locked: '未解锁',
  },
  en: {
    subtitle: 'Rarity by real-world usage · the faster you pull, the faster it goes',
    reset: 'Reset',
    pull: 'PULL',
    auto: 'Auto',
    hint: 'Space to pull · A toggles auto',
    stat_pulls: 'Pulls',
    stat_unique: 'Dex',
    stat_pity: 'Pity',
    stat_combo: 'Combo',
    stat_tempo: 'Tempo',
    collection: 'Collection',
    achievements: 'Achievements',
    log: 'Recent pulls',
    footer: 'Original implementation · inspired by kanji gacha mini-games',
    new_badge: 'NEW',
    surge: 'Boosted',
    pity_toast: 'Pity triggered!',
    ach_toast: 'Achievement unlocked',
    tier: { n: 'Common', r: 'Rare', sr: 'Epic', ssr: 'Legendary', ur: 'Mythic' },
    reset_confirm: 'Clear all progress?',
    owned: 'Owned',
    locked: 'Locked',
  },
  ja: {
    subtitle: '使用頻度でレア度が決まる · 回すほど速くなる',
    reset: 'リセット',
    pull: '引く',
    auto: 'オート',
    hint: 'スペースで抽選 · A でオート切替',
    stat_pulls: '抽選数',
    stat_unique: '収集',
    stat_pity: '天井',
    stat_combo: 'コンボ',
    stat_tempo: '間隔',
    collection: '図鑑',
    achievements: '実績',
    log: '最近の抽選',
    footer: 'オリジナル実装 · 漢字ガチャ系小游戏へのオマージュ',
    new_badge: 'NEW',
    surge: '加速中',
    pity_toast: '天井発動！',
    ach_toast: '実績解除',
    tier: { n: 'コモン', r: 'レア', sr: 'エピック', ssr: 'レジェンド', ur: 'ミシック' },
    reset_confirm: 'すべての進捗を消しますか？',
    owned: '収集済み',
    locked: '未入手',
  },
};

export const LANGS = ['zh', 'en', 'ja'];

/**
 * 取指定语言的文案，缺失时回退到中文。
 * @param {string} lang
 */
export function getStrings(lang) {
  return STRINGS[lang] || STRINGS.zh;
}
