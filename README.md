# GameLens

**A game designer AI lens for programmers.**

Your AI assistant writes competent game code and gives you zero design judgment.
It will implement a jump, a shop, or a crafting system without ever asking
whether it should exist, what it should feel like, or which proven design
thinking applies. GameLens fixes exactly that: **one MCP tool — `lens` —**
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
claude mcp add gamelens -- npx -y gamelens
```

Or in any MCP config (`claude_desktop_config.json`, `.cursor/mcp.json`, …):

```json
{
  "mcpServers": {
    "gamelens": { "command": "npx", "args": ["-y", "gamelens"] }
  }
}
```

## One tool — the whole game

| Call | Returns |
|------|---------|
| `lens { situation: "players quit at the first boss" }` | The matching lenses (here: flow & difficulty, playtesting) — designer questions, red flags, prescriptions — **plus matching docs from the knowledge base** |
| `lens { lens: "scope" }` | One named lens in full |
| `lens { doc: "E6" }` | A knowledge-base doc (big ones return a table of contents; add `section: "…"` for one part) |
| `lens { }` | The catalog of all 15 lenses |

That's the entire tool surface. No schema bloat, no action routing.

## Design philosophy only

The knowledge base is a small, curated library of game-design docs — genre
reference, game feel craft, design fundamentals, level design, postmortem
lessons, difficulty & accessibility — reachable through the same tool: every
`situation` reply ends with the matching docs, and `doc`/`section` reads them.
The docs also ship as passive **MCP resources** (`gamelens://docs/...`).

No engine documentation. Engine API freshness is Context7's job; editor
integration is Godot-MCP's and Unity-MCP's. GameLens is the design-judgment
layer none of them touch — they compose well. (GameLens 2.x, published as
`gamecodex`, bundled a 957-doc engine library; v3 removed it.)

## Monorepo

```
GameLens/
├── packages/
│   ├── server/    <- the MCP server (the product) — see its README + SPEC.md
│   └── site/      <- marketing site (stale; predates the lens direction)
└── package.json   <- npm workspaces root
```

```bash
npm install && npm run build && npm test
```

## Links

- [npm](https://www.npmjs.com/package/gamelens)
- [GitHub](https://github.com/sbenson2/GameLens) (canonical)
- [Issues](https://github.com/sbenson2/GameLens/issues)
- [GitLab mirror](https://github.com/sbenson2/GameLens)

## License

MIT
