#!/usr/bin/env node
// wb-doctor.cjs — 开跑前的环境自检（回答「第一步怎么开始」）
//
// 只读，不改任何状态。一次跑完给出：
//   1. wbipc 端点 / 握手 / 可见 pipe
//   2. CDP 调试端口 / 主窗口识别
//   3. 成长任务盘子（已完成 / 已接未完成 / 未接取）
//   4. 专家市场是否被行业模板锁死
//   5. 明确的下一条命令
//
// 用法: node wb-doctor.cjs [--json]
// 零凭据接触：仅读本地端点文件做握手，不落盘任何 token。
"use strict";

const fs = require("fs");
const path = require("path");

const AS_JSON = process.argv.includes("--json");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`用法: node wb-doctor.cjs [--json]

开跑前的只读自检：环境 / 任务盘子 / 下一条命令。
不改任何状态，可随时重复跑。`);
  process.exit(0);
}

const R = []; // { level: 'ok'|'warn'|'fail', key, msg, next? }
const add = (level, key, msg, next) => R.push({ level, key, msg, next });
const icon = (l) => (l === "ok" ? "[ OK ]" : l === "warn" ? "[WARN]" : "[FAIL]");

// ---------- 1. Node ----------
(function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 18) add("ok", "node", `Node ${process.versions.node}`, null);
  else
    add("fail", "node", `Node ${process.versions.node} 太低`, "升级到 Node >= 18（内置 WebSocket / fetch 需要）");
})();

// ---------- 2+4. wbipc 握手 + 任务盘子（同一次连接内完成） ----------
const DONE = new Set(["completed", "claimed"]);

// 物理不可自动的任务：需要扫码 / 账号授权 / 服务端 feature flag 未开。
// 这些不放进「待办」，否则用户会一直对着它们跑脚本。
const MANUAL = {
  wb_wechat_oa_subscribe_task: "关注公众号（需微信扫码）",
  playbook_prompt: "探索优秀灵感（客户端内容位为空，受 feature flag 控制）",
  wb_connect_tencent_cloud: "腾讯云连接器授权（需账号登录）",
};

// 任务码 → 该用哪条命令。顺序即优先级。
const CODE_HINTS = [
  [/automation/i, 'node scripts/wb-tasks.cjs automation "<任务名>" "<提示词>"'],
  [/expert_team|team/i, 'node scripts/wb-tasks.cjs teams "<专家团名>"'],
  [/expert/i, 'node scripts/wb-tasks.cjs experts "<专家名>"'],
  [/template|playbook/i, "node scripts/wb-tasks.cjs templates"],
  [/app|discover/i, "node scripts/wb-tasks.cjs app"],
];

let autoTodo = []; // 可自动完成的待办任务码

async function checkApi() {
  const cfgDir = (process.env.WORKBUDDY_CONFIG_DIR || "").trim() ||
    path.join(require("os").homedir(), ".workbuddy");
  const epFile = path.join(cfgDir, "wbipc", "endpoint.json");

  if (!fs.existsSync(epFile)) {
    add("fail", "wbipc", `端点文件不存在: ${epFile}`,
      "启动 WorkBuddy 桌面端并登录（客户端运行时会自动写这个文件）");
    return;
  }
  add("ok", "wbipc-file", "端点文件存在", null);

  let withClient, wbFetch;
  try {
    ({ withClient, wbFetch } = require("./lib/wbipc.cjs"));
  } catch (e) {
    add("fail", "wbipc-lib", `wbipc 库缺失: ${String(e.message).slice(0, 100)}`, "确认 scripts/lib/wbipc.cjs 存在");
    return;
  }

  try {
    await withClient(
      async (client, ch) => {
        const pipes = client.pipes ? [...client.pipes] : [];
        add("ok", "wbipc-handshake", `握手成功，pipe: ${pipes.join(", ") || "(无)"}`, null);
        if (!pipes.includes("wb.request")) {
          add("warn", "wbipc-request", "未发现 wb.request pipe", "登录态可能未就绪，重启客户端后再试");
        }

        const st = await wbFetch(client, ch, "GET", "/v2/activity/growth/tasks");
        if (!st.ok) {
          add("fail", "tasks", `任务查询失败 HTTP ${st.status}`, "登录态可能过期，重新登录客户端");
          return;
        }
        const tasks = st.data?.tasks ?? [];
        const done = tasks.filter((t) => DONE.has(t.accept_status)).length;
        const untaken = tasks.filter((t) => {
          const s = t.accept_status;
          return !DONE.has(s) && (!s || s === "not_accepted" || s === "available" || s === "unaccepted" || s === "pending");
        }).length;
        const running = tasks.length - done - untaken;

        add("ok", "tasks", `共 ${tasks.length} 个 · 已完成 ${done} · 进行中 ${running} · 未接取 ${untaken}`, null);

        if (untaken > 0) {
          add("warn", "tasks-accept", `${untaken} 个任务还没接取`,
            "必须先接取 —— 这是「点去完成」的等价动作，不接取后续动作一律不计数");
        }

        const todo = tasks.filter((t) => {
          if (DONE.has(t.accept_status)) return false;
          if (!t.accept_status || /not_accepted|available|unaccepted|pending/.test(t.accept_status)) return false;
          const cur = t.progress?.current ?? 0;
          const tgt = t.progress?.target ?? 0;
          return tgt > 0 && cur < tgt;
        });
        const manual = todo.filter((t) => MANUAL[t.task_code]);
        const auto = todo.filter((t) => !MANUAL[t.task_code]);
        autoTodo = auto.map((t) => t.task_code);

        if (auto.length) {
          const hint = CODE_HINTS.find(([re]) => auto.some((t) => re.test(t.task_code)));
          add("warn", "tasks-todo",
            `可自动完成 ${auto.length} 个: ${auto.map((t) => t.task_code).join(", ")}`,
            hint ? hint[1] : "用 wb-tasks.cjs 的对应子命令完成");
        }
        if (manual.length) {
          add("warn", "tasks-manual",
            `需真人处理 ${manual.length} 个: ${manual.map((t) => `${t.task_code}(${MANUAL[t.task_code]})`).join("; ")}`,
            "本工具不代做扫码/授权类动作，留着或自己点");
        }

        const claimable = tasks.filter(
          (t) => DONE.has(t.accept_status) && t.claim_status && !/claimed|none/.test(t.claim_status)
        );
        if (claimable.length) {
          add("warn", "tasks-claim", `${claimable.length} 个任务有未领取奖励`, "node scripts/wb-growth.cjs claim-all");
        }
      },
      { verbose: false }
    );
  } catch (e) {
    add("fail", "wbipc-handshake", `握手失败: ${String(e.message).slice(0, 160)}`,
      "WorkBuddy 桌面端是否正在运行？换号后需重新登录并重启客户端");
  }
}

// ---------- 3. CDP ----------
async function checkCdp() {
  let cdp;
  try {
    cdp = require("./lib/cdp.cjs");
  } catch {
    add("warn", "cdp-lib", "cdp 库缺失", "确认 scripts/lib/cdp.cjs 存在");
    return;
  }
  const port = cdp.DEFAULT_PORT;

  let targets;
  try {
    targets = await cdp.listTargets(port);
  } catch {
    add("fail", "cdp", `端口 ${port} 不可达`,
      `以调试端口重启客户端：WorkBuddy.exe --remote-debugging-port=${port}（不开则体验类任务全做不了）`);
    return;
  }
  add("ok", "cdp", `端口 ${port} 可连，${targets.length} 个 target`, null);

  let s = null;
  try {
    s = await cdp.mainWindow(port);
    add("ok", "cdp-main", "主窗口已识别", null);
  } catch (e) {
    add("warn", "cdp-main", `主窗口未识别: ${String(e.message).slice(0, 120)}`,
      "确认主窗口已打开且不是设置窗口；必要时点一下主窗口再跑");
    return;
  }

  // 行业模板锁检测
  // 注意：Hy4 把 .industry-template-switcher__trigger 复用成了「发现应用」按钮，
  // 按钮文案不再表示行业，唯一可靠信号是修饰类：
  //   --general  = 通用模板，专家市场为全量
  //   --<其他>   = 绑定了垂直行业，通用专家搜不到
  try {
    const info = await s.eval(`(() => {
      const b = document.querySelector('[class*="industry-template-switcher__trigger--"]');
      if (!b) return { present: false };
      const cls = b.className.toString();
      const m = cls.match(/industry-template-switcher__trigger--([\\w-]+)/);
      return { present: true, modifier: m ? m[1] : "unknown" };
    })()`);
    if (!info.present) {
      add("ok", "industry", "未检测到行业模板标记（通用环境）", null);
    } else if (info.modifier === "general" || info.modifier === "unknown") {
      add("ok", "industry", `行业模板: ${info.modifier === "general" ? "通用（未锁定）" : "未识别修饰符"}`, null);
    } else {
      add("warn", "industry", `专家市场被行业模板锁定: ${info.modifier}`,
        "点开左上角模板切换器切换为通用模板，否则专家市场只返回该行业专家，搜「电商」「抖音」会 0 结果");
    }
  } catch (e) {
    add("warn", "industry", `行业模板检测失败: ${String(e.message).slice(0, 100)}`, null);
  } finally {
    if (s) s.close();
  }
}

// ---------- 输出 ----------
const hasWarn = (key) => R.some((r) => r.key === key && r.level === "warn");

function nextCommand() {
  // 硬阻塞优先：环境不成立，给命令也没用
  if (R.some((r) => r.level === "fail" && r.key === "node")) return null;
  if (R.some((r) => r.level === "fail" && r.key.startsWith("wbipc"))) return null;
  if (R.some((r) => r.level === "fail" && r.key === "cdp")) return null;
  // 任务未接取 —— 永远排第一步
  if (hasWarn("tasks-accept")) return "node scripts/wb-growth.cjs accept-all";
  if (hasWarn("industry")) return null; // 需人工点重置图标
  if (hasWarn("tasks-todo")) {
    for (const [re, cmd] of CODE_HINTS) {
      if (autoTodo.some((c) => re.test(c))) return cmd;
    }
    return 'node scripts/wb-tasks.cjs experts "<专家名>"';
  }
  if (hasWarn("tasks-claim")) return "node scripts/wb-growth.cjs claim-all";
  return "node scripts/wb-harvest.cjs";
}

(async () => {
  await checkApi();
  await checkCdp();

  const nx = nextCommand();
  const summary = {
    ok: R.filter((r) => r.level === "ok").length,
    warn: R.filter((r) => r.level === "warn").length,
    fail: R.filter((r) => r.level === "fail").length,
    next: nx,
    checks: R,
  };

  if (AS_JSON) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.fail ? 1 : 0);
  }

  console.log("");
  console.log("WorkBuddy 成长计划 · 环境自检");
  console.log("=".repeat(52));
  for (const r of R) {
    console.log(`${icon(r.level)} ${r.msg}`);
    if (r.next) console.log(`       -> ${r.next}`);
  }
  console.log("=".repeat(52));
  console.log(`结果: OK ${summary.ok} · WARN ${summary.warn} · FAIL ${summary.fail}`);
  if (nx) {
    console.log("");
    console.log("下一步跑这条:");
    console.log(`  ${nx}`);
  } else {
    console.log("");
    console.log("先处理上面的 FAIL / WARN，再跑本命令复查。");
  }
  console.log("");
  process.exit(summary.fail ? 1 : 0);
})();
