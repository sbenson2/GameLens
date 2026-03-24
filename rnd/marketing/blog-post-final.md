# Your AI Forgets How to Make Games. I Built a Fix.

If you've used Claude, Copilot, or Cursor to build a game, you've hit The Wall.

Your AI starts great. It scaffolds your player controller. It sets up your state machine. Then three hours in, it suggests deprecated APIs. It forgets your architecture. It writes Godot 3 code when you're on Godot 4. It implements a combat system that contradicts the ECS pattern it set up twenty minutes ago.

**This isn't an AI problem. It's a context problem.**

AI assistants are stateless. Every prompt starts from zero. They have broad training data but no *structured* understanding of game development patterns, architecture decisions, or engine-specific gotchas. They wing it — and it shows.

## What I Built

[GameDev MCP Server](https://github.com/sbenson2/gamedev-mcp-server) is a knowledge layer that gives your AI permanent game development expertise via [MCP (Model Context Protocol)](https://modelcontextprotocol.io).

```bash
npx -y gamedev-mcp-server
```

One command. **142 curated docs**. Your AI now knows:

- How to architect a state machine that scales (not the tutorial version that falls apart at 8 states)
- The difference between client prediction and server reconciliation in multiplayer
- Why your platformer movement feels "off" (it's missing coyote time and input buffering)
- How to build an economy system with proper sinks and faucets
- When to use an ECS vs a scene tree vs a component pattern
- How Godot handles camera differently than MonoGame — and which patterns work for each

These aren't raw API docs or scraped tutorials. Every doc is hand-written with AI code generation in mind — typed examples, anti-pattern warnings, decision trees, and "when to use X vs Y" guidance.

## Why MCP?

MCP is a protocol that lets AI tools (Claude Code, Cursor, Windsurf, Cline) connect to external knowledge sources. Instead of cramming everything into a system prompt, your AI can *search* for what it needs, *fetch* specific sections, and get targeted guidance without blowing up your context window.

GameDev MCP Server has **9 tools** — lean by design:

| Tool | What it does |
|------|-------------|
| `search_docs` | Full-text search with engine and category filters |
| `get_doc` | Fetch a doc with optional **section extraction** — get just "Knockback" from a 52KB combat guide |
| `list_docs` | Browse by category, module, or compact summary mode |
| `list_modules` | See available engine modules and their status |
| `compare_engines` | Side-by-side: "How does Godot handle cameras vs MonoGame?" |
| `random_doc` | Discover docs you didn't know existed |
| `genre_lookup` | "I'm building a roguelike" → here are the 14 systems you need, prioritized |
| `session` | Structured dev workflows — plan, debug, scope, decide |
| `license_info` | Current tier and access info |

The `section` and `maxLength` params on `get_doc` are the key differentiator. Most MCP servers dump entire documents into your context. This one lets you extract exactly the 2KB you need from a 50KB guide:

```
get_doc("G64", section: "Knockback")
→ Returns ~2KB (just the knockback system)
→ Instead of 52KB (the entire combat guide)
```

Your AI stays fast. Your context window stays clean.

## What's Covered

**142 docs across 3 modules:**

**🎮 Core Knowledge (51 docs, free):**
- Game design: genre profiles, game feel, balancing, progression
- Architecture: ECS, state machines, component patterns, event systems
- Programming: design patterns, data structures, algorithms for games
- Concepts: camera, physics, pathfinding, networking, combat theory, particles, UI theory
- Project management: scope control, sprint planning, art pipeline, solo dev survival

**⚙️ MonoGame + Arch ECS (79 docs, Pro):**
- 100% genre coverage across 11 genres (platformer, RPG, TD, roguelike, survival, fighting...)
- Guides G1–G69: physics, AI, rendering, networking, UI, save/load, building systems, everything
- Library reference and capability matrix

**🟣 Godot 4.4+ (12 docs, Pro — 60% complete, growing weekly):**
- Architecture overview, GDScript vs C# decision guide with Unity migration table
- Scene composition, state machines, signal architecture
- Input handling (4 movement patterns, coyote time, input buffering, gamepad, accessibility)
- Physics & collision, camera systems, tilemap & terrain (80KB — procedural gen, chunked worlds, A* pathfinding)
- Animation systems, UI & control systems
- Correct Godot 4 patterns — no `KinematicBody2D`, no `yield`, no `TileMap` with layer params

**Planned:** Unity 6 (research complete, zero knowledge-layer competitors) and Bevy (highest AI hallucination rate = highest value for a knowledge MCP).

## Context Window Efficiency Matters

Perplexity's CTO recently criticized MCP — internal tests showed tool-heavy servers consuming 40-50% of the context window just with schema definitions. YC's CEO piled on.

They're right — for tool-heavy servers. Some gamedev MCP servers have 95+ tools. [Context7, the #1 MCP server by stars, scored F (7.5/100)](https://dev.to) on schema quality — 1,020 tokens for 2 tools.

GameDev MCP Server has **9 tools with minimal schema overhead**. Section extraction means you pull exactly what you need. The philosophy: knowledge density per token, not tool count.

## Secure by Design

While [7,000+ MCP servers sit exposed on the internet](https://www.bleepingcomputer.com/news/security/over-7-000-exposed-mcp-servers-reveal-widespread-security-risks/) with no auth, GameDev MCP Server runs entirely local via **stdio transport**. No ports, no network exposure, no attack surface. RSAC 2026 declared MCP security issues "can't be patched away" — but that applies to remote HTTP servers, not stdio.

## Free Tier

The server works out of the box with **no license key**. Core docs (51 docs covering design, patterns, algorithms, concepts) are permanently free. Engine-specific implementation guides (MonoGame, Godot) require Pro.

**Pro is $9/month** — about what you'd pay for a single Udemy course, except the knowledge base grows every week.

## Who This Is For

- **Indie devs using AI coding tools** — Your biggest risk is your AI giving bad architectural advice early that you discover too late. A knowledge MCP catches that.
- **Game jam participants** — `genre_lookup("roguelike")` gives you a prioritized system checklist in seconds.
- **Godot devs tired of AI hallucinating Godot 3 patterns** — 12 docs of correct 4.4+ patterns, growing weekly. Your AI won't suggest `KinematicBody2D` when you need `CharacterBody2D`.
- **Unity devs migrating to Godot** — The E2 doc has a 16-concept migration table.
- **Anyone tired of AI "context amnesia"** — If you've re-explained your game's architecture to Claude five times in one session, this fixes that.

## Try It

```bash
# Claude Code (one line)
claude mcp add gamedev -- npx -y gamedev-mcp-server

# Any MCP client — add to your config:
{
  "mcpServers": {
    "gamedev": {
      "command": "npx",
      "args": ["-y", "gamedev-mcp-server"]
    }
  }
}
```

**GitHub:** [sbenson2/gamedev-mcp-server](https://github.com/sbenson2/gamedev-mcp-server)
**npm:** [gamedev-mcp-server](https://www.npmjs.com/package/gamedev-mcp-server)

Star the repo if it's useful. Open an issue if it's not. I'm building this actively — 142 docs today, Godot module at 60% and expanding weekly, Unity module in the pipeline.

---

*Built for game devs who use AI. Stop fighting context loss. Start building.*

---

## DEV Community Publishing Notes

- **Title:** Your AI Forgets How to Make Games. I Built a Fix.
- **Tags:** `gamedev`, `ai`, `opensource`, `mcp`
- **Series:** (none — standalone)
- **Cover image:** Terminal showing `npx gamedev-mcp-server` with game dev icons
- **Canonical URL:** Set if cross-posting to Hashnode
