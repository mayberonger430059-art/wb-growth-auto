#!/usr/bin/env node
// wb-call.cjs — 通用 WorkBuddy API 调用器（借客户端登录态，经 wbipc 转发）
//
// 用法:
//   node wb-call.cjs <METHOD> <PATH> [JSON_BODY]
//   node wb-call.cjs GET /v2/activity/growth/tasks
//   node wb-call.cjs POST /v2/activity/growth/tasks/accept '{"task_codes":["..."]}'
//
// Git Bash 注意：路径参数会被 MSYS 转换，需 MSYS_NO_PATHCONV=1。
// 退出码：0=成功，2=HTTP/业务错误，1=连接/参数错误。
"use strict";

const { withClient, wbFetch } = require("./lib/wbipc.cjs");

(async () => {
  const method = (process.argv[2] || "GET").toUpperCase();
  const apiPath = process.argv[3];
  if (!apiPath) {
    console.error("usage: node wb-call.cjs <METHOD> <PATH> [JSON_BODY]");
    process.exit(1);
  }
  let body;
  if (process.argv[4]) body = JSON.parse(process.argv[4]);
  const r = await withClient(async (client, ch) => wbFetch(client, ch, method, apiPath, { body }));
  console.log(JSON.stringify({ status: r.status, ok: r.ok, body: r.body ?? r.raw }, null, 2));
  process.exit(r.ok ? 0 : 2);
})().catch((e) => {
  console.error(`[FATAL] ${e.message}`);
  process.exit(1);
});
