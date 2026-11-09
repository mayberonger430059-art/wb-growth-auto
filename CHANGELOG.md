# Changelog

本项目遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [1.2.0] - 2026-11-09

### Added
- **`wb-doctor.cjs`（新）** —— 开跑前的只读自检，回答「第一步该干嘛」。
  一次查完 Node / wbipc 端点与握手 / CDP 端口与主窗口 / 任务接取状态 /
  可自动 vs 需真人 / 行业模板是否锁死，**最后一行直接输出下一条该跑的命令**。
  支持 `--json`（有 FAIL 时退出码 1），可做 CI 或脚本前置判断。
- **`wb-tasks.cjs automation "<名>" "<提示词>"`** —— 新建定时任务全流程：
  填名 → 填提示词 → 确定 → 勾「我已了解风险」→ 真实鼠标点「允许完全访问」→ 验证落库。
- **`wb-tasks.cjs automation-rm "<名>"`** —— 删除定时任务（更多 → 删除 → 确认）。
- `docs/quickstart.md` —— 从零到收割的逐步指南，含 8 条卡点对照表。
- `package.json` 新增 `doctor` / `accept` / `claim` 三个 npm script，`bin` 注册 `wb-doctor`。

### Fixed
- **`accept-all` 在新号上一个都接不上**：服务端对未接取任务返回 `not_accepted`，
  旧逻辑只认 `available`，导致「先点去完成」这一步实际没做成，后续所有动作都不计数。
  现纳入 `available / not_accepted / unaccepted / pending / 空`，排除 `completed / claimed`，
  并打印实际接取到的任务码。
- **行业模板锁定检测 100% 误报**：Hy4 把 `.industry-template-switcher__trigger` 复用成
  「发现应用」按钮，按钮文案已不代表行业。改为读修饰类
  `industry-template-switcher__trigger--general`（通用）vs `--<其他>`（锁定）。
- **定时任务「确定」按钮永远禁用（静默失败）**：输入区是 Slate.js 富文本，
  `execCommand` / value setter / 改 innerText 都进不了它的 model，DOM 有字但 model 为空且不报错。
  改走 真实点击聚焦 → Ctrl+A → Delete → `Input.insertText`，并以按钮 `disabled` 状态作判据。

### Changed
- README 新增「🩺 第一步」章节置顶，快速开始改为 `accept-all` 优先（原先是 `status` 摸底）。
- SKILL.md 技能描述与版本同步，新增「第一步永远是自检」「第二步接任务」两节，
  踩坑清单补充 Slate 编辑器与行业模板修饰符两条。
- CI 冒烟增加 `wb-doctor --help`。

## [1.1.1] - 2026-11-09

### Added
- 四个 CLI 统一支持 `--help` / `-h`（免客户端可查用法）。
- GitHub Actions CI：Node 18/20/22 语法校验 + `--help` 冒烟 + 凭据泄漏检查（endpoint.json 不入库）。
- README 头部挂载项目 logo；新增 README_EN、CONTRIBUTING、Issue 模板。

## [1.1.0] - 2026-11-09

### Changed
- 重构为模块化结构：抽取 `scripts/lib/wbipc.cjs`（握手/RPC/http.fetch）与 `scripts/lib/cdp.cjs`（CDP 会话）为共享库，消除 wb-call / wb-harvest 之间的重复代码。
- `wb-growth.cjs` 改为进程内调用 wbipc（原先每次操作 spawn 一次 wb-call，握手开销 ×N）。
- `wb-tasks.cjs` 截图路径改为可配置（`WB_SHOT_DIR`，默认 `./shots`），移除硬编码绝对路径。

### Added
- `wb-tasks.cjs templates`：五个快捷分类模板一键各发一条。
- `wb-tasks.cjs app` / `pending` 命令。
- `wb-growth.cjs accept-all`、`status --json`。
- 补齐 README / LICENSE / package.json / CHANGELOG / docs/api.md / docs/pitfalls.md / examples。

## [1.0.0] - 2026-11-09

### Added
- 首个可用版本：wb-call（通用 API）、wb-growth（status/claim/claim-all）、wb-harvest（签到/旅行/任务/连登/抽奖）、wb-tasks（experts/teams/tc/visit/shot/eval）。
- 实测完成成长计划 18 个任务中的 15 个，+1500 积分。
