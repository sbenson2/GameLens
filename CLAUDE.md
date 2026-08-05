# GameLens Monorepo

**A game designer AI lens for programmers.** Free and open source MCP server,
MIT licensed. One tool (`lens`) + a curated design-doc knowledge base as MCP
resources. Design philosophy only — no engine docs.

**v3.0.0 (2026-08-05):** renamed from **GameCodex** (`gamecodex` on npm) and
went design-philosophy-only — the 29 engine-doc modules (~950 docs), the
module system (`GAMEDEV_MODULES`), and engine detection were removed; that
content lives in the 2.x tags. v2.0.0 (2026-08-03) was the single-tool
rewrite; v1.0.1 was the final release of the old five-tool surface.
Repo lives at `~/Developer/GameCodex` (dir rename to GameLens pending).

## Monorepo Structure

```
GameLens/
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
- **Doc search:** `src/core/search.ts` — TF-IDF engine (synonyms, stemming,
  title boosts; zero deps) indexed over the design docs at startup, powering
  the in-lens knowledge-base block.
- **Lens library:** `src/core/lenses.ts` — 15 lenses (Cerny, MDA, Meier,
  Swink, juice, flow/Celeste, Fan, kishōtenketsu, core loops, Yu, Valve/RITE,
  SDT/Bartle, Sirlin/Schreiber, Koster, BotW emergence) + `matchLenses`/
  `findLens`. Pure data + pure functions, fully tested.
- **Registry:** `src/tool-registry.ts` — concurrency cap, analytics,
  never-throw with MCP `isError`.
- **Knowledge base:** `docs/` — ~10 curated game-design docs (genre
  reference, game feel craft, fundamentals, emergent/puzzle design, level
  design, postmortems, difficulty & accessibility, resource maps) served as
  MCP resources (`gamelens://docs/{id}`) via `src/core/docs.ts`. Design
  content only — engine/implementation content is out of scope.
- **Analytics:** `src/analytics.ts` — local-only daily JSON aggregates
  (`~/.gamelens/analytics/`, disable with `GAMELENS_ANALYTICS=false`).
- **CLI:** `gamelens` (serve) / `gamelens init` (write MCP config) /
  `gamelens status`.
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
- Design philosophy only — engine or implementation content does not belong
  in this repo, in lens text, or in `docs/`
- Tool results return structured text, never throw; failures set `isError`
- Version: keep `SERVER_VERSION` (src/server.ts, src/index.ts) in sync with
  package.json on every bump

## Notes

- **Canonical remote: GitHub (`sbenson2/GameCodex` → rename to
  `sbenson2/GameLens` pending)** — plain `git push origin main` works.
  GitLab (`sbenson2/GameCodex`) is a mirror — push to both.
  (History: `sbenson2` was suspended March 2026 → GitLab → a brief stint at
  `sbenson2/GameCodex` → moved back after the suspension lifted.)
- npm: v3.0.0+ publishes as **`gamelens`** (new package). `gamecodex` stays
  at 2.0.1 as its final release — deprecate it on npm pointing at `gamelens`.
  Publish is manual — `npm publish` from `packages/server/` (prepublishOnly
  runs clean build + tests).
- No monetization, no tiers, no license keys. All features free.
- The user-level MCP entry in `~/.claude.json` runs this server from
  `~/Developer/GameCodex/packages/server/dist/index.js` — rebuild after
  changes (`npm run build`). The old `GAMEDEV_MODULES` env var is obsolete
  (harmless if still set — remove it when convenient).
