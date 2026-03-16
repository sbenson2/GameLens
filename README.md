# GameDev MCP Server

An MCP (Model Context Protocol) server that provides game development knowledge, structured dev session workflows, and engine-specific implementation guidance. Connect from any AI coding tool — Claude Code, Cursor, Windsurf, and more.

## Features

- **Doc Search** — TF-IDF search across all game dev docs (concepts, guides, references)
- **Session Co-Pilot** — Structured workflows: Plan, Decide, Feature, Debug, Scope
- **Genre Lookup** — Instant genre → required systems mapping with starter checklists
- **Modular Architecture** — Core engine-agnostic knowledge + engine-specific modules
- **No External Deps** — All search and logic built-in, no database required

## Available Modules

| Module | Description |
|--------|-------------|
| `core` | Engine-agnostic game dev knowledge — design, patterns, algorithms, project management |
| `monogame-arch` | MonoGame + Arch ECS implementation guides, architecture, library references |

Future modules: `godot`, `unity`, `bevy`, etc.

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_docs` | Search across all docs with optional category/module filters |
| `get_doc` | Fetch a specific doc by ID (e.g. `G52`, `camera-theory`) |
| `list_docs` | Browse available docs by category and module |
| `session` | Dev session co-pilot (start, plan, decide, feature, debug, scope) |
| `genre_lookup` | Genre → systems mapping (platformer, roguelike, metroidvania, etc.) |

## Installation

### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "gamedev": {
      "command": "node",
      "args": ["/path/to/gamedev-mcp-server/dist/index.js"],
      "env": {
        "GAMEDEV_MODULES": "monogame-arch"
      }
    }
  }
}
```

Or use npx (after publishing):

```json
{
  "mcpServers": {
    "gamedev": {
      "command": "npx",
      "args": ["gamedev-mcp-server"],
      "env": {
        "GAMEDEV_MODULES": "monogame-arch"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "gamedev": {
      "command": "node",
      "args": ["/path/to/gamedev-mcp-server/dist/index.js"],
      "env": {
        "GAMEDEV_MODULES": "monogame-arch"
      }
    }
  }
}
```

### Windsurf

Add to your Windsurf MCP config (`~/.windsurf/mcp.json`):

```json
{
  "mcpServers": {
    "gamedev": {
      "command": "node",
      "args": ["/path/to/gamedev-mcp-server/dist/index.js"],
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
      "command": "node",
      "args": ["/path/to/gamedev-mcp-server/dist/index.js"],
      "env": {
        "GAMEDEV_MODULES": "monogame-arch"
      }
    }
  }
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GAMEDEV_MODULES` | `monogame-arch` | Comma-separated list of active engine modules |

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
