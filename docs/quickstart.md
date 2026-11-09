# 快速开始：从零到收割

这份文档只回答一个问题：**第一步到底该做什么。**

结论先给：

> **第一步不是 `status`，是 `wb-doctor`。**
> 它是一条只读自检命令，跑完直接告诉你「下一步跑哪条」，不用读文档、不用猜。

---

## 第一步（唯一必做）

```bash
node scripts/wb-doctor.cjs
```

真实输出长这样：

```console
$ node scripts/wb-doctor.cjs

WorkBuddy 成长计划 · 环境自检
====================================================
[ OK ] Node 22.22.2
[ OK ] 端点文件存在
[ OK ] 握手成功，pipe: wb.entitlement, wb.request, wb.wecom-a2a
[ OK ] 共 18 个 · 已完成 15 · 进行中 3 · 未接取 0
[WARN] 可自动完成 1 个: automation_1
       -> 用 wb-tasks.cjs experts / teams / templates 完成
[WARN] 需真人处理 2 个: playbook_prompt(探索优秀灵感…); wb_wechat_oa_subscribe_task(关注公众号…)
       -> 本工具不代做扫码/授权类动作，留着或自己点
[ OK ] 端口 9222 可连，4 个 target
[ OK ] 主窗口已识别
[ OK ] 行业模板: 通用（未锁定）
====================================================
结果: OK 7 · WARN 2 · FAIL 0

下一步跑这条:
  node scripts/wb-tasks.cjs automation "<任务名>" "<提示词>"
```

它一次查完四件事，**任何一项 FAIL 都不用往下走**：

| 检查项 | 失败意味着 | 怎么修 |
|---|---|---|
| Node ≥ 18 | 脚本语法都跑不起来 | 升级 Node |
| wbipc 端点 + 握手 | 客户端没开 / 没登录 / 换号后没重启 | 启动并登录客户端 |
| CDP 9222 | 体验类任务全做不了 | `WorkBuddy.exe --remote-debugging-port=9222` |
| 行业模板 | 专家市场只返回一个行业，搜「电商」0 结果 | 点开模板切换器 → 选通用 |

`--json` 输出机器可读结果，方便挂到脚本/CI 里做前置判断。

---

## 第二步：接任务（最容易被漏掉的一步）

```bash
node scripts/wb-growth.cjs accept-all
```

**为什么这步不能省：**

成长计划里每个任务都有一道「去完成」的按钮，点它才把任务登记进你的进度跟踪。
**没点之前，你做什么动作都不计数。** 这是所有「我明明用了专家，进度还是 0」的根因。

服务端把这个状态叫 `not_accepted`（不是文档里的 `available`）。
旧版 `accept-all` 只认 `available`，于是新号上**一个都接不上** —— 这才是真正的坑。

现在 `accept-all` 把 `available / not_accepted / unaccepted / pending / 空` 全纳入接取范围，
只排除 `completed / claimed`。跑完会打印实际接取到的任务码。

> 换号、隔很久没跑、客户端升级后，都先跑这条。

---

## 第三步：API 路线收割（签到 / 旅行 / 抽奖 / 领奖）

```bash
node scripts/wb-harvest.cjs
```

一条命令搞定：签到 → 猫猫旅行 → 接任务 → 连登 → 抽奖 → 领奖，全程幂等，重复跑无副作用。

先干看不动：

```bash
node scripts/wb-harvest.cjs --report
```

---

## 第四步：体验类任务（要 CDP）

这些任务服务端要求「真的用过」，只能驱动 UI：

```bash
node scripts/wb-tasks.cjs experts "中国电商运营专家" "抖音策略师"
node scripts/wb-tasks.cjs teams "内容创作专家团"
node scripts/wb-tasks.cjs templates
node scripts/wb-tasks.cjs automation "每日工作复盘" "总结今天完成的工作，列3条成果和1条明日重点"
```

每个命令都做了三件保命的事：等对话真正结束、处理「待确认」追问、失败时输出实际 DOM 状态而不是空报错。

---

## 第五步：等 1~5 分钟，然后收尾

```bash
sleep 180
node scripts/wb-growth.cjs claim-all
```

**别在发送完立刻查进度。** 服务端校验有 1~5 分钟延迟，立刻查只会看到 0，
然后你以为失败了又跑一遍 —— 白烧积分。

---

## 完整一遍（复制即用）

```bash
cd /path/to/wb-growth-auto
node scripts/wb-doctor.cjs                 # 1. 自检，按提示走
node scripts/wb-growth.cjs accept-all      # 2. 接任务（不能省）
node scripts/wb-harvest.cjs                # 3. 签到/旅行/抽奖/领奖
node scripts/wb-tasks.cjs experts "抖音策略师" "中国电商运营专家"   # 4. 体验类
node scripts/wb-tasks.cjs templates
node scripts/wb-tasks.cjs automation "每日复盘" "总结今天的工作"
sleep 180                                   # 5. 等校验
node scripts/wb-growth.cjs claim-all        # 6. 收尾
```

---

## 常见卡点对照表

| 现象 | 真实原因 | 处理 |
|---|---|---|
| `端点文件不存在` | 客户端没启动 | 启动 WorkBuddy 并登录 |
| 握手失败 `code=...` | 换号后旧 ticket 失效 | 重启客户端 |
| 所有动作做完，进度还是 0 | **没接任务** | 先 `accept-all` |
| 搜专家 0 结果 | 行业模板锁死 | 重置为通用模板 |
| 专家对话卡住不计数 | 停在追问没答 | 点选项卡片答复并发送 |
| 定时任务「确定」永远灰 | 编辑器是 Slate，JS 赋值无效 | 用 `wb-tasks.cjs automation`，它走真实键盘输入 |
| 权限按钮点不动 | 没勾「我已了解风险」/ 被 tooltip 遮挡 | 同上，命令内置了 |
| 进度 0 但动作都做了 | 服务端延迟 | 等 1~5 分钟 |

更细的 DOM/选择器级踩坑见 [pitfalls.md](pitfalls.md)，接口细节见 [api.md](api.md)。
