<div align="center">

<img src="docs/assets/logo.png" alt="wb-growth-auto logo" width="160" />

# 🚀 wb-growth-auto

**WorkBuddy Growth-Plan Auto-Completer**

Query · Accept · Claim · Check-in · Buddy-Travel · Lottery — one command to harvest them all.
Expert summoning · Templates · Scheduled tasks · Pending confirmations — real UI automation via CDP.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue)](#)
[![Version](https://img.shields.io/badge/version-1.2.1-orange)](CHANGELOG.md)

**[中文文档](README.md)** · English

</div>

---

## What is this

WorkBuddy's "Growth Plan" has 18+ tasks: daily check-in, summoning experts, using templates, setting up automations... Doing them by hand takes half an hour, every day.
**wb-growth-auto turns that into engineering**: one command performs every automatable action. Field-tested at **+1500 credits** in a single pass.

It is *not* API forgery. Every action is either an **official API call** under the desktop client's own login session, or a **real UI click** driven via CDP — equivalent to you sitting at the machine. Progress is always validated server-side.

> ⚡ Field results: 15 of 18 growth tasks completed automatically; the remaining 3 require real-person QR scans / account authorization and are physically not automatable.

## Highlights

- **Zero dependencies** — Node.js ≥ 18, clone and run, no `npm install`.
- **Two routes**: `wbipc` (local RPC bridge over a named pipe, HMAC-SHA256 handshake, zero credential exposure) for server-side judged tasks; **CDP** (Chrome DevTools Protocol) for real-UI "experience" tasks.
- **Idempotent harvester**: safe to run N times a day; daily check-in and buddy travel are duplicate-safe.
- **Write whitelist**: only task accept/claim, check-in, travel, lottery — nothing else is ever written.
- **Honest by design**: QR-code / login / authorization tasks are explicitly skipped and reported, never faked.

## Quick start

Prerequisites: WorkBuddy desktop app running and logged in; Node.js ≥ 18. For the UI route, launch the client with `--remote-debugging-port=9222`.

**Step 0 — always run the doctor first.** Read-only, changes nothing, tells you the next command:

```bash
node scripts/wb-doctor.cjs          # add --json for machine-readable output
```

It checks Node, the wbipc endpoint + handshake, the CDP port + main window, task accept state,
automatable vs. human-only tasks, and whether the industry template has locked the expert marketplace.
The last line prints exactly what to run next.

```bash
node scripts/wb-growth.cjs accept-all   # 1. Accept tasks FIRST — nothing counts before this
node scripts/wb-harvest.cjs             # 2. Harvest: check-in/travel/accept/claim/lottery
node scripts/wb-growth.cjs claim-all    # 3. Collect rewards (wait 1–5 min for server validation)
```

> ⚠️ The most-missed step is `accept-all`. Every growth task has a "go complete it" button;
> until it's clicked, **nothing you do is counted**. The server calls that state `not_accepted`
> (not `available` as the docs suggest) — older versions only matched `available`, so brand-new
> accounts accepted zero tasks. Run it after switching accounts, long gaps, or client upgrades.

Experience tasks (CDP route):

```bash
node scripts/wb-tasks.cjs experts "抖音策略师" "中国电商运营专家"
node scripts/wb-tasks.cjs teams "内容创作专家团"
node scripts/wb-tasks.cjs templates
node scripts/wb-tasks.cjs automation "Daily review" "Summarize what I finished today in 3 bullet points"
```

Step-by-step guide and a troubleshooting table: [docs/quickstart.md](docs/quickstart.md) (Chinese).

Full command reference, architecture diagram, security design, and known limitations: see **[README.md](README.md)** (Chinese) — the command-line interface is identical and self-explanatory.

## Docs

- [docs/quickstart.md](docs/quickstart.md) — zero to harvest, step by step
- [docs/api.md](docs/api.md) — discovered official endpoints with field notes
- [docs/pitfalls.md](docs/pitfalls.md) — hard-won pitfalls of driving the client via CDP
- [CHANGELOG.md](CHANGELOG.md) — version history (SemVer)

## License

[MIT](LICENSE) © wb-growth-auto contributors
