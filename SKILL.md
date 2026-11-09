---
name: wb-growth-auto
description: WorkBuddy 成长计划自动完成器。查询/接取/领取成长计划任务奖励、自动签到、猫猫旅行、抽奖（wbipc 本地桥，零凭据接触），并可通过 CDP 驱动客户端真实完成体验类任务：召唤专家/专家团、使用模板、新建定时任务、处理「待确认」会话。触发词：成长计划、growth、任务奖励、领积分、每日签到、召唤专家、专家团、待确认、定时任务。
version: "1.2.0"
license: MIT
display_name: WorkBuddy成长计划自动完成器
display_name_en: WorkBuddy Growth Auto
category: automation
---

# WorkBuddy 成长计划自动完成器

自动查询、接取、领取 WorkBuddy「成长计划」任务奖励；自动签到/猫猫旅行/抽奖；能用 CDP 驱动桌面客户端真实完成「体验类」任务（召唤专家、专家团、模板、定时任务、处理待确认提问）。全部动作为真实使用行为，**不伪造埋点**；进度由服务端校验，通常有 1~5 分钟延迟。

## 第一步永远是自检（不要跳过）

```bash
node scripts/wb-doctor.cjs
```

只读命令，一次查完：Node 版本 / wbipc 端点与握手 / CDP 端口与主窗口 / 任务接取状态 /
可自动 vs 需真人 / 行业模板是否锁死，**最后一行直接给出该跑哪条命令**。

- 有任何 `FAIL` → 先修环境，别往下走。
- `WARN 未接取 N 个` → 下一步跑 `accept-all`（见下）。
- `WARN 可自动完成` → 跑到它给的那条命令。
- `WARN 需真人处理` → 别对着这些跑脚本，扫码/授权类本工具不代做。
- `--json` 输出机器可读结果（有 FAIL 时退出码 1），可做前置判断。

## 第二步：接任务（最容易被漏掉、漏了就全白干）

```bash
node scripts/wb-growth.cjs accept-all
```

成长计划每个任务都有一道「去完成」按钮，**没点之前做任何动作都不计数**。
这是「我明明用了专家但进度还是 0」的唯一根因。服务端把该状态叫 `not_accepted`（不是文档里的 `available`），
命令已把 `available / not_accepted / unaccepted / pending / 空` 全纳入，排除 `completed / claimed`。
换号、久未跑、客户端升级后必须先跑这一条。

## 前置条件

| 条件 | 说明 |
|---|---|
| WorkBuddy 桌面端已启动并登录 | wbipc 端点文件 `~/.workbuddy/wbipc/endpoint.json` 存在即可用 API 路线 |
| CDP 调试端口（仅 UI 路线需要） | 客户端需以 `--remote-debugging-port=9222` 启动 |
| Node.js >= 18 | 零第三方依赖 |
| Git Bash 注意 | 直接调 `wb-call.cjs GET /v2/...` 时路径会被 MSYS 转换，必须加 `MSYS_NO_PATHCONV=1` |

## 两条路线

### A. API 路线（wbipc 本地桥，优先用）

原理：连接 `~/.workbuddy/wbipc/endpoint.json` 里的命名管道，经 `wb.request` pipe 以**客户端自身登录态**转发 HTTP 请求。脚本不接触、不落盘任何凭据。

- `scripts/wb-call.cjs <METHOD> <PATH> [JSON_BODY]` — 任意官方 API 调用。
- `scripts/wb-doctor.cjs [--json]` — 只读自检，给下一步命令。
- `scripts/wb-growth.cjs status [--json]` — 列出成长任务：`task_code / 状态 / 进度 / 标题`。
- `scripts/wb-growth.cjs claim <task_code>` / `claim-all` / `accept-all` — 领奖与接任务。
- `scripts/wb-harvest.cjs [--report] [--no-travel] [--no-lottery]` — 一键收割（签到+旅行+任务+连登+抽奖），幂等。

### B. UI 路线（CDP，完成「体验类」任务）

`scripts/wb-tasks.cjs`（目标窗口自动识别：排除 settings 窗口，取含「新建任务」的主窗口）：

| 命令 | 作用 |
|---|---|
| `experts "名1" "名2"...` | 逐个：开专家中心→搜索→点卡片→召唤→发送预填话术→等待对话结束。模糊匹配即可 |
| `teams "团1" "团2"...` | 同上，先切「专家团」页签（等待时间更长） |
| `templates` | 五个快捷分类（金融/数据/PPT/研究/策划）各发一条模板 |
| `automation "<名>" "<提示词>"` | 新建定时任务：填名→填词→确定→勾「我已了解风险」→允许完全访问，默认每天 |
| `automation-rm "<名>"` | 删除指定定时任务（更多→删除→确认） |
| `app` | 真实点击打开「发现应用」面板 |
| `pending` | 列出所有「待确认」会话名 |
| `tc "<会话名>"` | 真实鼠标事件（trusted click）切换会话 |
| `visit "<会话名>" [out.png]` | 切会话+截图+抓按钮清单（一次连接内完成，防焦点弹回） |
| `shot <path>` | 截图当前窗口（先看图再决定下一步，别盲点） |
| `eval "<js>"` | 主窗口执行任意 JS（异步支持） |

环境变量：`WB_CDP_PORT`（默认 9222）、`WB_SHOT_DIR`（默认 ./shots）、`WORKBUDDY_CONFIG_DIR`（默认 ~/.workbuddy）。

## 标准流程（一遍收割）

0. `wb-doctor.cjs` 自检 —— 按它最后一行给的建议走，有 FAIL 先修环境。
1. `wb-growth.cjs accept-all` 接任务（**必做**，漏了后面全不计数）。
2. `wb-harvest.cjs` 完成签到/旅行/接任务/领奖/抽奖。
3. 按 doctor 或 status 里的待办名单跑 `wb-tasks.cjs experts` / `teams`。
4. `wb-tasks.cjs templates` 模板 5 连；定时任务用 `wb-tasks.cjs automation`。
5. 处理「待确认」：`pending` 列名单 → `tc` 切进去 → `shot` 看图 → 点选项卡片答复。
6. 等 1~5 分钟：`sleep 180` 后复查 status，`claim-all` 收尾。
7. 无法自动的（连接器授权/公众号关注/扫码登录类）如实报告，留给用户——`doctor` 会把它们单独列出。

## 关键坑（详见 docs/pitfalls.md）

1. 客户端自动跟随「最新活跃会话」，视图频繁弹回：**所有「切会话→操作→验证」必须压进一次 CDP 连接内**。
2. `el.click()`（untrusted）对视图切换经常无效，必须用 `Input.dispatchMouseEvent` 真实鼠标事件。
3. 服务端进度延迟 1~5 分钟：别在发送后立刻查 status 判失败。
4. React 表单：input 用 prototype setter + `dispatchEvent('input')`；contenteditable 用 `Input.insertText`。

## 安全边界

- 写操作白名单：`growth/tasks/accept`、`growth/tasks/{code}/claim`、签到/旅行/抽奖领取、CDP 页面内真实 UI 点击。其余写接口一律拒绝。
- 涉及扫码/登录/账号授权的任务（关注公众号、腾讯云连接器）不代做。
- 专家对话消耗积分（实测每个 5~15 分），批量跑前告知用户。

## Hy4 客户端（5.9.3+）适配差异 —— 换号/升级后必看

新版客户端把成长计划里最容易踩的三处改了，照旧流程跑会「全部动作都做了但进度 0」：

### 1. 行业模板会把专家市场锁成垂直行业
新号首次登录会绑定一个行业模板（如「企鹅教师助手」），此时专家市场只返回该行业专家，搜「电商」「抖音」全部 0 结果。
**修复**：点开左上角模板切换器，切回通用模板，市场立即恢复全量。

**怎么判断锁没锁**（`wb-doctor.cjs` 已内置）：看 trigger 的**修饰类**，不是看按钮文案——

```
industry-template-switcher__trigger--general   → 通用，未锁
industry-template-switcher__trigger--<其他>    → 已锁，专家市场被限
```

⚠️ Hy4 把这个组件复用成了「发现应用」按钮，按钮文案已不代表行业，按文案判断会 100% 误报。

### 2. 任务接取状态值是 not_accepted，不是 available
`accept-all` 原来只过滤 `accept_status === "available"`，新号上所有任务都是 `not_accepted`，导致**一个都没接上**，后续所有动作都不计数。
**修复**（已内置）：把 `not_accepted / unaccepted / pending / 空` 全部纳入待接取集合，排除 `completed / claimed`。
**这是「先点去完成」这一步的 API 等价物** —— 必须在做任何体验类任务之前跑。

### 3. 专家/专家团对话会卡在追问，不答完就不计数
- 专家对话常停在「有没有实拍照片？」这类追问 → 必须点选项卡片答复并发送，对话才算完成，`expert_use_*` 才 +1
- 专家团点「召唤」后必弹「专家团使用提示」（消耗为数倍），必须点「悉知并继续使用」才进对话

### 4. 新版关键选择器（与旧版对照）
| 用途 | 旧版 | Hy4 |
|---|---|---|
| 专家入口 | `button.conversation-list-tab-button` 含「专家」 | 同（仍可用），侧栏文案改为「专家·技能·连接器」 |
| 市场结果卡 | `_expertScroll_` + 卡片 | `ARTICLE[class*="_centerCard_"]`，名称节点 `[class*="_role_"]` |
| 召唤按钮 | `_headerSummonBtn_` | 同 `_headerSummonBtn_16tzy_125` |
| 模板/灵感卡 | `.wb-home-prompt-list__row` | `.wb-home-prompt-list__text` |
| 定时任务新建 | `input[placeholder="输入任务名称"]` | 同，仍需 `.cr-send-button` 类名 |
| 成长计划菜单 | `.user-menu-item--growth-record` | **已移除**，成长计划改由网页承载（需登录，本工具不代做） |

### 5. 定时任务保存的权限弹窗
Hy4 新建定时任务强制走「允许完全访问」确认：必须先勾选「我已了解风险」复选框，按钮才可点，且该按钮用 JS `.click()` 会被 tooltip 遮挡 —— 必须用 `Input.dispatchMouseEvent` 真实鼠标点击。

### 6. 提示词编辑器是 Slate.js（最阴的一条）
定时任务/对话的输入区是 Slate 富文本（DOM 带 `data-slate-node`）。
**`document.execCommand('insertText')`、直接改 innerText、value setter 全部无效** —— DOM 看着有字，但 Slate 内部 model 是空的，「确定」按钮永远是灰的，还不报错。

正确做法（`automation` 命令已内置）：

```
真实点击聚焦 → Ctrl+A → Delete → Input.insertText
```

`Input.insertText` 走的是 CDP 输入通道，Slate 才会收进 model。
判据：填完撤销一次「确定」按钮的 `disabled` 是否变 false，变了才算真填进去。
