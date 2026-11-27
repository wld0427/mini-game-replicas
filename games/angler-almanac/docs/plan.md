# 开发计划 — Angler's Almanac 渔汛录

> 本轮性质：**存量修复**（审计 → 修缺陷 → 补盲区 → 建追溯体系 → 过门禁）。
> 规则：每个阶段都有可执行的验收命令；命令的期望输出必须与实际一致，否则阶段不算完成。
> 质量优先于数量：任何阶段的验收不过，**不得进入下一阶段**，更不得开始下一款游戏。

---

### 阶段 1：修机制失效（起竿窗口判负）

**要解决的问题**：审计 A-1 —— `onHookTimeout` 是死代码，`later()` 只在咬钩前调用一次，倒计时只写进文字从不参与判定。迟到 7.5 秒仍能起竿成功。连带后果：失误统计恒为 0、「鱼跑掉了」文案不可达、卷线器升级零作用。

**改动点**：

- `src/logic.js`：新增 `hookWindowOpen(deadline, now)` 纯函数，作为「窗口是否有效」的唯一口径。
- `assets/app.js`：`onBite` 里 `later(() => onHookTimeout(), window)` 安排超时；`doHook` 入口用 `hookWindowOpen(biteDeadline, performance.now())` 兜底；`loop()` 里在 `bite` 阶段比对 `ts > biteDeadline` 直接判负。

**验收命令**：

```bash
cd /workspace/mini-game-replicas/games/angler-almanac
node --test "test/*.test.mjs"
```

**期望输出**：

```
# tests 50
# pass 50
# fail 0
```

其中 `D-1 咬钩后错过起竿窗口会判负` 与 `D-2 卷线器等级会真实改变起竿窗口长度` 两条用例必须为 `ok`。

**完成标准**：

- [x] `hookWindowOpen` 落在 `src/logic.js`，不引用任何浏览器 API
- [x] 超时定时器已安排，且 `doHook` 有兜底判定
- [x] `loop()` 在窗口过期时立即判负，不等下一帧
- [x] 端到端用例证明「窗口过期 → 阶段变 result + 失手计数 +1」

---

### 阶段 2：修半成品与交互缺失

**要解决的问题**：审计 B-1~B-5（5 项半成品）+ C-1~C-3（3 项交互缺失）。

**改动点**：

| 编号 | 问题 | 落点 |
| --- | --- | --- |
| B-1 | 饵 Lv.5 显示 `undefined Lv.5` | `i18n.js` `depth_name` 补第 5 项「极渊 / Deepest / 極淵」 |
| B-2 | 饵「等待更久」与实现相反 | `i18n.js` `upgrade_bait_desc` 改为「等待更短、起竿窗口更窄」 |
| B-3 | 幸运漏加权稀有档 | `logic.js` `LUCK` 补 `rare: 0.24` 并对 `weights.r` 加权 |
| B-4 | 断线后产物卡剧透鱼种体长 | `app.js` `renderCatch()` 失败时改用 `escaped_name` / `escaped_size` |
| B-5 | 跳过链接硬编码中文 | `index.html` 加 `data-i18n="skip_to_stage"` |
| C-2 | 遛鱼命中无视觉反馈 | `app.js` `renderReel()` 加 `is-hit`/`is-miss` 类 + `reel_combo` 连击计数 |
| C-3 | 投竿/失误/断线统计不展示 | `index.html` 统计栏补三项 + `app.js` `renderStats()` 补渲染 |

**验收命令**：

```bash
cd /workspace/mini-game-replicas/games/angler-almanac
node --test "test/*.test.mjs"
grep -rn "undefined" assets/i18n.js | grep -v "undefined Lv" || echo "i18n 无 undefined"
```

**期望输出**：

```
# tests 50
# pass 50
# fail 0
i18n 无 undefined
```

**完成标准**：

- [x] 饵 Lv.5 的水层名在三语里都存在
- [x] 饵的文案与实现一致（等待更短 / 窗口更窄）
- [x] `LUCK` 覆盖全部 5 个档位，`rarityWeights` 对 `r` 档加权
- [x] 失败结算不显示鱼种名与体长
- [x] 命中甜区有视觉反馈与连击计数
- [x] 统计栏展示抛竿 / 失手 / 断线三项

---

### 阶段 3：打磨（配色语义 / 重复提示 / 场景密度）

**要解决的问题**：审计「打磨度」三项 + 两处自相矛盾。

**改动点**：

1. **张力配色语义统一**（原问题：填充条把绿→黄→红渐变铺在自身宽度上，张力只有 20% 时末端就已经是红的，看上去像「危险」，而轨道自己的危险区在 62% 之后，两套红打架）
   - `src/logic.js`：新增 `TENSION_ZONE = { safe: 55, warn: 80 }` 与 `tensionZone(tension)`，作为唯一分区口径。
   - `app.css`：轨道改为三段硬边界色带；填充条改为**实色**，颜色由 `[data-zone]` 决定。
   - `app.js`：`renderReel()` 读取 `tensionZone()` 写入 `data-zone`。
2. **消除同屏重复提示**（原问题：遛鱼提示「标记进入绿区时点击收线」同时出现在场景状态区与遛鱼面板顶部）
   - `app.js`：场景状态区改显示**定性**分区提示（`reelStatusText()`），遛鱼面板保留操作提示，张力标签显示**定量**读数（`reelTensionText()`）。
3. **提升场景信息密度**（原问题：1280×250 的水面场景只放了一个很小的浮标，操作信息全挤在下方竖条 + 张力条里）
   - `index.html`：新增 SVG 叠加层（钓线）、鱼影元素、场景水层徽标。
   - `app.js`：新增 `renderSceneFight(zone, tension)`，把张力翻译成「鱼在往哪跑」。
4. **三语补齐**：新增 `tension_safe` / `tension_warn` / `tension_danger` 三语文案。

**验收命令**：

```bash
cd /workspace/mini-game-replicas/games/angler-almanac
node --test "test/*.test.mjs"
node --check assets/app.js && node --check src/logic.js
```

**期望输出**：

```
# tests 50
# pass 50
# fail 0
```

**完成标准**：

- [x] 填充条颜色由分区决定，与轨道色带边界一致
- [x] 场景状态区与遛鱼面板不再重复同一句话
- [x] 遛鱼阶段场景里有鱼影与钓线，且随张力变化
- [x] 三语都补齐了张力分区文案

---

### 阶段 4：补测试盲区并建立四向追溯

**要解决的问题**：审计 D-1~D-4 —— 冒烟测试每次咬钩都立刻起竿，「等窗口过期」的路径从未被覆盖；`onHookTimeout` 死掉半年也不会变红。

**改动点**：

- 新增 5 条端到端用例：D-1 超时判负、D-2 卷线器真实加宽窗口、D-3 断线不剧透、D-4 饵 Lv.5 渲染、遛鱼命中反馈 + 张力分区一致性。
- 代码标记 `@feature F-xxx`（`src/logic.js` 14 处、`assets/app.js` 12 处）。
- 测试标记 `@covers F-xxx`（`test/logic.test.mjs` 43 处、`test/smoke.test.mjs` 7 处）。
- 文档：`docs/proposal.md`、`docs/design.md`、`docs/plan.md`、`docs/acceptance.md`。

**验收命令**：

```bash
cd /workspace/mini-game-replicas
node scripts/feature-trace.mjs games/angler-almanac
node scripts/gate.mjs games/angler-almanac
```

**期望输出**：

```
── angler-almanac ── 功能 16 项，追溯完整 16 项
  ✅ F-001 … ✅ F-016
✓ 功能追溯矩阵完整：无缺失实现、无缺失测试、无缺失验收、无孤儿实现。

✓ 总门禁通过。
```

**完成标准**：

- [x] 16 个功能 ID 在设计 → 实现 → 测试 → 验收四处全部对齐
- [x] 没有孤儿实现（代码里有 `@feature` 但设计文档没登记）
- [x] 每条审计 D 项都有对应的端到端用例
- [x] `node scripts/gate.mjs games/angler-almanac` 退出码为 0
