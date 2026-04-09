# Kaplay — AI Rules

Engine-specific rules for projects using Kaplay (successor to Kaboom.js). These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Library:** Kaplay v3001+ (HTML5 2D game library, fork/successor of Kaboom.js)
- **Language:** TypeScript (supported) or JavaScript
- **Renderer:** WebGL with Canvas fallback
- **Physics:** Built-in arcade physics
- **Build:** Vite (scaffolded via `create-kaplay`)
- **Key Features:**
  - Functional API (no class hierarchies)
  - Component composition model
  - Tag-based object identification
  - Unified input bindings (keyboard, mouse, gamepad)

### Project Structure Conventions

```
src/
├── main.ts               # kaplay() init, asset loading, k.go()
├── scenes/               # Scene definition functions
├── objects/              # Functions returning component arrays
├── components/           # Custom reusable components
├── data/                 # Level data, constants
└── utils/                # Helpers
public/
├── sprites/
├── audio/
└── fonts/
```

---

## Code Generation Rules

### Initialization: Always Store the Context

```typescript
// CORRECT — store the kaplay context
import kaplay from 'kaplay';
const k = kaplay({ width: 800, height: 600 });

// WRONG — calling without storing, or relying on global functions
kaplay();
add([sprite('hero')]);  // 'add' is not in scope without k.
```

### Game Objects: Use Component Arrays

```typescript
// CORRECT — compose objects from components + tags
const player = k.add([
  k.sprite('hero'),
  k.pos(100, 200),
  k.area(),
  k.body(),
  'player',
]);

// WRONG — creating classes or plain objects
class Player { ... }  // Kaplay doesn't use classes
```

### Tags: Use for Identity and Collision

```typescript
// CORRECT — string tags for identification
k.add([k.sprite('coin'), k.pos(300, 400), k.area(), 'coin', 'pickup']);
k.onCollide('player', 'coin', (p, c) => { c.destroy(); score++; });

// WRONG — checking object references directly
if (obj === coinInstance) { ... }  // fragile, not idiomatic
```

### Scenes: Stateless Functions

```typescript
// CORRECT — scenes are functions, called fresh each time
k.scene('game', (data: { level: number }) => {
  // all setup happens here, from scratch
  const player = k.add([k.sprite('hero'), k.pos(50, 300), k.area(), k.body(), 'player']);
  k.setGravity(1600);
});
k.go('game', { level: 1 });

// WRONG — expecting scene state to persist between k.go() calls
let persistentPlayer;  // this will be destroyed when scene changes
```

### Asset Loading: Before k.go()

```typescript
// CORRECT — load all assets before starting scenes
k.loadSprite('hero', 'sprites/hero.png');
k.loadSound('bgm', 'audio/bgm.mp3');
k.go('menu');  // after loading

// WRONG — loading assets inside a scene
k.scene('game', () => {
  k.loadSprite('hero', 'sprites/hero.png');  // too late, may not be ready
});
```

### Custom Components: Return Objects with Lifecycle Hooks

```typescript
// CORRECT — component factory function
function patrol(speed: number = 100) {
  let dir = 1;
  return {
    id: 'patrol',
    require: ['pos'],
    update() {
      this.move(speed * dir, 0);
    },
  };
}

// Usage
k.add([k.sprite('enemy'), k.pos(300, 400), patrol(80), 'enemy']);
```

### Input: Prefer Unified Buttons

```typescript
// CORRECT — use button bindings defined in kaplay() config
k.onButtonPress('jump', () => player.jump(400));

// ALSO CORRECT — direct key input when bindings aren't needed
k.onKeyPress('space', () => player.jump(400));

// WRONG — raw DOM event listeners
document.addEventListener('keydown', (e) => { ... });  // bypasses Kaplay
```

---

## Common Pitfalls

1. **Expecting scenes to persist** — `k.go()` destroys everything and re-runs the scene function. Do not store state outside the scene closure expecting it to survive.
2. **Forgetting `area()` for collision** — `onCollide` requires the `area()` component on both objects.
3. **Forgetting `body()` for gravity** — `area()` alone gives collision detection but not physics. Add `body()` for gravity and `isGrounded()`.
4. **Loading assets inside scenes** — all `loadSprite()`, `loadSound()`, etc. must be called before `k.go()`.
5. **Not using `anchor('center')`** — Kaplay's default anchor is top-left. Add `anchor('center')` for centered transforms.
6. **Kaboom compatibility** — `kaboom()` is an alias for `kaplay()`. Existing Kaboom.js code works, but prefer `kaplay()` for new projects.
