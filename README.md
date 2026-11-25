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
| [Kanji Rush](games/kanji-rush/) | 汉字扭蛋：按使用频次定稀有度，越抽越快 | ✅ 测试通过 · 审查通过 |
| [Element Forge 元素熔炉](games/element-forge/) | 元素熔炼：106 词条合成表 + 中文构词法原创合成，图鉴收集 | ✅ 测试通过 · 审查通过 |

## 质量闸门

每个项目在合入前必须同时通过两道闸门：

**1. 静态代码审查** — `node scripts/review.mjs`

覆盖三类问题：

- *缺陷检测*：宽松相等、空 `catch`、`eval`、字符串 `setTimeout`、`var`、隐式全局、`document.write`、`innerHTML` 注入用户可控内容
- *资产一致性*：`index.html` 引用的本地资源必须存在；禁止外部 CDN 依赖（站点须自包含）；必须有 `viewport` / `lang` / `title`
- *发布安全*：`ghp_*` / `sk-*` / `AKIA*` / 私钥等凭证特征扫描；残留 `console.log` / `debugger`

**2. 测试** — `node scripts/run-tests.mjs`

- 单元测试覆盖核心规则（用固定种子 PRNG，结果可复现）
- Playwright 真实 Chromium 冒烟：首屏渲染、核心交互、键盘操作、自动模式、语言切换、刷新后进度保留、控制台零报错、移动端视口无横向溢出

两条命令都通过，才允许推送并部署。

```bash
npm run check     # = review + test
```

## 运行单个游戏

纯静态、零构建：

```bash
python3 -m http.server 8080
# 打开 http://127.0.0.1:8080/games/kanji-rush/
# 打开 http://127.0.0.1:8080/games/element-forge/
```

## 约定

- **逻辑与表现分离**：所有规则判定放在 `src/logic.js`，不碰任何浏览器 API，才能被确定性测试；`assets/app.js` 只负责把状态画到 DOM。
- **零运行时依赖**：每个游戏只用原生 HTML / CSS / ES Module，不需要打包器，部署即开即用。
- **自包含**：不引用外部 CDN、不内嵌第三方素材，字体与图形用系统字体 + CSS / SVG 自绘，音效用 WebAudio 合成。
- **可访问性**：语义化标签、`aria-live`、键盘可操作、`prefers-reduced-motion` 适配、移动端视口适配。

## 许可

MIT
