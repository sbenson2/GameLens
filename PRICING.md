# GameDev MCP Server — Pricing

## Tier Comparison

| Feature | Free | Pro |
|---------|------|-----|
| **list_docs** | All modules | All modules |
| **search_docs** | Core module only | All modules |
| **get_doc** | Core module only | All modules |
| **session** (co-pilot) | — | Full access |
| **genre_lookup** | Genre name + checklist | Full system mappings + recommended docs |
| **license_info** | Available | Available |
| **Core docs** (design, patterns, concepts) | Included | Included |
| **MonoGame + Arch ECS module** | — | Included |
| **Future premium modules** | — | Included |
| **Priority support** | — | Included |

## Free Tier

Get started with engine-agnostic game dev knowledge at no cost:

- Browse and search core docs (game design, patterns, algorithms, project management)
- Genre lookup with starter checklists
- Access all concept theory docs (camera, physics, pathfinding, etc.)

## Pro Tier

Unlock the full power of the GameDev MCP Server:

- Search and access docs across **all** modules (MonoGame + Arch ECS, future engines)
- Full **session co-pilot** — structured workflows for planning, debugging, feature design
- Complete **genre lookup** with system mappings and recommended doc references
- Access to all future premium modules and updates

**Get Pro:** [gamedev-mcp.lemonsqueezy.com](https://gamedev-mcp.lemonsqueezy.com)

## Setting Up Your License

### Option 1: Environment Variable

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

### Option 2: Config File

Create `~/.gamedev-mcp/license.json`:

```json
{
  "key": "your-license-key"
}
```
