# 开发计划 — 涟歌 Ripple Song

## 总览

本项目按 **4 个阶段**推进，**一轮只推进一步**，前一阶段的验收命令跑绿才允许开下一阶段。

不可动摇的架构约束：

> **波场模拟在 JS 里跑（`src/logic.js`），GPU 只负责把波场画出来。绝不让 shader 成为规则的第二实现。**

| 阶段 | 目标 | 产出 |
| --- | --- | --- |
| 1 | 核心逻辑层：波场积分 + 规则 + 单测 | `src/logic.js` `test/logic.test.mjs` |
| 1+ | 页面骨架 + **2D canvas 回退渲染**（设计里本来就要求的降级路径，先做它） | `index.html` `assets/app.css` `assets/app.js` `test/helpers.mjs` |
| 2 | 主渲染路径：WebGL2 波场 + 粒子层 + 标记层动效 | `assets/renderer.js` `assets/fx.js` |
| 3 | 音频与手感层 | `assets/audio.js` |
| 4 | 交付验收：双端截图 + 验收记录 + 部署 | `docs/acceptance.md` `docs/shots/` + 部署 URL |

> 阶段 1+ 把 2D canvas 回退先做出来了：它本来就是设计里「WebGL2 不可用时的降级路径」，
> 提前做掉既让阶段 1 就有可玩可截图的东西，也把回退路径提前验证了，
> 阶段 2 只需要在其上叠加 WebGL2 主路径。

## 阶段

### 阶段 1：核心逻辑层

**做什么**：把「波场怎么演化、目标怎么算点亮、胜负怎么判」全部落在 `src/logic.js`：

1. `createField()` —— 160×90 的 `u` / `uPrev` / `env` 三份 Float32Array + 礁石掩码。
2. `stepWave(field, sources, t)` —— 显式积分 `u_next = (2u − u_prev + C²∇²u) × damp`，
   吸收边界（网格外与礁石格恒为 0），源格写入相干正弦驱动。
3. `updateEnvelope(field)` —— 峰值保持 + 每步衰减的振幅包络。
4. `createLevel(seed, index)` —— 生成礁石布局，用「标准解」源位置模拟一次，
   从包络的局部极大值里取共鸣点（**保证这一关有解**）。
5. `moveSource()` / `evaluateTargets()` / `checkWin()` / `checkLose()` / `resonanceScore()` / `tick()`。
6. `serializeProfile()` / `deserializeProfile()` —— 存档与脏数据回退。
7. 每个规则留 `/** @feature F-0xx */`，每条测试留 `/** @covers F-0xx */`。

**产出文件**：`games/ripple-song/src/logic.js`、`games/ripple-song/test/logic.test.mjs`

**验收命令**：

```bash
cd games/ripple-song && node --test "test/*.test.mjs"
node scripts/review.mjs games/ripple-song
```

**期望输出**：

```
# tests 24
# pass 24
# fail 0

✓ 静态审查通过：检查了 1 个项目，未发现问题。
```

**完成标准**：测试全绿、静态审查 0 问题；难度契约三档路线各有断言
（参考路线能通关 / 随机 200 次走位 0 次通关 / 挂机必败且不得分）；
页面骨架能起来、波场能画出来、双端截图已人工看过。

**阶段 1 产出（已完成）**：`src/logic.js`（23 条测试全绿）、
`index.html` + `assets/app.css` + `assets/app.js`（2D canvas 波场渲染 + HUD + 键鼠/触屏输入）、
`test/helpers.mjs`、`README.md`、`docs/{proposal,design,plan}.md`。
**阶段 1 的两个关键设计修正**（都是被单测逼出来的）：
① 关卡必须区分「起点」与「标准解」—— 早期版本让玩家开局就站在解上，**挂机直接通关**；
② **分数只在过关时结算** —— 过程中显示的是共鸣值，否则挂机也能拿到分。

---

### 阶段 2：渲染层

**做什么**：把阶段 1 的波场画出来。

1. `assets/renderer.js` —— WebGL2 + GLSL ES 3.00：相位→色相循环、振幅→亮度、
   三通道色散、两级高斯泛光、暗角与颗粒。着色器内联在 JS 里，零构建。
2. 2D canvas 回退 —— WebGL2 不可用或着色器编译失败时，渲染**同一份波场数据**。
3. `assets/fx.js` —— 2D 粒子层（波源涟漪飞溅）+ DOM 标记层（共鸣点菱形、光环）。
4. `index.html` / `assets/app.css` —— 三层容器、HUD（倒计时 / 共鸣值仪表）、触屏拖拽。

**产出文件**：`games/ripple-song/assets/renderer.js`、`assets/fx.js`、`assets/app.css`、`index.html`

**验收命令**：

```bash
cd games/ripple-song && node --test "test/*.test.mjs"
node scripts/review.mjs games/ripple-song
```

**期望输出**：

```
# tests 30
# pass 30
# fail 0

✓ 静态审查通过：检查了 1 个项目，未发现问题。
```

**完成标准**：测试全绿；WebGL2 着色器在浏览器内编译无错、info log 为空、中心像素非黑；
2D 回退路径可用。

---

### 阶段 3：音频与手感层

**做什么**：

1. `assets/audio.js` —— WebAudio 现场合成：波场底噪（滤波噪声 + LFO）、点亮泛音（频率随目标序号上行）、
   驻波收敛和弦、失败下滑音。
2. 程序化混响 —— 代码生成脉冲响应送入 `ConvolverNode`，外加 `DynamicsCompressor`。
3. 手感层 —— 震屏（CSS transform）、连击音阶、过关泛光抬升。

**产出文件**：`games/ripple-song/assets/audio.js`、`assets/app.js`

**验收命令**：

```bash
cd games/ripple-song && node --test "test/*.test.mjs"
node scripts/review.mjs games/ripple-song
```

**期望输出**：

```
# tests 34
# pass 34
# fail 0

✓ 静态审查通过：检查了 1 个项目，未发现问题。
```

**完成标准**：测试全绿；音频零外部文件（断言无音频资源请求）；连击音频率严格递增。

---

### 阶段 4：交付验收

**做什么**：

1. 桌面 + 移动双端截图**人工看过**，逐条核对布局错位 / 遮挡 / 文字截断 / 按钮反馈 / 音效。
2. 发现的问题**当场改代码**，不只写进「已知问题」。
3. 写 `docs/acceptance.md` 逐条记录 20 项功能的验收结果。
4. 部署并 curl 验证 200。

**产出文件**：`games/ripple-song/docs/acceptance.md`、`docs/shots/*.png`

**验收命令**：

```bash
node scripts/gate.mjs games/ripple-song
curl -s -o /dev/null -w '%{http_code}\n' https://<部署域名>/
```

**期望输出**：

```
  ✓ 静态代码审查 — 检查了 1 个项目，未发现问题
  ✓ 立项评审 + 设计文档 + 开发计划
  ✓ 功能追溯矩阵（设计 ↔ 实现 ↔ 测试 ↔ 验收）
  ✓ 全量测试
  ✓ 追踪表登记完整

✓ 总门禁通过。
```

**完成标准**：总门禁退出码 0；20 项功能四向追溯完整；双端截图已人工看过；部署后首页 200。

## 阶段门禁规则

- 阶段 1 不绿 → 不许写渲染层（规则没稳，画出来的东西没法验证）。
- 阶段 2 不绿 → 不许写音频层。
- 阶段 3 不绿 → 不许写验收记录。
- 阶段 4 不绿 → **不许交付**。

## 风险登记

| 风险 | 概率 | 影响 | 应对 |
| --- | --- | --- | --- |
| 着色器写成规则的第二实现 | 中 | 高 | 渲染层只读 `field` 的数据，**不参与任何判定**；判定全在 `logic.js`，单测只测逻辑层 |
| 定步长积分在低帧率下发散 | 低 | 高 | `C² = 0.25`（远小于 0.5 上限）+ 每步阻尼 + 单帧步数上限 |
| 关卡无解（目标点摆歪了） | 中 | 高 | 关卡生成用「标准解」模拟产出目标，**生成即保证有解**，并有单测守着 |
| 驻波解太刁钻玩家解不出 | 中 | 中 | 共鸣值仪表显示离阈值多远；关卡随进度增加目标数而非提高单点精度 |
| 低端机 WebGL2 跑不动 | 中 | 中 | 网格可降级到 120×68；2D canvas 回退 |
