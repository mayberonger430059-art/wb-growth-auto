#!/usr/bin/env node
// self-test.cjs — 规则层断言（不需要客户端，CI 里跑）
//
// 覆盖三处曾经踩死的判定：接取状态集合、任务码→命令映射、行业模板锁定。
// 用法: node scripts/self-test.cjs
"use strict";

const assert = require("assert");
const R = require("./lib/growth-rules.cjs");

let pass = 0;
const fails = [];

function t(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fails.push(`${name}: ${e.message}`);
  }
}

// ---------- 接取状态 ----------

t("not_accepted 属于未接取（这是新号的真实值）", () => {
  assert.strictEqual(R.isPendingTake("not_accepted"), true);
});

t("available / pending / unaccepted / 空 都算未接取", () => {
  for (const s of ["available", "pending", "unaccepted", "", null, undefined]) {
    assert.strictEqual(R.isPendingTake(s), true, `应判未接取: ${s}`);
  }
});

t("completed / claimed / accepted 不算未接取", () => {
  for (const s of ["completed", "claimed", "accepted", "in_progress"]) {
    assert.strictEqual(R.isPendingTake(s), false, `不应判未接取: ${s}`);
  }
});

t("已完成状态识别", () => {
  assert.strictEqual(R.isDone("completed"), true);
  assert.strictEqual(R.isDone("claimed"), true);
  assert.strictEqual(R.isDone("not_accepted"), false);
});

// ---------- 分类 ----------

const SAMPLE = [
  { task_code: "checkin", accept_status: "claimed" },
  { task_code: "expert_use_1", accept_status: "accepted", progress: { current: 0, target: 1 } },
  { task_code: "automation_1", accept_status: "accepted", progress: { current: 1, target: 1 } },
  { task_code: "template_1", accept_status: "not_accepted", progress: { current: 0, target: 1 } },
  { task_code: "playbook_prompt", accept_status: "accepted", progress: { current: 0, target: 1 } },
];

t("分类计数正确（新号场景：有 not_accepted）", () => {
  const c = R.classifyTasks(SAMPLE);
  assert.strictEqual(c.total, 5);
  assert.strictEqual(c.done, 1, "claimed 应计 1 个已完成");
  assert.strictEqual(c.untaken, 1, "not_accepted 应计 1 个未接取");
  assert.strictEqual(c.running, 3, "其余 3 个为进行中");
});

t("todo 只含「已接取且没做完」的，不含未接取、不含已达标", () => {
  const c = R.classifyTasks(SAMPLE);
  const codes = c.todo.map((x) => x.task_code);
  assert.ok(codes.includes("expert_use_1"), "已接未完成应在待办");
  assert.ok(codes.includes("playbook_prompt"), "已接未完成应在待办");
  assert.ok(!codes.includes("automation_1"), "已达标不该在待办");
  assert.ok(!codes.includes("template_1"), "未接取不该在待办");
});

t("空 / 非法输入不炸", () => {
  for (const v of [null, undefined, [], "x", 0]) {
    const c = R.classifyTasks(v);
    assert.strictEqual(c.total, 0);
    assert.deepStrictEqual(c.todo, []);
  }
});

t("progress 缺失时不判为待办（target=0 视为不适用）", () => {
  const c = R.classifyTasks([{ task_code: "x", accept_status: "accepted" }]);
  assert.strictEqual(c.todo.length, 0);
});

// ---------- 奖励领取 ----------

t("completed 且未领奖 → 可领取；claimed/none → 不可领", () => {
  const c = R.classifyTasks([
    { task_code: "a", accept_status: "completed", claim_status: "unclaimed" },
    { task_code: "b", accept_status: "completed", claim_status: "claimed" },
    { task_code: "c", accept_status: "completed", claim_status: "none" },
  ]);
  assert.strictEqual(c.claimable.length, 1);
  assert.strictEqual(c.claimable[0].task_code, "a");
});

// ---------- 任务码 → 命令 ----------

t("automation 任务码给出 automation 命令", () => {
  assert.ok(/automation "<任务名>"/.test(R.hintForTaskCode("automation_1")));
});

t("专家团优先于专家（expert_team 不能被 expert 抢走）", () => {
  assert.ok(/teams "/.test(R.hintForTaskCode("expert_team_use_1")));
  assert.ok(/experts "/.test(R.hintForTaskCode("expert_use_1")));
});

t("批量任务码取最高优先级（automation 先于 expert）", () => {
  const cmd = R.hintForTaskCodes(["expert_use_1", "automation_1"]);
  assert.ok(/automation/.test(cmd), `应优先 automation，实际: ${cmd}`);
});

t("未知任务码返回 null，不瞎猜", () => {
  assert.strictEqual(R.hintForTaskCode("weird_thing"), null);
  assert.strictEqual(R.hintForTaskCodes([]), null);
});

// ---------- 需真人任务 ----------

t("扫码/授权类被标为需真人", () => {
  assert.ok(R.manualReason("wb_wechat_oa_subscribe_task"));
  assert.ok(R.manualReason("playbook_prompt"));
  assert.strictEqual(R.manualReason("automation_1"), null);
});

// ---------- 行业模板 ----------

t("--general 判定为未锁定", () => {
  const j = R.judgeIndustryTemplate("general");
  assert.strictEqual(j.locked, false);
});

t("垂直行业判定为锁定", () => {
  for (const m of ["education", "ecommerce", "finance"]) {
    assert.strictEqual(R.judgeIndustryTemplate(m).locked, true, `${m} 应判锁定`);
  }
});

t("缺失修饰符不误报为锁定", () => {
  assert.strictEqual(R.judgeIndustryTemplate(null).locked, false);
  assert.strictEqual(R.judgeIndustryTemplate(undefined).locked, false);
});

t("从 className 抽修饰符（含 Hy4 的复合类名）", () => {
  const cls = "wb-button wb-button--secondary industry-template-switcher__trigger industry-template-switcher__trigger--general";
  assert.strictEqual(R.parseModifier(cls), "general");
  assert.strictEqual(R.parseModifier("industry-template-switcher__trigger--education"), "education");
  assert.strictEqual(R.parseModifier("wb-button"), null);
  assert.strictEqual(R.parseModifier(null), null);
});

t("按钮文案是「发现应用」也必须判为未锁定（文案不可信）", () => {
  // 这正是旧实现误报的场景：文案不再是行业名，只能看修饰类
  const cls = "wb-button wb-button--small industry-template-switcher__trigger--general";
  assert.strictEqual(R.judgeIndustryTemplate(R.parseModifier(cls)).locked, false);
});

// ---------- 结果 ----------

console.log(`self-test: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.error("  FAIL", f);
  process.exit(1);
}
process.exit(0);
