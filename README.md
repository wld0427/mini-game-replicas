# mini-game-replicas

把网络上那些**有意思的小网页游戏**复刻成一套可运行的原创实现。每个游戏是一个自包含的静态站点，配有单元测试、浏览器冒烟测试和一套统一的静态代码审查规则。

> **复刻原则**：复刻的是**玩法与交互**，不是源代码。仓库内所有代码、文案、图形、音效均为原创实现，不复制上游站点的源码与受版权保护的素材。玩法致敬 `kanjigacha.com` 一类「汉字扭蛋」网页小游戏的通用范式。

## 目录

```
mini-game-replicas/
├── games/
│   └── <game-slug>/        每个游戏一个独立目录，可单独部署
│       ├── index.html
│       ├── assets/         样式 / 脚本 / 数据 / 国际化
│       ├── src/            纯逻辑层（无 DOM 依赖，可完整单测）
│       ├── test/           单元测试 + Playwright 冒烟测试
│       └── README.md
├── scripts/
│   ├── review.mjs          静态代码审查（缺陷 / 资产一致性 / 发布安全）
│   └── run-tests.mjs       跑遍所有游戏的测试
├── TRACKER.md              复刻进度与验收状态
└── README.md
```

## 当前复刻

| 游戏 | 玩法 | 状态 |
| --- | --- | --- |
| [Kanji Rush](games/kanji-rush/) | 汉字扭蛋：按使用频次定稀有度，越抽越快 | ✅ 已过四道门禁 |
| [Element Forge 元素熔炉](games/element-forge/) | 元素熔炼：106 词条合成表 + 中文构词法原创合成，图鉴收集 | ⏳ 待按新门禁修复 |
| [Angler's Almanac 渔汛录](games/angler-almanac/) | 钓鱼图鉴：抛竿 → 抢起竿时机 → 遛鱼收放线，44 种鱼 + 水层解锁 | ⏳ 待按新门禁修复 |
| [Tetra Cascade 无尽方块](games/tetra-cascade/) | 经典消行：7-bag 随机 + 自研旋转踢墙 + 方块图鉴 21 条里程碑 | ⏳ 待按新门禁修复 |
| [Ball Foundry 落球坊](games/ball-foundry/) | 物理沙盒：确定性定步长物理 + 7 种材质手感 + 材质图鉴 | ⏳ 待按新门禁修复 |
| [Townscript 城痕](games/townscript/) | 程序化城镇：值噪声地形 + 地脉扩张 + 10 种地标约束 + 城镇代码分享 | ⏳ 待按新门禁修复 |

## 质量闸门

> 本仓库从 2026-11-26 起实行**四道强制门禁**，流程定义见 [`docs/process/README.md`](docs/process/README.md)。
> **上一道不过，绝不进入下一道；当前游戏没做到可交付，绝不开下一款。**

```
① 立项评审 → ② 设计文档 + 开发计划 → ③ 实现与代码审查 → ④ 交付验收
```

| 门禁 | 要求 | 机器校验 |
| --- | --- | --- |
| ① 立项评审 | 为什么做它 / 核心亮点 / 独特玩法 / 表现力 / 差异化 / 可测性 / 风险；评分 ≥ 20/30 且否决项全为「否」 | `scripts/design-review.mjs` |
| ② 设计 + 计划 | `docs/design.md` 含功能清单（`F-001` 连续编号）、状态机、边界异常、打磨清单；`docs/plan.md` 含 ≥3 个带验收命令的阶段 | `scripts/design-review.mjs` |
| ③ 实现 + 审查 | 核心规则落在 `src/logic.js`；每功能留 `@feature` 标记；每功能留 `@covers` 测试标记 | `scripts/review.mjs` + `scripts/feature-trace.mjs` |
| ④ 交付验收 | 行为级断言 + 覆盖核心玩法的浏览器冒烟 + 桌面/移动截图人工核对 + `docs/acceptance.md` | `scripts/gate.mjs` |

**核心机制：功能可追溯矩阵。** `scripts/feature-trace.mjs` 强制每个功能在四处留痕：

```
设计文档 docs/design.md 的 | F-001 |  ←→  代码里的 @feature F-001
                                     ←→  测试里的 @covers F-001
                                     ←→  验收记录 docs/acceptance.md 的 F-001 行
```

缺任何一处 → 该功能判为未完成；代码里有标记但设计文档没登记 → 判为孤儿实现。**功能想蒙混过关是过不去的。**

### 一条命令跑全部

```bash
npm run gate                        # 全仓门禁
node scripts/gate.mjs games/<slug>  # 只门禁某一款
```

门禁包含：

1. **静态代码审查** — `scripts/review.mjs`
   *缺陷检测*（宽松相等、空 `catch`、`eval`、字符串 `setTimeout`、`var`、隐式全局、`document.write`、`innerHTML` 注入用户可控内容）、
   *资产一致性*（`index.html` 引用的本地资源必须存在、禁止外部 CDN、必须有 `viewport`/`lang`/`title`）、
   *发布安全*（`ghp_*`/`sk-*`/`AKIA*`/私钥凭证扫描、残留 `console.log`/`debugger`）
2. **设计评审** — `scripts/design-review.mjs`：文档结构、评分门槛、否决项、验收标准是否可判定
3. **功能追溯矩阵** — `scripts/feature-trace.mjs`
4. **全量测试** — `scripts/run-tests.mjs`：单元测试（固定种子 PRNG）+ Playwright 真实 Chromium 冒烟
5. **追踪表一致性**：`games/` 下的项目必须在 `TRACKER.md` 登记；标记「已交付」的项目必须全部过闸

> 机器闸门只能证明「功能都在且有测试」，**证明不了好不好玩**。
> 所以①的选题判断与④的视觉验收必须由人实际看过，不能因为闸门全绿就宣布交付。

## 运行单个游戏

纯静态、零构建：

```bash
python3 -m http.server 8080
# 打开 http://127.0.0.1:8080/games/kanji-rush/
# 打开 http://127.0.0.1:8080/games/element-forge/
# 打开 http://127.0.0.1:8080/games/angler-almanac/
# 打开 http://127.0.0.1:8080/games/tetra-cascade/
# 打开 http://127.0.0.1:8080/games/ball-foundry/
```

## 约定

- **逻辑与表现分离**：所有规则判定放在 `src/logic.js`，不碰任何浏览器 API，才能被确定性测试；`assets/app.js` 只负责把状态画到 DOM。
- **零运行时依赖**：每个游戏只用原生 HTML / CSS / ES Module，不需要打包器，部署即开即用。
- **自包含**：不引用外部 CDN、不内嵌第三方素材，字体与图形用系统字体 + CSS / SVG 自绘，音效用 WebAudio 合成。
- **可访问性**：语义化标签、`aria-live`、键盘可操作、`prefers-reduced-motion` 适配、移动端视口适配。

## 许可

MIT
