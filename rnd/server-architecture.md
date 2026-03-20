# Server-Side Architecture

Design decisions and plans for Pro content API migration.

## Overview

The MCP server currently bundles ALL docs (free + Pro) in the npm package and gates access client-side via tier checks. This means Pro content is shipped to everyone — just hidden. A server-side API moves Pro content delivery behind an authenticated endpoint, so Pro docs are never on the free user's machine.

## Architecture Decision: Cloudflare Workers

**Why Cloudflare Workers:**
- Free tier: 100K requests/day, 10ms CPU time — more than enough for early stage
- Edge-deployed globally → low latency for all users
- KV storage for doc content (free tier: 100K reads/day, 1K writes/day)
- Native fetch API, no cold starts, Workers-specific caching
- Wrangler CLI for local dev + deployment
- Cost at scale: $5/mo for 10M requests (paid plan)

## API Spec (v1)

Base URL: `https://api.gamedev-mcp.com` (or `gamedev-mcp-api.<account>.workers.dev` initially)

### Authentication

All Pro endpoints require `Authorization: Bearer <license_key>` header.
License validation uses LemonSqueezy API (same as existing `license.ts` logic), with response caching in KV to avoid hammering the API.

### Endpoints

#### `GET /v1/health`
Health check. No auth required.
```json
{ "status": "ok", "version": "1.0.0", "docsCount": 150 }
```

#### `GET /v1/docs`
List available docs. Returns metadata only (no content).
Query params: `?module=monogame-arch&category=guide&tier=free|pro`
```json
{
  "docs": [
    { "id": "G64", "title": "Combat & Damage Systems", "module": "monogame-arch", "category": "guide", "tier": "pro", "sizeBytes": 52000 }
  ],
  "total": 150,
  "tier": "free"
}
```
- Free tier: returns all docs but Pro docs have `tier: "pro"` flag
- Pro tier: same response, client knows which are accessible

#### `GET /v1/docs/:id`
Fetch a specific doc by ID. Auth required for Pro docs.
Query params: `?section=Knockback&maxLength=5000`
```json
{
  "id": "G64",
  "title": "Combat & Damage Systems",
  "module": "monogame-arch",
  "category": "guide",
  "tier": "pro",
  "content": "# Combat & Damage Systems\n...",
  "sections": ["Health & Armor", "Hitbox/Hurtbox", "Damage Pipeline", "Knockback"]
}
```
- Free docs: no auth needed
- Pro docs without valid auth: returns metadata + section list but no content, plus upgrade message

#### `GET /v1/search`
Search docs. Auth determines which results include content snippets.
Query params: `?q=camera+follow&module=core&category=guide&limit=10`
```json
{
  "results": [
    { "id": "G20", "title": "Camera Systems", "module": "monogame-arch", "score": 0.85, "snippet": "...", "tier": "pro" }
  ],
  "query": "camera follow",
  "tier": "free",
  "total": 5
}
```
- Free tier: only core module results with snippets; pro module results listed without snippets
- Pro tier: all results with snippets

#### `POST /v1/license/validate`
Validate a license key. Returns tier and expiry info.
```json
{ "valid": true, "tier": "pro", "expiresAt": "2027-03-20T00:00:00Z" }
```

### Rate Limiting

- Free tier: 100 requests/hour per IP
- Pro tier: 1000 requests/hour per license key
- Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Implemented via Workers KV counters (or Durable Objects if needed later)

### Caching Strategy

1. **License validation cache (KV):** Cache LemonSqueezy validation results for 24h (same as existing `license.ts`)
2. **Doc content (KV):** Store all doc content in KV, keyed by `doc:{id}`. Populated on deploy.
3. **Edge cache:** Cache-Control headers on free docs for CDN edge caching (1h TTL)
4. **Client-side cache:** MCP client should cache doc content locally (covered in Phase 4)

## Phases

### Phase 1: API Spec Design ✅
- [x] Define endpoints, auth model, caching strategy
- [x] Document in server-architecture.md

### Phase 2: Scaffold Workers Project ✅
- [x] Workers project in `workers/` directory with wrangler.toml
- [x] TypeScript setup, minimal router, KV bindings (DOCS_KV, CACHE_KV)
- [x] Basic health endpoint
- [x] Local dev with `wrangler dev` verified working

### Phase 3: Doc-Serving Endpoints ✅
- [x] KV upload script (`scripts/upload-docs.ts`) — generates manifest, search index, and doc content for KV bulk upload
- [x] GET /v1/docs (list with module/category filters, tier info)
- [x] GET /v1/docs/:id (fetch with section extraction + maxLength support, tier gating)
- [x] GET /v1/search (TF-IDF scoring with tier-gated snippets — Pro docs show metadata but no snippets for free tier)
- [x] POST /v1/license/validate (LemonSqueezy proxy with KV cache + offline grace period)
- [x] Rate limiting middleware (100/hr free, 1000/hr pro, KV-backed counters, X-RateLimit-* headers)
- [x] CORS support (preflight + response headers)
- [x] All endpoints tested locally with 130 docs loaded into KV

### Phase 4: Client-Side Caching
- [ ] Add HTTP client to MCP server for remote doc fetching
- [ ] Local disk cache with TTL
- [ ] Fallback to bundled docs if API unreachable
- [ ] Hybrid mode: free docs bundled, Pro docs fetched from API

### Phase 5: Integration Testing
- [ ] End-to-end test: MCP client → Workers API → KV → response
- [ ] Tier gating validation
- [ ] Offline fallback testing
- [ ] Rate limit testing
- [ ] Performance benchmarks

## Current Phase: 4 (Client-Side Caching)

## File Structure

```
workers/
├── src/
│   ├── index.ts          # Entry point, router registration, fetch handler
│   ├── types.ts          # Env bindings, DocMeta, SearchIndexEntry, etc.
│   ├── router.ts         # Minimal path-param router
│   ├── handlers.ts       # Route handlers (health, list, get, search, validate)
│   ├── helpers.ts        # JSON response helpers, section extraction, truncation
│   ├── license.ts        # LemonSqueezy validation + KV cache
│   ├── rate-limit.ts     # KV-backed sliding window rate limiter
│   └── search.ts         # TF-IDF search engine (mirrors src/core/search.ts)
├── scripts/
│   └── upload-docs.ts    # Generates kv-bulk.json for wrangler kv bulk put
├── wrangler.toml         # Cloudflare Workers config
├── tsconfig.json
├── package.json
└── .gitignore
```
