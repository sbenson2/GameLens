# GameCodex

**Your AI forgets game dev mid-project. This fixes that.**

GameCodex is a game dev AI assistant — an MCP server with 950+ curated docs across 29 engines, 5 power tools, structured workflows, and scope tracking. It connects to any AI that supports the [Model Context Protocol](https://modelcontextprotocol.io): Claude, Cursor, Windsurf, Continue.dev, and more.

Every doc is purpose-written for AI consumption — typed examples, anti-pattern warnings, decision trees — drafted with AI assistance under human editorial direction. Not scraped docs. Not training data guesses. Structured knowledge that actually helps you build.

## Install

```bash
npx gamecodex setup
```

That's it. Zero-install, auto-detects your AI tool, writes the MCP config for you.

### Manual setup

Add to your MCP config (`claude_desktop_config.json`, `.cursor/mcp.json`, etc.):

```json
{
  "mcpServers": {
    "gamecodex": {
      "command": "npx",
      "args": ["-y", "gamecodex"]
    }
  }
}
```

Or with Claude Code:

```bash
claude mcp add gamecodex -- npx -y gamecodex
```

## What Can It Do?

**Search 950+ curated docs** — Ask about ECS, pathfinding, state machines, shaders, or any game system. Get structured answers grounded in real documentation, not hallucinations.

**Scaffold projects** — Describe your game, get architecture and starter code that compiles. Every snippet includes comments explaining *why*.

**Debug like a mentor** — Paste an error, get a diagnosis. Not a Stack Overflow link — a real explanation of what went wrong and how to fix it.

**Track scope creep** — Built-in project health tracking warns when your feature list is getting heavy. Knows when to say "cut this" before your game becomes vaporware.

**Structure your workflow** — Session workflows for planning, debugging, deciding, and scoping. Not chat history — orchestrated development process management.

## 5 Power Tools

| Tool | What it does |
|------|-------------|
| `project` | Project state, goals, decisions, scope health, session workflows |
| `design` | GDD generation, phase checklists, launch prep, marketing guidance |
| `docs` | Search and browse 950+ game dev docs across 29 engines |
| `build` | Scaffold projects, generate code, debug errors, review architecture |
| `meta` | Server diagnostics, license info, module discovery |

## 29 Supported Engines

Godot | Unity | Unreal | MonoGame | Bevy | Phaser | GameMaker | Pygame | Love2D | Raylib | Defold | Construct | Ren'Py | RPG Maker | PixiJS | Three.js | Babylon.js | SFML | SDL3 | LibGDX | Stride | HaxeFlixel | Heaps | PlayCanvas | Excalibur | Macroquad | FNA | GDevelop | Kaplay

Depth varies by engine — MonoGame (131 docs), Godot (116), Unity (81), and Unreal (81) are the deepest modules; the smallest are compact starter references. Plus a **core module** with 52 engine-agnostic docs on design patterns, architecture, and programming fundamentals.

## Knowledge Base

957 curated markdown docs organized into 30 modules:

- **Game Design** — GDD templates, scope management, playtesting
- **Architecture** — ECS, state machines, event systems, scene composition
- **Programming** — Input handling, physics, pathfinding, save/load, networking
- **Engine Guides** — Per-engine implementation guides, reference sheets, best practices
- **Project Management** — Phase checklists, scope tracking, launch preparation

Every doc includes: typed code examples, "when to use" guidance, common pitfalls, and cross-engine comparisons where relevant.

## Why GameCodex?

| | GameCodex | Single-engine MCPs | Raw AI (no MCP) |
|---|---|---|---|
| Engines | 29 | 1 | 0 (training data only) |
| Docs | 950+ curated | Varies | None |
| Tools | 5 (lean schema) | 10-95+ (schema bloat) | N/A |
| Scope tracking | Yes | No | No |
| Privacy | stdio-only, no network | Varies | Cloud-dependent |
| Price | Free (MIT) | Varies | Varies |

## Configuration

| Variable | Description |
|----------|-------------|
| `GAMEDEV_MODULES` | Comma-separated module IDs to load (default: all) |

## Development

```bash
git clone https://github.com/sbenson2/GameCodex.git
cd GameCodex
npm install
npm run build
npm test          # 167 tests
npm run typecheck
```

## Monorepo Structure

```
GameCodex/
├── packages/
│   ├── server/    # MCP server (5 tools, 950+ docs, 29 engines)
│   └── site/      # Marketing site (Next.js)
├── package.json   # npm workspaces root
└── README.md
```

## Links

- [npm](https://www.npmjs.com/package/gamecodex)
- [GitHub](https://github.com/sbenson2/GameCodex) (canonical)
- [Issues](https://github.com/sbenson2/GameCodex/issues)
- [GitLab mirror](https://github.com/sbenson2/GameCodex)

## License

MIT
