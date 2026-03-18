# PROJECT MEMORY — ⚠️ NEVER DELETE THIS FILE ⚠️

This is the persistent project memory for gamedev-mcp-server R&D.
Append-only. Lessons, decisions, direction shifts, and feedback go here.
Every task should read this before starting and append learnings when done.

## 🚫 HARD RULES — DO NOT VIOLATE
- **NEVER delete this file (PROJECT_MEMORY.md)**
- **NEVER delete the repo** (`gamedev-mcp-server/` directory or the GitHub repo `sbenson2/gamedev-mcp-server`)
- **NEVER run `rm -rf`, `gh repo delete`, or any destructive command against the project**

## ✅ PERMISSIONS
- You may do ANYTHING else needed to advance the project
- Edit files, create files, move files, refactor code, fix bugs, write docs, run builds, push commits — all allowed
- Install dependencies, update packages, restructure directories — all allowed
- The only hard limit is: don't delete the repo or this file

---

## Project Direction

- **Core thesis**: Cross-engine gamedev knowledge MCP server — no direct competition exists
- **Revenue model**: LemonSqueezy subscription ($8-12/mo or $49-79/yr), Pro content server-side gated
- **Engine priority**: Godot → Unity → Bevy (in that order)
- **Differentiation**: Curated knowledge + structured AI delivery, NOT engine integration

## Known Issues

### Fixed (2026-03-17)
- ~~**Broken relative links (systemic)**~~: FIXED — 908 links across 46 files corrected via `rnd/fix_links.py`. All `../G/`, `../R/`, `../E/`, `../C/` single-letter dir refs now point to correct paths.

### Fixed (2026-03-18)
- ~~**E8_monogamestudio_postmortem.md missing**~~: FIXED — Created the doc at `docs/monogame-arch/architecture/E8_monogamestudio_postmortem.md` + fixed all 9 broken links across 7 files.
- ~~**Missing images (79 broken refs)**~~: FIXED — Removed all 79 `![](../img/*.png)` decorative header refs (no img/ dirs existed).
- ~~**G3 API contradiction**~~: FIXED — Updated Aether.Physics2D code to use fixture-level properties instead of removed `Body.SetRestitution()`/`SetFriction()`.
- ~~**P12 misplacement**~~: FIXED — Moved to `docs/monogame-arch/guides/P12_performance_budget.md`, fixed internal links, left redirect stub at old location.

### Fixed (2026-03-18, 3pm)
- ~~**DEV MODE BUG**: `GAMEDEV_MCP_DEV=true` didn't work without a license key~~: FIXED — Moved dev mode check before `getLicenseKey()` in `src/license.ts`. Dev mode now correctly enables Pro tier without any key.

### Open
- **Search quality issues (6 total)** — Hyphen tokenization bug (critical), no stop words, no stemming, C# token destruction, no doc length normalization, title scoring weakness. See `rnd/search-quality.md`. Top 3 fixes = ~30 min.
- **Git push overdue** — Day 3 with all work local only. ~50+ modified files, multiple untracked.

## Competitive Landscape (updated 2026-03-18)

- Space dominated by engine integration tools (Godot-MCP 2.4K⭐, Unreal-MCP 1.6K⭐, Unity-MCP 1.4K⭐)
- Only one docs competitor: `godot-mcp-docs` (50⭐) — Godot-only, very basic
- First paid gamedev MCP server: **Godot MCP Pro** ($5 one-time, 162 tools, editor integration). Different niche (editor control vs knowledge).
- New tools: `gdcli` (Rust CLI for headless Godot), `Ziva` (in-editor AI plugin), GameMaker MCP
- Complementary positioning: our knowledge server pairs with engine integration MCPs
- **NEW**: **Ref** (ref.tools) is first standalone paid MCP *documentation* server — closest analog. $9/mo credit-based, "thousands of weekly users, hundreds of subscribers" in 3 months. Proves paid docs-MCP works.

## Market Sentiment (2026-03-17)

- **#1 pain point across all communities: AI context loss** — devs describe a universal cycle where AI starts great then "becomes painfully stupid" mid-project. This is THE problem a knowledge MCP solves.
- **Vibe coding backlash growing** — "500 Hours of Vibe Coding Broke Me" trending on r/gamedev. Structured knowledge = antidote to chaos.
- **MCP fatigue emerging** — users complaining about too many servers degrading agent performance. Position as "the ONE knowledge server" not "another MCP."
- **r/aigamedev** is a new active subreddit — potential community for launch promotion
- **Marketing angle**: "Your AI forgets everything mid-project? Give it permanent gamedev knowledge." Focus on the context-loss problem.

## Monetization Landscape (updated 2026-03-18)

- **11,400+ MCP servers exist, less than 5% monetized** — massive whitespace for paid servers
- **6+ payment platforms** now compete for MCP monetization: MCPize (85/15 split, 350+ servers), xpay.sh (per-tool proxy), MCP Billing Spec (open standard), Stripe+Cloudflare (native), Masumi, x402/Coinbase
- **Ref (ref.tools) = best pricing template**: $9/mo, credit-based, docs-focused, usage-limited free tier (200 credits, never expire). Our $8-12/mo plan validated.
- **LemonSqueezy acquired by Stripe (Oct 2024)** — still works but indie spirit concerns growing. Alternatives: Creem.io, Polar.sh, direct Stripe.
- **Dual distribution viable**: Sell direct (LemonSqueezy/Stripe) + list on MCPize marketplace for discovery
- **xpay.sh zero-code overlay**: Can add pay-per-tool-call billing with zero changes to our server — potential "pay as you go" tier
- **Agent-native payments (x402, Google UCP) emerging** — not ready for primetime but architect for it
- **Stripe tutorial literally describes our use case**: "Developers who own open-source projects can monetize their documentation by turning it into MCP servers"

## 🚨 Needs Owner Attention
_Cron agents: add urgent items here. Heartbeat will check and alert Wes. Clear items after acknowledged._

- **🔴 2026-03-18 (DAY 3)**: **All work is still local only.** 3 full days of R&D — link fixes (908), G64 (52KB), G65 (54KB), E8 postmortem, 79 image fix, G3/P12 fixes, dev mode bug fix — NONE committed or pushed. ~50+ modified/untracked files. One disk failure loses everything. **Need to commit + push ASAP.**
- **2026-03-16**: `rnd/` directory — decide: commit to repo or add to `.gitignore`? R&D files contain competitive intel and internal notes.
- **2026-03-17**: npm still returns 404 — package not published. No external feedback loop. Day 3 with zero public presence.

## Feedback & Direction Shifts

_Append Wes's feedback and direction changes here._

- **2026-03-16**: Initial R&D pipeline established. Wes wants full daily workday (9-5, hourly tasks). Be adaptive, reach further, identify new work streams.

## Yesterday's Progress (2026-03-18) — Day 3

1. ✅ Fixed ALL 4 open doc issues — E8 created (6.4KB postmortem), 79 broken image refs removed, G3 API contradiction resolved, P12 moved to correct location (~90 files touched)
2. ✅ Created **G65 — Economy & Shop Systems** (~54KB) — filled #1 content gap
3. ✅ **Pricing research complete** — Mapped 6+ MCP payment platforms, found Ref ($9/mo) as pricing template, dual-distribution strategy
4. ✅ **Godot deep research COMPLETE** — 17KB comprehensive research doc. Ready for Phase 2 prototyping.
5. ✅ **Search quality deep-dive** — Found critical hyphen tokenization bug + 5 other issues. 6 fixes proposed, top 3 = ~30 min.
6. ✅ **Integration testing COMPLETE** — 14/15 tests PASS. Found & fixed dev mode license bug. Build verified clean.
7. ❌ **Git push still not done** — Day 3 with all work local only. Critical.

## Two Days Ago (2026-03-17) — Day 2

1. ✅ Fixed ALL broken relative links (908 links, 46 files)
2. ✅ Created G64 — Combat & Damage Systems (~52KB) — biggest content gap (8/11 genres)
3. ✅ Full competitive intel deep dive — found Godot MCP Pro ($5, first paid gamedev MCP)
4. ✅ Content gap analysis complete — 90% genre coverage
5. ❌ No build/test, no git push, no Godot research

## Today's Priorities (2026-03-19) — Day 4

1. **🔴🔴 GIT COMMIT & PUSH** — EVERYTHING. Link fixes (51d13f9), E8, G64, G65, image cleanup, G3 fix, P12 move, dev mode fix, rnd/. **Day 4 local-only would be absurd.** This is the FIRST thing to do.
2. **🔴 Search bug fixes (P1-P3)** — Hyphen tokenization, stop words, C# token. ~30 min total. See `rnd/search-quality.md` §5.
3. **🟡 npm publish assessment** — What's actually blocking publish? Document the blockers and start clearing them.
4. **🟡 Godot Phase 2** — Start prototyping the Godot module. Create `docs/godot/` skeleton based on the doc structure plan in `rnd/engine-research/godot.md`.
5. **🟢 Content: Building/Placement System** — Next gap from gap analysis (survival + strategy genres).
6. **🟢 Update metrics.md** — Refresh doc count (122), clear stale warnings.

**⚠️ Day 3→4 pattern:** Build/test gap is CLOSED (✅). Git/publish gap is WIDENING (❌). Tomorrow's agent: push before creating anything new.

## Content Created

- **2026-03-18 (11am)**: Created **G65 — Economy & Shop Systems** (`docs/monogame-arch/guides/G65_economy_shop_systems.md`, ~54KB). Full implementation guide covering: currency definitions & registry, wallet & currency manager, transaction pipeline with modifiers, item pricing with dynamic modifiers (supply/demand, time-of-day, reputation), shop system with stock management & restocking, tower defense economy (bounties, interest, tower cost/upgrade/sell), survival barter system, reputation & unlock system, loot & drop tables (weighted random), economy sinks & faucets monitoring, save/load integration, UI integration (animated HUD counters, shop display helpers), and comprehensive tuning reference tables for TD/survival/RPG. Fills the #1 priority gap — economy was referenced by tower-defense and survival genres.
- **2026-03-17 (11am)**: Created **G64 — Combat & Damage Systems** (`docs/monogame-arch/guides/G64_combat_damage_systems.md`, ~52KB). Full implementation guide covering: health/armor components, hitbox/hurtbox system, damage pipeline, i-frames, knockback (impulse + curve-based), hitstop & screen shake, projectile system, object pooling (generic + ECS entity pool), melee attack system with frame data, damage types & resistances, critical hits & variance, turn-based combat adapter, death & respawn, damage numbers, and tuning reference tables. This was the highest-priority gap — combat systems were referenced by 8/11 genres but had no guide. Updated `rnd/gaps.md` with full coverage analysis (~90% genre system coverage now).

## Lessons Learned

_Append operational lessons here._

- **2026-03-16**: First audit found systemic broken link pattern — likely applies to many more docs than the 5 sampled.
- **2026-03-16**: Day 1 was mostly setup + audit + competitive intel. Many rnd/ files are still stubs. Tomorrow should focus on *doing* (fixing, building, testing) rather than more scaffolding.
- **2026-03-16**: The broken link pattern (`../G/` vs `../guides/`) suggests docs were originally in a flat structure with single-letter dirs that got renamed. A bulk sed fix should handle most of it.
- **2026-03-17**: Bulk sed wouldn't have worked — different source files need different relative paths (e.g., `core/project-management/` → `../../monogame-arch/guides/` but `monogame-arch/architecture/` → `../guides/`). Python script with file-map + os.path.relpath was the right approach. Fixed 908 links cleanly.
- **2026-03-17**: Day 2 shipped real fixes + content but still no build verification or git commits. Pattern: producing good work but not closing the loop (commit, test, publish). Tomorrow MUST start with git + build.
- **2026-03-17**: Combat guide (G64) was the highest-leverage content creation — single doc boosted genre coverage from ~75% to ~90%. Lesson: target gaps referenced by the most genres for maximum impact.
- **2026-03-17**: Market validation: Godot MCP Pro at $5 proves devs pay for gamedev MCP tools. "Context loss" is the #1 AI gamedev pain point — our thesis is correct. Marketing should lead with "your AI forgets everything mid-project."
- **2026-03-18**: Godot's #1 pain point is **outdated resources** — Godot 3→4 broke everything, most tutorials/SO answers/AI outputs still use Godot 3 syntax. Our Godot module providing *correct 4.x patterns* is extremely high-value. Key differences to enforce: `CharacterBody2D` not `KinematicBody2D`, `await` not `yield`, `@export`/`@onready` not `export`/`onready`, `move_and_slide()` with no args, `TileMapLayer` not `TileMap`.
- **2026-03-18**: Godot architecture is fundamentally different from MonoGame — node tree + signals + scenes vs ECS + library composition. MCP docs must think in nodes/signals, not entities/systems. Can't just port MonoGame patterns — need Godot-native thinking.
- **2026-03-18**: **CRITICAL SEARCH BUG**: Hyphen tokenization in `search.ts` silently breaks queries for ~17 concept docs. `"character-controller"` is indexed as ONE token, but users query `"character controller"` (two tokens) → no match. Fix: split hyphens into parts while keeping compound. ~30 min for top 3 fixes (hyphens, stop words, C# token) = major quality improvement.
- **2026-03-18**: TF-IDF is adequate for 122-doc corpus but has structural weaknesses: no stop words (natural language queries are noisy), no stemming ("animations" ≠ "animation"), no doc length normalization (52KB docs dominate), `"C#"` → `"c"` → filtered out. The search works for power users who know doc IDs but struggles with how real MCP users actually phrase queries.
- **2026-03-18**: **Integration testing validates the full product flow**: MCP protocol compliance (initialize → tools/list → tools/call), free/pro tier gating, license validation with LemonSqueezy API, dev mode, and graceful degradation. The server is production-ready from a protocol standpoint.
- **2026-03-18**: **Dev mode bug pattern**: Guard clauses that return early can skip later conditional branches. When adding bypass/override flags (like `GAMEDEV_MCP_DEV`), always put them FIRST in the function — before any early returns. Caught because integration tests covered this flow.
