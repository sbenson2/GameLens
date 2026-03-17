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

### Open
- **E8_monogamestudio_postmortem.md missing**: 9 docs reference this file but it was never created. Either write it or remove the dead links.
- **Missing images**: `roguelike.png`, `physics.png`, `tilemap.png` referenced but `img/` dir doesn't exist
- **G3 API contradiction**: Aether.Physics2D `SetRestitution`/`SetFriction` listed as removed in v2.2.0 but used in code examples
- **P12 misplacement**: Performance budget doc in `core/` but is MonoGame/C# specific — belongs in `monogame-arch/`

## Competitive Landscape (2026-03-16)

- Space dominated by engine integration tools (Godot-MCP 2.4K⭐, Unreal-MCP 1.6K⭐, Unity-MCP 1.4K⭐)
- Only one docs competitor: `godot-mcp-docs` (50⭐) — Godot-only, very basic
- All competitors are free/open-source
- No paid gamedev MCP servers exist yet
- Complementary positioning: our knowledge server pairs with engine integration MCPs

## 🚨 Needs Owner Attention
_Cron agents: add urgent items here. Heartbeat will check and alert Wes. Clear items after acknowledged._

- **2026-03-16**: `rnd/` directory and `OPENCLAW_RND_BRIEF.md` are untracked in git. Should commit when ready, or add to `.gitignore` if R&D files should stay local-only.

## Feedback & Direction Shifts

_Append Wes's feedback and direction changes here._

- **2026-03-16**: Initial R&D pipeline established. Wes wants full daily workday (9-5, hourly tasks). Be adaptive, reach further, identify new work streams.

## Today's Progress (2026-03-17)

1. ✅ Fixed ALL broken relative links (908 links, 46 files) — the biggest doc quality issue
2. Remaining priorities: build/lint/test suite, Godot research, content gap analysis, commit/gitignore rnd/

## Lessons Learned

_Append operational lessons here._

- **2026-03-16**: First audit found systemic broken link pattern — likely applies to many more docs than the 5 sampled.
- **2026-03-16**: Day 1 was mostly setup + audit + competitive intel. Many rnd/ files are still stubs. Tomorrow should focus on *doing* (fixing, building, testing) rather than more scaffolding.
- **2026-03-16**: The broken link pattern (`../G/` vs `../guides/`) suggests docs were originally in a flat structure with single-letter dirs that got renamed. A bulk sed fix should handle most of it.
- **2026-03-17**: Bulk sed wouldn't have worked — different source files need different relative paths (e.g., `core/project-management/` → `../../monogame-arch/guides/` but `monogame-arch/architecture/` → `../guides/`). Python script with file-map + os.path.relpath was the right approach. Fixed 908 links cleanly.
