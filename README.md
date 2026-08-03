# GameCodex

**A game designer AI lens for programmers.**

Your AI assistant writes competent game code and gives you zero design judgment.
It will implement a jump, a shop, or a crafting system without ever asking
whether it should exist, what it should feel like, or which proven design
thinking applies. GameCodex fixes exactly that: **one MCP tool — `lens` —**
that answers as the game designer looking over your shoulder.

```
you (or your AI): lens { situation: "my jump feels floaty" }

              → Game Feel (Steve Swink): measure input-to-photon latency;
                derive gravity from jump height + time-to-apex; split
                rising/falling gravity; the questions, red flags in code
                terms, and concrete fixes.
```

Every lens distills an industry-proven philosophy with real provenance —
Mark Cerny's Method, MDA, Sid Meier's interesting decisions, Swink's game feel,
juice, flow & difficulty (incl. Celeste's assist thinking), George Fan's
onboarding rules, Nintendo's kishōtenketsu, core loops, Derek Yu on finishing,
Valve-style playtesting, Self-Determination Theory, Sirlin/Schreiber balance,
Koster's theory of fun, and BotW-style emergence.

## Install

```bash
claude mcp add gamecodex -- npx -y gamecodex
```

Or in any MCP config (`claude_desktop_config.json`, `.cursor/mcp.json`, …):

```json
{
  "mcpServers": {
    "gamecodex": { "command": "npx", "args": ["-y", "gamecodex"] }
  }
}
```

## One tool

| Call | Returns |
|------|---------|
| `lens { situation: "players quit at the first boss" }` | The matching lenses (here: flow & difficulty, playtesting) — designer questions, red flags, prescriptions |
| `lens { lens: "scope" }` | One named lens in full |
| `lens { }` | The catalog of all 15 lenses |

That's the entire tool surface. No schema bloat, no action routing.

## The knowledge base rides along

The 957-doc engine library (29 engines — deepest on MonoGame, Godot, Unity,
Unreal) ships as passive **MCP resources** (`gamedev://docs/...`): zero tool
cost, browsable from clients that support resources. Scope which modules load
with `GAMEDEV_MODULES` (e.g. `core,godot-arch`).

## Monorepo

```
GameCodex/
├── packages/
│   ├── server/    <- the MCP server (the product) — see its README + SPEC.md
│   └── site/      <- marketing site (stale; predates the lens direction)
└── package.json   <- npm workspaces root
```

```bash
npm install && npm run build && npm test
```

## Links

- [npm](https://www.npmjs.com/package/gamecodex)
- [GitHub](https://github.com/sbenson2/GameCodex) (canonical)
- [Issues](https://github.com/sbenson2/GameCodex/issues)
- [GitLab mirror](https://github.com/sbenson2/GameCodex)

## License

MIT
