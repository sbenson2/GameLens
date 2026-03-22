# Distribution Strategy — gamedev-mcp-server

**Created:** 2026-03-22 (Week C strategic rotation)  
**Last updated:** 2026-03-22

---

## Executive Summary

v1.0.0 has been on npm for 8 days with ~82 downloads and zero external discovery. v1.1.0 has been prepped for 4 days. **The #1 blocker is not code — it's distribution.** This document maps every viable channel, prioritizes by effort/impact, and provides a concrete launch sequence.

---

## Distribution Channel Map

### Tier 1: Must-Ship (Highest Impact, Lowest Effort)

These are table-stakes. Every MCP server that gets traction is listed on these.

| Channel | Submission Method | Effort | Impact | Status |
|---------|------------------|--------|--------|--------|
| **npm v1.1.0 publish** | `release.yml` workflow dispatch or manual | 5 min | 🔴 Critical | ❌ Day 4 stale |
| **mcpservers.org** | Form at mcpservers.org/submit | 10 min | High — powers wong2/awesome-mcp-servers (83K⭐) | ❌ Not submitted |
| **mcp.so** | GitHub issue on their repo | 15 min | High — 3,000+ servers indexed, community-curated | ❌ Not submitted |
| **smithery.ai** | GitHub integration (auto-indexes from npm/GitHub) | 15 min | High — 6,000+ servers, Smithery CLI installs | ❌ Not submitted |
| **LobeHub MCP Marketplace** | PR to lobe-chat-agents repo or similar | 20 min | Medium-High — popular AI chat client | ❌ Not submitted |
| **Cline Marketplace** | PR to github.com/cline/mcp-marketplace | 20 min | High — millions of VS Code/Cline users | ❌ Not submitted |

### Tier 2: High-Value Discovery (Medium Effort)

| Channel | Submission Method | Effort | Impact | Status |
|---------|------------------|--------|--------|--------|
| **punkpeye/awesome-mcp-servers** | GitHub PR | 15 min | High — 2nd major awesome list | ❌ Not submitted |
| **appcypher/awesome-mcp-servers** | GitHub PR | 15 min | Medium — 3rd awesome list | ❌ Not submitted |
| **claudefa.st "50+ Best MCP Servers"** | Contact/submit form | 15 min | Medium — curated "best of" list | ❌ Not submitted |
| **GitHub repo SEO** | Topics, description, social preview | 30 min | Medium — organic GitHub discovery | ❌ Incomplete |
| **.well-known/mcp.json** | Add to repo/published server | 30 min | Low now, high later — MCP spec roadmap | ❌ Not implemented |

### Tier 3: Community & Content (High Effort, Compound Returns)

| Channel | Method | Effort | Impact | Notes |
|---------|--------|--------|--------|-------|
| **DEV Community launch post** | Blog post (draft exists) | 1 hr (polish + post) | Medium-High — dev audience, SEO | Draft at `rnd/marketing/blog-post-launch.md` |
| **r/gamedev** | Self-post | 30 min | Medium — largest gamedev sub | Anti-AI sentiment is targeted at visible AI, not tools |
| **r/aigamedev** | Self-post | 15 min | Medium — niche but perfect fit | New active subreddit |
| **r/godot** | Self-post | 30 min | Medium-High — needs careful framing | "Knowledge infrastructure" not "AI replacement" |
| **r/MonoGame** | Self-post | 15 min | Low-Medium — small community | Most complete module, easy sell |
| **Hacker News** | Show HN | 15 min | High if it catches, otherwise low | Lead with technical angle (TF-IDF, context efficiency) |
| **Twitter/X** | Thread | 30 min | Medium — reach gamedev influencers | Tag @godaborrego, @redaborrego, Godot community |

### Tier 4: Agent-Native Distribution (Emerging, Strategic)

| Channel | Method | Effort | Impact | Notes |
|---------|--------|--------|--------|-------|
| **AGENTS.md** | Add to repo root | 30 min | Growing — 60K+ projects adopted | Tells coding agents how to use the MCP |
| **Claude Code Skills** | Publish as SKILL.md package | 1-2 hrs | Medium — Vercel + Anthropic pushing this | Could be a "gamedev" skill that installs the MCP |
| **MCPize marketplace** | List server, set pricing | 1 hr | Low-Medium — 350+ servers, 85/15 split | Secondary monetization channel |
| **Godogen integration** | PR or doc reference | 30 min | Medium — 1,600⭐, same target audience | Complementary: they build games, we provide knowledge |

### Tier 5: Paid/Earned Media (Post-Launch)

| Channel | Method | Effort | Impact | Notes |
|---------|--------|--------|--------|-------|
| **"Best MCP" blog lists** | Outreach to authors | 1 hr | Medium — SEO backlinks | firecrawl.dev, desktopcommander.app, dev.to, agentpatch.ai |
| **Medium article** | "7 Best MCP Servers for Game Developers" update | 30 min | Medium — author outreach for inclusion | Jul 2025 article, no docs servers mentioned |
| **YouTube gamedev channels** | Outreach or collab | 2-4 hrs | High if picked up | Target: indie gamedev + AI workflow channels |
| **GDC / game jams** | Sponsor or demo | 4+ hrs | Long-term | 2027 opportunity if traction proves out |

---

## Launch Sequence (Recommended Order)

### Phase 0: Pre-Launch Prep (Before any submissions)

1. **npm v1.1.0 publish** — This must happen FIRST. Everything links to the npm package.
2. **GitHub repo polish:**
   - Update repo description: `🎮 AI game dev knowledge server (MCP). 134+ curated docs — design patterns, architecture, MonoGame, Godot, Unity. Give your AI permanent gamedev expertise.`
   - Add topics: `mcp`, `gamedev`, `game-development`, `godot`, `monogame`, `model-context-protocol`, `ai`, `knowledge-base`
   - Social preview image (use Stitch prompts from `rnd/marketing/stitch-prompts.md` or a simple terminal screenshot)
   - Verify README has Claude Desktop, Cursor, Windsurf, Cline config examples
3. **Verify npm keywords** match registry submission tags
4. **Add AGENTS.md to repo root** — tells coding agents how to use the MCP server

### Phase 1: Registry Blitz (Day 1 — all in one sitting)

Submit to all registries in a single session. Most are 10-15 min each.

1. mcpservers.org/submit (form)
2. mcp.so (GitHub issue)
3. smithery.ai (GitHub connection)
4. Cline Marketplace (PR to cline/mcp-marketplace)
5. LobeHub MCP Marketplace
6. punkpeye/awesome-mcp-servers (PR)
7. appcypher/awesome-mcp-servers (PR)

**Total time:** ~2 hours for all 7. **Expected reach:** Combined audience of 100K+ developers browsing these directories.

### Phase 2: Content Launch (Day 2-3)

1. Polish and publish DEV Community blog post
2. Post to r/aigamedev (most receptive audience)
3. Post to r/gamedev (frame as "context-loss solution")
4. Post to r/godot (frame as "correct Godot 4.x patterns for AI assistants")
5. Submit to claudefa.st

### Phase 3: Community & Partnerships (Week 2)

1. Reach out to Godogen creator about referencing our MCP
2. Tweet thread with section extraction demo (the killer visual)
3. Show HN submission
4. Outreach to "Best MCP" blog authors for inclusion
5. Contact GodotAI plugin creator about integration story

### Phase 4: Agent-Native (Week 3-4)

1. Publish as Claude Code Skill
2. List on MCPize (secondary monetization)
3. Implement .well-known/mcp.json
4. Explore xpay.sh overlay for "pay as you go" tier

---

## Channel-Specific Strategies

### npm Discovery

- **Current downloads:** ~82 (v1.0.0 only)
- **Optimization:** npm search ranks by keyword relevance, download count, and recency. v1.1.0 publish immediately boosts recency.
- **Keywords to verify:** `mcp`, `model-context-protocol`, `gamedev`, `game-development`, `godot`, `monogame`, `unity`, `claude`, `cursor`, `windsurf`, `knowledge-base`
- **npm README:** Should be compelling — npm renders it on the package page, which is often the first thing devs see.

### MCP Registry Positioning

All registries surface servers by category. Our unique positioning:

- **Category:** "Developer Tools" or "Knowledge & Documentation" (NOT "Game Development" — we're a dev tool, not a game engine plugin)
- **Differentiator line:** "The only cross-engine game development knowledge MCP. 6 focused tools, not 50."
- **Security angle:** "stdio-only transport. No network exposure. No API keys for free tier."
- **Context efficiency angle:** "Section extraction means your AI gets 2KB of relevant knowledge instead of 85KB of full document."

### Reddit Strategy

**r/gamedev (2.8M members):**
- Title: "I built an MCP server that gives AI permanent game dev knowledge (134+ docs, MonoGame + Godot)"
- Frame: Solve the "AI becomes stupid mid-project" problem
- Include: Before/after showing AI with vs without the MCP
- Avoid: "AI will replace developers" framing
- Best posting time: Tue-Thu morning EST

**r/godot (800K+ members):**
- Title: "Gave my AI correct Godot 4.4+ patterns — free MCP server with 7 guides (state machines, signals, input, GDScript vs C#)"
- Frame: "Your AI generates Godot 3 code. This fixes that."
- Include: Side-by-side of AI-generated code with/without the MCP
- Critical: Acknowledge anti-AI sentiment upfront. Position as "knowledge infrastructure" not "code generation"
- Link to godot-rules.md as a standalone demo of value

**r/aigamedev (new, ~10K members):**
- Most receptive audience. Can be more direct about AI tooling.
- Cross-post from r/gamedev

### Hacker News Strategy

- **Format:** "Show HN: GameDev MCP Server – Permanent game dev knowledge for AI coding assistants"
- **Lead with:** Technical angle (TF-IDF search, context window efficiency, cross-engine architecture)
- **Mention:** "5 tools, zero bloat" in context of MCP criticism from Perplexity CTO
- **Avoid:** Marketing language, exclamation marks
- **Timing:** Tue-Thu 8-10 AM EST

### AGENTS.md Strategy

Create `AGENTS.md` in repo root. This is how coding agents discover the MCP server:

```markdown
# AGENTS.md — GameDev MCP Server

## What This Is
An MCP server providing 134+ curated game development docs. Install it to give your AI permanent gamedev knowledge.

## Quick Install
Add to your MCP config:
```json
{
  "gamedev": {
    "command": "npx",
    "args": ["-y", "gamedev-mcp-server"]
  }
}
```

## Available Tools
- `search_docs` — Search across all game dev knowledge
- `get_doc` — Retrieve specific doc (supports section extraction)
- `list_docs` — Browse available docs (supports summary mode)
- `list_modules` — See available engine modules
- `genre_lookup` — Get genre-specific system requirements
- `session` — Structured workflow prompts

## Usage Tips
- Use `section` param on get_doc to extract only what you need
- Use `maxLength` to control context window usage
- Free tier: core docs (49). Pro: all engines (134+)
```

### Claude Code Skills Strategy

Package the MCP install + usage instructions as a Claude Code Skill:

```
skills/
  gamedev/
    SKILL.md    — Instructions for installing and using the MCP
    references/
      tool-reference.md  — Detailed tool documentation
```

This means any Claude Code user can `install gamedev` and immediately have the MCP configured. The skill doesn't replace the MCP — it's a distribution wrapper that makes install zero-friction.

---

## Metrics & Tracking

### Launch KPIs (First 30 Days)

| Metric | Target | Tracking |
|--------|--------|----------|
| npm weekly downloads | 500+ | `npm view gamedev-mcp-server` |
| GitHub stars | 50+ | GitHub repo |
| Registry listings live | 5+ | Manual check |
| Community posts engagement | 50+ upvotes total | Reddit/DEV/HN |
| Free → Pro conversion | Track baseline | LemonSqueezy dashboard |
| GitHub issues/PRs from users | Any | Signal of real usage |

### Leading Indicators

- **npm install errors:** Watch GitHub Issues for install problems (missing deps, Node version, etc.)
- **Search query logs:** If possible, instrument what users search for → content gap signals
- **GitHub traffic:** Referrers show which registries/posts drive discovery
- **Star-to-download ratio:** Low stars + high downloads = MCP config copy-paste (good). High stars + low downloads = tire-kickers (needs activation help).

---

## Competitive Distribution Comparison

How competing MCP servers got their users:

| Server | Stars | Primary Distribution | Lesson |
|--------|-------|---------------------|--------|
| **Godot-MCP (Coding-Solo)** | 2,500 | r/godot post + awesome lists | Community launch is sufficient for niche |
| **Unity-MCP (IvanMurzak)** | 1,400 | GitHub organic + MCP registries | Good README + right category = discovery |
| **Godogen** | 1,600 (5 days!) | HN front page + r/godot | HN can 10× overnight if technical angle lands |
| **Context7** | Growing | LobeHub featured | Marketplace featuring is high-leverage |
| **Ref (ref.tools)** | N/A | Direct sales site + MCP listings | Paid docs-MCP works with direct positioning |
| **Desktop Commander** | Growing | Blog "best of" list (own blog!) | Creating "best of" content drives SEO back to you |

### Key Takeaway

The servers that broke out did ONE thing well in distribution:
- Godot-MCP: One great Reddit post
- Godogen: One great HN submission
- Context7: Featured on a major marketplace

We don't need to do everything. We need to do **one community launch really well** and **get listed on all the registries** as baseline coverage.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Anti-AI backlash on r/godot | Medium | Medium | Frame as "knowledge infrastructure" not AI tool. Lead with correct Godot 4.x patterns. |
| Registry rejection | Low | Low | Multiple registries = redundancy. Most are auto-indexed from npm. |
| npm v1.1.0 breaks something | Low | High | Test thoroughly before publish. v1.0.0 stays as fallback. |
| Low initial traction | Medium | Low | Distribution is a marathon. Registry listings compound over months. |
| Smithery security concerns | Medium | Low | Our server is stdio-only, no secrets. Users can install via npm directly. |
| MCP fatigue dampens interest | Medium | Medium | Position as "5 tools, zero bloat" — the antidote to MCP fatigue. |

---

## Wes Action Items (Sorted by Priority)

These require Wes's GitHub account / credentials:

1. **🔴 npm v1.1.0 publish** — Trigger `release.yml` workflow dispatch OR manual `npm publish`
2. **🔴 GitHub repo polish** — Description, topics, social preview image
3. **🟡 Registry submissions** — mcpservers.org, mcp.so, Cline marketplace (15 min each)
4. **🟡 Review blog post draft** — `rnd/marketing/blog-post-launch.md` (approve before posting)
5. **🟢 Reddit posts** — r/aigamedev, r/gamedev, r/godot (can be drafted by cron, posted by Wes)
6. **🟢 HN submission** — Show HN (timing matters, Tue-Thu morning)

---

## What Cron Can Do Autonomously

- ✅ Draft all Reddit/DEV/HN post text (ready for Wes to paste)
- ✅ Create AGENTS.md for repo root
- ✅ Draft Claude Code Skill package
- ✅ Implement .well-known/mcp.json
- ✅ Prepare registry submission details (already done: `rnd/marketing/registry-submissions.md`)
- ✅ Create social preview image prompts (already done: `rnd/marketing/stitch-prompts.md`)
- ✅ Monitor and report on post-launch metrics
- ✅ Update pricing-intel.md and competitor-log.md

---

## Timeline Summary

| When | What | Who |
|------|------|-----|
| **Now** | npm v1.1.0 publish + GitHub polish | Wes |
| **Day 1** | All 7 registry submissions | Wes (2 hrs) |
| **Day 2-3** | DEV Community + Reddit posts | Wes (reviews drafts, posts) |
| **Week 2** | HN, Twitter, partnership outreach | Wes |
| **Week 3** | Claude Code Skill publish, MCPize listing | Cron + Wes |
| **Ongoing** | Metric tracking, community engagement, iterate | Both |

---

## Key Insight

**Distribution for MCP servers is different from traditional SaaS.** There's no SEO funnel, no app store ranking, no paid ads channel. Discovery happens through:

1. **Registry listings** (the "app stores" of MCP)
2. **Awesome lists** (the "Product Hunt" of MCP)
3. **Community posts** (the "launch" of MCP)
4. **Agent-native discovery** (AGENTS.md, Skills — the NEW channel)

The last one is unique to MCP: as coding agents become the primary way developers interact with tools, having an AGENTS.md and being discoverable by agents becomes as important as having a website was in 2005. Godogen proved that developers building AI+Godot workflows are actively looking for curated knowledge sources. We need to be where they're looking.
