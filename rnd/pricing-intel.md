# Pricing Intelligence

Bi-weekly competitor pricing, MCP monetization landscape, and analytics.
**Last updated:** 2026-03-20 (Week A rotation)

---

## 🎯 Recommended Pricing Structure (v1.0)

Based on competitive analysis, market positioning, and MCP monetization trends.

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

### Why $9/mo (Not $5, Not $12)

- **$5** (Godot MCP Pro's price): One-time purchase for editor integration. Our recurring value (growing docs library, new engines, search improvements) justifies subscription pricing. $5/mo feels too cheap for "permanent gamedev brain" positioning.
- **$9/mo** (Ref's price): Exact match to the only other paid docs MCP server. Proven willingness-to-pay at this tier. Low enough for indie devs, high enough to signal quality.
- **$12/mo**: Pushes past psychological barrier for indie devs. No competitive precedent at this tier for docs-only MCP. Save for when we add Team features.

---

## Competitive Pricing Landscape (March 2026)

### Paid Gamedev MCP Servers

| Server | Price | Model | Tools | Category |
|--------|-------|-------|-------|----------|
| **Godot MCP Pro** | $5 one-time | Lifetime license | 162 tools (v1.4) | Editor integration |
| **GDAI MCP** | $19 one-time | Lifetime license | ~30 tools | Editor integration + screenshots |
| **Ludo.ai MCP** (NEW) | Subscription plans (credits) | Credit-based on paid plans | API + MCP beta | AI game asset generation |
| **gamedev-mcp-server** (us) | $9/mo planned | Subscription | 6 tools | Knowledge/docs |

**Key insight:** We're the ONLY subscription-priced gamedev MCP server. Editor integration tools are one-time purchases because their value is static (connect AI to editor). Our value grows over time (new docs, new engines, improved search), which justifies recurring pricing.

### Paid Non-Gamedev MCP Servers (Pricing Templates)

| Server | Price | Model | Notes |
|--------|-------|-------|-------|
| **Ref** (ref.tools) | $9/mo for 1,000 credits | Credit subscription | Closest template — docs-focused MCP |
| **Firecrawl** | From $16/mo + free tier | Subscription | Web scraping/research |
| **Tavily** | ~$0.01/search | Usage-based | Web search for AI |
| **Exa** | ~$0.01/search | Usage-based | Neural web search |
| **Ahrefs MCP** | Part of plans ($99+/mo) | Feature of existing SaaS | SEO tools — 500K-2M API units |
| **SegmentStream** | Requires subscription | Platform subscription | Marketing analytics |
| **Zapier MCP** | Task-based billing on all plans | Usage on subscription | Automation (MCP calls = tasks) |

### MCP Monetization Platforms (Updated March 2026)

| Platform | Model | Rev Share | Status | Relevance |
|----------|-------|-----------|--------|-----------|
| **MCPize** | Managed marketplace | 85/15 | Active, 350+ servers | Secondary distribution channel |
| **MCP-Hive** (NEW) | Per-call pricing marketplace | TBD | Just launched (Feb 2026) | Very early, worth monitoring |
| **xpay.sh** | Zero-code pay-per-call proxy | Developer sets prices | Active | Overlay option for metered tier |
| **MCP Billing Spec** | Open standard | N/A (self-hosted) | Emerging | Future-proofing reference |
| **Stripe + Cloudflare** | Native integration | Standard Stripe fees | Production-ready | Primary implementation path |
| **LemonSqueezy** | MoR (now Stripe-owned) | 5% + $0.50/tx | Active but evolving | Current plan, needs backup |

### Payment Platform Recommendation

**Primary: LemonSqueezy** (current plan — still viable)
- Handles tax, compliance, license keys out of the box
- 5% + $0.50 per transaction
- License key API already integrated in our `src/license.ts`
- Post-Stripe acquisition has NOT broken functionality, just brand concerns

**Backup: Creem.io**
- Spiritual successor to pre-acquisition LemonSqueezy
- Built for indie hackers, SaaS founders, AI builders
- Merchant of Record with similar feature set
- 10% flat fee (higher than LS but simpler)

**Secondary channel: MCPize marketplace**
- List Pro tier on MCPize for discovery (85/15 split)
- Users who find us there convert; direct users get full margin
- No code changes needed — just listing

**Future: xpay.sh metered overlay**
- Could add a "pay-as-you-go" option ($0.02/search, $0.05/get_doc)
- Zero code changes to our server
- Would serve price-sensitive users who don't want monthly commitment
- Wait until we have subscriber base to avoid cannibalizing subscriptions

---

## Market Context

### MCP Monetization is Maturing Rapidly

- **11,400+ MCP servers exist**, less than 5% monetized
- **MCP-Hive** just launched as a new monetization marketplace (per-call pricing)
- **MCP Registry** roadmap includes native billing capabilities
- **Google UCP** and **x402** pushing agent-native payments (not ready yet)
- **Ludo.ai** entered the gamedev MCP space with credit-based pricing on subscription plans — validates credit models in gamedev

### The $9/mo Sweet Spot

Cross-referencing all available pricing data, $9/mo emerges as the convergence point:
- Ref (docs MCP): $9/mo ✓
- SuperWhisper Pro: $8.49/mo (BYOK transcription)
- Firecrawl starts at $16/mo (but does more than docs)
- Indie dev tools typically range $5-15/mo
- Below $10/mo = impulse purchase for working developers
- Above $10/mo = requires justification conversation

### Annual Pricing Psychology

$79/yr (vs $108/yr if monthly) = 27% savings. Industry standard discount range is 15-30%.
- Signal: "This is for serious users" 
- Lock-in: 12-month commitment reduces churn
- Cash flow: Upfront payment helps bootstrap

---

## 📋 Action Items

1. **Implement daily search limit (50/day) for free tier** — Replaces credit ledger with simpler per-day counter
2. **Add annual billing option** — $79/yr alongside $9/mo
3. **Set up LemonSqueezy product page** — Define Free vs Pro tiers, configure license key variants
4. **List on MCPize as secondary channel** — After v1.0 Pro is live
5. **Monitor MCP-Hive** — New entrant, could be relevant if it gains traction
6. **Evaluate xpay.sh overlay** — After launch, consider adding metered tier
7. **Prepare Creem.io backup** — Have account ready if LemonSqueezy changes terms post-Stripe

---

## Historical Notes

### 2026-03-18 — Initial Research
- Discovered 6+ payment platforms competing for MCP monetization
- Ref identified as closest pricing template ($9/mo, credit-based, docs-focused)
- LemonSqueezy acquired by Stripe (Oct 2024) — still functional but alternatives emerging
- "Less than 5% monetized" = massive whitespace for paid MCP servers

### 2026-03-20 — Week A Pricing Analysis
- Added MCP-Hive as new monetization platform (launched Feb 2026)
- Ludo.ai entered gamedev MCP space with credit-based subscription pricing
- Confirmed $9/mo price point with cross-market validation
- Designed 3-tier structure (Free/Pro/Team) with rationale
- Recommended hybrid free tier: daily limit + module gating
- LemonSqueezy still recommended as primary with Creem.io backup
