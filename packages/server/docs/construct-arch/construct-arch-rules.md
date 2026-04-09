# Construct 3 — AI Rules

Engine-specific rules for projects using Construct 3. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Engine:** Construct 3 (Scirra, browser-based editor)
- **Primary Logic:** Event Sheets (visual condition → action programming)
- **Scripting:** JavaScript or TypeScript (optional, in-event or separate files)
- **Renderer:** WebGL 2 with Canvas fallback
- **Physics:** Built-in (Box2D-based) or Chipmunk via addon
- **Platforms:** HTML5 (native), Windows/macOS/Linux (via NW.js or Electron wrapper), iOS/Android (via Cordova or WebView)
- **Key Features:**
  - Families (object grouping for shared logic)
  - Behaviors (pre-built: Platform, Bullet, 8-Direction, Pathfinding, etc.)
  - Effects (WebGL shaders applied per-object or per-layer)
  - Timeline animations (tweened keyframe sequences)
  - Multiplayer (signaling server + WebRTC peer-to-peer)

### Project Structure Conventions

```
project.c3proj              # Project manifest (JSON)
eventSheets/
├── MainEvents.json         # Primary game logic
├── MenuEvents.json         # Menu UI logic
├── EnemyAI.json            # Included event sheet
objectTypes/
├── Player.json             # Object type definition
├── Enemy.json
layouts/
├── Game.json               # Layout (level) with layers
├── Menu.json
files/
├── scripts/                # JS/TS files (optional)
│   └── utilities.js
```

---

## Event Sheet Rules

### Conditions Before Actions — Always

Event sheets read top-to-bottom, left-to-right. Each event row is:

```
[Condition(s)] → [Action(s)]
```

- **Conditions** test truth (e.g., "Player is overlapping Enemy").
- **Actions** execute when ALL conditions in the row are true.
- **Sub-events** nest under a parent event for sequential logic.

### Use Groups to Organize

Wrap related events in named **Groups** for readability and to enable/disable sections at runtime:

```
+ Group: "Enemy AI"
  ├── Event: Enemy.LineOfSight(Player) → Enemy.MoveToward(Player)
  ├── Event: Enemy.Health ≤ 0 → Enemy.Destroy, System.Add 100 to Score
  └── Sub-event: ...
```

### Families for Shared Logic

```
Family "Collectibles" contains: Coin, Gem, PowerUp
Event: Player overlaps Collectibles → Collectibles.Destroy, Add Collectibles.PointValue to Score
```

This single event handles ALL collectible types — never duplicate events per object type.

### Use "For Each" for Per-Instance Logic

```
+ For Each Enemy
  ├── Enemy.DistanceTo(Player) < 200 → Enemy.Set animation "alert"
  └── Else → Enemy.Set animation "idle"
```

Without "For Each", conditions pick instances based on SOL (Selected Object List) rules, which can cause unexpected behavior.

### Prefer Behaviors Over Manual Code

- **Platform** behavior for side-scrolling games (handles gravity, jumping, slopes).
- **8-Direction** for top-down movement.
- **Bullet** for projectiles (auto-move at angle + speed).
- **Pathfinding** for A* grid-based navigation.
- Only build custom movement when behaviors don't fit your game's physics model.

---

## JavaScript Scripting Rules

### In-Event Scripts

```javascript
// Script action inside an event — access runtime API
const player = runtime.objects.Player.getFirstInstance();
player.x += 5;
player.behaviors.Platform.maxSpeed = 300;
```

### Separate Script Files

```javascript
// files/scripts/utilities.js
export function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}
```

```javascript
// In an event script action
import { clamp } from "./utilities.js";
const speed = clamp(rawSpeed, 0, 500);
```

### Do Not Mix Paradigms Recklessly

- Event sheets handle game logic flow — use them for conditions, spawning, and high-level state.
- JavaScript handles complex computation — use it for procedural generation, data parsing, custom math.
- Do NOT replicate event sheet logic in JS or vice versa. Pick one per system.

---

## Common Pitfalls

1. **Not understanding SOL (Selected Object List)** — Construct picks which instances match a condition. Conditions filter the SOL. If you don't use "For Each", an action may affect all picked instances or only one.
2. **Too many event sheets without includes** — use "Include" to share event sheets across layouts. Duplicating sheets causes sync nightmares.
3. **Overusing global variables** — prefer instance variables or family variables. Globals are fine for score/settings, not for per-enemy state.
4. **Ignoring layer structure** — effects and parallax depend on correct layer ordering. Plan layers early.
5. **Testing only in preview** — HTML5 export behaves differently from preview. Test exported builds on target platforms.
