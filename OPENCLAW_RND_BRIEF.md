# GameDev MCP Server — R&D Project Brief

**Owner:** s
**Date:** 2026-03-16
**Repo:** gamedev-mcp-server (GitHub, public)
**Status:** v1.0.0 shipped, free tier functional, Pro tier needs server-side migration

---

## Project Summary

An MCP server that provides curated game development knowledge, structured dev session workflows, and engine-specific implementation guidance to AI coding tools (Claude Code, Cursor, Windsurf, etc.).

**Current state:**
- 150+ markdown docs across 2 modules (core + monogame-arch)
- 6 tools: search_docs, get_doc, list_docs, session, genre_lookup, license_info
- Free/Pro tier system with LemonSqueezy license validation
- TypeScript, stdio transport, no database — docs loaded from filesystem at startup

**Problem:** Pro content (70 docs, 60K+ lines) ships in the npm package and GitHub repo. Anyone can bypass the paywall by setting `GAMEDEV_MCP_DEV=true`, editing source, or just reading the repo. The license check is an honesty gate, not a hard lock.

---

## R&D Objectives

### 1. Server-Side Pro Content Delivery

Move Pro-gated content behind a server API so it cannot be accessed without a valid license.

**What moves server-side:**
- `docs/monogame-arch/` — 70 docs, ~2.1MB (63 implementation guides + 3 architecture + 3 reference + 1 rules)
- Session co-pilot workflows (plan, decide, feature, debug, scope)
- Full genre-to-systems mappings (12 genres, 20+ aliases, system requirements + recommended docs)
- All future premium modules

**What stays client-side (ships in npm package):**
- `docs/core/` — 48 docs, ~968KB (concepts, game design, programming patterns, project management)
- Basic genre lookup (name + checklist only)
- Search/list/get for core module
- License validation client

**Architecture direction:**
- Pro content served via HTTPS API (e.g. `api.gamedev-mcp.com`)
- API key passed in request headers, validated against LemonSqueezy
- Client MCP server fetches Pro docs on demand, caches locally with TTL
- Offline grace period (7 days) using encrypted local cache
- Remove `GAMEDEV_MCP_DEV` bypass before launch

### 2. Engine Module Expansion

Market research shows MonoGame + Arch ECS is too niche to sustain meaningful revenue alone. Expanding engine coverage is the highest-leverage growth move.

**Priority order:**
1. **Godot** — large indie community, strong overlap with solo/small team devs
2. **Unity** — largest addressable market, most monetization potential
3. **Bevy (Rust ECS)** — growing niche, high willingness to pay for quality docs

**Per module, produce:**
- Architecture overview (E-series docs)
- Library/capability reference (R-series docs)
- Implementation guides (G-series, target 30-60 per engine)
- Engine-specific rules for AI code generation
- Integration into genre-lookup system mappings

### 3. Monetization Infrastructure

- Set up LemonSqueezy product/pricing ($8-12/month or $49-79/year)
- Implement server-side license validation API
- Set up Stripe/LemonSqueezy webhooks for key activation/deactivation
- Consider micropayment option (PaidMCP/Radius) for per-use pricing

---

## Cron & Heartbeat System

This project needs ongoing automated R&D work. Set up the following recurring tasks:

### Cron Jobs

| Schedule | Task | Description |
|----------|------|-------------|
| **Daily** | `doc-quality-audit` | Pick 3-5 random docs, check for: outdated API references, broken internal doc links, consistency with current engine versions, formatting issues. Log findings to `rnd/audit-log.md`. |
| **Daily** | `competitor-scan` | Check MCP registries (mcpmarket.com, mcp.so, glama.ai) for new gamedev MCP servers. Check GitHub trending for gamedev+MCP repos. Log to `rnd/competitor-log.md`. |
| **Weekly** | `content-gap-analysis` | Compare genre-lookup system requirements against available guides. Identify systems referenced but not covered by any guide. Prioritize by genre popularity. Log to `rnd/gaps.md`. |
| **Weekly** | `engine-research` | Research one target engine (rotating: Godot → Unity → Bevy). Catalog: official docs structure, common pain points, community resources, what an MCP module would need to cover. Append to `rnd/engine-research/{engine}.md`. |
| **Weekly** | `search-quality-test` | Run 20 representative queries against search_docs, evaluate relevance of top-3 results. Track precision score over time in `rnd/search-quality.md`. |
| **Bi-weekly** | `pricing-research` | Check competitor pricing, LemonSqueezy analytics (once live), MCP monetization discussions. Update `rnd/pricing-intel.md`. |
| **Monthly** | `module-prototype` | Produce a minimal prototype for the next engine module (start with Godot): 5 core guides, architecture overview, rules file. Output to `docs/{engine}/` as draft. |

### Heartbeat Checks

| Interval | Check | Action on Failure |
|----------|-------|-------------------|
| **Every 6h** | Pro API health (once deployed) | Log downtime, alert owner |
| **Every 6h** | LemonSqueezy API reachable | Log connectivity issues |
| **Daily** | npm package version matches repo | Flag if publish is needed |
| **Daily** | GitHub repo — new issues/PRs | Triage and summarize in `rnd/triage.md` |
| **Weekly** | npm download stats | Log to `rnd/metrics.md` |

---

## Directory Structure for R&D Outputs

```
gamedev-mcp-server/
├── rnd/
│   ├── audit-log.md          # Daily doc quality findings
│   ├── competitor-log.md     # Daily competitor scan
│   ├── gaps.md               # Weekly content gap analysis
│   ├── search-quality.md     # Weekly search relevance scores
│   ├── pricing-intel.md      # Bi-weekly pricing research
│   ├── triage.md             # Issue/PR triage summaries
│   ├── metrics.md            # Download stats, usage data
│   └── engine-research/
│       ├── godot.md
│       ├── unity.md
│       └── bevy.md
```

---

## Technical Context

| Item | Detail |
|------|--------|
| **Language** | TypeScript |
| **Runtime** | Node.js >= 18 |
| **MCP SDK** | @modelcontextprotocol/sdk ^1.12.1 |
| **Transport** | stdio |
| **Search** | TF-IDF, no external deps |
| **Storage** | Filesystem (docs as markdown) |
| **License validation** | LemonSqueezy API + local cache (24h TTL, 7-day offline grace) |
| **Package** | npm: gamedev-mcp-server |
| **Config** | `~/.gamedev-mcp/license.json` or `GAMEDEV_MCP_LICENSE` env var |
| **Dev bypass** | `GAMEDEV_MCP_DEV=true` (REMOVE before public Pro launch) |

### Key Source Files

| File | Purpose |
|------|---------|
| `src/server.ts` | Main server setup, tool/resource registration |
| `src/license.ts` | License validation, caching, tier resolution |
| `src/tiers.ts` | Tier definitions, permission checks |
| `src/core/docs.ts` | Document store, loading, indexing |
| `src/core/search.ts` | TF-IDF search engine |
| `src/core/genre.ts` | Genre-to-systems mapping (12 genres, 20+ aliases) |
| `src/core/session.ts` | Session co-pilot (5 workflows, 85+ topic-doc mappings) |
| `src/tools/*.ts` | Individual MCP tool handlers |

### Content Inventory

| Module | Docs | Lines | Size | Tier |
|--------|------|-------|------|------|
| `core` | 48 | 21,619 | 968 KB | Free |
| `monogame-arch` | 70 | 60,967 | 2.1 MB | Pro |
| **Total** | **118** | **82,586** | **~3 MB** | — |

---

## Market Context

- ~291 gamedev MCP servers exist, nearly all are engine-integration tools (bridge AI to Unity/Godot/Unreal editor). This is a **knowledge server** — different category, little direct competition.
- Paid MCP market is real: top creators earn $3K-10K+/month. Only ~5% of 11K+ servers are monetized.
- MCP featured at GDC 2026 (March 9-13) — gamedev audience awareness is peaking.
- MonoGame is niche (low thousands of devs). Godot/Unity expansion is critical for revenue growth.
- Realistic revenue: $200-1K/month MonoGame-only → $1K-5K/month with multi-engine.
- Free alternatives exist for raw info (Game Programming Patterns, GDC talks). Value prop is curation + structured AI delivery.

---

## Success Criteria

1. Pro content is not accessible without a valid license key (server-side gating)
2. API latency < 500ms for doc retrieval (cached < 50ms)
3. Godot module prototype with 30+ guides within 8 weeks
4. LemonSqueezy storefront live with functional payment flow
5. Search relevance score > 0.7 (measured by weekly cron)
6. Zero broken doc references (measured by daily audit)

---

## Open Questions

- [ ] Hosting for Pro API — Cloudflare Workers? Fly.io? Vercel Edge?
- [ ] Should session co-pilot run server-side or stay client-side with gated doc access?
- [ ] Encrypted local cache format for offline Pro access?
- [ ] Do we need usage analytics (anonymous) to prioritize content?
- [ ] Per-use micropayments vs subscription — test both or pick one?
