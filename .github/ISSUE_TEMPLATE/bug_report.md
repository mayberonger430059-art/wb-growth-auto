---
name: Bug 报告
about: 选择器失效 / 接口变更 / 运行报错
title: "[Bug] "
labels: bug
---

## 环境

- OS：
- Node.js 版本（`node -v`）：
- WorkBuddy 客户端版本：
- 仓库版本 / commit：

## 现象

运行了什么命令，期望什么，实际发生了什么。

## 输出

```text
粘贴完整终端输出（请抹除任何个人信息）
```

## 补充（按类型选填）

- 选择器失效：`node scripts/wb-tasks.cjs eval "document.body.innerText.slice(0,500)"` 的输出
- 接口变更：`node scripts/wb-harvest.cjs --dump` 中相关接口的原始响应
