# 已探明的官方接口清单

所有接口经 wbipc `wb.request` pipe 转发，由客户端注入登录态。响应统一信封：
`{code, msg, requestId, data}`；`code === 0` 表示成功。v2 前缀接口为新版。

## 成长计划任务

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v2/activity/growth/tasks` | 任务列表。任务字段：`task_code / title / accept_status(available/accepted/in_progress/completed/claimed) / progress{current,target} / has_reward / reward_credit / jump_url / description` |
| POST | `/v2/activity/growth/tasks/accept` | 接任务（登记进度跟踪）。body: `{"task_codes": [...]}` |
| POST | `/v2/activity/growth/tasks/{task_code}/claim` | 领取奖励。返回 `{credit, energy}` |
| GET | `/v2/activity/growth/subscribe-task/status` | 公众号订阅任务状态（需微信扫码关注，不自动做） |

## 签到（Buddy 加油站）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/v2/billing/meter/checkin-activity-status` | 签到活动状态（今日是否已签、连续天数） |
| POST | `/v2/billing/meter/daily-checkin` | 执行签到。已签时返回 `code=10001`（幂等） |

## 猫猫旅行

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/activity/growth/buddy/travel/status` | 状态：`idle / traveling / arrived`；每日派遣有上限 |
| POST | `/activity/growth/buddy/travel/depart` | 派遣。body: `{"location_id": 1}`（咖啡馆） |
| POST | `/activity/growth/buddy/travel/claim` | 领取回程奖励（5~10 分） |

## 连登 / 抽奖

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/activity/growth/streak` | 连登天数、下一档位、补登卡数 |
| GET | `/activity/growth/lottery/chances` | 剩余抽奖次数 |
| POST | `/activity/growth/lottery/draw` | 抽奖（写操作，可用 `--no-lottery` 关闭） |

## 备注

- 旧版 `/activity/growth/tasks`（无 v2）也可用，但字段名不同（`code` vs `task_code`、`status` vs `accept_status`），`wb-harvest.cjs` 做了双兼容，新代码建议一律用 v2。
- 成长任务进度为服务端埋点 + 校验，**延迟 1~5 分钟**；UI 操作后不要立刻查 status 判失败。
- 以上路径基于 2026-11 客户端实测，客户端升级后可能变化：用 `wb-harvest.cjs --dump` 或 `wb-call.cjs` 直接验证。
