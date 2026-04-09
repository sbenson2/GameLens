# G12 — Phaser 3 Save/Load & Game State Persistence

> **Category:** guide · **Engine:** Phaser · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Lifecycle](G1_scene_lifecycle.md) · [G7 UI & HUD](G7_ui_and_hud.md)

---

## Overview

Phaser 3 does not ship a built-in save/load system for persisting game state across sessions. It does, however, provide the **Registry** (a global Data Manager) and per-Scene **Data Managers** for managing runtime state. To persist state across browser sessions, you pair these with browser storage APIs — `localStorage` for simple data, `IndexedDB` for larger or structured data.

This guide covers the full persistence stack: runtime state management with Phaser's Data Manager and Registry, serialization to browser storage, data integrity with checksums, and practical patterns for different game types (progression-based, sandbox, roguelike).

---

## Runtime State: Registry & Data Manager

Phaser has a three-tier Data Manager hierarchy:

1. **Game Registry** (`this.registry`) — one per game, shared across all Scenes, persists as long as the game runs
2. **Scene Data** (`this.data`) — one per Scene, survives `sleep`/`pause` but clears on `shutdown` unless handled
3. **Game Object Data** (`gameObject.data`) — per-object, useful for entity-specific metadata

### Using the Registry for Global State

```typescript
// In any Scene — set global values
this.registry.set('playerGold', 500);
this.registry.set('unlockedLevels', [1, 2, 3]);
this.registry.set('settings', { musicVolume: 0.8, sfxVolume: 1.0 });

// In any other Scene — read them instantly
const gold = this.registry.get('playerGold') as number;
const levels = this.registry.get('unlockedLevels') as number[];
```

### Reacting to State Changes

The Registry emits `changedata` events, which is ideal for keeping UI in sync:

```typescript
export class HUDScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;

  create(): void {
    this.goldText = this.add.text(16, 16, 'Gold: 0', {
      fontSize: '24px',
      color: '#ffcc00',
    });

    // Update HUD whenever gold changes in any Scene
    this.registry.events.on('changedata-playerGold', (_: unknown, value: number) => {
      this.goldText.setText(`Gold: ${value}`);
    });
  }
}
```

### Scene Data for Local State

```typescript
export class BattleScene extends Phaser.Scene {
  create(): void {
    // Scene-local state — not shared globally
    this.data.set('turnNumber', 1);
    this.data.set('enemiesRemaining', 5);

    this.data.events.on('changedata-enemiesRemaining', (_: unknown, value: number) => {
      if (value <= 0) this.endBattle();
    });
  }
}
```

---

## Designing Your Save Data

The key principle: **never serialize Phaser objects directly.** Game Objects, Scenes, and Textures contain circular references and GPU handles that don't survive `JSON.stringify`. Instead, maintain a plain data model.

### Step 1: Define State Interfaces

```typescript
// save-types.ts — plain serializable data, no Phaser types

interface PlayerSave {
  name: string;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  maxHp: number;
  inventory: InventoryItem[];
  position: { x: number; y: number };
  equippedWeapon: string | null;
}

interface InventoryItem {
  id: string;
  quantity: number;
}

interface WorldSave {
  currentScene: string;
  unlockedAreas: string[];
  defeatedBosses: string[];
  npcsInteracted: string[];
  flags: Record<string, boolean>;  // story flags, switches, etc.
}

interface SettingsSave {
  musicVolume: number;
  sfxVolume: number;
  fullscreen: boolean;
  language: string;
}

interface GameSave {
  version: number;           // for migration
  timestamp: number;
  playtime: number;          // total seconds played
  player: PlayerSave;
  world: WorldSave;
  settings: SettingsSave;
}
```

### Step 2: Extract State from Game Objects

```typescript
// In your game scene — extract serializable state from live objects
function extractPlayerState(player: PlayerSprite): PlayerSave {
  return {
    name: player.playerName,
    level: player.level,
    xp: player.xp,
    gold: player.gold,
    hp: player.hp,
    maxHp: player.maxHp,
    inventory: player.inventory.getItems(), // returns plain objects
    position: { x: player.x, y: player.y },
    equippedWeapon: player.weapon?.id ?? null,
  };
}

function extractWorldState(scene: Phaser.Scene): WorldSave {
  return {
    currentScene: scene.scene.key,
    unlockedAreas: scene.registry.get('unlockedAreas') ?? [],
    defeatedBosses: scene.registry.get('defeatedBosses') ?? [],
    npcsInteracted: scene.registry.get('npcsInteracted') ?? [],
    flags: scene.registry.get('storyFlags') ?? {},
  };
}
```

### Step 3: Restore State to Game Objects

```typescript
function applyPlayerState(player: PlayerSprite, save: PlayerSave): void {
  player.playerName = save.name;
  player.level = save.level;
  player.xp = save.xp;
  player.gold = save.gold;
  player.hp = save.hp;
  player.maxHp = save.maxHp;
  player.inventory.setItems(save.inventory);
  player.setPosition(save.position.x, save.position.y);
  if (save.equippedWeapon) player.equip(save.equippedWeapon);
}
```

---

## Storage Layer: localStorage

For most web games, `localStorage` is the right choice. It holds 5–10MB (browser-dependent), is synchronous, and works everywhere.

### Save Manager

```typescript
// save-manager.ts

const SAVE_KEY_PREFIX = 'mygame_save_';
const SETTINGS_KEY = 'mygame_settings';
const SAVE_VERSION = 1;

export class SaveManager {
  /** Save the game to a named slot */
  static save(slotName: string, save: GameSave): boolean {
    try {
      save.version = SAVE_VERSION;
      save.timestamp = Date.now();
      const json = JSON.stringify(save);
      const checksum = SaveManager.computeChecksum(json);
      localStorage.setItem(SAVE_KEY_PREFIX + slotName, json);
      localStorage.setItem(SAVE_KEY_PREFIX + slotName + '_check', checksum);
      return true;
    } catch (e) {
      // localStorage full or unavailable (private browsing, etc.)
      console.error('Save failed:', e);
      return false;
    }
  }

  /** Load from a named slot, returns null on failure or corruption */
  static load(slotName: string): GameSave | null {
    try {
      const json = localStorage.getItem(SAVE_KEY_PREFIX + slotName);
      if (!json) return null;

      // Validate checksum
      const storedChecksum = localStorage.getItem(SAVE_KEY_PREFIX + slotName + '_check');
      if (storedChecksum && storedChecksum !== SaveManager.computeChecksum(json)) {
        console.warn('Save data corrupted — checksum mismatch');
        return null;
      }

      const save = JSON.parse(json) as GameSave;

      // Migrate old save versions
      return SaveManager.migrate(save);
    } catch (e) {
      console.error('Load failed:', e);
      return null;
    }
  }

  /** Delete a save slot */
  static delete(slotName: string): void {
    localStorage.removeItem(SAVE_KEY_PREFIX + slotName);
    localStorage.removeItem(SAVE_KEY_PREFIX + slotName + '_check');
  }

  /** List all available save slots */
  static listSlots(): string[] {
    const slots: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(SAVE_KEY_PREFIX) && !key.endsWith('_check')) {
        slots.push(key.replace(SAVE_KEY_PREFIX, ''));
      }
    }
    return slots;
  }

  /** Simple checksum — djb2 hash for tamper detection (not security) */
  private static computeChecksum(data: string): string {
    let hash = 5381;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) + hash) + data.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /** Handle save format upgrades across game versions */
  private static migrate(save: GameSave): GameSave {
    // Example: version 0 didn't have playtime
    if (!save.version || save.version < 1) {
      save.playtime = save.playtime ?? 0;
      save.version = 1;
    }
    return save;
  }
}
```

### Wiring Save/Load into Scenes

```typescript
export class GameScene extends Phaser.Scene {
  private player!: PlayerSprite;
  private sessionStartTime = 0;

  create(data?: { loadSlot?: string }): void {
    this.sessionStartTime = Date.now();

    // Build the scene normally
    this.player = new PlayerSprite(this, 100, 100);

    // If loading a save, restore state
    if (data?.loadSlot) {
      const save = SaveManager.load(data.loadSlot);
      if (save) {
        applyPlayerState(this.player, save.player);
        this.applyWorldState(save.world);
        this.applySettings(save.settings);
      }
    }

    // Keyboard shortcut: F5 to quicksave
    this.input.keyboard?.on('keydown-F5', () => {
      this.quickSave();
    });
  }

  private quickSave(): void {
    const save: GameSave = {
      version: 1,
      timestamp: Date.now(),
      playtime: this.getPlaytime(),
      player: extractPlayerState(this.player),
      world: extractWorldState(this),
      settings: this.getSettings(),
    };

    const success = SaveManager.save('quicksave', save);
    if (success) {
      // Show brief "Saved!" toast in HUD scene
      this.scene.get('HUDScene').events.emit('showToast', 'Game Saved!');
    }
  }

  private getPlaytime(): number {
    const previousPlaytime = (this.registry.get('playtime') as number) ?? 0;
    const sessionSeconds = (Date.now() - this.sessionStartTime) / 1000;
    return previousPlaytime + sessionSeconds;
  }
}
```

---

## Autosave Pattern

Autosaving at key moments prevents frustrating data loss:

```typescript
export class AutosavePlugin extends Phaser.Plugins.BasePlugin {
  private intervalId?: number;

  start(): void {
    // Autosave every 60 seconds
    this.intervalId = window.setInterval(() => {
      this.game.events.emit('autosave');
    }, 60_000);

    // Also save on key game events
    this.game.registry.events.on('changedata-currentScene', () => {
      this.game.events.emit('autosave');
    });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

// Register in game config
const config: Phaser.Types.Core.GameConfig = {
  // ...
  plugins: {
    global: [
      { key: 'AutosavePlugin', plugin: AutosavePlugin, start: true },
    ],
  },
};
```

---

## IndexedDB for Larger Data

If your game stores images (screenshots for save slots), large procedural maps, or complex databases, IndexedDB offers ~50MB+ storage with async access:

```typescript
// idb-save-manager.ts — async wrapper using the 'idb' npm package

import { openDB, type IDBPDatabase } from 'idb';

interface SaveDBSchema {
  saves: { key: string; value: GameSave };
  screenshots: { key: string; value: Blob };
}

let db: IDBPDatabase<SaveDBSchema>;

async function getDB(): Promise<IDBPDatabase<SaveDBSchema>> {
  if (!db) {
    db = await openDB<SaveDBSchema>('mygame', 1, {
      upgrade(database) {
        database.createObjectStore('saves');
        database.createObjectStore('screenshots');
      },
    });
  }
  return db;
}

export async function saveGameIDB(slot: string, save: GameSave): Promise<void> {
  const database = await getDB();
  await database.put('saves', save, slot);
}

export async function loadGameIDB(slot: string): Promise<GameSave | undefined> {
  const database = await getDB();
  return database.get('saves', slot);
}

export async function saveScreenshot(slot: string, canvas: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });
  const database = await getDB();
  await database.put('screenshots', blob, slot);
}
```

---

## Settings Persistence (Separate from Saves)

Settings should persist independently of save games — a player who hasn't started playing yet still wants their volume preferences remembered:

```typescript
// settings-manager.ts

const SETTINGS_KEY = 'mygame_settings';

const DEFAULT_SETTINGS: SettingsSave = {
  musicVolume: 0.8,
  sfxVolume: 1.0,
  fullscreen: false,
  language: 'en',
};

export function loadSettings(): SettingsSave {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    // Merge with defaults — handles newly added settings across updates
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: SettingsSave): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
```

---

## Mobile & Cross-Platform Considerations

- **Capacitor/Cordova:** Use the `@capacitor/preferences` plugin instead of raw `localStorage`. It's more reliable on iOS/Android and avoids WebView storage eviction.
- **Electron:** `localStorage` works but lives inside the Chromium profile. For robustness, write JSON files to the user's app data directory via Node.js `fs`.
- **Private browsing:** Some browsers restrict or disable `localStorage` in incognito mode. Always wrap storage calls in try/catch and show a warning if persistence isn't available.
- **Storage eviction:** On mobile browsers, the OS can evict `localStorage` under memory pressure. For critical saves, consider syncing to a backend or prompting users to export their save.

---

## Framework Comparison: Save/Load

| Feature | Phaser 3 | Excalibur | Kaplay | PixiJS |
|---|---|---|---|---|
| Built-in save system | No (Registry for runtime) | No | No | No (rendering only) |
| Global state manager | Registry (Data Manager) | Custom | Custom | Custom |
| Change events | `changedata` events | Custom | Custom | Custom |
| Recommended storage | localStorage / IndexedDB | localStorage / IndexedDB | localStorage | localStorage / IndexedDB |

All four web frameworks leave persistence to you — the browser storage APIs are the same regardless of framework. The patterns in this guide apply broadly.

---

## Summary

Phaser's Registry and Data Managers handle runtime state beautifully — changes in one Scene are instantly visible everywhere, with event-driven UI updates. For persistence across sessions, build a thin SaveManager over `localStorage` (or IndexedDB for larger data). The critical pattern is: define plain TypeScript interfaces for your save data, extract state from game objects before saving, and restore it after loading. Never serialize Phaser objects directly. Add checksums for integrity, version numbers for migration, and autosave at scene transitions to protect your players' progress.
