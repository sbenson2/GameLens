# GameLens v3 — Specification

**One sentence:** GameLens is a game designer AI lens for programmers — a single-tool
MCP server that lets any AI coding assistant apply industry-proven game design
judgment while its user builds.

## The product

Programmers using AI assistants get competent *code* help and almost no *design*
help: the assistant will happily implement a jump, a shop, or a crafting system
without ever asking whether it should exist, what it should feel like, or which
proven design thinking applies. GameLens fills exactly that gap, and only that
gap.

- **One tool: `lens`.** The whole tool surface — and the one door to
  everything, including the design knowledge base. Four optional string
  parameters, no action routing.
- **Design philosophy only.** No engine documentation, no implementation
  guides. Engine docs pulled the product toward being a worse Context7;
  v3 removed them (they live in the 2.x tags). What remains is the thing
  nothing else provides: design judgment.
- **The knowledge base works within the lens**: `situation` text is also
  searched against the design doc library (matching docs are appended to
  every reply), and `doc` (+ optional `section`) reads one. The same docs
  additionally ship as passive MCP resources (`gamelens://docs/...`) for
  clients that browse resources.

## The `lens` tool

| Input | Behavior |
|-------|----------|
| `situation` | Free-text description of what the user is building/deciding/struggling with → top 3 matched lenses rendered in full **plus** top 5 matching knowledge-base docs (id, title, snippet) |
| `lens` | A lens id or name → that lens rendered in full (plus up to 2 related lenses and matching docs if `situation` also given) |
| `doc` | A knowledge-base doc id → the doc. Docs over 25KB return their table of contents + lead instead of full text |
| `doc` + `section` | Just that section, matched by partial heading text |
| *(none)* | The catalog: every lens with one-liner and phase tags |

Precedence: `doc` > `lens` > `situation` > catalog. Doc search is the
TF-IDF engine (`src/core/search.ts` — synonym expansion, stemming, title
boosts; zero deps) indexed over the design docs at startup.

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

## The knowledge base (`docs/`)

A small, curated library of game-design docs — genre reference, game feel and
genre craft, design fundamentals, emergent/puzzle design, level design,
postmortem shipping lessons, difficulty & accessibility, and resource maps.
Design content only: anything engine- or implementation-specific belongs in
engine docs (Context7, official manuals), not here.

## Architecture

```
index.ts          CLI: default = serve; init = write MCP config; status
server.ts         createServer(): load docs → register lens → wire resources
                  → stdio transport
tool-registry.ts  concurrency cap (8) → handler → analytics → isError mapping
tool-definition.ts GameLensToolDef/ToolResult/ToolDependencies (slim)
core/lenses.ts    the lens data + matchLenses/findLens (pure, tested)
core/search.ts    TF-IDF doc search (zero deps) powering the in-lens KB block
tools/lens.ts     the one tool: lens rendering + doc search/fetch/sections
core/docs.ts      DocStore for the design knowledge base (in-lens + resources)
analytics.ts      local-only daily aggregates (~/.gamelens/analytics/)
cli/              init/detect: auto-write MCP config for detected AI tools
```

Runtime deps: `@modelcontextprotocol/sdk`, `zod`. Nothing else.

## Non-goals (v3)

- No engine documentation — removed in v3; the design-philosophy-only
  direction is the product decision. Engine API freshness is Context7's job;
  editor integration is Godot-MCP/Unity-MCP's job. They compose well.
- No second tool — doc access lives *inside* the lens, not beside it
- No project state, scope tracker, personality, sessions, GDD generation
  (removed in v2 — the 1.0.x line has them; git history preserves them)
- No network, no accounts, no telemetry upload — stdio only, analytics local

## Versioning note

v3.0.0 is a breaking release **and a rename**: the package is now `gamelens`
(formerly `gamecodex`). The 29 engine-doc modules, the module system
(`GAMEDEV_MODULES`), and engine detection are removed; 2.0.1 is the final
`gamecodex` release and the last with the engine knowledge base. v2.0.0 removed
the old 5-tool surface (project/design/docs/build/meta); 1.0.1 was that
surface's final release.
