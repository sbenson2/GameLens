# Bevy Engine Research

Weekly research for MCP module development.
**Last updated:** 2026-03-24

---

## Engine Overview

- **Language:** Rust
- **Architecture:** Pure ECS (Entity Component System) — not bolted on, it IS the architecture
- **Current version:** 0.18.1 (released Dec 30, 2025), 0.19 in development
- **Release cadence:** ~3 months, every release has breaking changes
- **GitHub stars:** ~44K+ (as of Feb 2026, up from ~38K estimate)
- **License:** MIT/Apache-2.0 dual license
- **Official warning on README:** "Bevy is still in the early stages of development. Important features are missing. Documentation is sparse."

## Current State (March 2026)

### What's Good
- **Pure ECS by default** — not optional, everything is components + systems + resources
- **Rust's type system** prevents entire classes of bugs (no null, ownership enforced)
- **Solari raytraced renderer** (experimental) — real-time RT in 0.17, improved in 0.18 with specular reflections, soft shadows
- **Bevy Remote Protocol (BRP)** — built-in HTTP protocol for external tools to inspect/mutate live game state. Unique among game engines.
- **Hot reloading** — Bevy + Dioxus teams collaborating on improved hot reload (mentioned on Twitter, potentially huge)
- **BSN (Bevy Scene Notation)** — new scene format landed in 0.16, Bevy's answer to scene files
- **Modular plugin architecture** — add only what you need via Cargo features
- **0.18 highlights:** Atmosphere occlusion + PBR shading, generalized atmospheric scattering, Solari improvements, font variations, automatic directional UI navigation, fullscreen materials, first-party camera controllers, Popover/Menu widgets, cargo feature collections
- **Text-based everything** — all Rust source, no binary scene files, inherently AI-readable
- **no_std support** (0.16+) — can target embedded/exotic platforms
- **174 contributors, 659 PRs** in 0.18 alone

### What's Painful

1. **Breaking changes every 3 months** — THE #1 pain point. Every release breaks plugins, tutorials, and AI-generated code. Migration guides exist but upgrades take "a couple of days for medium to large projects." LLMs trained on older Bevy versions generate code that doesn't compile.

2. **No visual editor** — "build your own tooling" situation. Community tools exist (bevy_inspector_egui, space_editor, bevy_trenchbroom, Blender integration) but nothing like Unity/Godot editors. Editor is the most-requested feature year after year.

3. **UI is still painful** — bevy_ui described as "inadequate for anything but the simplest game menus." 0.17 introduced Feathers (standard widgets), 0.18 added Popover/Menu, but the ecosystem is fragmented: sickle_ui, bevy_egui, bevy_lunex, quill. Reddit quote: "Bevy turns simple things into thousands of lines of ECS queries" for UI.

4. **Documentation is sparse** — official docs.rs API docs exist but conceptual/tutorial docs are thin. The **Unofficial Bevy Cheat Book** (bevy-cheatbook.github.io) is the de facto learning resource, not official docs. Community explicitly requested "better docs" for 2026.

5. **Plugin ecosystem fragility** — third-party crates break on every Bevy release. Dead dependencies are common. You may need to fork and update crates yourself.

6. **Platform support uneven** — iOS/Android immature, web has severe performance limitations (WASM binary size), VR is "community experiment" stage, console support nonexistent.

7. **No first-party physics** — must bring your own (bevy_rapier, avian/bevy_xpbd). 0.18 discussions mention Bevy may offer "some built-in components" but you still need a third-party engine.

8. **Audio is basic** — functional but simple. bevy_kira_audio is the community standard but still not feature-rich.

9. **Animation limited** — basic animation blending, no first-party animation graph. Improving but not production-ready for complex characters.

10. **Compile times** — Rust compilation is slow. Bevy recommends special "fast compile" setup (dynamic linking, cranelift backend). Cold builds can be 2-5+ minutes.

11. **Steep learning curve** — Rust ownership + ECS + Bevy-specific patterns = triple learning curve. "If you aren't in love with Rust and ECS architecture, it would be a giant pain to use."

12. **Asset processing** — not fleshed out enough for complex use cases.

## AI + Bevy: The Unique Challenge

### Why LLMs Struggle with Bevy
- **Rapid API churn** — Code from 6 months ago often doesn't compile. LLMs trained on older versions recommend non-existent functions, removed APIs, or deprecated patterns.
- **Rust's strict type system** — AI-generated code that "looks right" often fails the borrow checker. Bevy's heavy use of generics, derive macros, and the query system creates code that's harder for LLMs to get right than GDScript or C#.
- **LLMs recommend non-existent crates** — Reddit users report AI suggesting Bevy plugins that don't exist or are abandoned.
- **ECS is paradigm-different** — Most LLM training data is OOP. Bevy's "systems are functions, data is components, no methods on entities" pattern is foreign to models trained mostly on Unity/Godot/OOP code.
- **Academic validation** — arxiv paper (2602.22764) on LLM Rust issue resolution found agents "struggle to correctly model the project's structural context" in Bevy specifically, failing at understanding how reflected trait objects work.

### AI-Assist Demand
- Reddit thread: "What is the best AI chatbot/tools to help with Bevy?" — users frustrated that LLMs don't know current Bevy APIs
- SpecKit/brkrs project: spec-first development for Bevy + AI-assisted coding, published as learning resource
- This is **exactly** the problem a knowledge MCP solves — version-pinned, correct patterns

## MCP Competitive Landscape

### Existing Bevy MCP Servers (ALL editor-integration, ZERO knowledge-layer)

| Server | Type | Description | Stars/Downloads |
|--------|------|-------------|-----------------|
| **bevy_brp_mcp** (natepiano) | Editor integration | Launch, inspect, mutate Bevy apps via BRP. Component watching, example runner, log management. Published on crates.io, follows Bevy version numbering (0.18.3). | Listed on LobeHub, mcpservers.org |
| **bevy_debugger_mcp** (Ladvien) | Debugger | AI-assisted debugging via Claude Code. Real-time observation, smart experimentation with rollback, performance analysis. "Vibe coded" — experimental quality. | crates.io v0.1.2 |
| **bevy_mcp** (Nub) | Editor integration | Bridges MCP to running Bevy instances via BRP. 13 tools: world_query, spawn, despawn, component CRUD, resource management, registry schema, multi-target support. Requires Bevy 0.18 + RemotePlugin. | GitHub repo |
| **rltvty/bevy-mcp** | Code editing | "MCP server for bevy to enable better edits of your code by LLMs" | GitHub repo |

### Key Insight
- **4 Bevy MCP servers exist, ALL are editor/debugger integration**
- **ZERO knowledge-layer Bevy MCPs** — our niche is completely open
- bevy_brp_mcp is the most mature — follows Bevy versioning, published on crates.io
- BRP (Bevy Remote Protocol) is unique to Bevy — no other engine has a built-in inspection protocol

### Claude Code Skills on LobeHub
- **bfollington/terma-bevy** (34⭐, 8 installs) — ECS patterns, system ordering, query patterns, parallelism, UI development, build strategies, common pitfalls, debugging techniques. v1.0.2.
- **ngxtm/devkit-bevy** — Another Bevy skill on LobeHub
- These validate demand for curated Bevy knowledge delivered to AI agents

## Community Resources

### Official
- **bevy.org** — main site, news, quick start guide
- **docs.rs/bevy** — API documentation (auto-generated from source)
- **bevy.org/learn** — quick start, migration guides, examples, error codes
- **bevy.org/assets** — community plugins, tools, learning resources
- **GitHub Discussions** — official Q&A
- **Discord** (discord.gg/bevy) — very active, primary support channel
- **r/bevy** — official subreddit
- **This Week in Bevy** (thisweekinbevy.com) — weekly newsletter, excellent pulse on ecosystem

### Community Learning
- **Unofficial Bevy Cheat Book** (bevy-cheatbook.github.io) — THE go-to learning resource. "Aggregates community wisdom not covered by official documentation." Critical reference for any Bevy module.
- **DeepWiki (deepwiki.com/bevyengine/bevy)** — AI-generated wiki for Bevy's codebase
- **JetBrains RustRover blog** — "First Steps in Game Development with Rust and Bevy" tutorial
- **brkrs** — open-source Breakout game designed as Bevy learning playground with spec-first + AI-assisted coding

### Key Community Sentiment
- r/bevy 2025 Year in Review: "The engine's still not perfect, but the community is figuring things out, one workaround at a time. Here's hoping next year brings better docs, and maybe a stable UI system and editor."
- Community is passionate but realistic about limitations
- **Anti-AI sentiment is LOW** in Bevy community compared to Godot — Rust devs are generally more pragmatic about tooling

## Doc Needs Assessment

### What a Bevy MCP Module Should Prioritize

**Critical (highest pain → highest value):**
1. **bevy-rules.md** — Version-pinned API rules for current Bevy (0.18). THE highest value doc. Must enforce: correct system ordering, current query syntax, current bundle/component APIs, 0.16→0.17→0.18 migration patterns. This prevents the #1 AI failure mode.
2. **ECS Architecture Guide** — Components vs Resources vs Events, system ordering, run conditions, plugin architecture. Bevy's ECS is different enough from Unity ECS or other implementations that a dedicated guide is essential.
3. **Common Patterns & Anti-Patterns** — Borrow conflicts between systems, entity lifecycle mistakes, correct state management, spawning/despawning patterns. The cheat book covers some of this but it's scattered.

**High Value:**
4. **UI Development** — Because bevy_ui is notoriously painful and the ecosystem is fragmented, a guide covering current best practices + which third-party solution to pick would be extremely valuable.
5. **Physics Integration** — bevy_rapier vs avian/bevy_xpbd comparison, integration patterns, since there's no first-party physics.
6. **Asset Loading & State Management** — Scene composition, asset pipeline, state-driven game structure.
7. **Performance & Build Optimization** — Fast compile setup, profiling with bevy diagnostics, system parallelism optimization.

**Medium Value:**
8. **2D Game Patterns** — Sprite rendering, tilemap (bevy_ecs_tilemap), camera, collision. 2D is the most common indie use case.
9. **Input Handling** — Keyboard/mouse/gamepad with Bevy's input system.
10. **Audio** — bevy_kira_audio integration patterns.
11. **Networking** — bevy_replicon or custom networking via BRP.
12. **Platform Export** — WASM/web builds, mobile considerations.

### Module Plan (Proposed — 12 docs across 3 phases)

**Phase 1 — Foundation (4 docs)**
- E1: Architecture Overview (ECS philosophy, comparison with Godot/Unity)
- bevy-rules.md (AI code gen rules, version-pinned APIs, migration traps)
- G1: ECS Patterns (components, bundles, resources, events, queries)
- G2: System Ordering & Plugins (scheduling, run conditions, plugin architecture)

**Phase 2 — Core Gameplay (4 docs)**
- G3: State Management & Scenes (BSN, game states, loading)
- G4: Physics Integration (rapier/avian patterns)
- G5: 2D Game Patterns (sprites, tilemaps, camera, collision)
- G6: Input & Controls

**Phase 3 — Production (4 docs)**
- G7: UI Development (bevy_ui + ecosystem comparison)
- G8: Asset Pipeline & Performance
- G9: Audio (bevy_kira_audio integration)
- G10: Networking & Multiplayer

## Strategic Analysis for gamecodex

### Why Bevy Module Makes Sense
1. **Zero competition** in knowledge-layer MCP space for Bevy
2. **AI struggles the MOST with Bevy** due to Rust + rapid API changes → highest value for a knowledge MCP
3. **Community explicitly wants better docs** — year after year
4. **Bevy Remote Protocol** is unique — our MCP can complement BRP-based MCPs (they do runtime inspection, we do knowledge)
5. **Rust gamedev is growing** — Bevy is the clear leader, no close second
6. **Smaller community = faster word-of-mouth** — Bevy devs actively share useful tools

### Why Bevy Module Should Wait (after Godot)
1. **Smaller market** — Bevy's community is ~10-20% the size of Godot's
2. **Rust is niche** — limits potential user base
3. **API instability** — docs need updating every 3 months. Maintenance burden is MUCH higher than Godot or Unity
4. **No Pro content strategy yet** — what gates behind Pro for Bevy? Advanced ECS patterns, performance guides, production patterns?
5. **Content creation is harder** — Rust code examples are more verbose, patterns are more complex

### Unique Angle
- **"Version-pinned Bevy knowledge"** — this is the killer pitch. When LLMs hallucinate old Bevy APIs, our MCP gives the agent correct 0.18 patterns. No one else does this.
- **Cross-engine ECS comparison** — Unity ECS, Bevy ECS, and our MonoGame ECS patterns side by side
- **bevy-rules.md as viral content** — like godot-rules.md, a "rules file" that constrains AI to correct Bevy patterns could be independently valuable and drive awareness

## Key Metrics to Track
- Bevy GitHub stars: ~38K (growing steadily)
- r/bevy subscribers: growing but small
- crates.io downloads for bevy: track monthly
- bevy_brp_mcp adoption (closest ecosystem indicator)
- This Week in Bevy readership as community health indicator

---

## Research Log

### 2026-03-21 (Rotation 1)
- Initial deep research completed
- Bevy 0.18 released Dec 2025, 0.19 in development
- 4 MCP servers found, all editor-integration
- Key pain points documented: breaking changes, no editor, UI inadequate, sparse docs
- AI+Bevy challenges are severe — highest of all 3 engines
- 12-doc module plan proposed across 3 phases
- Recommendation: Bevy module is Phase 3 (after Godot completion), but bevy-rules.md could be created early as a standalone viral piece

### 2026-03-24 (Rotation 2)

**Engine Status:**
- **Bevy 0.19-dev in active CI** — GitHub issue #23215 shows `v0.19.0-dev` compiling in CI as of March 4, 2026. 3D testbed crashes on Windows being tracked. Active development continuing on main branch.
- **0.18.1 patch released** (Prism News coverage) — stabilization fixes for regressions from 0.18. bevy_brp_mcp tracks this versioning.
- **GitHub stars at 44,000+** (Medium comparison article, Feb 2026) — up from ~38K in our initial estimate. Significant growth.

**Community & Content Developments:**
- **"Rust Game Engines in 2026" Medium article** (Aarambh Dev Hub, Feb 28) — comprehensive 4-engine comparison. Bevy described as "the one everyone talks about." Confirms same pain points: breaking changes, compile times, no visual editor, code-only workflow. Key insight: "ECS requires rethinking how you structure a game. If you've spent years thinking in objects and inheritance, Bevy asks you to throw that away." Positions Bevy as best for "ambitious 2D/3D projects where you want the Rust community's momentum."
- **"10 New Games Developed in Bevy Game Engine"** posted on r/gamedev (March 2026) — proof of real games shipping. Comments reveal persistent UI pain: "I attempted making a game that's heavily UI/menu based... it was a massive pain to hand code everything and it ended up taking the vast majority of my time. There are some libraries... but they come with their own cons and they're not always going to be up to date with the latest version of Bevy." UI remains the #1 developer frustration.
- **"Why Rust Is Winning for AI Tooling in 2026"** (dasroot.net, Feb 2026) — specifically mentions Bevy AI integration: "a developer used Claude Code to generate Bevy boilerplate code and game logic for a Space Invaders clone, resulting in an 800-line codebase with minimal manual input." Validates AI+Bevy workflow exists and works for simple projects.
- **Rust+WASM for AI Interfaces article** mentions Bevy as a case study for browser-based AI apps — WASM deployment path gaining attention.
- **STS2 r/gaming viral thread mentions Bevy** — in the massive "STS2 abandoned Unity" discussion, Bevy gets positive mentions alongside Godot. Bevy is entering mainstream gamedev consciousness as the "Rust option."

**MCP Landscape Update:**
- **bevy_brp_mcp still the most mature** — follows Bevy versioning (0.18.x), published on crates.io and LobeHub. Provides launch, inspect, mutate via BRP.
- **ngxtm/devkit-bevy on LobeHub** (v1.0.3, 3 installs, 5/5 rating) — NEW since last rotation. Description confirms it covers "ECS architecture, component queries, plugin-based extensibility, asset pipeline, hot-reloading, 2D/3D rendering." A user review from Mar 14 reports successfully building a complete "Kaiten Sushi v2.5.0" game using the skill, implementing "20 sushi tiers, conveyor belt system, customer orders, combo system, skills, achievements, and game states." This is the most concrete evidence of AI+Bevy success.
- **bfollington/terma-bevy** still listed (34⭐, 8 installs) — ECS patterns, system ordering, common pitfalls.
- **Still ZERO knowledge-layer Bevy MCP servers** — our niche remains completely uncontested.
- **DeepWiki (deepwiki.com/bevyengine/bevy)** indexed March 11, 2026 — AI-generated codebase wiki with render pipeline architecture, development/CI docs. Could serve as supplementary reference but NOT a replacement for curated knowledge docs (DeepWiki is auto-generated, not opinionated about patterns/anti-patterns).

**Pain Points Update:**
1. **UI still the #1 user frustration** — r/gamedev thread explicitly calls out hand-coding UI as "a massive pain" and third-party UI libs not staying up to date with Bevy versions. bevy_ui/Feathers (0.17-0.18) improving but not solving the problem.
2. **API instability confirmed ongoing** — 0.19-dev already in CI, meaning another breaking release is coming in ~Q2 2026. Plugin ecosystem lag confirmed by community ("not always going to be up to date").
3. **Visual editor still absent** — "Everything is code. Scene setup, entity placement, level design — all code."
4. **Build times remain a barrier** — "Initial builds can take several minutes."
5. **ECS learning curve** — "Some developers make the switch quickly. Others struggle for weeks."

**Strategic Implications:**
- **bevy-rules.md urgency increases** — With 0.19 coming, the window for creating a correct 0.18 rules file that helps users during the 0.18→0.19 migration is closing. bevy-rules.md would need to be version-pinned AND include migration guidance.
- **UI doc is the highest-leverage Bevy guide** — The community's #1 pain point is UI. A comprehensive "UI Development in Bevy" doc covering bevy_ui + Feathers + bevy_egui + when-to-use-what would have disproportionate impact.
- **Claude Code + Bevy is validated** — The Space Invaders clone (800 lines, minimal manual input) proves the workflow works for simple games. Our knowledge MCP would extend this to complex games where AI needs curated patterns to avoid the "hallucinate old APIs" problem.
- **AI-generated skills are proliferating** — ngxtm/devkit-bevy with its concrete game success story validates that structured Bevy knowledge delivered to AI agents works. Our MCP is the scalable, searchable, versioned version of what skills like this provide as static files.
- **44K+ stars = larger market than estimated** — Initial estimate was "10-20% of Godot's community." At 44K stars vs Godot's ~100K, it's more like 40-45% by GitHub stars (though stars don't directly map to active users). Market may be bigger than we thought.

**Doc Needs Reassessment:**
- Priority order unchanged from Rotation 1 but with sharper urgency:
  1. **bevy-rules.md** — version-pinned 0.18 patterns, 0.17→0.18 migration table, common LLM hallucinations (URGENT before 0.19 drops)
  2. **ECS Architecture Guide** — the "rethink your structure" doc that tutorials skip
  3. **UI Development Guide** — community's #1 pain point, ZERO good docs exist
  4. **Common Patterns & Anti-Patterns** — borrow conflicts, entity lifecycle, state management
- Phase 3 timeline recommendation: After Godot hits 65%+ (~10 more docs), start with bevy-rules.md as a standalone piece, then evaluate full module based on community reception
