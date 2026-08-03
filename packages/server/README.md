# GameCodex

[![CI](https://github.com/sbenson2/GameCodex/actions/workflows/ci.yml/badge.svg)](https://github.com/sbenson2/GameCodex/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/gamecodex)](https://www.npmjs.com/package/gamecodex)
[![npm downloads](https://img.shields.io/npm/dm/gamecodex)](https://www.npmjs.com/package/gamecodex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**A game designer AI lens for programmers. One MCP tool.**

Your AI assistant writes competent game code and gives you zero design
judgment. It will implement a jump, a shop, or an entire crafting system
without ever asking whether it should exist, what it should feel like, or
which proven design thinking applies. GameCodex gives your AI that judgment:
a single tool — `lens` — that answers as the game designer looking over your
shoulder.

> Works with **Claude Code**, **Claude Desktop**, **Cursor**, **Windsurf**,
> **Cline**, and any MCP-compatible tool.

## Quick start

```bash
claude mcp add gamecodex -- npx -y gamecodex
```

Or add to your MCP config file (`claude_desktop_config.json`,
`.cursor/mcp.json`, `~/.windsurf/mcp.json`, …):

```json
{
  "mcpServers": {
    "gamecodex": { "command": "npx", "args": ["-y", "gamecodex"] }
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
| `lens { doc: "G106" }` | A knowledge-base doc — oversized docs return a table of contents |
| `lens { doc: "G106", section: "Jitter" }` | Just that section of the doc |
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

The 957-doc engine library (29 engines — deepest on MonoGame 131, Godot 116,
Unity 81, Unreal 81; every doc purpose-written for AI consumption, drafted
with AI assistance under human editorial direction) is reachable through the
same one tool:

- every `situation` reply ends with **From the knowledge base** — the top
  matching docs with ids
- `doc: "<id>"` reads one; docs over 25KB return their table of contents so
  you fetch just the `section` you need instead of flooding context

The docs also ship as passive **MCP resources** at
`gamedev://docs/{module}/{id}` for clients that browse resources.

Scope which modules load:

```json
{ "env": { "GAMEDEV_MODULES": "core,godot-arch" } }
```

Without `GAMEDEV_MODULES`, all modules load.

## What makes this different

- **Judgment, not integration.** Godot-MCP and Unity-MCP give your AI buttons
  to press in the editor; Context7 gives it API docs. GameCodex gives it
  *design thinking* — the layer none of them touch. They compose well.
- **One tool.** No 50K-token schema dump. The entire tool surface is two
  optional strings.
- **Real provenance.** Every lens cites its source — the talks, books, and
  papers the industry actually runs on. No invented frameworks.
- **Secure by design.** stdio-only transport — no network, no open ports.
  Analytics are local JSON files (`~/.gamecodex/analytics/`), never uploaded.

## Development

```bash
git clone https://github.com/sbenson2/GameCodex.git
cd GameCodex
npm install
npm run build
npm test
```

Runtime dependencies: `@modelcontextprotocol/sdk` and `zod`. Nothing else.

See [SPEC.md](./SPEC.md) for the v2 architecture and lens content rules, and
[SECURITY.md](./SECURITY.md) for the security policy.

**Upgrading from 1.x:** v2.0.0 removed the project/design/docs/build/meta
tools — the lens is the product now. `gamecodex@1.0.1` is the final release
of the old five-tool surface if you depend on it.

## Contributing

Found a bug, a provenance error, or a doc correction?
[Open an issue](https://github.com/sbenson2/GameCodex/issues).
New lenses are welcome if they meet the content rules in SPEC.md: real,
checkable provenance; original distillation; red flags in programmer terms.

## License

MIT — see [LICENSE](./LICENSE).

---

**Built for programmers who want their AI to think like a designer.**
