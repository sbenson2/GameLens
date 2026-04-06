# GameCodex

AI game dev co-pilot. An MCP server with 150+ curated docs and 22 tools for MonoGame, Godot, and Phaser.

GameCodex connects to any AI assistant that supports the [Model Context Protocol](https://modelcontextprotocol.io) — Claude Desktop, Claude Code, Cursor, Windsurf, Continue.dev, and more.

## Install

### Option A: npm (when published)

```bash
npx gamecodex
```

### Option B: From source

```bash
git clone <repo-url> GameCodex
cd GameCodex
npm install
npm run build
```

Then run the server directly:

```bash
node packages/server/dist/index.js
```

Or link it globally:

```bash
cd packages/server
npm link
gamecodex  # now available as a command
```

### Option C: Tarball

```bash
cd packages/server
npm run build
npm pack
# Creates gamecodex-server-2.1.0.tgz

# Install anywhere:
npm install -g ./gamecodex-server-2.1.0.tgz
```

## Connect to Your AI Assistant

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "gamecodex": {
      "command": "node",
      "args": ["/absolute/path/to/GameCodex/packages/server/dist/index.js"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add gamecodex -- node /absolute/path/to/GameCodex/packages/server/dist/index.js
```

### Cursor / Windsurf / Continue.dev

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "gamecodex": {
      "command": "node",
      "args": ["/absolute/path/to/GameCodex/packages/server/dist/index.js"]
    }
  }
}
```

## Tools (22)

### Search and Documentation
| Tool | Description |
|------|-------------|
| `search_docs` | Search 150+ docs by keyword with cross-engine grouping |
| `get_doc` | Fetch a doc by ID with section extraction |
| `list_docs` | Browse docs by category and module |
| `list_modules` | List available engine modules |
| `random_doc` | Discover a random doc |
| `compare_engines` | Compare how engines handle the same topic |
| `migration_guide` | Engine migration guidance with concept mappings |

### Learning
| Tool | Description |
|------|-------------|
| `explain_concept` | Teach any concept at your skill level |
| `teach` | Interactive learning paths with exercises |
| `debug_guide` | Error/symptom diagnosis with engine-specific tips |

### Code Generation
| Tool | Description |
|------|-------------|
| `scaffold_project` | Generate project structure and starter files |
| `generate_gdd` | Create a game design document from a description |
| `generate_starter` | Feature-specific starter code (movement, combat, inventory, etc.) |

### Project Management
| Tool | Description |
|------|-------------|
| `session` | Dev session co-pilot for planning and decisions |
| `project_context` | Per-project context tracking |
| `memory` | Persistent project memory across sessions |
| `review_architecture` | Analyze project structure with engine-specific checks |
| `phase_checklist` | Project phase tracker with engine/genre-aware checklists |
| `asset_guide` | Asset pipeline guide (naming, export, import, gotchas) |

### System
| Tool | Description |
|------|-------------|
| `diagnostics` | Server health and stats |
| `license_info` | License tier and usage info |

## Supported Engines

- **MonoGame + Arch ECS** — 80 docs covering architecture, guides, and reference
- **Godot 4.4** — 18 docs covering scene composition, signals, physics, UI, and more
- **Phaser 3** — Supported via core concepts and starter code generation

## Knowledge Base

150+ curated markdown docs organized into modules:

- **Core** (52 docs) — Engine-agnostic concepts, design patterns, project management
- **MonoGame-Arch** (80 docs) — MonoGame + Arch ECS implementation guides
- **Godot-Arch** (18 docs) — Godot 4.x architecture and implementation guides

## Configuration

| Environment Variable | Description |
|---------------------|-------------|
| `GAMEDEV_MODULES` | Comma-separated module IDs to load (default: all) |
| `GAMECODEX_LICENSE` | Pro license key (enables all modules and tools) |
| `GAMECODEX_ANALYTICS` | Set to `false` to disable local analytics |

## Development

```bash
npm install          # install all workspace deps
npm run build        # build server
npm run typecheck    # type-check without emitting
npm run dev          # watch mode
npm test             # run tests (in packages/server)
```

## Monorepo Structure

```
GameCodex/
├── packages/
│   ├── server/    # MCP server (22 tools, 150+ docs)
│   └── site/      # Marketing site (Next.js)
├── package.json   # npm workspaces root
└── README.md
```

## License

MIT
