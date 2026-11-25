# 复刻进度追踪

> 本文件由定时任务自动维护。每轮任务结束后必须更新对应条目。
> 状态取值：`待办` / `开发中` / `待验收` / `已交付`

## 项目清单

| # | 游戏 | 上游参考 | 玩法内核 | 目录 | 单元测试 | 冒烟测试 | 静态审查 | 部署 URL | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Kanji Rush | `kanjigacha.com`（ドパ漢字ガチャ） | 汉字扭蛋：频次定稀有度、越抽越快、保底、图鉴、成就 | `games/kanji-rush/` | ✅ 19/19 | ✅ 2/2 | ✅ | https://fe84dtppzvcch.space.mcode.cn | 已交付 |
| 2 | Element Forge 元素熔炉 | Infinite Craft 式元素合成 | 两两熔炼：106 词条合成表 + 中文构词法原创合成 + 确定性结果 + 稀有度分层 + 图鉴 + 每日灵感保底 | `games/element-forge/` | ✅ 36/36 | ✅ 2/2 | ✅ | https://h3insrj3ydjpe.space.mcode.cn | 已交付 |

## 已部署

| 游戏 | 公网地址 | 部署时间 |
| --- | --- | --- |
| Kanji Rush | https://fe84dtppzvcch.space.mcode.cn | 2026-11-25 |
| Element Forge | https://h3insrj3ydjpe.space.mcode.cn | 2026-11-25 |

## GitHub 同步状态

- 仓库：`wld0427/mini-game-replicas`（单仓库多目录，**公开**）
- 当前状态：✅ **正常** —— 2026-11-25 凭证恢复有效，`bash scripts/sync-github.sh` 已成功推送。
- 可见性：已设为公开（与账号既有的 12 个 fork + 自建 `claw` 保持一致）；要改回私有：
  `PATCH /repos/wld0427/mini-game-replicas {"private":true}`
- topics：`mini-game` `web-game` `html5` `javascript` `replica` `game` `canvas-game` `showcase`
- 备注：沙箱出口 IP 共享，偶发 `gnutls_handshake()` TLS 中断；推送走 `scripts/push-retry.sh`（8 次指数退避重试）。
- ⚠️ 定时任务在**独立工作区**执行，多会话并发推同一分支会分叉。`sync-github.sh` 会先
  `fetch` + `rebase` 再推；遇到冲突脚本会中止 rebase 并报错，不要硬推。

## CI 状态

- 配置存放：`ci/github-actions.yml`（**不在** `.github/workflows/` 下）
- 原因：当前 classic PAT 的 scopes 只有 `repo`，GitHub 拒绝写入 `.github/workflows/`，
  硬放会导致**每一次推送都被 remote rejected**。
- 启用方式：token 补上 `workflow` scope 后执行 `bash scripts/enable-ci.sh`，
  脚本会自动把它搬进 `.github/workflows/ci.yml` 并推送。
- CI 内容：`node scripts/review.mjs` + `node scripts/run-tests.mjs`，与本地质量闸门一致。

## 候选池（下一轮可做）

> 定时任务每轮从这里挑一个未被做过的候选；做完后移入上方项目清单。

| 候选 | 上游 | 玩法内核 | 备注 |
| --- | --- | --- | --- |
| 城市生成器 | Townscaper 式 | 点格子长出房子/桥/路 | 图形程序化生成 |
| 元素周期表配对 | 常见记忆游戏 | 元素符号配对翻牌 | 简单，但可加入倒计时 |
| 像素画画板 | doodle 类 | 画笔/橡皮/调色板 + 导出 PNG | |
| 星球折叠 | fold 类 | 折纸网格判定覆盖 | 算法可测 |
| 反应力测试 | 反应测试类 | 点击变色计分，防作弊 | |
| 落球物理沙盒 | 弹球类 | 重力/弹性/挡板碰撞 | 可做确定性物理测试 |
| 2048 变体 | 2048 | 加同色合并/网格锁 | |
| 钓鱼图鉴 | 休闲放置类 | 稀有鱼收集 + 保底 + 图鉴 | 收集/随机/增量三件套齐 |
| 无尽方块 | 俄罗斯方块类 | 消除连击 + 方块图鉴 | 规则可测，适合加排行榜 |

> 已完成并移出候选池：单词合成器 → 实际落成 `games/element-forge/`（Element Forge 元素熔炉）。
> 本作把「AI 兜底造词」换成了**本地确定性构词引擎**（定语 + 中心语），
> 避免外部 API 依赖，同时保留「同一配方永远同一结果、可抄配方」的核心体验。

## 每轮执行清单

1. 读取本文件，确认上一轮是否收尾；若有 `开发中` 条目，**接着做**而不是开新坑
2. 检索网络上的有趣小游戏，选定一个候选（避开已完成的）
3. 在 `games/<slug>/` 实现原创版本：逻辑层 + 表现层 + 样式 + 多语言 + 音效
4. 写单元测试（核心规则，确定性）与 Playwright 冒烟测试（真实浏览器）
5. 跑 `node scripts/review.mjs` 与 `node scripts/run-tests.mjs`，**全部通过**才算完成
6. 有失败 → 修复后重跑；连续修不好 → 在本文件记「阻塞原因」，换下一个候选
7. 通过后：提交 git、推送 GitHub、部署到公网、回填本文件
