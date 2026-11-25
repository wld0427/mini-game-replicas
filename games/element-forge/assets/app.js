/**
 * 元素熔炉 Element Forge — 表现层
 *
 * 职责：DOM 渲染、交互、音效、持久化。所有规则计算都委托给 src/logic.js（纯函数、可单测）。
 */

import { BASE_IDS, ELEMENTS } from './data.js';
import { getStrings, LANGS } from './i18n.js';
import {
  ACHIEVEMENTS,
  TIER_IDS,
  applyDailyDraw,
  applyFusion,
  computeStats,
  createState,
  describeElement,
  deserializeState,
  serializeState,
} from '../src/logic.js';

const STORAGE_KEY = 'element-forge-state-v1';
const LANG_KEY = 'element-forge-lang';

const el = (id) => document.getElementById(id);

const dom = {
  subtitle: el('game-subtitle'),
  slotA: el('slot-a'),
  slotB: el('slot-b'),
  slotAGlyph: el('slot-a-glyph'),
  slotBName: el('slot-b-name'),
  slotAName: el('slot-a-name'),
  slotATier: el('slot-a-tier'),
  slotBTier: el('slot-b-tier'),
  slotBGlyph: el('slot-b-glyph'),
  fuseBtn: el('fuse-btn'),
  clearBtn: el('clear-btn'),
  hint: el('hint'),
  resultCard: el('result-card'),
  resultGlyph: el('result-glyph'),
  resultName: el('result-name'),
  resultTier: el('result-tier'),
  resultNew: el('result-new'),
  resultImprov: el('result-improv'),
  resultFormula: el('result-formula'),
  statDex: el('stat-dex'),
  statFusions: el('stat-fusions'),
  statDepth: el('stat-depth'),
  statImprovised: el('stat-improvised'),
  legend: el('tier-legend'),
  collection: el('collection'),
  collectionMeta: el('collection-meta'),
  search: el('search'),
  dailyBtn: el('daily-btn'),
  dailyLeft: el('daily-left'),
  dailyPity: el('daily-pity'),
  dailyHint: el('daily-hint'),
  achievements: el('achievements'),
  recipes: el('recipes'),
  recipesEmpty: el('recipes-empty'),
  resetBtn: el('reset-btn'),
  toast: el('toast'),
  langSwitch: el('lang-switch'),
};

let state = deserializeState(readStorage());
let lang = detectLang();
let slots = [null, null];
let lastResult = null;
let query = '';
let toastTimer = null;
let audioCtx = null;

/* ── 存储 ─────────────────────────────────────────── */

function readStorage() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeState(state));
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

/* ── 音效（WebAudio 合成，无外部素材） ─────────────── */

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    /* 浏览器不支持音频时静默降级，不影响游玩 */
    return null;
  }
  return audioCtx;
}

function tone(freq, duration, type = 'sine', gain = 0.08, delay = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
  amp.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
  amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + delay + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration + 0.02);
}

function noiseBurst(duration, gain, delay = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1800, ctx.currentTime + delay);
  filter.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + delay + duration);
  amp.gain.setValueAtTime(gain, ctx.currentTime + delay);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
  src.buffer = buffer;
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start(ctx.currentTime + delay);
}

function playSelectSound() {
  tone(660, 0.07, 'sine', 0.05);
}

function playFuseSound(tier) {
  noiseBurst(0.34, 0.14);
  tone(110, 0.3, 'sine', 0.1);
  const notes = { n: [], r: [523], sr: [523, 659], ssr: [523, 659, 784], ur: [523, 659, 784, 1047] };
  const list = notes[tier] || [];
  list.forEach((f, i) => tone(f, 0.3, 'triangle', 0.075, 0.12 + i * 0.07));
}

function playDailySound(tier) {
  tone(320, 0.5, 'sawtooth', 0.045, 0);
  tone(480, 0.4, 'sawtooth', 0.04, 0.12);
  const list = tier === 'ur' ? [523, 659, 784, 1047, 1319] : tier === 'ssr' ? [523, 659, 784] : [523, 659];
  list.forEach((f, i) => tone(f, 0.32, 'triangle', 0.08, 0.3 + i * 0.075));
}

/* ── 渲染 ─────────────────────────────────────────── */

function renderStatic() {
  const s = getStrings(lang);
  dom.subtitle.textContent = s.subtitle;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (s[key]) node.textContent = s[key];
  });
  document.querySelectorAll('[data-i18n-attr]').forEach((node) => {
    const spec = node.getAttribute('data-i18n-attr');
    for (const pair of spec.split(',')) {
      const [attr, key] = pair.split(':').map((part) => part.trim());
      if (s[key]) node.setAttribute(attr, s[key]);
    }
  });
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja' : 'en';
  dom.langSwitch.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.lang === lang);
  });
}

function renderLegend() {
  const s = getStrings(lang);
  dom.legend.innerHTML = '';
  for (const id of TIER_IDS) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.setProperty('--dot', `var(--tier-${id})`);
    const label = document.createElement('span');
    label.textContent = s.tier[id];
    item.append(dot, label);
    dom.legend.append(item);
  }
}

function renderSlots() {
  const s = getStrings(lang);
  const pairs = [
    { node: dom.slotA, glyph: dom.slotAGlyph, name: dom.slotAName, tier: dom.slotATier, id: slots[0] },
    { node: dom.slotB, glyph: dom.slotBGlyph, name: dom.slotBName, tier: dom.slotBTier, id: slots[1] },
  ];
  for (const slot of pairs) {
    if (!slot.id) {
      slot.node.classList.remove('is-filled');
      slot.node.style.removeProperty('--tier');
      slot.glyph.textContent = '+';
      slot.name.textContent = s.empty;
      slot.tier.textContent = '';
      continue;
    }
    const info = describeElement(slot.id, state, lang);
    if (!info) continue;
    slot.node.classList.add('is-filled');
    slot.node.style.setProperty('--tier', `var(--tier-${info.tier})`);
    slot.glyph.textContent = info.glyph;
    slot.name.textContent = info.name;
    slot.tier.textContent = s.tier[info.tier];
  }
  dom.fuseBtn.disabled = !(slots[0] && slots[1]);
}

function renderResult() {
  const s = getStrings(lang);
  if (!lastResult) {
    dom.resultCard.hidden = true;
    dom.resultCard.classList.remove('is-fresh', 'is-clickable');
    return;
  }
  const info = describeElement(lastResult.id, state, lang);
  if (!info) {
    dom.resultCard.hidden = true;
    return;
  }
  dom.resultCard.hidden = false;
  dom.resultCard.dataset.tier = info.tier;
  dom.resultCard.style.setProperty('--tier', `var(--tier-${info.tier})`);
  dom.resultGlyph.textContent = info.glyph;
  dom.resultName.textContent = info.name;
  dom.resultTier.textContent = s.tier[info.tier];
  dom.resultNew.hidden = !lastResult.isNew;
  dom.resultNew.textContent = s.new_badge;
  dom.resultImprov.hidden = !info.improvised;
  dom.resultImprov.textContent = s.improvised_badge;

  const [a, b] = lastResult.inputs;
  const left = describeElement(a, state, lang);
  const right = describeElement(b, state, lang);
  const leftName = left ? left.name : a;
  const rightName = right ? right.name : b;
  dom.resultFormula.textContent = `${s.formula}: ${leftName} + ${rightName} = ${info.name}`;

  dom.resultCard.classList.remove('is-fresh');
  void dom.resultCard.offsetWidth;
  dom.resultCard.classList.add('is-fresh', 'is-clickable');
}

function renderStats() {
  const stats = computeStats(state);
  dom.statDex.textContent = `${stats.distinct}/${Object.keys(ELEMENTS).length}`;
  dom.statFusions.textContent = String(stats.fusions);
  dom.statDepth.textContent = String(stats.maxGen);
  dom.statImprovised.textContent = String(stats.improvised);
}

function renderCollection() {
  const s = getStrings(lang);
  dom.collection.innerHTML = '';
  const q = query.trim().toLowerCase();

  const canonical = Object.values(ELEMENTS);
  let shown = 0;

  for (const element of canonical) {
    const owned = state.collection[element.id];
    if (q) {
      if (!owned) continue;
      const name = describeElement(element.id, state, lang).name.toLowerCase();
      if (!name.includes(q)) continue;
    }
    shown += 1;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = owned ? 'chip' : 'chip is-locked';
    chip.dataset.element = element.id;
    chip.dataset.tier = element.tier;
    chip.style.setProperty('--tier', `var(--tier-${element.tier})`);
    chip.disabled = !owned;
    const glyph = document.createElement('span');
    glyph.className = 'chip-glyph';
    glyph.textContent = owned ? element.glyph : '?';
    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = owned ? describeElement(element.id, state, lang).name : '?';
    chip.append(glyph, name);
    if (owned && owned.count > 1) {
      const count = document.createElement('span');
      count.className = 'chip-count';
      count.textContent = `×${owned.count}`;
      chip.append(count);
    }
    if (slots.includes(element.id)) chip.classList.add('is-selected');
    chip.title = owned ? `${describeElement(element.id, state, lang).name} — ${s.owned}` : s.locked;
    dom.collection.append(chip);
  }

  // 原创合成的词条没有固定位置，统一排在正式图鉴之后
  const improvised = Object.keys(state.collection)
    .filter((id) => state.collection[id].improvised)
    .sort((a, b) => (state.collection[b].gen || 0) - (state.collection[a].gen || 0));

  for (const id of improvised) {
    const info = describeElement(id, state, lang);
    if (q && !info.name.toLowerCase().includes(q)) continue;
    shown += 1;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.element = id;
    chip.dataset.tier = info.tier;
    chip.style.setProperty('--tier', `var(--tier-${info.tier})`);
    const glyph = document.createElement('span');
    glyph.className = 'chip-glyph';
    glyph.textContent = info.glyph;
    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = info.name;
    chip.append(glyph, name);
    const count = document.createElement('span');
    count.className = 'chip-count';
    count.textContent = `×${state.collection[id].count || 1}`;
    chip.append(count);
    if (slots.includes(id)) chip.classList.add('is-selected');
    chip.title = `${info.name} — ${s.improvised_badge}`;
    dom.collection.append(chip);
  }

  if (shown === 0) {
    const empty = document.createElement('p');
    empty.className = 'collection-empty';
    empty.textContent = q ? s.empty_collection : s.empty_collection;
    dom.collection.append(empty);
  }

  const stats = computeStats(state);
  dom.collectionMeta.textContent = `${stats.distinct}/${Object.keys(ELEMENTS).length} · ${s.stat_fusions} ${stats.fusions}`;
}

function renderDaily() {
  const s = getStrings(lang);
  const stats = computeStats(state);
  dom.dailyLeft.textContent = String(stats.dailyLeft);
  dom.dailyPity.textContent = `${stats.pity}/${stats.pityLimit}`;
  const usedUp = stats.dailyLeft <= 0;
  dom.dailyBtn.disabled = usedUp;
  dom.dailyHint.textContent = usedUp ? s.daily_done : s.daily_reset;
}

function renderAchievements() {
  const s = getStrings(lang);
  dom.achievements.innerHTML = '';
  for (const ach of ACHIEVEMENTS) {
    const unlocked = !!state.achievements[ach.id];
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
  void s;
}

function renderRecipes() {
  const s = getStrings(lang);
  dom.recipes.innerHTML = '';
  const entries = Object.entries(state.recipes);
  dom.recipesEmpty.hidden = entries.length > 0;
  for (const [key, outId] of entries.slice(-40).reverse()) {
    const parts = key.split('+');
    const out = describeElement(outId, state, lang);
    if (!out || parts.length !== 2) continue;
    const left = describeElement(parts[0], state, lang);
    const right = describeElement(parts[1], state, lang);
    const li = document.createElement('li');
    li.style.setProperty('--tier', `var(--tier-${out.tier})`);
    const input = document.createElement('span');
    input.textContent = `${left ? left.name : parts[0]} + ${right ? right.name : parts[1]}`;
    const arrow = document.createElement('span');
    arrow.className = 'recipe-arrow';
    arrow.textContent = '→';
    const result = document.createElement('span');
    result.className = 'recipe-out';
    result.textContent = out.name;
    li.append(input, arrow, result);
    dom.recipes.append(li);
  }
  void s;
}

function renderAll() {
  renderStatic();
  renderLegend();
  renderSlots();
  renderResult();
  renderStats();
  renderCollection();
  renderDaily();
  renderAchievements();
  renderRecipes();
}

/* ── 交互 ─────────────────────────────────────────── */

function showToast(text) {
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

function loadSlot(id) {
  if (!id) return;
  if (slots[0] === null) {
    slots[0] = id;
  } else if (slots[1] === null) {
    slots[1] = id;
  } else {
    slots = [id, null];
  }
  playSelectSound();
  renderSlots();
  renderCollection();
}

function clearForge() {
  slots = [null, null];
  renderSlots();
  renderCollection();
}

function doFusion() {
  if (!slots[0] || !slots[1]) return;
  const a = slots[0];
  const b = slots[1];
  const { state: next, result } = applyFusion(state, a, b);
  state = next;
  lastResult = result;
  slots = [null, null];
  saveState();
  renderSlots();
  renderResult();
  renderStats();
  renderCollection();
  renderDaily();
  renderAchievements();
  renderRecipes();
  playFuseSound(result.tier);

  const s = getStrings(lang);
  if (result.unlocked.length > 0) {
    const ach = result.unlocked[0];
    const name = lang === 'en' ? ach.en : lang === 'ja' ? ach.ja : ach.zh;
    showToast(`${s.ach_toast}: ${name}`);
  }
}

function doDailyDraw() {
  const { state: next, result } = applyDailyDraw(state, todayKey());
  state = next;
  saveState();
  renderStats();
  renderCollection();
  renderDaily();
  renderAchievements();

  const s = getStrings(lang);
  if (result.limited) {
    showToast(s.daily_done);
    return;
  }
  lastResult = {
    id: result.id,
    isNew: result.isNew,
    inputs: [],
  };
  renderResult();
  playDailySound(result.tier);
  if (result.pity) {
    showToast(s.pity_hit);
  } else if (result.unlocked && result.unlocked.length > 0) {
    const ach = result.unlocked[0];
    const name = lang === 'en' ? ach.en : lang === 'ja' ? ach.ja : ach.zh;
    showToast(`${s.ach_toast}: ${name}`);
  }
}

function resetAll() {
  if (!window.confirm(getStrings(lang).reset_confirm)) return;
  state = createState();
  slots = [null, null];
  lastResult = null;
  query = '';
  dom.search.value = '';
  saveState();
  renderAll();
}

dom.fuseBtn.addEventListener('click', () => {
  ensureAudio();
  doFusion();
});

dom.clearBtn.addEventListener('click', clearForge);

dom.dailyBtn.addEventListener('click', () => {
  ensureAudio();
  doDailyDraw();
});

dom.resetBtn.addEventListener('click', resetAll);

dom.slotA.addEventListener('click', () => {
  slots[0] = null;
  renderSlots();
  renderCollection();
});

dom.slotB.addEventListener('click', () => {
  slots[1] = null;
  renderSlots();
  renderCollection();
});

dom.resultCard.addEventListener('click', () => {
  if (!lastResult) return;
  loadSlot(lastResult.id);
});

dom.collection.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip || chip.disabled) return;
  loadSlot(chip.dataset.element);
});

dom.search.addEventListener('input', (event) => {
  query = event.target.value || '';
  renderCollection();
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

/* 拖拽：把图鉴里的元素拖进熔炉槽位（桌面端增强玩法） */

dom.collection.addEventListener('dragstart', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip || chip.disabled) return;
  event.dataTransfer.setData('text/plain', chip.dataset.element);
  event.dataTransfer.effectAllowed = 'copy';
});

for (const slot of [dom.slotA, dom.slotB]) {
  slot.addEventListener('dragover', (event) => {
    event.preventDefault();
    slot.classList.add('is-dragover');
  });
  slot.addEventListener('dragleave', () => {
    slot.classList.remove('is-dragover');
  });
  slot.addEventListener('drop', (event) => {
    event.preventDefault();
    slot.classList.remove('is-dragover');
    const id = event.dataTransfer.getData('text/plain');
    if (!id) return;
    const index = slot === dom.slotA ? 0 : 1;
    if (slots[index]) slots[index] = null;
    slots[index] = id;
    playSelectSound();
    renderSlots();
    renderCollection();
  });
}

/* 键盘：F 熔炼，Esc 清空 */

document.addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (event.key === 'f' || event.key === 'F') {
    event.preventDefault();
    ensureAudio();
    doFusion();
  } else if (event.key === 'Escape') {
    clearForge();
  }
});

renderAll();
