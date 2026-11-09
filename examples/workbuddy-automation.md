# 在 WorkBuddy 内设置每日自动收割

两条路，任选：

## 路 A：用本仓库的 automation 命令（推荐，一条命令建好）

```bash
node scripts/wb-tasks.cjs automation "成长计划每日收割" \
  "运行 node <仓库绝对路径>/scripts/wb-harvest.cjs，读取输出并向用户简短汇报签到、积分、旅行、任务进度；令牌失效就提醒用户打开客户端刷新登录，不要伪造数据。"
```

它会走完 填名 → 填提示词 → 确定 → 勾风险确认 → 允许完全访问，并验证任务真的落库。
删除：`node scripts/wb-tasks.cjs automation-rm "成长计划每日收割"`。

## 路 B：直接在对话框里让 WorkBuddy 建

对 WorkBuddy 说「创建一个每天 9/12/15/18/21 点运行的自动化」，提示词参考：

```text
运行 Bash 命令：node <仓库绝对路径>/scripts/wb-harvest.cjs。
该命令幂等：今日已签到会自动跳过；猫猫旅行到达会自动领取并重新派出
（每日上限到达会自动跳过，不会丢积分）。读取脚本输出，向用户简短汇报：
签到结果、领取积分与连续天数、猫猫旅行情况、成长计划任务进度。
若提示令牌失效或未找到登录态，提醒用户打开 WorkBuddy 客户端刷新登录，
不要伪造数据。
```

一天多个时间点跑是为了容错：电脑只要在任一时间点开着就能签上。

## 想更稳的话

把自检也加进去，出问题能自己发现：

```bash
node scripts/wb-doctor.cjs --json > /tmp/wb.json || echo "环境有问题，先修"
```
