# GameCodex — Pricing

> Your AI forgets everything mid-project. Give it permanent game dev knowledge.

## Plans

### Free — $0/forever

Everything you need to evaluate and use core game dev knowledge:

- **Unlimited** searches and doc fetches within the core module
- Full access to `list_docs`, `search_docs`, `get_doc` (core module)
- Genre lookup with starter checklists
- 18+ concept theory docs (camera, physics, pathfinding, networking, etc.)
- Debug guide, starter code generation, project scaffolding, and more

### Pro — $5/mo

Unlock everything. New docs, engines, and improvements ship continuously:

- **All modules** — MonoGame + Arch ECS, Godot (growing), Unity (coming), Bevy (planned)
- **150+ docs** and growing weekly — implementation guides, architecture deep-dives, system references
- **Session co-pilot** — structured workflows for planning, debugging, feature design, scope management
- **Full genre lookup** — complete system mappings with recommended doc references
- **Architecture review** — project structure analysis with engine-specific checks
- **Engine comparison & migration** — cross-engine topic comparison and migration guidance
- Priority support via GitLab Issues

**Get Pro →** [gamecodex.lemonsqueezy.com](https://gamecodex.lemonsqueezy.com)

---

## Tier Comparison

| Feature | Free | Pro |
|---------|------|-----|
| `list_docs` | All modules | All modules |
| `search_docs` | Core only | All modules |
| `get_doc` | Core only | All modules |
| `session` (co-pilot) | — | Full access |
| `compare_engines` | — | Full access |
| `migration_guide` | — | Full access |
| `review_architecture` | — | Full access |
| `genre_lookup` | Genre + checklist | Full system mappings + doc refs |
| `explain_concept` | Core docs | All modules |
| `teach` | Core paths | All paths |
| Core docs (design, patterns, concepts) | 52 docs | 52 docs |
| MonoGame + Arch ECS module | — | 79+ guides |
| Godot module | — | 16+ guides (growing) |
| Future engine modules | — | Included |

## Setting Up Your License

The easiest way:

```bash
gamecodex setup
```

This walks you through activation interactively.

### Alternative: Environment Variable

```json
{
  "mcpServers": {
    "gamedev": {
      "command": "npx",
      "args": ["-y", "gamecodex"],
      "env": {
        "GAMECODEX_LICENSE": "your-license-key"
      }
    }
  }
}
```

### How Validation Works

- Key is validated against LemonSqueezy on first use
- Result is cached for 24 hours (no repeated API calls)
- If offline, cached validation is trusted for up to 7 days
- Invalid or missing key = free tier (server never crashes)

## FAQ

**Can I use the free tier forever?**
Yes. The free tier has no expiration and no daily limits. Core docs (engine-agnostic game dev knowledge) are always free.

**Do I need a license key to use the server?**
No. Without a key, the server runs in free tier automatically.

**What MCP clients are supported?**
Claude Code, Claude Desktop, Cursor, Windsurf, and any MCP-compatible tool.
