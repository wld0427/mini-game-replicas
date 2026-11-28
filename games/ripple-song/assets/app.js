/**
 * 涟歌 Ripple Song — 表现层（阶段 1：2D canvas 波场渲染 + HUD + 输入）
 *
 * 架构约束：**规则全部在 src/logic.js**，本文件只负责把波场画出来、接收输入。
 * 渲染层不得参与任何判定 —— 共鸣点亮不亮只看 logic.js 的振幅包络。
 */

import { createRenderer } from './renderer.js';
import { createParticleLayer } from './fx.js';
import {
  GRID_H,
  GRID_W,
  STEP_MS,
  checkLose,
  createGame,
  createLevel,
  createProfile,
  deserializeProfile,
  evaluateTargets,
  moveSource,
  recordClear,
  resonanceScore,
  serializeProfile,
  tick,
} from '../src/logic.js';

const STORAGE_KEY = 'ripple-song-profile-v1';
const LANG_KEY = 'ripple-song-lang';

const el = (id) => document.getElementById(id);
const dom = {
  subtitle: el('game-subtitle'),
  sea: el('sea'),
  fx: el('fx'),
  seaFrame: el('sea').parentElement,
  markers: el('markers'),
  overlay: el('overlay'),
  overlayTitle: el('overlay-title'),
  overlaySub: el('overlay-sub'),
  overlayHint: el('overlay-hint'),
  startBtn: el('start-btn'),
  nextBtn: el('next-btn'),
  hint: el('hint'),
  hudTime: el('hud-time'),
  hudResonance: el('hud-resonance'),
  hudTargets: el('hud-targets'),
  meterFill: el('meter-fill'),
  levels: el('levels'),
  records: el('records'),
  toast: el('toast'),
  langSwitch: el('lang-switch'),
};

/* ── 多语言 ─────────────────────────────────────────── */

const STRINGS = {
  zh: {
    subtitle: '你不能点亮目标，你只能移动波',
    time_left: '剩余', resonance: '共鸣值', targets: '共鸣点',
    hint: '方向键 / 拖拽移动波源，让所有共鸣点同时亮起',
    start: '开始', next_level: '下一关',
    how_to: '怎么玩',
    how_1: '共鸣点不可点击 —— 你没法直接点亮它。',
    how_2: '波源可以随便挪。波会绕过礁石来回叠加，形成驻波。',
    how_3: '把波源挪到某个位置，所有共鸣点会一起亮 —— 那就是解。',
    levels: '关卡',
    records: '纪录',
    won: '驻波收敛',
    lost: '波散了',
    won_sub: '所有共鸣点同时亮起',
    lost_sub: '还有 {n} 个共鸣点没亮',
    level_done: '第 {n} 关 · 用时 {t}s · 共鸣 {r}%',
    no_records: '还没有通关记录',
    toast_win: '驻波收敛！',
    toast_lose: '时间到',
  },
  en: {
    subtitle: 'You cannot light the targets — you can only move the wave',
    time_left: 'Time', resonance: 'Resonance', targets: 'Targets',
    hint: 'Arrow keys / drag the source until every target lights at once',
    start: 'Start', next_level: 'Next level',
    how_to: 'How to play',
    how_1: 'Targets cannot be clicked — you can never light them directly.',
    how_2: 'The source moves freely. Waves bounce off reefs and interfere.',
    how_3: 'Move the source until every target lights at once — that is the answer.',
    levels: 'Levels',
    records: 'Records',
    won: 'Standing wave',
    lost: 'The wave died',
    won_sub: 'Every target lit at once',
    lost_sub: '{n} targets still dark',
    level_done: 'Level {n} · {t}s · resonance {r}%',
    no_records: 'No clears yet',
    toast_win: 'Standing wave!',
    toast_lose: 'Time up',
  },
  ja: {
    subtitle: '標的は直接消せない。波を動かすだけ',
    time_left: '残り', resonance: '共鳴', targets: '標的',
    hint: '方向キー / ドラッグで波源を動かし、全標的を同時に輝かせる',
    start: 'スタート', next_level: '次の关卡',
    how_to: '遊び方',
    how_1: '標的はクリックできない —— 直接は消せない。',
    how_2: '波源は自由に動かせる。波は暗礁で反射して干渉する。',
    how_3: '全標的が同時に光る位置に波源を動かせば、それが解だ。',
    levels: '关卡',
    records: '纪录',
    won: '定常波',
    lost: '波が消えた',
    won_sub: '全標的が同時に光った',
    lost_sub: 'まだ {n} 個の標的が暗い',
    level_done: '关卡 {n} · {t}秒 · 共鳴 {r}%',
    no_records: 'まだクリア記録がありません',
    toast_win: '定常波！',
    toast_lose: '時間切れ',
  },
};

let lang = 'zh';
let profile = deserializeProfile(readStorage(STORAGE_KEY));
let levelIndex = 0;
let level = null;
let game = null;
let rafId = 0;
let lastTs = 0;
let toastTimer = 0;
let flash = 0;

/* ── 存储 ───────────────────────────────────────────── */

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
    /* 隐私模式下写入失败可忽略 */
  }
}

function saveProfile() {
  writeStorage(STORAGE_KEY, serializeProfile(profile));
}

/* ── 渲染 ───────────────────────────────────────────── */

/** @feature F-013 WebGL2 波场渲染（不可用时自动回退 2D canvas，玩法不受影响） */
const renderer = createRenderer(dom.sea);
// 渲染模式暴露在 DOM 上：浏览器测试据此断言「走的是 WebGL2 而不是回退」
dom.sea.dataset.mode = renderer.mode;
dom.sea.dataset.glError = renderer.glError || '';
/** @feature F-015 三层合成：波场（底）→ 粒子（中）→ 标记（顶） */
const particles = createParticleLayer(dom.fx);

let prevLit = [];

function renderMarkers(game) {
  /** @feature F-016 共鸣点标记层：点亮时爆开光环并给出可见反馈 */
  dom.markers.innerHTML = '';
  for (let i = 0; i < game.targets.length; i += 1) {
    const t = game.targets[i];
    const node = document.createElement('span');
    node.className = game.lit[i] ? 'target is-lit' : 'target';
    node.style.left = `${((t.x + 0.5) / GRID_W) * 100}%`;
    node.style.top = `${((t.y + 0.5) / GRID_H) * 100}%`;
    dom.markers.append(node);
    // 新点亮的共鸣点：爆一圈光环 + 粒子
    if (game.lit[i] && !prevLit[i]) {
      particles.spawnBurst(t.x + 0.5, t.y + 0.5, { count: 20, hue: 158 });
      node.classList.add('just-lit');
    }
  }
  prevLit = game.lit.slice();
  // 波源
  const src = game.sources[0];
  const dot = document.createElement('span');
  dot.className = 'source';
  dot.style.left = `${((src.x + 0.5) / GRID_W) * 100}%`;
  dot.style.top = `${((src.y + 0.5) / GRID_H) * 100}%`;
  dom.markers.append(dot);
}

function renderHud(game) {
  const s = STRINGS[lang];
  dom.hudTime.textContent = String(Math.max(0, Math.ceil(game.timeLeft)));
  dom.hudResonance.textContent = `${Math.round(game.resonance * 100)}%`;
  const lit = game.lit.filter(Boolean).length;
  dom.hudTargets.textContent = `${lit}/${game.targets.length}`;
  dom.meterFill.style.width = `${Math.round(game.resonance * 100)}%`;
}

function renderLevels() {
  dom.levels.innerHTML = '';
  for (let i = 0; i < 5; i += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const rec = profile.progress[String(i)];
    const unlocked = i < profile.unlocked;
    btn.className = unlocked ? 'level-btn' : 'level-btn is-locked';
    btn.disabled = !unlocked;
    btn.textContent = unlocked ? String(i + 1) : '🔒';
    btn.title = rec
      ? STRINGS[lang].level_done.replace('{n}', i + 1).replace('{t}', rec.bestTime.toFixed(1)).replace('{r}', Math.round(rec.bestResonance * 100))
      : (unlocked ? '' : 'locked');
    btn.addEventListener('click', () => {
      levelIndex = i;
      startLevel();
    });
    dom.levels.append(btn);
  }
}

function renderRecords() {
  const s = STRINGS[lang];
  dom.records.innerHTML = '';
  const keys = Object.keys(profile.progress).sort((a, b) => Number(a) - Number(b));
  if (!keys.length) {
    const empty = document.createElement('p');
    empty.className = 'muted small';
    empty.textContent = s.no_records;
    dom.records.append(empty);
    return;
  }
  for (const key of keys) {
    const rec = profile.progress[key];
    const row = document.createElement('div');
    row.className = 'record-row';
    const name = document.createElement('span');
    name.textContent = `${s.level} ${Number(key) + 1}`;
    const time = document.createElement('b');
    time.textContent = `${rec.bestTime.toFixed(1)}s`;
    const res = document.createElement('span');
    res.className = 'record-res';
    res.textContent = `${Math.round(rec.bestResonance * 100)}%`;
    row.append(name, time, res);
    dom.records.append(row);
  }
}

function renderStatic() {
  const s = STRINGS[lang];
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

function showToast(text) {
  dom.toast.textContent = text;
  dom.toast.hidden = false;
  dom.toast.classList.add('is-visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove('is-visible');
    dom.toast.hidden = true;
  }, 2200);
}

/* ── 阶段机 ─────────────────────────────────────────── */

function startLevel() {
  level = createLevel(20261127, levelIndex);
  game = createGame(level);
  dom.overlay.hidden = true;
  lastTs = 0;
  if (!rafId) rafId = requestAnimationFrame(frame);
  renderLevels();
}

function frame(ts) {
  rafId = requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  const dt = Math.min(120, ts - lastTs);
  lastTs = ts;
  if (!game) return;

  const result = tick(game, dt);
  flash = Math.max(0, flash - dt / 700);
  particles.update(dt / 1000);
  renderer.render(game.field, { flash, time: ts / 1000 });
  particles.render();
  renderMarkers(game);
  renderHud(game);

  if (result === 'won') {
    const s = STRINGS[lang];
    flash = 1;
    dom.seaFrame.classList.remove('is-converge');
    void dom.seaFrame.offsetWidth;
    dom.seaFrame.classList.add('is-converge');
    profile = recordClear(profile, levelIndex, game.elapsed, game.resonance);
    saveProfile();
    dom.overlayTitle.textContent = s.won;
    dom.overlaySub.textContent = s.won_sub;
    dom.overlayHint.textContent = s.level_done
      .replace('{n}', levelIndex + 1)
      .replace('{t}', game.elapsed.toFixed(1))
      .replace('{r}', Math.round(game.resonance * 100));
    dom.startBtn.textContent = s.next_level;
    dom.nextBtn.hidden = true;
    dom.overlay.hidden = false;
    showToast(s.toast_win);
    renderLevels();
  } else if (result === 'lost') {
    const s = STRINGS[lang];
    const dark = game.lit.filter((x) => !x).length;
    dom.overlayTitle.textContent = s.lost;
    dom.overlaySub.textContent = s.lost_sub.replace('{n}', dark);
    dom.overlayHint.textContent = '';
    dom.startBtn.textContent = s.start;
    dom.nextBtn.hidden = false;
    dom.overlay.hidden = false;
    showToast(s.toast_lose);
  }
}

/* ── 输入 ───────────────────────────────────────────── */

const KEYS = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
};

document.addEventListener('keydown', (event) => {
  const dir = KEYS[event.code];
  if (!dir) return;
  event.preventDefault();
  /** @feature F-019 输入与手感：键盘 / 触屏都能移动波源 */
  if (game && game.state === 'playing' && moveSource(game, dir[0], dir[1])) {
    particles.spawnSplash(game.sources[0].x + 0.5, game.sources[0].y + 0.5, { count: 6 });
  }
});

dom.startBtn.addEventListener('click', () => {
  if (game && game.state === 'won') {
    levelIndex += 1;
    startLevel();
  } else {
    startLevel();
  }
});

dom.nextBtn.addEventListener('click', () => {
  levelIndex += 1;
  startLevel();
});

dom.langSwitch.addEventListener('click', (event) => {
  const btn = event.target.closest('.lang-btn');
  if (!btn) return;
  lang = btn.dataset.lang;
  writeStorage(LANG_KEY, lang);
  renderStatic();
  renderLevels();
});

// 触屏：拖拽波源
let dragging = false;
function seaPoint(event) {
  const rect = dom.sea.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * GRID_W);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * GRID_H);
  return { x, y };
}
dom.sea.addEventListener('pointerdown', (event) => {
  if (!game || game.state !== 'playing') return;
  dragging = true;
  dom.sea.setPointerCapture(event.pointerId);
  const p = seaPoint(event);
  if (moveSource(game, p.x - game.sources[0].x, p.y - game.sources[0].y)) {
    particles.spawnSplash(game.sources[0].x + 0.5, game.sources[0].y + 0.5, { count: 8 });
  }
});
dom.sea.addEventListener('pointermove', (event) => {
  if (!dragging || !game || game.state !== 'playing') return;
  const p = seaPoint(event);
  if (moveSource(game, p.x - game.sources[0].x, p.y - game.sources[0].y)) {
    particles.spawnSplash(game.sources[0].x + 0.5, game.sources[0].y + 0.5, { count: 4 });
  }
});
dom.sea.addEventListener('pointerup', () => { dragging = false; });
dom.sea.addEventListener('pointercancel', () => { dragging = false; });

// 触屏方向键
dom.hint.addEventListener('click', () => { /* 占位：避免误触 */ });
document.querySelectorAll('.pad-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!game || game.state !== 'playing') return;
    const [dx, dy] = btn.dataset.dir.split(',').map(Number);
    moveSource(game, dx, dy);
  });
});

/* ── 启动 ───────────────────────────────────────────── */

try {
  const saved = readStorage(LANG_KEY);
  if (saved && STRINGS[saved]) lang = saved;
} catch {
  /* 忽略 */
}

renderStatic();
renderLevels();
renderRecords();

// 首屏演示：把第 0 关摆出来，但处于未开始状态
function showTitleScene() {
  level = createLevel(20261127, 0);
  game = createGame(level);
  renderer.render(game.field, { flash: 0, time: 0 });
  renderMarkers(game);
  renderHud(game);
  dom.overlay.hidden = false;
  dom.overlayTitle.textContent = STRINGS[lang].subtitle;
  dom.overlaySub.textContent = STRINGS[lang].how_3;
  dom.overlayHint.textContent = '';
  dom.startBtn.textContent = STRINGS[lang].start;
  dom.nextBtn.hidden = true;
}

showTitleScene();
if (!rafId) rafId = requestAnimationFrame(frame);
