# 星露谷管家（dsh-stardewvalley-panel）改了什么

这是 **Darian 的 [dsh-stardew-blind-whale-farmer](https://github.com/Darianliu23/dsh-stardew-blind-whale-farmer) 的 fork**。
模组本体、C# 那半、寻路、钓鱼、战斗、五篇攻略全是他做的，`LICENSE` 原版权没动。我们只在 DSH 插件这一侧加了下面这些。

## 装模组和 SMAPI

- **SMAPI**：从 <https://smapi.io> 下安装包，跑 `install on Windows.bat`，在 Steam 里给星露谷设启动选项 `"<游戏目录>\StardewModdingAPI.exe" %command%`。
- **模组**：本插件自带编译好的 `release\BlindWhaleFarmer`，每分钟看一眼游戏 `Mods`，没装或比包里旧就复制进去；游戏开着（dll 被占）时等关了再装，已有的 `config.json` 不覆盖。也可以在面板「操作」里「查更新 / 更新到新版」从 GitHub release 下载安装。
- 走 MCP（本插件 / 别的 MCP 客户端）不需要模组的 DeepSeek API Key；只有用游戏里按 F8 的内置 AI 才需要填 `config.json` 的 `ApiKey` 或环境变量 `DEEPSEEK_API_KEY`。

## 和作者原版的区别

| 原版 | 这个 fork |
|---|---|
| 插件页四组配置卡片 | **设置 → 星露谷管家** 一整页：状态 + 心情曲线 + 操作 + 设置 |
| 「大肥鱼种白饭」会话预设（新会话才能选） | **去掉预设**：`stardew` 入口工具常驻（默认开）；在面板里指定一个已有会话，开始/定时时叫它 |
| 没有状态显示 | 面板：游戏日/时间/天气/钱/体力/背包/地点/当前界面、正在干什么、最近动作、心情曲线、不想玩参考值 |
| `get_state` 只给游戏状态 | 末尾附【心情】最近三天 + 【参考】不想玩参考值 + 收工路；趋势明显往下时只陈述「停不停你自己定」，不判决 |
| `help` 只有操作规则 | 多一节「玩完怎么收工」：先看心情 → sleep → close，写清顺序不能反 |
| 没有开始/停止/关闭按钮 | 开始（拉起游戏 + 读档）、停止（取消会话 + 停内置 AI）、关掉游戏（带存档检查） |
| 没有更新按钮 | 查 GitHub release，比较本地 manifest；有新版可下载安装（镜像 ghfast.top），不动 `config.json` |
| 启动必有 SMAPI 黑窗口 | 设置里可选：正常 / 最小化 / **隐藏**（WScript.Shell 带窗口状态启动，实测隐藏后连 SMAPI 控制台窗口都不可见） |
| 只能 AI 自己 sleep | 面板「强制回家睡觉」：**三步走**（回家 → 碰床 → 睡），任何一步失败就停，绝不硬睡 |
| 没有定时 | **一次性 `nextStartAt`**：模型（或面板）定一个时间，到点拉起游戏 + 叫玩游戏的会话，触发一次就清空；游戏已经开着就跳过 |
| 攻略只能在插件里改、升级被覆盖 | 作者那五篇**只读不碰**；我们的经验另记 `笔记\星露谷经验.md`，关游戏时自动追加 |
| 没有跨会话记忆 | 关游戏时：追加经验、给主会话推摘要、给**自启会话**推「状态 + 最近三天心情/兴奋 + 不想玩参考值 + 存档名」，由它决定下次什么时候开 |
| `stardew` 入口工具只有模组动作 | 多了本地动作：`sessions`（列普通会话）、`wake`（叫醒会话）、`schedule`（定/清下次开玩）、`close`（带存档检查关游戏）、`sleep`（强制回家睡觉） |

## 面板

位置：**设置 → 星露谷管家**（`settings.section`，order 32）。

版式按 `_规范\插件规范.md` 那套默认骨架来：页面最大宽 780px；卡片之间 **10px**（上下、左右都这一个数）、卡片内边距 8px、圆角 12、1px 边框；
标题 15/600，说明 12px 灰（`opacity:.88`），按钮 11px（能按 = 实线描边透明底，不能按 = 虚线灰）；顶部两张卡 **5:5** 且等高（`align-items:stretch`，`min-width:0`）。
状态字段 12px（标签灰、值主色），设置行是 12px 标题 + 12px 灰色说明在左、控件在右；特别提醒用 `.ops-notice`（12/600 黄）。

页面分三个 tab：

- **游玩管理**：当前状态压成一行（时间/天气 · 钱 · 体力 · 背包 · 地点）；「上次在干什么」默认折叠成一行摘要，点开才看结果和最近动作；心情曲线；操作分两排（主操作 开始/停止/关闭/回家睡觉，次要 查更新/更新/追加经验/发摘要，更新按钮只在真有新版时出现）。
- **设置**：会话 / 启动与定时 / 游戏与模组 三张卡。保存是**底部固定条**，有改动才出现（保存 / 撤销），切到别的 tab 也不丢。
- **说明**：模组/端口、插件版本、行动记录、心情表路径、那句长说明和 Darian 的致谢。

- **数据**：游戏在存档里时调模组 `get_state`（InfoTool，不写行动记录）解析；**只在行动记录变了 / 缓存为空 / 手动刷新时**才问一次，避免面板把游戏时钟一直冻着。游戏没进存档时退回读 `logs\transcript-*.log`。
- **心情曲线**：读 `笔记\星露谷笔记.md` 的「## 心情（一天一行）」表，只画最近 30 天（更早的翻篇）。
- **不想玩参考值**：最近三天加权（最近一天 0.65、前一天 0.25、再前一天 0.1），心情 0.45 + 兴奋 0.55，再算一点兴奋趋势；**只显示，不执行**，停不停她自己定。
- **操作**：开始游戏 / 停止游玩 / 关掉游戏 / 强制回家睡觉 / 查更新 / 更新到新版 / 追加经验 / 发摘要给主会话。

## 设置

面板下半页直接改，存进 DSH 的插件配置（`configEditor` 合并写回；拿不到时退回 `ctx.fiber.update`）。
模组那半的字段（每次几个游戏日/分钟、冻结时间、空闲秒数、采集范围、额外要求、攻略文件、端口、自动装模组）照旧会在 30 秒内推给游戏。

管家自己的字段：玩游戏的会话、**自启会话**（玩完把「下次什么时候开」交给它）、主会话、窗口模式、**一次性下次开玩时间 `nextStartAt`**、玩完追加经验、心情记录文件。

## 接口与安全

宿主路由 `/dsh-stardewvalley-panel`：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/state` | 面板数据（`?refresh=1` 强制问一次 get_state） |
| GET | `/sessions` | 会话列表（下拉框） |
| POST | `/config` | 保存设置 |
| POST | `/schedule` | 定 / 清 / 查下次开玩（`{at}` / `{in}` / `{clear}`），存在插件自己的 `schedule.json` |
| POST | `/start` `/stop` `/close` `/sleep` | 四个动作 |
| POST | `/update-check` `/update-apply` | 查更新 / 装新版 |
| POST | `/append-experience` `/notes` | 追加经验 / 给主会话发摘要 |

两道门：`ctx.get('connection').requestRejection(req)` + 本机 Host；POST 要带 `x-dsh-stardewvalley-panel: 1`。**GET 也过准入。**
所有动作只碰本机的游戏、文件、GitHub API 和 ghfast 镜像。

## 安全规矩（别改）

- **关游戏**：行动记录最后一条不是 `sleep` 就拒绝关。星露谷只有睡觉才存档。
- **强制睡觉**：不在农舍就先用 `travel_to FarmHouse`，失败/超时就停；只有真在农舍里才调 `sleep`。**人不在床上会晕倒、丢钱丢东西。**
- **更新**：游戏开着时拒绝替换（dll 被占用）；只替换 dll/manifest/guide，**不碰 config.json**。
- **自动续玩**和原版一样，只认坏掉的工具调用，不替人做决定。

## 验证状态（2026-11-17 06:55）

- ✅ **三种窗口模式都真机验过**（EnumWindows 探测）：隐藏 = 游戏窗口 + SMAPI 控制台都 `visible=false`；最小化 = 两个窗口都 `visible=true, iconic=true`；正常 = 游戏窗口 `visible=true, iconic=false`。读档都成功。
- ✅ get_state 解析：第1年夏2日 06:00 / 晴 / 2072g / 270/270 / FarmHouse / 背包空位 12 / 界面「无（可以自由行动）」。
- ✅ 更新检查：GitHub latest = 1.1.13，本地 1.1.13，判定已最新。
- ✅ 关游戏存档检查：最后一条是 `toggle_ai` 时拒绝关，并给出原因。
- ✅ 状态探针不再污染行动记录：新开的 transcript 只有 `load_save`，没有 `toggle_ai`（用的是 `/settings` + `get_state`）。
- ✅ 经验追加（临时 DSH_HOME 里测）：会建文件、写日期、心情/兴奋/参考值；「发摘要」在会话不存在时明确报失败，不会假装成功。
- ✅ 路由/两道门/设置/404：离线测试通过。
- ✅ 会话列表：`stardew action="sessions"` 列出普通会话；面板下拉走同一个 `sessionController.list`。
- ✅ **`POST /start` 路由级验过**：直接喂 handler → 拉起 SMAPI + 读档；随后 `GET /state` 读到 `status=world`、2072g、FarmHouse。
- ✅ **关游戏 + 追加经验验过（模拟现场）**：最后一条做成 `sleep`、改名 `ping.exe` 冒充 SMAPI 进程，`/close` → 存档检查 → 杀进程 → 经验文件创建并追加。
- ✅ **更新下载安装验过（临时游戏目录）**：1.1.12 假模组 → `/update-apply` 真下载 1.1.13（镜像）→ dll 635904 字节、manifest 1.1.13、`config.json` 标记未动、guide 更新。
- ✅ **强制睡觉编排验过（假 MCP 服务器）**：矿里→回家→睡；已在农舍→直接睡；**回家失败→停，sleep 一次都没调**。
- ✅ **模型 `sleep` 动作也验过（真插件 + 假 MCP）**：成功路径依次调 `get_state` → `travel_to` → `sleep`；把 travel 改成失败后，只调 `get_state`、`travel_to`，**`sleep` 一次没调**。
- ✅ **强制睡觉真机走了前两步**：隐藏启动读档后 `travel_to Mine` → (18,13) → `travel_to FarmHouse` → (3,11)，都成功；没睡，存档时间戳没动。
- ✅ **会话送达验过**：叫醒一个空的普通会话，日志能看到 inbox 消息（source kind = `dsh-stardewvalley-panel`）和回复「管家投递收到」。
- ✅ **窗口/定时/关游戏/睡觉动作都开给模型了**：`stardew action="close"` 在最后一条是 `load_save` 时拒绝并原样回报最后一行；`action="sleep"` 游戏没进存档时明确拒绝；`action="schedule"` 可设/查/清。
- ✅ **一次性定时真机验过（两次）**：`schedule {"in":"2m"}` → 06:48:30 自动拉起（最小化），`schedule {"in":"1m"}` → 06:52:29 自动拉起；触发后文件清空，插件重载后仍是空的。
- ✅ **关游戏后推给自启会话验过（模拟现场）**：临时游戏目录 + 假 SMAPI 进程 + 自己建在 room 的会话；`close` 后日志里能看到「这次玩到 / 玩了几个游戏日 / 最近三天心情 45/38/30 / 参考值 / 存档名 / action="schedule"」，会话已归档、配置已还原。
- ✅ **设置页三个下拉**：玩游戏的会话 / 自启会话 / 主会话，渲染冒烟测试覆盖。
- ✅ **版本和收尾**：`package.json` = 0.1.0，简介/README 第一段不再挂 1.1.13；`docs/dsh-plugin.md` 已删；profile 的 deps/bundles/`node_modules` 只剩 `dsh-stardewvalley-panel`。
- ⏳ 没验：面板按钮点击的**页面认证层**（HTTP 路由已验，页面这边没有浏览器控制权）；真游戏里在矿中按一次「强制回家睡觉」的最后一睡（会写存档，留给她下次玩）。
- ⚠ **跨 workspace 的会话不能投递**：DSH 会报 `cannot append outside a SessionStore`；现在会翻译成人话提示，建议选当前 workspace 里的会话。
- ⚠ 旧行动记录里留下的几条 `toggle_ai` 是改探针之前的痕迹；之后不会再写。

## 测试

```bash
node tests/parse.test.mjs         # get_state 文字、心情表、概率、行动记录
node tests/client.test.mjs        # 浏览器模块 + settings.section + UTF-8
node tests/client-render.test.mjs # React 桩渲染三个 tab（含 dirty 保存条）
node tests/ops.test.mjs           # 路由、两道门、设置、睡觉拒绝、关游戏、404、schedule、推送内容
```

手动真机验证脚本（不进自动化测试）：

```bash
node tests/_live-launch.mjs hidden|minimized|normal     # 启动 + 窗口探测 + 读一次 get_state
node tests/_live-state.mjs                              # 假 ctx 跑 /state，看真游戏状态
node tests/_live-start.mjs                              # 假 ctx 跑 /start（会开游戏），完了杀进程
node tests/_live-close.mjs                              # 模拟 sleep 现场，验关游戏 + 追加经验
node tests/_live-update.mjs                             # 临时游戏目录里 1.1.12 → 真下载安装 1.1.13
node tests/_live-experience.mjs                         # 临时目录验追加经验 / 摘要失败提示
```

（`window-probe.ps1` 是 EnumWindows 探测窗口的 P/Invoke 脚本。）
