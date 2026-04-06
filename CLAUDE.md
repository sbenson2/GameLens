# GameCodex Monorepo

AI game dev co-pilot — MCP server + marketing site.

## Monorepo Structure

```
GameCodex/
├── packages/
│   ├── server/    <- MCP server (CLI + 22 tools, 150+ docs)
│   └── site/      <- Marketing site (Next.js)
├── package.json   <- npmuao workspaces root
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
npm test               # run all tests (228 passing)
npm run lint:site      # eslint on site
```

## Server (`packages/server/`)

- **Entry:** `src/server.ts` — MCP server setup, tool registration via registry
- **Tool registry:** `src/tool-registry.ts` — centralized registration with tier checks, analytics, error handling
- **Tool interface:** `src/tool-definition.ts` — metadata: isReadOnly, isConcurrencySafe, isDestructive (fail-closed defaults)
- **Tools (20 handlers):** `src/tools/` — one file per tool
- **Core systems:** `src/core/` — search, docs, modules, sessions, memory, vector search
- **Tiers/licensing:** `src/tiers.ts`, `src/license.ts`
- **CLI:** `src/cli/setup.ts` — interactive `gamecodex setup` command for license activation
- **Analytics:** `src/analytics.ts`
- **Knowledge base:** `docs/` — core (52), monogame-arch (80), godot-arch (18)
- **Config dir at runtime:** `~/.gamecodex/` (embeddings cache, memory, project contexts)
- **Dependencies:** `@modelcontextprotocol/sdk` ^1.12.1, `@huggingface/transformers` ^4.0.1

### Tool Inventory (22 tools)

**Original (v1.3.0):** search_docs, get_doc, list_docs, list_modules, session, genre_lookup, random_doc, compare_engines, migration_guide, license_info

**Phase 1:** explain_concept, scaffold_project, generate_gdd, review_architecture, project_context

**Phase 2:** teach (interactive learning paths)

**Phase 2.5:** memory (persistent project memory), diagnostics (server health/stats)

**Phase 3:** debug_guide (error diagnosis), generate_starter (feature starter code), phase_checklist (project phase tracker), asset_guide (asset pipeline helper)

### Adding a New Tool

1. Create handler in `packages/server/src/tools/<name>.ts`
2. Follow the `ToolDefinition` interface from `packages/server/src/tool-definition.ts`
3. Register in `packages/server/src/tool-registry.ts`
4. Wire into `packages/server/src/server.ts`
5. Add tests in `packages/server/src/__tests__/<name>.test.ts`

## Site (`packages/site/`)

- Next.js 16 + React 19 + Tailwind 4
- AI SDK integration (Anthropic, OpenAI, Google)
- Run `npm run dev:site` for local dev

## Conventions

- Tool results return structured JSON, not prose
- Generated code includes educational comments explaining WHY
- Never hallucinate engine APIs — reference knowledge base docs
- Support MonoGame, Godot, and Phaser consistently for engine-specific features
- Keep tool descriptions concise (local LLM compatibility)
- Tool count stays under 30

## Blockers

- Migrated from GitHub (`sbenson2`, suspended) to GitLab (`sbenson2/GameCodex`)
- npm stuck at v1.0.0 — local install only (use `npm pack` for distribution)
