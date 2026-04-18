# GameCodex Monorepo

Free and open source MCP server for game developers — 950+ docs across 29 engines, structured workflows, and guidance. MIT licensed.

**v1.0.0 shipped 2026-04-17.** Active feature development has stopped. Project is in maintenance mode.

## Monorepo Structure

```
GameCodex/
├── packages/
│   ├── server/    <- MCP server (5 tools, 950+ docs, 29 engines)
│   └── site/      <- Marketing site (Next.js)
├── package.json   <- npm workspaces root
└── CLAUDE.md      <- This file
```

## Commands (run from root)

```bash
npm install            # install all workspace deps
npm run build          # build server (tsc → packages/server/dist/)
npm run build:site     # build site (next build)
npm run build:all      # build everything
npm run dev            # server watch mode
npm run dev:site       # site dev server
npm start              # start MCP server
npm run typecheck      # tsc --noEmit on server
npm test               # run all tests
npm run lint:site      # eslint on site
```

## Server (`packages/server/`)

- **Entry:** `src/server.ts` — MCP server setup, 5-tool registration
- **Tool registry:** `src/tool-registry.ts` — centralized registration with analytics and error handling
- **Tool interface:** `src/tool-definition.ts` — metadata: isReadOnly, isConcurrencySafe, isDestructive (fail-closed defaults)
- **5 tools:** `src/tools/` — project.ts, design.ts, docs.ts, build.ts, meta.ts
- **Handler utilities:** `src/tools/` — existing handler functions delegated to by the 5 tools
- **Core systems:** `src/core/` — personality, project-store, health-tracker, search, docs, modules, vector search, error-helpers, response-enhancer, help-generator
- **Knowledge base:** `docs/` — core (52) + 29 engine modules (957 total docs)
- **Config dir:** `~/.gamecodex/` (projects, embeddings, learning progress)

### Tool Inventory (v1.0.0 — 5 tools, all free)

| Tool | Actions | What it does |
|------|---------|-------------|
| `project` | help, hello, get, set, suggest, decide, goal, complete_goal, clear_goals, milestone, note, recall, clear_notes, health, scope, add_feature, list, session | Interactive AI assistant — onboarding, project state, goals, decisions, scope health. Personality adapts to genre/phase. |
| `design` | help, gdd, phase, scope_check, launch, store_page, pricing, marketing, trailer, patterns | Plan + ship — GDD, phase checklists, scope analysis, marketing guidance, architecture patterns |
| `docs` | help, search, get, browse, modules | Knowledge base — search/browse 950+ game dev docs across 29 engines |
| `build` | help, scaffold, code, assets, debug, review | Make things — scaffold projects, generate code, asset pipeline, debug errors, review architecture |
| `meta` | help, status, analytics, modules, health, about | Server internals — diagnostics, module discovery, help |

### Core Modules

- `core/personality.ts` — Template-based tone engine (13 genre tones, phase emphasis)
- `core/project-store.ts` — Unified persistence (JSON files at ~/.gamecodex/projects/)
- `core/health-tracker.ts` — Scope creep detection, feature evaluation
- `core/error-helpers.ts` — Enriched errors with valid values, examples, fuzzy matching (fastest-levenshtein)
- `core/response-enhancer.ts` — Breadcrumb status line + next-step suggestions on every response
- `core/help-generator.ts` — Self-documenting help action for all 5 tools

### CLI Commands

- `gamecodex` — Start the MCP server (default)
- `gamecodex init` — Auto-detect AI tools + engine, write MCP config
- `gamecodex status` — Print version

### MCP Prompts (workflow entry points)

- `start-project` — Guided new project setup (engine → GDD → goals → suggest)
- `debug-error` — Error diagnosis workflow (debug → docs search → fix)
- `ship-game` — Launch checklist (launch → store page → marketing)
- `session` — Start structured dev session (plan, build, debug, or manage scope)

### Adding a New Tool (maintenance only)

1. Create tool def in `packages/server/src/tools/<name>.ts` exporting a `GameCodexToolDef`
2. Use `action` enum param for routing multiple operations through one tool
3. Register in `packages/server/src/server.ts` `registerAllTools()`
4. Add tests in `packages/server/src/__tests__/<name>.test.ts`

## Site (`packages/site/`)

- Next.js 16 + React 19 + Tailwind 4
- AI SDK integration (Anthropic, OpenAI, Google) — used by the disabled `/chat` route, not the live site
- Run `npm run dev:site` for local dev

## Conventions

- Tool results return structured JSON, not prose
- Generated code includes educational comments explaining WHY
- Never hallucinate engine APIs — reference knowledge base docs
- Support all 29 engines consistently (MonoGame, Godot, Unity, Unreal, Bevy, and more)
- Keep tool count at 5 — add actions, not tools
- Each tool = one domain, `action` param for routing

## Notes

- Repo lives at GitLab (`sbenson2/GameCodex`) after GitHub (`sbenson2`) account suspension.
- npm publish is manual — see scripts in `packages/server/scripts/` or use the `/publish` skill.
- No monetization, no tier gating, no license keys. All features free.
