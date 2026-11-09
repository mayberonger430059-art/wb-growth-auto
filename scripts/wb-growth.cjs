#!/usr/bin/env node
// wb-growth.cjs — 成长计划任务速查/领奖（进程内走 wbipc，无需多次握手）
//
// 用法:
//   node wb-growth.cjs status            # 列出任务：task_code / 状态 / 进度 / 标题
//   node wb-growth.cjs status --json     # 输出原始 JSON
//   node wb-growth.cjs claim <task_code> # 领取单个任务奖励
//   node wb-growth.cjs claim-all         # 幂等领取所有 completed 且有奖励的任务
//   node wb-growth.cjs accept-all        # 接取所有 available 任务（登记进度跟踪）
"use strict";

const { withClient, wbFetch } = require("./lib/wbipc.cjs");
const { isPendingTake } = require("./lib/growth-rules.cjs");

const cmd = process.argv.includes("--help") || process.argv.includes("-h") ? "__help" : (process.argv[2] || "status");

if (cmd === "__help") {
  console.log(`用法: node wb-growth.cjs <命令>
  status            列出任务：task_code / 状态 / 进度 / 标题
  status --json     输出原始 JSON
  claim <code>      领取单个任务奖励
  claim-all         幂等领取所有 completed 且有奖励的任务
  accept-all        接取所有 available 任务（登记进度跟踪）

需本机 WorkBuddy 客户端运行中（wbipc 登录态）。`);
  process.exit(0);
}

(async () => {
  await withClient(async (client, ch) => {
    const fetch = (m, p, o) => wbFetch(client, ch, m, p, o);

    if (cmd === "status") {
      const st = await fetch("GET", "/v2/activity/growth/tasks");
      if (!st.ok) { console.error(`查询失败 HTTP ${st.status} ${st.raw.slice(0, 200)}`); process.exit(2); }
      const tasks = st.data?.tasks ?? [];
      if (process.argv.includes("--json")) {
        console.log(JSON.stringify(tasks, null, 2));
      } else {
        for (const t of tasks) {
          const p = t.progress ? `${t.progress.current}/${t.progress.target}` : "";
          console.log([t.task_code, t.accept_status, p, t.title].join("\t"));
        }
      }
    } else if (cmd === "claim") {
      const code = process.argv[3];
      if (!code) { console.error("缺少 task_code"); process.exit(1); }
      const j = await fetch("POST", `/v2/activity/growth/tasks/${encodeURIComponent(code)}/claim`);
      console.log(JSON.stringify(j.body, null, 2));
      if (!j.ok) process.exit(2);
    } else if (cmd === "claim-all") {
      const st = await fetch("GET", "/v2/activity/growth/tasks");
      const tasks = st.data?.tasks ?? [];
      let claimed = 0;
      for (const t of tasks) {
        if (t.accept_status !== "completed" || !t.has_reward) continue;
        const j = await fetch("POST", `/v2/activity/growth/tasks/${encodeURIComponent(t.task_code)}/claim`);
        const d = j.body?.data ?? {};
        console.log(`${t.task_code}\t${j.body?.code === 0 ? `+${d.credit ?? "?"} credits +${d.energy ?? "?"} energy` : `FAIL ${j.body?.msg ?? ""}`}`);
        if (j.body?.code === 0) claimed++;
      }
      console.log(`共领取 ${claimed} 个任务奖励`);
    } else if (cmd === "accept-all") {
      const st = await fetch("GET", "/v2/activity/growth/tasks");
      const tasks = st.data?.tasks ?? [];
      // 判定规则见 lib/growth-rules.cjs：服务端对未接取任务返回 not_accepted（不是 available）
      const codes = tasks.filter((t) => isPendingTake(t.accept_status)).map((t) => t.task_code);
      if (!codes.length) { console.log("无待接取任务"); return; }
      const j = await fetch("POST", "/v2/activity/growth/tasks/accept", { body: { task_codes: codes } });
      if (j.body?.code === 0) {
        const got = j.body?.data?.accepted ?? j.body?.data?.task_codes ?? codes;
        console.log(`已接取 ${Array.isArray(got) ? got.length : codes.length} 个任务: ${codes.join(",")}`);
      } else {
        console.log(`接取失败: ${JSON.stringify(j.body).slice(0, 300)}`);
      }
    } else {
      console.error("unknown command: status | claim | claim-all | accept-all");
      process.exit(1);
    }
  }, { verbose: false });
  process.exit(0);
})().catch((e) => {
  console.error(`[FATAL] ${e.message}`);
  process.exit(1);
});
