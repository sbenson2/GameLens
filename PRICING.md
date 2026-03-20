# GameDev MCP Server — Pricing

> Your AI forgets everything mid-project. Give it permanent game dev knowledge.

## Plans

### Free — $0/forever

Everything you need to evaluate and use core game dev knowledge:

- **50 searches/day** across core engine-agnostic docs
- **30 doc fetches/day** from the core module
- Full access to `list_docs`, `search_docs`, `get_doc` (core module)
- Genre lookup with starter checklists
- 18+ concept theory docs (camera, physics, pathfinding, networking, etc.)
- Resets daily at midnight — no credit system, no expiration tricks

### Pro — $9/mo or $79/yr (save 27%)

Unlock everything. New docs, engines, and improvements ship continuously:

- **Unlimited** searches and doc fetches
- **All modules** — MonoGame + Arch ECS, Godot (growing), Unity (coming), Bevy (planned)
- **130+ docs** and growing weekly — implementation guides, architecture deep-dives, system references
- **Session co-pilot** — structured workflows for planning, debugging, feature design, scope management
- **Full genre lookup** — complete system mappings with recommended doc references
- **Section extraction** — pull specific sections from large docs to keep context windows efficient
- Priority support via GitHub Issues

**Get Pro →** [gamedev-mcp.lemonsqueezy.com](https://gamedev-mcp.lemonsqueezy.com)

---

## Tier Comparison

| Feature | Free | Pro |
|---------|------|-----|
| `list_docs` | ✅ All modules | ✅ All modules |
| `search_docs` | Core only, 50/day | All modules, unlimited |
| `get_doc` | Core only, 30/day | All modules, unlimited |
| `session` (co-pilot) | — | ✅ Full access |
| `genre_lookup` | Genre + checklist | Full system mappings + doc refs |
| `license_info` | ✅ | ✅ |
| Core docs (design, patterns, concepts) | ✅ 18+ docs | ✅ 18+ docs |
| MonoGame + Arch ECS module | — | ✅ 67+ guides |
| Godot module | — | ✅ 5+ guides (growing) |
| Future engine modules | — | ✅ Included |
| Section extraction (`section` param) | — | ✅ |

## Setting Up Your License

### Option 1: Environment Variable

```json
{
  "mcpServers": {
    "gamedev": {
      "command": "npx",
      "args": ["-y", "gamedev-mcp-server"],
      "env": {
        "GAMEDEV_MODULES": "monogame-arch",
        "GAMEDEV_MCP_LICENSE": "your-license-key"
      }
    }
  }
}
```

### Option 2: Config File

Create `~/.gamedev-mcp/license.json`:

```json
{
  "key": "your-license-key"
}
```

### How Validation Works

- Key is validated against LemonSqueezy on first use
- Result is cached for 24 hours (no repeated API calls)
- If offline, cached validation is trusted for up to 7 days
- Invalid or missing key = free tier (server never crashes)
- Daily usage counters reset at midnight local time

## FAQ

**Can I use the free tier forever?**
Yes. The free tier has no expiration. Core docs (engine-agnostic game dev knowledge) are always free.

**What happens when I hit the daily limit?**
You get a clear message with your limit and reset time. Upgrade to Pro for unlimited access.

**Do I need a license key to use the server?**
No. Without a key, the server runs in free tier automatically.

**Can I switch between monthly and annual?**
Yes, manage your subscription at [gamedev-mcp.lemonsqueezy.com](https://gamedev-mcp.lemonsqueezy.com).

**What MCP clients are supported?**
Claude Code, Claude Desktop, Cursor, Windsurf, and any MCP-compatible tool.
