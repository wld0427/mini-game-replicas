/**
 * 渔汛录 Angler's Almanac — 表现层
 *
 * 职责：DOM 渲染、交互、音效、持久化。所有规则计算都委托给 src/logic.js（纯函数、可单测）。
 *
 * 阶段状态机：idle → waiting → bite → reel → result → idle
 */

import { SPECIES, UPGRADES, UPGRADE_IDS, speciesName } from './data.js';
import { getStrings, LANGS } from './i18n.js';
import {
  ACHIEVEMENTS,
  applyCast,
  applyLoss,
  applyUpgrade,
  computeStats,
  createState,
  deserializeState,
  hookWindowOpen,
  landCatch,
  mulberry32,
  reelMarkerInfo,
  rollCatch,
  serializeState,
  startReel,
  stepReel,
  tensionZone,
  upgradeCost,
} from '../src/logic.js';

const STORAGE_KEY = 'angler-almanac-state-v1';
const LANG_KEY = 'angler-almanac-lang';

const el = (id) => document.getElementById(id);

const dom = {
  subtitle: el('game-subtitle'),
  scene: el('scene'),
  phaseText: el('phase-text'),
  phaseSub: el('phase-sub'),
  castBtn: el('cast-btn'),
  hookBtn: el('hook-btn'),
  reelPanel: el('reel-panel'),
  sweetZone: el('sweet-zone'),
  timingMarker: el('timing-marker'),
  tensionFill: el('tension-fill'),
  catchCard: el('catch-card'),
  catchArt: el('catch-art'),
  catchName: el('catch-name'),
  catchTier: el('catch-tier'),
  catchSize: el('catch-size'),
  catchNew: el('catch-new'),
  catchBig: el('catch-big'),
  catchCoins: el('catch-coins'),
  statCoins: el('stat-coins'),
  statDex: el('stat-dex'),
  statCatches: el('stat-catches'),
  statBest: el('stat-best'),
  statDepth: el('stat-depth'),
  statPity: el('stat-pity'),
  statCasts: el('stat-casts'),
  statMisses: el('stat-misses'),
  statEscapes: el('stat-escapes'),
  reelCombo: el('reel-combo'),
  tensionLabel: el('tension-label'),
  sceneFish: el('scene-fish'),
  sceneLine: el('scene-line'),
  sceneDepth: el('scene-depth'),
  shop: el('shop'),
  dex: el('dex'),
  dexMeta: el('dex-meta'),
  achievements: el('achievements'),
  resetBtn: el('reset-btn'),
  toast: el('toast'),
  langSwitch: el('lang-switch'),
};

let state = deserializeState(readStorage());
let lang = detectLang();
let phase = 'idle';
let pending = null;
let reel = null;
let lastResult = null;
let biteDeadline = 0;
let pendingInput = false;
let rafId = null;
let lastTs = 0;
let timerIds = [];
let toastTimer = null;
let audioCtx = null;

/* ── 存储 ─────────────────────────────────────────── */

/** @feature F-013 本地存档 */
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

/* ── 音效（WebAudio 合成，无外部素材） ─────────────── */

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    /* 浏览器不支持音频时静默降级 */
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

function noise(duration, gain, delay = 0, cutoff = 1400) {
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
  filter.frequency.setValueAtTime(cutoff, ctx.currentTime + delay);
  amp.gain.setValueAtTime(gain, ctx.currentTime + delay);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
  src.buffer = buffer;
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start(ctx.currentTime + delay);
}

function playCastSound() {
  tone(520, 0.16, 'sine', 0.05);
  noise(0.3, 0.1, 0.08, 900);
}

function playBiteSound() {
  tone(880, 0.08, 'square', 0.05);
  tone(1180, 0.08, 'square', 0.05, 0.1);
}

function playPullSound(good) {
  tone(good ? 660 : 220, 0.06, 'triangle', 0.05);
}

function playCatchSound(tier) {
  const notes = { n: [523, 659], r: [523, 659, 784], sr: [523, 659, 784, 988], ssr: [523, 659, 784, 1047, 1319], ur: [523, 659, 784, 1047, 1319, 1568] };
  const list = notes[tier] || notes.n;
  list.forEach((f, i) => tone(f, 0.3, 'triangle', 0.075, i * 0.07));
}

function playLoseSound(snapped) {
  if (snapped) {
    noise(0.26, 0.13, 0, 2600);
    tone(420, 0.3, 'sawtooth', 0.06);
  } else {
    tone(320, 0.2, 'sine', 0.05);
    tone(240, 0.24, 'sine', 0.05, 0.12);
  }
}

/* ── 图形（SVG 自绘） ─────────────────────────────── */

/**
 * 画一条鱼。色相来自词条数据，形状与配色全部自绘。
 * @param {{hue: number}} species
 * @returns {string} SVG 片段
 */
function fishSvg(species) {
  const hue = species.hue;
  const body = `hsl(${hue} 62% 58%)`;
  const belly = `hsl(${hue} 70% 76%)`;
  const tail = `hsl(${hue} 52% 42%)`;
  return (
    '<svg viewBox="0 0 72 44" aria-hidden="true" focusable="false">' +
    `<path d="M50 22 L69 5 L69 39 Z" fill="${tail}"/>` +
    `<ellipse cx="30" cy="22" rx="24" ry="13" fill="${body}"/>` +
    `<path d="M22 11 q9 -9 18 -1 q-9 3 -18 1z" fill="${tail}"/>` +
    `<path d="M18 30 q10 7 20 0 q-10 6 -20 0z" fill="${belly}"/>` +
    `<ellipse cx="24" cy="27" rx="7" ry="4" fill="${belly}" opacity="0.85"/>` +
    '<circle cx="13" cy="19" r="2.8" fill="#08151f"/>' +
    '<circle cx="12" cy="18.2" r="0.9" fill="#ffffff"/>' +
    '</svg>'
  );
}

/* ── 渲染 ─────────────────────────────────────────── */

/** @feature F-014 三语切换 */
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

/**
 * 遛鱼阶段的实时状态文案（场景状态区与张力标签共用同一口径）。
 *
 * - 场景状态区给**定性**提示（该加速收线还是快断线）
 * - 遛鱼面板的张力标签给**定量**读数（拉力百分比）
 * 两处各司其职，不再像之前那样同屏重复同一句话。
 *
 * @param {'safe'|'warn'|'danger'} [zone]
 * @returns {string}
 */
function reelStatusText(zone = reel ? tensionZone(reel.tension) : 'safe') {
  const s = getStrings(lang);
  return s[`tension_${zone}`];
}

/**
 * 遛鱼面板里张力条的定量读数。
 * @returns {string}
 */
function reelTensionText() {
  const s = getStrings(lang);
  const tension = reel ? Math.max(0, Math.min(100, reel.tension)) : 0;
  return `${s.reel_tension} ${Math.round(tension)}%`;
}

function renderPhase() {
  const s = getStrings(lang);
  const stats = computeStats(state);
  let text = s.phase_idle;
  let sub = `${s.depth_name[stats.depth]} · ${s.stat_luck} ${stats.luck}`;

  if (phase === 'waiting') {
    text = s.phase_waiting;
  } else if (phase === 'bite') {
    text = s.phase_bite;
  } else if (phase === 'reel') {
    text = s.phase_reel;
    // 之前这里和遛鱼面板顶部写的是同一句「标记进入绿区时点击收线」，
    // 同一屏重复两遍。现在场景区给定性提示，面板顶部保留操作提示。
    sub = reel ? reelStatusText() : s.reel_hint;
  } else if (phase === 'result') {
    if (lastResult && lastResult.caught) text = s.phase_landed;
    else if (lastResult && lastResult.snapped) text = s.phase_snapped;
    else if (lastResult) text = s.phase_lost;
  }

  dom.phaseText.textContent = text;
  dom.phaseSub.textContent = sub;
  if (dom.sceneDepth) {
    dom.sceneDepth.textContent = `${s.depth_name[stats.depth]} Lv.${stats.depth}`;
  }
}

/** @feature F-016 统计面板 */
function renderStats() {
  const s = getStrings(lang);
  const stats = computeStats(state);
  dom.statCoins.textContent = String(stats.coins);
  dom.statDex.textContent = `${stats.distinct}/${stats.totalSpecies}`;
  dom.statCatches.textContent = String(stats.catches);
  dom.statBest.textContent = stats.bestCm > 0 ? `${stats.bestCm}cm` : '—';
  dom.statDepth.textContent = `${s.depth_name[stats.depth]} Lv.${stats.depth}`;
  dom.statPity.textContent = `${stats.pity}/${stats.pityLimit}`;
  if (dom.statCasts) dom.statCasts.textContent = String(stats.casts);
  if (dom.statMisses) dom.statMisses.textContent = String(stats.misses);
  if (dom.statEscapes) dom.statEscapes.textContent = String(stats.escapes);
}

/** @feature F-010 装备升级 */
function renderShop() {
  const s = getStrings(lang);
  dom.shop.innerHTML = '';
  for (const id of UPGRADE_IDS) {
    const def = UPGRADES[id];
    const level = state.upgrades[id] || 0;
    const maxed = level >= def.max;
    const cost = upgradeCost(id, level);

    const item = document.createElement('div');
    item.className = 'shop-item';

    const head = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'shop-name';
    name.textContent = s[`upgrade_${id}`];
    const lv = document.createElement('span');
    lv.className = 'shop-lv';
    lv.textContent = `Lv.${level}`;
    head.append(name, lv);

    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = maxed ? 'shop-buy is-max' : 'shop-buy';
    buy.dataset.upgrade = id;
    buy.disabled = maxed || state.coins < cost;
    buy.textContent = maxed ? s.max_level : `${s.buy} · ${cost}`;

    const desc = document.createElement('p');
    desc.className = 'shop-desc';
    desc.textContent = s[`upgrade_${id}_desc`];

    item.append(head, buy, desc);
    dom.shop.append(item);
  }
}

/** @feature F-007 鱼种图鉴 */
function renderDex() {
  const s = getStrings(lang);
  dom.dex.innerHTML = '';
  for (const species of SPECIES) {
    const record = state.dex[species.id];
    const cell = document.createElement('div');
    cell.className = record ? 'dex-cell' : 'dex-cell is-locked';
    cell.dataset.tier = species.tier;
    cell.style.setProperty('--tier', `var(--tier-${species.tier})`);

    if (record) {
      const art = document.createElement('div');
      art.className = 'dex-art';
      art.innerHTML = fishSvg(species);
      const name = document.createElement('span');
      name.className = 'dex-name';
      name.textContent = speciesName(species, lang);
      const best = document.createElement('span');
      best.className = 'dex-best';
      best.textContent = `${record.bestCm}cm ×${record.count}`;
      cell.append(art, name, best);
      cell.title = `${speciesName(species, lang)} — ${s.owned}`;
    } else {
      const mark = document.createElement('span');
      mark.className = 'dex-locked';
      mark.textContent = '?';
      const name = document.createElement('span');
      name.className = 'dex-name';
      name.textContent = s.locked;
      cell.append(mark, name);
      cell.title = s.locked;
    }
    dom.dex.append(cell);
  }
  const stats = computeStats(state);
  dom.dexMeta.textContent = `${stats.distinct}/${stats.totalSpecies}`;
}

/** @feature F-012 成就系统 */
function renderAchievements() {
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
}

/** @feature F-006 上钩结算与失败呈现 */
function renderCatch() {
  const s = getStrings(lang);
  if (!lastResult) {
    dom.catchCard.hidden = true;
    return;
  }
  const species = lastResult.species;
  if (!species) {
    dom.catchCard.hidden = true;
    return;
  }
  dom.catchCard.hidden = false;
  dom.catchCard.dataset.tier = species.tier;
  dom.catchCard.style.setProperty('--tier', `var(--tier-${species.tier})`);
  // 失败时隐藏鱼种与体长：既不剧透，也不让玩家误以为钓到了
  const escaped = !lastResult.caught;
  dom.catchArt.innerHTML = escaped ? '' : fishSvg(species);
  dom.catchName.textContent = escaped ? s.escaped_name : speciesName(species, lang);
  dom.catchTier.textContent = escaped ? '' : s.tier[species.tier];
  dom.catchSize.textContent = escaped ? s.escaped_size : `${lastResult.cm} cm`;
  dom.catchNew.hidden = !(lastResult.caught && lastResult.isNew);
  dom.catchNew.textContent = s.new_badge;
  dom.catchBig.hidden = !(lastResult.caught && lastResult.isBig);
  dom.catchBig.textContent = s.big_badge;
  dom.catchCoins.textContent = lastResult.caught ? `+${lastResult.value}` : '';
}

/* ── 场景内的鱼影与钓线 ─────────────────────────────── */

/**
 * 场景坐标系常量（对应 index.html 里 overlay SVG 的 viewBox 0 0 1000 300）。
 * 浮标锚点 / 鱼的落点都写死在这里，改布局时只改这一处。
 */
const SCENE = {
  bobberX: 500,
  bobberY: 222,
  fishY: 252,
  fishNearX: 560,
  fishSpanX: 330,
};

/**
 * 把张力画成「鱼在往哪跑」：张力越高，鱼游得离船越远，钓线越绷。
 *
 * 之前整个水面只有一个浮标，宽屏上信息密度几乎为零；
 * 现在鱼影 + 钓线 + 配色把张力条翻译成了可看的画面。
 *
 * @param {'safe'|'warn'|'danger'} zone
 * @param {number} tension 0–100
 */
/** @feature F-015 张力分区配色与场景鱼影 */
function renderSceneFight(zone, tension) {
  if (!dom.sceneFish || !dom.sceneLine) return;
  const ratio = Math.max(0, Math.min(100, tension)) / 100;
  const fishX = SCENE.fishNearX + SCENE.fishSpanX * ratio;

  dom.sceneFish.style.left = `${(fishX / 1000) * 100}%`;
  dom.sceneFish.dataset.zone = zone;

  // 二次贝塞尔：中点下垂，张力越高线越直（越绷）
  const sag = 46 * (1 - ratio);
  const cx = (SCENE.bobberX + fishX) / 2;
  const cy = (SCENE.bobberY + SCENE.fishY) / 2 + sag;
  dom.sceneLine.setAttribute(
    'd',
    `M ${SCENE.bobberX} ${SCENE.bobberY} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${fishX.toFixed(1)} ${SCENE.fishY}`,
  );
  dom.sceneLine.dataset.zone = zone;
}

/** @feature F-004 遛鱼张力 F-005 命中反馈 */
function renderReel() {
  if (phase !== 'reel' || !reel) return;
  const s = getStrings(lang);
  const center = reel.sweetCenter * 100;
  const width = reel.sweetWidth * 100;
  dom.sweetZone.style.top = `${center - width / 2}%`;
  dom.sweetZone.style.height = `${width}%`;
  const info = reelMarkerInfo(reel);
  dom.timingMarker.style.top = `${info.value * 100}%`;
  const tension = Math.max(0, Math.min(100, reel.tension));
  dom.tensionFill.style.width = `${tension}%`;
  dom.reelPanel.dataset.marker = info.value.toFixed(4);
  dom.reelPanel.dataset.sweet = reel.sweetCenter.toFixed(4);
  dom.reelPanel.dataset.width = reel.sweetWidth.toFixed(4);
  dom.reelPanel.dataset.tension = reel.tension.toFixed(2);

  // 张力配色：**填充条与轨道色带读同一个分区口径**（src/logic.js 的 tensionZone）。
  // 之前填充条把绿→黄→红渐变铺在自身宽度上，张力只有 20% 时末端就已经是红的，
  // 看上去像「危险」，和轨道自己的 62% 危险区互相打架。
  const zone = tensionZone(reel.tension);
  dom.tensionFill.dataset.zone = zone;
  dom.reelPanel.dataset.zone = zone;
  if (dom.tensionLabel) {
    dom.tensionLabel.textContent = reelTensionText();
  }

  // 场景里的鱼影与钓线：把张力做成看得见的「鱼在往哪跑」。
  // 之前整个水面场景只有一个浮标，1280px 宽屏上信息密度几乎为零。
  renderSceneFight(zone, tension);

  // 命中反馈：之前 reel.good / reel.pulls 一直在统计，表现层却从不读，
  // 玩家打中甜区没有任何视觉确认，只能靠音调和张力条方向猜。
  const hit = reel.lastHit === 'good';
  dom.timingMarker.classList.toggle('is-hit', hit);
  dom.timingMarker.classList.toggle('is-miss', reel.lastHit === 'miss');
  if (dom.reelCombo) {
    dom.reelCombo.textContent = reel.good > 0 ? `${s.reel_perfect} ×${reel.good}` : '';
  }
}

function renderAll() {
  renderStatic();
  renderPhase();
  renderStats();
  renderShop();
  renderDex();
  renderAchievements();
  renderCatch();
  renderReel();
}

/* ── 阶段机 ───────────────────────────────────────── */

function clearTimers() {
  for (const id of timerIds) clearTimeout(id);
  timerIds = [];
}

function later(fn, ms) {
  const id = setTimeout(fn, ms);
  timerIds.push(id);
  return id;
}

function setPhase(next) {
  phase = next;
  dom.scene.dataset.phase = next;
  dom.castBtn.disabled = !(next === 'idle' || next === 'result');
  dom.hookBtn.hidden = next !== 'bite';
  dom.reelPanel.hidden = next !== 'reel';
  renderPhase();
}

function startLoop() {
  if (rafId) return;
  lastTs = 0;
  rafId = requestAnimationFrame(loop);
}

function stopLoop() {
  if (!rafId) return;
  cancelAnimationFrame(rafId);
  rafId = null;
}

function loop(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  if (phase === 'bite') {
    if (!hookWindowOpen(biteDeadline, ts)) {
      onHookTimeout();
      return;
    }
    const left = Math.max(0, biteDeadline - ts);
    dom.phaseSub.textContent = `${(left / 1000).toFixed(1)}s`;
  } else if (phase === 'reel' && reel) {
    reel = stepReel(reel, pendingInput, dt);
    pendingInput = false;
    renderReel();
    dom.phaseSub.textContent = reelStatusText();
    if (reel.landed) {
      finishReel(true);
      return;
    }
    if (reel.snapped) {
      finishReel(false);
      return;
    }
  }
  rafId = requestAnimationFrame(loop);
}

function doCast() {
  if (phase !== 'idle' && phase !== 'result') return;
  ensureAudio();
  const seed = (Date.now() ^ Math.floor(state.stats.casts * 2654435761)) >>> 0;
  const rng = mulberry32(seed);
  const { state: next, biteDelay } = applyCast(state, rng);
  state = next;
  saveState();
  pending = null;
  lastResult = null;
  renderCatch();
  setPhase('waiting');
  playCastSound();
  startLoop();
  later(() => onBite(rng), biteDelay);
}

/** @feature F-001 抛竿与咬钩等待 F-002 起竿窗口 */
function onBite(rng) {
  if (phase !== 'waiting') return;
  pending = rollCatch(state, rng);
  const window = computeStats(state).hookWindow;
  biteDeadline = performance.now() + window;
  setPhase('bite');
  playBiteSound();

  // 把窗口长度与截止时刻挂到 DOM 上：测试可以据此判定「窗口确实过期了」，
  // 而不是靠 sleep 猜时间。performance.now() 在页面内与 page.evaluate 同源。
  dom.scene.dataset.hookWindow = String(window);
  dom.scene.dataset.hookDeadline = String(biteDeadline);

  // 窗口一到，鱼就跑了 —— 之前这里没有任何超时安排，onHookTimeout 是死代码，
  // 导致「抢时机」这个核心玩法被架空（迟到 7.5 秒仍能起竿成功）。
  later(() => onHookTimeout(), window);
}

/** @feature F-002 超时兜底判定 F-003 起竿进入遛鱼 */
function doHook() {
  if (phase !== 'bite' || !pending) return;
  // 兜底：即使超时定时器还没跑，只要窗口已过就算判负
  if (!hookWindowOpen(biteDeadline, performance.now())) {
    onHookTimeout();
    return;
  }
  clearTimers();
  reel = startReel(pending.species, mulberry32((Date.now() ^ 0x9e3779b9) >>> 0));
  setPhase('reel');
  startLoop();
}

/** @feature F-002 窗口过期判负 */
function onHookTimeout() {
  if (phase !== 'bite' || !pending) return;
  state = applyLoss(state, 'miss');
  saveState();
  lastResult = { caught: false, species: pending.species, tier: pending.tier, cm: pending.cm, snapped: false };
  pending = null;
  stopLoop();
  setPhase('result');
  playLoseSound(false);
  renderAll();
}

function finishReel(landed) {
  const species = pending ? pending.species : null;
  if (landed && species) {
    const { state: next, result } = landCatch(state, species, pending.cm, pending.value);
    state = next;
    lastResult = { caught: true, species, ...result };
    saveState();
    playCatchSound(species.tier);
  } else {
    state = applyLoss(state, 'escape');
    saveState();
    lastResult = { caught: false, species, tier: species ? species.tier : 'n', cm: pending ? pending.cm : 0, snapped: true };
    playLoseSound(true);
  }
  pending = null;
  reel = null;
  stopLoop();
  setPhase('result');
  renderAll();
}

function doPull() {
  if (phase !== 'reel') return;
  ensureAudio();
  pendingInput = true;
  if (reel) {
    const marker = reelMarkerInfo(reel);
    const inZone = Math.abs(marker.value - reel.sweetCenter) <= reel.sweetWidth / 2;
    playPullSound(inZone);
  }
}

function resetAll() {
  if (!window.confirm(getStrings(lang).reset_confirm)) return;
  clearTimers();
  stopLoop();
  state = createState();
  pending = null;
  reel = null;
  lastResult = null;
  pendingInput = false;
  saveState();
  setPhase('idle');
  renderAll();
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

function announceAchievements(unlocked) {
  if (!unlocked || unlocked.length === 0) return;
  const s = getStrings(lang);
  const ach = unlocked[0];
  const name = lang === 'en' ? ach.en : lang === 'ja' ? ach.ja : ach.zh;
  showToast(`${s.ach_toast}: ${name}`);
}

dom.castBtn.addEventListener('click', doCast);
dom.hookBtn.addEventListener('click', doHook);
dom.reelPanel.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  doPull();
});

dom.shop.addEventListener('click', (event) => {
  const btn = event.target.closest('.shop-buy');
  if (!btn || btn.disabled) return;
  const kind = btn.dataset.upgrade;
  const result = applyUpgrade(state, kind);
  if (!result) {
    showToast(getStrings(lang).toast_poor);
    return;
  }
  state = result.state;
  saveState();
  renderAll();
  showToast(getStrings(lang).toast_buy);
  announceAchievements(result.result.unlocked);
});

dom.resetBtn.addEventListener('click', resetAll);

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

document.addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (event.code !== 'Space') return;
  event.preventDefault();
  ensureAudio();
  if (phase === 'idle' || phase === 'result') doCast();
  else if (phase === 'bite') doHook();
  else if (phase === 'reel') doPull();
});

renderAll();
