# E1 — Construct 3 Architecture Overview

> **Category:** explanation · **Engine:** Construct · **Related:** [G1 Event Sheet Patterns](../guides/G1_event_sheet_patterns.md) · [G2 Behaviors](../guides/G2_behaviors.md)

---

## Core Philosophy: Event Sheets, Layouts, and Behaviors

Construct 3 is a browser-based 2D game engine designed around visual programming. Its architecture rests on three pillars:

1. **Event Sheets** — the logic layer. Instead of writing code in text files, you build logic as rows of conditions and actions in a visual grid. Each row reads like an English sentence: "If Player is overlapping Enemy → Subtract 1 from Player.Health". Event sheets can include other event sheets, enabling modular organization.
2. **Layouts** — the visual canvas. A Layout is a level, menu, or screen. Each Layout contains **Layers** (ordered from back to front) and object instances placed on those layers. Layouts are analogous to GameMaker's Rooms or Godot's Scenes.
3. **Behaviors** — pre-built capabilities you attach to objects. The Platform behavior gives an object gravity + jumping. The Bullet behavior makes it move forward automatically. Behaviors eliminate the need to code common mechanics from scratch.

This architecture makes Construct uniquely accessible: you can build a complete platformer without writing a single line of code. For developers who want more, JavaScript and TypeScript are fully supported alongside event sheets.

---

## Object Types and Instances

### Object Types

An Object Type is a template — it defines what an object looks like (animations), what it can do (behaviors), and what data it carries (instance variables).

| Object Type | Purpose |
|-------------|---------|
| **Sprite** | Animated image — the workhorse for players, enemies, items |
| **TiledBackground** | Repeating texture for floors, walls, backgrounds |
| **Tilemap** | Grid-based level painting from a tileset image |
| **Text** | Dynamic text rendering (supports BBCode formatting) |
| **SpriteFont** | Bitmap font rendering for pixel-art games |
| **Particles** | Built-in particle effect emitter |
| **9-Patch** | Scalable UI panels that preserve corner detail |
| **Audio** | Sound playback (positional audio supported) |

### Instances and SOL (Selected Object List)

When you place a Sprite on a Layout, that's an **instance**. A Layout can have hundreds of instances of the same Object Type.

Construct uses the **SOL (Selected Object List)** to determine which instances a condition or action applies to. This is the most important concept to understand:

```
Event: Enemy.Health ≤ 0 → Enemy.Destroy
```

This does NOT destroy all enemies. It only destroys the enemies whose Health is ≤ 0, because the condition *picks* (filters) the SOL down to matching instances. Actions then apply only to picked instances.

**SOL resets at the start of each top-level event.** Sub-events inherit their parent's SOL.

---

## Event Sheet Structure

### Event Types

| Type | Purpose |
|------|---------|
| **Event** | Standard condition → action row |
| **Sub-event** | Nested under a parent; inherits parent's SOL |
| **Else** | Fires when the preceding event's conditions were false |
| **Group** | Named folder for organizing events; can be activated/deactivated at runtime |
| **Include** | Imports another event sheet (like a code `import`) |
| **Function** | Reusable named block that can be called from other events |
| **Comment** | Documentation row (no logic) |

### Execution Order

Events run top-to-bottom within a sheet. Sub-events run immediately after their parent (depth-first). The full frame order:

```
On start of layout (once)
│
Every tick:
├── Event sheet execution (top → bottom, depth-first into sub-events)
├── Physics simulation
├── Behavior updates (Platform, Bullet, etc.)
└── Rendering (layer order, front to back)
```

### Functions

Construct Functions work like traditional functions — they accept parameters and can return a value:

```
Function "DamageEnemy" (EnemyUID, Amount)
├── System: Pick Enemy by UID = EnemyUID
├── Enemy: Subtract Amount from Health
└── Enemy.Health ≤ 0 → Enemy.Spawn ExplosionEffect → Enemy.Destroy
```

Call with: `Functions.DamageEnemy(Enemy.UID, 25)`

---

## Families

Families group Object Types that share common logic. A Family can have:

- **Shared instance variables** (e.g., `Health`, `Speed`)
- **Shared behaviors** (e.g., Platform, Solid)
- **Shared events** (one event handles all members)

```
Family "Enemies" contains: Goblin, Skeleton, Dragon

Event: Player overlaps Enemies → Subtract Enemies.Damage from Player.Health
Event: Enemies.Health ≤ 0 → Enemies.Spawn Loot → Enemies.Destroy
```

Without families, you would need separate events for each enemy type. Families are Construct's primary polymorphism mechanism.

---

## Layers and Effects

### Layer Stack

Each Layout has an ordered stack of Layers:

```
Layer: "HUD"        (Parallax 0,0 — fixed to screen)
Layer: "Foreground"  (Parallax 100,100 — moves with camera)
Layer: "Objects"     (Parallax 100,100 — main game layer)
Layer: "Background"  (Parallax 50,50 — slow parallax)
Layer: "Sky"         (Parallax 0,0 — static)
```

### WebGL Effects

Effects are GPU shaders applied per-object or per-layer:

- **Per-object:** Glow, outline, color replace, distortion
- **Per-layer:** Screen-wide color grading, blur, vignette
- Effects stack — you can apply multiple effects and they composite in order.

---

## JavaScript / TypeScript Integration

Construct supports full scripting alongside event sheets:

### Runtime API

```javascript
// Access the runtime in a script
runOnStartup(async runtime => {
    runtime.addEventListener("beforeprojectstart", () => {
        // Initialization code
    });
    
    runtime.addEventListener("tick", () => {
        const player = runtime.objects.Player.getFirstInstance();
        if (player) {
            // Custom per-frame logic
        }
    });
});
```

### Bridging Events and Scripts

- Event sheets can call JavaScript functions.
- JavaScript can trigger Construct custom events.
- Best practice: use event sheets for game flow and visual scripting; use JS for complex algorithms, data parsing, or procedural generation.

---

## Export Pipeline

Construct exports primarily to HTML5, with wrappers for other platforms:

| Target | Method | Notes |
|--------|--------|-------|
| **Web (HTML5)** | Native export | Best performance, zero wrapper overhead |
| **Windows/Mac/Linux** | NW.js or Electron | Desktop wrapper around web build |
| **iOS/Android** | Cordova or WebView+ | Mobile wrapper; test touch input early |
| **Xbox (UWP)** | WebView wrapper | Via Microsoft partnership |

**Key decision:** Always optimize for HTML5 first — all other exports are wrappers around the web build.

---

## When to Choose Construct 3

| Strength | Detail |
|----------|--------|
| **No install required** | Browser-based editor runs on any OS, even Chromebooks |
| **Fastest prototyping** | Event sheets let you build playable demos in hours |
| **Team-friendly** | Cloud saves, real-time collaboration (like Google Docs) |
| **Education** | Visual scripting lowers the barrier for students and beginners |

| Weakness | Detail |
|----------|--------|
| **Subscription model** | Requires active license (free tier is limited) |
| **Performance ceiling** | WebGL + JS can't match native engines for intensive games |
| **3D** | No 3D support — purely 2D engine |
| **Large games** | Event sheets become unwieldy at scale without disciplined organization |
