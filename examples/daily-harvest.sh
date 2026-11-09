#!/usr/bin/env bash
# 每日收割示例：签到 + 猫猫旅行 + 接任务 + 领奖 + 抽奖（幂等，可重复跑）
# 配合 WorkBuddy 自动化或系统计划任务，每天跑若干次即可。
# 注意：脚本所在目录即仓库根目录下的 scripts/。
set -e
cd "$(dirname "$0")/.."
node scripts/wb-harvest.cjs
