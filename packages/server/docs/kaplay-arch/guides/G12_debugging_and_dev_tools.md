# G12 — Kaplay Debugging & Development Tools

> **Category:** guide · **Engine:** Kaplay · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G4 Physics & Collisions](G4_physics_and_collisions.md) · [G1 Components & Game Objects](G1_components_and_game_objects.md)

---

## Overview

Debugging a game is fundamentally different from debugging a web app — state changes 60 times per second, bugs are often visual or timing-related, and "step through in the debugger" freezes the entire render loop. Kaplay ships with a built-in debug mode that lets you inspect game objects, visualise collision areas, control time, and log messages directly on screen — all without leaving the game window.

This guide covers enabling debug mode, the inspect overlay, on-screen logging, time manipulation, performance profiling, and patterns for building your own debug tools on top of Kaplay's debug API.

---

## Enabling Debug Mode

### Keyboard Toggle

Press **F1** to toggle debug inspect mode at any time during gameplay. This is the quickest way in.

> **Chrome users:** F1 may open Chrome Help instead of toggling inspect mode. Change the debug key in your Kaplay config to avoid the conflict:
>
> ```typescript
> kaplay({
>   debugKey: 'F3',     // Use F3 instead of F1
>   debug: true          // Start with debug features active (logging, etc.)
> });
> ```

### Programmatic Toggle

```typescript
// Enable inspect mode from code
debug.inspect = true;

// Disable it
debug.inspect = false;

// Check current state
if (debug.inspect) {
  // Inspect mode is on
}
```

---

## The Inspect Overlay

When inspect mode is active, Kaplay draws a visual overlay on top of your game:

1. **Bounding boxes** — every game object with an `area()` component gets a coloured outline showing its collision shape.
2. **Hover inspection** — hover over any game object to see its properties: position, tags, components, current state.
3. **Object highlighting** — the hovered object is visually highlighted to distinguish it from overlapping neighbours.

This is invaluable for diagnosing collision issues ("why isn't my player hitting that platform?"), verifying hitbox alignment, and understanding spatial relationships in a crowded scene.

### What the Overlay Shows

For each object with `area()`, the overlay renders:
- The collision shape (rectangle, circle, polygon, or custom)
- Object tags (displayed as labels)
- Position coordinates

When hovering an object, additional properties appear:
- All attached component names
- Current `pos`, `scale`, `angle`
- Custom state values (if any)

---

## On-Screen Logging

`debug.log()` prints messages directly onto the game canvas — useful for values that change every frame where `console.log` would flood your browser console:

```typescript
onUpdate(() => {
  debug.log(`pos: ${player.pos}`);
  debug.log(`vel: ${player.vel}`);
  debug.log(`grounded: ${player.isGrounded()}`);
});
```

**Key details:**
- Log messages appear in the top-left corner of the game canvas by default.
- Messages persist until the next frame or until cleared.
- Press **F2** to clear the log display manually.

### When to Use `debug.log()` vs `console.log()`

| Use `debug.log()` when... | Use `console.log()` when... |
|----------------------------|----------------------------|
| Watching values that change every frame | Logging one-time events |
| Debugging visual/spatial issues | Inspecting complex objects |
| Sharing the screen with someone (visible in-game) | Need to search/filter output |
| Quick positional debugging during play | Need stack traces |

---

## Time Manipulation

Kaplay's debug mode includes built-in time controls — essential for debugging timing-sensitive behaviour like animations, physics, and cooldowns.

### Keyboard Shortcuts

| Key | Action | Use case |
|-----|--------|----------|
| **F7** | Decrease time speed | Slow-motion debugging — watch physics step by step |
| **F8** | Pause / unpause | Freeze the game to inspect current state |
| **F9** | Increase time speed | Fast-forward to reproduce timing bugs quickly |

### Programmatic Time Control

```typescript
// Pause the entire game
debug.paused = true;

// Unpause
debug.paused = false;

// Slow motion (half speed)
debug.timeScale = 0.5;

// Normal speed
debug.timeScale = 1;

// Double speed
debug.timeScale = 2;

// Check if paused
if (debug.paused) {
  debug.log('PAUSED');
}
```

### Practical Slow-Motion Debugging

Slow motion is particularly useful for:

- **Collision debugging** — watch objects approach each other frame by frame to see exactly when (or if) they overlap.
- **Animation timing** — verify that sprite frame transitions look correct at low speed.
- **Physics tuning** — observe gravity, bounce, and friction behaviour at quarter speed to fine-tune values.
- **Particle effects** — slow down explosions to verify emission patterns and lifespans.

```typescript
// Example: toggle slow-mo with a custom key
onKeyPress('m', () => {
  debug.timeScale = debug.timeScale === 1 ? 0.25 : 1;
  debug.log(`Time scale: ${debug.timeScale}x`);
});
```

---

## Debug Configuration Options

The `kaplay()` initialisation function accepts several debug-related options:

```typescript
kaplay({
  debug: true,            // Enable debug features (default: true in dev)
  debugKey: 'F3',         // Key to toggle inspect mode (default: 'F1')
  // Additional options that aid debugging:
  background: [0, 0, 0],  // Solid background makes hitbox outlines visible
  crisp: true,             // Disable anti-aliasing for pixel art (easier to spot alignment issues)
});
```

---

## Building Custom Debug Tools

Kaplay's debug API is a foundation you can extend. Here are patterns for common custom debug tools.

### FPS / Performance Monitor

```typescript
function addFpsCounter() {
  const fpsText = add([
    text('FPS: 0', { size: 14 }),
    pos(10, 10),
    fixed(),       // Stays on screen regardless of camera
    z(1000),       // Render on top of everything
    { frames: 0, elapsed: 0 }
  ]);

  fpsText.onUpdate(() => {
    fpsText.frames++;
    fpsText.elapsed += dt();

    if (fpsText.elapsed >= 0.5) {
      const fps = Math.round(fpsText.frames / fpsText.elapsed);
      fpsText.text = `FPS: ${fps}`;
      fpsText.frames = 0;
      fpsText.elapsed = 0;
    }
  });
}
```

### Object Counter

Track how many game objects are alive — useful for detecting leaks:

```typescript
function addObjectCounter() {
  const counter = add([
    text('Objects: 0', { size: 14 }),
    pos(10, 30),
    fixed(),
    z(1000)
  ]);

  counter.onUpdate(() => {
    const count = get('*').length;    // Get all tagged objects
    counter.text = `Objects: ${count}`;
    if (count > 500) {
      counter.color = rgb(255, 0, 0);  // Red warning
    }
  });
}
```

### Clickable Object Inspector

Build a custom inspector that logs details when you click any game object:

```typescript
function addClickInspector() {
  onMousePress('left', () => {
    if (!debug.inspect) return;    // Only when inspect mode is on

    const mousePos = toWorld(mousePos());
    const objects = get('*').filter(obj => {
      return obj.area && obj.hasPoint(mousePos);
    });

    objects.forEach(obj => {
      console.log('--- Inspected Object ---');
      console.log('Tags:', obj.tags);
      console.log('Pos:', obj.pos);
      console.log('Scale:', obj.scale);
      console.log('Angle:', obj.angle);
      if (obj.sprite) console.log('Sprite:', obj.sprite);
      console.log('Components:', Object.keys(obj));
    });
  });
}
```

### State Change Logger

Track when game objects change state — helpful for debugging AI or game logic:

```typescript
function watchState(obj: GameObj, label: string) {
  let prevState = JSON.stringify(getRelevantState(obj));

  obj.onUpdate(() => {
    const currentState = JSON.stringify(getRelevantState(obj));
    if (currentState !== prevState) {
      debug.log(`[${label}] state changed`);
      console.log(`[${label}]`, JSON.parse(prevState), '→', JSON.parse(currentState));
      prevState = currentState;
    }
  });
}

function getRelevantState(obj: GameObj) {
  return {
    pos: { x: Math.round(obj.pos.x), y: Math.round(obj.pos.y) },
    hp: obj.hp?.(),
    tags: obj.tags
  };
}
```

---

## Debug Workflow Patterns

### The "Debug Scene" Pattern

Create a dedicated scene for testing individual mechanics in isolation:

```typescript
scene('debug-physics', () => {
  debug.inspect = true;
  debug.timeScale = 0.5;

  // Spawn just the objects you're debugging
  const testPlayer = add([
    sprite('player'),
    pos(200, 200),
    area(),
    body(),
    'player'
  ]);

  const testPlatform = add([
    rect(300, 20),
    pos(100, 400),
    area(),
    body({ isStatic: true }),
    color(100, 100, 100),
    'platform'
  ]);

  // Add debug logging specific to what you're testing
  testPlayer.onUpdate(() => {
    debug.log(`vel.y: ${Math.round(testPlayer.vel.y)}`);
    debug.log(`grounded: ${testPlayer.isGrounded()}`);
  });

  onKeyPress('r', () => {
    go('debug-physics');    // Quick restart
  });
});
```

### Conditional Debug Code

Use a flag to keep debug tools in development but strip them from production:

```typescript
const DEV = import.meta.env.DEV;     // Vite: true in dev, false in prod

if (DEV) {
  addFpsCounter();
  addObjectCounter();

  onKeyPress('i', () => {
    debug.inspect = !debug.inspect;
  });

  onKeyPress('p', () => {
    debug.paused = !debug.paused;
  });
}
```

---

## Default Debug Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **F1** (configurable) | Toggle inspect mode — show hitboxes and object info |
| **F2** | Clear on-screen debug log |
| **F7** | Decrease time speed |
| **F8** | Pause / unpause game |
| **F9** | Increase time speed |

---

## Troubleshooting Common Issues

### "F1 doesn't work in Chrome"

Chrome intercepts F1 for its help page. Set a different `debugKey` in your `kaplay()` config:

```typescript
kaplay({ debugKey: 'F3' });
```

### "Hitboxes don't match my sprites"

The default `area()` component creates a bounding box that matches the sprite dimensions. If your sprite has transparent padding, the hitbox will be too large. Use a custom shape:

```typescript
add([
  sprite('player'),
  area({ shape: new Rect(vec2(4, 2), 24, 30) }),   // Tighter hitbox
  body()
]);
```

Enable inspect mode to visually verify the hitbox aligns with the visible sprite.

### "Too many objects are slowing down the game"

Use the object counter pattern above to track object count. Common leaks include:
- Bullets or particles that fly off-screen but are never destroyed.
- Scene transitions that add objects without cleaning up the previous scene.
- Event handlers that spawn objects without limits.

Fix with `offscreen({ destroy: true })` or manual cleanup:

```typescript
const bullet = add([
  sprite('bullet'),
  pos(player.pos),
  move(RIGHT, 600),
  offscreen({ destroy: true, distance: 100 })   // Auto-destroy when off-screen
]);
```

---

## Framework Comparison

| Concept | Kaplay | Phaser | PixiJS | Excalibur |
|---------|--------|--------|--------|-----------|
| Built-in debug overlay | Yes — F1 inspect mode | `this.physics.world.debugGraphic` (physics only) | No built-in (use `@pixi/devtools`) | `ex.Engine({ enableDiagnostics: true })` |
| Hitbox visualisation | Automatic in inspect mode | Physics debug draw | Manual or plugin | Built-in debug draw |
| On-screen logging | `debug.log()` | No built-in (use DOM overlays) | No built-in | No built-in |
| Time control | F7/F8/F9 + `debug.timeScale` | `this.time.timeScale`, `scene.pause()` | `app.ticker.speed` | `engine.timescale` |
| Pause | `debug.paused` | `scene.pause()` | `app.ticker.stop()` | `engine.stop()` |
| Custom debug key | `debugKey` option | N/A (manual key binding) | N/A | N/A |

---

## Next Steps

- [G4 Physics & Collisions](G4_physics_and_collisions.md) — understanding the collision shapes that debug mode visualises
- [G1 Components & Game Objects](G1_components_and_game_objects.md) — the component system that inspect mode reveals
- [G2 Scenes & Navigation](G2_scenes_and_navigation.md) — using debug scenes for isolated testing
- [R1 API Cheatsheet](../reference/R1_api_cheatsheet.md) — quick reference for debug properties
