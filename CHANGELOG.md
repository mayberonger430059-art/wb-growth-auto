# Changelog

本项目遵循 [SemVer](https://semver.org/lang/zh-CN/)。

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
