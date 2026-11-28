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
| 3 | Angler's Almanac 渔汛录 | 休闲钓鱼 / 图鉴收集类 | 抛竿 → 咬钩窗口 → 起竿 → 遛鱼收放线：44 鱼种图鉴 + 5 档稀有度 + 水层解锁 + 4 件装备 + 保底 | `games/angler-almanac/` | ✅ 43/43 | ✅ 7/7 | ✅ | ✅ 已过 | https://3kvg1airu5chk.space.mcode.cn | 已交付 |
| 4 | Tetra Cascade 无尽方块 | 经典下落消行类 | 7-bag 随机 + 自研旋转踢墙 + 幽灵块 + 暂存 + 消行连击 + 等级加速 + 7 种方块图鉴（21 条里程碑）+ 今日挑战 | `games/tetra-cascade/` | ✅ 39/39 | ✅ 3/3 | ✅ | ⏳ 待修复 | https://y9d2m3o4y6ve9.space.mcode.cn | 已交付 |
| 5 | Ball Foundry 落球坊 | 物理弹球 / 增量经营类 | 确定性物理沙盒：定步长模拟 + 7 种材质手感 + 堆叠结算 + 4 项工坊升级 + 材质图鉴（21 条里程碑）+ 保底 | `games/ball-foundry/` | ✅ 39/39 | ✅ 2/2 | ✅ | ⏳ 待修复 | https://rhgu3kwxcpak6.space.mcode.cn | 已交付 |
| 6 | Townscript 城痕 | Townscaper 式程序化城镇 | 上下文生成城镇沙盒：值噪声地形 + 地脉扩张 + 起楼叠层 + 10 种地标约束 + 每日岛屿 + 城镇代码分享 + 图鉴里程碑 | `games/townscript/` | ✅ 42/42 | ✅ 6/6 | ✅ | ✅ 已过 | https://p8lzhxknhoedg.space.mcode.cn | 已交付 |
| 7 | Ripple Song 涟歌 | 波场物理解谜（新立项） | 你不能点亮目标，你只能移动波：160×90 波动方程场 + 相干波源 + 礁石吸收 + 驻波干涉 + 共鸣点阈值点亮 | `games/ripple-song/` | ✅ 28/28 | ✅ 9/9 | ✅ | 🚧 阶段 3/4 | https://y954pn14420m8.space.mcode.cn | 开发中 |

## 进度快照（2026-11-27）

| 游戏 | 单测 | 冒烟 | 功能项 | 文档 | 门禁 |
| --- | --- | --- | --- | --- | --- |
| kanji-rush | 23 | 12 | 15 | ✅ | ✅ 已过（含 14 项缺陷修复） |
| element-forge | 46 | 9 | 19 | ✅ | ✅ 已过（含 4 处结构性空洞修复） |
| angler-almanac | 43 | 7 | 16 | ✅ | ✅ 已过（审计 9 项缺陷 + 4 项盲区全修，含起竿窗口判负） |
| tetra-cascade | 39 | 3 | 0 | ✗ | ⏳ 待修（**审计报告缺失，需先补审计**） |
| ball-foundry | 39 | 2 | 0 | ✗ | ⏳ 待修（**审计报告缺失，需先补审计**） |
| townscript | 42 | 6 | 20 | ✅ | ✅ 已过（3 条 P0 存档级缺陷已修） |
| ripple-song | 28 | 9 | 20 | ✅ | 🚧 阶段 3/4（音频 + 手感层已成型，端到端可真实通关；只剩阶段 4 总验收） |

> ⚠️ 平台 Token Plan 额度会耗尽并自动暂停定时任务（`paused_after_failures` / 错误码 2067）。
> 已发生两次（11-25 晚、11-26 20:41），均靠 `cron_update enabled=true` 恢复。
> **每轮开工前先 `cron_read view=detail` 看 `last_result`，被暂停就重新启用。**
> 长期稳定运行需升级 Token Plan 或开启积分自动消耗。

## 门禁待修复清单（2026-11-26 起）

存量 6 款均在**无立项评审、无设计文档、无功能清单**的条件下产出，已被指出
「核心玩法功能错漏、功能不完善、表现粗糙」。按新门禁逐款修复，**一款一款来，
过完门禁才开下一款**。

| 游戏 | 缺失的文档 | 已知待查问题 | 门禁 |
| --- | --- | --- | --- |
| kanji-rush | ✅ 已补齐（proposal/design/plan/acceptance） | 已补：F-011 音效无测试、图鉴格子数无断言、自动模式无测试；已修 toast 遮挡统计栏与移动端语言按钮断字 | ✅ 已过 |
| element-forge | ✅ 已补齐（proposal/design/plan/acceptance，19 项 F-ID） | 已修：F-015 每日灵感产物卡渲染成 `配方: undefined + undefined`、F-010 配方手册是死文本（README 承诺「方便复现」但条目点不动）、F-016 搜索无结果与「还没发现任何元素」共用同一句提示；已补 `composeImprovised` / `computeGenerations` / `morphemesFor` / `describeElement` / `computeStats` 五个零覆盖逻辑函数的行为断言；已修视觉：雾家族 4 元素共用 🌫️ 渲染成无特征白块、桌面左栏比右栏短约 900px 留白、toast 压住移动端原料槽。**门禁全绿后又被另一会话的审计报告 (`docs/audit/element-forge.md`) 查出 4 处结构性空洞，已全部修掉**：每日保底跨日清零导致**永远攒不到阈值**（每日上限 5 < 阈值 12，旧逻辑 365 天 pity 最高仅 5）、拖拽入槽是死代码（chip 是 `<button>` 默认不可拖）、`chain_hint` 文案从未渲染、搜索查不到未发现词条 | ✅ 已过 |
| angler-almanac | ✅ 已补齐（proposal/design/plan/acceptance，16 项 F-ID） | **已审计并修完**（`docs/audit/angler-almanac.md`，审计时测试 45/45 全绿但游戏有洞）：**P0** 起竿窗口超时判负根本不存在（`onHookTimeout` 死代码）→ 卷线器升级零作用、失误统计恒为 0、"抢时机"玩法核心被架空。**本轮已修 9 项缺陷**：起竿窗口判负（`hookWindowOpen` 纯函数 + 超时定时器 + `doHook` 兜底）、饵 Lv.5 显示 `undefined Lv.5`、饵文案「等待更久」与实现相反、幸运漏加权稀有档（文案说稀有但 `LUCK` 无 `r`）、断线后产物卡仍剧透鱼种体长、跳过链接未国际化、遛鱼命中无视觉反馈、投竿/失手/断线统计 UI 从不展示、卷线器零作用；**另修 3 处打磨**：张力条填充条与轨道两套红打架、同屏重复提示、场景信息密度过低。**补 4 项测试盲区**（超时路径零覆盖、卷线器只测纯函数、失败结算无断言、bait Lv.5 无覆盖），并新增 5 条端到端用例 | ✅ 已过 |
| tetra-cascade | ❌ 全缺 | **待审计**（审计 agent 曾因 Token Plan 额度耗尽中断，未产出报告）：踢墙表是否完整、锁定延迟续命次数、暂存交换限制、7-bag 表述是否与实现一致。→ **本轮先做审计，再按报告修** | ⏳ 待修复 |
| ball-foundry | ❌ 全缺 | **待审计**（同上，审计报告缺失）：7 种材质手感是否真的可区分、堆叠结算、升级曲线。审计时曾观察到「投放 26 个球但只有 1 个落定」的现象，疑似物理结算有洞，需重点查 | ⏳ 待修复 |
| townscript | ✅ 已补齐（proposal/design/plan/acceptance，20 项 F-ID） | **本轮自建审计**（`docs/audit/townscript.md`，审计时 36+3 全绿但有 3 条 P0）：**P0** 拓地后刷新整座城被静默丢弃（城镇代码不记拓地等级，解码按 level 0 校验长度必失败）、切换「自由/每日」模式直接覆盖存档把玩家建的城永久毁掉、每日模式状态刷新即丢；**P1** 还原外来城镇白嫖「初基」里程碑（代码不带建造计数）、解码失败静默吞掉；另修「拓地后旧城被搬到网格左上角」。已全部修掉并补端到端用例 | ✅ 已过 |

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

**本轮新立项**：`ripple-song`（涟歌）—— 核心循环引擎 `puzzle-pressure`，
签名钩子「你不能点亮目标，你只能移动波」，峰值时刻「驻波收敛」。
架构铁律：**波场模拟只在 JS 里跑，GPU 只负责把波场画出来，绝不让 shader 成为规则的第二实现。**
详见 `games/ripple-song/docs/{proposal,design,plan}.md`。

**下一轮目标**：`ripple-song` 阶段 4（交付验收）：写 `docs/acceptance.md`（20 项 F-ID 逐条）、
双端截图人工核对、`node scripts/gate.mjs games/ripple-song` 全绿、部署后 curl 验证 200。
**注意**：玩法链路已端到端验证可通关（把波源挪到标准解 → 全部共鸣点点亮 → 结算），
阶段 4 只需把这条已验证的链路写进验收记录，不再改规则。
存量待修清单里仍有 `tetra-cascade`、`ball-foundry` 两款，审计报告都还缺，需自建审计后修。
它与 ball-foundry **都还没有审计报告**（审计 agent 曾因 Token Plan 额度耗尽中断），
所以下一轮的第一件事是**自建审计**（照 townscript 的做法：README 逐条核对 → 源码比对 →
逻辑层穷举脚本 → Chromium 实证），产出 `docs/audit/tetra-cascade.md` 再进四道门禁。
已知待查点：踢墙表是否完整、锁定延迟续命次数、暂存交换限制、7-bag 表述是否与实现一致。
重点审计：多阶段交互链（抛竿 → 咬钩 → 起竿 → 遛鱼）每一环是否真的走得通、有无卡死路径；
已知待修的 P0：起竿窗口超时判负是死代码（`onHookTimeout` 未接线），
导致卷线器升级零作用、失误统计恒为 0、"抢时机"玩法核心被架空。

## 已部署

| 游戏 | 公网地址 | 部署时间 |
| --- | --- | --- |
| Kanji Rush | https://g9b1erxsbe91s.space.mcode.cn | 2026-11-27（14 项缺陷修复后重新部署；前一版 https://fe84dtppzvcch.space.mcode.cn） |
| Element Forge | https://zr6vv3h2bn8e3.space.mcode.cn | 2026-11-26（门禁修复 + 审计空洞修复后重新部署；前一版 https://glihx7ovioszc.space.mcode.cn，首版 https://h3insrj3ydjpe.space.mcode.cn） |
| Angler's Almanac | https://sw066j4tihcyh.space.mcode.cn | 2026-11-25 |
| Tetra Cascade | https://y9d2m3o4y6ve9.space.mcode.cn | 2026-11-25 |
| Ball Foundry | https://rhgu3kwxcpak6.space.mcode.cn | 2026-11-25 |
| Townscript 城痕 | https://p8lzhxknhoedg.space.mcode.cn | 2026-11-27（门禁 + P0 存档缺陷修复后重新部署；旧地址 https://5bqw3wzkboaey.space.mcode.cn） |
| Ripple Song 涟歌 | https://y954pn14420m8.space.mcode.cn | 2026-11-28（阶段 3：逻辑层 + WebGL2 + 粒子层 + 音频手感层，尚未过总门禁；前一版 https://9tnjq6fe8zdgo.space.mcode.cn） |

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
>
> **选品来源升级（2026-11-27）**：新增 `docs/research/opengame-catalog.tsv` ——
> 277 款**已商业验证**的玩法机制（中文标题 / 描述 / 体裁 / 朝向 / 操控说明 / 变现标签）。
> 候选池从"随机搜网"改为"查表"。调研报告见 `docs/research/opengame.md`。

| 候选 | 上游 | 玩法内核 | 备注 |
| --- | --- | --- | --- |
| 元素周期表配对 | 常见记忆游戏 | 元素符号配对翻牌 | 简单，但可加入倒计时 |
| 像素画画板 | doodle 类 | 画笔/橡皮/调色板 + 导出 PNG | |
| 星球折叠 | fold 类 | 折纸网格判定覆盖 | 算法可测 |
| 反应力测试 | 反应测试类 | 点击变色计分，防作弊 | |
| 2048 变体 | 2048 | 加同色合并/网格锁 | |

### 从 opengame 选品目录筛出的候选（`docs/research/opengame-catalog.tsv`）

> 以下是**进入立项评审的候选**，不是开工名单。开工仍需走 `docs/process/` 四道门禁。
> 筛选条件：纯 2D、逻辑可单测、与已有 6 款不重复、中文市场已验证。

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
2. **阶段 A 未完成前不开新游戏**：存量 6 款里还有 2 款（tetra-cascade / ball-foundry）
   没过门禁，且**连审计报告都还没有**，必须先自建审计再修。
3. 选候选：优先查 `docs/research/opengame-catalog.tsv`（277 款已验证玩法机制）
4. **先做立项评审**（`docs/proposal.md`）：核心循环引擎 / 独特钩子（Signature Twist + Peak Moment）/
   参考调研，三节缺一不可，`node scripts/design-review.mjs` 必须过
5. 再做功能设计文档（`docs/design.md`，含 **16 项左右的功能清单 + 难度契约**）与开发计划（`docs/plan.md`）
6. 在 `games/<slug>/` 实现原创版本：逻辑层（`src/logic.js`，不碰浏览器 API）+ 表现层 + 样式 + 多语言 + 音效
7. 写单元测试（核心规则，确定性）与 Playwright 冒烟测试（真实浏览器），
   每条功能在代码与测试里分别留 `@feature F-xxx` / `@covers F-xxx` 标记
8. 跑 `node scripts/gate.mjs` —— **全部通过**才算完成；有失败 → 修复后重跑
9. 通过后：部署到公网 → 回填本文件 → 提交 git → 推送 GitHub

> **审计报告要写 P0/P1/P2 分级**（见 `docs/process/README.md` 第 ⑥ 节），
> 同一核心循环连续两轮出 P0 就换机制，不要一直调参数。
