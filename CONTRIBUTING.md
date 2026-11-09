# 贡献指南

感谢你对 wb-growth-auto 的兴趣。

## 提 Issue

- **选择器失效**（客户端改版）：请附上 `node scripts/wb-tasks.cjs eval "document.body.innerText.slice(0,500)"` 的输出，以及失效的命令和报错。
- **接口变更**：请附上 `node scripts/wb-harvest.cjs --dump` 中相关接口的原始响应（注意抹掉任何个人信息）。
- **新任务类型**：成长计划上新任务时，附上 `node scripts/wb-growth.cjs status --json` 里该任务的完整 JSON。

## 提交 PR

1. **先读 [docs/pitfalls.md](docs/pitfalls.md)**——CDP 驱动 WorkBuddy 客户端有 8 条实测坑，不读必踩。
2. 代码风格：CommonJS、零第三方依赖、UTF-8 中文注释。
3. 写操作必须留在白名单内：`growth/tasks/accept`、`growth/tasks/{code}/claim`、签到/旅行/抽奖领取、CDP 页面内真实 UI 点击。**任何伪造埋点/伪造事件的 PR 一律拒绝**——本项目的立身之本就是「只做真实动作」。
4. 涉及扫码/登录/账号授权的功能不做，这是硬性边界。
5. 提交信息格式：`<scope>: <说明>`，例如 `wb-tasks: 修复专家团召唤超时`。

## 本地验证

```bash
node scripts/wb-growth.cjs status        # wbipc 链路
node scripts/wb-harvest.cjs --report     # 只读全链路
node scripts/wb-tasks.cjs targets        # CDP 链路（需 9222 端口）
```

三条链路全通再提 PR。
