# Pricing Intelligence

Bi-weekly competitor pricing, MCP monetization landscape, and analytics.
**Last updated:** 2026-03-24 (Week A rotation, Cycle 2)

---

## 🎯 Recommended Pricing Structure (v1.0) — CONFIRMED

Based on competitive analysis, market positioning, and MCP monetization trends.
**No changes from Cycle 1.** $9/mo validated by 3 additional data points this week.

### Tier Design

| Tier | Price | Access | Rationale |
|------|-------|--------|-----------|
| **Free** | $0 | Core docs (MonoGame architecture, programming concepts), 50 searches/day, `list_docs` + `search_docs` + `get_doc` (core only) | Generous enough to hook users. Daily limit prevents agent abuse while allowing genuine evaluation. |
| **Pro** | $9/mo or $79/yr (save 27%) | ALL docs (MonoGame + Godot + future engines), unlimited searches, `genre_lookup`, `session` copilot, section extraction, full `get_doc` on all modules | Matches Ref's validated $9/mo price point. Annual discount encourages commitment. |
| **Team** (future v2.0) | $29/mo | 5 seats, shared config, priority support, API access for CI/CD integration | Wait until individual traction proves demand. |

### Free Tier Philosophy

**Credit-based > time-based > feature-gated alone.**

Ref's "200 credits that never expire" model is the gold standard for MCP servers because:
1. Agent usage patterns are wildly variable — some devs run 500 queries/day, others 5/week
2. Time-limited trials punish slow evaluators and reward bots
3. Credits that never expire = zero pressure, maximum goodwill
4. Conversion happens when users hit the wall naturally, not artificially

**Our hybrid approach:** Daily search limit (50/day) + module gating (core only for free). This is simpler to implement than a credit ledger while achieving similar outcomes. The daily reset means a free user can use it indefinitely for basic work but hits friction on serious projects needing Godot/future engine docs.

### Why $9/mo (Not $5, Not $12) — Further Validated

- **$5** (Godot MCP Pro's price): One-time purchase for editor integration. Our recurring value (growing docs library, new engines, search improvements) justifies subscription pricing. $5/mo feels too cheap for "permanent gamedev brain" positioning.
- **$9/mo** (Ref's price): Exact match to the only other paid docs MCP server. Proven willingness-to-pay at this tier. Low enough for indie devs, high enough to signal quality.
- **$12/mo**: Pushes past psychological barrier for indie devs. No competitive precedent at this tier for docs-only MCP. Save for when we add Team features.

**New validation (Cycle 2):**
- Figma AI credits enforcement (March 18, 2026) — subscription + PAYG model, shows credit-based AI pricing becoming standard across tools
- Windsurf dropped credits for flat quotas — simplification trend favors our flat $9/mo over complex credit systems
- Talk Python MCP ($9-29/mo range) — educational content delivered via MCP, validates paid-knowledge-via-MCP at our exact price range
- Forbes analysis of AI product pricing: "Below $10/mo = impulse purchase for working developers" — our price sits in the sweet spot

---

## 🚨 MAJOR UPDATE: Agent-Native Payments Have Arrived

### Stripe Machine Payments Protocol (MPP) — Launched March 18, 2026

**The single biggest shift in MCP monetization since we started tracking.**

Stripe + Tempo co-launched MPP: session-based streaming payments for AI agents. Already implemented across 50+ services including OpenAI, Anthropic, Google Gemini, Dune.

**How it works:**
1. Agent requests a resource (API, MCP server, data feed)
2. Server responds with payment request
3. Agent authorizes payment from its wallet (session-based spending limit)
4. Transaction settles instantly (sub-second finality on Tempo chain)
5. Resource delivered — no accounts, no pricing pages, no checkout

**Why this matters for us:**
- MPP has a **native MCP transport binding** — MCP servers can charge per tool call using error code `-32042`
- Session model supports subscription-equivalent behavior (pre-authorize $9, stream calls against it)
- Stripe compliance stack (Radar fraud detection, tax handling, reporting) included by default
- Hybrid fiat + crypto via Shared Payment Tokens (USDC on Tempo or linked Visa card)

**Assessment:** MPP is the first agent payment protocol mature enough for production. But it's enterprise-grade setup. For our v1 launch, LemonSqueezy remains the right choice for human-initiated subscriptions. MPP becomes relevant when AI agents are independently discovering and paying for MCP servers — likely 6-12 months out for indie gamedev tooling.

### x402 Protocol — Now with MCP-Native Integration

**x402-mcp** (by Vercel) launched: npm package with `paidTool` primitive. ~5 lines of code to monetize any MCP tool at any price point ($0.001/call upward). Apache 2.0, governed by x402 Foundation (Coinbase + Cloudflare).

**Key difference from MPP:**
- x402 = one transaction per request (simple, stateless, open protocol)
- MPP = session-based streaming (high-throughput, Stripe compliance included)
- x402 = best for discrete bounded operations (search, lookup, transform)
- MPP = best for high-frequency agent traffic (thousands of calls/hour)

**Assessment for gamedev-mcp-server:**
Our tool calls are discrete and bounded (`search_docs`, `get_doc`, `genre_lookup`). x402's `paidTool` wrapper fits perfectly — could add per-call pricing to individual tools as a PAYG tier alongside subscriptions. The ~5 lines of integration makes this technically trivial.

**AWS published x402 integration guide** (March 21) — CloudFront + Lambda@Edge for monetizing any HTTP app. Enterprise legitimacy confirmed.

### Agent Payment Landscape Summary (March 2026)

| Protocol | Launched | Backed By | Model | MCP Support | Status |
|----------|----------|-----------|-------|-------------|--------|
| **x402** | Late 2025 | Coinbase + Cloudflare | Per-request | First-class (`paidTool`) | Production-ready |
| **Stripe MPP** | March 18, 2026 | Stripe + Tempo | Session streaming | Transport binding | Production, 50+ services |
| **Google UCP** | Concept stage | Google | TBD | Unclear | Not ready |
| **MCP Billing Spec** | Draft | Community | Open standard | Native | Emerging spec |
| **Masumi** | Active | Community | Protocol-level | Unclear | Niche |

### Strategic Recommendation: Dual-Model Architecture

**Near-term (v1 launch):** LemonSqueezy subscription ($9/mo) for human developers
**Medium-term (v1.5):** Add x402 `paidTool` overlay for PAYG tier ($0.01/search, $0.03/get_doc)
**Long-term (v2.0):** MPP session support when agent-initiated discovery is common

The dual model (subscription for humans, per-call for agents) is now technically feasible and strategically sound. x402-mcp makes the PAYG tier nearly zero-effort to add.

---

## Competitive Pricing Landscape (Updated March 24, 2026)

### Paid Gamedev MCP Servers

| Server | Price | Model | Tools | Category |
|--------|-------|-------|-------|----------|
| **Godot MCP Pro** | $5 one-time | Lifetime license | 162 tools (v1.4) | Editor integration |
| **GDAI MCP** | $19 one-time | Lifetime license | ~30 tools | Editor integration + screenshots |
| **GodotIQ** | Freemium (22 free + 13 paid) | Intelligence layer upsell | 35 tools | Editor integration + spatial AI |
| **Ludo.ai MCP** | Subscription plans (credits) | Credit-based on paid plans | API + MCP beta | AI game asset generation |
| **gamedev-mcp-server** (us) | $9/mo planned | Subscription | 10 tools | Knowledge/docs |

**Key insight:** We remain the ONLY subscription-priced gamedev MCP knowledge server. Editor integration tools are one-time purchases because their value is static. Our value grows over time (new docs, new engines, improved search), which justifies recurring pricing. The gap between one-time ($5-19) and subscription ($9/mo) reflects the value model difference: tools vs. knowledge.

**New entrant: GodotIQ** adopted freemium model (22 free tools + 13 paid "intelligence layer"). This is the closest pricing model to ours in the gamedev MCP space — spatial analysis, dependency graphs, signal flow tracing behind a paywall. Different category (editor integration, not knowledge) but validates tiered access in gamedev MCPs.

### Paid Non-Gamedev MCP Servers (Pricing Templates)

| Server | Price | Model | Notes |
|--------|-------|-------|-------|
| **Ref** (ref.tools) | $9/mo for 1,000 credits | Credit subscription | Closest template — docs-focused MCP |
| **Talk Python MCP** (NEW) | ~$9-29/mo (est.) | Subscription | Educational content via MCP — directly validates paid-knowledge-via-MCP |
| **Firecrawl** | From $16/mo + free tier | Subscription | Web scraping/research |
| **Tavily** | ~$0.01/search | Usage-based | Web search for AI |
| **Exa** | ~$0.01/search | Usage-based | Neural web search |
| **Ahrefs MCP** | Part of plans ($99+/mo) | Feature of existing SaaS | SEO tools — 500K-2M API units |
| **Zapier MCP** | Task-based billing on all plans | Usage on subscription | Automation (MCP calls = tasks) |

**NEW: Talk Python MCP** is the strongest external validation yet for our business model. A well-known Python educator chose MCP as a delivery mechanism for premium educational content. If it works for Python courses, it works for gamedev knowledge.

### MCP Monetization Platforms (Updated March 2026)

| Platform | Model | Rev Share | Status | Relevance |
|----------|-------|-----------|--------|-----------|
| **MCPize** | Managed marketplace | 85/15 | Active, 350+ servers | Secondary distribution channel |
| **MCP-Hive** | Per-call pricing marketplace | TBD | Launched Feb 2026 | Very early, monitoring |
| **xpay.sh** | Zero-code pay-per-call proxy | Developer sets prices | Active | Overlay option for metered tier |
| **x402-mcp** (NEW) | Per-tool-call via x402 protocol | No rev share (open protocol) | Production-ready | **Best PAYG option for us** |
| **Stripe MPP** (NEW) | Session-based agent payments | Standard Stripe fees | Live, 50+ services | Future agent-native billing |
| **MCP Billing Spec** | Open standard | N/A (self-hosted) | Emerging | Future-proofing reference |
| **Stripe + Cloudflare** | Native integration | Standard Stripe fees | Production-ready | Primary implementation path |
| **LemonSqueezy** | MoR (Stripe-owned) | 5% + $0.50/tx | Active but evolving | Current plan, needs backup |

### Payment Platform Recommendation (Updated)

**Primary: LemonSqueezy** (current plan — still viable for v1)
- Handles tax, compliance, license keys out of the box
- 5% + $0.50 per transaction
- License key API already integrated in our `src/license.ts`
- Post-Stripe acquisition has NOT broken functionality

**PAYG tier: x402-mcp** (NEW recommendation for v1.5)
- `paidTool` primitive wraps existing MCP tools in ~5 lines
- $0.01/search, $0.03/get_doc pricing = accessible PAYG option
- Open protocol (Apache 2.0), no rev share, no platform dependency
- Works alongside subscription — doesn't cannibalize because different use case (agents vs humans)

**Backup: Creem.io** (confirmed upgrade from LS)
- "Spiritual successor to what LemonSqueezy was supposed to be" — Creem's own positioning
- Built for indie hackers, SaaS founders, AI builders
- 10% flat fee (higher than LS but simpler)
- Multiple reviews confirm Creem is a genuine upgrade for new projects
- Recommended if LemonSqueezy deteriorates post-acquisition

**Future: Stripe MPP** (v2.0+ for agent-native payments)
- Session-based streaming for high-frequency agent traffic
- Full Stripe compliance stack included
- Relevant when AI agents independently discover and pay for tools

---

## Market Context (Cycle 2 Updates)

### MCP Monetization Has Crossed the Production Threshold

The landscape shifted fundamentally in the 4 days since our last analysis:

1. **Stripe MPP launched (March 18)** — First major payment company to ship agent-native payments. 50+ services already integrated. Forbes: "signals machine-to-machine commerce era."
2. **x402-mcp npm package** — Vercel built first-class MCP integration. Per-tool-call pricing is now a one-liner.
3. **AWS published x402 integration guide** — CloudFront + Lambda@Edge. Enterprise adoption path clear.
4. **4 competing agent payment protocols** now exist (x402, MPP, AP2, ACP). Market is racing toward standardization.

**Before:** "Agent-native payments are emerging — not ready for primetime."
**Now:** "Agent-native payments are live in production. The question is WHEN to adopt, not IF."

### The $9/mo Sweet Spot — Reconfirmed

Cross-referencing all available pricing data, $9/mo emerges as the convergence point:
- Ref (docs MCP): $9/mo ✓
- Talk Python MCP: $9-29/mo range ✓
- SuperWhisper Pro: $8.49/mo (BYOK transcription)
- Firecrawl starts at $16/mo (but does more than docs)
- Indie dev tools typically range $5-15/mo
- Below $10/mo = impulse purchase for working developers
- Above $10/mo = requires justification conversation

**NEW insight (Figma AI credits):** Figma's March 18 enforcement of AI credit limits (subscription + PAYG options) normalizes credit-based AI pricing across the entire design/dev tool ecosystem. Our hybrid model (daily limit + module gating + subscription unlock) aligns with this industry trend.

**NEW insight (AI product pricing analysis):** Anthropic's $17/$100/$200 tier structure works because "a casual user and a Claude Code developer aren't light and heavy versions of the same behavior." Same principle applies to us: a free-tier user exploring docs and a Pro user deep in a Godot project are fundamentally different behaviors, not different volumes.

### Schema Efficiency as Pricing Advantage

Our 10-tool / 829-token schema is now a **marketing-grade pricing differentiator**:
- Context7 (50K⭐, #1 MCP): 2 tools, 1,020 tokens, F grade
- GoPeak Godot MCP: 95+ tools, ~8,000+ tokens (est.)
- Us: 10 tools, 829 tokens, A grade

The "context window tax" narrative (Perplexity CTO, DEV Community articles, mcp-cli tool) means every MCP user is now aware that tool schemas eat their context budget. Our efficiency is both a product feature AND a pricing argument: "You're paying for the context window your model uses. Our server uses 83 tokens per tool. Theirs uses 510."

### Annual Pricing Psychology

$79/yr (vs $108/yr if monthly) = 27% savings. Industry standard discount range is 15-30%.
- Signal: "This is for serious users"
- Lock-in: 12-month commitment reduces churn
- Cash flow: Upfront payment helps bootstrap

---

## 📋 Action Items

### Immediate (v1 Launch)
1. **~~Implement daily search limit (50/day) for free tier~~** — Already implemented
2. **Add annual billing option** — $79/yr alongside $9/mo on LemonSqueezy
3. **Set up LemonSqueezy product page** — Define Free vs Pro tiers, configure license key variants
4. **List on MCPize as secondary channel** — After npm v1.2.0+ is live

### Near-term (v1.5 — 4-6 weeks post-launch)
5. **Add x402-mcp `paidTool` overlay** — $0.01/search, $0.03/get_doc PAYG tier
6. **Evaluate dual pricing UX** — Subscription users get unlimited, PAYG users pay per call
7. **Monitor MPP adoption** — Track which MCP servers integrate MPP and what pricing they set

### Long-term (v2.0)
8. **Stripe MPP integration** — When agent-initiated discovery becomes common
9. **Team tier ($29/mo)** — When individual traction proves demand
10. **Prepare Creem.io backup** — Have account ready if LemonSqueezy changes terms

---

## Historical Notes

### 2026-03-18 — Initial Research
- Discovered 6+ payment platforms competing for MCP monetization
- Ref identified as closest pricing template ($9/mo, credit-based, docs-focused)
- LemonSqueezy acquired by Stripe (Oct 2024) — still functional but alternatives emerging
- "Less than 5% monetized" = massive whitespace for paid MCP servers

### 2026-03-20 — Week A Pricing Analysis (Cycle 1)
- Added MCP-Hive as new monetization platform (launched Feb 2026)
- Ludo.ai entered gamedev MCP space with credit-based subscription pricing
- Confirmed $9/mo price point with cross-market validation
- Designed 3-tier structure (Free/Pro/Team) with rationale
- Recommended hybrid free tier: daily limit + module gating
- LemonSqueezy still recommended as primary with Creem.io backup

### 2026-03-24 — Week A Pricing Analysis (Cycle 2)
- **MAJOR: Stripe MPP launched** (March 18) — first production agent-native payment protocol, 50+ services
- **MAJOR: x402-mcp npm package** — per-tool-call pricing for MCP in ~5 lines of code
- **AWS published x402 guide** — enterprise-grade agent payment infrastructure now real
- Added Talk Python MCP as pricing template ($9-29/mo educational content via MCP)
- Figma AI credits enforcement validates credit-based pricing across industry
- Creem.io confirmed as genuine LemonSqueezy upgrade by multiple independent reviews
- **Strategic shift**: Dual-model architecture now recommended (subscription + PAYG)
- x402-mcp replaces xpay.sh as recommended PAYG layer (open protocol, no rev share, MCP-native)
- $9/mo price point revalidated with 3 additional data points
- Schema efficiency (829 tokens / 10 tools) now classified as pricing-grade competitive advantage
