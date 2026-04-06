# Functional Test Results — 2026-03-24 (Rotation A)

## Build
- **tsc**: PASS (clean, zero errors)
- **Package version**: 1.3.0

## Automated Tests
- **Total**: 187/187 PASS
- **Suites**: 28
- **Duration**: 1.46s
- **Failures**: 0
- **Skipped**: 0

## Module Discovery
- **Modules**: 2 (monogame-arch: 79 docs, godot-arch: 14 docs)
- **Core docs**: 51
- **Total docs**: 144

## Tool Verification (Free Tier — 10 tools)

| Tool | Free Tier | Pro Tier (dev) | Status |
|------|-----------|----------------|--------|
| search_docs | OK (2067 chars, limited to core) | OK (1430 chars) | ✅ PASS |
| get_doc | OK (6222 chars, core only) | OK (9058 chars, any module) | ✅ PASS |
| list_docs | OK (1217 chars) | OK (1129 chars) | ✅ PASS |
| genre_lookup | OK (773 chars, limited) | OK (841 chars, full) | ✅ PASS |
| license_info | OK (825 chars) | OK (681 chars) | ✅ PASS |
| list_modules | OK (1257 chars) | OK (1110 chars) | ✅ PASS |
| random_doc | OK (563 chars, core only) | OK (732 chars, any engine) | ✅ PASS |
| compare_engines | GATED (84 chars, Pro required) | OK (2072 chars) | ✅ PASS |
| migration_guide | GATED (84 chars, Pro required) | OK (5114 chars) | ✅ PASS |
| session | GATED (Pro required) | OK (1228 chars) | ✅ PASS |

## Section Extraction (Pro/dev)
- `get_doc("G6", section: "Screen Shake")` → OK (417 chars) — correct subsection returned

## Tier Gating Summary
- **Free tools (full)**: list_docs, list_modules, license_info (3)
- **Free tools (limited)**: search_docs, get_doc, genre_lookup, random_doc (4, core module only)
- **Pro-only**: compare_engines, migration_guide, session (3)
- All gates verified correct ✅

## Dev Mode
- `GAMEDEV_MCP_DEV=true` correctly enables Pro tier without license key ✅

## No Issues Found
