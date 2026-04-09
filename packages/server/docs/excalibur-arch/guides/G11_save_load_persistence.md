# G11 — Excalibur.js Save/Load & Game State Persistence

> **Category:** guide · **Engine:** Excalibur · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Actors & Entities](G1_actors_and_entities.md) · [G2 Scene Management](G2_scene_management.md)

---

## Overview

Excalibur does not ship a built-in save/load system. This is by design — game state shape varies too much between genres for a one-size-fits-all solution. Instead, you build a persistence layer using Excalibur's TypeScript-first architecture: extract serializable state from your actors and scenes, store it in the browser (localStorage, IndexedDB) or on a server, and restore it on load.

This guide covers a practical, production-ready pattern for implementing save/load in Excalibur games. The architecture separates **runtime game objects** (Actors, Scenes) from **serializable state data** (plain objects), so saving and loading never requires serializing the engine itself.

---

## Core Architecture: Separate State from Entities

The key principle: **never try to serialize Actors or Scenes directly.** They contain circular references, GPU resources, and engine internals that don't survive `JSON.stringify`. Instead, maintain a plain data model alongside your game objects.

```
┌─────────────────────┐      ┌──────────────────────┐
│  Runtime Layer       │      │  Data Layer           │
│  (Actors, Scenes,    │ ←──→ │  (Plain TS interfaces,│
│   Components, Engine)│      │   JSON-serializable)  │
└─────────────────────┘      └──────────────────────┘
         ↑                            ↑
    Game runs here              Save/load happens here
```

### Step 1: Define Your State Interfaces

```typescript
// src/state/game-state.ts

export interface PlayerState {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  inventory: string[];       // item IDs
  equippedWeapon: string | null;
}

export interface EnemyState {
  id: string;
  type: string;              // e.g., 'slime', 'skeleton'
  x: number;
  y: number;
  health: number;
  isAlive: boolean;
}

export interface LevelState {
  levelId: string;
  enemies: EnemyState[];
  doorsUnlocked: string[];   // door IDs
  chestsOpened: string[];    // chest IDs
}

export interface GameState {
  version: number;           // schema version for migration
  timestamp: number;
  currentLevel: string;
  player: PlayerState;
  levels: Record<string, LevelState>;
  flags: Record<string, boolean>;  // story/quest flags
  playTimeMs: number;
}

export function createDefaultGameState(): GameState {
  return {
    version: 1,
    timestamp: Date.now(),
    currentLevel: 'level-1',
    player: {
      x: 100,
      y: 300,
      health: 100,
      maxHealth: 100,
      inventory: [],
      equippedWeapon: null,
    },
    levels: {},
    flags: {},
    playTimeMs: 0,
  };
}
```

### Step 2: State Manager (Single Source of Truth)

```typescript
// src/state/state-manager.ts

import { GameState, createDefaultGameState } from './game-state';

export class StateManager {
  private state: GameState;

  constructor() {
    this.state = createDefaultGameState();
  }

  /** Get a read-only snapshot for UI or save operations */
  getState(): Readonly<GameState> {
    return this.state;
  }

  /** Update player state — called by PlayerActor on relevant changes */
  updatePlayer(partial: Partial<GameState['player']>): void {
    Object.assign(this.state.player, partial);
  }

  /** Store the current level's entity state before leaving */
  snapshotLevel(levelId: string, levelState: GameState['levels'][string]): void {
    this.state.levels[levelId] = levelState;
  }

  /** Set a story/quest flag */
  setFlag(flag: string, value: boolean = true): void {
    this.state.flags[flag] = value;
  }

  getFlag(flag: string): boolean {
    return this.state.flags[flag] ?? false;
  }

  /** Replace entire state (used when loading a save) */
  loadState(state: GameState): void {
    this.state = state;
  }

  /** Prepare state for saving */
  prepareForSave(): GameState {
    this.state.timestamp = Date.now();
    return structuredClone(this.state);
  }
}
```

---

## Storage Backends

### localStorage (Simple, Synchronous)

Best for small save files (< 5MB). Synchronous and available in all browsers.

```typescript
// src/state/storage.ts

const SAVE_KEY_PREFIX = 'mygame_save_';

export function saveToLocalStorage(slot: number, state: GameState): boolean {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(`${SAVE_KEY_PREFIX}${slot}`, json);
    return true;
  } catch (e) {
    // localStorage is full or disabled (private browsing on some browsers)
    console.error('Save failed:', e);
    return false;
  }
}

export function loadFromLocalStorage(slot: number): GameState | null {
  try {
    const json = localStorage.getItem(`${SAVE_KEY_PREFIX}${slot}`);
    if (!json) return null;
    return JSON.parse(json) as GameState;
  } catch (e) {
    console.error('Load failed:', e);
    return null;
  }
}

export function deleteSave(slot: number): void {
  localStorage.removeItem(`${SAVE_KEY_PREFIX}${slot}`);
}

export function listSaves(): { slot: number; timestamp: number }[] {
  const saves: { slot: number; timestamp: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SAVE_KEY_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key)!) as GameState;
        const slot = parseInt(key.replace(SAVE_KEY_PREFIX, ''), 10);
        saves.push({ slot, timestamp: data.timestamp });
      } catch { /* skip corrupted entries */ }
    }
  }
  return saves.sort((a, b) => b.timestamp - a.timestamp);
}
```

### IndexedDB (Large Data, Async)

Better for games with large save files, many save slots, or binary data (screenshots, replays):

```typescript
// src/state/indexed-storage.ts

const DB_NAME = 'mygame';
const STORE_NAME = 'saves';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'slot' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveToIndexedDB(slot: number, state: GameState): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ slot, ...state });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (e) {
    console.error('IndexedDB save failed:', e);
    return false;
  }
}

export async function loadFromIndexedDB(slot: number): Promise<GameState | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(slot);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('IndexedDB load failed:', e);
    return null;
  }
}
```

### Which Storage to Use

| Factor | localStorage | IndexedDB |
|--------|-------------|-----------|
| Max size | ~5–10 MB | Hundreds of MB+ |
| API | Synchronous | Async (Promises) |
| Data types | Strings only | Structured data, blobs |
| Browser support | Universal | Universal (modern) |
| Best for | Small RPGs, puzzle games | Large worlds, replay data, screenshots |
| Gotcha | Blocks main thread on large writes | More complex API |

---

## Wiring State to Actors

### Extracting State from Actors

```typescript
// src/actors/player.ts

import { Actor, Engine, vec, CollisionType } from 'excalibur';
import { PlayerState } from '../state/game-state';
import { StateManager } from '../state/state-manager';

export class PlayerActor extends Actor {
  private health: number = 100;
  private maxHealth: number = 100;
  private inventory: string[] = [];
  private equippedWeapon: string | null = null;

  constructor(private stateManager: StateManager) {
    super({
      width: 32,
      height: 48,
      collisionType: CollisionType.Active,
    });
  }

  /** Sync runtime state → data state (call before saving) */
  extractState(): PlayerState {
    return {
      x: this.pos.x,
      y: this.pos.y,
      health: this.health,
      maxHealth: this.maxHealth,
      inventory: [...this.inventory],
      equippedWeapon: this.equippedWeapon,
    };
  }

  /** Restore from data state → runtime state (call after loading) */
  applyState(state: PlayerState): void {
    this.pos = vec(state.x, state.y);
    this.health = state.health;
    this.maxHealth = state.maxHealth;
    this.inventory = [...state.inventory];
    this.equippedWeapon = state.equippedWeapon;
  }

  takeDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
    // Push to state manager so save always has latest data
    this.stateManager.updatePlayer({ health: this.health });
  }

  collectItem(itemId: string): void {
    this.inventory.push(itemId);
    this.stateManager.updatePlayer({ inventory: [...this.inventory] });
  }
}
```

### Extracting Level State

```typescript
// src/scenes/game-level.ts

import { Scene, Engine } from 'excalibur';
import { StateManager } from '../state/state-manager';
import { LevelState, EnemyState } from '../state/game-state';
import { EnemyActor } from '../actors/enemy';
import { PlayerActor } from '../actors/player';

export class GameLevel extends Scene {
  private levelId: string;
  private player!: PlayerActor;
  private enemies: EnemyActor[] = [];

  constructor(
    private stateManager: StateManager,
    levelId: string,
  ) {
    super();
    this.levelId = levelId;
  }

  onInitialize(engine: Engine): void {
    const state = this.stateManager.getState();

    // Create player and restore state
    this.player = new PlayerActor(this.stateManager);
    this.player.applyState(state.player);
    this.add(this.player);

    // Restore enemies from saved state, or spawn defaults
    const levelState = state.levels[this.levelId];
    if (levelState) {
      this.restoreEnemies(levelState.enemies);
    } else {
      this.spawnDefaultEnemies();
    }
  }

  /** Snapshot the current level for saving */
  extractLevelState(): LevelState {
    return {
      levelId: this.levelId,
      enemies: this.enemies.map(e => e.extractState()),
      doorsUnlocked: this.getUnlockedDoors(),
      chestsOpened: this.getOpenedChests(),
    };
  }

  /** Call this before transitioning away or saving */
  prepareForSave(): void {
    // Push player position to state manager
    this.stateManager.updatePlayer(this.player.extractState());
    // Snapshot level state
    this.stateManager.snapshotLevel(this.levelId, this.extractLevelState());
  }

  private restoreEnemies(enemyStates: EnemyState[]): void {
    for (const es of enemyStates) {
      if (!es.isAlive) continue; // don't respawn dead enemies
      const enemy = new EnemyActor(es.type, es.id);
      enemy.applyState(es);
      this.enemies.push(enemy);
      this.add(enemy);
    }
  }

  private spawnDefaultEnemies(): void {
    // Level-specific default spawn logic
  }

  private getUnlockedDoors(): string[] { return []; /* implementation */ }
  private getOpenedChests(): string[] { return []; /* implementation */ }
}
```

---

## Save/Load Flow

### Saving

```typescript
// src/save-load.ts

import { StateManager } from './state/state-manager';
import { saveToLocalStorage } from './state/storage';
import { GameLevel } from './scenes/game-level';

export function saveGame(
  stateManager: StateManager,
  currentLevel: GameLevel,
  slot: number,
): boolean {
  // 1. Snapshot current level entities → state
  currentLevel.prepareForSave();

  // 2. Get the complete state object
  const state = stateManager.prepareForSave();

  // 3. Persist to storage
  const success = saveToLocalStorage(slot, state);

  if (success) {
    console.log(`Game saved to slot ${slot}`);
  }
  return success;
}
```

### Loading

```typescript
import { Engine } from 'excalibur';
import { StateManager } from './state/state-manager';
import { loadFromLocalStorage } from './state/storage';
import { migrateState } from './state/migration';
import { GameLevel } from './scenes/game-level';

export function loadGame(
  engine: Engine,
  stateManager: StateManager,
  slot: number,
): boolean {
  // 1. Read from storage
  const rawState = loadFromLocalStorage(slot);
  if (!rawState) {
    console.warn(`No save found in slot ${slot}`);
    return false;
  }

  // 2. Migrate if needed (handles old save formats)
  const state = migrateState(rawState);

  // 3. Load into state manager
  stateManager.loadState(state);

  // 4. Transition to the saved level — scene's onInitialize reads from stateManager
  engine.goToScene(state.currentLevel);

  return true;
}
```

---

## State Migration

When you update your game, save file structure may change. Version your state and write migrations:

```typescript
// src/state/migration.ts

import { GameState } from './game-state';

const CURRENT_VERSION = 2;

export function migrateState(state: GameState): GameState {
  let migrated = structuredClone(state);

  // v1 → v2: added equippedWeapon field
  if (migrated.version < 2) {
    migrated.player.equippedWeapon = migrated.player.equippedWeapon ?? null;
    migrated.version = 2;
  }

  // v2 → v3: future migrations go here
  // if (migrated.version < 3) { ... }

  if (migrated.version !== CURRENT_VERSION) {
    console.warn(`Save version ${migrated.version} is newer than game version ${CURRENT_VERSION}`);
  }

  return migrated;
}
```

### Migration Best Practices

- Always increment `version` when you change the state shape.
- Write migrations as sequential steps (v1→v2, v2→v3), not jumps (v1→v3).
- Never delete a migration — players may have saves from any version.
- Test migrations with fixture save files in your test suite.

---

## Auto-Save

Implement periodic auto-save using Excalibur's timer system:

```typescript
import { Engine, Timer } from 'excalibur';

export function setupAutoSave(
  engine: Engine,
  stateManager: StateManager,
  getCurrentLevel: () => GameLevel,
  intervalMs: number = 60_000, // every 60 seconds
): Timer {
  const autoSaveTimer = new Timer({
    fcn: () => {
      const level = getCurrentLevel();
      level.prepareForSave();
      const state = stateManager.prepareForSave();
      saveToLocalStorage(0, state); // slot 0 = auto-save
      console.log('Auto-saved');
    },
    interval: intervalMs,
    repeats: true,
  });

  engine.currentScene.add(autoSaveTimer);
  autoSaveTimer.start();
  return autoSaveTimer;
}
```

### When to Auto-Save

| Trigger | Implementation |
|---------|---------------|
| Timed interval | `Timer` with `repeats: true` (shown above) |
| Room/level transition | Call `saveGame()` in scene `onDeactivate()` |
| After boss defeat | Call `saveGame()` in the boss-death handler |
| Checkpoint reached | Trigger save when player overlaps a checkpoint Actor |

---

## ECS-Based State Extraction

For games using Excalibur's ECS directly, extract state from components:

```typescript
import { Component } from 'excalibur';

// A component that holds serializable state
export class HealthComponent extends Component {
  declare type: 'health';
  constructor(
    public current: number,
    public max: number,
  ) {
    super();
  }

  serialize(): { current: number; max: number } {
    return { current: this.current, max: this.max };
  }

  deserialize(data: { current: number; max: number }): void {
    this.current = data.current;
    this.max = data.max;
  }
}

// Generic entity serialization
function serializeEntity(entity: Entity): Record<string, unknown> {
  const data: Record<string, unknown> = {
    id: entity.name,
    x: entity.pos.x,
    y: entity.pos.y,
  };

  // Serialize each component that supports it
  for (const component of entity.getComponents()) {
    if ('serialize' in component && typeof component.serialize === 'function') {
      data[component.type] = component.serialize();
    }
  }

  return data;
}
```

---

## Common Pitfalls

### Don't Serialize Engine Objects

```typescript
// BAD — circular references, GPU resources, will crash
JSON.stringify(actor);
JSON.stringify(engine);
JSON.stringify(scene);

// GOOD — extract plain data first
JSON.stringify(actor.extractState());
```

### Don't Store Derived Data

```typescript
// BAD — recalculate this from inventory on load
interface PlayerState {
  inventory: string[];
  totalWeight: number;  // derived from inventory — don't save this
}

// GOOD — save only source data
interface PlayerState {
  inventory: string[];
  // totalWeight computed at runtime from inventory
}
```

### Handle Missing Saves Gracefully

```typescript
// Always validate loaded data
const state = loadFromLocalStorage(slot);
if (!state || typeof state.version !== 'number') {
  // Corrupted or missing — start fresh
  return createDefaultGameState();
}
```

### Test Save/Load in CI

```typescript
// save-load.test.ts
import { createDefaultGameState } from './state/game-state';
import { migrateState } from './state/migration';

describe('Save/Load', () => {
  it('round-trips default state through JSON', () => {
    const original = createDefaultGameState();
    const json = JSON.stringify(original);
    const restored = JSON.parse(json);
    expect(restored).toEqual(original);
  });

  it('migrates v1 saves to current version', () => {
    const v1Save = { version: 1, player: { x: 0, y: 0, health: 50, maxHealth: 100, inventory: [] }, /* ... */ };
    const migrated = migrateState(v1Save as any);
    expect(migrated.version).toBe(2);
    expect(migrated.player.equippedWeapon).toBeNull();
  });
});
```

---

## Cross-Framework Comparison

| Feature | Excalibur | Phaser 3 | Kaplay | PixiJS |
|---------|-----------|----------|--------|--------|
| Built-in save/load | No | No (use Registry + localStorage) | No | No (rendering only) |
| State management | Manual (class properties or state machine) | Scene Data, Registry | Global state via `getData()`/`setData()` | Manual |
| Serialization | Manual `extractState()` / `applyState()` | `JSON.stringify` on Registry data | `JSON.stringify` on game data | Manual |
| Scene restoration | `onInitialize` reads from StateManager | `init(data)` receives passed data | `scene()` callback re-runs | Manual scene rebuild |
| ECS integration | Yes — serialize Components | No built-in ECS | No ECS | No ECS |

---

## Recommended File Structure

```
src/
├── state/
│   ├── game-state.ts       # Interfaces + createDefaultGameState()
│   ├── state-manager.ts    # Runtime state container
│   ├── storage.ts          # localStorage backend
│   ├── indexed-storage.ts  # IndexedDB backend (optional)
│   └── migration.ts        # Version migrations
├── actors/
│   ├── player.ts           # extractState() / applyState()
│   └── enemy.ts            # extractState() / applyState()
├── scenes/
│   └── game-level.ts       # extractLevelState() / prepareForSave()
└── save-load.ts            # Top-level save/load orchestration
```
