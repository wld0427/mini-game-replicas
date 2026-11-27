# 复刻进度追踪

> 本文件由定时任务自动维护。每轮任务结束后必须更新对应条目。
> 状态取值：`待办` / `开发中` / `待验收` / `已交付`
>
> **2026-11-26 起实行四道强制门禁**（流程见 `docs/process/README.md`）：
> 立项评审 → 设计文档+开发计划 → 实现与代码审查 → 交付验收。
> **当前游戏没过 `node scripts/gate.mjs`，绝不允许开始下一款。**

## 项目清单

| # | 游戏 | 上游参考 | 玩法内核 | 目录 | 单元测试 | 冒烟测试 | 静态审查 | 四道门禁 | 部署 URL | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Kanji Rush | `kanjigacha.com`（ドパ漢字ガチャ） | 汉字扭蛋：频次定稀有度、越抽越快、保底、图鉴、成就 | `games/kanji-rush/` | ✅ 19/19 | ✅ 2/2 | ✅ | ✅ 已过 | https://fe84dtppzvcch.space.mcode.cn | 已交付 |
| 2 | Element Forge 元素熔炉 | Infinite Craft 式元素合成 | 两两熔炼：106 词条合成表 + 中文构词法原创合成 + 确定性结果 + 稀有度分层 + 图鉴 + 每日灵感保底（跨日累计） | `games/element-forge/` | ✅ 46/46 | ✅ 9/9 | ✅ | ✅ 已过 | https://zr6vv3h2bn8e3.space.mcode.cn | 已交付 |
| 3 | Angler's Almanac 渔汛录 | 休闲钓鱼 / 图鉴收集类 | 抛竿 → 咬钩窗口 → 起竿 → 遛鱼收放线：44 鱼种图鉴 + 5 档稀有度 + 水层解锁 + 4 件装备 + 保底 | `games/angler-almanac/` | ✅ 43/43 | ✅ 2/2 | ✅ | ⏳ 待修复 | https://sw066j4tihcyh.space.mcode.cn | 已交付 |
| 4 | Tetra Cascade 无尽方块 | 经典下落消行类 | 7-bag 随机 + 自研旋转踢墙 + 幽灵块 + 暂存 + 消行连击 + 等级加速 + 7 种方块图鉴（21 条里程碑）+ 今日挑战 | `games/tetra-cascade/` | ✅ 39/39 | ✅ 3/3 | ✅ | ⏳ 待修复 | https://y9d2m3o4y6ve9.space.mcode.cn | 已交付 |
| 5 | Ball Foundry 落球坊 | 物理弹球 / 增量经营类 | 确定性物理沙盒：定步长模拟 + 7 种材质手感 + 堆叠结算 + 4 项工坊升级 + 材质图鉴（21 条里程碑）+ 保底 | `games/ball-foundry/` | ✅ 39/39 | ✅ 2/2 | ✅ | ⏳ 待修复 | https://rhgu3kwxcpak6.space.mcode.cn | 已交付 |
| 6 | Townscript 城痕 | Townscaper 式程序化城镇 | 上下文生成城镇沙盒：值噪声地形 + 地脉扩张 + 起楼叠层 + 10 种地标约束 + 每日岛屿 + 城镇代码分享 + 图鉴里程碑 | `games/townscript/` | ✅ 39/39 | ✅ 3/3 | ✅ | ⏳ 待修复 | https://5bqw3wzkboaey.space.mcode.cn | 已交付 |

## 门禁待修复清单（2026-11-26 起）

存量 6 款均在**无立项评审、无设计文档、无功能清单**的条件下产出，已被指出
「核心玩法功能错漏、功能不完善、表现粗糙」。按新门禁逐款修复，**一款一款来，
过完门禁才开下一款**。

| 游戏 | 缺失的文档 | 已知待查问题 | 门禁 |
| --- | --- | --- | --- |
| kanji-rush | ✅ 已补齐（proposal/design/plan/acceptance） | 已补：F-011 音效无测试、图鉴格子数无断言、自动模式无测试；已修 toast 遮挡统计栏与移动端语言按钮断字 | ✅ 已过 |
| element-forge | ✅ 已补齐（proposal/design/plan/acceptance，19 项 F-ID） | 已修：F-015 每日灵感产物卡渲染成 `配方: undefined + undefined`、F-010 配方手册是死文本（README 承诺「方便复现」但条目点不动）、F-016 搜索无结果与「还没发现任何元素」共用同一句提示；已补 `composeImprovised` / `computeGenerations` / `morphemesFor` / `describeElement` / `computeStats` 五个零覆盖逻辑函数的行为断言；已修视觉：雾家族 4 元素共用 🌫️ 渲染成无特征白块、桌面左栏比右栏短约 900px 留白、toast 压住移动端原料槽。**门禁全绿后又被另一会话的审计报告 (`docs/audit/element-forge.md`) 查出 4 处结构性空洞，已全部修掉**：每日保底跨日清零导致**永远攒不到阈值**（每日上限 5 < 阈值 12，旧逻辑 365 天 pity 最高仅 5）、拖拽入槽是死代码（chip 是 `<button>` 默认不可拖）、`chain_hint` 文案从未渲染、搜索查不到未发现词条 | ✅ 已过 |
| angler-almanac | ❌ 全缺 | **已审计**（`docs/audit/angler-almanac.md`，测试 45/45 全绿但游戏有洞）：**P0** 起竿窗口超时判负根本不存在（`onHookTimeout` 死代码）→ 卷线器升级零作用、失误统计恒为 0、"抢时机"玩法核心被架空；饵 Lv.5 显示 `undefined Lv.5`；断线后产物卡仍完整显示鱼种名 | ⏳ 待修复 |
| tetra-cascade | ❌ 全缺 | **待审计**（审计 agent 曾因 Token Plan 额度耗尽中断，未产出报告）：踢墙表是否完整、锁定延迟续命次数、暂存交换限制、7-bag 表述是否与实现一致。→ **本轮先做审计，再按报告修** | ⏳ 待修复 |
| ball-foundry | ❌ 全缺 | **待审计**（同上，审计报告缺失）：7 种材质手感是否真的可区分、堆叠结算、升级曲线。审计时曾观察到「投放 26 个球但只有 1 个落定」的现象，疑似物理结算有洞，需重点查 | ⏳ 待修复 |
| townscript | ❌ 全缺 | 待审计：10 种地标约束是否全部可达、右键拆除、城镇代码往返 | ⏳ 待修复 |

### 已确认的问题性质（重要）

两次审计的共同结论：**单测全绿 ≠ 游戏可用**。
element-forge 38/38、angler-almanac 45/45 全绿，但存在
「保底机制永不触发」「拖拽入口是死代码」「起竿窗口永不判负」这类**结构性空洞**——
根因是**没有功能清单**，所以没人能说出"应该有什么"，测试自然也测不到。

这正是新门禁要解决的问题：设计文档先定出可判定的功能清单与验收标准，
再让每条功能在代码、测试、验收三处留痕，缺失与半成品都无处藏身。

**element-forge 已按此流程走完**：四道门禁全绿后，又按审计逐条修掉 4 处结构性空洞
（保底跨日累计、芯片显式可拖、链式合成提示、搜索可查未发现词条），
并把「保底」那条断言从**伪造状态**改成**只走真实抽取路径**。详见
`games/element-forge/docs/acceptance.md` 的「门禁之外的自查」一节。

### 结构性空洞的通用排查法（element-forge 实证）

门禁全绿 ≠ 游戏可用。element-forge 过完全部四道门禁后，仍被审计查出 4 处结构性空洞，
共同特征是**代码写了、测试也绿了，但玩家路径根本走不到**：

1. **计数器有阈值，却没有任何路径能把它攒到阈值** —— 每日保底 12 次，但每天只抽 5 次且跨日清零。
2. **事件监听写了，但触发前提不成立** —— 写了 `dragstart`，但芯片是 `<button>`，浏览器默认不可拖。
3. **功能实现了，但入口/提示不存在** —— 产物卡可点击链式合成，但 `chain_hint` 文案从未渲染。
4. **只断言了函数行为，没断言玩家能走到那一步** —— 旧 F-008 用例直接把 `pity` 填成 12 再抽一次。

排查法（每款游戏过门禁后必做一遍）：
- 把每个「数值上限 / 阈值 / 计数器」算一遍：**单周期内玩家最多能攒多少？够不够触达阈值？**
- 把每个事件入口的**触发前提**验一遍：元素真的可拖吗？按钮真的可点吗？监听真的绑在正确的节点上吗？
- 把每个「文案 / 提示」搜一遍：i18n 里有的字符串，真的有地方渲染吗？
- **断言必须走玩家真实会走的路径**，不许把状态伪造出来再断言。

### 修复流程（每款一套）
1. `docs/proposal.md` — 立项评审：这一版补齐什么、凭什么值得留
2. `docs/design.md` — 功能清单 `F-xxx` + 状态机 + 边界 + 打磨清单
3. `docs/plan.md` — ≥3 个带验收命令的阶段
4. 代码补 `@feature` 标记、测试补 `@covers` 标记，**补真实缺失功能**
5. `docs/acceptance.md` — 逐条验收 + 桌面/移动截图人工核对
6. `node scripts/gate.mjs games/<slug>` 必须全绿
7. **过门禁后再按上面的「结构性空洞通用排查法」自审一轮**，并对照 `docs/audit/<slug>.md`（若有）

**下一轮目标**：`angler-almanac`（渔汛录）——门禁待修复清单里的下一款。
重点审计：多阶段交互链（抛竿 → 咬钩 → 起竿 → 遛鱼）每一环是否真的走得通、有无卡死路径；
已知待修的 P0：起竿窗口超时判负是死代码（`onHookTimeout` 未接线），
导致卷线器升级零作用、失误统计恒为 0、"抢时机"玩法核心被架空。

## 已部署

| 游戏 | 公网地址 | 部署时间 |
| --- | --- | --- |
| Kanji Rush | https://fe84dtppzvcch.space.mcode.cn | 2026-11-25 |
| Element Forge | https://zr6vv3h2bn8e3.space.mcode.cn | 2026-11-26（门禁修复 + 审计空洞修复后重新部署；前一版 https://glihx7ovioszc.space.mcode.cn，首版 https://h3insrj3ydjpe.space.mcode.cn） |
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
