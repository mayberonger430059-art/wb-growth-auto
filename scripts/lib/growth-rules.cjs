// lib/growth-rules.cjs — 成长计划判定规则（纯函数，无 IO，可单测）
//
// 这些规则都是从实际服务端响应里反推出来的，写死在 CLI 里会导致
// 同一个坑在两处各踩一次（accept-all 与 doctor 各判一次状态）。
// 统一收在这里，配 self-test.cjs 断言。
"use strict";

// 已完成（含已领奖）
const DONE_STATUSES = Object.freeze(["completed", "claimed"]);

// 未接取。服务端实际返回 not_accepted；available/unaccepted/pending 为历史或兜底值。
// 注意：这不是"没开放"，而是"等你点去完成"——不接取，后续动作一律不计数。
const PENDING_STATUSES = Object.freeze(["available", "not_accepted", "unaccepted", "pending", ""]);

const isDone = (s) => DONE_STATUSES.includes(s);

const isPendingTake = (s) => s == null || PENDING_STATUSES.includes(s);

/**
 * 把任务列表分成四类。
 * @param {Array<{task_code:string, accept_status?:string, progress?:{current:number,target:number}}>} tasks
 * @returns {{done:number, untaken:number, running:number, todo:Array, claimable:Array}}
 */
function classifyTasks(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];

  const doneList = list.filter((t) => isDone(t.accept_status));
  const untakenList = list.filter((t) => !isDone(t.accept_status) && isPendingTake(t.accept_status));
  const runningList = list.filter((t) => !isDone(t.accept_status) && !isPendingTake(t.accept_status));

  // 已接取但没做完的（要动手的那些）
  const todo = runningList.filter((t) => {
    const cur = t.progress?.current ?? 0;
    const tgt = t.progress?.target ?? 0;
    return tgt > 0 && cur < tgt;
  });

  // 已完成但奖励没领
  const claimable = doneList.filter(
    (t) => t.claim_status && !/^(claimed|none)$/.test(t.claim_status)
  );

  return {
    total: list.length,
    done: doneList.length,
    untaken: untakenList.length,
    running: runningList.length,
    todo,
    claimable,
    untakenCodes: untakenList.map((t) => t.task_code),
  };
}

// 需要真人操作的任务：扫码 / 账号授权 / 服务端 feature flag 未开。
// 跑脚本对它们没有任何用，列出来只会让人反复试。
const MANUAL_TASKS = Object.freeze({
  wb_wechat_oa_subscribe_task: "关注公众号（需微信扫码）",
  playbook_prompt: "探索优秀灵感（客户端内容位为空，受 feature flag 控制）",
  wb_connect_tencent_cloud: "腾讯云连接器授权（需账号登录）",
});

const manualReason = (code) => MANUAL_TASKS[code] || null;

// 任务码 → 该用哪条命令，顺序即优先级
const CODE_HINTS = Object.freeze([
  [/automation/i, 'node scripts/wb-tasks.cjs automation "<任务名>" "<提示词>"'],
  [/expert_team|team/i, 'node scripts/wb-tasks.cjs teams "<专家团名>"'],
  [/expert/i, 'node scripts/wb-tasks.cjs experts "<专家名>"'],
  [/template|playbook/i, "node scripts/wb-tasks.cjs templates"],
  [/app|discover/i, "node scripts/wb-tasks.cjs app"],
]);

/** 按任务码给建议命令；都不匹配返回 null */
function hintForTaskCode(code) {
  const hit = CODE_HINTS.find(([re]) => re.test(String(code || "")));
  return hit ? hit[1] : null;
}

/** 一批任务码里，优先级最高的那条建议命令 */
function hintForTaskCodes(codes) {
  for (const [re, cmd] of CODE_HINTS) {
    if ((codes || []).some((c) => re.test(String(c || "")))) return cmd;
  }
  return null;
}

// 行业模板修饰类。Hy4 把该组件复用成「发现应用」按钮，文案不再表示行业，
// 唯一可靠信号是 modifier：
//   general  → 通用，专家市场全量
//   其他     → 绑定了垂直行业，通用专家搜不到（且不报错，就是 0 结果）
const GENERIC_MODIFIER = "general";

/**
 * @param {string|null|undefined} modifier 形如 general / education / ecommerce
 * @returns {{locked:boolean, reason:string}}
 */
function judgeIndustryTemplate(modifier) {
  if (!modifier) return { locked: false, reason: "未检测到行业模板标记" };
  if (modifier === GENERIC_MODIFIER) return { locked: false, reason: "通用（未锁定）" };
  return { locked: true, reason: `已锁定为 ${modifier}` };
}

/** 从 trigger 的 className 里抽修饰名：...--general → general */
function parseModifier(className) {
  const m = /industry-template-switcher__trigger--([\w-]+)/.exec(String(className || ""));
  return m ? m[1] : null;
}

module.exports = {
  DONE_STATUSES,
  PENDING_STATUSES,
  MANUAL_TASKS,
  CODE_HINTS,
  isDone,
  isPendingTake,
  classifyTasks,
  manualReason,
  hintForTaskCode,
  hintForTaskCodes,
  judgeIndustryTemplate,
  parseModifier,
};
