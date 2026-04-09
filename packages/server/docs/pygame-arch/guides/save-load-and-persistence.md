# Save/Load and Data Persistence

> **Category:** guide · **Engine:** Pygame · **Related:** [game-loop-and-state](../architecture/game-loop-and-state.md), [pygame-arch-rules](../pygame-arch-rules.md)

Pygame provides no built-in save system — you design your own. This guide covers the standard patterns for serializing game state, managing save slots, and handling config/settings files in Pygame and pygame-ce projects.

---

## Choosing a Serialization Format

| Format | Pros | Cons | Best for |
|--------|------|------|----------|
| **JSON** | Human-readable, cross-language, safe | No custom objects, no tuples/sets natively | Save files, config, leaderboards |
| **shelve** | Dict-like API, stores Python objects | Platform-dependent binary format | Quick prototyping, local-only saves |
| **pickle** | Handles any Python object | **Security risk** (arbitrary code execution), brittle across versions | Internal caches, never user-facing |
| **SQLite** | Relational queries, ACID, built-in | Overkill for simple games | Complex RPGs, large inventories |

**Recommendation:** Use **JSON** for save files and configuration. It is safe, portable, human-debuggable, and works across Python versions. Reserve pickle/shelve for throwaway prototypes only.

---

## Core Pattern: to_dict / from_dict

Give every saveable object a `to_dict()` method that returns plain Python types (dicts, lists, strings, numbers, bools) and a `from_dict()` classmethod that reconstructs the object.

```python
import pygame

class Player:
    def __init__(self, name: str, pos: tuple[float, float], hp: int = 100):
        self.name = name
        self.pos = pygame.math.Vector2(pos)
        self.hp = hp
        self.inventory: list[str] = []

    def to_dict(self) -> dict:
        """Serialize to JSON-safe dictionary."""
        return {
            "name": self.name,
            "pos": [self.pos.x, self.pos.y],
            "hp": self.hp,
            "inventory": list(self.inventory),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Player":
        """Reconstruct from saved dictionary."""
        player = cls(
            name=data["name"],
            pos=(data["pos"][0], data["pos"][1]),
            hp=data["hp"],
        )
        player.inventory = data.get("inventory", [])
        return player
```

### Why not pickle the objects directly?

- Pickle executes arbitrary code on load — a tampered save file can compromise the player's machine.
- Pickle breaks when you rename or move classes between versions.
- JSON dicts are inspectable with any text editor, making debugging easy.

---

## Save Manager

A central `SaveManager` handles file I/O, slot management, and error recovery.

```python
import json
import os
from datetime import datetime

SAVE_DIR = os.path.join(os.path.expanduser("~"), ".mygame", "saves")

class SaveManager:
    """Manages multiple save slots with JSON serialization."""

    def __init__(self, save_dir: str = SAVE_DIR, max_slots: int = 10):
        self.save_dir = save_dir
        self.max_slots = max_slots
        os.makedirs(save_dir, exist_ok=True)

    def _slot_path(self, slot: int) -> str:
        return os.path.join(self.save_dir, f"save_{slot:02d}.json")

    def save(self, slot: int, game_state: dict) -> bool:
        """Write game state to a numbered slot.

        game_state should contain only JSON-serializable values.
        Returns True on success, False on failure.
        """
        if not 0 <= slot < self.max_slots:
            raise ValueError(f"Slot must be 0-{self.max_slots - 1}")

        # Add metadata the player didn't provide
        game_state["_meta"] = {
            "version": "1.0.0",
            "timestamp": datetime.now().isoformat(),
            "slot": slot,
        }

        path = self._slot_path(slot)
        tmp_path = path + ".tmp"
        try:
            # Write to temp file first, then rename (atomic on most OS)
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(game_state, f, indent=2, ensure_ascii=False)
            os.replace(tmp_path, path)  # atomic rename
            return True
        except (OSError, TypeError) as e:
            print(f"Save failed: {e}")
            # Clean up partial write
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            return False

    def load(self, slot: int) -> dict | None:
        """Load game state from a slot. Returns None if missing/corrupt."""
        path = self._slot_path(slot)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        except (json.JSONDecodeError, OSError) as e:
            print(f"Load failed for slot {slot}: {e}")
            return None

    def list_slots(self) -> list[dict]:
        """Return metadata for all occupied save slots."""
        slots = []
        for i in range(self.max_slots):
            data = self.load(i)
            if data and "_meta" in data:
                slots.append(data["_meta"])
        return slots

    def delete(self, slot: int) -> bool:
        """Delete a save slot."""
        path = self._slot_path(slot)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False
```

### Key design decisions

- **Atomic writes** — Write to a `.tmp` file, then `os.replace()` to the final path. This prevents corruption if the game crashes mid-write.
- **Version metadata** — Every save includes a `_meta.version` field so you can migrate old saves when you change the format.
- **No pickle, no eval** — `json.load()` cannot execute arbitrary code.

---

## Composing the Save Snapshot

Gather all saveable state into a single dictionary before passing it to `SaveManager.save()`:

```python
class Game:
    def __init__(self):
        self.player = Player("Hero", (100, 200))
        self.world_seed = 42
        self.current_level = "forest"
        self.elapsed_time = 0.0
        self.flags: dict[str, bool] = {}
        self.save_manager = SaveManager()

    def create_save_snapshot(self) -> dict:
        """Collect all game state into a JSON-safe dict."""
        return {
            "player": self.player.to_dict(),
            "world_seed": self.world_seed,
            "current_level": self.current_level,
            "elapsed_time": self.elapsed_time,
            "flags": dict(self.flags),
        }

    def apply_save_snapshot(self, data: dict):
        """Restore game state from a loaded dict."""
        self.player = Player.from_dict(data["player"])
        self.world_seed = data["world_seed"]
        self.current_level = data["current_level"]
        self.elapsed_time = data.get("elapsed_time", 0.0)
        self.flags = data.get("flags", {})

    def save_game(self, slot: int):
        snapshot = self.create_save_snapshot()
        if self.save_manager.save(slot, snapshot):
            print(f"Saved to slot {slot}")
        else:
            print("Save failed!")

    def load_game(self, slot: int) -> bool:
        data = self.save_manager.load(slot)
        if data is None:
            print(f"No save in slot {slot}")
            return False
        self.apply_save_snapshot(data)
        return True
```

---

## Save-File Versioning and Migration

When you change the save format between game versions, use a migration function:

```python
def migrate_save(data: dict) -> dict:
    """Upgrade old save formats to the current version."""
    version = data.get("_meta", {}).get("version", "0.0.0")

    if version < "1.1.0":
        # v1.0 -> v1.1: inventory was a list of strings,
        # now it's a list of dicts with "id" and "count"
        if "player" in data:
            old_inv = data["player"].get("inventory", [])
            data["player"]["inventory"] = [
                {"id": item, "count": 1} for item in old_inv
            ]

    if version < "1.2.0":
        # v1.1 -> v1.2: added "difficulty" field
        data.setdefault("difficulty", "normal")

    data["_meta"]["version"] = "1.2.0"
    return data

# In load path:
data = save_manager.load(slot)
if data:
    data = migrate_save(data)
    game.apply_save_snapshot(data)
```

---

## Settings / Configuration File

Player preferences (volume, keybinds, resolution) should be separate from save files — they persist across all playthroughs.

```python
import json
import os

CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".mygame", "config.json")

DEFAULT_CONFIG = {
    "music_volume": 0.7,
    "sfx_volume": 1.0,
    "fullscreen": False,
    "resolution": [1280, 720],
    "keybinds": {
        "jump": "K_SPACE",
        "attack": "K_z",
    },
}

def load_config() -> dict:
    """Load config, falling back to defaults for missing keys."""
    config = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                user = json.load(f)
            # Merge user settings over defaults (preserves new keys)
            config.update(user)
        except (json.JSONDecodeError, OSError):
            pass  # corrupted config — use defaults
    return config

def save_config(config: dict):
    """Write config to disk."""
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
```

---

## Autosave

Trigger autosaves at safe points (level transitions, checkpoints) rather than on a timer to avoid saving mid-action:

```python
class Game:
    AUTOSAVE_SLOT = 0  # reserve slot 0 for autosave

    def on_level_transition(self, next_level: str):
        """Called when the player moves to a new level."""
        self.current_level = next_level
        self.save_game(self.AUTOSAVE_SLOT)
        self.load_level(next_level)
```

---

## Quick Reference

| Task | Pattern |
|------|---------|
| Serialize game objects | `to_dict()` / `from_dict()` on each class |
| File format | JSON (`json.dump` / `json.load`) |
| Atomic writes | Write `.tmp`, then `os.replace()` |
| Save versioning | `_meta.version` + migration function |
| Config vs saves | Separate files, separate directories |
| Security | Never use `pickle` for user-facing save files |
| Autosave | Trigger at checkpoints, use a reserved slot |
| pygame-ce note | No differences — save/load is pure Python, engine-agnostic |
