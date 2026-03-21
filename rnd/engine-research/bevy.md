# Bevy Engine Research

Weekly research for MCP module development.
**Last updated:** 2026-03-21

---

## Engine Overview

- **Language:** Rust
- **Architecture:** Pure ECS (Entity Component System) — not bolted on, it IS the architecture
- **Current version:** 0.18.1 (released Dec 30, 2025), 0.19 in development
- **Release cadence:** ~3 months, every release has breaking changes
- **GitHub stars:** ~38K+
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

## Strategic Analysis for gamedev-mcp-server

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
