# GameDev MCP Server

[![CI](https://github.com/sbenson2/gamedev-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/sbenson2/gamedev-mcp-server/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/gamedev-mcp-server)](https://www.npmjs.com/package/gamedev-mcp-server)
[![Node.js](https://img.shields.io/node/v/gamedev-mcp-server)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Your AI forgets everything mid-project. Give it permanent game development knowledge.**

GameDev MCP Server is a knowledge layer for AI coding assistants. It provides 130+ curated game development docs — design patterns, architecture guides, engine-specific implementation details — delivered through [MCP](https://modelcontextprotocol.io) so your AI assistant never loses context on how to build games.

> Works with **Claude Code**, **Claude Desktop**, **Cursor**, **Windsurf**, **Cline**, and any MCP-compatible tool.

## The Problem

Every game dev using AI hits the same wall: your assistant starts strong, then forgets your architecture mid-session. It suggests deprecated APIs. It doesn't know the difference between a state machine and a behavior tree. It writes Unity 5 code when you're on Unity 6.

**GameDev MCP Server solves this** by giving your AI a persistent, searchable knowledge base of curated game dev expertise — not raw docs, but structured implementation guidance that actually helps you build.

## What's Inside

| Category | Examples | Docs |
|----------|----------|------|
| 🎮 **Game Design** | Genre systems, game feel, balancing, progression | 12 |
| 🏗️ **Architecture** | ECS, state machines, scene management, signals | 18 |
| 💻 **Programming** | Design patterns, data structures, algorithms | 15 |
| 🎯 **Engine Guides** | MonoGame (68 guides), Godot (5+), Unity (planned) | 86+ |
| 🔧 **Core Concepts** | Camera, physics, pathfinding, networking, particles | 18 |
| 📋 **Project Mgmt** | Scope control, sprint planning, art pipeline | 7 |

**130+ docs. 2.5MB+ of curated knowledge. Zero external dependencies.**

## Quick Start

```bash
npx gamedev-mcp-server
```

That's it. No install required. Add it to your MCP config and your AI has instant game dev knowledge.

### Claude Code

```bash
claude mcp add gamedev -- npx -y gamedev-mcp-server
```

### Claude Desktop / Cursor / Windsurf / Cline

Add to your MCP config file:

```json
{
  "mcpServers": {
    "gamedev": {
      "command": "npx",
      "args": ["-y", "gamedev-mcp-server"]
    }
  }
}
```

Config file locations:
- **Claude Desktop:** `claude_desktop_config.json`
- **Cursor:** `.cursor/mcp.json`
- **Windsurf:** `~/.windsurf/mcp.json`
- **Cline:** VS Code settings → Cline MCP Servers

## Engine Modules

GameDev MCP Server uses a modular architecture. Core knowledge (design, patterns, algorithms) is always available. Engine-specific modules add implementation guides for your stack.

| Module | Status | Docs | Description |
|--------|--------|------|-------------|
| `core` | ✅ Stable | 52 | Engine-agnostic game dev knowledge |
| `monogame-arch` | ✅ Stable | 73 | MonoGame + Arch ECS — guides G1–G67, architecture, library reference |
| `godot-arch` | 🚧 Active | 5 | Godot 4.4+ — architecture, scene composition, state machines, signals |
| `unity-arch` | 📋 Planned | — | Unity 6 — URP, ECS, modern patterns |
| `bevy-arch` | 📋 Planned | — | Bevy ECS — Rust game dev |

Modules are auto-discovered. To filter which modules load:

```json
{
  "env": {
    "GAMEDEV_MODULES": "monogame-arch,godot-arch"
  }
}
```

Without `GAMEDEV_MODULES`, all available modules load automatically.

## MCP Tools

| Tool | Description |
|------|-------------|
| **`search_docs`** | Full-text search across all docs with TF-IDF ranking, category/module filters |
| **`get_doc`** | Fetch a doc by ID with optional `section` extraction and `maxLength` for context efficiency |
| **`list_docs`** | Browse docs by category and module |
| **`list_modules`** | Discover available engine modules and their status |
| **`genre_lookup`** | Genre → required systems mapping (platformer, roguelike, tower defense, etc.) |
| **`session`** | Dev session co-pilot — structured workflows for planning, debugging, scoping |
| **`license_info`** | Show current tier and features |

### Context-Efficient by Design

Unlike tool-heavy MCP servers that dump 50K+ tokens of schemas into your context window, GameDev MCP Server is built for precision:

- **Section extraction** — `get_doc("G64", section: "Knockback")` returns just the knockback section, not the full 52KB doc
- **`maxLength` param** — Cap any response to fit your context budget
- **6 focused tools** — Minimal schema overhead, maximum utility
- **stdio transport** — No network exposure, no attack surface ([MCP security is a real concern](https://www.bleepingcomputer.com/news/security/over-7-000-exposed-mcp-servers-reveal-widespread-security-risks/))

## Free vs Pro

The server works fully out of the box with a generous free tier.

| Feature | Free | Pro |
|---------|------|-----|
| Core docs (design, patterns, algorithms) | ✅ | ✅ |
| Search | Core docs | All modules |
| Engine modules (MonoGame, Godot, etc.) | — | ✅ |
| Session co-pilot | — | ✅ |
| Genre lookup | Summary | Full details |
| `get_doc` section extraction | ✅ | ✅ |

**Pro** unlocks engine-specific implementation guides — the stuff that turns "I know game design theory" into "here's exactly how to build it in Godot/MonoGame/Unity."

Get a Pro license → [gamedev-mcp.lemonsqueezy.com](https://gamedev-mcp.lemonsqueezy.com)

### License Setup

Add your key to the MCP config:

```json
{
  "env": {
    "GAMEDEV_MCP_LICENSE": "your-license-key"
  }
}
```

Or create `~/.gamedev-mcp/license.json`:

```json
{ "key": "your-license-key" }
```

The server validates on startup, caches for 24h, and gracefully falls back to free tier if anything goes wrong. It never crashes.

## What Makes This Different

There are [14,000+ MCP servers](https://mcp.so) out there. Here's why this one matters for game dev:

- **Knowledge, not integration.** Godot-MCP, Unity-MCP, and Unreal-MCP give your AI buttons to press in the editor. This gives your AI *understanding* of how to architect and build games. They're complementary — use both.
- **Cross-engine.** One server, multiple engines. Learn a pattern once in core theory, then get the engine-specific implementation. No need to install separate MCPs per engine.
- **Curated, not scraped.** Every doc is hand-written with AI code generation in mind — typed examples, anti-pattern warnings, decision trees, and "when to use" guidance. This isn't a docs mirror.
- **Grows with you.** New docs and engines added continuously. Your AI gets smarter over time without you changing anything.

## Genre Coverage

The `genre_lookup` tool maps any genre to its required systems with implementation priorities:

Platformer · Metroidvania · Roguelike · Tower Defense · Survival · RPG · Bullet Hell · Top-Down Shooter · Side-Scrolling · Fighting · Puzzle

Each genre profile includes: required systems, optional enhancements, suggested doc reading order, and a starter checklist.

## Development

```bash
git clone https://github.com/sbenson2/gamedev-mcp-server.git
cd gamedev-mcp-server
npm install
npm run build
npm test          # 36 tests, Node.js built-in test runner
npm run dev       # Watch mode
```

### Dev Mode

Skip license validation for local development:

```json
{
  "env": {
    "GAMEDEV_MCP_DEV": "true"
  }
}
```

## Doc Structure

```
docs/
├── core/                    # Engine-agnostic (always loaded)
│   ├── game-design/         # Genre profiles, game feel, balancing
│   ├── programming/         # Patterns, principles, data structures
│   ├── concepts/            # Camera, physics, pathfinding, networking, particles
│   ├── project-management/  # Scope, sprints, pipelines
│   ├── ai-workflow/         # AI code generation best practices
│   └── session/             # Co-pilot workflow prompts
├── monogame-arch/           # MonoGame + Arch ECS
│   ├── architecture/        # ECS overview, migration notes
│   ├── guides/              # G1–G67 implementation guides
│   └── reference/           # Library stack, project structure
└── godot-arch/              # Godot 4.4+
    ├── architecture/        # Node tree, scenes, signals philosophy
    ├── guides/              # Scene composition, state machines, signals
    └── reference/           # (coming soon)
```

## MCP Resources

Docs are also available as MCP resources for clients that support them:

- `gamedev://docs/{module}/{id}` — Any doc by module and ID
- `gamedev://prompts/session` — Session co-pilot prompt
- `gamedev://prompts/code-rules` — AI code generation rules

## Contributing

Found a bug? Have a doc suggestion? [Open an issue](https://github.com/sbenson2/gamedev-mcp-server/issues).

## License

MIT — see [LICENSE](./LICENSE).

---

**Built for game devs who use AI.** Stop fighting context loss. Start building.
