# Excalibur.js — AI Rules

Engine-specific rules for projects using Excalibur.js. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Engine:** Excalibur.js (TypeScript-first 2D game engine, v0.32+)
- **Language:** TypeScript (primary) — JavaScript works but loses the main advantage
- **Renderer:** WebGL 2D with Canvas fallback
- **Physics:** Built-in SAT (Separating Axis Theorem) collision detection
- **Build:** Vite (scaffolded via `npx create-excalibur`)
- **Key Features:**
  - Class-based API (extend Actor, Scene, Component, System)
  - Full ECS underpinning exposed alongside Actor API
  - Typed resource loader with progress tracking
  - SAT polygon collision (more precise than AABB)

### Project Structure Conventions

```
src/
├── main.ts               # Engine config, scene registration, game.start()
├── resources.ts           # ImageSource, Sound declarations + Loader
├── scenes/               # Scene classes (extend Scene)
├── actors/               # Actor classes (extend Actor)
├── components/           # Custom ECS components (extend Component)
├── systems/              # Custom ECS systems (extend System)
├── levels/               # Level loading, tilemap parsing
└── utils/                # Constants, helpers
public/
└── assets/               # Sprites, audio, maps
```

---

## Code Generation Rules

### Actors: Always Extend Actor

```typescript
// CORRECT — extend Actor for game objects
export class Player extends Actor {
  constructor(pos: Vector) {
    super({
      pos,
      width: 32,
      height: 48,
      collisionType: CollisionType.Active,
    });
  }
  onInitialize(engine: Engine): void { /* setup */ }
  onPreUpdate(engine: Engine, delta: number): void { /* per-frame logic */ }
}

// WRONG — plain objects or manual rendering
const player = { x: 100, y: 200 };
```

### Collision Types: Always Specify

```typescript
// CORRECT — explicit collision type
new Actor({ collisionType: CollisionType.Active });   // player, enemies
new Actor({ collisionType: CollisionType.Fixed });    // platforms, walls
new Actor({ collisionType: CollisionType.Passive });  // triggers, pickups

// WRONG — default collision type may not be what you want
new Actor({ pos: vec(100, 200) });  // collision type defaults may surprise you
```

### Resources: Declare, Load, Then Use

```typescript
// CORRECT — resources.ts declares all assets
export const Resources = {
  player: new ImageSource('/assets/player.png'),
  bgm: new Sound('/assets/bgm.mp3'),
};
export const loader = new Loader();
for (const res of Object.values(Resources)) {
  loader.addResource(res);
}

// main.ts — pass loader to game.start()
game.start(loader).then(() => game.goToScene('menu'));

// In an Actor — convert ImageSource to Sprite
this.graphics.use(Resources.player.toSprite());

// WRONG — using ImageSource directly as a graphic
this.graphics.use(Resources.player);  // ImageSource is NOT a Sprite
```

### Scenes: Use Lifecycle Hooks Correctly

```typescript
// CORRECT — onInitialize for one-time setup, onActivate for per-entry
export class GameScene extends Scene {
  onInitialize(engine: Engine): void {
    // Runs ONCE — add actors, set up level
    this.add(new Player(vec(100, 300)));
  }
  onActivate(context: SceneActivationContext): void {
    // Runs EVERY TIME scene becomes active — reset state, read data
  }
}

// WRONG — putting all setup in onActivate (creates duplicate actors)
onActivate(): void {
  this.add(new Player(vec(100, 300)));  // adds a new player every time!
}
```

### Input: Access Through engine.input

```typescript
// CORRECT — typed input through engine
onPreUpdate(engine: Engine, delta: number): void {
  if (engine.input.keyboard.isHeld(Input.Keys.Left)) { ... }
  if (engine.input.keyboard.wasPressed(Input.Keys.Space)) { ... }
}

// WRONG — raw DOM events
document.addEventListener('keydown', ...);  // bypasses Excalibur
```

### ECS: Use Only When Needed

```typescript
// CORRECT — use Actor for most game objects
const enemy = new Enemy(vec(300, 200));
scene.add(enemy);

// CORRECT — drop to ECS for custom high-performance systems
class DamageComponent extends Component { type = 'damage'; }
class DamageSystem extends System {
  query = world.query([DamageComponent, HealthComponent]);
  update(delta: number): void { /* process all matching entities */ }
}

// WRONG — using raw ECS for simple game objects that Actor handles fine
const player = new Entity();
player.addComponent(new TransformComponent());
player.addComponent(new GraphicsComponent());
// ...tedious and unnecessary when Actor gives you all this for free
```

---

## Common Pitfalls

1. **Using `ImageSource` as a graphic** — `ImageSource` is the raw loaded file. Call `.toSprite()` or use `SpriteSheet.fromImageSource()` to create a drawable graphic.
2. **Adding actors in `onActivate` instead of `onInitialize`** — `onActivate` runs every time the scene is entered, creating duplicates. Use `onInitialize` for one-time setup.
3. **Forgetting to pass the Loader to `game.start()`** — resources won't be loaded and sprites will be blank.
4. **Not setting CollisionType** — actors without an explicit collision type may not collide as expected.
5. **Excalibur is pre-1.0** — pin your version in `package.json`. Check the changelog before upgrading, as APIs may change between minor versions.
6. **Physics gravity** — set `Physics.gravity = vec(0, 800)` globally or per-actor. Forgetting this means no gravity for `Active` collision type actors.
