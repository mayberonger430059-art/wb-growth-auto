---
name: wb-growth-auto
description: WorkBuddy 成长计划自动完成器。查询/接取/领取成长计划任务奖励、自动签到、猫猫旅行、抽奖（wbipc 本地桥，零凭据接触），并可通过 CDP 驱动客户端真实完成体验类任务：召唤专家/专家团、使用模板、设置定时任务、处理「待确认」会话。触发词：成长计划、growth、任务奖励、领积分、每日签到、召唤专家、专家团、待确认。
version: "1.1.0"
license: MIT
display_name: WorkBuddy成长计划自动完成器
display_name_en: WorkBuddy Growth Auto
category: automation
---

# WorkBuddy 成长计划自动完成器

自动查询、接取、领取 WorkBuddy「成长计划」任务奖励；自动签到/猫猫旅行/抽奖；能用 CDP 驱动桌面客户端真实完成「体验类」任务（召唤专家、专家团、模板、定时任务、处理待确认提问）。全部动作为真实使用行为，**不伪造埋点**；进度由服务端校验，通常有 1~5 分钟延迟。

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
| `app` | 真实点击打开「发现应用」面板 |
| `pending` | 列出所有「待确认」会话名 |
| `tc "<会话名>"` | 真实鼠标事件（trusted click）切换会话 |
| `visit "<会话名>" [out.png]` | 切会话+截图+抓按钮清单（一次连接内完成，防焦点弹回） |
| `shot <path>` | 截图当前窗口（先看图再决定下一步，别盲点） |
| `eval "<js>"` | 主窗口执行任意 JS（异步支持） |

环境变量：`WB_CDP_PORT`（默认 9222）、`WB_SHOT_DIR`（默认 ./shots）、`WORKBUDDY_CONFIG_DIR`（默认 ~/.workbuddy）。

## 建议流程（一遍收割）

1. `wb-growth.cjs status` 摸底，记录 accepted 且 0 进度的任务。
2. `wb-harvest.cjs` 完成签到/旅行/接任务/领奖/抽奖。
3. 按 status 里的专家类任务名单跑 `wb-tasks.cjs experts` / `teams`。
4. `wb-tasks.cjs templates` 模板 5 连；定时任务用客户端「定时任务→新建」。
5. 处理「待确认」：`pending` 列名单 → `tc` 切进去 → `shot` 看图 → 点选项卡片答复。
6. `sleep 180` 后复查 status，`claim-all` 收尾。
7. 无法自动的（连接器授权/公众号关注/扫码登录类）如实报告，留给用户。

## 关键坑（详见 docs/pitfalls.md）

1. 客户端自动跟随「最新活跃会话」，视图频繁弹回：**所有「切会话→操作→验证」必须压进一次 CDP 连接内**。
2. `el.click()`（untrusted）对视图切换经常无效，必须用 `Input.dispatchMouseEvent` 真实鼠标事件。
3. 服务端进度延迟 1~5 分钟：别在发送后立刻查 status 判失败。
4. React 表单：input 用 prototype setter + `dispatchEvent('input')`；contenteditable 用 `Input.insertText`。

## 安全边界

- 写操作白名单：`growth/tasks/accept`、`growth/tasks/{code}/claim`、签到/旅行/抽奖领取、CDP 页面内真实 UI 点击。其余写接口一律拒绝。
- 涉及扫码/登录/账号授权的任务（关注公众号、腾讯云连接器）不代做。
- 专家对话消耗积分（实测每个 5~15 分），批量跑前告知用户。
