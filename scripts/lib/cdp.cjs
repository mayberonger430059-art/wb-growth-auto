// lib/cdp.cjs — Chrome DevTools Protocol 会话封装（驱动 WorkBuddy 客户端 UI）
//
// 前置：WorkBuddy 桌面端以 --remote-debugging-port=9222 启动。
// 零第三方依赖，Node >= 18（用内置 WebSocket）。
"use strict";

const http = require("http");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJson(url) {
  return new Promise((res, rej) => {
    http
      .get(url, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => {
          try { res(JSON.parse(d)); } catch (e) { rej(e); }
        });
      })
      .on("error", rej);
  });
}

const DEFAULT_PORT = Number(process.env.WB_CDP_PORT || 9222);
const listTargets = (port = DEFAULT_PORT) => httpJson(`http://127.0.0.1:${port}/json/list`);

class Session {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
  }
  async open() {
    this.ws = new WebSocket(this.wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) p.rej(new Error(JSON.stringify(m.error)));
        else p.res(m.result);
      }
    });
    await new Promise((res, rej) => {
      this.ws.addEventListener("open", res);
      this.ws.addEventListener("error", rej);
    });
    return this;
  }
  send(method, params) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails).slice(0, 300));
    }
    return r.result?.value;
  }
  // 真实鼠标点击（trusted），规避 el.click() 不被客户端路由认可的问题
  async clickAt(x, y) {
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await this.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    }
  }
  async pressEscape() {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  }
  async insertText(text) {
    await this.send("Input.insertText", { text });
  }
  async screenshot() {
    await this.send("Page.enable", {});
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(r.data, "base64");
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

// 找到 WorkBuddy 主窗口（排除设置窗），返回已连接的 Session
async function mainWindow(port = DEFAULT_PORT) {
  for (const t of await listTargets(port)) {
    if (t.type !== "page" || !t.url.includes("renderer/index.html")) continue;
    if (t.url.includes("windowKind=settings")) continue;
    const s = await new Session(t.webSocketDebuggerUrl).open();
    const ok = await s.eval(`document.body.innerText.includes('新建任务')`).catch(() => false);
    if (ok) return s;
    s.close();
  }
  throw new Error("未找到 WorkBuddy 主窗口：请用 --remote-debugging-port=9222 启动客户端");
}

module.exports = { sleep, httpJson, listTargets, Session, mainWindow, DEFAULT_PORT };
