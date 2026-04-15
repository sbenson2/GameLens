# GameCodex Project Audit Report

**Generated:** April 12, 2026  
**Auditor:** Claude (big-pickle model)  
**Project:** GameCodex v0.4.1  
**Path:** `/Users/s/Documents/Personal/Game Dev/Projects/GameCodex/`

---

## Executive Summary

GameCodex is an MCP (Model Context Protocol) server providing 950+ curated game development documentation across 29 game engines. It offers 5 power tools (`project`, `design`, `docs`, `build`, `meta`) with a free/Pro tier licensing model. The codebase is well-structured overall but has several security, performance, and code quality issues that should be addressed.

**Overall Assessment:** Good foundation with notable security and maintainability concerns.

---

## 1. Project Overview

### What It Does
- MCP server that connects to AI coding assistants (Claude, Cursor, Windsurf, etc.)
- Provides structured game development guidance via 5 tools
- 950+ curated documentation docs across 29 game engines
- Free tier with limited access; Pro tier ($7/mo) for full functionality

### Architecture
```
GameCodex/
├── packages/
│   ├── server/     # MCP server (main package)
│   └── site/       # Marketing website (Next.js)
├── package.json    # npm workspaces root
└── docs/           # 957 knowledge base docs
```

### Core Systems
| System | Purpose |
|--------|---------|
| DocStore | Loads and manages markdown documentation |
| SearchEngine | TF-IDF based search with synonym expansion |
| VectorSearch | Optional ML-based semantic search |
| HybridSearch | Combines keyword + vector search |
| ProjectStore | Persists project state to JSON files |
| PersonalityEngine | Genre-specific tone and guidance |
| HealthTracker | Scope creep detection |
| License | License validation and activation |

---

## 2. Security Audit

### Issues Found

| Severity | Issue | Location | Status |
|----------|-------|----------|--------|
| **HIGH** | Next.js 16.2.2 DoS vulnerability (CVE GHSA-q4gf-8mx6-v5v3) | `packages/site/package.json` | Fix available |
| **MEDIUM** | CORS open policy (`*`) on API endpoints | `workers/src/helpers.ts:8,23` | Review needed |
| **LOW** | Rate limiter "fail open" on KV errors | `rate-limit.ts:70-71` | Acceptable |

### HIGH Priority - Next.js Vulnerability

**File:** `packages/site/package.json`  
**Current:** `"next": "16.2.2"`  
**CVE:** GHSA-q4gf-8mx6-v5v3  
**Fix:** Upgrade to `next@16.2.3`  
**Command:** `npm audit fix --force`

### MEDIUM Priority - CORS Configuration

**File:** `packages/server/workers/src/helpers.ts`

```typescript
"Access-Control-Allow-Origin": "*",
```

**Risk:** Could enable CSRF attacks on license validation endpoints.

**Recommendation:** Restrict to specific trusted origins for production.

### Security Strengths

| Area | Status | Details |
|------|--------|---------|
| Hardcoded Secrets | PASS | No API keys, passwords, or tokens found |
| License Key Security | EXCELLENT | SHA-256 hashing, HMAC signatures, timing-safe comparisons |
| Webhook Security | EXCELLENT | HMAC-SHA256 verification, replay protection |
| File Permissions | PASS | 0o600 for sensitive files, 0o700 for directories |
| Input Validation | PASS | Project names sanitized to prevent path traversal |
| XSS Prevention | PASS | Uses react-markdown, no dangerouslySetInnerHTML |
| SQL Injection | N/A | No SQL database used |
| Command Injection | PASS | No user input passed to shell commands |

---

## 3. Code Quality Issues

### Type Safety (CRITICAL)

**~100 occurrences of `any` type throughout codebase.**

Most critical is the `ToolDependencies` interface in `tool-definition.ts:96-111`:

```typescript
export interface ToolDependencies {
  docStore: any;
  searchEngine: any;
  hybridSearch: any;
  hybridProvider: any;
  sessionManager: any;
  memory: any;
  analytics: any;
  allDocs: any;
  projectStore: any;
  personality: any;
  healthTracker: any;
  // ... all untyped
}
```

**Recommendation:** Define proper interfaces for all core systems.

### Magic Numbers (30+ occurrences)

| Constant | Value | Location |
|----------|-------|----------|
| MAX_CONCURRENT | 8 | tool-registry.ts:32 |
| FREE_DAILY_SEARCH_LIMIT | 50 | rate-limit.ts:12 |
| FREE_DAILY_GETDOC_LIMIT | 30 | rate-limit.ts:13 |
| BATCH_SIZE | 8 | vector-search.ts:129 |
| DEFAULT_CONTEXT_LIMIT | 1_000_000 | session-manager.ts:60 |
| NUDGE_AFTER_N_RESPONSES | 10 | response-enhancer.ts:15 |
| CACHE_TTL_MS | 24h | license.ts:33 |
| OFFLINE_GRACE_MS | 7 days | license.ts:34 |

**Recommendation:** Extract to config files or environment variables.

### Dead Code

| File | Issue |
|------|-------|
| `core/memory.ts` | **Entire file deprecated** - replaced by project-store.ts |
| `core/session.ts:678-701` | `handleSessionAction` function appears unused |
| `core/session.ts:850-877` | `serializeState` function appears unused |
| `tools/docs.ts:152` | `const accessNote = ""` - declared but never used |

**Recommendation:** Delete `core/memory.ts` and clean up unused functions.

---

## 4. Performance Issues

### Critical Performance Problems

| Issue | Location | Impact |
|-------|----------|--------|
| O(n*m) search scoring | `search.ts:228-240` | Iterates all docs for every search |
| Sequential embedding | `vector-search.ts:131-152` | No parallelization |
| Sync file I/O on startup | `docs.ts:76-101`, `modules.ts:107-120` | Slow startup times |
| No TF-IDF index caching | `search.ts` | Index rebuilt every server start |
| Project lookup cascade | `project-store.ts:75-103` | Cache → file → legacy format checks |

### Missing Optimizations

- No result caching for search queries
- No async/parallel file loading on startup
- No connection pooling for file operations

---

## 5. Error Handling

### Issues Found

| Location | Issue |
|----------|-------|
| `vector-search.ts:91` | Unhandled rejection in `init()` - error logged but not propagated |
| `hybrid-search.ts:57-59` | Vector search init failure swallowed silently |
| `search.ts` | No error handling for malformed tokenize input |
| `project.ts:268-269` | No validation for non-boolean `advance` parameter |
| `session.ts:939-943` | Returns empty array silently when path not found |

### Good Practices Found

- Tool registry wraps all handlers in try/catch (tool-registry.ts:212-221)
- Session tracking errors are non-critical and handled gracefully
- File I/O operations have try/catch blocks

---

## 6. Testing Coverage

### Current State
- **303 passing tests** across 20+ test files
- Good coverage for: search, docs, modules, analytics, license, tiers, rate limiting

### Missing Tests

| Area | Coverage |
|------|----------|
| `core/personality.ts` | No unit tests for tone generation |
| `core/health-tracker.ts` | Limited edge case tests |
| `core/project-store.ts` | No tests for legacy format migration |
| `tools/design.ts` | No tests for GDD, pricing, marketing helpers |
| CLI tools | No tests for setup, init, deactivate |

---

## 7. Documentation

### Missing JSDoc

| File | Missing |
|------|---------|
| All tool handlers | `handleSearchDocs`, `handleGetDoc`, `handleGenerateStarter` |
| `tools/design.ts:181-262` | Helper functions |
| `core/session-manager.ts` | Parameter descriptions |
| `core/health-tracker.ts` | Public methods |
| `tools/scaffold-project.ts` | Internal functions |

### Current State
- Well-documented: `error-helpers.ts`, `help-generator.ts`, `doc-cache.ts`, `remote-client.ts`
- No TODO/FIXME comments found - codebase appears well-maintained

---

## 8. Logging & Monitoring

### Current State
- `console.error` for server startup logs
- Analytics system exists (local-only)
- No structured logging library

### Missing

| Area | Status |
|------|--------|
| Structured logging | Not implemented (no pino/winston) |
| Error tracking | No Sentry/error tracking integration |
| Performance metrics | No search latency, handler timing |
| Debug mode | No DEBUG environment variable |
| Request tracing | No correlation IDs |
| Health endpoints | No HTTP health check for containers |

---

## 9. Recommendations (Priority Order)

### Immediate (Fix Now)

1. **Fix Next.js vulnerability**
   ```bash
   cd packages/site && npm audit fix --force
   ```

2. **Delete deprecated code**
   ```bash
   rm packages/server/src/core/memory.ts
   ```

3. **Fix ToolDependencies typing** in `tool-definition.ts`

### High Priority

4. **Cache TF-IDF index** - Major performance improvement
5. **Extract magic numbers** to config/environment variables
6. **Add structured logging** for production observability

### Medium Priority

7. Add unit tests for CLI tools and health tracker edge cases
8. Add JSDoc to all public functions
9. Implement async file I/O for startup optimization
10. Restrict CORS to specific origins

### Nice to Have

11. Add debug mode via `DEBUG` env var
12. Add error tracking (Sentry)
13. Add performance metrics for handlers
14. Implement result caching for search queries

---

## Appendix: File Structure Reference

```
GameCodex/
├── packages/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts           # CLI entry point
│   │   │   ├── server.ts         # MCP server creation
│   │   │   ├── tool-registry.ts  # Centralized tool registration
│   │   │   ├── tool-definition.ts # Tool interfaces
│   │   │   ├── tiers.ts          # Access control
│   │   │   ├── license.ts        # License validation
│   │   │   ├── tools/            # Tool implementations
│   │   │   │   ├── project.ts
│   │   │   │   ├── design.ts
│   │   │   │   ├── docs.ts
│   │   │   │   ├── build.ts
│   │   │   │   └── meta.ts
│   │   │   ├── core/             # Core systems
│   │   │   │   ├── docs.ts
│   │   │   │   ├── search.ts
│   │   │   │   ├── vector-search.ts
│   │   │   │   ├── hybrid-search.ts
│   │   │   │   ├── project-store.ts
│   │   │   │   ├── personality.ts
│   │   │   │   ├── health-tracker.ts
│   │   │   │   └── session-manager.ts
│   │   │   └── workers/          # Serverless workers
│   │   └── docs/                 # 957 knowledge base docs
│   └── site/                     # Marketing website (Next.js)
└── package.json                  # npm workspaces root
```

---

*Report generated by Claude (big-pickle model)*
