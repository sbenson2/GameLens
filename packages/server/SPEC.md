# GameCodex — Specification

## Overview

An MCP (Model Context Protocol) server that provides game development knowledge, structured dev session workflows, and engine-specific implementation guidance. Any AI coding tool (Claude Code, Cursor, Windsurf, etc.) can connect and get expert gamedev help.

## Architecture

### Modular Design

```
gamecodex/
├── src/
│   ├── index.ts                 # MCP server entry point
│   ├── server.ts                # Server setup, tool/resource registration
│   ├── core/                    # Engine-agnostic game dev knowledge
│   │   ├── docs/                # Generalized docs (game design, patterns, PM, etc.)
│   │   ├── session/             # Dev session co-pilot logic
│   │   └── search.ts            # Doc search engine
│   ├── modules/
│   │   └── monogame-arch/       # MonoGame + Arch ECS specific docs & tools
│   │       └── docs/            # Implementation-specific guides
│   └── tools/                   # MCP tool definitions
│       ├── search-docs.ts
│       ├── get-doc.ts
│       ├── list-docs.ts
│       ├── session.ts
│       └── genre-lookup.ts
├── docs/                        # All docs organized by module
│   ├── core/                    # Engine-agnostic docs
│   │   ├── game-design/         # E6, E7, C1, C2
│   │   ├── project-management/  # E4, E9, P0-P15
│   │   ├── programming/         # G11, G12, G14, G18
│   │   ├── ai-workflow/         # E5, CLAUDE_gamedev_rules (generalized)
│   │   └── concepts/            # Universal concepts extracted from guides
│   │       ├── camera-theory.md
│   │       ├── particles-theory.md
│   │       ├── pathfinding-theory.md
│   │       ├── scene-management-theory.md
│   │       ├── animation-theory.md
│   │       └── ... (theory portions of G guides)
│   └── monogame-arch/           # MonoGame + Arch ECS specific
│       ├── reference/           # R1-R3 (R4 goes to core)
│       ├── architecture/        # E1-E3
│       └── guides/              # G1-G63 (implementation portions)
├── package.json
├── tsconfig.json
└── README.md
```

### Module System

Each module (e.g. `monogame-arch`) contains:
- Engine-specific docs
- Additional tools (optional)
- Prompt fragments for system prompts

Future modules follow the same pattern: `godot/`, `unity/`, `bevy/`, etc.

## MCP Tools

### `search_docs`
Search across all docs (core + active modules).
- **Input**: `query` (string), `category` (optional: reference|explanation|guide|catalog|playbook|concept), `module` (optional: core|monogame-arch)
- **Output**: Matching doc snippets with IDs and relevance

### `get_doc`
Fetch a specific doc by ID.
- **Input**: `id` (string, e.g. "G52", "E6", "P0", "camera-theory")
- **Output**: Full doc content

### `list_docs`
Browse available docs.
- **Input**: `category` (optional), `module` (optional)
- **Output**: Doc list with IDs, titles, one-line descriptions

### `session`
Dev session co-pilot — structured workflows for game dev.
- **Input**: `action` (start|menu|plan|decide|feature|debug|scope|status)
- **Output**: Formatted session UI (dashboards, menus, step progress)
- Maintains session state across calls
- Engine-agnostic workflow, references docs from active modules

### `genre_lookup`
Quick genre → required systems mapping.
- **Input**: `genre` (string, e.g. "platformer", "roguelike", "metroidvania")
- **Output**: Required systems, recommended docs, starter checklist

## MCP Resources

### Doc Resources
All docs exposed as `gamedev://docs/{module}/{id}` resources:
- `gamedev://docs/core/E6` — Game Design Fundamentals
- `gamedev://docs/monogame-arch/G52` — Character Controller
- etc.

### Prompt Resources
- `gamedev://prompts/session` — Session co-pilot system prompt
- `gamedev://prompts/code-rules` — AI code generation rules (generalized)
- `gamedev://prompts/monogame-arch` — MonoGame + Arch ECS specific rules

## Doc Processing

When copying docs from the toolkit:

### Goes to `core/` (engine-agnostic):
- E4, E5, E6, E7, E9 — project management, design, AI workflow
- G11, G12, G14, G18 — programming principles, patterns, data structures
- C1, C2 — genre reference, game feel
- R4 — game design resources
- P0-P15 — all playbook docs
- CLAUDE_gamedev_rules — generalized (strip MonoGame-specific rules)
- **Theory portions** extracted from G guides (algorithm descriptions, design patterns, concepts that apply to any engine)

### Goes to `monogame-arch/` (engine-specific):
- E1, E2, E3 — architecture, Nez migration, alternatives
- R1, R2, R3 — library stack, capability matrix, project structure
- G1-G63 — implementation guides (the code-specific parts)

### Session Co-Pilot:
- Generalized from FireStarter's session skill
- References docs dynamically based on active modules
- Topic-to-doc table adapts per module
- Formatting templates and path definitions stay the same

## Tech Stack

- **TypeScript** with `@modelcontextprotocol/sdk`
- **Transport**: stdio (standard MCP transport)
- **Search**: Simple keyword/TF-IDF search (no external deps)
- **No database**: Docs loaded from filesystem at startup

## Installation (for users)

```bash
# npm
npx gamecodex

# Or add to claude_desktop_config.json / .cursor/mcp.json:
{
  "mcpServers": {
    "gamedev": {
      "command": "npx",
      "args": ["gamecodex"],
      "env": {
        "GAMEDEV_MODULES": "monogame-arch"  // comma-separated module list
      }
    }
  }
}
```

## Build & Dev

```bash
npm install
npm run build
npm run dev    # watch mode
npm test
```
