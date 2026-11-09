#!/usr/bin/env node
// wb-tasks.cjs — WorkBuddy 成长计划 · UI 自动完成器（CDP 驱动客户端真实操作）
//
// 前置：WorkBuddy 桌面端以 --remote-debugging-port=9222 启动
// （设置环境变量 WB_CDP_PORT 可换端口；WB_SHOT_DIR 指定截图目录，默认 ./shots）。
//
// 用法：
//   node wb-tasks.cjs experts "专家名1" ["专家名2" ...]  # 召唤专家并发起对话
//   node wb-tasks.cjs teams "专家团名1" ...              # 召唤专家团
//   node wb-tasks.cjs templates                          # 五个分类模板各发一条
//   node wb-tasks.cjs app                                # 打开「发现应用」并启动第一个应用
//   node wb-tasks.cjs pending                            # 列出「待确认」会话
//   node wb-tasks.cjs tc "<会话名>"                       # 真实鼠标点击切换会话
//   node wb-tasks.cjs visit "<会话名>" [shot.png]        # 切会话+截图+抓按钮（防焦点弹回）
//   node wb-tasks.cjs shot <path>                        # 截图当前窗口
//   node wb-tasks.cjs eval "<js>"                        # 主窗口执行任意 JS
//   node wb-tasks.cjs targets                            # 列出 CDP 目标
//
// 关键原则：客户端会自动跟随「最新活跃会话」，视图频繁弹回。
// 所有「切会话→操作→验证」必须压进一次 CDP 连接内完成。
"use strict";

const fs = require("fs");
const path = require("path");
const { sleep, listTargets, mainWindow } = require("./lib/cdp.cjs");

const SHOT_DIR = process.env.WB_SHOT_DIR || path.join(__dirname, "..", "shots");
fs.mkdirSync(SHOT_DIR, { recursive: true });
const shotPath = (name) => path.join(SHOT_DIR, name);

// ---------- 页面操作脚本（单次 eval 内闭环） ----------

// 开专家中心 → 搜索 → 点卡片 → 召唤 → 发送预填话术
const SUMMON_JS = (name) => `(async()=>{
  const sp=ms=>new Promise(r=>setTimeout(r,ms));
  const step=[];
  let inp=document.querySelector('input[placeholder="搜索专家"]');
  if(!inp){ const b=[...document.querySelectorAll('button.conversation-list-tab-button')].find(x=>x.innerText.includes('专家')); if(b) b.click(); await sp(1500); inp=document.querySelector('input[placeholder="搜索专家"]'); }
  if(!inp) return {ok:false,err:'专家中心打不开'};
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  setter.call(inp, ${JSON.stringify(name)}); inp.dispatchEvent(new Event('input',{bubbles:true}));
  await sp(2800);
  const target=${JSON.stringify(name)};
  let cards=[...document.querySelectorAll('[class*="_centerCard_"]')].filter(e=>e.offsetHeight>0);
  let hit=cards.find(e=>e.innerText.trim().startsWith(target)) || cards.find(e=>e.innerText.includes(target));
  if(!hit) return {ok:false,err:'没搜到专家',cards:cards.map(c=>c.innerText.split('\\n')[0]).slice(0,6)};
  hit.click(); step.push('点卡片:'+hit.innerText.split('\\n')[0]);
  await sp(2500);
  let sb=document.querySelector('[class*="_headerSummonBtn_"]');
  if(!sb){ sb=[...document.querySelectorAll('button')].find(b=>b.offsetHeight>0 && /召唤|立即召唤/.test(b.textContent) && !b.disabled); }
  if(!sb) return {ok:false,err:'召唤按钮没出现',step};
  sb.click(); step.push('召唤');
  for(let i=0;i<30;i++){
    await sp(600);
    const e=document.querySelector('[contenteditable=true]'), b=document.querySelector('.cr-send-button');
    if(e&&e.innerText.trim().length>5&&b&&!b.disabled) break;
  }
  const send=document.querySelector('.cr-send-button');
  if(!send||send.disabled) return {ok:false,err:'输入框没就绪',step};
  send.click(); step.push('发送');
  return {ok:true,step,preview:(document.querySelector('[contenteditable=true]')?.innerText||'').slice(0,60)};
})()`;

// 同上，先切「专家团」页签（专家团对话启动慢，等待更久）
const TEAM_JS = (name) => `(async()=>{
  const sp=ms=>new Promise(r=>setTimeout(r,ms)); const step=[];
  let inp=document.querySelector('input[placeholder="搜索专家"]');
  if(!inp){ const b=[...document.querySelectorAll('button.conversation-list-tab-button')].find(x=>x.innerText.includes('专家')); if(b) b.click(); await sp(1500); inp=document.querySelector('input[placeholder="搜索专家"]'); }
  if(!inp) return {ok:false,err:'专家中心打不开'};
  const teamTab=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent.trim()==='专家团'&&e.offsetHeight>0);
  if(teamTab.length){ (teamTab[0].closest('button,[role=button],div[class*=tab]')||teamTab[0]).click(); await sp(1200); step.push('切专家团'); }
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  setter.call(inp, ${JSON.stringify(name)}); inp.dispatchEvent(new Event('input',{bubbles:true}));
  await sp(2800);
  const target=${JSON.stringify(name)};
  let cards=[...document.querySelectorAll('[class*="_centerCard_"]')].filter(e=>e.offsetHeight>0);
  let hit=cards.find(e=>e.innerText.trim().startsWith(target)) || cards[0];
  if(!hit) return {ok:false,err:'没搜到专家团',cards:cards.map(c=>c.innerText.split('\\n')[0]).slice(0,6)};
  hit.click(); step.push('点团:'+hit.innerText.split('\\n')[0]);
  await sp(2500);
  let sb=document.querySelector('[class*="_headerSummonBtn_"]') || [...document.querySelectorAll('button')].find(b=>b.offsetHeight>0&&/召唤/.test(b.textContent)&&!b.disabled);
  if(!sb) return {ok:false,err:'召唤按钮没出现',step};
  sb.click(); step.push('召唤');
  for(let i=0;i<60;i++){ await sp(1000); const e=document.querySelector('[contenteditable=true]'), b=document.querySelector('.cr-send-button'); if(e&&e.innerText.trim().length>5&&b&&!b.disabled) break; }
  const send=document.querySelector('.cr-send-button');
  if(!send||send.disabled) return {ok:false,err:'输入框没就绪',step};
  send.click(); step.push('发送');
  return {ok:true,step};
})()`;

// 模板 5 连：每个快捷分类发一条预填提示词
const TEMPLATES_JS = `(async()=>{
  const sp=ms=>new Promise(r=>setTimeout(r,ms));
  const cats=['金融服务','分析数据','制作PPT','深度研究','策划方案'];
  const results=[];
  for(const cat of cats){
    const home=[...document.querySelectorAll('button')].find(x=>x.offsetHeight>0&&x.innerText.trim()==='新建任务');
    if(home){home.click(); await sp(1800);}
    const it=[...document.querySelectorAll('.quick-actions__item')].find(e=>e.innerText.trim()===cat);
    if(!it){results.push(cat+':no-chip'); continue;}
    it.click(); await sp(1800);
    const card=[...document.querySelectorAll('.wb-home-prompt-list__row')].find(e=>e.offsetHeight>0);
    if(!card){results.push(cat+':no-card'); continue;}
    const txt=card.innerText.trim().slice(0,25);
    card.click(); await sp(1200);
    const send=document.querySelector('.cr-send-button');
    if(send&&!send.disabled){send.click(); results.push(cat+' OK:'+txt);}
    else results.push(cat+':send-disabled');
    await sp(1500);
  }
  return results;
})()`;

// 「待确认」徽标列表
const PENDING_JS = `(()=>{
  const badges=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent.trim()==='待确认'&&e.offsetHeight>0);
  return badges.map(b=>b.closest('.conversation-item,.cb-agent-card')?.innerText.split(String.fromCharCode(10))[0]);
})()`;

async function waitIdle(s, maxMs = 300000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(5000);
    const st = await s.eval(`(()=>{const b=document.querySelector('.cr-send-button'); return b?(b.disabled?'busy':'idle'):'none'})()`).catch(() => "err");
    if (st === "idle" || st === "none") return true;
  }
  return false;
}

async function backHome(s) {
  await s.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.offsetHeight>0&&x.innerText.trim()==='新建任务'); if(b){b.click(); return 'ok'} return 'nf'})()`).catch(() => {});
  await sleep(1500);
}

async function runSummons(s, names, jsFn) {
  for (const name of names) {
    console.log(`\n== ${name}`);
    const r = await s.eval(jsFn(name)).catch((e) => ({ ok: false, err: e.message }));
    console.log("  ", JSON.stringify(r));
    if (r.ok) { const done = await waitIdle(s); console.log("   对话完成:", done); await backHome(s); }
    await sleep(3000);
  }
}

// ---------- 主流程 ----------
(async () => {
  let [cmd0, ...rest0] = process.argv.slice(2);
  if (cmd0 === "--help" || cmd0 === "-h") cmd0 = "help";
  if (!cmd0 || cmd0 === "help") {
    console.log(`用法: node wb-tasks.cjs <命令> [参数]

前置：WorkBuddy 桌面端以 --remote-debugging-port=9222 启动（WB_CDP_PORT 可换端口）。

命令:
  experts "专家名1" [...]   召唤专家并发起对话
  teams "专家团名1" [...]   召唤专家团
  templates                 五个分类模板各发一条
  app                       打开「发现应用」并启动第一个应用
  pending                   列出「待确认」会话
  tc "<会话名>"             真实鼠标点击切换会话
  visit "<会话名>" [图]     切会话+截图+抓按钮（防焦点弹回）
  shot <路径>               截图当前窗口
  eval "<js>"               主窗口执行任意 JS
  targets                   列出 CDP 目标`);
    process.exit(0);
  }
  const cmd = cmd0, args = rest0;
  if (cmd === "targets") { console.log(JSON.stringify(await listTargets(), null, 2)); return; }

  const s = await mainWindow();

  if (cmd === "eval") {
    console.log(JSON.stringify(await s.eval(args[0]), null, 2));
  } else if (cmd === "pending") {
    console.log(JSON.stringify(await s.eval(PENDING_JS), null, 2));
  } else if (cmd === "shot") {
    const p = args[0] || shotPath("wb-shot.png");
    fs.writeFileSync(p, await s.screenshot());
    console.log("saved", p);
  } else if (cmd === "tc") {
    // trusted click：scrollIntoView → 重取坐标 → 真实鼠标点击 → 同进程验证
    const text = args[0];
    const rect = await s.eval(`(()=>{
      const els=[...document.querySelectorAll('.conversation-item')].filter(e=>e.innerText.split(String.fromCharCode(10))[0].includes(${JSON.stringify(text)})&&e.offsetHeight>0);
      const e=els[0]; if(!e) return null;
      e.scrollIntoView({block:'center'});
      const r=e.getBoundingClientRect();
      return {x:r.left+r.width/2, y:Math.min(r.top+r.height/2, window.innerHeight-80)};
    })()`);
    if (!rect) { console.log("not found"); }
    else {
      await sleep(400);
      await s.clickAt(rect.x, rect.y);
      await sleep(3000);
      const check = await s.eval(`(()=>{
        const pend=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent.trim()==='待确认'&&e.offsetHeight>0).length;
        return {pending:pend, body:document.body.innerText.slice(0,120)};
      })()`);
      console.log("clicked", JSON.stringify(rect), "after:", JSON.stringify(check));
    }
  } else if (cmd === "visit") {
    // 单连接内：切换会话 → 截图 → 抓按钮/文本，避免焦点弹回
    const title = args[0];
    const out = args[1] || shotPath("visit.png");
    const r = await s.eval(`(async()=>{const sp=ms=>new Promise(r=>setTimeout(r,ms));
      const el=[...document.querySelectorAll('.conversation-item')].find(e=>e.innerText.split(String.fromCharCode(10))[0].includes(${JSON.stringify(title)}));
      if(!el) return 'nf'; el.click(); await sp(3000); return 'ok';})()`);
    console.log("switch:", r);
    fs.writeFileSync(out, await s.screenshot());
    console.log("saved", out);
    const info = await s.eval(`(()=>{
      const btns=[...document.querySelectorAll('button')].filter(b=>b.offsetHeight>0&&b.innerText.trim()&&b.innerText.trim().length<20).map(b=>b.innerText.trim());
      const h=document.querySelector('h1,h2,[class*=conversation-title],[class*=header-title]');
      return {title:h?h.innerText.slice(0,50):'', btns:[...new Set(btns)].slice(0,25), tail:document.body.innerText.slice(-500)};
    })()`);
    console.log(JSON.stringify(info, null, 2));
  } else if (cmd === "experts") {
    if (!args.length) { console.error("缺少专家名"); process.exit(1); }
    await runSummons(s, args, SUMMON_JS);
  } else if (cmd === "teams") {
    if (!args.length) { console.error("缺少专家团名"); process.exit(1); }
    await runSummons(s, args, TEAM_JS);
  } else if (cmd === "templates") {
    console.log(JSON.stringify(await s.eval(TEMPLATES_JS), null, 2));
  } else if (cmd === "app") {
    // 「发现应用」：真实点击触发器，再启动第一个推荐应用
    const rect = await s.eval(`(()=>{
      const el=document.querySelector('.industry-template-switcher__trigger-label');
      if(!el) return null; const b=el.closest('button')||el; const r=b.getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height/2};
    })()`);
    if (!rect) { console.log("未发现「发现应用」入口（可能不在首页）"); process.exit(1); }
    await s.clickAt(rect.x, rect.y);
    await sleep(2500);
    const r2 = await s.eval(`(()=>{
      const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.offsetHeight>0&&e.closest('[class*=popover],[class*=panel],[class*=dropdown]'));
      return els.slice(0,10).map(e=>e.textContent.trim());
    })()`);
    console.log("面板内容:", JSON.stringify(r2));
  } else {
    console.error("unknown cmd:", cmd);
    process.exit(1);
  }
  s.close();
  process.exit(0);
})().catch((e) => {
  console.error("[FATAL]", e.stack || e.message);
  process.exit(1);
});
