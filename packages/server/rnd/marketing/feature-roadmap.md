# Feature Roadmap — gamecodex

**Created:** 2026-03-21 (Week B strategic rotation)  
**Last updated:** 2026-03-25 (Week B Cycle 2)

---

## Current State: v1.3.0 (local, GitHub suspended)

- **147 docs** across 3 modules (core 51, MonoGame 80, Godot 16)
- **10 MCP tools**: search_docs, get_doc, list_docs, list_modules, genre_lookup, compare_engines, migration_guide, random_doc, session, license_info
- **190 tests**, 28 suites, 1.5s runtime
- Godot module at **80%** (16/20 planned) — viable product
- MonoGame at **100%** genre coverage
- TF-IDF search with section extraction, maxLength, cross-engine filtering, synonym expansion
- Free/Pro tier gating via LemonSqueezy
- Module auto-discovery (zero-config engine additions)
- Cloudflare Workers API scaffolded + local smoke-tested (5 endpoints)
- Client-side caching (disk cache + stale fallback + hybrid provider)
- CI/CD pipeline (GitHub Actions, Node 18/20/22/24 matrix, CodeQL, Dependabot)
- Analytics conversion tracking (pro gate impressions, tool call timing, search recording)
- npm published at v1.0.0 only — **v1.3.0 NOT published (Day 9 overdue)**
- **🔴 GitHub account SUSPENDED** — all external distribution blocked

### What shipped since v1.0.0 (unpublished)
| Feature | Version | Status |
|---------|---------|--------|
| Section extraction + maxLength | v1.1.0 | ✅ Built, not published |
| Module auto-discovery + list_modules | v1.1.0 | ✅ Built, not published |
| Cross-engine search with engine filter | v1.2.0 | ✅ Built, not published |
| compare_engines tool | v1.2.0 | ✅ Built, not published |
| random_doc tool | v1.2.0 | ✅ Built, not published |
| migration_guide tool | v1.3.0 | ✅ Built, not published |
| list_docs summary mode | v1.1.0 | ✅ Built, not published |
| Client-side caching (disk + stale fallback) | v1.2.0 | ✅ Built, not published |
| Workers API scaffold + smoke test | v1.2.0 | ✅ Built, not published |
| Analytics/conversion tracking | v1.3.0 | ✅ Built, not published |
| Godot 0% → 80% (16 docs, 480KB) | v1.1–v1.3 | ✅ Built, not published |
| Search P1-P3 fixes + quality rounds 1-4 | v1.1.0 | ✅ Built, not published |
| 190 tests (from 19 at v1.0.0) | v1.1–v1.3 | ✅ Built, not published |

**The gap between what's built and what's shipped is the #1 strategic problem.**

---

## v1.3.0 — UNBLOCK & SHIP (NOW — immediate)

**Theme:** Remove the GitHub blocker, publish everything, get real users. Zero new features.

### Critical path (blocking order)
1. **🔴 Resolve GitHub suspension** — Wes contacts support.github.com. Check email for reason. Without this, steps 2-6 are impossible.
2. **🔴 `git push`** — 140 local commits queued. Single push catches up remote.
3. **🔴 `npm publish`** — v1.3.0 to npm. Manual publish if OIDC pipeline untested. Day 9 overdue.
4. **🟠 MCP registry submissions** — mcp.so, smithery.ai, mcpservers.org, LobeHub, Cline, awesome lists. All 9 drafts ready in `rnd/marketing/registry-submissions.md`.
5. **🟠 GitHub repo polish** — Topics, description, social preview image, .well-known/mcp.json.
6. **🟡 Launch posts** — DEV Community + r/aigamedev + r/gamedev. Drafts ready in `rnd/marketing/blog-post-launch.md`.

### Contingency (if GitHub suspension >1 week)
- [ ] Set up GitLab mirror for remote backup
- [ ] Verify npm auth is independent of GitHub (npm token vs GitHub OIDC)
- [ ] Prepare alternative repo URLs for registry submissions
- [ ] Consider npm publish from local if npm token works without GitHub

### Ship criteria
- npm download count > 0 (literally any real user)
- Listed on ≥3 MCP registries
- At least 1 community post published

### What we will NOT do in this phase
- No new docs. No new tools. No new features.
- The 147 docs and 10 tools are the product. Ship it.

---

## v1.4.0 — Polish & Learn (1-2 weeks after ship)

**Theme:** Respond to real user feedback. Fix what matters, not what we imagine.

### Planned (pending user signal)
- [ ] **Search P4: synonym map** — 10-15 entries for known gaps (chase→pathfind, follow→ai, spawn→pool). Highest-leverage search improvement remaining. ~30 min work.
- [ ] **Search P5: basic stemming** — "animations" ≠ "animation". Medium effort. Deferred until we know if users hit this.
- [ ] **Godot G14 Navigation** — last HIGH-priority gap, boosts 5 genres by 10-15% each
- [ ] **Godot G15 Particles** — completes visual effects coverage
- [ ] **Godot E3 Project Structure** — the planned doc that left broken links in E1
- [ ] **Godot E4 Autoloads & Singletons** — foundational pattern referenced everywhere
- [ ] **Schema efficiency audit** — Context7 scored F (1,020 tokens/2 tools). Audit our 10-tool schema, optimize descriptions to <200 chars each, market the grade.
- [ ] **list_modules in free tier** — metadata-only, no content leak. Improves discovery UX.
- [ ] **Bulk cross-reference pass** — 4 consecutive doc audits found the same issue: older docs lack backlinks to newer docs. One-time bulk fix.

### Metrics to watch
- npm weekly downloads → is anyone installing?
- Search query patterns → what are users actually looking for?
- Pro gate hit rate → what content drives upgrade interest?
- GitHub issues → what's broken/missing?
- Tool call distribution → which of our 10 tools get used?

### Decision gates
- **If downloads < 10/week after 2 weeks:** Problem is discovery, not product. Double down on registry submissions + community posts.
- **If downloads > 50/week but 0 Pro conversions:** Free tier too generous, or Pro content not compelling enough. Revisit tier gating.
- **If specific search queries consistently fail:** Add targeted synonym entries, don't rebuild search.
- **If Godot users dominate:** Prioritize Godot G14-G20 completion over Unity module.
- **If MonoGame users dominate:** Prioritize MonoGame polish over new engines.

---

## v2.0.0 — Unity Module & Monetization Live (June–August 2026)

**Theme:** Second engine, real revenue, API production deploy.

### Features

#### Unity Module Launch (HIGH) — ZERO knowledge-layer competitors exist
- **Phase 1** (4 docs): unity-rules.md, E1 Architecture (Unity 6/URP, NOT HDRP), G1 Scene Setup (GameObjects vs ECS decision), G2 MonoBehaviour Patterns
- **Phase 2** (4 docs): G3 Input System, G4 Physics, G5 UI Toolkit (not UGUI — deprecated), G6 ECS/DOTS Intro
- **Phase 3** (4 docs): G7 Addressables, G8 Shader Graph, G9 Animation (Animator + Timeline), G10 Networking (Netcode for GameObjects)
- **Why v2.0:** Unity 6.4 made ECS core (not optional), HDRP is maintenance-only, CoreCLR coming in 6.8, UI Toolkit replacing UGUI. Four simultaneous paradigm shifts = massive "which pattern is correct?" confusion that AI agents get wrong. unity-rules.md constraining AI to 2026 patterns is the single highest-leverage doc we can create.
- **Competitive moat:** Unity has 8+ editor-integration MCPs, ZERO knowledge-layer MCPs. Unity AI Beta adding MCP Gateway means every Unity dev will learn what MCP is → awareness for third-party knowledge servers.
- **Timing:** STS2 + CS2 narrative ("Godot ships $92M hits while Unity's biggest game failed") is peak. Unity devs exploring alternatives need cross-engine comparison docs.

#### Cloudflare Workers API — Production Deploy (HIGH)
- Deploy to production (workers.dev subdomain or custom domain)
- KV populated with all 147+ docs
- Real rate limiting, real tier gating, real caching
- **Why v2.0:** Server-side Pro gating is the monetization foundation. Client-side gating is trivially bypassed.
- Scaffold + smoke test already done (Day 8). Deployment is infrastructure setup, not code.

#### LemonSqueezy Subscription Live (HIGH)
- $9/mo or $79/yr (27% annual discount)
- Product page on LemonSqueezy
- License validation integrated (already coded, needs production keys)
- Setup guide created at `rnd/marketing/lemonsqueezy-setup.md`
- **Why v2.0:** Can't have Pro users without a payment method. This is table stakes.

#### Godot Module to 100% (MEDIUM)
- Remaining 4 docs: G14 Navigation, G15 Particles, E3 Project Structure, E4 Autoloads
- Brings module to 20/20 planned
- **Why v2.0:** Completeness is a marketing message. "Full Godot coverage" > "80% Godot coverage."

### Pricing updates
- $9/mo validated by 5+ external data points (Ref, Talk Python MCP, GodotIQ, Ludo.ai, Figma credits)
- **NEW: Dual-model architecture planned** — subscription for humans (LemonSqueezy $9/mo), per-call for agents (x402 paidTool wrapper, $0.01/search, $0.03/get_doc) as PAYG tier
- x402-mcp npm package exists (Vercel, Apache 2.0) — ~5 lines to add PAYG to any tool
- Stripe MPP launched March 18 (50+ services) — native MCP transport binding available
- PAYG deferred to v2.0 launch or v2.1 — need human subscriber data first before adding agent pricing

---

## v2.5.0 — Agent-Native & Scale (Q4 2026)

**Theme:** Meet agents where they are. Scale to 200+ docs with better search.

### Features

#### Bevy Module (MEDIUM)
- Start with bevy-rules.md (standalone viral potential, like godot-rules.md)
- 6-doc focused module (not 20 like Godot/Unity) — Bevy's 3-month breaking release cycle makes broad docs a maintenance burden
- E1 Architecture (ECS-first), G1 System Ordering, G2 State Management, G3 Asset Loading, G4 UI (biggest community pain), G5 Audio
- Market bigger than estimated: 44K+ GitHub stars (~40% of Godot's)
- ZERO knowledge-layer Bevy MCPs (100% whitespace after 6 research rotations)
- **Timing risk:** 0.19-dev already in CI. bevy-rules.md should ship BEFORE 0.19 to capture the 0.18→0.19 transition window

#### Semantic Search (MEDIUM)
- Replace/augment TF-IDF with lightweight embeddings
- Options: Cloudflare Vectorize (Workers-native), local transformers.js
- Enables concept-level matching: "my character falls through the floor" → physics/collision docs
- **Why v2.5:** TF-IDF adequate at 147 docs. At 200+ docs with 3 engines, keyword matching breaks down.

#### Agent-Native Billing (MEDIUM)
- x402 paidTool overlay for PAYG
- Stripe MPP for session-based streaming payments
- Per-call: $0.01/search, $0.03/get_doc, $0.10/migration_guide
- **Why v2.5:** Need subscription data first. Agent-only users who'd never visit a pricing page need a way to pay.

#### Streamable HTTP Transport (MEDIUM)
- MCP 2026 roadmap priority: stateless HTTP transport for remote services
- Add alongside stdio (not replacing it)
- Enables: marketplace distribution (MCPize, MCP-Hive), load balancing, enterprise adoption
- **Why v2.5:** MCP spec Working Groups still iterating. Wait for stability, then adopt quickly.

#### `explain_error` Tool (LOW → MEDIUM)
- Paste engine error message → get relevant docs + fix suggestions
- High-value for Godot (cryptic errors) and Unity (ECS/DOTS confusion)
- Needs curated error→solution mapping

#### AGENTS.md + Claude Code Skill Packaging (MEDIUM)
- Add AGENTS.md to repo root for agent-native discovery
- Package as Claude Code Skill for Stripe/Cloudflare-style distribution
- Karpathy's "Build. For. Agents." — this is the MCP equivalent of "mobile first"

---

## v3.0.0 — Platform (2027+)

**Theme:** From tool to platform. Community, ecosystem, enterprise.

### Speculative
- Community-contributed docs with review pipeline + revenue share
- IDE/editor plugins (VS Code one-click setup, Godot editor plugin)
- Interactive tutorials with AI-guided progression
- Public API + webhooks for third-party integrations
- Team tier ($29/mo, 5 seats, usage analytics)
- Enterprise tier (SSO, audit trails, self-hosted)

---

## Anti-Roadmap: Things We Won't Build

| Idea | Why Not |
|------|---------|
| **Editor integration tools** (scene manipulation, node creation) | Crowded market (10+ Godot MCPs, 8+ Unity). Not our niche. |
| **Code generation** | AI models do this natively. We provide knowledge, not codegen. |
| **Asset generation** (sprites, audio, 3D models) | Different product entirely. Ludo.ai does this. |
| **Engine-specific project scaffolding** | One-time use. Low recurring value. |
| **Chat/forum community** | Discord/Reddit exist. Don't build what works. |
| **Video tutorials** | Different medium, different audience. |
| **Broad docs MCP** (competing with Context7) | Gamedev niche is our moat. Context7 has 240K weekly downloads but generic = shallow. |

---

## Market Timing Notes (updated 2026-03-25)

### Tailwinds
- **All major IDEs support MCP natively** — Claude Code, Cursor, Copilot, Windsurf, Codex, Qwen Code. TAM = entire AI-assisted dev population.
- **97M monthly MCP SDK downloads** (Feb 2026). Protocol entrenched.
- **95% of game studios use AI** (Unity 2026 report). 36% of individual devs (GDC 2026).
- **STS2 $92M on Godot** — biggest indie launch in history. Godot credibility at all-time high.
- **Claude Code postmortem (viral r/ClaudeCode)** — senior dev maintained CLAUDE.md + architecture .md files = exactly what our MCP replaces.
- **Talk Python MCP** — paid education content delivered via MCP. Direct business model validation.
- **Stripe MPP + x402** — agent-native payments now production-ready.
- **MCP security crisis benefits us** — 7,000 exposed HTTP servers, RSAC "unfixable" verdict. Our stdio-only transport is the antidote.
- **Context7 scored F on schema quality** (1,020 tokens/2 tools). Our lean 10-tool server is the counterexample.

### Headwinds
- **GitHub account suspended** — all distribution frozen.
- **npm v1.0.0 stale for 9 days** — every day without publishing wastes the STS2 hype window.
- **Anti-AI sentiment in r/godot** — friendly fire pattern (competent devs accused of AI usage). Launch framing must avoid AI as headline.
- **Claude Code lazy MCP loading** (v2.1.7) — reduces context by 95-99%, partially neutralizes "lean server" advantage for Claude users. Cursor/Windsurf/Copilot don't have this yet.
- **MCP fatigue emerging** — users complaining about too many servers. Position as "the ONE knowledge server" not "another MCP."
- **Perplexity dropped MCP internally** (72% context waste) — but from Apideck's 40-tool servers, not 7-tool servers like ours.

### Time-sensitive windows
- **STS2 Godot hype** — still active (AllKeyShop article Mar 25), but fading. Ship within 1-2 weeks to ride it.
- **Bevy 0.18→0.19 transition** — bevy-rules.md has highest value during the transition period when old patterns break.
- **Unity 6.4 confusion** — ECS-as-core just landed. Unity devs are asking "which pattern?" RIGHT NOW.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-19 | $9/mo, LemonSqueezy | Matches Ref pricing, validated by 5+ data points |
| 2026-03-19 | Cloudflare Workers for API | Cheapest, global edge, generous free tier |
| 2026-03-20 | Section extraction before more content | Context efficiency is competitive differentiator |
| 2026-03-21 | Unity before Bevy | 10x larger market, C# overlap with MonoGame |
| 2026-03-21 | No editor integration | Deliberate niche focus — knowledge layer only |
| 2026-03-21 | HTTP transport waits for MCP spec stability | Don't build on shifting sand |
| 2026-03-21 | Delay semantic search until 200+ docs | TF-IDF adequate at current scale |
| 2026-03-24 | Dual-model pricing (sub + PAYG) | x402 + Stripe MPP now production-ready; agent-only users need a payment path |
| 2026-03-25 | v1.3.0 = ship-only, zero new features | 9 days of unpublished work. Distribution debt > content debt. |
| 2026-03-25 | bevy-rules.md may ship before full module | Standalone viral potential + 0.18→0.19 window closing |
| 2026-03-25 | r/godot launch avoids "AI" in headline | Anti-AI friendly fire pattern makes AI framing toxic |
| 2026-03-25 | Schema efficiency is a marketing dimension | Context7 F-grade article created public benchmark |

---

## Progress vs Original Roadmap (March 21 → March 25)

| Original v1.1 item | Status |
|---------------------|--------|
| npm publish | ❌ BLOCKED (GitHub suspended) |
| Registry submissions | ❌ BLOCKED (need working GitHub URLs) |
| Godot E2 GDScript vs C# | ✅ Done (33KB) |
| Godot G4 Input Handling | ✅ Done (43KB) |
| Search P4 stemming | ⏳ Deferred to v1.4 |

| Original v1.2 item | Status |
|---------------------|--------|
| Cross-engine search | ✅ Done |
| Workers API deploy | ⏳ Scaffold done, deploy blocked |
| Godot to 50% | ✅ Done — hit **80%** |
| compare_engines tool | ✅ Done |
| combat-theory.md | ✅ Done (34KB) |
| random_doc tool | ✅ Done |

| Original v2.0 item | Status |
|---------------------|--------|
| Unity module | ⏳ Research done, creation not started |
| migration_guide tool | ✅ Done (was planned for v2.0, shipped v1.3) |
| Streamable HTTP | ⏳ Correctly deferred |
| Agent-native billing | ⏳ Architecture planned, x402 path identified |
| Semantic search | ⏳ Correctly deferred |

**Summary:** We've built 80% of the original v1.2 and pulled features from v2.0, but shipped 0% to users. The product is ahead of schedule internally and behind schedule externally. One GitHub suspension fix unlocks everything.
