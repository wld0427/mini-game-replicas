/**
 * Tetra Cascade 无尽方块 — 表现层
 *
 * 职责：DOM 渲染、输入（键盘 / 触控）、音效、持久化、帧循环。
 * 所有规则判定都委托给 src/logic.js（纯浏览器无关、可单测）。
 */

import { BOARD_H, BOARD_W, MILESTONES, PIECES, PIECE_IDS } from './data.js';
import { getStrings, LANGS } from './i18n.js';
import {
  ACHIEVEMENTS,
  accumulate,
  createGame,
  createProfile,
  dailySeed,
  emptySnapshot,
  deserializeProfile,
  dexProgress,
  ghostY,
  hardDrop,
  holdPiece,
  milestoneState,
  pieceCells,
  serializeProfile,
  snapshot,
  softDrop,
  tick,
  tryMove,
  tryRotate,
} from '../src/logic.js';

const STORAGE_KEY = 'tetra-cascade-profile-v1';
const LANG_KEY = 'tetra-cascade-lang';

/** 横向自动移动参数：DAS 首次延迟、ARR 重复间隔（毫秒）。 */
const DAS_MS = 150;
const ARR_MS = 40;

const el = (id) => document.getElementById(id);

const dom = {
  subtitle: el('game-subtitle'),
  hud: el('hud'),
  statScore: el('stat-score'),
  statLevel: el('stat-level'),
  statLines: el('stat-lines'),
  statCombo: el('stat-combo'),
  board: el('board'),
  holdBox: el('hold-box'),
  nextBox: el('next-box'),
  overlay: el('overlay'),
  overlayTitle: el('overlay-title'),
  overlaySub: el('overlay-sub'),
  overlayStats: el('overlay-stats'),
  overlayHint: el('overlay-hint'),
  finalScore: el('final-score'),
  finalLines: el('final-lines'),
  finalLevel: el('final-level'),
  startBtn: el('start-btn'),
  dailyBtn: el('daily-btn'),
  controls: el('controls'),
  dex: el('dex'),
  dexMeta: el('dex-meta'),
  achievements: el('achievements'),
  recScore: el('rec-score'),
  recLines: el('rec-lines'),
  recDaily: el('rec-daily'),
  recGames: el('rec-games'),
  recTotLines: el('rec-totlines'),
  recTotScore: el('rec-totscore'),
  resetBtn: el('reset-btn'),
  toast: el('toast'),
  langSwitch: el('lang-switch'),
};

let profile = deserializeProfile(readStorage());
let lang = detectLang();
let game = null;
let phase = 'menu';
let dailyMode = false;
let boardCells = [];
let flashRows = new Set();
let toastTimer = null;
let audioCtx = null;
let rafId = null;
let lastTs = 0;
let das = { dir: 0, nextRepeat: 0 };
let lastSnapshot = emptySnapshot();
let heldKeys = new Set();

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
    return null;
  }
  return audioCtx;
}

function tone(freq, duration, type = 'square', gain = 0.05, delay = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
  amp.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
  amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + delay + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(ctx.currentTime + delay);
  osc.stop(ctx.currentTime + delay + duration + 0.02);
}

function playMoveSound() {
  tone(320, 0.035, 'square', 0.028);
}

function playRotateSound() {
  tone(440, 0.05, 'triangle', 0.035);
}

function playDropSound() {
  tone(160, 0.1, 'square', 0.05);
  tone(90, 0.14, 'sine', 0.05, 0.03);
}

function playClearSound(lines) {
  const base = 420 + lines * 90;
  tone(base, 0.14, 'triangle', 0.06);
  tone(base * 1.5, 0.16, 'triangle', 0.055, 0.07);
  if (lines >= 4) {
    tone(base * 2, 0.2, 'triangle', 0.06, 0.15);
    tone(base * 3, 0.24, 'sine', 0.05, 0.24);
  }
}

function playOverSound() {
  tone(300, 0.18, 'sawtooth', 0.05);
  tone(200, 0.22, 'sawtooth', 0.05, 0.14);
  tone(140, 0.3, 'sine', 0.05, 0.28);
}

/* ── 渲染 ─────────────────────────────────────────── */

function buildBoard() {
  dom.board.innerHTML = '';
  boardCells = [];
  for (let i = 0; i < BOARD_H * BOARD_W; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    dom.board.append(cell);
    boardCells.push({ node: cell, sig: '' });
  }
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

function renderHud() {
  if (!game) return;
  dom.statScore.textContent = String(game.score);
  dom.statLevel.textContent = String(game.level);
  dom.statLines.textContent = String(game.lines);
  dom.statCombo.textContent = String(game.combo);
  const comboItem = dom.statCombo.parentElement;
  comboItem.classList.toggle('is-hot', game.combo >= 2);
}

function renderBoard() {
  if (!game) return;
  if (game.active) {
    dom.board.dataset.piece = game.active.id;
    dom.board.dataset.x = String(game.active.x);
    dom.board.dataset.rot = String(game.active.rot);
  }
  dom.board.dataset.score = String(game.score);
  dom.board.dataset.pieces = String(game.pieces);
  const grid = new Array(BOARD_H * BOARD_W).fill(null);
  for (let r = 0; r < BOARD_H; r += 1) {
    for (let c = 0; c < BOARD_W; c += 1) grid[r * BOARD_W + c] = game.board[r][c];
  }

  let activeId = null;
  if (game.active) {
    activeId = game.active.id;
    for (const [r, c] of pieceCells(activeId, game.active.rot, game.active.x, game.active.y)) {
      if (r >= 0 && r < BOARD_H && c >= 0 && c < BOARD_W) grid[r * BOARD_W + c] = activeId;
    }
  }

  const ghost = new Set();
  if (game.active) {
    const gy = ghostY(game);
    for (const [r, c] of pieceCells(activeId, game.active.rot, game.active.x, gy)) {
      if (r >= 0 && r < BOARD_H && c >= 0 && c < BOARD_W) ghost.add(r * BOARD_W + c);
    }
  }

  for (let i = 0; i < grid.length; i += 1) {
    const id = grid[i];
    const isGhost = !id && ghost.has(i);
    const sig = id ? `p${id}` : isGhost ? `g${activeId}` : '';
    const slot = boardCells[i];
    if (slot.sig === sig) continue;
    slot.sig = sig;
    slot.node.className = 'cell';
    if (id) {
      slot.node.classList.add('p');
      slot.node.style.setProperty('--pc', `var(--c-${id})`);
    } else if (isGhost) {
      slot.node.classList.add('ghost');
      slot.node.style.setProperty('--pc', `var(--c-${activeId})`);
    }
    if (id && flashRows.has(Math.floor(i / BOARD_W))) slot.node.classList.add('flash');
  }
}

/**
 * 画一个 4×4 的小预览（暂存 / 下一个）。
 * @param {HTMLElement} host
 * @param {string|null} pieceId
 */
function renderMini(host, pieceId) {
  host.innerHTML = '';
  const grid = [];
  for (let i = 0; i < 16; i += 1) grid.push(document.createElement('div'));
  if (pieceId) {
    const piece = PIECES[pieceId];
    const cells = piece.states[0];
    for (const [r, c] of cells) {
      const node = grid[r * 4 + c];
      node.className = 'mini-cell on';
      node.style.setProperty('--pc', `var(--c-${pieceId})`);
    }
  }
  for (const node of grid) host.append(node);
}

function renderHold() {
  renderMini(dom.holdBox, game ? game.hold : null);
}

function renderNext() {
  const s = getStrings(lang);
  dom.nextBox.innerHTML = '';
  if (!game) return;
  for (let i = 0; i < 3; i += 1) {
    const box = document.createElement('div');
    box.className = i === 0 ? 'next-piece is-first' : 'next-piece';
    box.setAttribute('aria-label', `${s.next} ${i + 1}`);
    renderMini(box, game.queue[i] || null);
    dom.nextBox.append(box);
  }
}

function renderDex() {
  const s = getStrings(lang);
  dom.dex.innerHTML = '';
  for (const id of PIECE_IDS) {
    const record = profile.pieces[id] || { used: 0, lines: 0, maxCombo: 0 };
    const miles = milestoneState(profile, id);

    const item = document.createElement('div');
    item.className = 'dex-item';
    item.dataset.piece = id;
    item.dataset.used = String(record.used);
    item.dataset.lines = String(record.lines);
    // 里程碑小标签要继承这个方块的颜色
    item.style.setProperty('--pc', `var(--c-${id})`);

    const icon = document.createElement('span');
    icon.className = 'dex-icon';

    const body = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'dex-name';
    name.textContent = s.piece[id];
    const nums = document.createElement('p');
    nums.className = 'dex-nums';
    nums.textContent = `${s.dex_used} ${record.used} · ${s.dex_cleared} ${record.lines}`;
    const mileRow = document.createElement('div');
    mileRow.className = 'dex-miles';
    for (const m of MILESTONES) {
      const chip = document.createElement('span');
      chip.className = miles[m.id] ? 'mile on' : 'mile';
      chip.textContent = s.milestone[m.id];
      chip.title = miles[m.id] ? '✓' : '—';
      mileRow.append(chip);
    }
    body.append(name, nums, mileRow);
    item.append(icon, body);
    dom.dex.append(item);
  }
  const progress = dexProgress(profile);
  dom.dexMeta.textContent = `${s.dex_progress} ${progress.done}/${progress.total}`;
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
  dom.recScore.textContent = String(profile.best.score);
  dom.recLines.textContent = String(profile.best.lines);
  dom.recDaily.textContent = String(profile.daily.best);
  dom.recGames.textContent = String(profile.stats.games);
  dom.recTotLines.textContent = String(profile.stats.lines);
  dom.recTotScore.textContent = String(profile.stats.score);
}

function renderOverlay() {
  const s = getStrings(lang);
  dom.overlay.hidden = phase === 'playing';
  if (phase === 'playing') return;

  if (phase === 'menu') {
    dom.overlayTitle.textContent = 'Tetra Cascade';
    dom.overlaySub.textContent = s.subtitle;
    dom.overlayStats.hidden = true;
    dom.startBtn.textContent = s.start;
    dom.dailyBtn.hidden = false;
    dom.overlayHint.textContent = s.endless_hint;
  } else if (phase === 'paused') {
    dom.overlayTitle.textContent = s.pause;
    dom.overlaySub.textContent = s.controls_hint;
    dom.overlayStats.hidden = true;
    dom.startBtn.textContent = s.resume;
    dom.dailyBtn.hidden = true;
    dom.overlayHint.textContent = '';
  } else {
    dom.overlayTitle.textContent = s.gameover;
    dom.overlaySub.textContent = s.new_record;
    dom.overlayStats.hidden = false;
    dom.finalScore.textContent = String(game ? game.score : 0);
    dom.finalLines.textContent = String(game ? game.lines : 0);
    dom.finalLevel.textContent = String(game ? game.level : 1);
    dom.startBtn.textContent = s.restart;
    dom.dailyBtn.hidden = true;
    dom.overlayHint.textContent = '';
  }
}

function renderAll() {
  renderStatic();
  renderHud();
  renderBoard();
  renderHold();
  renderNext();
  renderDex();
  renderAchievements();
  renderRecords();
  renderOverlay();
}

/* ── 阶段机 ───────────────────────────────────────── */

function startGame(daily) {
  dailyMode = daily;
  const seed = daily ? dailySeed(todayKey()) : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  game = createGame(seed);
  phase = 'playing';
  flashRows = new Set();
  das = { dir: 0, nextRepeat: 0 };
  heldKeys = new Set();
  lastSnapshot = emptySnapshot();
  renderAll();
  ensureAudio();
}

/**
 * 把当前局的增量并入档案并刷新面板。
 * @param {boolean} final 是否为本局收尾
 */
function syncProfile(final) {
  const current = snapshot(game);
  const { profile: next, unlocked, milestones } = accumulate(
    profile,
    current,
    lastSnapshot,
    todayKey(),
    dailyMode,
    final,
  );
  profile = next;
  lastSnapshot = current;
  saveProfile();
  renderDex();
  renderAchievements();
  renderRecords();
  return { unlocked, milestones };
}

function endGame() {
  phase = 'over';
  const previousBest = profile.best.score;
  const { unlocked, milestones } = syncProfile(true);
  renderOverlay();
  playOverSound();

  const s = getStrings(lang);
  if (game.score > previousBest) {
    showToast(`${s.new_record} ${game.score}`);
  } else if (unlocked.length > 0) {
    const ach = unlocked[0];
    const name = lang === 'en' ? ach.en : lang === 'ja' ? ach.ja : ach.zh;
    showToast(name);
  } else if (milestones.length > 0) {
    showToast(`${s.piece[milestones[0].pieceId]} · ${s.milestone[milestones[0].milestone.id]}`);
  }
}

function togglePause() {
  if (phase === 'playing') {
    phase = 'paused';
  } else if (phase === 'paused') {
    phase = 'playing';
    lastTs = 0;
  } else {
    return;
  }
  renderOverlay();
}

function resetAll() {
  if (!window.confirm(getStrings(lang).reset_confirm)) return;
  profile = createProfile();
  saveProfile();
  game = null;
  phase = 'menu';
  renderAll();
}

/* ── 交互 ─────────────────────────────────────────── */

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

function doMove(dir) {
  if (phase !== 'playing' || !game) return false;
  const moved = tryMove(game, dir, 0);
  if (moved) {
    playMoveSound();
    renderBoard();
  }
  return moved;
}

function doRotate(dir) {
  if (phase !== 'playing' || !game) return false;
  const rotated = tryRotate(game, dir);
  if (rotated) {
    playRotateSound();
    renderBoard();
  }
  return rotated;
}

function doSoftDrop() {
  if (phase !== 'playing' || !game) return;
  softDrop(game);
  renderHud();
  renderBoard();
}

function doHardDrop() {
  if (phase !== 'playing' || !game) return;
  const { event } = hardDrop(game);
  playDropSound();
  renderHud();
  renderBoard();
  if (event) onLock(event);
}

function doHold() {
  if (phase !== 'playing' || !game) return;
  if (holdPiece(game)) {
    playRotateSound();
    renderBoard();
    renderHold();
    renderNext();
  }
}

function onLock(event) {
  if (event.cleared > 0) {
    playClearSound(event.cleared);
    flashRows = new Set(event.rows || []);
    renderBoard();
    setTimeout(() => {
      flashRows = new Set();
      renderBoard();
    }, 340);
  }
  const { unlocked, milestones } = syncProfile(false);
  announce(unlocked, milestones);
  if (event.over) {
    endGame();
    return;
  }
  renderHud();
  renderNext();
}

/** 播报新解锁的成就 / 里程碑。 */
function announce(unlocked, milestones) {
  const s = getStrings(lang);
  if (unlocked && unlocked.length > 0) {
    const ach = unlocked[0];
    const name = lang === 'en' ? ach.en : lang === 'ja' ? ach.ja : ach.zh;
    showToast(name);
  } else if (milestones && milestones.length > 0) {
    showToast(`${s.piece[milestones[0].pieceId]} · ${s.milestone[milestones[0].milestone.id]}`);
  }
}

dom.startBtn.addEventListener('click', () => {
  if (phase === 'paused') togglePause();
  else startGame(false);
});

dom.dailyBtn.addEventListener('click', () => {
  startGame(true);
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

dom.controls.addEventListener('click', (event) => {
  const btn = event.target.closest('.ctl');
  if (!btn) return;
  ensureAudio();
  const act = btn.dataset.act;
  if (act === 'left') doMove(-1);
  else if (act === 'right') doMove(1);
  else if (act === 'cw') doRotate(1);
  else if (act === 'ccw') doRotate(-1);
  else if (act === 'down') doSoftDrop();
  else if (act === 'drop') doHardDrop();
  else if (act === 'hold') doHold();
});

/* 键盘：方向键 + WASD + 空格硬降 + C 暂存 + P 暂停 */

const KEY_MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'down', KeyS: 'down',
  ArrowUp: 'cw', KeyX: 'cw',
  KeyZ: 'ccw', ControlLeft: 'ccw', ControlRight: 'ccw',
  Space: 'drop',
  KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
  KeyP: 'pause', Escape: 'pause',
};

document.addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const act = KEY_MAP[event.code];
  if (!act) return;
  event.preventDefault();
  ensureAudio();

  if (act === 'pause') {
    togglePause();
    return;
  }
  if (phase !== 'playing') return;
  if (heldKeys.has(event.code) && act !== 'down') return;
  heldKeys.add(event.code);

  if (act === 'left' || act === 'right') {
    const dir = act === 'left' ? -1 : 1;
    if (das.dir !== dir) {
      das.dir = dir;
      das.nextRepeat = performance.now() + DAS_MS;
    }
    doMove(dir);
  } else if (act === 'down') {
    doSoftDrop();
  } else if (act === 'cw') {
    doRotate(1);
  } else if (act === 'ccw') {
    doRotate(-1);
  } else if (act === 'drop') {
    doHardDrop();
  } else if (act === 'hold') {
    doHold();
  }
});

document.addEventListener('keyup', (event) => {
  heldKeys.delete(event.code);
  const act = KEY_MAP[event.code];
  if (act === 'left' || act === 'right') {
    const dir = act === 'left' ? -1 : 1;
    if (das.dir === dir) das.dir = 0;
  }
});

/* ── 帧循环 ───────────────────────────────────────── */

function frame(ts) {
  rafId = requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  const dt = Math.min(100, ts - lastTs);
  lastTs = ts;
  if (phase !== 'playing' || !game) return;

  if (das.dir !== 0 && ts >= das.nextRepeat) {
    das.nextRepeat = ts + ARR_MS;
    doMove(das.dir);
  }

  const event = tick(game, dt);
  if (event) {
    onLock(event);
    renderHud();
  }
}

/** 启动帧循环。 */
function startLoop() {
  rafId = requestAnimationFrame(frame);
}

/* ── 启动 ─────────────────────────────────────────── */

buildBoard();
renderAll();
startLoop();
