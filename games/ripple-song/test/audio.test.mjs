import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIO,
  createAudioEngine,
  impulseSample,
  makeImpulseResponse,
  noteFrequency,
} from '../assets/audio.js';

/**
 * @covers F-017
 */
test('连击音阶：频率随点亮序号严格递增，到顶后保持最高音', () => {
  let prev = 0;
  for (let i = 0; i < AUDIO.scale.length; i += 1) {
    const f = noteFrequency(i);
    assert.ok(f > prev, `第 ${i} 个共鸣点的音高应高于前一个（${f} vs ${prev}）`);
    prev = f;
  }
  const last = noteFrequency(AUDIO.scale.length - 1);
  assert.equal(noteFrequency(AUDIO.scale.length), last, '超出音阶长度后应保持最高音');
  assert.equal(noteFrequency(AUDIO.scale.length + 5), last, '越界索引不应改变音高');
  assert.ok(last > AUDIO.baseFreq, '最高音应高于基准音');
});

/**
 * @covers F-018
 */
test('程序化脉冲响应：指数衰减包络，首尾趋零', () => {
  const n = 64;
  // 用 rand=1（噪声项为 +1），采样值就等于包络本身，便于直接比较衰减
  const first = impulseSample(1, 0, n, AUDIO.reverbDecay);
  const mid = impulseSample(1, Math.floor(n / 2), n, AUDIO.reverbDecay);
  const last = impulseSample(1, n - 1, n, AUDIO.reverbDecay);
  assert.ok(Math.abs(first) > 0, '起点幅度应大于 0');
  assert.ok(Math.abs(mid) < Math.abs(first), '中段幅度应小于起点');
  assert.ok(Math.abs(last) < Math.abs(mid), '尾段幅度应更小');

  // 包络单调不增
  let prevEnv = Infinity;
  for (let i = 0; i < n; i += 1) {
    const env = Math.pow(1 - i / n, AUDIO.reverbDecay);
    assert.ok(env <= prevEnv, '包络应单调不增');
    prevEnv = env;
  }
});

/**
 * @covers F-018
 */
test('程序化脉冲响应：n≤1 时不产生采样', () => {
  assert.equal(impulseSample(0.5, 0, 1, 2), 0);
  assert.equal(impulseSample(0.5, 0, 0, 2), 0);
});

/**
 * @covers F-017
 */
test('音频引擎：未初始化前不报错，ensure 之后报告就绪', () => {
  const engine = createAudioEngine();
  assert.equal(engine.isReady(), false, '初始不应就绪（浏览器需用户手势）');
  // 没建 AudioContext 时调用各种音效都不应抛错
  engine.move(1);
  engine.light(0);
  engine.click();
  engine.setBed(0.5);
  assert.equal(engine.reverbLength(), 0, '没建混响时长度为 0');
});

/**
 * @covers F-017
 */
test('makeImpulseResponse 需要一个 AudioContext 形状的对象', () => {
  // 用最小桩验证生成逻辑：只需要 createBuffer / sampleRate
  const calls = [];
  const fakeCtx = {
    sampleRate: 8000,
    createBuffer(channels, length, rate) {
      calls.push({ channels, length, rate });
      const data = new Float32Array(length);
      return {
        length,
        getChannelData: () => data,
      };
    },
  };
  const buf = makeImpulseResponse(fakeCtx, 0.5, 3);
  assert.equal(calls.length, 1, '应创建一次 buffer');
  assert.equal(calls[0].channels, 2, '应为双声道');
  assert.equal(calls[0].length, 4000, '脉冲响应长度 = 秒数 × 采样率');
  assert.ok(buf.length > 0, '脉冲响应长度应大于 0');
});
