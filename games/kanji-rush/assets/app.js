/**
 * Kanji Rush — 表现层
 *
 * 职责：DOM 渲染、交互、音效、持久化。所有规则计算都委托给 src/logic.js（纯函数、可单测）。
 */

import { KANJI, KANJI_BY_ID } from './data.js';
import { getStrings, LANGS } from './i18n.js';
import {
  ACHIEVEMENTS,
  TIERS,
  TIER_IDS,
  applyPull,
  computeStats,
  createState,
  currentDelay,
  deserializeState,
  serializeState,
  tierOf,
} from '../src/logic.js';

const STORAGE_KEY = 'kanji-rush-state-v1';
const LANG_KEY = 'kanji-rush-lang';

const el = (id) => document.getElementById(id);

const dom = {
  card: el('card'),
  cardTier: el('card-tier'),
  cardGlyph: el('card-glyph'),
  cardReading: el('card-reading'),
  cardMeaning: el('card-meaning'),
  cardBadge: el('card-badge'),
  legend: el('tier-legend'),
  pullBtn: el('pull-btn'),
  autoBtn: el('auto-btn'),
  autoState: el('auto-state'),
  resetBtn: el('reset-btn'),
  statPulls: el('stat-pulls'),
  statUnique: el('stat-unique'),
  statPity: el('stat-pity'),
  statCombo: el('stat-combo'),
  statTempo: el('stat-tempo'),
  collection: el('collection'),
  collectionMeta: el('collection-meta'),
  achievements: el('achievements'),
  log: el('log'),
  toast: el('toast'),
  langSwitch: el('lang-switch'),
  subtitle: el('game-subtitle'),
};

let state = deserializeState(readStorage());
let lang = detectLang();
let autoTimer = null;
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
    /* ignore */
  }
  const nav = (navigator.language || 'zh').toLowerCase();
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('zh')) return 'zh';
  return 'en';
}

/* ── 音效（WebAudio 合成，无外部素材） ─────────────── */

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
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

function playPullSound(tierId) {
  if (tierId === 'ur' || tierId === 'ssr') {
    const notes = tierId === 'ur' ? [523, 659, 784, 1047] : [523, 659, 784];
    notes.forEach((f, i) => tone(f, 0.35, 'triangle', 0.1, i * 0.07));
  } else if (tierId === 'sr') {
    tone(587, 0.18, 'triangle', 0.07);
    tone(880, 0.22, 'triangle', 0.07, 0.06);
  } else {
    tone(392, 0.12, 'sine', 0.05);
  }
}

/* ── 渲染 ─────────────────────────────────────────── */

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

function renderLegend() {
  const s = getStrings(lang);
  dom.legend.innerHTML = '';
  for (const id of TIER_IDS) {
    const tier = TIERS[id];
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="--dot: var(--tier-${id})"></span>${s.tier[id]}`;
    dom.legend.appendChild(item);
  }
}

function renderCard(result) {
  const s = getStrings(lang);
  const { kanji, tier, isNew } = result;
  dom.card.dataset.tier = tier;
  dom.cardTier.textContent = s.tier[tier];
  dom.cardGlyph.textContent = kanji.c;
  dom.cardReading.textContent = kanji.k;
  dom.cardMeaning.textContent = lang === 'en' ? kanji.m : kanji.z;

  dom.cardBadge.hidden = !isNew;
  dom.cardBadge.textContent = s.new_badge;

  dom.card.classList.remove('is-pulling', 'is-fever');
  void dom.card.offsetWidth; // 强制重排以重启动画
  dom.card.classList.add('is-pulling');
  if (tier === 'ssr' || tier === 'ur') {
    dom.card.classList.add('is-fever');
  }
}

function renderStats() {
  const stats = computeStats(state);
  dom.statPulls.textContent = String(stats.pulls);
  dom.statUnique.textContent = String(stats.distinct);
  dom.statPity.textContent = `${stats.pity}/${stats.pityLimit}`;
  dom.statCombo.textContent = String(stats.combo);
  dom.statTempo.textContent = `${stats.delay}ms`;
}

function renderCollection() {
  const s = getStrings(lang);
  dom.collection.innerHTML = '';
  for (const kanji of KANJI) {
    const tier = tierOf(kanji);
    const count = state.collection[kanji.id] || 0;
    const cell = document.createElement('div');
    cell.className = count ? 'cell is-owned' : 'cell';
    cell.dataset.tier = tier;
    cell.style.setProperty('--dot', `var(--tier-${tier})`);
    cell.textContent = count ? kanji.c : '·';
    cell.title = `${kanji.c} (${kanji.k}) — ${count ? s.owned : s.locked}`;
    if (count > 1) {
      const badge = document.createElement('span');
      badge.className = 'cell-count';
      badge.textContent = `×${count}`;
      cell.appendChild(badge);
    }
    dom.collection.appendChild(cell);
  }
  const distinct = Object.keys(state.collection).length;
  dom.collectionMeta.textContent = `${distinct} / ${KANJI.length}`;
}

function renderAchievements() {
  const s = getStrings(lang);
  dom.achievements.innerHTML = '';
  const unlockedCount = Object.keys(state.achievements).length;
  for (const ach of ACHIEVEMENTS) {
    const unlocked = !!state.achievements[ach.id];
    const li = document.createElement('li');
    li.className = unlocked ? 'is-unlocked' : '';
    li.dataset.ach = ach.id;
    const name = lang === 'en' ? ach.en : ach.zh;
    li.innerHTML = `<span class="ach-icon">${ach.icon}</span><span class="ach-name">${name}</span>`;
    const count = document.createElement('span');
    count.className = 'ach-count';
    count.textContent = unlocked ? '✓' : '—';
    li.appendChild(count);
    dom.achievements.appendChild(li);
  }
  dom.achievements.dataset.unlocked = String(unlockedCount);
  void s;
}

function renderLog() {
  dom.log.innerHTML = '';
  for (const entry of state.log.slice(0, 12)) {
    const kanji = KANJI_BY_ID[entry.kanjiId];
    if (!kanji) continue;
    const li = document.createElement('li');
    li.style.setProperty('--dot', `var(--tier-${entry.tier})`);
    li.innerHTML =
      `<span class="log-glyph">${kanji.c}</span>` +
      `<span class="log-tier">${getStrings(lang).tier[entry.tier]}</span>` +
      `<span class="log-name muted small">${lang === 'en' ? kanji.m : kanji.z}</span>`;
    if (entry.pity) {
      const flag = document.createElement('span');
      flag.className = 'log-pity';
      flag.textContent = '★';
      flag.title = getStrings(lang).pity_toast;
      li.appendChild(flag);
    }
    dom.log.appendChild(li);
  }
}

function renderAll() {
  renderStatic();
  renderLegend();
  renderStats();
  renderCollection();
  renderAchievements();
  renderLog();
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
  }, 1800);
}

function doPull() {
  const { state: next, result } = applyPull(state, KANJI);
  state = next;
  renderCard(result);
  renderStats();
  renderCollection();
  renderAchievements();
  renderLog();
  saveState();

  playPullSound(result.tier);

  const s = getStrings(lang);
  if (result.unlocked.length > 0) {
    const ach = result.unlocked[0];
    showToast(`${s.ach_toast}: ${lang === 'en' ? ach.en : ach.zh}`);
  } else if (result.pity) {
    showToast(s.pity_toast);
  }
}

function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!autoOn) return;
  autoTimer = setTimeout(() => {
    doPull();
    scheduleAuto();
  }, currentDelay(state));
}

let autoOn = false;

function setAuto(on) {
  autoOn = on;
  dom.autoBtn.setAttribute('aria-pressed', String(on));
  dom.autoState.textContent = on ? 'ON' : 'OFF';
  if (on) {
    scheduleAuto();
  } else {
    clearTimeout(autoTimer);
  }
}

function resetAll() {
  if (!window.confirm(getStrings(lang).reset_confirm)) return;
  state = createState();
  saveState();
  setAuto(false);
  dom.card.dataset.tier = 'none';
  dom.cardTier.textContent = '—';
  dom.cardGlyph.textContent = '?';
  dom.cardReading.textContent = '';
  dom.cardMeaning.textContent = '';
  dom.cardBadge.hidden = true;
  renderAll();
}

dom.pullBtn.addEventListener('click', () => {
  ensureAudio();
  doPull();
});

dom.autoBtn.addEventListener('click', () => {
  ensureAudio();
  setAuto(!autoOn);
});

dom.resetBtn.addEventListener('click', resetAll);

dom.langSwitch.addEventListener('click', (event) => {
  const btn = event.target.closest('.lang-btn');
  if (!btn) return;
  lang = btn.dataset.lang;
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }
  renderAll();
});

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.code === 'Space') {
    event.preventDefault();
    ensureAudio();
    doPull();
  } else if (event.key === 'a' || event.key === 'A') {
    ensureAudio();
    setAuto(!autoOn);
  }
});

renderAll();
