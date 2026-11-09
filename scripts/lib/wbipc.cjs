// lib/wbipc.cjs — WorkBuddy wbipc 本地 RPC 桥客户端
//
// 原理：WorkBuddy 桌面端启动后在 ~/.workbuddy/wbipc/endpoint.json 写入
// 命名管道端点与一次性 ticket。本模块完成 HMAC-SHA256 双向校验握手，
// 经 wb.request pipe 以「客户端自身登录态」转发 HTTP 请求。
// 全程不接触、不落盘任何明文凭据，等价于在界面上替你操作。
//
// 零第三方依赖，Node >= 18。
"use strict";

const net = require("net");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PROTOCOL = 1;

function log(...a) {
  const ts = new Date().toTimeString().slice(0, 8);
  console.log(`[${ts}]`, ...a);
}

// ---------- 端点发现 ----------

function discoveryPath() {
  const cfg = (process.env.WORKBUDDY_CONFIG_DIR || "").trim() || path.join(os.homedir(), ".workbuddy");
  return path.join(cfg, "wbipc", "endpoint.json");
}

function loadEndpoint() {
  const p = discoveryPath();
  if (!fs.existsSync(p)) {
    throw new Error(`wbipc 端点文件不存在: ${p} —— WorkBuddy 桌面端是否已启动？`);
  }
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!j.endpoint || !j.ticket) throw new Error("endpoint.json 缺少 endpoint/ticket 字段");
  return { endpoint: j.endpoint, ticket: j.ticket, file: p };
}

// ---------- 握手工具 ----------

function b64url(buf) {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function encodeTranscript(role, { protocol, endpoint, clientNonce, serverNonce }) {
  const parts = [
    role === "server" ? "wbipc-s" : "wbipc-c",
    String(protocol),
    endpoint,
    clientNonce,
    serverNonce,
  ];
  const chunks = [];
  for (const p of parts) {
    const b = Buffer.from(p, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(b.length, 0);
    chunks.push(len, b);
  }
  return Buffer.concat(chunks);
}

function computeProof(ticket, role, transcript) {
  return crypto
    .createHmac("sha256", Buffer.from(ticket, "utf8"))
    .update(encodeTranscript(role, transcript))
    .digest("base64url");
}

function safeEqual(a, b) {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// ---------- 帧读写（JSON Lines，单帧上限 8MB） ----------

function createFrameReader(onFrame, onViolation) {
  let buf = Buffer.alloc(0);
  const MAX = 8 * 1024 * 1024;
  let dead = false;
  return {
    push(chunk) {
      if (dead) return;
      buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
      for (;;) {
        const i = buf.indexOf(10);
        if (i < 0) {
          if (buf.length > MAX) { dead = true; onViolation("frame too large"); }
          return;
        }
        if (i > MAX) { dead = true; onViolation("frame too large"); return; }
        const line = buf.subarray(0, i);
        buf = buf.subarray(i + 1);
        if (line.length === 0) continue;
        let obj;
        try { obj = JSON.parse(line.toString("utf8")); }
        catch { dead = true; onViolation("malformed json frame"); return; }
        onFrame(obj);
        if (dead) return;
      }
    },
  };
}

function sendFrame(sock, obj) {
  sock.write(Buffer.from(JSON.stringify(obj) + "\n", "utf8"));
}

// ---------- wbipc 客户端 ----------

class WbipcClient {
  constructor(endpoint, ticket, clientInfo) {
    this.endpoint = endpoint;
    this.ticket = ticket;
    this.clientInfo = clientInfo || { kind: "script", id: "wb-growth-auto", version: "1.1.0" };
    this.sock = null;
    this.pending = new Map();
    this.nextId = 1;
    this.ready = false;
    this.pipes = [];
  }

  connect(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const sock = net.connect(this.endpoint);
      this.sock = sock;
      const timer = setTimeout(() => {
        reject(new Error("wbipc 连接/握手超时"));
        try { sock.destroy(); } catch {}
      }, timeoutMs);

      const fail = (msg) => {
        clearTimeout(timer);
        try { sock.destroy(); } catch {}
        reject(new Error(msg));
      };

      const reader = createFrameReader(
        (frame) => this.onFrame(frame, resolve, fail, timer),
        (v) => fail(`协议错误: ${v}`)
      );
      sock.on("data", (d) => reader.push(d));
      sock.on("error", (e) => fail(`wbipc 连接错误: ${e.message}`));
      sock.on("close", () => { this.ready = false; });

      this.clientNonce = b64url(crypto.randomBytes(16));
      const ticketId = crypto.createHash("sha256").update(this.ticket, "utf8").digest("hex").slice(0, 16);
      sendFrame(sock, {
        type: "session_hello",
        protocol_min: PROTOCOL,
        protocol_max: PROTOCOL,
        client_nonce: this.clientNonce,
        ticket_id: ticketId,
        client: this.clientInfo,
      });
    });
  }

  onFrame(frame, resolveHandshake, fail, timer) {
    if (this.ready) return this.onRpcFrame(frame);
    switch (frame.type) {
      case "session_challenge": {
        this.serverNonce = String(frame.server_nonce || "");
        const transcript = {
          protocol: Number(frame.protocol) || PROTOCOL,
          endpoint: this.endpoint,
          clientNonce: this.clientNonce,
          serverNonce: this.serverNonce,
        };
        const expectServerProof = computeProof(this.ticket, "server", transcript);
        if (!safeEqual(String(frame.server_proof || ""), expectServerProof)) {
          return fail("server_proof 校验失败，端点不可信");
        }
        const clientProof = computeProof(this.ticket, "client", transcript);
        sendFrame(this.sock, { type: "session_prove", client_proof: clientProof });
        return;
      }
      case "session_hello_ack": {
        this.ready = true;
        this.pipes = Array.isArray(frame.pipes) ? frame.pipes : [];
        clearTimeout(timer);
        resolveHandshake();
        return;
      }
      case "session_hello_error":
        return fail(`握手被拒: ${frame.code}`);
      default:
        return fail(`握手阶段收到意外帧: ${JSON.stringify(frame).slice(0, 200)}`);
    }
  }

  onRpcFrame(frame) {
    const entry = this.pending.get(frame.id);
    if (!entry) return;
    this.pending.delete(frame.id);
    clearTimeout(entry.timer);
    if (frame.error) entry.reject(new Error(`${frame.error.code}: ${frame.error.message}`));
    else entry.resolve(frame.result);
  }

  rpc(method, params, mode, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC 超时: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const frame = { jsonrpc: "2.0", id, method, params: params ?? {} };
      if (mode) frame.mode = mode;
      sendFrame(this.sock, frame);
    });
  }

  close() {
    try { this.sock?.destroy(); } catch {}
    this.ready = false;
  }
}

// ---------- wb.request / http.fetch ----------

async function openRequestChannel(client, { verbose = true } = {}) {
  const res = await client.rpc("broker/GetPipe", { pipe: "wb.request" });
  if (!res?.channel) throw new Error(`GetPipe 失败: ${JSON.stringify(res).slice(0, 200)}`);
  if (verbose) log(`已连接 wbipc，可见 pipe: ${client.pipes.join(", ")}`);
  return res.channel; // 形如 "c:wb.request"
}

// 以客户端登录态转发一个 HTTP 请求。
// 返回 { status, headers, body, raw, ok, data }；body 为解析后的统一信封，
// data 为剥壳后的业务数据（信封 {code,msg,requestId,data} -> data）。
async function wbFetch(client, channel, method, apiPath, { query, headers, body, dump = false } = {}) {
  const params = { method, path: apiPath };
  if (query) params.query = Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)]));
  if (headers) {
    const clean = {};
    for (const [k, v] of Object.entries(headers)) {
      const lk = k.toLowerCase();
      if (lk === "content-type" || lk === "accept") clean[lk] = v;
    }
    if (Object.keys(clean).length) params.headers = clean;
  }
  if (body !== undefined) {
    const m = method.toUpperCase();
    if (m === "GET" || m === "HEAD") throw new Error("GET 不允许携带 body");
    params.body_b64 = Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8").toString("base64");
  }
  const res = await client.rpc(`${channel}/http.fetch`, params, "call");
  const out = { status: res.status, headers: res.headers || {}, body: null, raw: "" };
  if (res.body_b64) {
    out.raw = Buffer.from(res.body_b64, "base64").toString("utf8");
    try { out.body = JSON.parse(out.raw); } catch { /* 保留 raw */ }
  }
  out.ok = out.status === 200 && (out.body?.code === 0 || out.body?.code === undefined);
  out.data = out.body && typeof out.body === "object" && "data" in out.body ? out.body.data : out.body;
  if (dump) log(`[dump] ${method} ${apiPath} -> ${out.status} ${out.raw.slice(0, 600)}`);
  return out;
}

// 便捷封装：一次连接执行 fn(client, channel)，结束自动关闭。
async function withClient(fn, { verbose = true } = {}) {
  const ep = loadEndpoint();
  const client = new WbipcClient(ep.endpoint, ep.ticket);
  try {
    await client.connect();
    const channel = await openRequestChannel(client, { verbose });
    return await fn(client, channel);
  } finally {
    client.close();
  }
}

module.exports = {
  PROTOCOL,
  log,
  discoveryPath,
  loadEndpoint,
  WbipcClient,
  openRequestChannel,
  wbFetch,
  withClient,
};
