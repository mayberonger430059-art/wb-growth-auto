# 实测踩坑记录（CDP 驱动 WorkBuddy 客户端）

这些坑都是 2026-11-09 实跑踩出来的，改 UI 自动化前先读一遍。

## 1. 视图焦点抢占（最大的坑）

客户端会自动跟随「最新活跃会话」：任何一个会话产生新消息，主视图立刻弹回该会话。
因此**「切会话 → 操作 → 验证」必须压进一次 CDP 连接（一个 Node 进程）内完成**；
拆成多次 `node wb-tasks.cjs eval` 调用，中间就会被抢焦点，操作落空。

## 2. el.click() 经常无效

`element.click()` 产生的是 untrusted 事件，客户端的会话路由不认。
必须用 `Input.dispatchMouseEvent`（mouseMoved → mousePressed → mouseReleased）发真实鼠标事件。
对应封装：`lib/cdp.cjs` 的 `Session.clickAt(x, y)`，命令入口 `wb-tasks.cjs tc "<会话名>"`。

## 3. 点坐标前先 scrollIntoView，且同 eval 内取坐标

侧栏列表会滚动/重排。正确顺序：`scrollIntoView({block:'center'})` → 同一次 eval 里
`getBoundingClientRect()` → 同一连接里 dispatch 鼠标事件 → 立即验证
（检查目标会话特征文本 / 「待确认」徽标数变化）。

## 4. React 表单填不进去

- `<input>`：直接赋 `.value` 无效，必须用
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input, v)`
  再 `dispatchEvent(new Event('input',{bubbles:true}))`。
- `contenteditable`：先 `focus()`，再用 CDP `Input.insertText`（`Session.insertText`）。

### 4b. Slate.js 编辑器：最阴的一种（静默失败）

定时任务和对话的输入区是 **Slate 富文本**，DOM 节点带 `data-slate-node` / `data-slate-leaf`。
Slate 有自己的 model，DOM 只是它的投影：

| 做法 | 结果 |
|---|---|
| `el.innerText = "..."` | ❌ DOM 有字，model 空 |
| `document.execCommand('insertText', false, t)` | ❌ 同上，看着成了其实没成 |
| React value setter + input 事件 | ❌ 不适用（不是 input） |
| **真实点击聚焦 → Ctrl+A → Delete → `Input.insertText`** | ✅ 进 model |

**不会报错**，表现就是「字段看着填好了，但确定/发送按钮永远是灰的」。
判据只能看按钮 `disabled` 有没有变 false。

```js
await s.clickAt(box.x, box.y);                                  // 真实点击聚焦
await key({type:'keyDown', modifiers:2, key:'a', code:'KeyA', windowsVirtualKeyCode:65}); // Ctrl+A
await key({type:'keyUp',   modifiers:2, key:'a', code:'KeyA', windowsVirtualKeyCode:65});
await key({type:'keyDown', key:'Delete', code:'Delete', windowsVirtualKeyCode:46});
await key({type:'keyUp',   key:'Delete', code:'Delete', windowsVirtualKeyCode:46});
await s.send("Input.insertText", { text: prompt });             // 唯一进 model 的路径
```

## 5. 服务端进度延迟 1~5 分钟

任务完成判定走服务端埋点 + 校验。专家对话发完立刻 `status` 查，进度还是 0 —— 这不是失败。
实测电商专家对话结束后约 3 分钟才从 0/1 变 1/1。流程上：批量发完 → `sleep 180` → 复查 → `claim-all`。

## 6. Git Bash 路径转换

`node wb-call.cjs GET /v2/activity/growth/tasks` 在 Git Bash 下 `/v2/...` 会被 MSYS 转成
`C:/Program Files/Git/v2/...`。必须 `MSYS_NO_PATHCONV=1 node wb-call.cjs ...`。
`wb-growth.cjs` / `wb-harvest.cjs` 在进程内调接口，不受影响。

## 7. 选择器依赖客户端版本

当前依赖的关键选择器（客户端改版后可能失效，失效时用 `wb-tasks.cjs eval` 重新探测）：

| 用途 | 选择器 |
|---|---|
| 专家中心入口 | `button.conversation-list-tab-button`（文本含「专家」） |
| 专家搜索框 | `input[placeholder="搜索专家"]` |
| 专家/团队结果卡片 | `[class*="_centerCard_"]` |
| 召唤按钮 | `[class*="_headerSummonBtn_"]` |
| 对话输入框 | `[contenteditable=true]` |
| 发送按钮 | `.cr-send-button`（disabled 表示生成中） |
| 快捷分类 | `.quick-actions__item` |
| 模板卡片 | `.wb-home-prompt-list__row` |
| 会话列表项 | `.conversation-item` |
| 发现应用入口 | `.industry-template-switcher__trigger-label` |
| 定时任务导航/新建 | 文本 `定时任务` / `新建` 的 button |
| 定时任务名称框 | `input[placeholder="输入任务名称"]`（`.atm-modal-input`） |
| 定时任务表单容器 | `div[role="dialog"]` 内含 `.atm-detail-page` |
| 任务卡片名 / 更多菜单 | `.atm-task-card__name` / `aria-label="更多"` |
| 菜单删除项 | `.atm-task-card__menu-danger` |
| 行业模板锁定判据 | `[class*="industry-template-switcher__trigger--"]` 的修饰类 |

## 8. deeplink 不可靠

`workbuddy://experts?expertId=...` 实测多数情况不生效（不开新窗、不跳转）。放弃 deeplink，走 UI 路线。

## 9. 行业模板锁定：看修饰类，别看按钮文案

Hy4 把 `.industry-template-switcher__trigger` 这个组件**复用成了「发现应用」按钮**，
按钮文案已经不是行业名了。按文案判断「是否绑定行业模板」会 100% 误报（实测拿到的是"发现应用"）。

唯一可靠信号是修饰类：

```
industry-template-switcher__trigger--general   → 通用，专家市场全量
industry-template-switcher__trigger--<其他>    → 已锁定，市场只返回该行业
```

锁定后表现：搜「电商」「抖音」等通用专家 **0 结果**，但界面不报任何错。

## 10. 「允许完全访问」按钮点不动

新建定时任务会弹「确认允许完全访问？」，注意两点：

1. **必须先勾「我已了解风险，并对自己的数据安全负责」**，不勾按钮点不动（也不报错，就是没反应）。
   复选框选择器：`wb-checkbox__former wb-checkbox__input`；点它的 `<label>` 才可靠。
2. **按钮用 JS `.click()` 会被 tooltip 遮挡**，必须 `Input.dispatchMouseEvent` 真实鼠标点击。

此外 `document.querySelector('div[role="dialog"]')` 可能命中**嵌套的其它弹窗**（如「账号备注」），
要按内容或 `.atm-detail-page` 过滤，别拿第一个。
