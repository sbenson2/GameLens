# Feature Roadmap — gamedev-mcp-server

**Created:** 2026-03-21 (Week B strategic rotation)  
**Last updated:** 2026-03-21

---

## Current State: v1.1.0 (prepped, not published)

- 130 docs across 3 modules (core 49, MonoGame 76, Godot 5)
- 6 MCP tools: search_docs, get_doc, list_docs, list_modules, genre_lookup, session
- TF-IDF search with section extraction + maxLength
- Free/Pro tier gating via LemonSqueezy
- Module auto-discovery (zero-config engine additions)
- Cloudflare Workers API scaffolded (Phase 3 complete)
- CI/CD pipeline (GitHub Actions, 36 tests)
- npm published (v1.0.0 live, v1.1.0 ready)

---

## v1.1.0 — Ship & Stabilize (NOW → April 2026)

**Theme:** Get what we've built into users' hands. Zero new features, 100% distribution.

### Must-ship
- [ ] **npm v1.1.0 publish** — release workflow dispatch or manual
- [ ] **MCP registry submissions** — mcp.so, smithery.ai, mcpmarket.com, Cline marketplace
- [ ] **claudefa.st "50+ Best" list** — discovery opportunity
- [ ] **GitHub repo polish** — topics, description, social preview image
- [ ] **.well-known/mcp.json** — MCP 2026 roadmap prioritizes server metadata discovery; early adoption signals maturity

### Should-ship
- [ ] **Search P4: basic stemming** — "animations" ≠ "animation" still fails; medium effort, high search quality impact
- [ ] **Godot E2 GDScript vs C#** — highest-demand Godot doc; ship with v1.1.0 content
- [ ] **Godot G4 Input Handling** — every game needs InputMap + actions

### Metrics to track
- npm weekly downloads (baseline: 0 — we've had no real users yet)
- GitHub stars (baseline: 0)
- MCP registry impressions (if exposed)
- Free → Pro conversion (LemonSqueezy dashboard)

---

## v1.2.0 — Content Depth & API Live (April–May 2026)

**Theme:** Godot module to 50%+, Workers API deployed, cross-engine search.

### Features

#### Cross-Engine Search (HIGH)
- Search results annotated with engine/module source
- `engine` filter param for search_docs: `search_docs("camera follow", engine: "godot")`
- When a doc exists in multiple engines, surface both and note differences
- **Why now:** With Godot at 10+ docs, cross-engine search becomes meaningful. This is our core differentiator vs single-engine MCPs.

#### Cloudflare Workers API — Production Deploy (HIGH)
- Phase 4: Client-side caching (HTTP client, disk cache, fallback to bundled)
- Phase 5: Integration testing (E2E, tier gating, offline fallback)
- Deploy to `api.gamedev-mcp.com` or workers.dev subdomain
- **Why now:** Pro content gating is client-side only — trivially bypassed. Server-side gating is the monetization foundation.

#### Godot Module Expansion to 50% (HIGH)
- Target: 10/20 docs (5 more: E2, G4, G5, G6, G7)
- G5 Physics (CharacterBody2D/RigidBody2D/Area2D) — Godot's core
- G6 Camera — Camera2D is fundamentally different from MonoGame
- G7 TileMap — TileMapLayer 4.3+ breaking changes
- **Why now:** 5 docs is a demo. 10 docs is a product. Devs won't pay for 5 Godot guides.

#### `compare_engines` Tool (MEDIUM)
- Given a concept (e.g., "state machine", "camera", "signals"), return side-by-side comparison
- Uses existing docs from both modules + structured diffing
- Maps MonoGame concepts → Godot equivalents (ECS → nodes, systems → signals, etc.)
- **Why now:** Engine migration is the #2 search intent after "how do I build X." Devs moving Unity→Godot (accelerating per DEV Community trends) would kill for this.

#### Core Theory Gap Fill (MEDIUM)
- combat-theory.md — referenced by 8/11 genres, no theory doc
- state-machine-theory.md — cross-engine fundamental
- save-system-theory.md — confirmed community gap (Godot Forum, 2 days ago)
- **Why now:** Theory docs serve ALL engines. Higher leverage per doc than engine-specific content.

#### `random_doc` Tool (LOW)
- Returns a random doc appropriate for the user's tier
- Optional category/engine filter
- Use case: "teach me something new about gamedev" — serendipitous discovery
- **Why now:** Low effort, high delight. Good for demos and content marketing.

### Pricing changes
- None — $9/mo confirmed in Week A analysis. Hold until we have users to optimize for.

---

## v2.0.0 — Multi-Engine & Monetization (June–August 2026)

**Theme:** Unity module launch, agent-native features, real revenue.

### Features

#### Unity Module Launch (HIGH)
- Phase 1 (4 docs): unity-rules.md, E1 Architecture (Unity 6/URP focus), G1 Scene Setup, G2 MonoBehaviour Patterns
- Phase 2 (4 docs): G3 Input System, G4 Physics, G5 UI Toolkit, G6 ECS Intro
- Phase 3 (4 docs): G7 Addressables, G8 Shader Graph, G9 Animation, G10 Networking
- **Why v2.0:** Unity is the largest potential market but also the most complex (HDRP deprecated, ECS becoming core, Unity 6 breaking changes). Needs substantial prep. C# overlap with MonoGame accelerates creation.
- **Competitive note:** ZERO knowledge-layer MCP servers exist for Unity. 6+ editor-integration servers but nobody doing curated guides. We'd be first.

#### Streamable HTTP Transport (HIGH)
- MCP 2026 roadmap priority: evolving transport for remote services
- Migrate from stdio-only to support streamable HTTP (alongside stdio for local use)
- Enables: remote hosting, load balancing, session-less operation
- Required for: marketplace distribution (MCPize, MCP-Hive), enterprise adoption
- **Why v2.0:** Spec hasn't stabilized yet. Wait for MCP Working Group to land the SEPs, then adopt. Don't build on shifting sand.

#### `migration_guide` Tool (HIGH)
- Given source engine + target engine + concept, generate migration guidance
- "I'm moving my platformer from Unity to Godot — what changes?"
- Pulls from engine-specific docs + core theory to produce actionable migration steps
- **Why v2.0:** Needs 10+ docs in at least 2 engine modules to be useful. Can't ship until Unity or Godot is substantial.

#### Agent-Native Billing (MEDIUM)
- x402 / Google UCP — emerging protocols for AI-agent payments
- Per-call pricing as an alternative to subscription
- Potential: agents autonomously purchase Pro access when they need a doc
- **Why v2.0:** Protocols aren't ready for primetime in March 2026. Monitor, architect for it, don't build yet.

#### Team Tier ($29/mo) (MEDIUM)
- 5 seats, shared config
- Priority API rate limits
- Usage analytics dashboard (which docs are agents pulling most?)
- **Why v2.0:** Need individual traction first. Don't build team features before proving solo product-market fit.

#### Semantic Search Upgrade (MEDIUM)
- Replace TF-IDF with lightweight embedding-based search
- Options: Cloudflare Vectorize (Workers-native), local embeddings via transformers.js
- Enables: concept-level matching ("my character falls through the floor" → physics/collision docs)
- **Why v2.0:** TF-IDF is adequate at 130 docs. At 200+ docs with 3 engines, keyword matching breaks down. Invest when scale demands it.

#### `explain_error` Tool (LOW → MEDIUM)
- Paste a game engine error message → get relevant docs + fix suggestions
- Uses error pattern matching + search
- High-value for Godot (cryptic error messages are a known pain point)
- **Why v2.0:** Needs a curated error→solution mapping. Build as docs reach critical mass.

---

## v3.0.0 — Platform (2026 Q4+)

**Theme:** From tool to platform. Community content, Bevy module, API ecosystem.

### Speculative Features (subject to market validation)

#### Bevy Module
- Rust ECS engine — growing fast, AI-friendly (text-based, strong types)
- Wait for Bevy 0.15+ stability before investing
- Community might contribute if we open the content format

#### Community-Contributed Docs
- Standardized doc format + submission pipeline
- Review process for quality control
- Revenue share for Pro community docs?
- Risk: quality dilution. Mitigate with strict templates + editorial review.

#### IDE/Editor Plugins
- VS Code extension: one-click MCP server setup
- Cursor/Windsurf native listing
- Godot editor plugin (search docs from within engine)

#### Interactive Tutorials
- Step-by-step guides that verify code at each step
- "Build a platformer in Godot" with AI-guided progression
- Substantially more complex than docs — different product category

#### API Ecosystem
- Public API for third-party integrations
- Webhooks for new doc notifications
- Embeddable doc widgets for game dev blogs/courses

---

## Anti-Roadmap: Things We Won't Build

These come up repeatedly but are intentionally excluded:

| Idea | Why Not |
|------|---------|
| **Editor integration tools** (scene manipulation, node creation) | Crowded market (7+ Godot MCPs). Not our niche. |
| **Code generation** | AI models do this natively. We provide knowledge, not codegen. |
| **Asset generation** (sprites, audio, 3D models) | Completely different product. Ludo.ai does this. |
| **Engine-specific project scaffolding** | One-time use. Low recurring value. |
| **Chat/forum community** | Discord/Reddit exist. Don't build what already works. |
| **Video tutorials** | Different medium, different skills, different audience. |

---

## MCP Spec Alignment

Key MCP 2026 priorities that affect us:

| MCP Priority | Our Response | Timeline |
|-------------|-------------|----------|
| **Transport evolution** (streamable HTTP, stateless sessions) | Add HTTP transport alongside stdio in v2.0 | Q3 2026 |
| **Server metadata** (.well-known/mcp.json) | Early adopt in v1.1 — low effort, signals maturity | Now |
| **OAuth/Elicitation** | Watch — relevant for Workers API auth but LemonSqueezy keys work today | v2.0+ |
| **Agent communication** (Tasks primitive) | Not relevant yet — we're a knowledge server, not an agent orchestrator | v3.0+ |
| **Enterprise readiness** (governance, compliance) | Team tier addresses this | v2.0 |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-19 | $9/mo, LemonSqueezy | Matches Ref pricing, validated by Week A analysis |
| 2026-03-19 | Cloudflare Workers for API | Cheapest, global edge, generous free tier |
| 2026-03-20 | Section extraction before more content | Context efficiency is competitive differentiator |
| 2026-03-21 | Unity before Bevy | 10x larger market, C# overlap with MonoGame |
| 2026-03-21 | No editor integration | Deliberate niche focus — knowledge layer only |
| 2026-03-21 | HTTP transport waits for MCP spec stability | Don't build on shifting sand |
| 2026-03-21 | Delay semantic search until 200+ docs | TF-IDF adequate at current scale |
