# User Persona Analysis — gamedev-mcp-server

**Created:** 2026-03-22 (Week D strategic rotation)  
**Last updated:** 2026-03-22  
**Data sources:** GDC 2026 State of Industry (2,300 respondents), community research (r/gamedev, r/godot, r/ClaudeCode, HN, Godot Forum, DEV Community), competitive analysis (Godogen, GoPeak, Ref, GDAI MCP), pricing intel, and 8 days of cron-session observation.

---

## Market Context (March 2026)

- **36% of game devs** use generative AI tools at work (GDC 2026 survey)
- **52% believe AI harms the industry** — but this targets visible AI output (art, localization), not invisible dev tooling
- **Only 5% deploy AI on player-facing features** — devs don't trust AI output quality for end users
- **Engine split:** Unreal 42%, Unity 30%, Godot 11% (indie-heavy), custom/other 17%
- **Studio composition:** 45% indie studios, 31% AAA, 18% AA, 6% co-dev
- **Demographics (GDC respondents):** 64% male, 67% white, 54% US-based (acknowledged as non-representative)
- **AI coding tool landscape:** Claude Code ($2.5B run rate, 300K+ biz customers), Cursor (pivoting to autonomous agents), Copilot (enterprise mandated), Windsurf, Cline (open-source)
- **97M monthly MCP SDK downloads** — protocol is entrenched

---

## Primary Personas

### 🎯 Persona 1: "The Solo Shipper" (PRIMARY TARGET)

**Profile:**
- Solo indie dev or 2-3 person team
- 1-5 years gamedev experience, stronger in one area (art OR code, rarely both)
- Uses Godot (migrated from Unity post-pricing crisis) or sticking with Unity
- Age 22-35, self-funded or small savings, working evenings/weekends or recently went full-time
- Pays for Cursor/Claude Pro ($20/mo), comfortable with dev tool subscriptions
- Active on r/gamedev, r/godot, gamedev Discord servers, follows devlogs

**Pain Points:**
1. **AI context loss is the #1 frustration** — "AI starts great then becomes painfully stupid mid-project" (confirmed across all communities)
2. AI hallucinates outdated engine APIs (Godot 3 patterns in a Godot 4 project, deprecated Unity APIs)
3. Knows enough to code but not enough to architect — makes structural mistakes early that compound
4. Scope creep kills projects (confirmed as #1 indie killer in community research)
5. Can't afford to waste time debugging AI-generated code that uses wrong patterns

**Behavior with AI tools:**
- Uses Claude Code or Cursor as primary coding partner, not just autocomplete
- Copies error messages into chat, asks "why doesn't this work?"
- Starts projects with AI help enthusiastically, hits a wall at ~2 weeks when context degrades
- Has tried writing their own CLAUDE.md or rules files (Godogen's creator spent 4 rewrites)

**Why they'd pay $9/mo:**
- Direct ROI: saves 2-5 hours/week of debugging AI hallucinations
- "Permanent gamedev brain" that doesn't forget between sessions
- The price of one skipped coffee shop visit per week
- Already paying $20/mo for Claude Pro — $9 more for gamedev knowledge is trivial

**Messaging that resonates:**
- "Your AI forgets everything mid-project? Give it permanent gamedev knowledge."
- "Stop writing your own CLAUDE.md for Godot — install the MCP that already has it."
- "5 tools, zero bloat. Your AI assistant's gamedev education."

**Where to reach them:**
- r/gamedev (2.8M members), r/godot (350K+), r/aigamedev (new, active)
- DEV Community gamedev tag
- Godot Discord, gamedev Discord servers
- Claude Code / Cursor community forums

**Conversion trigger:** Hits a frustrating AI hallucination (wrong API, Godot 3 pattern) → searches for solution → finds our "knowledge MCP" concept → realizes this solves the root cause, not just the symptom.

---

### 🎯 Persona 2: "The Vibe Coder" (GROWTH MARKET)

**Profile:**
- Web developer, data scientist, or non-developer (designer, product manager) exploring gamedev
- 0-1 years gamedev experience, strong in another technical domain
- Uses whatever engine AI suggests (often Godot because text-based = AI-friendly)
- Age 25-40, employed in tech, gamedev is a passion project / side hustle
- Already pays for multiple AI subscriptions (Claude, ChatGPT, Cursor)
- Active on r/vibecoding, HN, Twitter/X tech circles

**Pain Points:**
1. Doesn't know what they don't know — AI confidently generates architecturally bad code and they can't tell
2. "500 hours of vibe coding broke me" — accumulates technical debt they can't diagnose
3. No mental model of game architecture (scene trees, ECS, game loops, state machines)
4. Overwhelmed by engine documentation — doesn't know where to start
5. Projects "work" for demos but fall apart at scale (performance, save/load, multiplayer)

**Behavior with AI tools:**
- Prompt-first development: describes what they want, pastes AI output, iterates on errors
- Rarely reads documentation directly — relies entirely on AI to interpret docs
- Shares progress on Twitter/HN ("I made a game in 48 hours with Claude!")
- Hits a wall when projects exceed ~1000 lines of code

**Why they'd pay $9/mo:**
- Transforms their AI from "confident but wrong" to "informed and correct"
- The knowledge infrastructure they'd never build themselves
- Prevents the "vibe coding broke me" wall before they hit it
- Status: "I use professional gamedev knowledge tools" (signals seriousness)

**Messaging that resonates:**
- "Your AI doesn't know how games work. This MCP teaches it."
- "From vibe code to viable game — give your AI the architecture knowledge it's missing."
- "Every game needs a state machine. Your AI doesn't know that yet."

**Where to reach them:**
- HN (Godogen got 1,600⭐ from one HN post)
- r/vibecoding, Twitter/X AI dev circles
- DEV Community, Medium AI/coding tags
- YouTube "build a game with AI" tutorials (comments section)

**Conversion trigger:** Project hits complexity wall → searches "why does AI code get worse" → finds article/thread about context loss → discovers knowledge MCP concept → "wait, I can give my AI gamedev expertise?"

---

### 🎯 Persona 3: "The Seasoned Architect" (HIGH-VALUE, LOW-VOLUME)

**Profile:**
- 5-15+ years gamedev experience, shipped 2+ titles
- Uses AI as an accelerator, not a crutch — knows good code from bad
- Engine-opinionated (deep Unity or deep Godot, considering Bevy/Rust)
- Age 28-45, professional dev (indie or employed at studio)
- Evaluates tools critically — won't pay for something that wastes context window
- Active on engine-specific forums, contributes to open source, writes devlogs

**Pain Points:**
1. AI tools waste context window on bloated tool schemas (the Perplexity CTO criticism)
2. Existing MCP servers are 95+ tools of editor integration — not what they need
3. Wants reference-quality knowledge for specific systems (combat damage pipeline, camera math, networking)
4. Cross-engine knowledge is valuable — migrating from Unity to Godot, or evaluating Bevy
5. Needs to onboard junior devs or AI agents to their project's architecture patterns

**Behavior with AI tools:**
- Uses Claude Code for heavy-lifting sessions, Copilot for daily coding
- Configures MCP servers manually, reads tool schemas, optimizes context budget
- Tests tools critically — if first 3 queries return bad results, uninstalls immediately
- Shares tool recommendations in niche communities (carries outsized influence)

**Why they'd pay $9/mo:**
- Context efficiency: 5 tools instead of 95 = more budget for actual code
- Reference-quality docs they'd otherwise write themselves (and have, for their own projects)
- Cross-engine comparison tool saves hours when evaluating engine migrations
- Section extraction means they get the exact 2KB they need, not an 85KB dump

**Messaging that resonates:**
- "5 tools. 138 docs. Zero context bloat. The MCP your agent actually needs."
- "Section extraction: get the knockback system, not the entire combat guide."
- "Cross-engine knowledge: compare how Godot and MonoGame handle the same problem."

**Where to reach them:**
- Engine-specific subreddits (r/godot, r/MonoGame, r/rust_gamedev)
- MCP-focused communities (mcp.so, awesome-mcp-servers contributors)
- GDC/game jam communities
- Technical blog posts (DEV Community, personal blogs)

**Conversion trigger:** Evaluating MCP tools for their workflow → sees our tool count (7 vs 95+) → tries section extraction → "finally, an MCP that respects my context window" → subscribes.

---

### 🎯 Persona 4: "The Game Jam Sprinter" (ACQUISITION FUNNEL)

**Profile:**
- Participates in 3-6 game jams per year (Ludum Dare, GMTK, Global Game Jam)
- Skill level varies widely — from student to senior dev doing jams for fun
- Engine-flexible: picks the fastest tool for the jam theme
- Age 18-35, often students or early-career devs
- Price-sensitive but time-rich during jams

**Pain Points:**
1. 48-72 hour time pressure — every minute debugging AI hallucinations is a minute not making the game
2. Needs to implement systems FAST (combat, camera, movement) without reading full docs
3. AI generates "works for demo" code that breaks when jam scope expands
4. Different jam = different genre = needs different system knowledge each time

**Behavior with AI tools:**
- Maximal AI usage during jams — no code pride, just ship
- `npx` install, use for 72 hours, forget about it
- Shares jam results and tooling on itch.io pages and jam communities

**Why they'd use (free tier → convert later):**
- Free tier is enough for a single jam (50 searches/day, core docs)
- Genre lookup tool is perfect for jams ("I'm making a tower defense, what systems do I need?")
- Speed: `npx gamedev-mcp-server` and go
- If free tier helps them win/place in a jam, they convert for the next one

**Messaging that resonates:**
- "48 hours. One MCP. Your AI knows every game system."
- "Genre lookup: tell it 'tower defense' and get the full architecture in seconds."
- "`npx gamedev-mcp-server` — zero config, instant gamedev knowledge."

**Where to reach them:**
- Ludum Dare community, GMTK Discord, itch.io forums
- r/gamedev during jam announcement periods
- Game jam tool recommendation threads
- jam-specific hashtags on Twitter/X

**Conversion trigger:** Uses free tier during jam → places well → realizes Pro docs would help with the full game version → subscribes between jams.

---

## Secondary Personas (Monitor, Don't Target Yet)

### 📌 Persona 5: "The Studio Tech Lead"

- Works at AA/indie studio (5-30 person team)
- Evaluating AI tooling for team adoption
- Cares about: security (stdio-only = selling point), consistency (same knowledge for all devs), onboarding speed
- Would want Team tier ($29/mo for 5 seats) — not ready until v2.0+
- **Why wait:** Need individual traction first. One tech lead converting their team = 5 seats, but they won't find us until we have community proof (stars, reviews, registry listings)

### 📌 Persona 6: "The CS Student / Career Switcher"

- Learning gamedev from tutorials + AI, often for school projects or portfolio
- Extremely price-sensitive (free tier only for now)
- High volume, low revenue, but creates word-of-mouth
- **Why wait:** They'll find us organically through registries and community posts. Don't spend marketing budget here — invest in free tier quality instead.

### 📌 Persona 7: "The Bevy/Rust Pioneer"

- Rust enthusiast exploring game dev with Bevy
- Most underserved by AI tools (highest hallucination rate per academic research)
- Small market (~10-20% of Godot's) but high willingness to pay for quality tools
- **Why wait:** Bevy module is Phase 3. These users are technically sophisticated enough to find us when we ship it. No point marketing before content exists.

---

## Persona-to-Feature Mapping

| Feature | Solo Shipper | Vibe Coder | Architect | Jam Sprinter |
|---------|:---:|:---:|:---:|:---:|
| search_docs | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| get_doc (full) | ⭐⭐ | ⭐⭐⭐ | ⭐ | ⭐⭐ |
| get_doc (section) | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| genre_lookup | ⭐⭐ | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| compare_engines | ⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐ |
| random_doc | ⭐ | ⭐⭐ | ⭐ | ⭐⭐ |
| list_modules | ⭐ | ⭐⭐ | ⭐⭐ | ⭐ |
| Godot docs | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| MonoGame docs | ⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐ |
| Cross-engine | ⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐ |

⭐ = nice to have, ⭐⭐ = important, ⭐⭐⭐ = critical

---

## Persona-to-Channel Mapping

| Channel | Solo Shipper | Vibe Coder | Architect | Jam Sprinter |
|---------|:---:|:---:|:---:|:---:|
| r/gamedev | ⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐ |
| r/godot | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ |
| HN | ⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐ |
| DEV Community | ⭐⭐ | ⭐⭐⭐ | ⭐ | ⭐ |
| mcp.so / registries | ⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐ |
| Jam communities | ⭐ | ⭐ | ⭐ | ⭐⭐⭐ |
| Twitter/X AI circles | ⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐ |
| Engine Discords | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ |

---

## Conversion Funnel by Persona

### Solo Shipper (Shortest Path to Revenue)
```
Hit AI hallucination → Search for fix → Find knowledge MCP concept
→ `npx gamedev-mcp-server` → Free tier works for core docs
→ Need Godot/engine-specific doc → Hit paywall → $9/mo
```
**Time to convert:** 1-2 weeks of active use  
**LTV estimate:** 6-12 months ($54-$108)  
**Churn risk:** Low — daily user, integrated into workflow

### Vibe Coder (Largest Addressable Market)
```
Project hits complexity wall → Search "AI code gets worse"
→ Discover context loss is the root cause → Find MCP concept
→ Install, try genre_lookup → "This is what I was missing"
→ Hit module gate → $9/mo for full engine docs
```
**Time to convert:** 2-4 weeks  
**LTV estimate:** 3-6 months ($27-$54)  
**Churn risk:** Medium — may abandon gamedev entirely

### Architect (Highest Per-User Value)
```
Evaluate MCP tools for workflow → See 7 tools vs 95+
→ Test section extraction → "Respects my context window"
→ Test cross-engine comparison → "Useful for Unity→Godot migration"
→ Subscribe → Recommend to peers → Multiplier effect
```
**Time to convert:** 1-3 days (fast decision-maker)  
**LTV estimate:** 12-24 months ($108-$216)  
**Churn risk:** Very low — if quality stays high, they stay

### Jam Sprinter (Acquisition Funnel)
```
Jam starts → Need fast system implementation
→ `npx gamedev-mcp-server` → Free tier for 72 hours
→ Place well in jam → Expand jam game into full project
→ Need Pro docs for depth → $9/mo
```
**Time to convert:** 1-3 months (between jams)  
**LTV estimate:** 3-9 months ($27-$81)  
**Churn risk:** Medium — seasonal usage pattern

---

## Prioritized Persona Strategy

### Phase 1 (v1.2 Launch — Now)
**Target:** Solo Shippers + Architects  
**Why:** Fastest to convert, lowest churn, highest LTV, most likely to write reviews/recommend  
**Channels:** r/gamedev, r/godot, MCP registries, DEV Community  
**Message:** Context loss problem + section extraction demo

### Phase 2 (v1.2 Traction — April 2026)
**Target:** Add Vibe Coders  
**Why:** Largest market but needs social proof first (stars, testimonials)  
**Channels:** HN, Twitter/X, r/vibecoding, YouTube comments  
**Message:** "Your AI doesn't know how games work" + before/after demo

### Phase 3 (v2.0 Unity Launch — May 2026)
**Target:** Add Jam Sprinters + Studio Tech Leads  
**Why:** Unity module expands TAM 3x, Team tier enables studio sales  
**Channels:** Jam communities, Unity forums, GDC connections  
**Message:** Multi-engine knowledge + team licensing

---

## Persona Validation Plan

Track these metrics to validate/invalidate persona assumptions:

| Metric | Validates | Source |
|--------|-----------|--------|
| Free→Pro conversion rate by referral source | Which persona converts fastest | LemonSqueezy analytics |
| Search queries by topic | What personas actually need | Server logs |
| `genre_lookup` vs `get_doc(section)` usage ratio | Vibe Coder vs Architect mix | Server logs |
| Churn by signup month | Seasonal (jam) vs sustained usage | LemonSqueezy |
| npm download spikes correlated to community posts | Which channels drive acquisition | npm stats + post timestamps |
| GitHub star sources (referrer) | Where architects come from | GitHub traffic |
| Engine filter usage (Godot vs MonoGame) | Persona engine preferences | Server logs |

---

## Key Insight

**The gamedev AI tool market has a hidden segmentation:**
- **52% of devs say AI is bad** → NOT our customers (and never will be)
- **36% actively use AI** → Our total addressable market
- **Of that 36%:** ~60% use it for code/prototyping (our sweet spot), ~25% for asset generation (not us), ~15% for other (QA, localization, etc.)
- **Effective TAM:** ~22% of all game devs × those using MCP-compatible tools × those willing to pay for knowledge

The "invisible AI" positioning is non-negotiable. We help developers write better code themselves. We don't generate games, art, or content. This keeps us on the safe side of the anti-AI divide that splits the industry 52/48.
