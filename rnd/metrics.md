# Metrics

## Git Stats — 2026-03-20 (6:00 AM)

| Metric | Value |
|---|---|
| Last commit | `434df27` — chore: add search quality test script + update search quality results |
| Commits today (so far) | 8 |
| Total commits | 19 |
| Files tracked | 186 |
| Repo size (.git) | 4.4M |
| Working tree | 276M |
| Unpushed commits | 0 |
| Build (tsc --noEmit) | ✅ Clean |
| Uncommitted changes | None |
| Branch | main (up to date with origin/main) |

---

# Publish Metrics

## v1.0.0 — PENDING (npm auth required)

- **Prep date:** 2026-03-19
- **Version:** 1.0.0
- **Package size:** 992.4 kB (compressed tarball)
- **Unpacked size:** 3.3 MB
- **Total files:** 177
- **Dry run:** ✅ PASS — no internal files leaked (no rnd/, src/, godot-arch/, OPENCLAW_RND_BRIEF.md)
- **Build:** ✅ Clean (tsc, zero errors)
- **Commit:** f086c61 (npm publish prep)

### Blocker
- **npm auth not configured** — `npm whoami` returns `ENEEDAUTH`
- Wes needs to run `npm adduser` or `npm login` to authenticate, then `npm publish --access public` to ship

### What's included
- `dist/` — compiled JS (server, tools, core modules)
- `docs/core/` — 39 engine-agnostic docs (concepts, design, programming, project management, session)
- `docs/monogame-arch/` — 74 MonoGame+Arch docs (guides G1-G66, architecture, reference)

### What's excluded
- `rnd/` — internal R&D, competitive intel
- `src/` — TypeScript source
- `docs/godot-arch/` — only 3 docs, not ready
- `OPENCLAW_RND_BRIEF.md`, `PRICING.md`, `SPEC.md` — internal
- `tsconfig.json`, `index.html`, `docs-site/`, `scripts/`
