/**
 * 涟歌 Ripple Song — 音频与手感层（阶段 3）
 *
 * 全部声音**现场合成**，零音频文件。
 *
 * 架构约束：音频只负责「反馈」，**不参与任何判定** ——
 * 点亮与否永远由 src/logic.js 的振幅包络说了算。
 *
 * 可单测的部分（音阶频率、脉冲响应包络）写成纯函数，与浏览器 API 分离；
 * 真正需要 AudioContext 的部分封装在 createAudioEngine() 里。
 */

/** 音频调参。 */
export const AUDIO = {
  /** 基准频率（C5）。 */
  baseFreq: 523.25,
  /** 连击音阶（半音偏移）：每点亮一个共鸣点，音高往上走一级。 */
  scale: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22],
  /** 混响时长（秒）与衰减指数。 */
  reverbSeconds: 2.4,
  reverbDecay: 2.8,
  /** 底噪增益。 */
  bedGain: 0.05,
};

/**
 * 连击音阶频率：随点亮序号**严格递增**（到顶后保持在最高音）。
 * @param {number} index 第几个被点亮的共鸣点（从 0 起）
 * @param {number} [base] 基准频率
 * @returns {number} 频率（Hz）
 */
export function noteFrequency(index, base = AUDIO.baseFreq) {
  const i = Math.max(0, Math.floor(index));
  const semis = AUDIO.scale[Math.min(i, AUDIO.scale.length - 1)];
  return base * Math.pow(2, semis / 12);
}

/**
 * 脉冲响应的单个采样点：指数衰减包络乘白噪声。
 * @param {number} rand [0,1) 随机数
 * @param {number} i 当前采样序号
 * @param {number} n 总采样数
 * @param {number} decay 衰减指数（越大衰减越快）
 * @returns {number} 采样值
 */
export function impulseSample(rand, i, n, decay) {
  if (n <= 1) return 0;
  const env = Math.pow(1 - i / n, decay);
  return (rand * 2 - 1) * env;
}

/**
 * 生成程序化脉冲响应（混响用），不加载任何音频文件。
 * @param {BaseAudioContext} ctx
 * @param {number} [seconds] 时长
 * @param {number} [decay] 衰减指数
 * @returns {AudioBuffer}
 */
export function makeImpulseResponse(ctx, seconds = AUDIO.reverbSeconds, decay = AUDIO.reverbDecay) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      data[i] = impulseSample(Math.random(), i, length, decay);
    }
  }
  return buffer;
}

/**
 * 创建音频引擎。
 *
 * 音频链：声源 → 卷积混响（程序化脉冲响应）→ 动态压缩 → 输出。
 * 浏览器要求首次播放前有用户手势，所以 `ensure()` 只在交互时调用。
 *
 * @returns {object}
 */
export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let convolver = null;
  let compressor = null;
  let bedGain = null;
  let bedSource = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
      return null;
    }

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;
    compressor.connect(ctx.destination);

    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulseResponse(ctx);
    convolver.connect(compressor);

    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(convolver);

    return ctx;
  }

  /** 播一个带包络的振荡器音。 */
  function tone(freq, duration, type = 'sine', gainValue = 0.16, delay = 0) {
    if (!ctx) return 0;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gainValue, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
    return freq;
  }

  return {
    /** 音频是否已就绪（用于测试与调试）。 */
    isReady() {
      return !!ctx;
    },
    /** 混响脉冲响应的长度（采样数），0 表示还没建。 */
    reverbLength() {
      return convolver && convolver.buffer ? convolver.buffer.length : 0;
    },
    ensure,
    setMuted(v) {
      muted = !!v;
      if (master) master.gain.value = muted ? 0 : 0.85;
    },

    /** 波源移动：一声短促的轻响，音高随移动方向微调。 */
    move(direction = 0) {
      ensure();
      const base = 320 + direction * 22;
      tone(base, 0.09, 'triangle', 0.075);
      tone(base * 2, 0.05, 'sine', 0.03, 0.012);
    },

    /** 共鸣点点亮：清亮的铃音，**音高随连击序号上行**。 */
    light(index = 0) {
      ensure();
      const f = noteFrequency(index);
      tone(f, 0.62, 'sine', 0.2);
      tone(f * 2.01, 0.34, 'sine', 0.075, 0.012);
      tone(f * 3.02, 0.2, 'triangle', 0.035, 0.03);
      return f;
    },

    /** 驻波收敛：上行和弦垫底。 */
    converge() {
      ensure();
      const root = noteFrequency(0);
      tone(root, 1.5, 'sine', 0.16);
      tone(root * 1.5, 1.4, 'sine', 0.12, 0.06);
      tone(root * 2, 1.3, 'sine', 0.1, 0.12);
      tone(root * 3, 1.1, 'triangle', 0.055, 0.2);
    },

    /** 失败：下滑音。 */
    lose() {
      ensure();
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, t0);
      osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.7);
      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.exponentialRampToValueAtTime(0.13, t0 + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.75);
      osc.connect(amp);
      amp.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.78);
    },

    /** 界面点击。 */
    click() {
      ensure();
      tone(880, 0.05, 'square', 0.04);
    },

    /** 波场底噪：滤波白噪，增益随共鸣值上升。 */
    setBed(intensity = 0) {
      ensure();
      if (!ctx) return;
      const amount = Math.max(0, Math.min(1, intensity));
      if (!bedSource) {
        const length = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
        bedSource = ctx.createBufferSource();
        bedSource.buffer = buffer;
        bedSource.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        bedGain = ctx.createGain();
        bedGain.gain.value = 0;
        bedSource.connect(filter);
        filter.connect(bedGain);
        bedGain.connect(master);
        bedSource.start();
      }
      bedGain.gain.setTargetAtTime(AUDIO.bedGain * amount, ctx.currentTime, 0.25);
    },

    /** 停止底噪。 */
    stopBed() {
      if (bedGain && ctx) bedGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    },

    dispose() {
      if (bedSource) {
        try { bedSource.stop(); } catch { /* 已停止 */ }
        bedSource = null;
      }
      if (ctx) ctx.close();
      ctx = null;
    },
  };
}
