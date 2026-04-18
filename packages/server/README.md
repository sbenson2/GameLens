# GameCodex

[![CI](https://github.com/sbenson2/GameCodex/badges/main/pipeline.svg)](https://github.com/sbenson2/GameCodex/-/pipelines)
[![npm version](https://img.shields.io/npm/v/gamecodex)](https://www.npmjs.com/package/gamecodex)
[![npm downloads](https://img.shields.io/npm/dm/gamecodex)](https://www.npmjs.com/package/gamecodex)
[![Node.js](https://img.shields.io/node/v/gamecodex)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Free and open source game dev AI assistant — MCP server.**

GameCodex gives any AI coding assistant permanent, structured game development knowledge: 950+ curated docs across 29 engines — design patterns, architecture guides, engine-specific implementation details — delivered through [MCP](https://modelcontextprotocol.io) so your AI never loses context on how to build games.

> Works with **Claude Code**, **Claude Desktop**, **Cursor**, **Windsurf**, **Cline**, and any MCP-compatible tool.

## The Problem

Every game dev using AI hits the same wall: your assistant starts strong, then forgets your architecture mid-session. It suggests deprecated APIs. It doesn't know the difference between a state machine and a behavior tree. It writes Unity 5 code when you're on Unity 6.

**GameCodex solves this** by giving your AI a persistent, searchable knowledge base of curated game dev expertise — not raw docs, but structured implementation guidance that actually helps you build.

## Status

**v1.0.0 — free and open source, MIT licensed.** All tools, all docs, no tiers, no accounts, no license keys.

Active feature development has stopped. The project is in maintenance mode — bug fixes and doc corrections welcome, but no new feature work is planned. Fork freely.

## What's Inside

| Category | Examples | Docs |
|----------|----------|------|
| **Core Knowledge** | Design patterns, ECS, state machines, data structures, algorithms | 52 |
| **Engine Guides** | MonoGame, Godot, Unity, Unreal, Bevy, Phaser, and 23 more | 905 |

**957 docs. 18MB of curated knowledge. 29 engine modules.**

## Quick Start

```bash
npx gamecodex
```

That's it. No install required. Add it to your MCP config and your AI has instant game dev knowledge.

### Claude Code

```bash
claude mcp add gamedev -- npx -y gamecodex
```

### Claude Desktop / Cursor / Windsurf / Cline

Add to your MCP config file:

```json
{
  "mcpServers": {
    "gamedev": {
      "command": "npx",
      "args": ["-y", "gamecodex"]
    }
  }
}
```

Config file locations:
- **Claude Desktop:** `claude_desktop_config.json`
- **Cursor:** `.cursor/mcp.json`
- **Windsurf:** `~/.windsurf/mcp.json`
- **Cline:** VS Code settings > Cline MCP Servers

## Engine Modules

GameCodex uses a modular architecture. Core knowledge (design, patterns, algorithms) is always available. Engine-specific modules add implementation guides for your stack.

| Module | Docs | Module | Docs |
|--------|------|--------|------|
| `monogame-arch` | 131 | `godot-arch` | 116 |
| `unity-arch` | 81 | `unreal-arch` | 81 |
| `bevy-arch` | 37 | `stride-arch` | 37 |
| `fna-arch` | 37 | `defold-arch` | 30 |
| `love2d-arch` | 28 | `pygame-arch` | 27 |
| `renpy-arch` | 25 | `threejs-arch` | 22 |
| `playcanvas-arch` | 22 | `babylonjs-arch` | 22 |
| `phaser-arch` | 21 | `macroquad-arch` | 20 |
| `gamemaker-arch` | 18 | `pixijs-arch` | 16 |
| `kaplay-arch` | 16 | `rpgmaker-arch` | 15 |
| `excalibur-arch` | 15 | `construct-arch` | 15 |
| `sdl3-arch` | 13 | `raylib-arch` | 13 |
| `gdevelop-arch` | 13 | `libgdx-arch` | 10 |
| `sfml-arch` | 9 | `haxeflixel-arch` | 8 |
| `heaps-arch` | 7 | | |

Plus `core` with 52 engine-agnostic docs on game design, architecture, programming patterns, and project management.

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

GameCodex consolidates everything into 5 tools — one per domain, with an `action` parameter for routing. Minimal schema overhead, maximum utility.

| Tool | Actions | What it does |
|------|---------|-------------|
| **`project`** | help, hello, get, set, suggest, decide, goal, complete_goal, clear_goals, milestone, note, recall, clear_notes, health, scope, add_feature, list, session | AI assistant — onboarding, project state, goals, decisions, scope health, session workflows |
| **`design`** | help, gdd, phase, scope_check, launch, store_page, pricing, marketing, trailer, patterns | Plan + ship — GDD, phase checklists, scope analysis, marketing guidance, architecture patterns |
| **`docs`** | help, search, get, browse, modules | Knowledge base — search/browse 950+ game dev docs across 29 engines |
| **`build`** | help, scaffold, code, assets, debug, review | Make things — scaffold projects, generate code, asset pipeline, debug errors, review architecture |
| **`meta`** | help, status, analytics, modules, health, about | Server internals — diagnostics, module discovery |

### Context-Efficient by Design

Unlike tool-heavy MCP servers that dump 50K+ tokens of schemas into your context window, GameCodex is built for precision:

- **5 focused tools** — Minimal schema overhead, maximum utility. Compare to Godot MCP servers with 95+ tools burning half your context on schema alone
- **Section extraction** — `docs { action: "get", id: "G64", section: "Knockback" }` returns just the knockback section, not the full 52KB doc
- **`maxLength` param** — Cap any response to fit your context budget
- **stdio transport** — No network exposure, no attack surface ([MCP security is a real concern](https://www.bleepingcomputer.com/news/security/over-7-000-exposed-mcp-servers-reveal-widespread-security-risks/))

## MCP Prompts

Workflow entry points that chain multiple tool calls:

| Prompt | What it does |
|--------|-------------|
| `/start-project` | Guided new project setup — engine selection, GDD, goals, first steps |
| `/debug-error` | Error diagnosis — analyze, search docs, suggest a fix |
| `/ship-game` | Launch checklist — store page, marketing, pricing |
| `/session` | Structured dev session — plan, build, debug, or manage scope |

## What Makes This Different

There are [14,000+ MCP servers](https://mcp.so) out there. Here's why this one matters for game dev:

- **Knowledge, not integration.** Godot-MCP, Unity-MCP, and Unreal-MCP give your AI buttons to press in the editor. This gives your AI *understanding* of how to architect and build games. They're complementary — use both.
- **Cross-engine.** One server, 29 engines. Learn a pattern once in core theory, then get the engine-specific implementation. No need to install separate MCPs per engine.
- **Curated, not scraped.** Every doc is hand-written with AI code generation in mind — typed examples, anti-pattern warnings, decision trees, and "when to use" guidance. This isn't a docs mirror.
- **Secure by design.** stdio-only transport — no network exposure, no open ports, no attack surface. While [7,000+ MCP servers sit exposed on the internet](https://www.bleepingcomputer.com/news/security/over-7-000-exposed-mcp-servers-reveal-widespread-security-risks/), this runs entirely local.

## Genre Coverage

The `design` tool's `patterns` action maps any genre to its required systems with implementation priorities:

Platformer, Metroidvania, Roguelike, Tower Defense, Survival, RPG, Bullet Hell, Top-Down Shooter, Side-Scrolling, Fighting, Puzzle

Each genre profile includes: required systems, optional enhancements, suggested doc reading order, and a starter checklist.

## Development

```bash
git clone https://github.com/sbenson2/GameCodex.git
cd GameCodex
npm install
npm run build
npm test          # Node.js built-in test runner
npm run dev       # Watch mode
```

## Doc Structure

```
docs/
├── core/                    # Engine-agnostic (always loaded, 52 docs)
│   ├── game-design/         # Genre profiles, game feel, balancing
│   ├── programming/         # Patterns, principles, data structures
│   ├── concepts/            # Camera, physics, pathfinding, networking, particles
│   ├── project-management/  # Scope, sprints, pipelines
│   ├── ai-workflow/         # AI code generation best practices
│   └── session/             # Session workflow prompts
├── monogame-arch/           # MonoGame (131 docs)
├── godot-arch/              # Godot 4.4+ (116 docs)
├── unity-arch/              # Unity 6 (81 docs)
├── unreal-arch/             # Unreal Engine 5 (81 docs)
├── bevy-arch/               # Bevy ECS (37 docs)
├── ...                      # 24 more engine modules
└── [engine]-arch/           # Each module: architecture/, guides/, reference/
```

## MCP Resources

Docs are also available as MCP resources for clients that support them:

- `gamedev://docs/{module}/{id}` — Any doc by module and ID
- `gamedev://prompts/session` — Session workflow prompt
- `gamedev://prompts/code-rules` — AI code generation rules

## Security

GameCodex uses **stdio-only transport** — no HTTP server, no open ports, no network exposure. While [7,000+ MCP servers sit exposed on the internet](https://www.bleepingcomputer.com/news/security/over-7-000-exposed-mcp-servers-reveal-widespread-security-risks/), this runs entirely local. Read-only by design: it serves knowledge, never modifies your project files.

**Vector search is opt-in.** The `@huggingface/transformers` package (for ML-based semantic search) is an optional dependency. Without it, the server uses TF-IDF keyword search — fast and effective for most use cases. To enable vector search: `npm install @huggingface/transformers`.

See [SECURITY.md](./SECURITY.md) for our full security policy and vulnerability reporting process.

## Contributing

Found a bug? Have a doc correction? [Open an issue](https://github.com/sbenson2/GameCodex/-/issues). The project is in maintenance mode — bug fixes and small improvements are welcome; larger feature work is not being actively merged.

## License

MIT — see [LICENSE](./LICENSE).

---

**Built for game devs who use AI. Free, open source, and yours to fork.**
