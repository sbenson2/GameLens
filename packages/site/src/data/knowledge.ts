// Knowledge index — lightweight summaries for search
// Full content loaded on demand from the knowledge articles below

export interface KnowledgeEntry {
  id: string;
  title: string;
  tags: string[];
  engines: string[];
  summary: string;
}

export const KNOWLEDGE_INDEX: KnowledgeEntry[] = [
  {
    id: "camera-systems",
    title: "Camera Systems",
    tags: ["camera", "follow", "deadzone", "shake", "zoom", "parallax", "lerp", "smoothing"],
    engines: ["all"],
    summary: "Camera follow modes (lerp, deadzone, look-ahead), screen shake (Perlin noise), zoom, multi-target, cinematic cameras, pixel-perfect rendering, split screen, camera state machines.",
  },
  {
    id: "physics-collision",
    title: "Physics & Collision",
    tags: ["physics", "collision", "rigidbody", "aabb", "raycasting", "gravity", "platformer", "hitbox"],
    engines: ["all"],
    summary: "Body types (static, kinematic, dynamic), AABB vs circle vs polygon collision, collision layers/masks, raycasting, one-way platforms, moving platforms, physics materials, character controllers.",
  },
  {
    id: "state-machines",
    title: "State Machines",
    tags: ["state", "machine", "fsm", "hsm", "pushdown", "animation", "enum", "transition"],
    engines: ["all"],
    summary: "Enum FSM, class-based states, hierarchical state machines (HSM), pushdown automata, animation state machines, state transition tables, state machine debugging.",
  },
  {
    id: "input-handling",
    title: "Input Handling",
    tags: ["input", "keyboard", "controller", "gamepad", "touch", "rebind", "buffer", "coyote"],
    engines: ["all"],
    summary: "Polling vs event-driven input, input buffering, coyote time, rebindable controls, gamepad support, touch input, local multiplayer input, combo detection, input action mapping.",
  },
  {
    id: "pathfinding-ai",
    title: "Pathfinding & Game AI",
    tags: ["pathfinding", "ai", "astar", "navmesh", "steering", "behavior", "tree", "chase", "patrol"],
    engines: ["all"],
    summary: "A* pathfinding, navigation meshes, steering behaviors (seek, flee, wander, arrive), behavior trees, finite state machines for AI, influence maps, squad tactics, perception systems.",
  },
  {
    id: "procedural-generation",
    title: "Procedural Generation",
    tags: ["procedural", "generation", "bsp", "cellular", "automata", "wfc", "noise", "perlin", "dungeon", "random"],
    engines: ["all"],
    summary: "BSP trees for dungeons, cellular automata for caves, Wave Function Collapse, Perlin/simplex noise for terrain, room-and-corridor algorithms, seeded RNG, infinite world chunks.",
  },
  {
    id: "tilemap-systems",
    title: "Tilemap Systems",
    tags: ["tilemap", "tile", "terrain", "autotile", "isometric", "hex", "chunk", "layer"],
    engines: ["all"],
    summary: "Tilemap rendering and data structures, auto-tiling rules, terrain systems, isometric and hex grids, chunk-based loading, collision from tiles, destructible terrain, A* on tilemaps.",
  },
  {
    id: "animation-systems",
    title: "Animation Systems",
    tags: ["animation", "sprite", "spritesheet", "blend", "tree", "tween", "skeletal", "frame"],
    engines: ["all"],
    summary: "Sprite animation, animation players, animation trees (blend spaces, state machines), root motion, tween systems, hit effects (white flash, hit freeze, knockback), skeletal animation, cutscene direction.",
  },
  {
    id: "combat-damage",
    title: "Combat & Damage Systems",
    tags: ["combat", "damage", "hitbox", "hurtbox", "health", "knockback", "iframe", "attack", "melee", "projectile"],
    engines: ["all"],
    summary: "10-stage damage pipeline, hitbox/hurtbox model, i-frames, knockback vectors, projectile systems, melee frame data, critical hits (pseudo-random distribution), armor models, status effects, combo systems.",
  },
  {
    id: "ui-systems",
    title: "UI Systems",
    tags: ["ui", "hud", "menu", "inventory", "dialogue", "button", "layout", "responsive", "accessibility"],
    engines: ["all"],
    summary: "UI rendering paradigms, layout systems, HUD design, inventory UI patterns, dialogue systems, data binding, input navigation (keyboard/gamepad UI), tooltips, animation, localization, accessibility.",
  },
  {
    id: "save-load",
    title: "Save/Load & Persistence",
    tags: ["save", "load", "serialize", "json", "persistence", "cloud", "migration", "checkpoint"],
    engines: ["all"],
    summary: "Serialization strategies, save file formats (JSON, binary), encryption, cloud saves, version migration, state management, checkpoint systems, autosave, save slot management.",
  },
  {
    id: "audio-sound",
    title: "Audio & Sound Design",
    tags: ["audio", "sound", "music", "sfx", "spatial", "mix", "bus", "stream"],
    engines: ["all"],
    summary: "Audio players, spatial audio, sound effects management, music transitions, audio buses/mixing, streaming vs preloaded, procedural audio, audio pools, adaptive music systems.",
  },
  {
    id: "networking-multiplayer",
    title: "Networking & Multiplayer",
    tags: ["networking", "multiplayer", "rpc", "sync", "server", "client", "lobby", "prediction", "rollback"],
    engines: ["all"],
    summary: "Client-server architecture, RPCs, state synchronization, lobby systems, client-side prediction, rollback netcode, dedicated servers, WebSocket fallback, lag compensation.",
  },
  {
    id: "shaders-vfx",
    title: "Shaders & Visual Effects",
    tags: ["shader", "vfx", "particles", "dissolve", "outline", "water", "glow", "crt", "post-process"],
    engines: ["all"],
    summary: "Shader language basics, 2D shaders (dissolve, outline, water, CRT), visual shaders, GPU/CPU particles, screen-space effects, shader parameters, performance optimization.",
  },
  {
    id: "ecs-architecture",
    title: "ECS Architecture",
    tags: ["ecs", "entity", "component", "system", "arch", "archetype", "query", "world"],
    engines: ["monogame", "bevy", "unity"],
    summary: "Entity-Component-System pattern, archetypes, component queries, system ordering, entity relationships, sparse vs dense storage, ECS vs OOP tradeoffs, Arch ECS (C#), Bevy ECS (Rust).",
  },
  {
    id: "scene-composition",
    title: "Scene Composition & Node Trees",
    tags: ["scene", "node", "tree", "composition", "prefab", "instancing", "signal"],
    engines: ["godot", "unity"],
    summary: "Scene/node architecture, composition over inheritance, component scenes, instancing, prefabs, signal-based communication, scene transitions, scene loading strategies.",
  },
  {
    id: "design-patterns",
    title: "Game Programming Patterns",
    tags: ["pattern", "singleton", "observer", "command", "strategy", "factory", "pool", "flyweight"],
    engines: ["all"],
    summary: "Observer pattern (events/signals), Command pattern (undo/input), Object pooling, State pattern, Strategy pattern, Factory pattern, Flyweight pattern, Service locator, Game loop patterns.",
  },
  {
    id: "project-management",
    title: "Game Dev Project Management",
    tags: ["scope", "management", "sprint", "burnout", "deadline", "mvp", "prototype", "launch"],
    engines: ["all"],
    summary: "Scope management, sprint planning, avoiding burnout, MVP mindset, feature creep prevention, playtesting strategies, launch preparation, post-mortem analysis.",
  },
  {
    id: "game-feel",
    title: "Game Feel & Juice",
    tags: ["feel", "juice", "polish", "screenshake", "hitstop", "squash", "stretch", "particle", "feedback"],
    engines: ["all"],
    summary: "Screen shake, hit stop/freeze frames, squash and stretch, particle bursts, camera punch, chromatic aberration on impact, knockback, sound design for feedback, controller rumble.",
  },
  {
    id: "object-pooling",
    title: "Object Pooling & Performance",
    tags: ["pool", "performance", "recycle", "memory", "gc", "optimization", "fps", "profiling"],
    engines: ["all"],
    summary: "Generic object pools, entity recycling, VFX/audio pooling, adaptive pool sizing, GC pressure reduction, profiling tools, frame budget management, draw call optimization.",
  },
];

// Full knowledge content — loaded when get_knowledge is called
const KNOWLEDGE_CONTENT: Record<string, string> = {
  "camera-systems": `# Camera Systems

## Follow Modes

### Lerp Follow (Smooth)
The simplest good camera. Each frame, move the camera toward the target:
\`camera.position = lerp(camera.position, target.position, 0.1)\`

**Tuning**: Lower values (0.02-0.05) = cinematic, floaty. Higher (0.1-0.2) = responsive, snappy.

### Deadzone
Camera only moves when the player leaves a rectangular zone in the center. Creates a stable view that only scrolls when needed. Great for platformers.

### Look-Ahead
Offset the camera in the direction the player is moving/facing. Gives the player more visibility ahead. Use velocity or facing direction, lerp the offset.

## Screen Shake
Use Perlin noise, not random offsets. Random shake feels jittery; Perlin feels like a real impact.
\`offset = Vector2(perlin(time * freq), perlin(time * freq + 100)) * amplitude * decay\`
Decay the amplitude over time (exponential decay feels best).

## Multi-Target Camera
Track multiple targets by computing a bounding box and centering the camera on it. Zoom out as targets spread apart.

## Pixel-Perfect
Snap camera position to whole pixels after all calculations. This prevents sub-pixel jitter on pixel art.`,

  "physics-collision": `# Physics & Collision

## Body Types
- **Static**: Never moves. Walls, floors, platforms.
- **Kinematic**: Moves via code, not physics. Player characters, moving platforms.
- **Dynamic/RigidBody**: Moved by physics forces. Crates, ragdolls, projectiles.

## Collision Detection
- **AABB** (Axis-Aligned Bounding Box): Fastest. Rectangles only.
- **Circle**: Fast. Good for enemies, projectiles.
- **Polygon**: Slow but precise. Use sparingly.
- **Composite**: Combine simple shapes for complex objects.

## Collision Layers
Organize what collides with what:
- Layer 1: Player
- Layer 2: Enemies
- Layer 3: Player projectiles
- Layer 4: Enemy projectiles
- Layer 5: Environment

Set masks to control: Player projectiles collide with Enemies + Environment, not Player.

## Raycasting
Cast invisible lines to detect surfaces. Use for:
- Ground detection (is player on floor?)
- Line of sight (can enemy see player?)
- Bullet hitscan (instant projectiles)
- Ledge detection (is there a drop ahead?)

## Platformer Physics
Don't use real physics for platformers. Use kinematic bodies with custom gravity:
- Separate jump gravity (lighter going up) from fall gravity (heavier going down)
- Cap fall speed (terminal velocity)
- Coyote time: Allow jumping for ~100ms after leaving a platform
- Input buffer: Queue jump input for ~100ms before landing`,

  "state-machines": `# State Machines

## Enum FSM (Simplest)
Good for: Player states, simple enemy AI, game flow.
\`\`\`
enum State { IDLE, RUN, JUMP, FALL, ATTACK }
var current_state = State.IDLE

func update(delta):
    match current_state:
        State.IDLE: handle_idle(delta)
        State.RUN: handle_run(delta)
        ...
\`\`\`

## Class-Based State Machine
Each state is its own class with enter(), exit(), update() methods. Better for complex behaviors.

## Hierarchical State Machine (HSM)
States can contain sub-states. "OnGround" contains "Idle" and "Running". "InAir" contains "Jumping" and "Falling". Reduces transition spaghetti.

## Pushdown Automaton
Stack-based. Push new states, pop to return. Great for:
- Pause menus (push Pause, pop to resume)
- Cutscenes (push Cutscene, pop to gameplay)
- Combo attacks (push each hit, pop on finish)

## When to Use What
- **Enum FSM**: < 6 states, simple transitions
- **Class-based**: 6-15 states, complex enter/exit logic
- **HSM**: Nested behaviors (ground/air states)
- **Behavior Tree**: Complex AI with priorities and fallbacks`,

  "input-handling": `# Input Handling

## Polling vs Events
- **Polling**: Check input state every frame. Best for movement (continuous).
- **Events**: React to press/release. Best for actions (jump, attack, interact).

## Input Buffering
Queue inputs for a short window (~100ms). If the player presses jump 3 frames before landing, the jump still registers. Critical for action games.

## Coyote Time
Allow jumping for ~80-120ms after walking off a platform edge. The player FEELS like they jumped from the edge, even though they were already falling. Makes platformers feel fair.

## Rebindable Controls
Store action→key mappings in a dictionary, not hardcoded keys. Save to a config file. Always support keyboard + gamepad.

## Gamepad Support
- Use input actions, not raw keys
- Add deadzone to analog sticks (0.15-0.25)
- Support both analog stick and D-pad for movement
- Add rumble/haptic feedback for impacts

## Combo Detection
For fighting games or action games:
1. Record input history with timestamps
2. Match against combo definitions (sequence + timing window)
3. Longest match wins (prevents partial triggers)`,

  "pathfinding-ai": `# Pathfinding & Game AI

## A* Pathfinding
The standard for grid-based games. Finds shortest path considering obstacles.
Key parameters:
- **Heuristic**: Manhattan (4-dir), Euclidean (any-dir), Chebyshev (8-dir)
- **Weight**: Higher = faster but less optimal. 1.0 = optimal, 1.5 = good tradeoff.

## Navigation Meshes
For non-grid games. Define walkable areas as polygons. Faster than grid A* for large open areas.

## Steering Behaviors
Combine simple forces for emergent movement:
- **Seek**: Move toward target
- **Flee**: Move away from target
- **Arrive**: Seek but slow down near target
- **Wander**: Random direction changes
- **Obstacle Avoidance**: Raycast ahead, steer away

## Behavior Trees
Tree of nodes: Selector (try children until one succeeds), Sequence (run children in order, fail if any fails), Action (do something), Condition (check something).

## Enemy AI Patterns
- **Patrol**: Follow waypoints, reverse at ends
- **Chase**: Switch from patrol to chase when player enters detection range
- **Attack**: Enter attack state at attack range, cooldown between attacks
- **Retreat**: Flee when health is low
- **Alert others**: Signal nearby enemies when detecting player`,

  "procedural-generation": `# Procedural Generation

## BSP (Binary Space Partitioning) Dungeons
1. Start with one big rectangle
2. Split it in half (horizontal or vertical, random)
3. Recurse: split each half again
4. Stop at minimum room size
5. Place rooms inside leaf nodes
6. Connect rooms with corridors (connect siblings)

Good for: Traditional dungeon layouts with distinct rooms.

## Cellular Automata Caves
1. Fill grid randomly (45-55% walls)
2. For each cell, count wall neighbors (including self)
3. If neighbors >= 5, become wall. Otherwise, become floor.
4. Repeat 4-6 times.

Good for: Natural-looking caves, organic terrain.

## Wave Function Collapse (WFC)
Constraint-based generation. Define tiles and adjacency rules. The algorithm collapses possibilities one tile at a time, propagating constraints.

Good for: Cohesive tilesets, towns, complex patterns.

## Noise-Based Terrain
Use Perlin or simplex noise for height maps. Layer multiple octaves for detail. Threshold values to create biomes.

## Seeded RNG
Always use seeded random number generators. Same seed = same world. Essential for:
- Roguelike daily challenges
- Bug reproduction
- Multiplayer sync`,

  "combat-damage": `# Combat & Damage Systems

## Damage Pipeline
1. Attacker initiates attack → hitbox becomes active
2. Hitbox overlaps defender's hurtbox → hit detected
3. Raw damage calculated (base + scaling + modifiers)
4. Defense applied (armor, resistance, blocking)
5. Critical hit check (use pseudo-random distribution, not pure RNG)
6. Final damage applied to health
7. Hit effects triggered (knockback, hitstun, VFX, SFX)
8. I-frames activated on defender
9. Status effects applied (poison, burn, freeze)
10. Death check

## Hitbox/Hurtbox Model
- **Hitbox**: Damage-dealing zone (on attacks)
- **Hurtbox**: Damage-receiving zone (on characters)
- Separate from physics collision — use different layers
- Activate hitbox only during attack frames
- Multiple hitboxes per attack for different zones/timings

## Knockback
Apply a velocity vector on hit. Direction = attacker → defender. Magnitude based on attack power. Decay over time or frames.

## I-Frames (Invincibility Frames)
After taking damage, make the defender invincible for ~0.5-1 second. Flash the sprite to indicate. Prevents multi-hit stunlocks.

## Combo Systems
Track: current combo count, damage scaling (reduce per hit to prevent infinites), hitstun scaling (reduce to allow escape). Reset on drop (defender recovers to neutral).`,

  "save-load": `# Save/Load & Persistence

## What to Save
- Player position, stats, inventory
- World state (doors opened, enemies defeated, items collected)
- Quest/objective progress
- Settings (separate file)
- Timestamp, play time, version number

## Serialization Strategies
- **JSON**: Human-readable, easy to debug. Slightly larger files.
- **Binary**: Smaller, faster, harder to debug. Good for large worlds.
- **Custom format**: Only if you have a specific need.

## Save File Structure
\`\`\`json
{
  "version": "1.2.0",
  "timestamp": "2024-01-15T10:30:00Z",
  "playTime": 3600,
  "player": { "position": [100, 200], "health": 80, "inventory": [...] },
  "world": { "flags": ["door_1_open", "boss_1_defeated"], "seed": 42 },
  "quests": { "main_quest": "step_3", "side_quest_1": "complete" }
}
\`\`\`

## Version Migration
Always include a version number. When loading, check version and migrate:
- v1.0 → v1.1: Add new field with default value
- v1.1 → v1.2: Rename field, convert format

## Cloud Saves
Use platform APIs (Steam Cloud, iCloud, Google Play). Save locally first, sync in background. Handle conflicts (last-write-wins or prompt user).`,

  "ui-systems": `# UI Systems

## Layout Approaches
- **Anchors**: Pin UI elements to screen edges/corners. Scales with resolution.
- **Containers**: Auto-layout children (VBox, HBox, Grid). Responsive by default.
- **Manual positioning**: Pixel-perfect but doesn't scale. Only for fixed-resolution games.

## HUD Design
Show only essential info. Health, ammo/mana, minimap, objective. Use diegetic UI when possible (health on character, ammo on weapon).

## Inventory UI Patterns
- **Grid**: Fixed slots in a grid (Minecraft, Resident Evil)
- **List**: Scrollable list (most RPGs)
- **Slot-based**: Specific slots for equipment (head, chest, weapon)
- Drag-and-drop requires: ghost item, drop validation, swap logic

## Dialogue Systems
- **Linear**: Just advance through text
- **Branching**: Choices that affect outcomes (flag-based)
- **Typewriter effect**: Show text character by character (15-30 chars/sec)
- **Rich text**: Support bold, color, icons inline

## Input Navigation
Support keyboard/gamepad navigation for ALL menus. Tab order, focus states, wrap-around. Never require a mouse.

## Accessibility
- Scalable text (minimum 16px equivalent)
- High contrast mode
- Colorblind-friendly (don't rely on color alone)
- Screen reader support for menu items
- Rebindable controls (including UI navigation)`,

  "audio-sound": `# Audio & Sound Design

## Audio Architecture
- **SFX**: Short, one-shot sounds. Pool and limit simultaneous instances.
- **Music**: Streamed (not preloaded). Crossfade between tracks.
- **Ambient**: Looping background layers. Blend based on location.

## Spatial Audio
Attenuate volume and pan based on distance/direction from listener. Set max distance to avoid distant sounds eating channels.

## Audio Buses
Group sounds into buses (Master → Music, SFX, UI, Ambient). Apply effects per bus (reverb on SFX, compression on music). Let players adjust volume per bus.

## Music Transitions
- **Crossfade**: Fade out current, fade in next. Simple and clean.
- **Stinger**: Play a short transition sound between tracks.
- **Layered**: Keep base track, add/remove layers based on intensity.
- **Beat-synced**: Transition on the next bar/beat for seamless switches.

## Performance
- Pool audio players (create 8-16, reuse them)
- Limit simultaneous sounds (skip lowest-priority when full)
- Use compressed formats for music (OGG), uncompressed for short SFX (WAV)`,

  "networking-multiplayer": `# Networking & Multiplayer

## Architecture
- **Client-Server**: Server is authoritative. Clients send input, server sends state. Most common, most secure.
- **Peer-to-Peer**: Direct connections. Simpler but harder to secure. Good for local/small games.

## Synchronization
- **State sync**: Server sends full game state periodically. Simple but bandwidth-heavy.
- **Input sync**: Clients send inputs, everyone simulates. Deterministic required.
- **Delta sync**: Only send what changed. Most efficient.

## Client-Side Prediction
Don't wait for server response. Apply input locally immediately, reconcile when server confirms. Makes the game feel responsive despite latency.

## Rollback Netcode
For fighting games / action games. Run the game forward with predicted input, roll back and resimulate when actual input arrives. Complex but essential for competitive games.

## Lobby System
1. Host creates lobby, gets a code/ID
2. Players join with code
3. Host starts game, server notifies all clients
4. Handle disconnects gracefully (timeout → AI takeover or pause)`,

  "shaders-vfx": `# Shaders & Visual Effects

## Common 2D Shaders
- **Dissolve**: Noise texture + threshold. Increase threshold to dissolve.
- **Outline**: Sample neighboring pixels, draw outline color if any neighbor is transparent.
- **Flash/Hit**: Lerp all pixels toward white for 1-2 frames on hit.
- **Water**: Sine wave distortion of UV coordinates + scrolling noise.
- **CRT**: Scanlines + vignette + chromatic aberration + slight curve.

## Particle Systems
- **CPU Particles**: Flexible, can interact with game logic. 100-1000 particles.
- **GPU Particles**: Fast, fire-and-forget. 1000-100000 particles.
- Use for: impacts, explosions, trails, ambient (dust, rain, fireflies).

## Screen-Space Effects
Applied to the whole screen after rendering:
- **Bloom**: Bright areas glow. Extract bright pixels, blur, add back.
- **Vignette**: Darken edges. Simple radial gradient.
- **Chromatic aberration**: Offset RGB channels. Use on impact for punch.
- **Screen shake**: Offset the entire viewport. Use Perlin noise.`,

  "ecs-architecture": `# ECS (Entity-Component-System) Architecture

## Core Concept
- **Entity**: Just an ID (integer). No data, no logic.
- **Component**: Pure data. Position, Velocity, Health, Sprite.
- **System**: Pure logic. Operates on entities with specific components.

## Why ECS?
- Cache-friendly (components stored contiguously in memory)
- Composition over inheritance (mix any components)
- Easy to add/remove behaviors at runtime
- Great for games with many similar entities (bullets, enemies, particles)

## When NOT to Use ECS
- Simple games with few entity types (use OOP)
- UI-heavy games (scene trees are better)
- Prototyping (OOP is faster to iterate)

## Arch ECS (C# / MonoGame)
Fast archetype-based ECS. Entities grouped by component signature.
\`\`\`
var world = World.Create();
var entity = world.Create(new Position(0, 0), new Velocity(1, 0));
world.Query(new QueryDescription().WithAll<Position, Velocity>(), (ref Position pos, ref Velocity vel) => {
    pos.X += vel.X * delta;
});
\`\`\`

## Bevy ECS (Rust)
\`\`\`rust
fn movement_system(mut query: Query<(&mut Transform, &Velocity)>) {
    for (mut transform, velocity) in &mut query {
        transform.translation += velocity.0 * time.delta_secs();
    }
}
\`\`\``,

  "scene-composition": `# Scene Composition & Node Trees

## Godot Scene System
Everything is a node in a tree. Scenes are reusable subtrees.
- **Composition over inheritance**: Build complex objects from simple scene components
- **Component scenes**: Hitbox, Hurtbox, HealthComponent as separate scenes
- **Instancing**: Create copies of scenes at runtime

## Signal Architecture
Nodes communicate via signals (observer pattern):
- Child emits signal → parent connects and handles
- Signal bus (autoload) for global events
- Prefer signals over direct references (loose coupling)

## Scene Organization
\`\`\`
Main
├── World
│   ├── TileMap
│   ├── Player
│   │   ├── Sprite
│   │   ├── CollisionShape
│   │   ├── Hurtbox (Area2D)
│   │   └── AnimationPlayer
│   ├── Enemies
│   └── Items
├── UI
│   ├── HUD
│   ├── PauseMenu
│   └── DialogueBox
└── Camera2D
\`\`\`

## Scene Transitions
- Fade to black → change scene → fade in
- Use an autoload TransitionManager
- Preload next scene during fade for seamless transitions`,

  "design-patterns": `# Game Programming Patterns

## Observer / Event Bus
Decouple systems. Publisher emits events, subscribers react.
Use for: damage dealt, item collected, level complete, achievement unlocked.

## Command Pattern
Encapsulate actions as objects. Enables:
- **Undo/Redo**: Store command history, reverse to undo
- **Input replay**: Record and replay command sequences
- **AI input**: AI produces same command objects as player input

## Object Pooling
Pre-create objects, reuse instead of create/destroy. Essential for:
- Bullets / projectiles
- Particles
- Enemy spawns
- Audio sources
Prevents GC spikes and allocation overhead.

## State Pattern
Each state is an object with enter/update/exit. Current state handles all behavior. Clean transitions between states. (See State Machines article for details.)

## Flyweight
Share common data between similar objects. All trees share one TreeType (mesh, texture). Each tree instance only stores position and scale.

## Service Locator
Global access point for services (audio, input, save). Better than singletons because you can swap implementations (mock audio for testing).`,

  "project-management": `# Game Dev Project Management

## Scope Is Everything
The #1 killer of game projects is scope creep. Every feature you add delays launch.
- Start with a 1-page design doc, not a 20-page one
- List features as Must Have / Nice to Have / Cut
- If you can't describe the core loop in 2 sentences, scope down

## MVP Approach
Build the minimum playable version first:
1. Core movement/mechanic (1-2 days)
2. One enemy/challenge (1 day)
3. Win/lose condition (half day)
4. Basic UI (half day)
That's your prototype. Playtest it. Is it fun? If not, pivot BEFORE building more.

## Sprint Planning
Weekly sprints work well for game dev:
- Monday: Plan 3-5 tasks for the week
- Daily: Work on one task at a time
- Friday: Playtest and review

## Avoiding Burnout
- Set work hours (don't crunch on a hobby project)
- Take breaks between milestones
- Share progress (devlog, social media) for motivation
- It's OK to take a week off

## Launch Prep
Start marketing 3 months before launch:
- Steam page / itch.io page early (wishlists compound)
- Share GIFs and devlogs regularly
- Build a small community (Discord, Reddit)
- Have 3-5 beta testers for final polish`,

  "game-feel": `# Game Feel & Juice

## The Big 6 Juice Techniques
1. **Screen shake**: On impacts, explosions, landing. Use Perlin noise. Decay quickly.
2. **Hit stop / Freeze frame**: Pause for 2-5 frames on impact. Sells weight.
3. **Squash & stretch**: Scale sprites on jump (squash on land, stretch on rise).
4. **Particles**: Burst on hit, trail on movement, dust on land.
5. **Camera punch**: Quick zoom or offset toward impact point.
6. **Sound design**: Layered SFX (impact + crunch + bass thud).

## Implementation Priority
Add juice LAST, after core gameplay works. It's polish, not foundation.
1. Get the mechanic working (no juice)
2. Playtest — is the MECHANIC fun?
3. Add screen shake + hit stop
4. Add particles + camera effects
5. Add sound
6. Fine-tune all values

## Tuning Values
- Screen shake: 4-8px amplitude, 0.1-0.3s duration, exponential decay
- Hit stop: 3-6 frames (50-100ms at 60fps)
- Squash: scale to (1.2, 0.8) on land, return over 0.1s
- Stretch: scale to (0.8, 1.2) on jump start

## The Feel Test
Mute the game. Remove all VFX. Is the core mechanic still satisfying to USE (not watch)? If yes, your controls are good. If no, fix the controls before adding juice.`,

  "object-pooling": `# Object Pooling & Performance

## When to Pool
Pool any object that's frequently created and destroyed:
- Bullets / projectiles (100s per second in bullet hells)
- Particles (explosions, trails)
- Enemies (wave spawners)
- Audio sources (SFX instances)
- UI elements (damage numbers)

## Basic Pool Pattern
1. Pre-create N objects, deactivate them
2. When you need one: find inactive, activate, reset state, return it
3. When done: deactivate, return to pool
4. If pool is empty: either grow or skip (depends on game)

## Performance Tips
- Profile first, optimize second (don't guess what's slow)
- Target 16.6ms per frame (60fps) — budget your systems
- Reduce draw calls: texture atlases, batching
- Avoid allocations in update loops (pre-allocate buffers)
- Use spatial partitioning for collision (grid, quadtree) when entity count > 100`,
};

export function getKnowledgeContent(id: string): string | null {
  return KNOWLEDGE_CONTENT[id] ?? null;
}
