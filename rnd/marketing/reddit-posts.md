# Reddit Posts — GameDev MCP Server Launch

---

## r/gamedev — Show and Tell

**Title:** I built an MCP server that gives AI coding assistants permanent game dev knowledge (142 docs, free core tier)

**Body:**

Hey r/gamedev,

I've been building games with AI assistants (Claude Code, Cursor) and kept running into the same problem: the AI starts great, then three hours in it forgets my architecture, suggests deprecated patterns, or contradicts decisions it made twenty minutes ago.

So I built [GameDev MCP Server](https://github.com/sbenson2/gamedev-mcp-server) — a knowledge layer that gives your AI persistent, searchable game dev expertise through MCP (Model Context Protocol).

**What it is:**
- 142 hand-written docs covering game design, architecture, programming patterns, and engine-specific guides
- 9 tools — search, fetch docs (with section extraction so you get 2KB instead of 52KB), genre lookup, engine comparison
- Runs locally via stdio — no network, no security concerns
- Free core tier (51 docs) works with no key

**What's covered:**
- MonoGame + Arch ECS: 79 guides, 100% genre coverage across 11 genres
- Godot 4.4+: 12 docs at 60% — architecture, state machines, physics, camera, tilemaps, animation, UI, correct Godot 4 patterns
- Engine-agnostic: combat theory, networking, camera systems, pathfinding, project management, game feel

**How it works:**
Your AI can search for "camera shake" and get the exact implementation pattern. It can ask "I'm building a roguelike" and get a prioritized checklist of 14 systems to implement. It can compare how Godot and MonoGame handle the same concept.

```bash
npx -y gamedev-mcp-server
```

One line. Works with Claude Code, Cursor, Windsurf, Cline — anything that supports MCP.

The goal isn't to replace learning how to make games. It's to stop your AI from giving you bad architectural advice that you discover is wrong 40 hours into a project.

GitHub: https://github.com/sbenson2/gamedev-mcp-server

Happy to answer questions about what's in the docs, how it works, or where it's headed.

---

## r/aigamedev — Technical / Community

**Title:** GameDev MCP Server — 142 curated docs that give AI coding tools structured game dev knowledge (cross-engine, section extraction, free core tier)

**Body:**

Been working on this for a while and figured this community would appreciate the technical details.

**The problem it solves:** AI coding assistants have broad training data but no structured understanding of gamedev. They don't know when to use a behavior tree vs a state machine. They suggest deprecated Godot 3 APIs. They don't understand the 10-stage damage pipeline that every action game needs. A knowledge MCP fills that gap — your AI can search and fetch curated game dev patterns instead of relying on training data alone.

**GameDev MCP Server** — [github.com/sbenson2/gamedev-mcp-server](https://github.com/sbenson2/gamedev-mcp-server)

**Technical highlights:**
- **142 docs, ~4.2MB** of curated content across 3 modules (core, MonoGame/Arch ECS, Godot 4.4+)
- **9 MCP tools** — lean schema, minimal context overhead. Section extraction on `get_doc` lets you pull 2KB from a 52KB guide instead of dumping the whole thing
- **TF-IDF search** with engine filtering, cross-engine grouping, title boosting, doc length normalization
- **Genre lookup** returns prioritized system checklists — "roguelike" gives you the 14 systems in implementation order
- **`compare_engines`** — side-by-side comparison of how Godot vs MonoGame handle the same topic, with auto-linked theory docs
- **Module auto-discovery** — drop a new engine dir in `docs/` and it's indexed automatically
- **stdio transport only** — no HTTP, no exposed ports, no auth complexity. Runs on your machine.
- **Free core tier** (51 engine-agnostic docs) + Pro ($9/mo) for engine-specific modules

**Content approach:**
Every doc is written for AI consumption — typed code examples, anti-pattern sections, decision trees, tuning tables, and cross-references. These aren't scraped docs or generated content. The MonoGame module has 100% genre coverage across 11 genres. The Godot module has 12 docs at 60% with correct Godot 4.4+ patterns (no `KinematicBody2D`, no `yield`, typed GDScript).

**What's planned:**
- Unity 6 module (zero knowledge-layer MCP competitors exist for Unity)
- Bevy module (highest AI hallucination rate of any engine — Rust + 3-month breaking changes)
- Semantic search when corpus exceeds 200 docs
- Workers API for remote Pro content delivery

```bash
npx -y gamedev-mcp-server
```

Would love feedback from anyone who tries it — what topics are missing, what's useful, what isn't. The search quality has gone through 4 rounds of testing but real-world queries always reveal gaps.

---

## r/monogame — MonoGame-Specific

**Title:** I built an MCP server with 79 MonoGame + Arch ECS implementation guides — gives AI coding assistants deep MonoGame knowledge

**Body:**

Hey MonoGame community,

I've been building an MCP server (Model Context Protocol — lets AI tools like Claude Code and Cursor access external knowledge) specifically focused on game development. The MonoGame module is the most complete part.

**79 implementation guides covering:**
- Full architecture: ECS with Arch, state machines, component patterns, service locator, event systems
- Every major system: physics (custom AABB + Aether.Physics2D), AI (behavior trees, GOAP, steering, squad tactics), rendering (sprite batching, parallax, lighting, particles), UI (Gum framework), networking, save/load
- Genre-specific patterns for all 11 genres: platformer, RPG, tower defense, survival, roguelike, bullet hell, fighting, puzzle, strategy/RTS, visual novel, side-scrolling
- Production guides: performance budgets, profiling, art pipeline, object pooling, combat systems, building/placement, economy systems
- Library reference: Aether.Physics2D, MonoGame.Aseprite, Gum UI, Arch ECS — with correct current API versions
- 100% genre coverage — every system a game genre needs has an implementation guide

**How it works:**
```bash
npx -y gamedev-mcp-server
```

Your AI assistant can then search for any MonoGame topic, fetch specific sections from guides (e.g., just the "Knockback" section from the combat guide instead of the full 52KB), or ask "what do I need to build a tower defense game" and get a prioritized system list.

The docs are written for AI code generation — typed C# examples, anti-pattern warnings, Arch ECS conventions, and cross-references between related guides. The goal: your AI writes correct MonoGame code on the first try instead of suggesting XNA-era patterns.

There's also 51 free engine-agnostic docs (game design, architecture, algorithms, project management) that work without a key. The MonoGame-specific guides are Pro ($9/mo).

GitHub: https://github.com/sbenson2/gamedev-mcp-server

If you're using any AI coding tool with MonoGame, I'd appreciate feedback on what topics are missing or where the docs could be better. Open to PRs too.

---

## r/godot — Godot-Specific (careful framing)

**Title:** Built an MCP knowledge server with 12 Godot 4.4+ docs — correct patterns, no Godot 3 hallucinations

**Body:**

One of the biggest frustrations with using AI coding assistants for Godot: they constantly suggest Godot 3 patterns. `KinematicBody2D` instead of `CharacterBody2D`. `yield` instead of `await`. `export` instead of `@export`. `TileMap` with layer params instead of `TileMapLayer`.

I've been building a knowledge server that gives AI tools correct, curated Godot 4.4+ patterns through MCP (Model Context Protocol). It's not an editor plugin or code generator — it's a searchable knowledge base your AI assistant can query when it needs to know how something works in modern Godot.

**12 Godot docs so far (60% of planned module):**
- **Architecture:** Overview of Godot's node tree philosophy, GDScript vs C# decision guide (with Unity→Godot migration table)
- **Patterns:** Scene composition, state machines (enum → node-based → HSM → pushdown automaton), signal architecture
- **Systems:** Input handling (4 movement patterns, coyote time, input buffering, gamepad, accessibility), physics & collision (body type decision tree, collision layers, raycasting), camera systems (smoothing, deadzone, screen shake, multi-target, split screen, pixel-perfect), tilemap & terrain (80KB — TileMapLayer migration, procedural gen, chunk-based worlds, A* pathfinding), animation (AnimationTree, blend spaces, tween management, hit effects), UI & control systems (HUD, inventory, dialogue, shop, settings, screen management)
- **AI rules:** `godot-rules.md` constrains AI output to typed GDScript, correct 4.4+ APIs, proper naming conventions

Every doc uses typed GDScript, follows Godot conventions, and includes anti-pattern sections so your AI doesn't generate code that "works" but fights the engine.

```bash
npx -y gamedev-mcp-server
```

Works with Claude Code, Cursor, Windsurf, Cline. Core docs (51 engine-agnostic game dev guides) are free. The Godot-specific module is Pro ($9/mo). Module is growing weekly — aiming for 20 docs covering all major Godot systems.

This is knowledge infrastructure, not a replacement for learning Godot. The goal: when your AI needs to know how Godot handles camera smoothing or tilemap collision layers, it gets the correct answer instead of hallucinating something from 2019.

GitHub: https://github.com/sbenson2/gamedev-mcp-server

Feedback welcome — what Godot topics would be most valuable to add next? Currently planning: audio systems, save/load, shaders, and dialogue.
