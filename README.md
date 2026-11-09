# wb-growth-auto

WorkBuddy 成长计划自动完成器：查询/接取/领取成长计划任务奖励，自动签到、猫猫旅行、连登档位、幸运抽奖，并可通过 CDP 驱动桌面客户端真实完成「体验类」任务（召唤专家/专家团、使用模板、设置定时任务、处理「待确认」会话）。

全部动作为**真实使用行为**：不伪造埋点、不伪造事件，进度由服务端校验（通常有 1~5 分钟延迟）。脚本不接触、不落盘任何明文凭据，等价于在界面上替你点按钮。

## 功能一览

| 能力 | 入口 | 路线 |
|---|---|---|
| 任意官方 API 调用（借客户端登录态） | `wb-call.cjs` | wbipc |
| 成长任务：查状态 / 接取 / 领奖 | `wb-growth.cjs` | wbipc |
| 一键收割：签到+旅行+任务+连登+抽奖 | `wb-harvest.cjs` | wbipc |
| 召唤专家 / 专家团并完成对话 | `wb-tasks.cjs experts/teams` | CDP |
| 模板 5 连、发现应用 | `wb-tasks.cjs templates/app` | CDP |
| 处理「待确认」会话、切换会话、截图 | `wb-tasks.cjs pending/tc/visit/shot` | CDP |
| 任意页面 JS 注入（调试） | `wb-tasks.cjs eval` | CDP |

## 前置条件

| 条件 | 说明 |
|---|---|
| WorkBuddy 桌面端已启动并登录 | wbipc 端点文件 `~/.workbuddy/wbipc/endpoint.json` 存在即可用 API 路线 |
| Node.js >= 18 | 零第三方依赖，无需 npm install |
| CDP 调试端口（仅 UI 路线需要） | 客户端以 `--remote-debugging-port=9222` 启动 |

开启 CDP 调试端口（Windows）：

```powershell
& "C:\Users\<你>\AppData\Local\Programs\WorkBuddy\WorkBuddy.exe" --remote-debugging-port=9222
```

## 快速开始

```bash
# 1. 摸底：成长任务状态
node scripts/wb-growth.cjs status

# 2. 一键收割（签到/旅行/接任务/领奖/连登/抽奖，幂等）
node scripts/wb-harvest.cjs

# 3. 体验类任务（需要 CDP 端口）
node scripts/wb-tasks.cjs experts "中国电商运营专家" "抖音策略师"
node scripts/wb-tasks.cjs teams "内容创作专家团"
node scripts/wb-tasks.cjs templates

# 4. 进度有 1~5 分钟延迟，稍后复查并领奖
node scripts/wb-growth.cjs claim-all
```

Git Bash 用户注意：直接调 `wb-call.cjs GET /v2/...` 时路径会被 MSYS 转换，必须加 `MSYS_NO_PATHCONV=1`（`wb-growth.cjs`/`wb-harvest.cjs` 不受影响）。

## 配置项（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `WORKBUDDY_CONFIG_DIR` | `~/.workbuddy` | wbipc 端点文件所在配置目录 |
| `WB_CDP_PORT` | `9222` | CDP 调试端口 |
| `WB_SHOT_DIR` | `./shots` | 截图输出目录 |

`wb-harvest.cjs` 开关：`--report`（只查不动）、`--dump`（打印原始响应）、`--no-travel` / `--no-lottery` / `--no-tasks` / `--no-checkin`、`--tasks-out=<file>`（导出任务 JSON）。

## 目录结构

```
wb-growth-auto/
├── SKILL.md               # WorkBuddy 技能定义（可直接装入 ~/.workbuddy/skills/）
├── scripts/
│   ├── lib/
│   │   ├── wbipc.cjs      # wbipc 握手 + RPC + http.fetch 转发（核心库）
│   │   └── cdp.cjs        # CDP 会话封装（eval/截图/真实鼠标键盘）
│   ├── wb-call.cjs        # 通用 API 调用器
│   ├── wb-growth.cjs      # 成长任务 status/claim/claim-all/accept-all
│   ├── wb-harvest.cjs     # 一键收割（签到/旅行/任务/连登/抽奖）
│   └── wb-tasks.cjs       # UI 自动化（专家/团队/模板/应用/待确认）
├── docs/
│   ├── api.md             # 已探明的官方接口清单
│   └── pitfalls.md        # 实测踩坑记录（焦点抢占/可信点击/React 表单等）
├── examples/              # 定时运行示例
└── shots/                 # 截图输出（git 忽略）
```

## 作为 WorkBuddy 技能安装

```bash
cp -r . ~/.workbuddy/skills/wb-growth-auto   # 或 Windows 下复制到 %USERPROFILE%\.workbuddy\skills\wb-growth-auto
```

之后对 WorkBuddy 说「跑一下成长计划收割」即可触发。

## 安全说明

- wbipc 握手校验 server_proof（HMAC-SHA256，ticket 来自本地 endpoint.json），不透传凭据。
- 日志/输出不含 token；不修改登录态文件。
- 写操作白名单：`growth/tasks/accept`、`growth/tasks/{code}/claim`、签到/旅行/抽奖领取，以及 CDP 页面内真实 UI 点击。其余写接口一律不调。
- 涉及扫码/登录/账号授权的任务（关注公众号、连接器授权）**不代做**，如实报告留给用户。
- 专家对话消耗积分（实测每个 5~15 分），收益（50~100/任务）远大于成本，但批量跑前应知会用户。

## 已知限制

- 任务完成判定走服务端埋点 + 服务端校验，有 1~5 分钟延迟，发送后立刻查 status 会误判失败。
- 「体验发现应用」需要真实启动一个应用才计数（仅打开面板不计数）。
- 「腾讯轻量云专家」等需要连接器授权的任务不可自动完成。
- UI 路线依赖客户端 DOM 类名（`_centerCard_`、`.cr-send-button` 等），客户端升级改版后可能需要更新选择器。

## 版本与迭代

- 版本号遵循 SemVer，变更记录在 [CHANGELOG.md](CHANGELOG.md)。
- 客户端改版导致选择器失效时：用 `wb-tasks.cjs eval` 重新探测 DOM → 更新选择器 → 升 minor。
- 接口变更时：用 `wb-harvest.cjs --dump` 抓原始响应 → 更新字段映射 → 升 patch/minor。

## License

[MIT](LICENSE)
