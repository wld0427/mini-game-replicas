# 复刻进度追踪

> 本文件由定时任务自动维护。每轮任务结束后必须更新对应条目。
> 状态取值：`待办` / `开发中` / `待验收` / `已交付`

## 项目清单

| # | 游戏 | 上游参考 | 玩法内核 | 目录 | 单元测试 | 冒烟测试 | 静态审查 | 部署 URL | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Kanji Rush | `kanjigacha.com`（ドパ漢字ガチャ） | 汉字扭蛋：频次定稀有度、越抽越快、保底、图鉴、成就 | `games/kanji-rush/` | ✅ 19/19 | ✅ 2/2 | ✅ | https://fe84dtppzvcch.space.mcode.cn | 已交付 |
| 2 | Element Forge 元素熔炉 | Infinite Craft 式元素合成 | 两两熔炼：106 词条合成表 + 中文构词法原创合成 + 确定性结果 + 稀有度分层 + 图鉴 + 每日灵感保底 | `games/element-forge/` | ✅ 36/36 | ✅ 2/2 | ✅ | https://h3insrj3ydjpe.space.mcode.cn | 已交付 |
| 3 | Angler's Almanac 渔汛录 | 休闲钓鱼 / 图鉴收集类 | 抛竿 → 咬钩窗口 → 起竿 → 遛鱼收放线：44 鱼种图鉴 + 5 档稀有度 + 水层解锁 + 4 件装备 + 保底 | `games/angler-almanac/` | ✅ 43/43 | ✅ 2/2 | ✅ | https://sw066j4tihcyh.space.mcode.cn | 已交付 |
| 4 | Tetra Cascade 无尽方块 | 经典下落消行类 | 7-bag 随机 + 自研旋转踢墙 + 幽灵块 + 暂存 + 消行连击 + 等级加速 + 7 种方块图鉴（21 条里程碑）+ 今日挑战 | `games/tetra-cascade/` | ✅ 39/39 | ✅ 3/3 | ✅ | https://y9d2m3o4y6ve9.space.mcode.cn | 已交付 |
| 5 | Ball Foundry 落球坊 | 物理弹球 / 增量经营类 | 确定性物理沙盒：定步长模拟 + 7 种材质手感 + 堆叠结算 + 4 项工坊升级 + 材质图鉴（21 条里程碑）+ 保底 | `games/ball-foundry/` | ✅ 39/39 | ✅ 2/2 | ✅ | https://rhgu3kwxcpak6.space.mcode.cn | 已交付 |
| 6 | Townscript 城痕 | Townscaper 式程序化城镇 | 上下文生成城镇沙盒：值噪声地形 + 地脉扩张 + 起楼叠层 + 10 种地标约束 + 每日岛屿 + 城镇代码分享 + 图鉴里程碑 | `games/townscript/` | ✅ 39/39 | ✅ 3/3 | ✅ | https://5bqw3wzkboaey.space.mcode.cn | 已交付 |

## 已部署

| 游戏 | 公网地址 | 部署时间 |
| --- | --- | --- |
| Kanji Rush | https://fe84dtppzvcch.space.mcode.cn | 2026-11-25 |
| Element Forge | https://h3insrj3ydjpe.space.mcode.cn | 2026-11-25 |
| Angler's Almanac | https://sw066j4tihcyh.space.mcode.cn | 2026-11-25 |
| Tetra Cascade | https://y9d2m3o4y6ve9.space.mcode.cn | 2026-11-25 |
| Ball Foundry | https://rhgu3kwxcpak6.space.mcode.cn | 2026-11-25 |
| Townscript 城痕 | https://5bqw3wzkboaey.space.mcode.cn | 2026-11-26 |

## GitHub 同步状态

- 仓库：`wld0427/mini-game-replicas`（单仓库多目录，**公开**）
- 当前状态：✅ **正常** —— 2026-11-25 凭证恢复有效，`bash scripts/sync-github.sh` 已成功推送。
- 可见性：已设为公开（与账号既有的 12 个 fork + 自建 `claw` 保持一致）；要改回私有：
  `PATCH /repos/wld0427/mini-game-replicas {"private":true}`
- topics：`mini-game` `web-game` `html5` `javascript` `replica` `game` `canvas-game` `showcase`
- 备注：沙箱出口 IP 共享，偶发 `gnutls_handshake()` TLS 中断；推送走 `scripts/push-retry.sh`（8 次指数退避重试）。
- ⚠️ 定时任务在**独立工作区**执行，多会话并发推同一分支会分叉。`sync-github.sh` 会先
  `fetch` + `rebase` 再推；遇到冲突脚本会中止 rebase 并报错，不要硬推。
- 2026-11-25 实测：另一会话先推了 5 个提交（CI / push-retry / TRACKER），本轮首次推送被
  non-fast-forward 拒绝；`git fetch origin main && git rebase origin/main` 干净合并后，
  `sync-github.sh` 第 3 次尝试推送成功。**每轮开工先 fetch + rebase**，别等推送失败再补。
- ⚠️ 2026-11-26 记录：定时任务曾被平台因 **Token Plan 用量触顶**自动置为
  `paused_after_failures`（错误码 2067）。恢复办法：补充额度/升级套餐后重新启用任务。
  任务频率已按用户要求从每 30 分钟改为 **每 2 小时**（`0 */2 * * *`），token 消耗降为 1/4。
- ⚠️ `git fetch` 和 `git push` 一样会因 TLS 中断失败，**fetch 也必须重试**
  （实测第 3 次才成功）。`sync-github.sh` 里的 fetch 目前只试 1 次，
  遇到失败会跳过 rebase 直接 push —— 有分叉风险，后续可改为复用 `push-retry.sh` 的退避逻辑。

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
| 元素周期表配对 | 常见记忆游戏 | 元素符号配对翻牌 | 简单，但可加入倒计时 |
| 像素画画板 | doodle 类 | 画笔/橡皮/调色板 + 导出 PNG | |
| 星球折叠 | fold 类 | 折纸网格判定覆盖 | 算法可测 |
| 反应力测试 | 反应测试类 | 点击变色计分，防作弊 | |
| 2048 变体 | 2048 | 加同色合并/网格锁 | |

> 已完成并移出候选池：
> - 单词合成器 → `games/element-forge/`（Element Forge 元素熔炉）。把「AI 兜底造词」换成
>   **本地确定性构词引擎**（定语 + 中心语），避免外部 API 依赖，同时保留「同一配方永远同一结果、可抄配方」。
> - 钓鱼图鉴 → `games/angler-almanac/`（Angler's Almanac 渔汛录）。做成了**三段式技巧循环**
>   （抛竿 → 咬钩窗口抢起竿 → 遛鱼收放线），遛鱼是纯逻辑层里的确定性力学
>   （三角波标记 + 甜区 + 张力），所以既能单测也能让冒烟测试真的玩通关。
> - 无尽方块 → `games/tetra-cascade/`（Tetra Cascade 无尽方块）。旋转态**机械生成**并由单测守护
>   （每个旋转态必须等于上一个旋转 90°），踢墙表自研；收集层做成「7 种方块 × 3 条里程碑」共 21 条。
> - 落球物理沙盒 → `games/ball-foundry/`（Ball Foundry 落球坊）。物理写成**定步长确定性模拟**，
>   于是「帧率无关 / 防穿模 / 堆叠不穿透 / 手感层」都能直接写成断言，而不是只能靠肉眼。

> 已完成并移出候选池：单词合成器 → 实际落成 `games/element-forge/`（Element Forge 元素熔炉）。
> 本作把「AI 兜底造词」换成了**本地确定性构词引擎**（定语 + 中心语），
> 避免外部 API 依赖，同时保留「同一配方永远同一结果、可抄配方」的核心体验。

## 外部资源：游戏开发 skills

- 已安装 [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)
  的**全部 80 个 skill**（79 个 + router）到 `/workspace/.skills/`，扁平结构 `<name>/SKILL.md`，
  frontmatter 与目录名逐个校验通过。
  - 引擎无关 16 个：`physics-tuning` / `game-feel` / `input-systems` / `audio-design` /
    `game-ui-ux` / `save-systems` / `performance-optimization` / `camera-systems` /
    `level-design` / `procedural-gen` / `game-ai` / `dialogue-systems` / `create-game-assets` /
    `shader-programming` / `ai-behavior-trees-utility-ai` / `pixijs-rendering`
  - 品类范式 9 个：`puzzle` / `platformer` / `roguelike` / `rpg` / `card-game` / `tower-defense` /
    `survival-crafting` / `fps-shooter` / `visual-novel`
  - 流程 5 个：`game-jam` / `game-docs` / `prototype-fast` / `itch-publish` / `steam-publish`
  - 引擎专属 49 个（Godot / Unity / Unreal / Phaser / three.js / Roblox / Bevy / Defold / LÖVE / pygame / Ebitengine）
- 每个 skill 末尾都追加了「本仓库适配」小节：把 Godot / Unity 写法映射到本仓库的
  **零构建 vanilla JS 静态站**（定步长物理、无引擎相机 / 粒子节点、DOM / SVG 渲染、
  WebAudio 合成音效、命名动作表输入）。引擎专属的 skill 额外标注「API 部分不适用，只取设计原则」。
- 落地效果：`games/ball-foundry/` 直接按 `physics-tuning` 实现了定步长 + 渲染插值 + 单帧步数上限
  + 速度上限防穿模 + 多趟求解器迭代；按 `game-feel` 实现了创伤抖动与打击停顿，
  并把技能要求的「同一事件 30ms 内触发两次 → 时间倍率必须回到 1.0」写成了单测；
  按 `performance-optimization` 把满罐物理的耗时写成了性能预算断言。

## 每轮执行清单

1. 读取本文件，确认上一轮是否收尾；若有 `开发中` 条目，**接着做**而不是开新坑
2. 检索网络上的有趣小游戏，选定一个候选（避开已完成的）
3. 在 `games/<slug>/` 实现原创版本：逻辑层 + 表现层 + 样式 + 多语言 + 音效
4. 写单元测试（核心规则，确定性）与 Playwright 冒烟测试（真实浏览器）
5. 跑 `node scripts/review.mjs` 与 `node scripts/run-tests.mjs`，**全部通过**才算完成
6. 有失败 → 修复后重跑；连续修不好 → 在本文件记「阻塞原因」，换下一个候选
7. 通过后：提交 git、推送 GitHub、部署到公网、回填本文件
