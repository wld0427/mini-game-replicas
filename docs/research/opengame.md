# 调研：nexu-io/opengame

> 调研日期：2026-11-27 · 目标仓库：<https://github.com/nexu-io/opengame>
> 结论摘要：**不引入其运行时，采纳其「方法论」与「选品目录」。**

---

## 1. 这是什么

| 项 | 值 |
| --- | --- |
| 定位 | 「Super Game Agent」——把 Claude Code / Codex / DeepSeek 等本地 Agent 变成全栈 AI 游戏工作台 |
| 仓库 | `nexu-io/opengame` · Apache-2.0 · TypeScript |
| 热度 | **1242 star / 209 fork**，2026-11-25 建仓，两天内仍在高频提交 |
| 体积 | 约 1.0 GB（`size` 1,039,384 KB），大量 Git LFS 素材 |
| 核心资产 | ① **277 款可玩游戏模板** ② **17 份 AI 工程手册** ③ 12 个 `openmotion_game_*` MCP 工具 ④ Game Studio 本地工作台 |

一句话：**它就是「让 Agent 批量生产小游戏」的完整工业化流水线**，与我们手工作坊做的事在目标上高度重合。

---

## 2. 三个可复用资产

### 2.1 277 款游戏模板 = 现成的「选品目录」

`templates/games/` 下实有 **277 个目录**（README 只宣称 25 款「精选」，实际是全量投放）。每款带 `game.json`：

```json
{
  "id": "hanzi-brain-spot",
  "title": "Hanzi Brain Spot",
  "description": "Dissect Chinese characters, spot hilarious visual puns...",
  "genre": "casual", "style": "minimal", "orientation": "portrait",
  "controls": "Tap strokes, radicals, or hidden scene clues...",
  "tags": ["TOP赚钱"],
  "i18n": { "zh-CN": { "title": "汉字脑洞找茬", "description": "抖音全民爆火汉字脑洞找茬：..." } }
}
```

元数据分布（已全量抓取 277/277）：

| 维度 | 分布 |
| --- | --- |
| 体裁 | casual 192 / shooter 36 / platformer 25 / racing 12 / story 10 / horror 2 |
| 朝向 | **portrait 225（9:16，微信/抖音风）** / landscape 52 |
| 标签 | 246 款标记 `TOP赚钱`（已验证的变现型机制） |

**对本项目的价值**：我们此前靠随机搜网找「有趣的小游戏」，选品质量不可控。改成从这 277 个**已商业验证**的玩法机制里挑，等于把选品从「搜索」变成「查表」。

### 2.2 17 份工程手册 = 我们流程的现成参照

`skills/openmotion-game/references/`，全部为可读 Markdown：

| 文件 | 内容 | 与我们的对应 |
| --- | --- | --- |
| `game-brief.md` | 立项/设计文档标准（9 章节 + 硬性契约） | ← `docs/process/功能设计文档模板.md` |
| `game-gates.md` | 质量门禁 + 止损规则 | ← `docs/process/README.md` 四道门禁 |
| `review-rubric.md` | 交付前审查评分表（9 条机械项） | ← `scripts/review.mjs` + `docs/audit/*` |
| `game-genres.md` | **5 大核心循环引擎** + 各自 Target Bar / Hard Fails | ← 立项评审模板（**我们缺**） |
| `game-flow.md` | 运行时选择、`logic.js` 契约、模拟三层 | ← 我们已定的分层架构 |
| `game-feel-craft.md` | 手感打磨（3C 反馈通道） | ← 打磨清单 |
| `game-lookup.md` | **参考游戏调研协议** | ← 我们「只复刻玩法不复制源码」的原则 |
| `game-audio.md` / `game-2d-animation.md` / `game-3d-animation.md` / `game-stylization.md` / `game-textures.md` / `game-procedural-animation.md` / `game-3c-modules.md` / `game-playable-ad.md` | 专项手册 | 参考 |

来源合法：`PROVENANCE.md` 明确——`game-brief / game-gates / game-3c-modules / game-feel-craft / game-lookup` 是**为 OpenMotion 独立撰写的原创文本**，非移植；其余端口来自 MIT 许可的 higgsfield-ai/skills。

### 2.3 `arcade-2d` 起步骨架 = 我们的架构原型

`templates/game-kits/arcade-2d/` 只有 4 个文件：

```
index.html   client.js (10 KB)   logic.js (7 KB)   style.css (1.4 KB)
```

**和我们一模一样的分层**：`logic.js`（确定性规则）+ `client.js`（表现）+ `style.css` + 零依赖静态页。我们当初定的「核心规则必须落在 `src/logic.js`、不碰浏览器 API」不是土规矩，是行业通行做法——手册里还补了一条我们该抄的：

> 规则/分数/回合制游戏 → 确定性 `logic.js` + `simulate`；高实体密度 3D/物理沙盒 → 模块化 ESM + `runSelfTests`。
> **绝不为了迁就 `simulate` 而造一个假的 `logic.js` 桩。**

---

## 3. 它的工程手册里，有 6 条我们流程还没有的硬东西

这才是本次调研真正的产出。对照我们 `docs/process/`：

| # | 它的做法 | 我们现状 | 建议 |
| --- | --- | --- | --- |
| 1 | **核心循环引擎分类**：`puzzle-pressure` / `strategy-combo` / `skill-flow` / `progression-rng` / `sandbox-explore`，每类有固定的 Target Bar 与 Hard Fails | 立项评审只有 6 维评分，没有体裁锚点 | **立项评审模板增加必填字段**：引擎类型 + 该类型的 Target Bar + 3–5 条 Hard Fail |
| 2 | **每款游戏必须写明 1 个 Signature Twist + 1 个 Peak Moment**，且「Twist 必须是可玩的，不是装饰」 | 无 | 立项评审模板增加这两栏 |
| 3 | **三段式难度契约**：① 参考路线能通关 ② 弱化路线会挣扎/失败 ③ 挂机路线会明确失败 | 我们只有「能玩」和「不崩」 | **补一维测试**：每款游戏至少一条「弱玩家会失败」的可判定用例（这正是angler-almanac 旧冒烟测试的病根） |
| 4 | **单一 `config` 块**（4–6 个最高杠杆手感参数集中一处） | 我们的调参散落在 `logic.js` 顶部常量 | 保持现状即可，但**立项时就要写明哪 4–6 个参数是杠杆** |
| 5 | **P0/P1/P2 严重度分级** + 「最多 3 轮 P1 修复」+ 「核心循环连续两轮 P0 就换机制而不是继续调参」 | 我们审计报告无统一分级 | `docs/audit/*.md` 统一采用 P0/P1/P2 分级 |
| 6 | **参考游戏调研协议**：动笔前先只读调研参考游戏的 ①核心循环与签名张力 ②空间/棋盘布局与信息可见性规则 ③视觉基调 ④手感参数基线；**禁止搬运素材与整仓代码** | 我们只有「不复制源码与素材」的声明 | 把这 4 项写进 `docs/process/立项评审模板.md`，作为「参考调研」章节 |

另外 `review-rubric.md` 有几条机械项我们已达标或应补：

- ✅ 已达标：零构建、零 CDN、纯静态自包含；`prefers-reduced-motion` 降动效；移动端 `390×844` 无横向溢出；触摸目标 ≥ 48px；AudioContext 用户手势解锁；无 console error
- ⚠️ 应补：**「零 starter 残留」**（无 TODO / lorem / 空 `src=""` / 默认占位主题）——可加进 `scripts/review.mjs`
- ⚠️ 应补：**「主操作动词 ≥ 3 条反馈通道」**（运动/停顿/震动/粒子/音频）——写进立项评审的「核心亮点」栏

---

## 4. 三种使用方式：成本与收益

| 方式 | 做法 | 成本 | 收益 | 判断 |
| --- | --- | --- | --- | --- |
| **A. 选品目录** | 把 277 款 `game.json` 元数据存成表，阶段 B 选游戏时查表 | 极低（已抓完） | 高——选品从「随机搜网」变「查商业验证过的机制表」 | ✅ **采纳** |
| **B. 方法论参照** | 把 6 条硬东西并入 `docs/process/`，`review.mjs` 加 2 条机械检查 | 低（半天） | 高——直接补上用户 11-26 投诉的根因（核心玩法错漏） | ✅ **采纳** |
| **C. 接入其运行时** | `npm ci` + 起 Game Studio + 接 12 个 MCP 工具 | **高**：1 GB 仓库、LFS、Node 22.18+、MCP 服务、其工作台产物目录与我们的 monorepo 不兼容 | 低——我们的零构建零依赖原则会被打破 | ❌ **不采纳** |

不采纳 C 的决定性理由：我们的仓库是**纯静态、零运行时依赖、可直接 GitHub Pages / 静态托管**的自包含产物；OpenGame Studio 是 Node 服务 + LFS 素材 + 编译产物链路，接进来等于把「每款游戏一个可直接打开的 index.html」变成「必须跑服务的工程」。两者交付形态不兼容。

---

## 5. 对当前工作的影响

- **不改变阶段划分**：阶段 A（修完存量 6 款）仍然先于阶段 B。本仓库只作为**阶段 B 的选品表**与**流程增强参考**。
- **不引入新依赖**：仓库保持零构建、零依赖、纯静态。
- **合规**：Apache-2.0 + MIT（端口部分）允许借鉴方法论；我们仍坚持「只复刻玩法与交互，代码/文案/图形/音效全部原创自绘自造」，不搬运其模板源码或素材。

---

## 6. 附：本地抓取产物

| 文件 | 内容 |
| --- | --- |
| `research/catalog.tsv` | 277 款模板的 `slug / 中文标题 / 体裁 / 朝向 / 标签 / 描述` |
| `research/gamejson/*.json` | 277 份原始 `game.json` |
| `research/game-brief.md` 等 8 份 | 手册原文（仅供本轮对照，**不入库**） |

---

## 7. 阶段 B 候选短名单（供后续评审，此轮不开工）

按「纯 2D + 逻辑可单测 + 与已有 6 款不重复 + 中文市场已验证」筛出：

| slug | 中文名 | 引擎 | 一句话机制 |
| --- | --- | --- | --- |
| `unbolt-screw-51` | 拆螺丝 51 关 | puzzle-pressure | 拧松螺丝让废料掉落，目标板不能碰 |
| `hanzi-brain-spot` | 汉字脑洞找茬 | puzzle-pressure | 拆字/找视觉双关，抖音全民爆火 |
| `idiom-chain-pro` | 经典成语接龙 | progression-rng | 首尾相连填词，题库层层解锁 |
| `bottle-fill-puzzle` | 烧脑挑战装满瓶子 | puzzle-pressure | 尺寸匹配的物理投放与收纳 |
| `pin-rescue` | 熔金拔针 | skill-flow | 拔针改变物理路径，水与熔岩混合成石 |
| `meme-spotter-king` | 玩梗找茬王 30 关 | puzzle-pressure | 点击拖拽道具触发隐藏剧情 |
| `merge-to-ten` | 数字合成十 | strategy-combo | 相同数字相邻即合并，规划空间 |
| `one-stroke-dots` | 一笔画连点成线 | puzzle-pressure | 不回头不重复一笔点完所有格 |
| `happy-glass-draw` | 欢乐水杯画线 | skill-flow | 自由画线搭导流槽，星评级 |
| `cut-the-rope-mini` | 割绳子 | skill-flow | 算准摆动时机切断绳索 |
| `catch-piggy` | 抓小猪：全堆里揪三只 | skill-flow | 倒计时内翻找三个同款配对 |
| `goods-sort-master` | 货柜消除大师 | strategy-combo | 多层货架挪动凑三消 |

> 入选只是「进入立项评审」的候选，不是开工名单。开工仍需走 `docs/process/` 四道门禁。
