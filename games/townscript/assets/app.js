/**
 * 城痕 Townscript — 表现层
 *
 * 职责：SVG 渲染、输入（鼠标 / 键盘 / 触控）、音效、持久化。
 * 所有规则判定（地标规则、地块生成、升级、图鉴）都委托给 src/logic.js。
 */

import { LANDMARKS, PALETTE, VIEW } from './data.js';
import { getStrings, LANGS } from './i18n.js';
import {
  ACHIEVEMENTS,
  applyEvent,
  applyUpgrade,
  buildIncome,
  createDailyTown,
  createProfile,
  createTown,
  decodeTown,
  dexProgress,
  encodeTown,
  findHint,
  hitTest,
  milestoneState,
  paletteSize,
  blockRect,
  blockStyle,
  placeBlock,
  removeBlock,
  serializeProfile,
  tallestBlock,
  builtCells,
  upgradeCost,
  deserializeProfile,
  countLandmarks,
} from '../src/logic.js';

const STORAGE_KEY = 'townscript-profile-v1';
const TOWN_KEY = 'townscript-town-v1';
const LANG_KEY = 'townscript-lang';

const el = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';

const dom = {
  subtitle: el('game-subtitle'),
  svg: el('town-svg'),
  palette: el('palette'),
  buildMode: el('build-mode'),
  demolishMode: el('demolish-mode'),
  modeToggle: el('mode-toggle'),
  modeHint: el('mode-hint'),
  codeField: el('code-field'),
  copyBtn: el('copy-btn'),
  clearBtn: el('clear-btn'),
  loadBtn: el('load-btn'),
  statCoins: el('stat-coins'),
  statBlocks: el('stat-blocks'),
  statHeight: el('stat-height'),
  statFound: el('stat-found'),
  shop: el('shop'),
  dex: el('dex'),
  dexMeta: el('dex-meta'),
  achievements: el('achievements'),
  recCoins: el('rec-coins'),
  recBlocks: el('rec-blocks'),
  recHeight: el('rec-height'),
  recFound: el('rec-found'),
  resetBtn: el('reset-btn'),
  toast: el('toast'),
  langSwitch: el('lang-switch'),
};

let profile = deserializeProfile(readStorage(STORAGE_KEY));
let lang = detectLang();
let town = createTown(pickSeed(), profile.upgrades.expand);
let currentColor = 0;
let demolishMode = false;
let dailyMode = false;
let hintCell = null;
let toastTimer = null;
let audioCtx = null;
let sfxGain = null;
const lastPlayed = new Map();

/* ── 存储 ─────────────────────────────────────────── */

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 隐私模式下写入失败可忽略，不影响游玩 */
  }
}

function detectLang() {
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved && LANGS.includes(saved)) return saved;
  } catch {
    /* 忽略：读取失败就用浏览器语言 */
  }
  const nav = (navigator.language || 'zh').toLowerCase();
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('zh')) return 'zh';
  return 'en';
}

function todayKey() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

function pickSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/* ── 音效（WebAudio 合成，无外部素材） ─────────────── */

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
    const master = audioCtx.createGain();
    master.gain.value = 0.45;
    master.connect(audioCtx.destination);
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(master);
  } catch {
    return null;
  }
  return audioCtx;
}

function tone(freq, duration, type = 'sine', gain = 0.06, delay = 0, detune = 0) {
  const ctx = ensureAudio();
  if (!ctx || !sfxGain) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq * (1 + detune), ctx.currentTime + delay);
  amp.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
  amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + delay + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
  osc.connect(amp).connect(sfxGain);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration + 0.02);
}

function playThrottled(key, fn) {
  const now = performance.now();
  if (now - (lastPlayed.get(key) || 0) < 30) return;
  lastPlayed.set(key, now);
  fn();
}

function playBuildSound(height) {
  playThrottled('build', () => tone(180 + height * 40, 0.09, 'triangle', 0.05, 0, (Math.random() - 0.5) * 0.08));
}

function playDemolishSound() {
  playThrottled('remove', () => tone(120, 0.12, 'sawtooth', 0.035, 0, (Math.random() - 0.5) * 0.1));
}

function playDiscoverySound() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.06, i * 0.075));
}

/* ── 渲染 ─────────────────────────────────────────── */

/** 按深度把海水混成颜色。 */
function seaColor(depth) {
  const deep = [12, 38, 55];
  const shallow = [32, 96, 120];
  const t = Math.max(0, Math.min(1, depth));
  const mix = deep.map((v, i) => Math.round(v + (shallow[i] - v) * t));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

/** 顶部的装饰图形：让「上下文规则」在画面上看得见。 */
function decoration(style, c, r, h, color) {
  const top = blockRect(c, r, h - 1);
  const cx = top.x + top.w / 2;
  const cy = top.y + top.h / 2;
  switch (style) {
    case 'spire':
      return `<path d="M${cx - 6} ${top.y} L${cx} ${top.y - 11} L${cx + 6} ${top.y} Z" fill="${color.roof}"/>`;
    case 'lighthouse':
      return `<circle cx="${cx}" cy="${top.y - 4}" r="3.4" fill="#ffe9a8"/><rect x="${top.x}" y="${top.y + 7}" width="${top.w}" height="4" fill="${color.roof}" opacity="0.8"/>`;
    case 'tower':
      return `<rect x="${top.x + 2}" y="${top.y + 2}" width="${top.w - 4}" height="3" fill="${color.roof}" opacity="0.85"/>`;
    case 'arch':
      return `<path d="M${top.x + 5} ${top.y + top.h - 3} L${top.x + 5} ${top.y + 8} Q${cx} ${top.y - 1} ${top.x + top.w - 5} ${top.y + 8} L${top.x + top.w - 5} ${top.y + top.h - 3} Z" fill="#0d1620" opacity="0.45"/>`;
    case 'stair':
      return `<rect x="${cx - 3}" y="${top.y + 4}" width="${top.w - 10}" height="${top.h - 8}" fill="${color.roof}" opacity="0.75"/>`;
    case 'plaza':
      return `<rect x="${top.x + 5}" y="${top.y + 5}" width="${top.w - 10}" height="${top.h - 10}" fill="#ffffff" opacity="0.28"/>`;
    case 'courtyard':
      return `<rect x="${top.x + 2}" y="${top.y + 2}" width="${top.w - 4}" height="${top.h - 4}" fill="#4f9d5c" opacity="0.75" rx="3"/>`;
    case 'harbor':
      return `<rect x="${top.x - 5}" y="${top.y + 9}" width="10" height="6" fill="#8a6a44"/>`;
    case 'foundation':
      return `<rect x="${top.x}" y="${top.y}" width="${top.w}" height="${top.h}" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="3 2" opacity="0.55"/>`;
    default:
      return '';
  }
}

function renderTown() {
  const s = getStrings(lang);
  const { cols, rows } = town;
  const parts = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const depth = town.depth[r * cols + c];
      parts.push(`<rect class="water-cell" x="${c * VIEW.cell}" y="${r * VIEW.cell}" width="${VIEW.cell}" height="${VIEW.cell}" fill="${seaColor(depth)}"/>`);
    }
  }

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const key = r * cols + c;
      const h = town.heights[key];
      if (h === 0) continue;
      const color = PALETTE[town.colors[key]] || PALETTE[0];
      const style = blockStyle(town, c, r);
      for (let k = 0; k < h; k += 1) {
        const rect = blockRect(c, r, k);
        const isTop = k === h - 1;
        const fill = isTop && (style === 'house' || style === 'tower') ? color.roof : color.fill;
        parts.push(`<rect class="block" x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="${fill}"/>`);
      }
      parts.push(decoration(style, c, r, h, color));
    }
  }

  for (const vein of town.veins) {
    const rect = blockRect(vein.c, vein.r, 0);
    parts.push(`<circle class="vein-mark" cx="${rect.x + rect.w / 2}" cy="${rect.y + rect.h / 2}" r="7"><title>${s.vein_hint}</title></circle>`);
  }

  if (hintCell) {
    const rect = blockRect(hintCell.c, hintCell.r, 0);
    parts.push(`<rect class="hint-mark" x="${rect.x + 3}" y="${rect.y + 3}" width="${rect.w - 6}" height="${rect.h - 6}" rx="4"><title>${s.landmark_hint}</title></rect>`);
  }

  dom.svg.setAttribute('viewBox', `${-VIEW.cell} ${-VIEW.cell} ${cols * VIEW.cell + VIEW.cell} ${rows * VIEW.cell + VIEW.cell}`);
  dom.svg.innerHTML = parts.join('');
  // 城镇代码必须跟着城一起变：建造走的是局部渲染，不经过 renderAll
  dom.codeField.value = encodeTown(town);
}

function renderStatic() {
  const s = getStrings(lang);
  dom.subtitle.textContent = s.subtitle;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (s[key]) node.textContent = s[key];
  });
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja' : 'en';
  dom.langSwitch.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.lang === lang);
  });
}

function renderPalette() {
  const size = paletteSize(profile);
  dom.palette.innerHTML = '';
  dom.palette.setAttribute('aria-label', getStrings(lang).palette);
  for (const color of PALETTE) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = color.id < size ? 'swatch' : 'swatch is-locked';
    btn.style.background = color.fill;
    btn.title = `${color.zh} · ${color.en}`;
    btn.setAttribute('aria-label', `${s_label(color)}`);
    btn.disabled = color.id >= size;
    if (color.id === currentColor && color.id < size) btn.classList.add('is-active');
    btn.addEventListener('click', () => {
      if (color.id >= size) return;
      currentColor = color.id;
      renderPalette();
    });
    dom.palette.append(btn);
  }
}

function s_label(color) {
  if (lang === 'en') return color.en;
  if (lang === 'ja') return color.ja;
  return color.zh;
}

function renderHud() {
  const counts = countLandmarks(town);
  let found = 0;
  for (const id of Object.keys(counts)) if (profile.dex[id] && profile.dex[id].count > 0) found += 1;
  dom.statCoins.textContent = String(profile.coins);
  dom.statBlocks.textContent = String(builtCells(town));
  dom.statHeight.textContent = String(tallestBlock(town));
  dom.statFound.textContent = `${found}/${LANDMARKS.length}`;
}

function renderShop() {
  const s = getStrings(lang);
  dom.shop.innerHTML = '';
  for (const kind of ['expand', 'palette', 'survey', 'income']) {
    const level = profile.upgrades[kind] || 0;
    const maxed = level >= (kind === 'expand' ? 3 : kind === 'palette' ? 4 : kind === 'survey' ? 3 : 6);
    const cost = upgradeCost(kind, level);

    const item = document.createElement('div');
    item.className = 'shop-item';

    const head = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'shop-name';
    name.textContent = s[`upgrade_${kind}`];
    const lv = document.createElement('span');
    lv.className = 'shop-lv';
    lv.textContent = `Lv.${level}`;
    head.append(name, lv);

    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = maxed ? 'shop-buy is-max' : 'shop-buy';
    buy.dataset.upgrade = kind;
    buy.disabled = maxed || profile.coins < cost;
    buy.textContent = maxed ? s.max_level : `${s.buy} · ${cost}`;

    const desc = document.createElement('p');
    desc.className = 'shop-desc';
    desc.textContent = s[`upgrade_${kind}_desc`];

    item.append(head, buy, desc);
    dom.shop.append(item);
  }
}

function renderDex() {
  const s = getStrings(lang);
  dom.dex.innerHTML = '';
  for (const lm of LANDMARKS) {
    const record = profile.dex[lm.id] || { count: 0, firstAt: null };
    const miles = milestoneState(profile, lm.id);
    const item = document.createElement('div');
    item.className = record.count > 0 ? 'dex-item' : 'dex-item is-locked';
    item.dataset.landmark = lm.id;
    item.dataset.count = String(record.count);

    const icon = document.createElement('span');
    icon.className = 'dex-icon';
    icon.textContent = record.count > 0 ? lm.icon : '?';

    const body = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'dex-name';
    name.textContent = record.count > 0 ? (lang === 'en' ? lm.en : lang === 'ja' ? lm.ja : lm.zh) : '?';
    const count = document.createElement('p');
    count.className = 'dex-count';
    count.textContent = record.count > 0 ? `×${record.count}` : '—';
    const mileRow = document.createElement('div');
    mileRow.className = 'dex-miles';
    for (const m of Object.keys(s.milestone)) {
      const chip = document.createElement('span');
      chip.className = miles[m] ? 'mile on' : 'mile';
      chip.textContent = s.milestone[m];
      mileRow.append(chip);
    }
    body.append(name, count, mileRow);
    item.append(icon, body);
    dom.dex.append(item);
  }
  const progress = dexProgress(profile);
  const empty = profile.stats.discovered === 0;
  dom.dexMeta.textContent = empty ? getStrings(lang).dex_empty : `${progress.done}/${progress.total}`;
}

function renderAchievements() {
  dom.achievements.innerHTML = '';
  for (const ach of ACHIEVEMENTS) {
    const unlocked = !!profile.achievements[ach.id];
    const li = document.createElement('li');
    li.className = unlocked ? 'is-unlocked' : '';
    li.dataset.ach = ach.id;
    const icon = document.createElement('span');
    icon.className = 'ach-icon';
    icon.textContent = ach.icon;
    const name = document.createElement('span');
    name.className = 'ach-name';
    name.textContent = lang === 'en' ? ach.en : lang === 'ja' ? ach.ja : ach.zh;
    const check = document.createElement('span');
    check.className = 'ach-check';
    check.textContent = unlocked ? '✓' : '—';
    li.append(icon, name, check);
    dom.achievements.append(li);
  }
}

function renderRecords() {
  dom.recCoins.textContent = String(profile.totalEarned);
  dom.recBlocks.textContent = String(profile.stats.builds);
  dom.recHeight.textContent = String(profile.stats.bestHeight);
  dom.recFound.textContent = `${profile.stats.discovered}/${LANDMARKS.length}`;
}

function renderModeHint() {
  const s = getStrings(lang);
  const source = dailyMode ? s.daily_hint : s.free_hint;
  dom.modeHint.textContent = demolishMode ? `${s.demolish} · ${s.controls_hint}` : `${source} · ${s.controls_hint}`;
  dom.buildMode.classList.toggle('is-active', !demolishMode);
  dom.demolishMode.classList.toggle('is-active', demolishMode);
  dom.buildMode.setAttribute('aria-pressed', String(!demolishMode));
  dom.demolishMode.setAttribute('aria-pressed', String(demolishMode));
  dom.modeToggle.setAttribute('aria-pressed', String(dailyMode));
  dom.modeToggle.firstElementChild.textContent = dailyMode ? s.daily : s.free;
}

function renderAll() {
  renderStatic();
  renderPalette();
  renderHud();
  renderShop();
  renderDex();
  renderAchievements();
  renderRecords();
  renderModeHint();
  renderTown();
}

/* ── 提示 ─────────────────────────────────────────── */

function showToast(text) {
  if (!text) return;
  dom.toast.textContent = text;
  dom.toast.hidden = false;
  dom.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove('is-visible');
    setTimeout(() => {
      dom.toast.hidden = true;
    }, 250);
  }, 1900);
}

function announce(applied) {
  const s = getStrings(lang);
  if (applied.milestones.length > 0) {
    const m = applied.milestones[0];
    const lm = LANDMARKS.find((x) => x.id === m.landmarkId);
    const label = lm ? (lang === 'en' ? lm.en : lang === 'ja' ? lm.ja : lm.zh) : m.landmarkId;
    showToast(`${s.toast_build}：${label}`);
    playDiscoverySound();
  } else if (applied.unlocked.length > 0) {
    const ach = applied.unlocked[0];
    showToast(lang === 'en' ? ach.en : lang === 'ja' ? ach.ja : ach.zh);
  }
}

/* ── 交互 ─────────────────────────────────────────── */

function updateHint() {
  if ((profile.upgrades.survey || 0) <= 0) {
    hintCell = null;
    return;
  }
  const known = LANDMARKS.filter((lm) => (profile.dex[lm.id]?.count || 0) > 0).map((lm) => lm.id);
  hintCell = findHint(town, known);
}

function doBuild(c, r) {
  const before = countLandmarks(town);
  const result = placeBlock(town, c, r, currentColor);
  if (!result.ok || !result.changed) return;
  const after = countLandmarks(town);

  const fresh = result.landmarks.filter((id) => (before[id] || 0) < (after[id] || 0));
  const income = buildIncome(profile) * (result.vein ? 3 : 1);
  const height = town.heights[r * town.cols + c];
  const applied = applyEvent(profile, {
    type: 'build',
    landmarks: fresh,
    coins: income + fresh.length * 12,
    vein: result.vein,
    height,
  });
  profile = applied.profile;
  saveAll();
  playBuildSound(height);
  updateHint();
  renderHud();
  renderShop();
  renderDex();
  renderAchievements();
  renderRecords();
  renderTown();
  announce(applied);
}

function doRemove(c, r) {
  const before = countLandmarks(town);
  const result = removeBlock(town, c, r);
  if (!result.ok || !result.changed) return;
  const after = countLandmarks(town);
  const fresh = result.landmarks.filter((id) => (before[id] || 0) < (after[id] || 0));
  const applied = applyEvent(profile, { type: 'remove', landmarks: fresh, coins: 0 });
  profile = applied.profile;
  saveAll();
  playDemolishSound();
  updateHint();
  renderHud();
  renderDex();
  renderRecords();
  renderTown();
}

function saveAll() {
  writeStorage(STORAGE_KEY, serializeProfile(profile));
  writeStorage(TOWN_KEY, encodeTown(town));
}

/** 把点击坐标换算成世界坐标，再做命中检测。 */
function pickCell(event) {
  const rect = dom.svg.getBoundingClientRect();
  const view = dom.svg.viewBox.baseVal;
  const scale = view.width / rect.width;
  const px = (event.clientX - rect.left) * scale + view.x;
  const py = (event.clientY - rect.top) * scale + view.y;
  return hitTest(town, px, py);
}

dom.svg.addEventListener('pointerdown', (event) => {
  // 右键 / 中键交给 contextmenu 与平移，这里只处理主键
  if (event.button !== 0) return;
  event.preventDefault();
  ensureAudio();
  const hit = pickCell(event);
  if (!hit) return;
  if (demolishMode) doRemove(hit.c, hit.r);
  else doBuild(hit.c, hit.r);
});

dom.svg.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  const hit = pickCell(event);
  if (!hit) return;
  doRemove(hit.c, hit.r);
});

dom.buildMode.addEventListener('click', () => {
  demolishMode = false;
  renderModeHint();
});

dom.demolishMode.addEventListener('click', () => {
  demolishMode = true;
  renderModeHint();
});

dom.modeToggle.addEventListener('click', () => {
  dailyMode = !dailyMode;
  town = dailyMode
    ? createDailyTown(todayKey(), profile.upgrades.expand)
    : createTown(pickSeed(), profile.upgrades.expand);
  updateHint();
  renderModeHint();
  renderAll();
  saveAll();
});

dom.clearBtn.addEventListener('click', () => {
  town = dailyMode
    ? createDailyTown(todayKey(), profile.upgrades.expand)
    : createTown(pickSeed(), profile.upgrades.expand);
  updateHint();
  renderAll();
  saveAll();
});

dom.copyBtn.addEventListener('click', async () => {
  const code = encodeTown(town);
  dom.codeField.value = code;
  dom.codeField.select();
  try {
    await navigator.clipboard.writeText(code);
    showToast(getStrings(lang).code_copied);
  } catch {
    showToast(getStrings(lang).code_hint);
  }
});

dom.loadBtn.addEventListener('click', () => {
  const code = (dom.codeField.value || '').trim();
  const loaded = decodeTown(code);
  if (!loaded) {
    showToast(getStrings(lang).code_hint);
    return;
  }
  town = loaded;
  updateHint();
  renderAll();
  saveAll();
});

dom.shop.addEventListener('click', (event) => {
  const btn = event.target.closest('.shop-buy');
  if (!btn || btn.disabled) return;
  const kind = btn.dataset.upgrade;
  const result = applyUpgrade(profile, kind);
  if (!result) {
    showToast(getStrings(lang).toast_poor);
    return;
  }
  profile = result.profile;
  if (kind === 'expand') {
    // 拓地要把旧城搬进更大的海图
    const old = town;
    const next = createTown(old.seed, profile.upgrades.expand);
    for (let r = 0; r < Math.min(old.rows, next.rows); r += 1) {
      for (let c = 0; c < Math.min(old.cols, next.cols); c += 1) {
        next.heights[r * next.cols + c] = old.heights[r * old.cols + c];
        next.colors[r * next.cols + c] = old.colors[r * old.cols + c];
      }
    }
    next.builds = old.builds;
    next.removals = old.removals;
    town = next;
  }
  saveAll();
  updateHint();
  renderAll();
  showToast(getStrings(lang).toast_buy);
  announce(result);
});

dom.resetBtn.addEventListener('click', () => {
  if (!window.confirm(getStrings(lang).reset_confirm)) return;
  profile = createProfile();
  writeStorage(STORAGE_KEY, serializeProfile(profile));
  town = createTown(pickSeed(), profile.upgrades.expand);
  currentColor = 0;
  updateHint();
  renderAll();
  saveAll();
});

dom.langSwitch.addEventListener('click', (event) => {
  const btn = event.target.closest('.lang-btn');
  if (!btn) return;
  lang = btn.dataset.lang;
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* 忽略：写入失败不影响切换 */
  }
  renderAll();
});

/* 键盘：数字键换色，X 切换拆除 */
document.addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (event.key >= '1' && event.key <= '9') {
    const index = Number(event.key) - 1;
    if (index < paletteSize(profile)) {
      currentColor = index;
      renderPalette();
    }
    event.preventDefault();
  } else if (event.key === 'x' || event.key === 'X') {
    demolishMode = !demolishMode;
    renderModeHint();
  }
});

/* ── 启动 ─────────────────────────────────────────── */

const savedTown = readStorage(TOWN_KEY);
if (savedTown) {
  const decoded = decodeTown(savedTown);
  if (decoded) town = decoded;
}
updateHint();
renderAll();
