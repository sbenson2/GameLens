# E9 — Game Dev Playbook: AI Tools and Project Management
> **Category:** Explanation · **Related:** [E4 Project Management](./E4_project_management.md) · [E5 AI-Assisted Dev Workflow](../ai-workflow/E5_ai_workflow.md) · [E8 MonoGameStudio Post-Mortem](../../monogame-arch/architecture/E8_monogamestudio_postmortem.md) · [P8 Common Pitfalls](./P8_pitfalls.md) · [P0 Master Playbook](./P0_master_playbook.md) · [P14 Marketing Timeline](./P14_marketing_timeline.md) · [P7 Launch Checklist](./P7_launch_checklist.md) · [P15 Post-Mortem Template](./P15_postmortem_template.md)

---

**AI amplifies both productivity and chaos.** Without deliberate systems for tracking progress, maintaining creative vision, and knowing when to say no, AI becomes a scope creep accelerator rather than a shipping accelerator. This doc synthesizes community wisdom, case studies from developers like ConcernedApe, LocalThunk, and Mega Crit, and practical techniques for game development with AI tools.

---

## Table of Contents

1. [AI and Game Architecture: Where It Works](#ai-and-game-architecture-where-it-works)
2. [AI Coding Tool Workflows](#ai-coding-tool-workflows)
3. [Realistic Productivity Expectations](#realistic-productivity-expectations)
4. [The AI Quality Pipeline](#the-ai-quality-pipeline)
5. [AI Art Pipeline](#ai-art-pipeline)
6. [Goal Hierarchy and Kanban](#goal-hierarchy-and-kanban)
7. [Tool Recommendations](#tool-recommendations)
8. [The Solo Dev Testing Strategy](#the-solo-dev-testing-strategy)
9. [Version Control for Solo Devs](#version-control-for-solo-devs)
10. [Patterns from Successful Solo Games](#patterns-from-successful-solo-games)
11. [Scope Creep and AI Amplification](#scope-creep-and-ai-amplification)
12. [Health, Sustainability & The Long Haul](#health-sustainability--the-long-haul)
13. [Community Building & Player Management](#community-building--player-management)
14. [Launch Timing & Market Awareness](#launch-timing--market-awareness)
15. [Living Documentation](#living-documentation)
16. [Decision Journal Workflow](#decision-journal-workflow)
17. [Planning Session Workflow](#planning-session-workflow)
18. [The Solo Dev Tech Stack Decision](#the-solo-dev-tech-stack-decision)
19. [The AI+PM Feedback Loop](#the-aipm-feedback-loop)
20. [Common Mistakes](#common-mistakes)

---

## AI and Game Architecture: Where It Works

Architecture choice fundamentally determines how well AI can assist your development. Some patterns are inherently more AI-friendly than others.

### ECS (Entity Component System)

ECS is **one of the most AI-friendly patterns in game development**. Components are pure data structs. Systems are pure logic functions. Each unit is self-contained, testable in isolation, and follows predictable query-iterate-transform patterns — exactly what LLMs handle best.

**Highest-value AI tasks for ECS projects:**
- **Component struct generation** — describe a game mechanic, get data definitions
- **System scaffolding** — boilerplate for querying specific component archetypes
- **Unit test generation** — systems' pure-function nature makes them highly testable
- **Documentation generation** — start a comment block and get comprehensive docs

### Scene Tree / Node-Based (Godot)

Godot's scene tree is moderately AI-friendly. Signals create clear communication boundaries. The composition pattern (small reusable scenes) maps well to discrete AI tasks.

**Where AI helps:** Node configuration, signal wiring, GDScript patterns (especially with typed GDScript 4.4+), shader code, animation setup, UI layout.

**Where AI struggles:** Scene tree structure decisions (when to compose vs inherit), autoload architecture, node lifecycle timing (especially `_ready()` order across scenes), and anything requiring awareness of the running scene tree state.

### Traditional OOP (Unity, custom engines)

Deep inheritance hierarchies and MonoBehaviour coupling make AI-generated code harder to integrate. AI often generates classes that duplicate functionality already in your hierarchy or violate your architecture's conventions.

**Mitigation:** Maintain a CONTEXT.md or AGENTS.md file that describes your architecture patterns, class hierarchy, and conventions. Feed this to the AI before any generation task.

### The Critical Boundary

**AI handles the "how," humans must own the "why."** AI excels at "write a state machine for enemy behavior" but fails at "make this boss fight feel rewarding."

**The numbers:** A CodeRabbit analysis (December 2025) found AI-co-authored pull requests contained **1.7x more issues** than human-only code, including 3x more readability problems and 2.74x more security vulnerabilities. Treat AI as a talented but over-eager junior developer who needs guardrails.

**Niche framework caveat:** Smaller communities (MonoGame, Bevy, Raylib) have less training data in LLMs. Expect more hallucinated APIs. **Paste your framework's key interface definitions into your LLM context** — this single step dramatically improves output quality for niche frameworks. See → [E5 CONTEXT.md](../ai-workflow/E5_ai_workflow.md#contextmd)

---

## AI Coding Tool Workflows

The landscape of AI coding tools has converged on a common pattern: explore codebase → plan → implement → test → iterate. The tools differ in interface and integration, but the principles for using them effectively are the same.

### The Knowledge Gap Problem

**The #1 pain point across all AI-assisted game development is context loss.** Developers universally describe a cycle where AI starts great, then "becomes painfully stupid" as projects grow beyond what fits in context. The solutions:

1. **Architecture docs** — AGENTS.md, CONTEXT.md, or DESIGN.md at your project root that describe your patterns, conventions, and key decisions
2. **Knowledge MCP servers** — external knowledge sources that give AI access to engine-specific patterns, anti-patterns, and production techniques without consuming your project's context window
3. **Code conventions files** — .cursorrules, .claude, or equivalent that constrain AI generation to your project's style

### Tool-Specific Patterns

**Claude Code / Codex (terminal-based agents):**
- Best for: large refactors, multi-file changes, creating new systems from architecture descriptions
- Workflow: describe the system in natural language → let the agent explore your codebase → review the plan → approve implementation
- Key setting: use `/compact` or context summaries to manage token budget on long sessions
- Trap to avoid: letting the agent "fix" things you didn't ask about — be specific about scope

**Cursor / Windsurf / Copilot (IDE-integrated):**
- Best for: in-flow code completion, targeted function generation, inline documentation
- Workflow: write a detailed comment describing what you want → tab-complete the implementation → review every line
- Key setting: configure `.cursorrules` or equivalent with your engine's patterns and naming conventions
- Trap to avoid: accepting completions without reading them — "vibe coding" produces code you can't debug

**MCP Servers (knowledge sources):**
- Best for: engine-specific patterns, architecture decisions, API guidance
- Workflow: install relevant MCP servers → AI tools automatically query them for domain knowledge
- Key setting: limit active MCP servers to 3-5 to avoid context window overhead
- Trap to avoid: installing too many MCP servers — 7K+ exist, but each one adds schema tokens to every request

### The Effective Solo Dev AI Workflow

```
1. Write a 2-3 sentence specification for what you want
2. Include constraints: engine, patterns to follow, patterns to avoid
3. Let AI generate a first draft
4. Read every line — don't just run it
5. Test the generated code in isolation before integrating
6. Commit the working version before asking for modifications
7. Never let AI modify code you don't understand
```

**Time investment:** Steps 1-2 (specification) take 2-5 minutes but save 30-60 minutes of debugging bad output. The developers who report the highest AI productivity gains all cite "writing better prompts" as the key skill, not "using better models."

---

## Realistic Productivity Expectations

Productivity gains from AI are real but consistently overstated. One developer who built two games with AI assistance reported only a **10–20% productivity gain** on the first game (expecting 50–60%), improving on the second through better workflow integration.

**Where AI actually saves time:** Eliminating "papercut" tasks. One developer described Cursor fixing 27 backlog issues in a weekend sprint — tasks that individually took 15–30 minutes but collectively represented weeks of demoralizing work. The biggest gains come from batch-clearing small annoying tasks, not from dramatic acceleration of complex work.

### The Productivity Matrix

| Task Type | AI Effectiveness | Notes |
|-----------|-----------------|-------|
| Boilerplate code | ⭐⭐⭐⭐⭐ | Component structs, system scaffolds, repetitive patterns |
| Unit tests | ⭐⭐⭐⭐ | Especially for pure functions and data transformations |
| Code review | ⭐⭐⭐⭐ | Catches bugs humans miss; misses architectural issues humans catch |
| API integration | ⭐⭐⭐⭐ | Well-documented APIs; struggles with niche libraries |
| Bug fixes (simple) | ⭐⭐⭐⭐ | Off-by-one, null checks, type errors |
| Rapid prototyping | ⭐⭐⭐⭐ | Quick throw-away code to test ideas |
| Language translation | ⭐⭐⭐ | C# ↔ GDScript, porting patterns between engines |
| Complex architecture | ⭐⭐ | Can propose, but humans must validate structure |
| Shader code | ⭐⭐⭐ | GLSL/HLSL syntax is well-known; visual tuning still manual |
| Game feel tuning | ⭐ | Numbers need playtesting, not generation |
| Creative design | ⭐ | Can brainstorm, but quality depends on human curation |
| Niche framework APIs | ⭐⭐ | Hallucination rate climbs with community size inversely |

**Where AI actively hurts:** Niche frameworks where models lack context, complex multi-step architecture, subtle logic errors that look plausible but fail at runtime, preserving creative distinctiveness.

### Cognitive Atrophy Risk

"You can get into a loop of asking AI for code, scanning it, testing it, and then asking it to fix the mistakes without engaging deeply in the problem." (Clemson University CHI PLAY 2024, studying 3,091 game dev posts.)

**The antidote:** Periodically code without AI to maintain the skills you'll need when AI fails on niche problems. Schedule "no-AI days" — one per week or one per sprint. These sessions are slower but build the deep understanding that makes your AI-assisted days more productive (you'll write better specs and catch more errors).

**Brainstorming is the top non-code use.** Describe a system's intended behavior in natural language, have the AI propose a component/system decomposition, critique and refine together before implementing. Use AI to break through blank-page paralysis, not to replace creative judgment.

---

## The AI Quality Pipeline

AI-generated code needs a pipeline, just like AI-generated art. Raw output is a starting point, never the final product.

### The Five-Stage Pipeline

```
Stage 1: GENERATE  → AI produces code from spec
Stage 2: READ      → You read every line (no exceptions)
Stage 3: TEST      → Run it in isolation
Stage 4: INTEGRATE → Merge into your codebase
Stage 5: VERIFY    → Playtest the integration
```

### Code Review Checklist for AI Output

Before accepting any AI-generated code, check:

- [ ] **Does it match your naming conventions?** AI defaults to its own style
- [ ] **Does it duplicate existing functionality?** AI doesn't know your codebase completely
- [ ] **Are there hidden dependencies?** New imports, new packages, new autoloads
- [ ] **Is the error handling adequate?** AI often generates happy-path-only code
- [ ] **Does it handle edge cases?** Empty arrays, null refs, zero-size, negative values
- [ ] **Is it performant enough for per-frame execution?** AI loves allocations, LINQ, and string formatting in hot paths
- [ ] **Does it follow your architecture?** Correct use of signals/events, proper layer separation, right component granularity

### The "Looks Right, Isn't Right" Problem

The most dangerous AI bugs are ones that look syntactically correct but are semantically wrong:

- **Stale API patterns** — AI generates Godot 3 syntax (`KinematicBody2D`, `yield`) for a Godot 4 project
- **Plausible but wrong math** — damage formula that works for small numbers but breaks at scale
- **Race conditions** — async code that works in testing but fails under real game timing
- **Memory leaks** — event handlers never disconnected, nodes never freed, objects never pooled
- **Silent performance bugs** — code that runs fine with 10 entities but crawls with 1,000

**Mitigation:** Write a `KNOWN_BUGS.md` that documents AI-generated code patterns you've had to fix. Over time, this becomes a checklist of things to watch for.

---

## AI Art Pipeline

Raw AI art in a final product is a reputational risk. Steam has a curator page ("AI Generated Slop") that flags games, itch.io enforces a "No Slop" policy, and a Postal franchise game was **shut down within two days** of announcement due to AI art backlash. Indie developers are valued for handcrafted, personal creative voice.

### The Visibility Rule (2026 Consensus)

Community sentiment has crystallized around a clear line:
- **Visible AI output (art, music, writing, localization) → rejected by players**
- **Invisible AI assistance (code, architecture, dev tools) → accepted by players**

This isn't about ethics debates — it's about market reality. Players value handcrafted creative expression and will actively punish games that feel AI-generated. Design your AI usage accordingly.

### The 70/30 Rule

AI handles ~70% of initial grunt work (base compositions, color exploration, rough layouts). Humans contribute the critical 30% — details, storytelling, emotional weight, intentional imperfection. The **iterative img2img workflow:**

1. Rough sketch by hand — even crude shapes establish human creative direction
2. Feed into Stable Diffusion img2img at 0.7–0.8 denoising strength
3. Cherry-pick the best result, paint over unwanted elements manually
4. Feed modified image back at lower denoising (0.5–0.6) for refinement
5. Repeat 2–3 times, then final cleanup

### Style Consistency

**LoRA training** maintains consistent style: 15–30 reference images, 30–60 minutes training, trigger word in prompts. **ControlNet** provides structural guidance — Canny for outlines, OpenPose for character poses, Tile for seamless textures. **ComfyUI** is the gold standard for reproducible node-based pipelines.

### AI Art for Prototyping (Safe Uses)

Where AI art is genuinely useful without risk:

- **Placeholder art during development** — replaced before release
- **Concept exploration** — generating mood boards, color palettes, composition ideas
- **UI prototyping** — using tools like Google Stitch to explore HUD layouts before building them in-engine. See → [G_stitch UI Workflow](../game-design/G_stitch_ui_workflow.md)
- **Reference generation** — creating reference images for a human artist to work from
- **Texture generation** — seamless textures and material bases (hardest for players to identify as AI)

**Bottom line:** AI art generation is never the hard part — post-processing is. **Budget 50%+ of art time for manual refinement.** The games that ship without backlash are ones where AI contribution is invisible.

---

## Goal Hierarchy and Kanban

**Kanban + vertical slicing** is the dominant approach for solo game developers. Kanban's continuous flow (Backlog → To Do → In Progress → Done) requires no sprint ceremonies, provides visual progress, and supports WIP limits that prevent context-switching overload. See → [E4 Vertical Slice Development](./E4_project_management.md#vertical-slice-development)

### The 5-Level Goal Hierarchy

| Level | What | Example | Review Cadence |
|-------|------|---------|----------------|
| **1. Design Pillars** | 3–5 statements defining what makes the game unique | "Every system creates emergent interactions" | Monthly |
| **2. Milestones** | Prototype → Demo → Early Access → Full Game | "Playable demo by month 6" | Monthly |
| **3. Feature Categories** | Core Mechanics, Content, UI/UX, Audio, Art, Systems | Each classified Must-Have / Nice-to-Have / Wishlist | Weekly |
| **4. Tasks** | Actionable items completable in 1–4 hours | "Add fire propagation to grass tiles" | Daily |
| **5. Bugs** | Severity tiers: game-breaking → major → minor → cosmetic | Triage weekly | Weekly |

### WIP Limits

The single most impactful Kanban rule for game devs: **limit "In Progress" to 2-3 items maximum.** When you hit the limit, you must finish something before starting anything new. This prevents the common game dev trap of having 15 half-finished features and nothing shippable.

### Social Milestones

The most important insight (338-upvote Hacker News thread): **"The biggest risk of game development is not how I manage a todo list, but that I'll build the wrong thing because I waited to get feedback."**

Schedule regular "social milestones" — times to show someone your work:

| Milestone | Audience | Purpose |
|-----------|----------|---------|
| Every 2 weeks | Trusted friend/dev | "Does this feel right?" |
| Monthly | Small Discord group | Bug hunting, feature feedback |
| Quarterly | Public (devlog, demo) | Market validation |
| Pre-launch | Wider playtest | Balance, onboarding, flow |

External feedback prevents tunnel vision. The act of preparing a build to show someone forces you to confront what's actually done versus what's "almost done."

---

## Tool Recommendations

### The Two-Tool Pattern

Most successful game devs use exactly two complementary tools:

| Role | Options |
|------|---------|
| **Design docs & knowledge** | Obsidian (local markdown, graph view, Kanban plugin) or Notion |
| **Task execution** | Codecks (game-dev-specific), Trello, or plain text in version control |

Plus version control for code. Over-engineering the PM system is itself procrastination.

**Codecks** is purpose-built for game developers — card-based with doc cards, milestone tracking, and Discord/Steam bug collection. 50,000+ organizations use it.

**Obsidian** excels as a knowledge base. Local-first markdown files are version-controllable. Graph view reveals relationships between creative and technical notes. Limitation: plugin configuration can become its own rabbit hole.

**Plain text** is surprisingly popular among experienced developers. A `todo.txt` in version control, current tasks at top, ideas at bottom. One variant: name it `todo.diff` so the editor color-codes `+` and `-` lines.

### Tools to Avoid Over-Investing In

- **Jira / Linear / Monday** — enterprise tools that create more ceremony than value for game devs
- **Custom dashboards** — building your own PM tool is the ultimate procrastination trap
- **Complex automation** — Zapier/n8n workflows connecting 5 tools is a project, not project management
- **Multiple overlapping tools** — Notion + Obsidian + Trello + a spreadsheet means nothing is the source of truth

**The test:** If setting up your PM system takes more than 2 hours, it's too complex.

---

## The Solo Dev Testing Strategy

Game devs can't afford a QA team, but shipping untested code guarantees painful post-launch weeks. The key is testing strategically — not everything, just the right things.

### What to Test (Priority Order)

1. **Save/load round-trips** — the #1 source of catastrophic bugs in game projects. Corrupt saves = refund requests. Test that every saveable entity survives a save→load→save cycle with all fields intact.

2. **Game-critical state transitions** — main menu → gameplay → pause → resume → death → respawn → victory. Every transition in your game's flow should work without softlocks.

3. **Economy/balance math** — if your game has currency, damage, XP, or any numerical progression, write automated tests that verify the math. AI is excellent at generating these tests.

4. **Edge cases in core mechanics** — what happens at 0 health? At max inventory? At the map boundary? With 0 enemies? With 1,000 enemies? Test the boundaries of your systems.

5. **Platform-specific issues** — if shipping multi-platform, test each target. Controller input, resolution scaling, and performance vary dramatically.

### What NOT to Test

- **Visual polish** — screenshot tests are brittle and unhelpful for game projects
- **Tutorial flow** — needs human playtesters, not automated tests
- **"Fun"** — no test can measure game feel; playtest instead
- **100% code coverage** — diminishing returns past ~60% for game code

### The Playtesting Cadence

| Phase | Frequency | Who | Focus |
|-------|-----------|-----|-------|
| Prototype | Biweekly | You + 1 friend | "Is this fun?" |
| Alpha | Weekly | 3-5 trusted testers | Mechanics, flow, softlocks |
| Beta | Weekly builds, continuous feedback | 10-20 testers | Balance, UX, onboarding |
| Pre-launch | Daily builds, final week | 5-10 fresh players | First-time experience |

**The fresh eyes rule:** Your most valuable playtesters are people who've never seen the game. You can only get a "first impression" once — don't waste it on incomplete builds. See → [P4 Playtesting Guide](./P4_playtesting.md)

### AI-Assisted Testing

AI is excellent at generating test cases you wouldn't think of:

```
Prompt: "I have a damage system with health, armor, and
status effects. Generate edge case test scenarios that
would break the system."

AI will often find:
- Negative damage (healing through the damage pipeline)
- Armor exceeding damage (negative result)
- Status effects on dead entities
- Simultaneous killing blows from multiple sources
- Damage during invincibility frame edges
```

Use AI to generate the test scenarios, then implement them yourself. The scenarios are the creative part; the implementation is mechanical.

---

## Version Control for Solo Devs

Version control isn't optional even for solo projects. It's your undo button, your backup, your history, and your deployment pipeline.

### The Solo Dev Git Workflow

Forget gitflow, trunk-based development, and other team patterns. Game devs need exactly this:

```
main branch ← your game lives here, always buildable
feature branches (optional) ← for risky experiments
tags ← for releases and milestones
```

### Commit Discipline

**Commit after every meaningful change.** Not every line — after every logical unit of work. A good game dev commits 5-15 times per productive day.

Good commit messages for game dev:
```
feat: add double-jump with coyote time
fix: inventory overflow when picking up stacked items
balance: reduce wave 3 enemy count from 20 to 12
art: add idle animation frames for merchant NPC
audio: implement music crossfade between biomes
refactor: extract damage pipeline from PlayerController
```

**The golden rule:** If your laptop dies right now, how much work do you lose? The answer should be "less than 2 hours" at all times. Commit and push regularly.

### What to Version Control

- ✅ All source code
- ✅ Scene/level files (`.tscn`, `.scene`, `.prefab`)
- ✅ Project settings
- ✅ Build scripts and CI configuration
- ✅ Design docs (GDD, architecture docs, decision records)
- ✅ Small art source files (if manageable)
- ⚠️ Large binary assets (use Git LFS or keep in a separate asset repo)
- ❌ Build output / compiled files
- ❌ IDE-specific settings (`.vs/`, `.idea/`) — use `.gitignore`
- ❌ API keys, secrets, license files

### Branching for Risky Experiments

When you want to try something that might break everything:

```bash
git checkout -b experiment/new-combat-system
# ... work on it for hours or days ...

# If it works:
git checkout main
git merge experiment/new-combat-system

# If it doesn't:
git checkout main
git branch -D experiment/new-combat-system
# Zero damage to your working game
```

This is dramatically safer than "I'll just comment this out and try something."

### Backup Beyond Git

Git is not a backup system. It's a version control system that happens to store history. Ensure you have:

- **Remote repository** (GitHub, GitLab, Codeberg) — protects against local drive failure
- **Local backup** (Time Machine, restic, or manual copies) — protects against account lockout
- **Asset backup** (cloud storage) — for large files not in Git

**The 3-2-1 rule:** 3 copies, 2 different media types, 1 offsite. Your game's source code represents hundreds or thousands of hours of work. Protect it accordingly.

---

## Patterns from Successful Solo Games

Studying Stardew Valley, Hollow Knight, Celeste, Undertale, Vampire Survivors, Balatro, Papers Please, Brotato, and Slay the Spire 2 reveals consistent patterns:

### The Passion Project Pattern

**Passion projects with low expectations.** Barone began Stardew Valley to practice C# and would have been happy selling 10,000 copies (sold 50M). LocalThunk started Balatro during vacation and expected "possibly 2 copies" (sold 5M). Galante wanted 100 itch.io players for Vampire Survivors.

**No formal PM tools.** Team Cherry "barely used Trello." LocalThunk used no documented methodology. Barone worked without formal processes. What they did instead: obsessive single focus + strategic breaks. LocalThunk deliberately stopped working when his drive faded, returning refreshed two months later. Barone took a month off to make a small mobile game.

**Almost none succeeded on their first game.** Barone had "mostly unfinished" prior projects. LocalThunk had been making games for ten years. Gervraud (Brotato) shipped three games first. Cawthon made ~70 games before Five Nights at Freddy's.

### The Engine Doesn't Matter (Much)

Stardew Valley was built on C#/XNA → MonoGame. Slay the Spire 2 — the biggest indie launch in history (4.6M copies, $92M revenue in its first weeks) — was built on Godot after the team migrated from a custom Java engine. Vampire Survivors runs on a web framework. Balatro uses LÖVE (Lua). Celeste uses a custom C# engine.

**The pattern:** successful game devs pick an engine they're comfortable with and ship, rather than spending months evaluating "the best" engine. The game's design and polish matter 100x more than the technology underneath.

### The Constraint Advantage

Every major solo hit was built under severe constraints:

| Game | Key Constraint | Result |
|------|---------------|--------|
| Undertale | Deliberately simple pixel art | One person handled ALL visuals |
| Vampire Survivors | No complex AI, no levels | Shipped in weeks, iterated in public |
| Balatro | Single-screen card game | Deep mechanics in tiny scope |
| Papers Please | Brown palette, simple animations | Mood through restriction |
| Brotato | Auto-aim, wave-based, one arena | Tight loop, fast iteration |

**The lesson:** Constraints aren't limitations — they're design decisions that make game development possible. Pick your constraints early and make them part of the game's identity.

### The "Ship Ugly, Polish Later" Pattern

Vampire Survivors launched with programmer art and became a phenomenon. Stardew Valley's early builds looked nothing like the final product. Balatro's prototype was a weekend project.

Every one of these developers improved the game dramatically post-launch through updates. **The feedback from real players was more valuable than months of pre-launch polishing.**

---

## Scope Creep and AI Amplification

Every case study documented scope growing beyond initial expectations. Celeste expanded from 200 planned levels to 600+. Hollow Knight's DLC became a full sequel (Silksong, still in development 7+ years later). Papers Please's 6-month estimate became 9 months.

AI amplifies this risk — when generating a new enemy type takes minutes instead of days, "just one more" is constant temptation. The "500 Hours of Vibe Coding Broke Me" trend on r/gamedev is a direct result: developers generating features faster than they can integrate, test, and polish them.

### Antidotes

- **Design pillars as filter** — every new idea must support your 3–5 core pillars
- **Hard deadlines with cuts, not delays** — "Make cuts to the game to meet the deadline instead of pushing the deadline back for more content"
- **Separate "Future Ideas" document** — acknowledge ideas but defer them outside current scope
- **Intentional constraints** — limit color palette, level count, mechanic count
- **The Vampire Survivors approach** — Galante kept a "secret roadmap" but refused to share it because "expectations create pressure"
- **The 48-hour rule** — when AI generates something cool you didn't plan, wait 48 hours before integrating it. If you still want it after 48 hours, evaluate it against your pillars.

### The Polaris Framework (Fix/Polish Phase)

Categorize everything as:
1. **Essentials** — without them the game loses its USP
2. **Baseline** — minimum for a complete game
3. **Accessories** — not necessary to ship

Within each tier: Core Mechanics → Content → Quality of Life → Polish. Reserve 20–30% of development time for pure polish and bug fixing. **No new features during polish phase.** See → [E4 The Pivot Decision](./E4_project_management.md#the-pivot-decision)

---

## Health, Sustainability & The Long Haul

Solo game development commonly spans 2-5 years. Over these timescales, your biggest risks aren't technical — they're personal. Burnout, isolation, decision fatigue, and loss of motivation kill more solo projects than bad code.

### Work Schedule

**Set working hours and enforce them.** The lack of external accountability makes it tempting to work 14-hour days during "inspired" periods and zero hours during slumps. Both extremes are harmful.

| Schedule Pattern | Sustainability | Notes |
|-----------------|----------------|-------|
| Fixed 6hr/day (e.g., 9am-3pm) | ⭐⭐⭐⭐⭐ | Most sustainable long-term |
| Fixed 8hr/day (e.g., 9am-5pm) | ⭐⭐⭐⭐ | Standard but risks overtime creep |
| "When I feel like it" | ⭐⭐ | Produces feast/famine cycles |
| Crunch-based (60+ hr/week) | ⭐ | Leads to burnout within months |
| Part-time with day job (2-4hr/day) | ⭐⭐⭐⭐ | Slower but financially sustainable |

**The crunch trap:** Game devs crunch harder than studio employees because there's no one to stop them. The GDC 2026 State of the Industry report showed sustained crunch correlates with lower game quality, not higher — exhausted devs make worse decisions.

### Energy Management

Not all hours are equal. Identify your peak cognitive hours and protect them for creative/architectural work.

```
Peak hours (2-4 hrs)  → Architecture, core mechanic design, complex code
Medium hours (2-4 hrs) → Implementation, content creation, testing
Low hours (1-2 hrs)   → Asset organization, bug triage, email, marketing
```

**Track your energy, not just your time.** A productive 4-hour morning beats a grinding 10-hour day. See → [E4 Energy Management & Burnout Prevention](./E4_project_management.md#energy-management--burnout-prevention)

### The Motivation Cycle

Long projects have predictable motivation patterns:

```
Months 1-3:   EXCITEMENT  → Everything is new, progress is visible
Months 3-6:   THE DIP     → Core work is hard, novelty is gone
Months 6-12:  THE GRIND   → Repetitive content creation, polish
Months 12-18: SECOND WIND → Game takes shape, playtester feedback energizes
Months 18+:   FINISH LINE → Either renewed drive or burnout
```

**Surviving The Dip:** This is where most solo projects die. Strategies that work:
- **Switch tasks** when energy flags — art when tired of code, code when tired of art
- **Play your own game** — remember why you're building it
- **Public accountability** — devlogs, Discord community, streamer friends
- **Small visible wins** — ship a juice effect, a particle system, a sound effect. Dopamine from tangible progress combats the abstract feeling of "nothing is done"
- **Strategic breaks** — LocalThunk took 2 months off from Balatro and came back refreshed. Walking away temporarily is not quitting.

### Isolation and Mental Health

Game development is genuinely isolating. Mitigation:

- **Join a game dev community** — r/gamedev, engine-specific Discords, local game dev meetups
- **Find an accountability partner** — another game dev you check in with weekly
- **Separate work space from living space** — even if it's just a different desk orientation
- **Maintain non-gamedev social connections** — the tendency to withdraw into the project is real and harmful

---

## Community Building & Player Management

Building a community around your game before launch is the single highest-leverage marketing activity for game devs. It provides playtesters, creates wishlists, generates word-of-mouth, and sustains motivation.

### When to Start

| Phase | Community Activity |
|-------|-------------------|
| **Prototype** | Start a devlog (Twitter/Mastodon). Join relevant subreddits. |
| **Vertical Slice** | Create a Discord server. Start posting GIFs/clips. |
| **Alpha** | Recruit closed playtesters from Discord. |
| **Beta** | Release a public demo (Steam Next Fest, itch.io). |
| **Pre-Launch** | Activate press, streamers, YouTube. Final wishlist push. |
| **Post-Launch** | Community management becomes 20-40% of your time. |

### Discord Server Structure (Minimal Viable)

Don't over-engineer your Discord. Start with:

```
#announcements     (read-only, major updates only)
#general           (community chat)
#bug-reports       (structured with template)
#feedback          (playtester input)
#screenshots       (player-generated content)
```

**Add channels only when the existing ones are too noisy.** Most game dev Discords fail by creating 20 empty channels that make the community feel dead.

### Managing Feedback as a Solo Dev

You'll receive more feedback than you can act on. Triage it:

1. **Listen for patterns, not individuals** — one person saying "too hard" is an opinion; ten people saying it is data
2. **Separate "what" from "how"** — players are excellent at identifying problems, terrible at proposing solutions
3. **Log everything, act on patterns** — use a simple spreadsheet: Feedback | Source | Count | Priority | Status
4. **Never argue** — thank people for feedback, even when it's wrong. Arguing with players on your own Discord is always a loss
5. **Set expectations** — "Game dev, updates come when they're ready" is a perfectly acceptable stance

### The Content Creator Relationship

Streamers and YouTubers are force multipliers for game projects. But the relationship is asymmetric — you need them more than they need you.

- **Send keys early** — 2-4 weeks before launch
- **Make it easy to cover** — include a press kit (screenshots, logo, description, key art)
- **Don't ask for coverage** — send the key and let them decide
- **Small creators matter more** — a 5K subscriber YouTuber who loves your genre will generate more wishlists per viewer than a 500K generalist
- **Clip-friendly moments** — design your game with shareable moments (funny deaths, epic saves, unexpected interactions)

---

## Launch Timing & Market Awareness

When you launch matters almost as much as what you launch.

### Windows to Avoid

- **Steam Summer/Winter Sales** — your launch gets buried by discounts on established games
- **AAA release weeks** — major releases dominate press and streamer attention
- **Holiday weeks** — Christmas/New Year, people are busy and press is on vacation
- **Steam Next Fest week** — if you're not in it, attention is elsewhere
- **Other major indie launches in your genre** — check SteamDB for upcoming releases

### Windows to Target

- **Post-Steam-Sale recovery** — the 1-2 weeks after a major sale ends, wishlists start converting again
- **Steam Next Fest** — the single highest-leverage event for indie wishlisting
- **Genre-relevant events** — horror during October, cozy games during autumn/winter
- **Quiet release windows** — Tuesday-Thursday releases in non-holiday weeks with no major launches

### The Wishlist Math

Steam's algorithm favors games with high wishlist velocity (wishlists per day), not just total count. Implications:

- **Build wishlists steadily** — 10/day for 6 months beats 1,000 in one week then silence
- **Coordinate visibility pushes** — devlog + Reddit + streamer key drop on the same day
- **Steam page as early as possible** — you can't collect wishlists without a store page
- **50,000 wishlists** is the commonly cited threshold for a "likely profitable" launch, but many successful games launched with far fewer. Vampire Survivors had almost none.

### Market Research (Minimal Viable)

Before committing 2+ years to a project:

1. **Search your genre on Steam** — how many games exist? How do they sell?
2. **Check SteamDB** — what's the revenue range for recent games in your genre?
3. **Read reviews of similar games** — what do players love? What do they complain about?
4. **Find the gap** — what does your game offer that existing games don't?

**Don't over-research.** Analysis paralysis kills more projects than bad market fit. A passionate developer shipping a niche game beats a strategic developer who never ships. See → [P14 Marketing Timeline](./P14_marketing_timeline.md)

---

## Living Documentation

Game development commonly spans 2–5 years. Over these timescales, you will forget why you made critical decisions unless you document them.

### The Four-Element System

1. **Living GDD** — core concept, design pillars, mechanics, target audience, art direction, feature list with priority tiers. Updated continuously, not written once and shelved. Cross out old decisions with dates when they change. See → [P9 GDD Template](./P9_gdd_template.md)

2. **Architecture Decision Records** — date, context, decision, reasoning, status. Stored in `decisions/` alongside project code. Critical for AI-assisted dev: when AI generates a system six months from now, you need to know *why* your MovementSystem handles collision checking rather than a separate CollisionSystem. See → [E4 Documentation That Compounds](./E4_project_management.md#documentation-that-compounds)

3. **Weekly development notes** — brief private summary of what was accomplished, blockers, and next-week plans. Maintains continuity across sessions. Five minutes on Friday prevents 30 minutes of "where was I?" on Monday.

4. **Public devlog** — monthly or biweekly. Serves as external accountability, community building, and forced reflection. Start only after you have a playable prototype.

### AI-Friendly Project Documentation

Structure your project docs so AI tools can use them effectively:

```
project-root/
├── AGENTS.md          # Architecture patterns, conventions, constraints
├── DESIGN.md          # Design pillars, core mechanics, scope boundaries
├── decisions/
│   ├── ADR-001_engine_choice.md
│   ├── ADR-002_ecs_vs_oop.md
│   └── ADR-003_art_style.md
├── docs/
│   ├── mechanics.md   # How each mechanic works
│   ├── entities.md    # What each entity type does
│   └── systems.md     # What each system is responsible for
└── todo.md            # Current priorities
```

The `AGENTS.md` file is particularly important — it gives AI coding tools the context they need to generate code that fits your project rather than generic code. Include: naming conventions, architectural patterns in use, patterns to avoid, key abstractions, and import conventions.

---

## Decision Journal Workflow

A decision journal is a guided process for documenting project decisions as Architecture Decision Records (ADRs). Use it when facing any significant choice — framework selection, architectural patterns, feature scope, art direction.

### The Process

1. **Identify the decision** — What's the question? What triggered it? What's the cost of deciding wrong?
2. **Explore options** — For each option, evaluate: effort, risk, alignment with design pillars, reversibility
3. **Check against design pillars** — If you have defined pillars (in `DESIGN.md` or your GDD), evaluate every option against them
4. **Decide and document** — Write an ADR file in `decisions/ADR-NNN_title.md` with context, options considered, decision, reasoning, and consequences
5. **Review periodically** — Revisit ADRs when assumptions change. Update status to Superseded when a new ADR replaces an old decision

### ADR Template (Minimal)

```markdown
# ADR-NNN: [Title]

**Date:** YYYY-MM-DD
**Status:** Accepted / Superseded by ADR-XXX / Deprecated

## Context
What is the issue that we're seeing that is motivating this decision?

## Options Considered
1. **Option A** — pros, cons, effort estimate
2. **Option B** — pros, cons, effort estimate
3. **Option C** — pros, cons, effort estimate

## Decision
We will use Option B because...

## Consequences
- Positive: ...
- Negative: ...
- Risks: ...
```

ADR files live in `decisions/` at the project root. Format: `ADR-NNN_snake_case_title.md`. Auto-numbered by scanning existing files.

### When to Write an ADR

- ✅ Engine or framework choice
- ✅ Major architectural pattern (ECS vs OOP, signal bus vs direct coupling)
- ✅ Art style or audio approach
- ✅ Scope cuts (what was cut and why)
- ✅ Third-party library adoption
- ❌ Minor implementation details (use code comments instead)
- ❌ Anything easily reversible (just try it)

---

## Planning Session Workflow

A planning session is a structured kickoff for development work — whether it's a weekly check-in, feature planning, or scope review.

### The Process

1. **Review current state** — Recent git activity, open decisions, blockers
2. **Define session goal** — New feature? Bug triage? Scope review? Weekly planning?
3. **Inventory progress** — What shipped since last session? Any blockers?
4. **Identify priorities** — Walk the 5-level goal hierarchy:
   - Are design pillars defined? If not, define them first
   - What milestone are we in?
   - What are the 1–3 most important tasks for the next work session?
5. **Scope check** — Review backlog and "Future Ideas." Flag scope creep vs. essential work
6. **Surface open decisions** — Any choices that need documenting? Run the decision journal for each
7. **Write session summary** — What was decided, what's next, any blockers

### Weekly Review (15 Minutes)

Every week, spend 15 minutes on:

```
1. What shipped this week? (list completed tasks)
2. What didn't ship? Why? (blockers, scope changes, motivation)
3. What are the top 3 priorities for next week?
4. Any scope creep to address?
5. How am I feeling about the project? (1-5 energy check)
```

The energy check (question 5) is an early warning system for burnout. Three consecutive weeks below 3 means something structural needs to change — not just "push harder."

---

## The Solo Dev Tech Stack Decision

Choosing your tech stack is the first irreversible decision of a project. Spend enough time to be confident, but don't let analysis paralysis delay starting.

### Engine Decision Framework

```
Do you have engine experience?
├── Yes → Use the engine you know (95% of the time)
└── No
    ├── 2D game?
    │   ├── Want visual editor? → Godot
    │   ├── Want maximum control? → MonoGame, Raylib, LÖVE
    │   └── Want huge community? → Unity
    └── 3D game?
        ├── Indie scope? → Godot (improving rapidly)
        └── AAA scope? → Unity or Unreal (game dev + AAA scope is a red flag)
```

### Build vs Buy

For every system in your game, you have three options:

| Option | When to Use |
|--------|------------|
| **Use engine built-in** | It exists and is adequate (usually the right choice) |
| **Use third-party library** | It exists, is maintained, and is better than rolling your own |
| **Build custom** | Core differentiator of your game, or nothing adequate exists |

**The rule:** Build custom only for systems that define your game's uniqueness. Everything else should be off-the-shelf. A custom physics engine for a platformer is wasted effort. A custom card system for a deckbuilder might be essential.

### Libraries: Red Flags

Before adopting a third-party library:

- **Last commit date** — more than 6 months ago = risky
- **Open issues** — hundreds of unanswered issues = understaffed
- **Breaking changes** — major version bumps every few months = maintenance burden
- **Documentation** — no docs = you'll spend more time reading source than using it
- **License** — GPL contaminates your project; MIT/Apache/BSD are safe

---

## The AI+PM Feedback Loop

AI and project management are not separate concerns — they form a feedback loop:

```
Good PM directs AI     → Clear milestones tell you what to ask AI to build
Good AI accelerates PM → Faster delivery, batch-clearing backlogs
Bad PM lets AI amplify  → No scope boundaries, features pile up unchecked
Bad AI creates PM debt  → Unreviewed code introduces bugs, debt derails timeline
```

### The Positive Loop

- **Good PM directs AI** → Clear milestones tell you *what* to ask AI to build. Design pillars filter AI suggestions. Vertical slices scope AI-generated work into shippable increments.
- **Good AI accelerates PM** → Faster delivery against milestones. Batch-clearing papercut tasks. Rapid prototyping for design validation.

### The Negative Loop

- **Bad PM lets AI amplify chaos** → No scope boundaries means AI-generated features pile up unchecked. No design pillars means every AI suggestion seems worth pursuing.
- **Bad AI creates PM debt** → Unreviewed AI code introduces subtle bugs. Architectural coherence erodes. Technical debt derails the timeline.

### The Bottom Line

The developers who shipped the decade's biggest indie hits — without any AI tools — did so through obsessive focus, strategic constraints, authentic creative vision, and the discipline to ship finished rather than perfect. AI doesn't change that formula. It compresses the timeline for the parts that were never the bottleneck. **The bottleneck was always creative direction, scope discipline, and the willingness to keep going.**

---

## Common Mistakes

### 1. "I'll Clean Up the AI Code Later"

**Wrong:** Accept AI output, plan to refactor later, never do.
**Right:** Review and clean up AI code immediately. Technical debt from AI accumulates faster than human-written debt because you understand it less deeply.

### 2. Optimizing the PM System Instead of the Game

**Wrong:** Spend a week setting up Notion templates, Kanban automation, and custom dashboards.
**Right:** `todo.txt` in your repo. Start building the game. Upgrade PM tools only when the simple system fails.

### 3. Building an Engine Instead of a Game

**Wrong:** "I need a custom ECS / renderer / asset pipeline before I can start my game."
**Right:** Use existing tools. Build custom only when you hit a wall that existing tools can't solve. The game is the product, not the engine.

### 4. Skipping the Prototype

**Wrong:** Plan the full game on paper, start building systems in order.
**Right:** Build the core mechanic first. If it's not fun in prototype, no amount of content or polish will save it. See → [P1 Pre-Production](./P1_pre_production.md)

### 5. Solo Dev Crunch

**Wrong:** "I have to work 80 hours this week to hit my self-imposed deadline."
**Right:** Move the deadline. You imposed it; you can move it. No one else is counting. Crunch-quality work gets thrown out anyway.

### 6. Comparing Your Progress to Others

**Wrong:** "That game dev shipped in 6 months; I've been working for 2 years."
**Right:** Survivorship bias. You see the successes, not the thousands of failed/abandoned projects. Compare yourself to your own progress last month, not to strangers on Twitter.

### 7. Infinite Polishing

**Wrong:** "I'll launch when it's perfect."
**Right:** "I'll launch when it's good enough, then patch based on player feedback." Every successful solo game shipped with known issues and improved post-launch. See → [P11 Polish Checklist](./P11_polish_checklist.md)

---

## Related Docs

- [E4 Game Dev Project Management](./E4_project_management.md) — scope management, vertical slicing, burnout prevention
- [E5 AI-Assisted Dev Workflow](../ai-workflow/E5_ai_workflow.md) — CONTEXT.md, prompt patterns, AI code review
- [P0 Master Playbook](./P0_master_playbook.md) — complete production pipeline overview
- [P1 Pre-Production](./P1_pre_production.md) — prototyping, scope definition, vertical slice
- [P4 Playtesting Guide](./P4_playtesting.md) — playtesting methodology and templates
- [P7 Launch Checklist](./P7_launch_checklist.md) — everything needed for launch day
- [P8 Common Pitfalls](./P8_pitfalls.md) — mistakes that kill game projects
- [P9 GDD Template](./P9_gdd_template.md) — living game design document structure
- [P11 Polish Checklist](./P11_polish_checklist.md) — what to polish before launch
- [P14 Marketing Timeline](./P14_marketing_timeline.md) — marketing cadence for game projects
- [P15 Post-Mortem Template](./P15_postmortem_template.md) — structured reflection after shipping
- [G_stitch UI Workflow](../game-design/G_stitch_ui_workflow.md) — AI-assisted UI prototyping
