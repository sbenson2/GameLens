# GameLens

[![CI](https://github.com/sbenson2/GameLens/actions/workflows/ci.yml/badge.svg)](https://github.com/sbenson2/GameLens/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/gamelens)](https://www.npmjs.com/package/gamelens)
[![npm downloads](https://img.shields.io/npm/dm/gamelens)](https://www.npmjs.com/package/gamelens)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**A game designer AI lens for programmers. One MCP tool.**

Your AI assistant writes competent game code and gives you zero design
judgment. It will implement a jump, a shop, or an entire crafting system
without ever asking whether it should exist, what it should feel like, or
which proven design thinking applies. GameLens gives your AI that judgment:
a single tool — `lens` — that answers as the game designer looking over your
shoulder.

> Works with **Claude Code**, **Claude Desktop**, **Cursor**, **Windsurf**,
> **Cline**, and any MCP-compatible tool.

## Quick start

```bash
claude mcp add gamelens -- npx -y gamelens
```

Or add to your MCP config file (`claude_desktop_config.json`,
`.cursor/mcp.json`, `~/.windsurf/mcp.json`, …):

```json
{
  "mcpServers": {
    "gamelens": { "command": "npx", "args": ["-y", "gamelens"] }
  }
}
```

## The one tool

```
lens { situation: "my jump feels floaty" }
```

returns the **Game Feel** lens (Steve Swink, 2008): the questions a designer
would ask right now ("how many frames between input and first visible
response — have you measured?"), red flags phrased in code terms ("input
handled in a fixed tick without interpolation", "jump is a single impulse
with default gravity"), and concrete prescriptions ("derive gravity from
jump height and time-to-apex: g = 2h/t², v0 = 2h/t; split rising/falling
gravity; add coyote time and input buffering").

| Call | Returns |
|------|---------|
| `lens { situation: "..." }` | Top matching lenses for what you're building, deciding, or struggling with — plus the matching knowledge-base docs |
| `lens { lens: "scope" }` | A specific lens by id |
| `lens { doc: "E6" }` | A knowledge-base doc — oversized docs return a table of contents |
| `lens { doc: "E6", section: "Pacing" }` | Just that section of the doc |
| `lens { }` | The catalog |

No action routing. Four optional strings. That's the entire API.

## The 15 lenses

Every lens distills an industry-proven philosophy — real, checkable
provenance, original distillations:

| Lens | Source | Reach for it when |
|------|--------|-------------------|
| `find-the-fun` | Mark Cerny — Method (D.I.C.E. 2002) | Starting anything; building systems before fun is proven |
| `mda` | Hunicke/LeBlanc/Zubek (2004) | A feature works as coded but the game feels wrong |
| `interesting-decisions` | Sid Meier (GDC 2012) | Everyone picks the same option; choices feel hollow |
| `game-feel` | Steve Swink (2008) | Floaty, sluggish, unresponsive, slippery |
| `juice` | Jonasson & Purho (2012); Nijman (2013) | Combat "lacks impact"; actions go unacknowledged |
| `flow-difficulty` | Csikszentmihalyi (1990); Celeste Assist Mode (2018) | Players quit; too hard/too easy arguments |
| `onboarding` | George Fan (GDC 2012); Nintendo | New players are confused; tutorial walls of text |
| `kishotenketsu` | Koichi Hayashida (GDC 2012) | Levels feel like filler; no per-level identity |
| `core-loop` | Dormans (2012); session-design craft | "What do players actually do?"; retention questions |
| `scope` | Derek Yu — Finishing a Game (2010) | "Should I add X?"; the project keeps growing |
| `playtesting` | Valve culture; RITE (2002) | Months of dev, zero external eyes |
| `player-motivation` | SDT (Ryan/Rigby 2006); Bartle; Quantic Foundry | "Who is this for?"; retention mechanics debates |
| `balance` | Sirlin; Schreiber | Overpowered options; economies that inflate |
| `theory-of-fun` | Raph Koster (2004) | "It gets old fast"; depth vs. complexity |
| `emergence` | BotW (GDC 2017); immersive sims | Special-cased interactions; content treadmill |

## The knowledge base works within the lens

A small, curated library of game-design docs — genre reference, game feel
craft, design fundamentals, emergent and puzzle design, level design,
postmortem shipping lessons, difficulty & accessibility, and maps of the
best free design resources — is reachable through the same one tool:

- every `situation` reply ends with **From the knowledge base** — the top
  matching docs with ids
- `doc: "<id>"` reads one; docs over 25KB return their table of contents so
  you fetch just the `section` you need instead of flooding context

The docs also ship as passive **MCP resources** at `gamelens://docs/{id}`
for clients that browse resources.

## What makes this different

- **Judgment, not integration.** Godot-MCP and Unity-MCP give your AI buttons
  to press in the editor; Context7 gives it API docs. GameLens gives it
  *design thinking* — the layer none of them touch. They compose well.
- **Design philosophy only.** No engine docs, no API reference, no
  implementation guides — that's someone else's job, done well elsewhere.
  Everything in this package is about what to build and how it should feel.
- **One tool.** No 50K-token schema dump. The entire tool surface is four
  optional strings.
- **Real provenance.** Every lens cites its source — the talks, books, and
  papers the industry actually runs on. No invented frameworks.
- **Secure by design.** stdio-only transport — no network, no open ports.
  Analytics are local JSON files (`~/.gamelens/analytics/`), never uploaded.

## Development

```bash
git clone https://github.com/sbenson2/GameLens.git
cd GameLens
npm install
npm run build
npm test
```

Runtime dependencies: `@modelcontextprotocol/sdk` and `zod`. Nothing else.

See [SPEC.md](./SPEC.md) for the v3 architecture and lens content rules, and
[SECURITY.md](./SECURITY.md) for the security policy.

**Upgrading from gamecodex:** GameLens 3.0.0 is the rename of `gamecodex`
and removes the 29-engine documentation modules (`GAMEDEV_MODULES` is gone —
there is nothing to scope). If you want the engine knowledge base, stay on
`gamecodex@2.0.1`, its final release.

## Contributing

Found a bug, a provenance error, or a doc correction?
[Open an issue](https://github.com/sbenson2/GameLens/issues).
New lenses are welcome if they meet the content rules in SPEC.md: real,
checkable provenance; original distillation; red flags in programmer terms.

## License

MIT — see [LICENSE](./LICENSE).

---

**Built for programmers who want their AI to think like a designer.**
