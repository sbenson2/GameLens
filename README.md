# GameDev MCP Server

[![CI](https://github.com/sbenson2/gamedev-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/sbenson2/gamedev-mcp-server/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/gamedev-mcp-server)](https://www.npmjs.com/package/gamedev-mcp-server)
[![Node.js](https://img.shields.io/node/v/gamedev-mcp-server)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Give your AI permanent game development knowledge. No more context loss mid-project.

An MCP (Model Context Protocol) server that provides 120+ curated game dev docs, structured session workflows, and engine-specific implementation guidance. Works with Claude Code, Claude Desktop, Cursor, Windsurf, and any MCP-compatible tool.

## Quick Start

```bash
npm install -g gamedev-mcp-server
```

Or use directly with npx — no install needed.

### Claude Code / Cursor / Windsurf

Add to your MCP config (`.mcp.json`, `.cursor/mcp.json`, or `~/.windsurf/mcp.json`):

```json
{
  "mcpServers": {
    "gamedev": {
      "command": "npx",
      "args": ["-y", "gamedev-mcp-server"],
      "env": {
        "GAMEDEV_MODULES": "monogame-arch"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gamedev": {
      "command": "npx",
      "args": ["-y", "gamedev-mcp-server"],
      "env": {
        "GAMEDEV_MODULES": "monogame-arch"
      }
    }
  }
}
```

## Features

- **120+ Docs** — Curated game dev knowledge: design, patterns, algorithms, implementation guides
- **Doc Search** — TF-IDF search across all docs (concepts, guides, references)
- **Session Co-Pilot** — Structured workflows: Plan, Decide, Feature, Debug, Scope
- **Genre Lookup** — Instant genre → required systems mapping with starter checklists
- **Modular Architecture** — Core engine-agnostic knowledge + engine-specific modules
- **Zero External Deps** — All search and logic built-in, no database required

## Available Modules

| Module | Description |
|--------|-------------|
| `core` | Engine-agnostic game dev knowledge — design, patterns, algorithms, project management |
| `monogame-arch` | MonoGame + Arch ECS implementation guides, architecture, library references |

Future modules: `godot`, `unity`, `bevy`, etc.

## MCP Tools

| Tool | Free | Pro | Description |
|------|------|-----|-------------|
| `list_docs` | ✅ | ✅ | Browse available docs by category and module |
| `search_docs` | Core only | All modules | Search across docs with optional category/module filters |
| `get_doc` | Core only | All modules | Fetch a specific doc by ID (e.g. `G52`, `camera-theory`) |
| `session` | — | ✅ | Dev session co-pilot (start, plan, decide, feature, debug, scope) |
| `genre_lookup` | Limited | Full | Genre → systems mapping (platformer, roguelike, metroidvania, etc.) |
| `license_info` | ✅ | ✅ | Show current tier, unlocked features, and upgrade URL |

### Free vs Pro

The server works out of the box with a generous free tier — all core (engine-agnostic) docs, search, and genre lookups are free. **Pro** unlocks engine-specific modules (MonoGame, Godot, etc.), the session co-pilot, and full genre details.

Get a Pro license at [gamedev-mcp.lemonsqueezy.com](https://gamedev-mcp.lemonsqueezy.com).

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GAMEDEV_MODULES` | `monogame-arch` | Comma-separated list of active engine modules |
| `GAMEDEV_MCP_LICENSE` | — | Pro license key (from [gamedev-mcp.lemonsqueezy.com](https://gamedev-mcp.lemonsqueezy.com)) |
| `GAMEDEV_MCP_DEV` | — | Set to `true` to skip license validation (local dev only) |

### License Key Setup

**Option 1:** Set the `GAMEDEV_MCP_LICENSE` env var in your MCP config:

```json
{
  "mcpServers": {
    "gamedev": {
      "command": "npx",
      "args": ["gamedev-mcp-server"],
      "env": {
        "GAMEDEV_MODULES": "monogame-arch",
        "GAMEDEV_MCP_LICENSE": "your-license-key"
      }
    }
  }
}
```

**Option 2:** Create a config file at `~/.gamedev-mcp/license.json`:

```json
{
  "key": "your-license-key"
}
```

The server validates the key against LemonSqueezy on startup and caches the result for 24 hours. If offline, a cached validation within 7 days is accepted. Without a valid key, the server runs in free tier (it never crashes).

See [PRICING.md](./PRICING.md) for a full tier comparison.

### Module Selection

Set `GAMEDEV_MODULES` to control which engine-specific docs are loaded:

```bash
# MonoGame + Arch ECS only (default)
GAMEDEV_MODULES=monogame-arch

# Core only (no engine-specific docs)
GAMEDEV_MODULES=

# Multiple modules (future)
GAMEDEV_MODULES=monogame-arch,godot
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
node dist/index.js

# Watch mode
npm run dev
```

## Doc Structure

```
docs/
├── core/                    # Engine-agnostic
│   ├── game-design/         # Design fundamentals, genres, game feel
│   ├── project-management/  # Sprints, scope, playbooks
│   ├── programming/         # Patterns, principles, data structures
│   ├── ai-workflow/         # AI code generation rules
│   ├── concepts/            # Universal theory (camera, physics, pathfinding, etc.)
│   └── session/             # Session co-pilot prompts
└── monogame-arch/           # MonoGame + Arch ECS
    ├── reference/           # Library stack, capabilities, project structure
    ├── architecture/        # Architecture overview, migration notes
    └── guides/              # G1-G63 implementation guides
```

## MCP Resources

The server also exposes docs as MCP resources:

- `gamedev://docs/core/{id}` — Core docs
- `gamedev://docs/monogame-arch/{id}` — MonoGame docs
- `gamedev://prompts/session` — Session co-pilot prompt
- `gamedev://prompts/code-rules` — AI code generation rules
- `gamedev://prompts/monogame-arch` — MonoGame-specific rules

## Landing Page

View the project landing page at [sbenson2.github.io/gamedev-mcp-server](https://sbenson2.github.io/gamedev-mcp-server/) — or run it locally from the `site/` directory.

## License

MIT
