# GameCodex Monorepo

**A game designer AI lens for programmers.** Free and open source MCP server,
MIT licensed. One tool (`lens`) + the 957-doc knowledge base as MCP resources.

**v2.0.0 (2026-08-03):** single-tool rewrite — the lens is the product.
v1.0.1 was the final release of the old five-tool surface (project/design/
docs/build/meta); that code lives in git history and the 1.0.x tags.
Repo lives at `~/Developer/GameCodex`.

## Monorepo Structure

```
GameCodex/
├── packages/
│   ├── server/    <- the MCP server (the product) — SPEC.md is the source of truth
│   └── site/      <- marketing site (Next.js) — STALE: predates the lens direction
├── package.json   <- npm workspaces root
└── CLAUDE.md      <- This file
```

## Commands (run from root)

```bash
npm install            # install all workspace deps
npm run build          # build server (clean dist + tsc)
npm run dev            # server watch mode
npm start              # start MCP server
npm run typecheck      # tsc --noEmit on server
npm test               # run all tests
```

## Server (`packages/server/`)

- **The one tool:** `src/tools/lens.ts` — params `situation?` / `lens?` /
  `doc?` / `section?`, no action routing. Situation → matched lenses + top
  matching KB docs; lens id → that lens; doc id → the doc (TOC-gated over
  25KB, `section` extracts one heading); nothing → catalog. Precedence:
  doc > lens > situation.
- **Doc search:** `src/core/search.ts` — the v1 TF-IDF engine (synonyms,
  stemming, title boosts; zero deps, post cache-fix) indexed over loaded
  docs at startup, powering the in-lens knowledge-base block.
- **Lens library:** `src/core/lenses.ts` — 15 lenses (Cerny, MDA, Meier,
  Swink, juice, flow/Celeste, Fan, kishōtenketsu, core loops, Yu, Valve/RITE,
  SDT/Bartle, Sirlin/Schreiber, Koster, BotW emergence) + `matchLenses`/
  `findLens`. Pure data + pure functions, fully tested.
- **Registry:** `src/tool-registry.ts` — concurrency cap, analytics,
  never-throw with MCP `isError`.
- **Knowledge base:** `docs/` (core + 29 engine modules, 957 docs) served as
  MCP resources via `src/core/docs.ts` + `src/core/modules.ts`;
  `GAMEDEV_MODULES` scopes what loads.
- **Analytics:** `src/analytics.ts` — local-only daily JSON aggregates.
- **CLI:** `gamecodex` (serve) / `gamecodex init` (write MCP config) /
  `gamecodex status`.
- Runtime deps: `@modelcontextprotocol/sdk`, `zod` — nothing else.

### Lens content rules (from SPEC.md)

- Real, checkable provenance only (talks/books/papers that exist)
- Original distillations — never reproduce source text or Schell's lens list
- Red flags phrased in programmer terms ("input handled in a fixed tick
  without interpolation"), not designer terms ("bad feel")
- Every lens: ≥5 questions, ≥4 red flags, ≥4 prescriptions, phases, keywords,
  further reading — enforced by `src/__tests__/lens.test.ts`

### Adding a lens

1. Add the entry to `LENSES` in `src/core/lenses.ts` (follow content rules)
2. `npm test` — lens.test.ts validates shape; add a matching test for its
   canonical situation phrasing

## Conventions

- One tool is the product decision, not a starting point — new capability
  goes into lens content or resources, not new tools
- Tool results return structured text, never throw; failures set `isError`
- Version: keep `SERVER_VERSION` (src/server.ts, src/index.ts) in sync with
  package.json on every bump

## Notes

- **Canonical remote: GitHub (`sbenson2/GameCodex`).** GitLab
  (`sbenson2/GameCodex`) is a mirror — push to both. (History: the
  original GitHub account `sbenson2` was suspended March 2026; the project
  lived on GitLab until moving back.)
- GitHub has a repo ruleset (id 15265607) that blocked all pushes to main
  (created during mothballing); it must be disabled/tailored in repo settings
  before pushes land.
- npm publish is manual — `npm publish` from `packages/server/`
  (prepublishOnly runs clean build + tests).
- No monetization, no tiers, no license keys. All features free.
- The user-level MCP entry in `~/.claude.json` runs this server from
  `~/Developer/GameCodex/packages/server/dist/index.js` with
  `GAMEDEV_MODULES=core,godot-arch` — rebuild after changes (`npm run build`).
