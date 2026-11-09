#!/usr/bin/env node
// wb-harvest.cjs — WorkBuddy 积分全自动收割（成长计划任务/签到/派猫/连登/抽奖）
//
// 全部动作走 wbipc 桥、以客户端登录态执行，等价于在界面上替你点"领取"。
// 幂等，可重复跑；任务进度由服务端校验，脚本不伪造使用行为。
//
// 用法:
//   node wb-harvest.cjs                          # 全量收割
//   node wb-harvest.cjs --report                 # 只查状态不领取
//   node wb-harvest.cjs --no-travel --no-lottery # 关闭指定模块
//   node wb-harvest.cjs --dump                   # 打印接口原始 JSON（调试）
//   node wb-harvest.cjs --tasks-out=tasks.json   # 导出任务列表 JSON
"use strict";

const fs = require("fs");
const { withClient, wbFetch, log } = require("./lib/wbipc.cjs");

// ---------- 配置 ----------
const ARGS = new Set(process.argv.slice(2));
const REPORT_ONLY = ARGS.has("--report");
const DUMP = ARGS.has("--dump");
const DO_TRAVEL = !ARGS.has("--no-travel");
const DO_LOTTERY = !ARGS.has("--no-lottery");
const DO_TASKS = !ARGS.has("--no-tasks");
const DO_CHECKIN = !ARGS.has("--no-checkin");
const TASKS_OUT = (process.argv.find((a) => a.startsWith("--tasks-out=")) || "").slice("--tasks-out=".length);

const SUMMARY = [];
function collect(mod, line) {
  SUMMARY.push({ mod, line });
  log(`【${mod}】${line}`);
}

const fetch = (client, ch, m, p, o = {}) => wbFetch(client, ch, m, p, { ...o, dump: DUMP });

// 签到（Buddy 加油站）
async function doCheckin(client, ch) {
  try {
    const st = await fetch(client, ch, "POST", "/v2/billing/meter/checkin-activity-status");
    if (!st.ok) { collect("签到", `状态查询异常 HTTP ${st.status} ${st.raw.slice(0, 160)}`); return; }
    const d = st.data || {};
    const checked = d.today_checked_in ?? d.todayCheckedIn ?? d.checked_in ?? d.is_checked_in;
    const streak = d.streak_days ?? d.consecutive_days ?? d.consecutiveDays;
    collect("签到", `活动: ${d.activity_name ?? d.title ?? "?"}；今日已领: ${checked}；连续: ${streak ?? "?"} 天`);
    if (REPORT_ONLY) return;
    if (checked === true) { collect("签到", "今日已签到，跳过"); return; }
    const r = await fetch(client, ch, "POST", "/v2/billing/meter/daily-checkin");
    const rd = r.data ?? {};
    const rb = r.body ?? {};
    if (r.ok) collect("签到", `领取成功 +${rd.reward ?? rd.credits ?? rd.amount ?? "?"} 分`);
    else if (rb.code === 10001) collect("签到", "今日已签到(幂等)");
    else collect("签到", `领取返回 HTTP ${r.status} code=${rb.code ?? "?"} ${String(rb.msg ?? rb.message ?? r.raw).slice(0, 120)}`);
  } catch (e) {
    collect("签到", `失败: ${e.message}`);
  }
}

// 猫猫旅行：status → depart / claim
async function doTravel(client, ch) {
  try {
    const st = await fetch(client, ch, "GET", "/activity/growth/buddy/travel/status");
    if (!st.ok) { collect("旅行", `状态查询异常 HTTP ${st.status} ${st.raw.slice(0, 160)}`); return; }
    const d = st.data || {};
    const state = d.state;
    if (REPORT_ONLY) { collect("旅行", `state=${state} ${JSON.stringify(d).slice(0, 220)}`); return; }
    if (state === "idle") {
      const r = await fetch(client, ch, "POST", "/activity/growth/buddy/travel/depart", { body: { location_id: 1 } });
      if (r.ok) {
        const rd = r.data ?? {};
        collect("旅行", `已派遣 (咖啡馆)，${rd.arrive_time ?? rd.end_time ?? "稍后"}到家，回程领 5~10 分`);
      } else collect("旅行", `派遣失败 HTTP ${r.status} ${r.raw.slice(0, 160)}`);
    } else if (state === "arrived") {
      const r = await fetch(client, ch, "POST", "/activity/growth/buddy/travel/claim");
      if (r.ok) collect("旅行", `领奖成功 +${r.data?.reward ?? r.data?.credits ?? "?"} 分`);
      else collect("旅行", `领奖返回 HTTP ${r.status} ${r.raw.slice(0, 160)}`);
    } else if (state === "traveling") {
      collect("旅行", `猫在路上 (${d.location?.name ?? "?"})，到家后再跑一次领奖`);
    } else {
      collect("旅行", `未知状态 state=${state} ${JSON.stringify(d).slice(0, 200)}`);
    }
  } catch (e) {
    collect("旅行", `失败: ${e.message}`);
  }
}

// 成长计划任务：接取 available（登记进度跟踪）+ 领取 completed
async function doTasks(client, ch) {
  try {
    const st = await fetch(client, ch, "GET", "/activity/growth/tasks");
    if (!st.ok) { collect("任务", `列表查询异常 HTTP ${st.status} ${st.raw.slice(0, 200)}`); return; }
    if (TASKS_OUT) fs.writeFileSync(TASKS_OUT, JSON.stringify(st.data, null, 2), "utf8");
    const list = st.data?.tasks ?? st.data?.list ?? (Array.isArray(st.data) ? st.data : []);
    if (!list.length) { collect("任务", "无任务或列表为空"); return; }
    const counters = {};
    const claimable = [];
    const acceptable = [];
    for (const t of list) {
      const status = String(t.status ?? t.accept_status ?? "");
      counters[status] = (counters[status] || 0) + 1;
      if (/^(completed|claimable|finished|reward_pending|done)$/i.test(status)) claimable.push(t);
      else if (/^available$/i.test(status)) acceptable.push(t); // 未接取 → 先接任务，服务端才开始跟踪进度
    }
    const statLine = Object.entries(counters).map(([k, v]) => `${k}=${v}`).join(", ");

    if (acceptable.length && !REPORT_ONLY && DO_TASKS) {
      const codes = acceptable.map((t) => t.code ?? t.task_code ?? t.task_id).filter(Boolean);
      if (codes.length) {
        try {
          const r = await fetch(client, ch, "POST", "/activity/growth/tasks/accept", { body: { task_codes: codes } });
          if (r.ok) collect("任务", `已接取 ${acceptable.length} 个任务: ${acceptable.map((t) => t.title).join("、")}`);
          else collect("任务", `接任务返回 HTTP ${r.status} code=${r.body?.code ?? "?"} ${String(r.body?.msg ?? r.raw).slice(0, 120)}`);
        } catch (e) {
          collect("任务", `接任务失败: ${e.message}`);
        }
      }
    }

    if (!claimable.length) {
      collect("任务", `共 ${list.length} 个任务 (${statLine})，无待领奖励`);
      return;
    }
    if (REPORT_ONLY || !DO_TASKS) {
      for (const t of claimable)
        collect("任务", `[待领] ${t.title} (${t.code ?? t.task_code}) 奖励 ${t.reward ?? t.reward_credit ?? t.credits ?? "?"}`);
      return;
    }
    for (const t of claimable) {
      const code = t.code ?? t.task_code ?? t.task_id;
      try {
        const r = await fetch(client, ch, "POST", `/activity/growth/tasks/${encodeURIComponent(code)}/claim`);
        if (r.ok) collect("任务", `${t.title} 领取成功 +${r.data?.reward ?? r.data?.credit ?? r.data?.credits ?? "?"} 分`);
        else collect("任务", `${t.title} 领取返回 HTTP ${r.status} code=${r.body?.code ?? "?"} ${String(r.body?.msg ?? r.raw).slice(0, 120)}`);
      } catch (e) {
        collect("任务", `${t.title} 失败: ${e.message}`);
      }
    }
  } catch (e) {
    collect("任务", `失败: ${e.message}`);
  }
}

// 连续登录档位（只读展示）
async function doStreak(client, ch) {
  try {
    const st = await fetch(client, ch, "GET", "/activity/growth/streak");
    if (!st.ok) { collect("连登", `查询异常 HTTP ${st.status}`); return; }
    const s = st.data?.streak ?? st.data ?? {};
    collect("连登", `已连登 ${s.days ?? "?"} 天；下档 ${s.next_tier ?? "?"} 还差 ${s.next_tier_remaining ?? "?"} 天${s.makeup_cards != null ? `；补登卡 ${s.makeup_cards}` : ""}`);
  } catch (e) {
    collect("连登", `失败: ${e.message}`);
  }
}

// 幸运抽奖：chances → draw（写操作，默认开，可用 --no-lottery 关）
async function doLottery(client, ch) {
  try {
    const st = await fetch(client, ch, "GET", "/activity/growth/lottery/chances");
    if (!st.ok) { collect("抽奖", `次数查询异常 HTTP ${st.status} ${st.raw.slice(0, 160)}`); return; }
    const d = st.data ?? {};
    const chances = Number(d.chances ?? d.count ?? d.remaining ?? d.balance ?? 0);
    if (REPORT_ONLY) { collect("抽奖", `剩余次数 ${chances}`); return; }
    if (!DO_LOTTERY || chances <= 0) { collect("抽奖", `抽奖次数 ${chances}，跳过`); return; }
    for (let i = 0; i < chances; i++) {
      const r = await fetch(client, ch, "POST", "/activity/growth/lottery/draw");
      if (r.ok) collect("抽奖", `第 ${i + 1} 抽: ${r.data?.prize ?? r.data?.result ?? JSON.stringify(r.data).slice(0, 120)}`);
      else { collect("抽奖", `第 ${i + 1} 抽失败 HTTP ${r.status} ${r.raw.slice(0, 120)}`); break; }
    }
  } catch (e) {
    collect("抽奖", `失败: ${e.message}`);
  }
}

// ---------- 主流程 ----------
(async () => {
  if (ARGS.has("--help") || ARGS.has("-h")) {
    console.log(`用法: node wb-harvest.cjs [开关]
一键收割：签到 + 猫猫旅行 + 任务接取/领奖 + 连登 + 抽奖。

开关:
  --no-checkin / --no-travel / --no-tasks / --no-lottery   跳过对应模块
  --report           仅查询汇总（不执行领奖等写操作）
  --tasks-out=<路径>  把任务 JSON 另存到指定文件

需本机 WorkBuddy 客户端运行中（wbipc 登录态）。`);
    process.exit(0);
  }
  await withClient(async (client, ch) => {
    if (DO_CHECKIN) await doCheckin(client, ch);
    if (DO_TRAVEL) await doTravel(client, ch);
    await doTasks(client, ch); // 内部已含 --no-tasks / --report 判断
    await doStreak(client, ch);
    if (DO_LOTTERY) await doLottery(client, ch);
  });
  log(`==== 收割完成，共 ${SUMMARY.length} 条结果 ====`);
  process.exit(0);
})().catch((e) => {
  console.error(`[FATAL] ${e.message}`);
  process.exit(1);
});
