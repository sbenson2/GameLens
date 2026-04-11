# GameCodex — Pricing

> Your AI forgets everything mid-project. Give it permanent game dev knowledge.

## Plans

### Free — $0/forever

The full knowledge base, no restrictions:

- **950+ docs** across all 29 engines — search, browse, and read everything
- `docs` tool — unlimited searches, full doc access, all modules
- `meta` tool — server diagnostics, module discovery, license info
- Genre lookup with starter checklists
- 52 core docs (design patterns, architecture, programming fundamentals)
- 905 engine-specific docs (MonoGame, Godot, Unity, Unreal, Bevy, and 24 more)

### Pro — $7/mo

Unlock the workflow tools that turn knowledge into action:

- **`project` tool** — goals, decisions, scope health, session workflows, project state
- **`design` tool** — GDD generation, phase checklists, launch prep, marketing, architecture patterns
- **`build` tool** — scaffold projects, generate code, asset pipeline, debug errors, review architecture
- All free tier features included
- New docs, engines, and improvements ship continuously
- Priority support via GitLab Issues

**Get Pro →** [gamecodex.lemonsqueezy.com](https://gamecodex.lemonsqueezy.com)

---

## Tier Comparison

| Feature | Free | Pro |
|---------|------|-----|
| `docs` — 950+ docs across 29 engines | Full | Full |
| `meta` — diagnostics, license management | Full | Full |
| `project` — goals, decisions, scope health | — | Full |
| `design` — GDD, phases, marketing, launch | — | Full |
| `build` — scaffold, code, debug, review | — | Full |

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
Yes. The free tier has no expiration and no daily limits. All 950+ docs across all 29 engines are always free.

**Do I need a license key to use the server?**
No. Without a key, the server runs in free tier automatically.

**What MCP clients are supported?**
Claude Code, Claude Desktop, Cursor, Windsurf, Cline, and any MCP-compatible tool.
