# G9 — Save and Load System in Construct 3

> **Category:** guide · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Event Sheet Patterns](G1_event_sheet_patterns.md) · [R1 Behaviors and Effects](../reference/R1_behaviors_and_effects.md)

---

## Two Approaches: System Save vs. Custom JSON

Construct 3 provides two distinct ways to save and load game state. Choosing the right one depends on what you're building.

| Approach | Best For | Limitations |
|----------|----------|-------------|
| **System Save/Load** | Quick prototypes, jam games | Saves entire project state; large files; no partial saves; hard to version |
| **Custom JSON + LocalStorage** | Production games, RPGs, roguelikes | You control exactly what's saved; smaller files; versionable; multiple slots |

**Recommendation:** Use Custom JSON for any game you plan to ship. System Save is convenient but brittle — a single change to your project layout can break old saves with no migration path.

---

## Method 1: System Save/Load (Quick & Simple)

The built-in system saves the complete state of all objects, variables, and layouts.

### Event Sheet Setup

```
── On keyboard "F5" pressed
   └─ System: Save to slot "save1"

── On keyboard "F9" pressed
   └─ System: Load from slot "save1"

── On save complete
   └─ Text: Set text to "Game saved!"

── On save failed
   └─ Text: Set text to "Save failed!"

── On load complete
   └─ Text: Set text to "Game loaded!"

── On load failed
   └─ Text: Set text to "Load failed!"
```

### System Save Limitations

- Saves the **entire** project snapshot — all layouts, all objects, all instance variables.
- Large save files (can be MBs for complex projects).
- No way to save only specific data (e.g., just inventory, not enemy positions).
- Layout changes between versions can break saves.
- No built-in migration for save format changes.

---

## Method 2: Custom JSON + LocalStorage (Recommended)

Build your own save data as a JSON string, then store it with the LocalStorage plugin or the scripting storage API. You decide exactly what gets saved.

### Step 1: Design Your Save Schema

Plan what data your game actually needs to restore state. Only save what you can't recalculate.

**Example save schema for an RPG:**
```json
{
  "version": 3,
  "timestamp": 1712620800,
  "player": {
    "x": 450,
    "y": 320,
    "hp": 85,
    "maxHp": 100,
    "level": 7,
    "gold": 1250
  },
  "inventory": [
    { "id": "potion", "qty": 5 },
    { "id": "iron_sword", "qty": 1 }
  ],
  "flags": {
    "bossDefeated": true,
    "doorUnlocked": false
  },
  "currentLayout": "Dungeon_Floor2"
}
```

### Step 2: Building Save Data (Event Sheet Approach)

Use a **Dictionary** or **Array** object to assemble data, then convert to JSON.

```
── Function "CreateSaveData"
   │
   ├─ Dictionary: Clear
   │
   ├─ Dictionary: Add key "version" value 3
   ├─ Dictionary: Add key "timestamp" value UnixTimestamp
   │
   │  // Player data
   ├─ Dictionary: Add key "player_x" value Player.X
   ├─ Dictionary: Add key "player_y" value Player.Y
   ├─ Dictionary: Add key "player_hp" value Player.HP
   ├─ Dictionary: Add key "player_maxHp" value Player.MaxHP
   ├─ Dictionary: Add key "player_level" value Player.Level
   ├─ Dictionary: Add key "player_gold" value Player.Gold
   │
   │  // Current location
   ├─ Dictionary: Add key "layout" value LayoutName
   │
   │  // Game flags
   ├─ Dictionary: Add key "flag_bossDefeated" value GameFlags.BossDefeated
   └─ Dictionary: Add key "flag_doorUnlocked" value GameFlags.DoorUnlocked
```

### Step 3: Saving to LocalStorage (Event Sheet)

```
── Function "SaveGame" (Parameter: SlotName)
   │
   ├─ Call Function "CreateSaveData"
   │
   │  // Convert dictionary to JSON string
   ├─ Set SaveJSON to Dictionary.AsJSON
   │
   │  // Store in LocalStorage
   ├─ LocalStorage: Set item ("save_" & SlotName) to SaveJSON
   │
   └─ Sub-event: LocalStorage On item set
      └─ Text: Set text to "Saved to slot " & SlotName
```

### Step 4: Loading from LocalStorage (Event Sheet)

```
── Function "LoadGame" (Parameter: SlotName)
   │
   ├─ LocalStorage: Get item ("save_" & SlotName)
   │
   └─ Sub-event: LocalStorage On item get
      │
      ├─ Dictionary: Load from JSON string LocalStorage.ItemValue
      │
      │  // Check version for migration
      ├─ Compare: Dictionary.Get("version") < 3
      │  └─ Call Function "MigrateSaveV2toV3"
      │
      │  // Restore player state
      ├─ Player: Set position to (Dictionary.Get("player_x"), Dictionary.Get("player_y"))
      ├─ Player: Set HP to Dictionary.Get("player_hp")
      ├─ Player: Set MaxHP to Dictionary.Get("player_maxHp")
      ├─ Player: Set Level to Dictionary.Get("player_level")
      ├─ Player: Set Gold to Dictionary.Get("player_gold")
      │
      │  // Restore layout
      └─ System: Go to layout by name Dictionary.Get("layout")
```

### Step 5: Scripting API Alternative (JavaScript)

For developers using Construct 3's scripting layer, the runtime storage API is cleaner:

```javascript
// Save
async function saveGame(runtime, slotName) {
    const saveData = {
        version: 3,
        timestamp: Date.now(),
        player: {
            x: runtime.objects.Player.getFirstInstance().x,
            y: runtime.objects.Player.getFirstInstance().y,
            hp: runtime.objects.Player.getFirstInstance().instVars.HP,
            level: runtime.objects.Player.getFirstInstance().instVars.Level,
        },
        flags: {
            bossDefeated: runtime.globalVars.BossDefeated,
        },
        currentLayout: runtime.layout.name,
    };

    await runtime.storage.setItem("save_" + slotName, JSON.stringify(saveData));
}

// Load
async function loadGame(runtime, slotName) {
    const raw = await runtime.storage.getItem("save_" + slotName);
    if (!raw) return false;

    const data = JSON.parse(raw);

    // Version migration
    if (data.version < 3) {
        migrateSave(data);
    }

    const player = runtime.objects.Player.getFirstInstance();
    player.x = data.player.x;
    player.y = data.player.y;
    player.instVars.HP = data.player.hp;
    player.instVars.Level = data.player.level;

    runtime.globalVars.BossDefeated = data.flags.bossDefeated;

    await runtime.goToLayout(data.currentLayout);
    return true;
}
```

---

## Save Versioning and Migration

Always include a `version` number in your save data. When your game changes, increment the version and write migration logic.

```
── Function "MigrateSaveV2toV3"
   │  // V2 didn't have maxHp — add a default
   ├─ Dictionary: Add key "player_maxHp" value 100
   │
   │  // V2 stored gold as "money" — rename
   ├─ Dictionary: Add key "player_gold" value Dictionary.Get("money")
   ├─ Dictionary: Delete key "money"
   │
   └─ Dictionary: Set key "version" value 3
```

**Migration best practices:**
- Migrate saves forward one version at a time (V1→V2→V3), chaining migrations.
- Never remove a migration — players may have very old saves.
- Test migrations with actual old save files before shipping an update.

---

## Multiple Save Slots

Use a naming convention for slot keys and maintain a slot index.

```
── Function "GetSlotList"
   │  // Check which slots exist
   ├─ Repeat 5 times  (loopindex 0..4)
   │  └─ LocalStorage: Check item exists ("save_slot" & loopindex)
   │     └─ Sub-event: On item exists
   │        └─ Array: Push ("slot" & loopindex)
```

### Slot Metadata

Store a small metadata entry alongside each save for the load screen:

```json
{
  "slots": {
    "slot0": { "name": "Dungeon Floor 2", "level": 7, "playtime": 7200, "timestamp": 1712620800 },
    "slot1": { "name": "Forest Village", "level": 3, "playtime": 2400, "timestamp": 1712534400 }
  }
}
```

Save the metadata index to `"save_index"` whenever a slot is written. Load it first to populate the save/load menu without reading every full save file.

---

## Platform-Specific Considerations

### Browser (HTML5)

- Uses IndexedDB under the hood (via LocalStorage plugin).
- Storage limits vary by browser (~5–50 MB typical).
- **Private/incognito mode may clear storage on close.**
- Always handle the "On error" trigger — storage can fail silently.

### Desktop (NW.js Export)

For NW.js exports, you can write real files instead of using browser storage:

```javascript
// Using Node.js fs in NW.js export
const fs = require("fs");
const path = require("path");

function getSavePath(slotName) {
    // nw.App.dataPath gives a persistent app directory
    return path.join(nw.App.dataPath, slotName + ".json");
}

function saveToFile(slotName, data) {
    fs.writeFileSync(getSavePath(slotName), JSON.stringify(data, null, 2));
}

function loadFromFile(slotName) {
    const filePath = getSavePath(slotName);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
```

**Advantages of file-based saves:** No browser storage limits, players can back up save files, easier to debug (human-readable JSON files on disk).

### Mobile

- LocalStorage plugin works on mobile exports.
- Consider cloud save integration for cross-device play (requires a backend or third-party service).
- Handle app suspension — auto-save on the `visibilitychange` event.

---

## Error Handling Checklist

| Scenario | How to Handle |
|----------|---------------|
| Storage full | Catch "On error", show message, suggest deleting old saves |
| Corrupted JSON | Wrap `JSON.parse` in try/catch; show "save corrupted" message |
| Missing save slot | Check item exists before loading; show empty slot in UI |
| Version mismatch | Run migration chain; if version is too old/unknown, warn player |
| Layout renamed | Store layout name as a string; validate it exists before `Go to layout` |
| Private browsing | Warn player that saves may not persist in private/incognito mode |

---

## Summary: Recommended Architecture

1. **Design your save schema** — only save what you need to reconstruct game state.
2. **Version every save** — `"version": N` in the root of every save object.
3. **Use Dictionary + JSON** (event sheets) or **runtime.storage** (scripting) — not System Save.
4. **Store slot metadata separately** — fast load screen without reading full saves.
5. **Handle errors** — storage can fail on any platform.
6. **Auto-save** — save on key moments (room transitions, after boss fights, on app suspend).
