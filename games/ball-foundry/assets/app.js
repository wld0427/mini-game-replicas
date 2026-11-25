/**
 * 落球坊 Ball Foundry — 表现层
 *
 * 职责：DOM / SVG 渲染、输入、音效、持久化、帧循环。
 * 所有规则判定（物理、掉落、保底、图鉴、成就）都委托给 src/logic.js。
 *
 * 帧循环按 skills 的物理调校约定组织：
 *   真实帧时长 → 手感层（真实时间衰减）→ 时间倍率 → 固定步长物理（advance）
 *   → 渲染用插值比例 alpha 把上一物理帧与当前帧之间插值显示
 */

import { MATERIALS, MATERIAL_IDS, MILESTONES, PITY_LIMIT, UPGRADES, UPGRADE_IDS } from './data.js';
import { getStrings, LANGS } from './i18n.js';
import {
  ACHIEVEMENTS,
  advance,
  applyEvent,
  applyUpgrade,
  autoDropInterval,
  containerBounds,
  createFeel,
  createProfile,
  createSim,
  deserializeProfile,
  dexProgress,
  dropBall,
  finishRun,
  isOverflowing,
  milestoneState,
  mulberry32,
  pityTarget,
  rollMaterial,
  serializeProfile,
  shakeOffset,
  unlockedMaterials,
  updateFeel,
  upgradeCost,
  addTrauma,
  addHitStop,
  feelTier,
} from '../src/logic.js';

const STORAGE_KEY = 'ball-foundry-profile-v1';
const LANG_KEY = 'ball-foundry-lang';

const el = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';

const dom = {
  subtitle: el('game-subtitle'),
  field: el('field-svg'),
  can: el('can'),
  canLine: el('can-line'),
  balls: el('balls'),
  particles: el('particles'),
  stageWrap: el('field'),
  stageHint: el('stage-hint'),
  stageToast: el('stage-toast'),
  dropBtn: el('drop-btn'),
  autoBtn: el('auto-btn'),
  autoState: el('auto-state'),
  clearBtn: el('clear-btn'),
  statCoins: el('stat-coins'),
  statBalls: el('stat-balls'),
  statSettled: el('stat-settled'),
  statPity: el('stat-pity'),
  shop: el('shop'),
  codex: el('codex'),
  codexMeta: el('codex-meta'),
  achievements: el('achievements'),
  recCoins: el('rec-coins'),
  recStack: el('rec-stack'),
  recBalls: el('rec-balls'),
  recValue: el('rec-value'),
  recRuns: el('rec-runs'),
  recPity: el('rec-pity'),
  shakeRange: el('shake-range'),
  shakeValue: el('shake-value'),
  motionToggle: el('motion-toggle'),
  resetBtn: el('reset-btn'),
  toast: el('toast'),
  langSwitch: el('lang-switch'),
};

let profile = deserializeProfile(readStorage());
let lang = detectLang();
let sim = createSim();
let feel = createFeel();
let bounds = containerBounds(profile.upgrades);
let prevPositions = new Map();
let ballNodes = new Map();
let autoOn = false;
let autoTimer = null;
let lastDropX = null;
let toastTimer = null;
let stageToastTimer = null;
let audioCtx = null;
let sfxGain = null;
let masterGain = null;
let rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
const lastPlayed = new Map();

/* ── 存储 ─────────────────────────────────────────── */

function readStorage() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveProfile() {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeProfile(profile));
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
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audioCtx.destination);
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.8;
    sfxGain.connect(masterGain);
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
  amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + delay + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
  osc.connect(amp).connect(sfxGain);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration + 0.02);
}

function noiseBurst(duration, gain, cutoff) {
  const ctx = ensureAudio();
  if (!ctx || !sfxGain) return;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  amp.gain.setValueAtTime(gain, ctx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  src.buffer = buffer;
  src.connect(filter).connect(amp).connect(sfxGain);
  src.start(ctx.currentTime);
}

/** 30ms 内不重复触发同一个音效，避免连点叠成噪音。 */
function playThrottled(key, fn) {
  const now = performance.now();
  const last = lastPlayed.get(key) || 0;
  if (now - last < 30) return;
  lastPlayed.set(key, now);
  fn();
}

function playDropSound() {
  playThrottled('drop', () => tone(520, 0.07, 'triangle', 0.05, 0, (rng() - 0.5) * 0.06));
}

function playSettleSound(value) {
  playThrottled('settle', () => tone(300 + Math.min(value, 120) * 3, 0.07, 'sine', 0.05, 0, (rng() - 0.5) * 0.06));
}

function playBurstSound() {
  playThrottled('burst', () => {
    noiseBurst(0.3, 0.16, 2200);
    tone(90, 0.3, 'sine', 0.08);
  });
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

function renderBounds() {
  dom.field.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  dom.can.setAttribute('width', String(bounds.width));
  dom.can.setAttribute('height', String(bounds.height));
  dom.canLine.setAttribute('x2', String(bounds.width));
}

function renderBalls(alpha) {
  const alive = new Set();
  for (const ball of sim.balls) {
    alive.add(ball.id);
    let node = ballNodes.get(ball.id);
    if (!node) {
      node = document.createElementNS(SVG_NS, 'circle');
      node.setAttribute('class', 'ball is-new');
      node.setAttribute('fill', MATERIALS[ball.mat].color);
      dom.balls.append(node);
      ballNodes.set(ball.id, node);
      prevPositions.set(ball.id, { x: ball.x, y: ball.y });
    }
    const prev = prevPositions.get(ball.id) || ball;
    node.setAttribute('cx', (prev.x + (ball.x - prev.x) * alpha).toFixed(3));
    node.setAttribute('cy', (prev.y + (ball.y - prev.y) * alpha).toFixed(3));
    node.setAttribute('r', ball.r.toFixed(2));
  }
  for (const [id, node] of ballNodes) {
    if (alive.has(id)) continue;
    node.remove();
    ballNodes.delete(id);
    prevPositions.delete(id);
  }
}

function renderHud() {
  dom.field.dataset.balls = String(sim.balls.length);
  dom.field.dataset.coins = String(profile.coins);
  dom.field.dataset.settled = String(profile.stats.settled);
  dom.field.dataset.dropped = String(profile.stats.balls);
  dom.statCoins.textContent = String(profile.coins);
  dom.statBalls.textContent = String(profile.stats.balls);
  dom.statSettled.textContent = String(profile.stats.settled);
  const target = pityTarget(profile);
  dom.statPity.textContent = target ? `${profile.pity}/${PITY_LIMIT}` : '—';
  dom.statPity.parentElement.classList.toggle('is-hot', Boolean(target) && profile.pity >= PITY_LIMIT - 2);
}

function renderShop() {
  const s = getStrings(lang);
  dom.shop.innerHTML = '';
  for (const kind of UPGRADE_IDS) {
    const def = UPGRADES[kind];
    const level = profile.upgrades[kind] || 0;
    const maxed = level >= def.max;
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

function renderCodex() {
  const s = getStrings(lang);
  const unlocked = new Set(unlockedIds());
  dom.codex.innerHTML = '';
  for (const id of MATERIAL_IDS) {
    const record = profile.codex[id] || { dropped: 0, settled: 0, value: 0 };
    const miles = milestoneState(profile, id);
    const isOpen = unlocked.has(id);

    const item = document.createElement('div');
    item.className = isOpen ? 'codex-item' : 'codex-item is-locked';
    item.dataset.material = id;
    item.dataset.dropped = String(record.dropped);
    item.style.setProperty('--pc', `var(--c-${id})`);

    const dot = document.createElement('span');
    dot.className = 'codex-dot';

    const body = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'codex-name';
    name.textContent = isOpen ? s.material[id] : '?';
    const nums = document.createElement('p');
    nums.className = 'codex-nums';
    nums.textContent = s.codex_stat
      .replace('{dropped}', String(record.dropped))
      .replace('{settled}', String(record.settled));
    const mileRow = document.createElement('div');
    mileRow.className = 'codex-miles';
    for (const m of MILESTONES) {
      const chip = document.createElement('span');
      chip.className = miles[m.id] ? 'mile on' : 'mile';
      chip.textContent = s.milestone[m.id];
      mileRow.append(chip);
    }
    body.append(name, nums, mileRow);
    item.append(dot, body);
    dom.codex.append(item);
  }
  const progress = dexProgress(profile);
  dom.codexMeta.textContent = `${progress.done}/${progress.total}`;
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
  dom.recCoins.textContent = String(profile.stats.bestCoins);
  dom.recStack.textContent = String(profile.stats.bestStack);
  dom.recBalls.textContent = String(profile.stats.balls);
  dom.recValue.textContent = String(profile.totalEarned);
  dom.recRuns.textContent = String(profile.stats.runs);
  const target = pityTarget(profile);
  dom.recPity.textContent = target ? `${profile.pity}/${PITY_LIMIT}` : '—';
}

function renderAll() {
  renderStatic();
  renderBounds();
  renderBalls(1);
  renderHud();
  renderShop();
  renderCodex();
  renderAchievements();
  renderRecords();
}

/* ── 辅助 ─────────────────────────────────────────── */

function unlockedIds() {
  const pool = unlockedMaterials(profile.upgrades.unlock);
  return pool;
}

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

function showStageToast(text) {
  dom.stageToast.textContent = text;
  dom.stageToast.hidden = false;
  clearTimeout(stageToastTimer);
  stageToastTimer = setTimeout(() => {
    dom.stageToast.hidden = true;
  }, 1400);
}

/* ── 交互 ─────────────────────────────────────────── */

function doDrop(worldX) {
  if (worldX === null || worldX === undefined) {
    // 还没在罐子里点过就从正中间投
    worldX = lastDropX === null ? bounds.width / 2 : lastDropX;
  }
  const rolled = rollMaterial(profile, rng);
  const { ok } = dropBall(sim, rolled.id, worldX, bounds);
  if (!ok) {
    const s = getStrings(lang);
    if (isOverflowing(sim, bounds)) endRun();
    else showStageToast(s.slot_blocked);
    return;
  }
  lastDropX = worldX;
  const applied = applyEvent(profile, { type: 'drop', mat: rolled.id });
  profile = applied.profile;
  saveProfile();
  playDropSound();
  const tier = feelTier('drop');
  addTrauma(feel, tier.trauma * tier.shake);
  if (rolled.pity) showStageToast(getStrings(lang).pity_hit);
  renderHud();
  renderCodex();
  renderRecords();
  announce(applied);
}

function announce(applied) {
  const s = getStrings(lang);
  if (applied.unlocked.length > 0) {
    const ach = applied.unlocked[0];
    showToast(lang === 'en' ? ach.en : lang === 'ja' ? ach.ja : ach.zh);
  } else if (applied.milestones && applied.milestones.length > 0) {
    const m = applied.milestones[0];
    showToast(`${s.material[m.matId]} · ${s.milestone[m.milestone.id]}`);
  }
}

function endRun() {
  const stack = sim.balls.length;
  profile = finishRun(profile, stack);
  saveProfile();
  const s = getStrings(lang);
  const tier = feelTier('over');
  addTrauma(feel, tier.trauma);
  addHitStop(feel, tier.hitStop);
  showStageToast(s.game_over);
  showToast(s.game_over);
  sim = createSim();
  prevPositions = new Map();
  for (const node of ballNodes.values()) node.remove();
  ballNodes = new Map();
  renderAll();
}

function doClear() {
  sim = createSim();
  prevPositions = new Map();
  for (const node of ballNodes.values()) node.remove();
  ballNodes = new Map();
  renderBalls(1);
  renderHud();
}

function setAuto(on) {
  autoOn = on;
  dom.autoBtn.setAttribute('aria-pressed', String(on));
  dom.autoState.textContent = on ? 'ON' : 'OFF';
  clearInterval(autoTimer);
  autoTimer = null;
  if (on) {
    autoTimer = setInterval(() => {
      const x = 4 + rng() * (bounds.width - 8);
      doDrop(x);
    }, autoDropInterval(profile.upgrades));
  }
}

function doBuy(kind) {
  const result = applyUpgrade(profile, kind);
  if (!result) {
    showToast(getStrings(lang).toast_poor);
    return;
  }
  profile = result.profile;
  saveProfile();
  bounds = containerBounds(profile.upgrades);
  if (kind === 'dropper' && autoOn) setAuto(true);
  renderAll();
  showToast(getStrings(lang).toast_buy);
  announce(result);
}

/** 把指针事件换算成世界坐标。 */
function worldXFromEvent(event) {
  const rect = dom.field.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  return Math.min(Math.max(ratio * bounds.width, 0), bounds.width);
}

dom.field.addEventListener('pointerdown', (event) => {
  ensureAudio();
  doDrop(worldXFromEvent(event));
});

dom.dropBtn.addEventListener('click', () => {
  ensureAudio();
  doDrop(lastDropX);
});

dom.autoBtn.addEventListener('click', () => {
  ensureAudio();
  setAuto(!autoOn);
});

dom.clearBtn.addEventListener('click', () => {
  doClear();
});

dom.shop.addEventListener('click', (event) => {
  const btn = event.target.closest('.shop-buy');
  if (!btn || btn.disabled) return;
  doBuy(btn.dataset.upgrade);
});

dom.resetBtn.addEventListener('click', () => {
  if (!window.confirm(getStrings(lang).reset_confirm)) return;
  profile = createProfile();
  saveProfile();
  bounds = containerBounds(profile.upgrades);
  doClear();
  renderAll();
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

dom.shakeRange.addEventListener('input', (event) => {
  feel.shakeStrength = Number(event.target.value) / 100;
  dom.shakeValue.textContent = `${event.target.value}%`;
});

dom.motionToggle.addEventListener('change', (event) => {
  feel.reduceMotion = event.target.checked;
});

/* 键盘：命名动作映射（提示文案与实际按键共用这一张表） */
const KEY_MAP = {
  Space: 'drop',
  KeyA: 'auto',
  KeyC: 'clear',
};

document.addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const action = KEY_MAP[event.code];
  if (!action) return;
  event.preventDefault();
  ensureAudio();
  if (action === 'drop') doDrop(lastDropX);
  else if (action === 'auto') setAuto(!autoOn);
  else if (action === 'clear') doClear();
});

/* ── 帧循环 ───────────────────────────────────────── */

let lastTs = 0;

function frame(ts) {
  requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  const realDt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  // 手感层用真实时间衰减，物理用被缩放的时间
  const scale = updateFeel(feel, realDt);
  const frameDt = realDt * scale;

  for (const ball of sim.balls) {
    const prev = prevPositions.get(ball.id);
    if (prev) {
      prev.x = ball.x;
      prev.y = ball.y;
    } else {
      prevPositions.set(ball.id, { x: ball.x, y: ball.y });
    }
  }

  const { events, alpha } = advance(sim, bounds, frameDt);
  for (const event of events) handleEvent(event);

  const shake = shakeOffset(feel);
  dom.stageWrap.style.transform = `translate(${shake.x.toFixed(2)}px, ${shake.y.toFixed(2)}px)`;

  renderBalls(alpha);
}

/* ── 事件处理 ─────────────────────────────────────── */

function handleEvent(event) {
  const tier = feelTier(event.type);
  if (tier.trauma > 0) addTrauma(feel, tier.trauma * tier.shake);
  if (tier.hitStop > 0) addHitStop(feel, tier.hitStop);

  if (event.type === 'settle') {
    const ball = event.ball;
    if (ball.paid) return;
    ball.paid = true;
    const value = MATERIALS[ball.mat].value;
    const applied = applyEvent(profile, { type: 'settle', mat: ball.mat, value });
    profile = applied.profile;
    saveProfile();
    playSettleSound(value);
    renderHud();
    renderCodex();
    renderRecords();
    announce(applied);
    if (isOverflowing(sim, bounds)) endRun();
  } else if (event.type === 'burst') {
    const ball = event.ball;
    if (!ball.paid) {
      ball.paid = true;
      const value = MATERIALS[ball.mat].value;
      const applied = applyEvent(profile, { type: 'settle', mat: ball.mat, value });
      profile = applied.profile;
      saveProfile();
    }
    playBurstSound();
    spawnParticles(ball.x, ball.y);
    renderHud();
    renderCodex();
    renderRecords();
  }
}

/** 爆炸粒子：纯 SVG 圆点，动画结束自动移除。 */
function spawnParticles(x, y) {
  if (feel.reduceMotion) return;
  for (let i = 0; i < 10; i += 1) {
    const node = document.createElementNS(SVG_NS, 'circle');
    const angle = (i / 10) * Math.PI * 2;
    const dist = 6 + rng() * 8;
    node.setAttribute('class', 'particle');
    node.setAttribute('cx', (x + Math.cos(angle) * dist).toFixed(2));
    node.setAttribute('cy', (y + Math.sin(angle) * dist).toFixed(2));
    node.setAttribute('r', (0.6 + rng() * 0.9).toFixed(2));
    node.setAttribute('fill', MATERIALS.flame.color);
    dom.particles.append(node);
    setTimeout(() => node.remove(), 520);
  }
}

/* ── 启动 ─────────────────────────────────────────── */

renderAll();
requestAnimationFrame(frame);
