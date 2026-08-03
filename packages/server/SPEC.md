# GameCodex v2 — Specification

**One sentence:** GameCodex is a game designer AI lens for programmers — a single-tool
MCP server that lets any AI coding assistant apply industry-proven game design
judgment while its user builds.

## The product

Programmers using AI assistants get competent *code* help and almost no *design*
help: the assistant will happily implement a jump, a shop, or a crafting system
without ever asking whether it should exist, what it should feel like, or which
proven design thinking applies. GameCodex fills exactly that gap, and only that
gap.

- **One tool: `lens`.** The whole tool surface. No action routing, two optional
  string parameters.
- **The knowledge base rides along as MCP resources** (`gamedev://docs/...`) —
  zero tool-schema cost; clients that support resources can browse 957 curated
  engine/architecture docs.

## The `lens` tool

| Input | Behavior |
|-------|----------|
| `situation` | Free-text description of what the user is building/deciding/struggling with → top 3 matched lenses, rendered in full |
| `lens` | A lens id or name → that lens rendered in full (plus up to 2 related if `situation` also given) |
| *(neither)* | The catalog: every lens with one-liner and phase tags |

Matching is deterministic keyword/phrase scoring (`src/core/lenses.ts:matchLenses`)
— the calling model supplies semantic understanding; the tool's job is to surface
the right 2-4 candidates with their full content. Unknown lens names return
`isError: true` plus the valid id list.

## The lens library (`src/core/lenses.ts`)

15 lenses, each distilling one checkable, industry-proven philosophy:

| id | Source |
|----|--------|
| `find-the-fun` | Mark Cerny — Method (D.I.C.E. 2002) |
| `mda` | Hunicke/LeBlanc/Zubek — MDA (2004) |
| `interesting-decisions` | Sid Meier (GDC 2012) |
| `game-feel` | Steve Swink — Game Feel (2008) |
| `juice` | Jonasson & Purho (2012); Nijman (2013) |
| `flow-difficulty` | Csikszentmihalyi (1990); Chen (2006); Celeste Assist Mode (2018) |
| `onboarding` | George Fan (GDC 2012); Nintendo level grammar |
| `kishotenketsu` | Koichi Hayashida (GDC 2012) |
| `core-loop` | Dormans — Game Mechanics (2012); session-design craft |
| `scope` | Derek Yu — Finishing a Game (2010) |
| `playtesting` | Valve postmortem culture; RITE (Medlock/Wixon 2002) |
| `player-motivation` | Ryan/Rigby/Przybylski SDT (2006); Bartle (1996); Quantic Foundry |
| `balance` | Sirlin; Schreiber — Game Balance |
| `theory-of-fun` | Raph Koster (2004) |
| `emergence` | BotW GDC 2017; immersive-sim tradition |

Each `Lens` carries: `oneLiner`, `provenance`, `philosophy` (the distilled idea,
±150 words), `questions` (≥5, what a designer would ask now), `redFlags` (≥4,
phrased in code/backlog terms), `prescriptions` (≥4 concrete moves), `phases`,
`keywords` (matching vocabulary), `furtherReading`. Enforced by `lens.test.ts`.

**Content rules:** real, checkable provenance only; original distillations
(never reproduce source text or Schell's lens list); red flags must be written
for programmers ("input handled in a fixed tick without interpolation"), not
designers ("bad game feel").

## Architecture

```
index.ts          CLI: default = serve; init = write MCP config; status
server.ts         createServer(): discover modules → load docs → register lens
                  → wire resources → stdio transport
tool-registry.ts  concurrency cap (8) → handler → analytics → isError mapping
tool-definition.ts GameCodexToolDef/ToolResult/ToolDependencies (slim)
core/lenses.ts    the lens data + matchLenses/findLens (pure, tested)
tools/lens.ts     the one tool: rendering + param handling
core/docs.ts      DocStore for the resource-served knowledge base
core/modules.ts   module auto-discovery + GAMEDEV_MODULES filtering
analytics.ts      local-only daily aggregates (~/.gamecodex/analytics/)
cli/              init/detect: auto-write MCP config for detected AI tools
```

Runtime deps: `@modelcontextprotocol/sdk`, `zod`. Nothing else.

## Non-goals (v2)

- No editor integration (Godot-MCP/Unity-MCP own that; complementary)
- No docs search tool (Context7 owns generic docs-on-demand; our KB is resources)
- No project state, scope tracker, personality, sessions, GDD generation
  (removed in v2 — the 1.0.x line has them; git history preserves them)
- No network, no accounts, no telemetry upload — stdio only, analytics local

## Versioning note

v2.0.0 is a breaking release: the 5-tool surface (project/design/docs/build/meta)
is removed. 1.0.1 is the final release of that surface.
