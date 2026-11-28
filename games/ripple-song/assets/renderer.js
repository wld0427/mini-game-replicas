/**
 * 涟歌 Ripple Song — WebGL2 波场渲染器（阶段 2）
 *
 * 架构约束：**这里只负责「把波场画出来」，不参与任何判定。**
 * 颜色映射（相位→色相、振幅→亮度、色散、泛光、暗角、颗粒）全部是着色，
 * 但点亮 / 胜负 / 计分一律由 src/logic.js 决定 —— 着色器不是规则的第二实现。
 *
 * WebGL2 不可用或着色器编译失败时，回退到 2D canvas 渲染**同一份波场数据**，
 * 玩法完全不受影响。
 */

export const FIELD_TEX_W = 160;
export const FIELD_TEX_H = 90;

/* ── 着色器 ─────────────────────────────────────────── */

const VERT_QUAD = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // 全屏三角形：三个顶点覆盖 [-1,1]
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** 亮部提取 + 水平高斯（一趟）。 */
const FRAG_BRIGHT_H = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uWave;
uniform sampler2D uEnv;
uniform vec2 uTexel;
uniform float uThreshold;

vec3 waveAt(vec2 uv) {
  vec2 w = texture(uWave, uv).rg;
  float amp = length(w);
  float phase = atan(w.y, w.x);
  float glow = min(1.0, texture(uEnv, uv).r * 0.6);
  float lift = pow(clamp(amp * 3.0, 0.0, 1.0), 0.45);
  float hue = fract(0.56 + phase / 6.2831853);
  float sat = 0.48 + 0.40 * amp + 0.12 * glow;
  float val = 0.06 + 0.66 * lift + 0.30 * glow;
  // hsv -> rgb
  vec3 k = vec3(5.0, 3.0, 1.0);
  vec3 p = abs(fract(vec3(hue) + k / 3.0) * 6.0 - 3.0);
  return val * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), sat);
}

void main() {
  vec3 c = waveAt(vUv);
  float glow = texture(uEnv, vUv).r;
  float b = max(max(c.r, c.g), c.b) * (0.35 + 0.65 * glow);
  vec3 bright = c * smoothstep(uThreshold, uThreshold + 0.35, b);

  // 水平高斯（9 抽头）
  vec3 sum = bright * 0.2270270270;
  sum += waveAt(vUv + uTexel * 1.3846153846) * 0.3162162162;
  sum += waveAt(vUv - uTexel * 1.3846153846) * 0.3162162162;
  sum += waveAt(vUv + uTexel * 3.2307692308) * 0.0702702703;
  sum += waveAt(vUv - uTexel * 3.2307692308) * 0.0702702703;
  fragColor = vec4(sum, 1.0);
}`;

/** 垂直高斯（第二趟）。 */
const FRAG_BLUR_V = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uTexel;

void main() {
  vec4 sum = texture(uTex, vUv) * 0.2270270270;
  sum += texture(uTex, vUv + uTexel * 1.3846153846) * 0.3162162162;
  sum += texture(uTex, vUv - uTexel * 1.3846153846) * 0.3162162162;
  sum += texture(uTex, vUv + uTexel * 3.2307692308) * 0.0702702703;
  sum += texture(uTex, vUv - uTexel * 3.2307692308) * 0.0702702703;
  fragColor = sum;
}`;

/** 合成：色散 + 泛光叠加 + 暗角 + 颗粒。 */
const FRAG_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uWave;
uniform sampler2D uEnv;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uTime;
uniform float uFlash;

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

vec3 waveAt(vec2 uv) {
  vec2 w = texture(uWave, uv).rg;
  float amp = length(w);
  float phase = atan(w.y, w.x);
  // 包络（近期峰值）也参与亮度：只看瞬时振幅的话，
  // 远离波源的波会衰减到几乎全黑，整片海面就只剩源附近那一圈
  float glow = min(1.0, texture(uEnv, uv).r * 0.6);
  // 2D 点源的振幅按 1/r 衰减：远处几乎为零，直接映射的话整片海面只剩源附近一圈。
  // 取 gamma 曲线把低幅端抬起来，远处的干涉条纹才读得出来。
  float lift = pow(clamp(amp * 3.0, 0.0, 1.0), 0.45);
  float hue = fract(0.56 + phase / 6.2831853);
  float sat = 0.50 + 0.38 * amp + 0.14 * glow;
  float val = 0.05 + 0.72 * lift + 0.26 * glow;
  return hsv2rgb(vec3(hue, sat, val));
}

void main() {
  vec2 uv = vUv;
  vec2 center = uv - 0.5;
  float r2 = dot(center, center);

  // 三通道色散：越靠边越明显，像水面折射
  float ca = 0.0016 + r2 * 0.010;
  vec3 col;
  col.r = waveAt(uv + center * ca).r;
  col.g = waveAt(uv).g;
  col.b = waveAt(uv - center * ca).b;

  // 泛光
  vec3 bloom = texture(uBloom, uv).rgb;
  col += bloom * 1.05;

  // 驻波收敛瞬间：全屏轻微抬亮
  col += vec3(0.10, 0.16, 0.20) * uFlash;

  // 暗角
  col *= 1.0 - smoothstep(0.16, 0.78, r2);

  // 胶片颗粒
  float n = fract(sin(dot(uv * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * 0.035;

  fragColor = vec4(col, 1.0);
}`;

/* ── 2D 回退渲染（同一份数据） ───────────────────────── */

const FALLBACK_DEEP = [8, 13, 26];
const FALLBACK_SHALLOW = [24, 96, 128];

/**
 * 2D canvas 回退：把波场画成像素图。
 * 与 WebGL 路径读同一份 field 数据，玩法不受影响，只是没那么华丽。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} field
 * @param {Uint8ClampedArray} imageData
 */
export function paintField2D(ctx, field, imageData) {
  const { u, uPrev, env, obstacles } = field;
  const px = imageData.data;
  for (let i = 0; i < u.length; i += 1) {
    const o = i * 4;
    if (obstacles[i]) {
      px[o] = 14; px[o + 1] = 17; px[o + 2] = 30; px[o + 3] = 255;
      continue;
    }
    const v = u[i];
    const phase = Math.atan2(uPrev[i], v);
    const hue = 196 + (phase / Math.PI) * 88;
    const amp = Math.min(1, Math.abs(v) * 3.4);
    const glow = Math.min(1, env[i] * 0.6);
    const sat = 0.30 + 0.55 * amp + 0.15 * glow;
    const val = 0.07 + 0.80 * amp + 0.30 * glow;
    const rgb = hsv2rgb(hue / 360, Math.min(1, sat), Math.min(1, val));
    px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * HSV → RGB。
 * @param {number} h 0..1
 * @param {number} s 0..1
 * @param {number} v 0..1
 * @returns {[number, number, number]}
 */
export function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const table = [
    [v, t, p], [q, v, p], [p, v, t],
    [p, q, v], [t, p, v], [v, p, q],
  ][i % 6];
  return [
    Math.round(table[0] * 255),
    Math.round(table[1] * 255),
    Math.round(table[2] * 255),
  ];
}

/* ── WebGL2 渲染器 ──────────────────────────────────── */

/**
 * 创建渲染器。WebGL2 不可用时自动回退 2D canvas。
 * @param {HTMLCanvasElement} canvas
 * @returns {{mode: 'webgl2'|'2d', render: (field: object, opts?: object) => void, resize: () => void, dispose: () => void, glError: string}}
 */
export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });

  if (!gl) return createFallback(canvas);

  let programs = null;
  let glError = '';
  try {
    // 三趟渲染各用自己的 program（一个 program 只能挂一个片元着色器）
    programs = {
      bright: buildProgram(gl, FRAG_BRIGHT_H),
      blur: buildProgram(gl, FRAG_BLUR_V),
      composite: buildProgram(gl, FRAG_COMPOSITE),
    };
  } catch (err) {
    glError = String(err && err.message ? err.message : err);
    // 着色器编译失败 → 同样回退，玩法不受影响
    return createFallback(canvas, glError);
  }

  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);

  const waveTex = createFloatTexture(gl, FIELD_TEX_W, FIELD_TEX_H, gl.RG32F, gl.RG);
  const envTex = createFloatTexture(gl, FIELD_TEX_W, FIELD_TEX_H, gl.R32F, gl.RED);
  const brightTex = createFloatTexture(gl, FIELD_TEX_W / 2, FIELD_TEX_H / 2, gl.RGBA16F, gl.RGBA);
  const blurTex = createFloatTexture(gl, FIELD_TEX_W / 2, FIELD_TEX_H / 2, gl.RGBA16F, gl.RGBA);

  const brightFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, brightFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, brightTex, 0);
  const blurFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, blurFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blurTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const uBright = uniforms(gl, programs.bright, ['uWave', 'uEnv', 'uTexel', 'uThreshold']);
  const uBlur = uniforms(gl, programs.blur, ['uTex', 'uTexel']);
  const uComp = uniforms(gl, programs.composite, ['uWave', 'uEnv', 'uBloom', 'uResolution', 'uTime', 'uFlash']);

  const waveData = new Float32Array(FIELD_TEX_W * FIELD_TEX_H * 2);
  const envData = new Float32Array(FIELD_TEX_W * FIELD_TEX_H);
  const linear = !!gl.getExtension('OES_texture_float_linear');

  function resize() {
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();

  function render(field, opts) {
    const options = opts || {};
    const flash = typeof options.flash === 'number' ? options.flash : 0;
    const time = typeof options.time === 'number' ? options.time : 0;

    // 上传波场：RG = (u, uPrev)，R = 包络
    const { u, uPrev, env } = field;
    for (let i = 0; i < u.length; i += 1) {
      waveData[i * 2] = u[i];
      waveData[i * 2 + 1] = uPrev[i];
      envData[i] = env[i];
    }
    gl.bindTexture(gl.TEXTURE_2D, waveTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FIELD_TEX_W, FIELD_TEX_H, gl.RG, gl.FLOAT, waveData);
    gl.bindTexture(gl.TEXTURE_2D, envTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FIELD_TEX_W, FIELD_TEX_H, gl.RED, gl.FLOAT, envData);

    // 1) 亮部 + 水平模糊 → brightFbo
    gl.bindFramebuffer(gl.FRAMEBUFFER, brightFbo);
    gl.viewport(0, 0, FIELD_TEX_W / 2, FIELD_TEX_H / 2);
    gl.useProgram(programs.bright);
    gl.bindVertexArray(quad);
    bindTex(gl, uBright.uWave, 0, waveTex);
    bindTex(gl, uBright.uEnv, 1, envTex);
    gl.uniform2f(uBright.uTexel, 1 / FIELD_TEX_W, 1 / FIELD_TEX_H);
    gl.uniform1f(uBright.uThreshold, 0.18);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) 垂直模糊 → blurFbo
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurFbo);
    gl.useProgram(programs.blur);
    gl.bindTexture(gl.TEXTURE_2D, brightTex);
    gl.uniform1i(uBlur.uTex, 0);
    gl.uniform2f(uBlur.uTexel, 1 / (FIELD_TEX_W / 2), 1 / (FIELD_TEX_H / 2));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 3) 合成 → 屏幕
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(programs.composite);
    bindTex(gl, uComp.uWave, 0, waveTex);
    bindTex(gl, uComp.uEnv, 1, envTex);
    bindTex(gl, uComp.uBloom, 2, blurTex);
    gl.uniform2f(uComp.uResolution, canvas.width, canvas.height);
    gl.uniform1f(uComp.uTime, time);
    gl.uniform1f(uComp.uFlash, flash);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    mode: 'webgl2',
    linear,
    glError,
    render,
    resize,
    dispose() {
      gl.deleteTexture(waveTex);
      gl.deleteTexture(envTex);
      gl.deleteTexture(brightTex);
      gl.deleteTexture(blurTex);
      gl.deleteFramebuffer(brightFbo);
      gl.deleteFramebuffer(blurFbo);
      gl.deleteProgram(programs.bright);
      gl.deleteProgram(programs.blur);
      gl.deleteProgram(programs.composite);
    },
  };
}

/**
 * 2D canvas 回退渲染器。
 * @param {HTMLCanvasElement} canvas
 * @param {string} [reason]
 */
function createFallback(canvas, reason) {
  /** @feature F-014 2D canvas 回退：WebGL2 不可用或着色器编译失败时渲染同一份波场数据 */
  const ctx = canvas.getContext('2d');
  canvas.width = 160;
  canvas.height = 90;
  const image = ctx.createImageData(160, 90);
  return {
    mode: '2d',
    linear: false,
    glError: reason || 'webgl2-unavailable',
    render(field) {
      paintField2D(ctx, field, image);
    },
    resize() { /* 2D 画布固定 160×90，由 CSS 拉伸 */ },
    dispose() { /* 无 GPU 资源 */ },
  };
}

/**
 * 用指定的片元着色器编译并链接一个 program。
 * @param {WebGL2RenderingContext} gl
 * @param {string} fragSource
 * @returns {WebGLProgram}
 */
function buildProgram(gl, fragSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_QUAD);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`program link failed: ${log}`);
  }
  return prog;
}

/**
 * 编译单个着色器，出错时抛出（含 info log）。
 * @param {WebGL2RenderingContext} gl
 * @param {number} type
 * @param {string} source
 */
function compileShader(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

/**
 * 取 uniform 位置。
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLProgram} prog
 * @param {string[]} names
 */
function uniforms(gl, prog, names) {
  const out = {};
  for (const name of names) out[name] = gl.getUniformLocation(prog, name);
  return out;
}

/**
 * 绑定纹理到纹理单元。
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLUniformLocation|null} loc
 * @param {number} unit
 * @param {WebGLTexture} tex
 */
function bindTex(gl, loc, unit, tex) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (loc) gl.uniform1i(loc, unit);
}

/**
 * 建一张浮点纹理。
 * @param {WebGL2RenderingContext} gl
 * @param {number} w
 * @param {number} h
 * @param {number} internalFormat
 * @param {number} format
 */
function createFloatTexture(gl, w, h, internalFormat, format) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  void format;
  return tex;
}
