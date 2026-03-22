# Blog Post Draft: Launch Announcement

**Target platforms:** DEV Community, Hashnode, personal blog, r/gamedev, r/aigamedev, r/godot
**Length:** ~1,500 words
**Tone:** Developer-to-developer, practical, not salesy

---

# Your AI Forgets How to Make Games. I Built a Fix.

If you've used Claude, Copilot, or Cursor to build a game, you've hit The Wall.

Your AI starts great. It scaffolds your player controller. It sets up your state machine. Then three hours in, it suggests deprecated APIs. It forgets your architecture. It writes Unity 5 code when you're on Unity 6. It implements a combat system that contradicts the ECS pattern it set up twenty minutes ago.

**This isn't an AI problem. It's a context problem.**

AI assistants are stateless. Every prompt starts from zero. They have broad training data but no *structured* understanding of game development patterns, architecture decisions, or engine-specific gotchas. They wing it — and it shows.

## What I Built

[GameDev MCP Server](https://github.com/sbenson2/gamedev-mcp-server) is a knowledge layer that gives your AI permanent game development expertise via [MCP (Model Context Protocol)](https://modelcontextprotocol.io).

```bash
npx gamedev-mcp-server
```

One command. 138+ curated docs. Your AI now knows:

- How to architect a state machine that scales (not the tutorial version that falls apart at 8 states)
- The difference between client prediction and server reconciliation in multiplayer
- Why your platformer movement feels "off" (it's missing coyote time and input buffering)
- How to build an economy system with proper sinks and faucets
- When to use an ECS vs a scene tree vs a component pattern

These aren't raw API docs or scraped tutorials. Every doc is hand-written with AI code generation in mind — typed examples, anti-pattern warnings, decision trees, and "when to use X vs Y" guidance.

## Why MCP?

MCP is a protocol that lets AI tools (Claude Code, Cursor, Windsurf, Cline) connect to external knowledge sources. Instead of cramming everything into a system prompt, your AI can *search* for what it needs, *fetch* specific sections, and get targeted guidance without blowing up your context window.

GameDev MCP Server has 9 tools:

| Tool | What it does |
|------|-------------|
| `search_docs` | TF-IDF search with engine/category filters and cross-engine grouping |
| `get_doc` | Fetch a doc with optional section extraction — get just "Knockback" from a 52KB combat guide |
| `list_docs` | Browse by category, module, or summary mode |
| `list_modules` | See available engine modules |
| `compare_engines` | "How does Godot handle camera vs MonoGame?" — side-by-side engine comparison |
| `random_doc` | Discover docs you didn't know existed — great for exploration |
| `genre_lookup` | "I'm building a roguelike" → here are the 14 systems you need, in priority order |
| `session` | Structured dev workflows (plan, debug, scope, decide) |
| `license_info` | Current tier |

The `section` and `maxLength` params on `get_doc` are the key differentiator. Most MCP servers dump entire documents into your context. This one lets you extract exactly the 2KB you need from a 50KB guide. Your AI stays fast. Your context window stays clean.

## What's Covered

**Engine modules:**
- **MonoGame/Arch ECS** — 78 implementation guides (G1–G69), fully stable, 100% genre coverage across 11 genres
- **Godot 4.4+** — 9 docs and growing: architecture, GDScript vs C#, scene composition, state machines, signals, input handling, physics & collision, camera systems
- **Unity 6** — Planned (research complete, zero knowledge-layer competitors exist)
- **Bevy** — Planned (highest AI hallucination rate of any engine = highest value for knowledge MCP)

**Core knowledge (engine-agnostic):**
- Game design: genre profiles, game feel, balancing, progression systems
- Architecture: ECS, state machines, component patterns, event systems
- Programming: design patterns, data structures, algorithms for games
- Concepts: camera systems, physics, pathfinding, networking theory, particles
- Project management: scope control, sprint planning, art pipeline, solo dev survival

## The Market Context

There are 14,000+ MCP servers. The gamedev MCP space has ~20 servers, but they're all **editor integration** tools — Godot-MCP lets your AI press buttons in the Godot editor, Unity-MCP connects to Unity's API, Unreal-MCP bridges Unreal Engine.

Those are useful. But they don't teach your AI *how to think about games*.

GameDev MCP Server is the only cross-engine **knowledge layer** for game development. It's complementary to editor MCPs — use Godot-MCP to manipulate scenes and GameDev MCP Server to know *what* scenes to build and *why*.

The closest analog is [Ref](https://ref.tools) ($9/mo for general docs-as-MCP), which proves the model works. But Ref covers everything broadly — we go deep on game dev specifically.

## Context Window Efficiency

This matters more than you'd think.

Perplexity's CTO recently criticized MCP publicly — their internal tests showed tool-heavy MCP servers consuming 40-50% of the context window just with schema definitions. YC's CEO Garry Tan piled on.

They're right — for tool-heavy servers. A server with 50+ tools burns tokens on schema before it does anything useful.

GameDev MCP Server has 7 tools. The schema overhead is negligible. And features like section extraction mean you pull exactly what you need:

```
get_doc("G64", section: "Knockback")
→ Returns ~2KB (just the knockback system)
→ Instead of 52KB (the entire combat guide)
```

**9 tools, zero bloat, pure knowledge.** Compare that to Godot MCP servers with 95+ tools. That's the pitch in the MCP criticism era.

## Secure by Design

While [7,000+ MCP servers sit exposed on the internet](https://www.bleepingcomputer.com/news/security/over-7-000-exposed-mcp-servers-reveal-widespread-security-risks/) with no auth, GameDev MCP Server runs entirely local via stdio transport. No ports, no network exposure, no attack surface. RSAC 2026 declared MCP security "can't be patched away" — but that applies to remote HTTP servers, not stdio. Your knowledge stays on your machine.

## Free Tier

The server works out of the box with no license key. Core docs (52 docs covering design, patterns, algorithms, concepts) are permanently free. Engine-specific implementation guides (MonoGame, Godot, etc.) require Pro.

Pro is $9/month — about what you'd pay for a single Udemy course, except it gets smarter every week as new docs land.

## Who This Is For

- **Solo game devs using AI** — Your biggest risk is your AI giving you bad architectural advice early that you discover too late. A knowledge MCP catches that.
- **Game jam participants** — `genre_lookup("roguelike")` gives you a prioritized system checklist in seconds.
- **Unity developers migrating to Godot** — The E2 doc has a 16-concept migration table. Your AI won't suggest `KinematicBody2D` when you need `CharacterBody2D`.
- **Anyone tired of AI "context amnesia"** — If you've ever had to re-explain your game's architecture to Claude for the fifth time in one session, this fixes that.

## Try It

```bash
# Claude Code
claude mcp add gamedev -- npx -y gamedev-mcp-server

# Any MCP client
npx gamedev-mcp-server
```

GitHub: [sbenson2/gamedev-mcp-server](https://github.com/sbenson2/gamedev-mcp-server)
npm: [gamedev-mcp-server](https://www.npmjs.com/package/gamedev-mcp-server)

Star the repo if it's useful. Open an issue if it's not. I'm building this actively — 134 docs today, Godot module expanding weekly, Unity module coming next.

---

**Built for game devs who use AI. Stop fighting context loss. Start building.**

---

## Posting Notes

### DEV Community
- Tags: `gamedev`, `ai`, `opensource`, `mcp`
- Add cover image (use Stitch prompts from `stitch-prompts.md`)
- Cross-post to Hashnode

### Reddit
- **r/gamedev**: Frame as "tool I built" — community likes seeing dev tools from fellow devs. Avoid marketing language.
- **r/aigamedev**: More technical, can go deeper on MCP specifics
- **r/godot**: Lead with Godot-specific content (E2, G1-G4, godot-rules.md). Mention Godot 3→4 migration table prominently. Be aware of anti-AI sentiment — frame as "knowledge infrastructure" not "AI replacement."
- **r/MonoGame**: Lead with MonoGame content depth (77 guides, 100% genre coverage)

### Hacker News
- Title: "GameDev MCP Server – Cross-engine game dev knowledge for AI coding assistants"
- Keep it factual, technical, no exclamation marks
- "Show HN" format

### Twitter/X
- Thread format: problem → solution → demo → link
- Lead with the pain point ("Your AI forgets your game architecture mid-session")
- GIF of section extraction in action would be compelling
