# G6 — Save & Load System in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Scene Management](G1_scene_management.md) · [Unity Rules](../unity-arch-rules.md)

Persisting game state — player progress, world data, settings — is fundamental to almost every game. Unity 6 provides several serialization paths, each suited to different data shapes and project scales. This guide covers the practical patterns, from simple settings to full game-state persistence, with emphasis on **the JSON file-based approach** that scales from prototypes to shipped titles.

---

## Choosing a Persistence Strategy

| Strategy | Best For | Limitations |
|----------|----------|-------------|
| `PlayerPrefs` | Tiny key-value data (volume, language, display mode) | No structured data; stored in platform-specific registries; easy to tamper with |
| `JsonUtility` + file I/O | Most game save data (inventory, stats, quest flags) | Cannot serialize `Dictionary`, polymorphic types, or private fields without `[SerializeField]` |
| Newtonsoft `Json.NET` | Complex object graphs, dictionaries, polymorphism | External package; slightly larger than `JsonUtility` |
| Binary (`BinaryFormatter`) | **Avoid** — security vulnerability, deprecated | Never use for player-facing saves; deserialization attacks are trivial |
| SQLite / custom binary | Very large worlds, streaming saves, MMO-scale | Extra complexity; typically overkill for single-player |

**Rule of thumb:** Use `PlayerPrefs` for preferences. Use JSON files for everything else. Start with `JsonUtility` — upgrade to `Json.NET` only when you need dictionaries or polymorphism.

---

## Core Architecture: Separating Data from Logic

The key insight is that **save data should be a plain serializable class** — not a MonoBehaviour, not a ScriptableObject. This keeps your save format independent of your scene hierarchy.

```
┌────────────────────────────────────────────┐
│               Runtime Systems               │
│  PlayerHealth · Inventory · QuestTracker    │
│         (MonoBehaviours / Systems)          │
├────────────────────────────────────────────┤
│          ▲ Populate()  │  Apply()  ▼        │
├────────────────────────────────────────────┤
│              SaveData (POCO class)          │
│  Plain C# class with [Serializable]        │
│  No Unity references — pure data           │
├────────────────────────────────────────────┤
│          ▲ Load()      │  Save()   ▼        │
├────────────────────────────────────────────┤
│            SaveManager (file I/O)           │
│  Serializes ↔ JSON ↔ disk                  │
└────────────────────────────────────────────┘
```

**Why this layering?**
- Runtime systems own gameplay state (HP, items, quest progress)
- `SaveData` is a snapshot — a POCO (Plain Old C# Object) that captures state at a point in time
- `SaveManager` handles serialization and file I/O — systems don't know about files
- Each layer is testable independently

---

## Step 1: Define the Save Data Class

```csharp
using System;
using System.Collections.Generic;
using UnityEngine;

// WHY [Serializable]: JsonUtility requires this attribute to serialize a class.
// WHY no MonoBehaviour: Save data should be scene-independent — just data.
[Serializable]
public class SaveData
{
    // WHY: Version number lets you detect and migrate old save files
    // when your data structure changes between updates.
    public int saveVersion = 1;

    // Player state
    public string playerName;
    public int level;
    public int experience;
    public int currentHealth;
    public int maxHealth;
    public float[] position = new float[3]; // WHY float[]: Vector3 is not serializable by JsonUtility

    // Inventory — stored as a list of serializable structs
    public List<SavedItem> inventory = new();

    // Quest progress
    public List<SavedQuest> quests = new();

    // World time / day counter
    public float playTimeSeconds;
    public int dayCount;

    // Timestamp for save file display
    public string savedAt;
}

[Serializable]
public struct SavedItem
{
    public string itemId;   // WHY string ID: References a ScriptableObject by name, not direct reference
    public int quantity;
    public int durability;
}

[Serializable]
public struct SavedQuest
{
    public string questId;
    public int stage;       // 0 = not started, 1+ = in progress, -1 = completed
    public bool isCompleted;
}
```

### Key Rules for Save Data Classes

1. **Use `[Serializable]`** on the class and any nested types
2. **Use public fields** — `JsonUtility` ignores properties and private fields (unless marked `[SerializeField]`)
3. **Avoid Unity types** — use `float[]` instead of `Vector3`, `string` IDs instead of direct asset references
4. **Include a version number** — you will change the format; old saves need migration
5. **Use `List<T>` not arrays** when the collection size varies — `JsonUtility` supports `List<T>` natively

---

## Step 2: Build the Save Manager

```csharp
using System;
using System.IO;
using UnityEngine;

/// <summary>
/// Handles serialization and file I/O for save data.
/// WHY static methods: SaveManager is a stateless utility — no instance needed.
/// For dependency-injection projects, wrap this in an interface instead.
/// </summary>
public static class SaveManager
{
    // WHY persistentDataPath: This is the only path guaranteed to be writable
    // on all platforms (Windows, Mac, Linux, iOS, Android, consoles).
    // On Windows: C:/Users/{user}/AppData/LocalLow/{company}/{product}/
    // On Android: /data/data/{package}/files/
    private static string SaveDirectory => Application.persistentDataPath;

    private static string GetSavePath(int slotIndex)
    {
        return Path.Combine(SaveDirectory, $"save_{slotIndex}.json");
    }

    /// <summary>
    /// Serialize SaveData to JSON and write to disk.
    /// </summary>
    public static bool Save(SaveData data, int slotIndex = 0)
    {
        try
        {
            // WHY: Stamp the save time so the UI can display "Last saved: ..."
            data.savedAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");

            // WHY prettyPrint=true during development: makes saves human-readable for debugging.
            // Set to false in release builds to save disk space and reduce parse time.
            string json = JsonUtility.ToJson(data, prettyPrint: Debug.isDebugBuild);

            // WHY: Write to a temp file first, then rename. This prevents corruption
            // if the game crashes mid-write — the old save remains intact.
            string tempPath = GetSavePath(slotIndex) + ".tmp";
            string finalPath = GetSavePath(slotIndex);

            File.WriteAllText(tempPath, json);

            // Atomic-ish rename: if finalPath exists, delete first (required on Windows)
            if (File.Exists(finalPath))
                File.Delete(finalPath);

            File.Move(tempPath, finalPath);

            Debug.Log($"[SaveManager] Saved to slot {slotIndex} at {finalPath}");
            return true;
        }
        catch (Exception ex)
        {
            Debug.LogError($"[SaveManager] Save failed: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// Read JSON from disk and deserialize to SaveData.
    /// </summary>
    public static SaveData Load(int slotIndex = 0)
    {
        string path = GetSavePath(slotIndex);

        if (!File.Exists(path))
        {
            Debug.LogWarning($"[SaveManager] No save file at slot {slotIndex}");
            return null;
        }

        try
        {
            string json = File.ReadAllText(path);
            SaveData data = JsonUtility.FromJson<SaveData>(json);

            // WHY: Version check enables migration. If the loaded version
            // is older than the current format, run migration logic.
            if (data.saveVersion < 1)
            {
                Debug.LogWarning("[SaveManager] Old save format — migrating");
                MigrateSaveData(data);
            }

            return data;
        }
        catch (Exception ex)
        {
            Debug.LogError($"[SaveManager] Load failed: {ex.Message}");
            return null;
        }
    }

    /// <summary>Check whether a save file exists for a given slot.</summary>
    public static bool SaveExists(int slotIndex = 0)
    {
        return File.Exists(GetSavePath(slotIndex));
    }

    /// <summary>Delete a save file.</summary>
    public static void DeleteSave(int slotIndex = 0)
    {
        string path = GetSavePath(slotIndex);
        if (File.Exists(path))
            File.Delete(path);
    }

    /// <summary>
    /// Migrate old save formats to the current version.
    /// WHY: Your save data WILL change between updates. Migration
    /// functions keep players from losing progress.
    /// </summary>
    private static void MigrateSaveData(SaveData data)
    {
        // Example: version 0 didn't have quests — initialize the list
        data.quests ??= new();
        data.saveVersion = 1;
    }
}
```

---

## Step 3: Populate and Apply Save Data

Each gameplay system is responsible for **writing its state into** and **reading its state from** the `SaveData` snapshot. This keeps save logic distributed and avoids a god class.

```csharp
/// <summary>
/// Interface for any system that participates in save/load.
/// WHY interface: Decouples save logic from implementation.
/// Any MonoBehaviour can opt-in without inheritance.
/// </summary>
public interface ISaveable
{
    /// <summary>Write current state into the save data snapshot.</summary>
    void PopulateSaveData(SaveData data);

    /// <summary>Restore state from a loaded save data snapshot.</summary>
    void ApplySaveData(SaveData data);
}
```

```csharp
using UnityEngine;

/// <summary>
/// Example: the player controller implements ISaveable to persist
/// position, health, and level between sessions.
/// </summary>
public class PlayerController : MonoBehaviour, ISaveable
{
    public int Level { get; private set; } = 1;
    public int Experience { get; private set; } = 0;
    public int CurrentHealth { get; private set; } = 100;
    public int MaxHealth { get; private set; } = 100;

    // --- ISaveable implementation ---

    public void PopulateSaveData(SaveData data)
    {
        // WHY float[]: JsonUtility cannot serialize Vector3 directly.
        // We convert to a float array for portable, version-safe storage.
        var pos = transform.position;
        data.position[0] = pos.x;
        data.position[1] = pos.y;
        data.position[2] = pos.z;

        data.level = Level;
        data.experience = Experience;
        data.currentHealth = CurrentHealth;
        data.maxHealth = MaxHealth;
    }

    public void ApplySaveData(SaveData data)
    {
        transform.position = new Vector3(
            data.position[0],
            data.position[1],
            data.position[2]
        );

        Level = data.level;
        Experience = data.experience;
        CurrentHealth = data.currentHealth;
        MaxHealth = data.maxHealth;
    }
}
```

---

## Step 4: Orchestrate Save/Load from a Game Manager

```csharp
using System.Linq;
using UnityEngine;

/// <summary>
/// Central orchestrator for save/load. Finds all ISaveable components
/// in the scene and coordinates the snapshot flow.
/// </summary>
public class GameManager : MonoBehaviour
{
    [SerializeField] private int saveSlot = 0;

    public void SaveGame()
    {
        var data = new SaveData();

        // WHY FindObjectsByType: Unity 6 replacement for FindObjectsOfType.
        // Sorted mode is not needed here — we just want all ISaveables.
        var saveables = FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None)
            .OfType<ISaveable>();

        foreach (var saveable in saveables)
            saveable.PopulateSaveData(data);

        SaveManager.Save(data, saveSlot);
    }

    public void LoadGame()
    {
        SaveData data = SaveManager.Load(saveSlot);
        if (data == null) return;

        var saveables = FindObjectsByType<MonoBehaviour>(FindObjectsSortMode.None)
            .OfType<ISaveable>();

        foreach (var saveable in saveables)
            saveable.ApplySaveData(data);
    }
}
```

---

## Async Save/Load (Preventing Frame Hitches)

For large save files or mobile targets, synchronous `File.ReadAllText` / `File.WriteAllText` can cause noticeable frame hitches. Use `async/await` with `StreamReader` / `StreamWriter` for non-blocking I/O.

```csharp
using System.IO;
using System.Threading.Tasks;
using UnityEngine;

public static class AsyncSaveManager
{
    private static string GetSavePath(int slot)
        => Path.Combine(Application.persistentDataPath, $"save_{slot}.json");

    /// <summary>
    /// Async save — does not block the main thread during disk write.
    /// WHY async: On mobile and consoles, disk I/O can take 50-200ms.
    /// Blocking the main thread causes visible frame drops.
    /// </summary>
    public static async Task<bool> SaveAsync(SaveData data, int slot = 0)
    {
        try
        {
            string json = JsonUtility.ToJson(data);
            string path = GetSavePath(slot);

            // WHY StreamWriter with FlushAsync: Writes asynchronously,
            // preventing main-thread stalls on slow storage.
            await using var writer = new StreamWriter(path);
            await writer.WriteAsync(json);
            await writer.FlushAsync();

            return true;
        }
        catch (System.Exception ex)
        {
            Debug.LogError($"[AsyncSaveManager] Save failed: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// Async load — reads save file without blocking the main thread.
    /// </summary>
    public static async Task<SaveData> LoadAsync(int slot = 0)
    {
        string path = GetSavePath(slot);
        if (!File.Exists(path)) return null;

        try
        {
            using var reader = new StreamReader(path);
            string json = await reader.ReadToEndAsync();

            // WHY FromJson on main thread: JsonUtility must run on the
            // Unity main thread. Only the file I/O is async.
            return JsonUtility.FromJson<SaveData>(json);
        }
        catch (System.Exception ex)
        {
            Debug.LogError($"[AsyncSaveManager] Load failed: {ex.Message}");
            return null;
        }
    }
}
```

### Calling Async from MonoBehaviour

```csharp
// WHY async void: Unity event methods (button callbacks) can't return Task.
// This is the one acceptable use of async void in Unity — fire-and-forget UI actions.
public async void OnSaveButtonPressed()
{
    saveButton.interactable = false;      // Prevent double-tap
    bool success = await AsyncSaveManager.SaveAsync(data, saveSlot);
    saveButton.interactable = true;

    statusText.text = success ? "Game Saved!" : "Save Failed!";
}
```

---

## PlayerPrefs: Only for Settings

`PlayerPrefs` is appropriate **only** for simple user preferences — not game state.

```csharp
/// <summary>
/// WHY separate settings from save data: Settings (volume, resolution, language)
/// are user preferences that apply globally. Game state (HP, inventory, quest
/// progress) is per-save-slot. Mixing them causes confusion and data loss.
/// </summary>
public static class SettingsManager
{
    public static float MasterVolume
    {
        get => PlayerPrefs.GetFloat("MasterVolume", 1f);
        set
        {
            PlayerPrefs.SetFloat("MasterVolume", value);
            PlayerPrefs.Save(); // WHY: Flush immediately — PlayerPrefs writes are batched otherwise
        }
    }

    public static int QualityLevel
    {
        get => PlayerPrefs.GetInt("QualityLevel", QualitySettings.GetQualityLevel());
        set
        {
            PlayerPrefs.SetInt("QualityLevel", value);
            QualitySettings.SetQualityLevel(value);
            PlayerPrefs.Save();
        }
    }

    public static bool IsFullscreen
    {
        get => PlayerPrefs.GetInt("Fullscreen", 1) == 1;
        set
        {
            PlayerPrefs.SetInt("Fullscreen", value ? 1 : 0);
            Screen.fullScreen = value;
            PlayerPrefs.Save();
        }
    }
}
```

---

## Save Data Encryption (Optional)

For games where save tampering matters (leaderboards, achievements, competitive modes), add a simple encryption layer. This is **not** security against determined attackers — just a deterrent against casual file editors.

```csharp
using System;
using System.Security.Cryptography;
using System.Text;

public static class SaveEncryption
{
    // WHY: XOR-based or simple AES is fine for save files.
    // The goal is to prevent casual editing in Notepad, not to
    // withstand a determined reverse engineer.
    private static readonly byte[] Key = Encoding.UTF8.GetBytes("YourGame16ByteK!"); // 16 bytes = AES-128

    public static string Encrypt(string plainText)
    {
        using var aes = Aes.Create();
        aes.Key = Key;
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor();
        byte[] plainBytes = Encoding.UTF8.GetBytes(plainText);
        byte[] cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

        // WHY: Prepend the IV to the cipher text so we can decrypt later.
        // Each save gets a unique IV, preventing pattern analysis.
        byte[] result = new byte[aes.IV.Length + cipherBytes.Length];
        Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
        Buffer.BlockCopy(cipherBytes, 0, result, aes.IV.Length, cipherBytes.Length);

        return Convert.ToBase64String(result);
    }

    public static string Decrypt(string cipherText)
    {
        byte[] fullCipher = Convert.FromBase64String(cipherText);

        using var aes = Aes.Create();
        aes.Key = Key;

        byte[] iv = new byte[aes.BlockSize / 8];
        byte[] cipher = new byte[fullCipher.Length - iv.Length];
        Buffer.BlockCopy(fullCipher, 0, iv, 0, iv.Length);
        Buffer.BlockCopy(fullCipher, iv.Length, cipher, 0, cipher.Length);

        aes.IV = iv;
        using var decryptor = aes.CreateDecryptor();
        byte[] plainBytes = decryptor.TransformFinalBlock(cipher, 0, cipher.Length);
        return Encoding.UTF8.GetString(plainBytes);
    }
}
```

---

## Common Pitfalls

1. **Don't use `BinaryFormatter`** — it has known security vulnerabilities (arbitrary code execution via crafted save files) and is deprecated in .NET
2. **Don't serialize Unity object references** — `Texture2D`, `GameObject`, `ScriptableObject` references cannot survive serialization. Use string IDs that map to assets via a registry or Addressables
3. **Don't skip version numbers** — your save format will change. Without a version field, you can't distinguish old saves from corrupted ones
4. **Don't write directly to the final path** — use a temp file + rename to prevent corruption on crash (see the `Save()` method above)
5. **Don't save every frame** — autosave on meaningful events (level complete, checkpoint, inventory change) or on a timer (every 60–120 seconds)
6. **Don't forget mobile platform limits** — iOS and Android have storage quotas. Keep saves compact and clean up old autosave slots
7. **Don't store absolute paths in save data** — paths change across platforms and installs. Store relative identifiers (scene name, item ID) instead

---

## Autosave Pattern

```csharp
using UnityEngine;

/// <summary>
/// Triggers autosave at regular intervals and on key gameplay events.
/// WHY: Players forget to save. Autosave prevents frustrating progress loss
/// without requiring the player to manage save slots manually.
/// </summary>
public class AutoSaveController : MonoBehaviour
{
    [SerializeField] private float autosaveIntervalSeconds = 120f;
    [SerializeField] private GameManager gameManager;

    private float _timeSinceLastSave;

    private void Update()
    {
        _timeSinceLastSave += Time.unscaledDeltaTime; // WHY unscaled: autosave should work even when game is paused/slowed

        if (_timeSinceLastSave >= autosaveIntervalSeconds)
        {
            gameManager.SaveGame();
            _timeSinceLastSave = 0f;
        }
    }

    /// <summary>Call from event-driven triggers (quest complete, boss defeated, etc.)</summary>
    public void TriggerEventSave()
    {
        gameManager.SaveGame();
        _timeSinceLastSave = 0f; // Reset timer so we don't double-save
    }
}
```

---

## Quick Reference: When to Use What

| Scenario | Approach |
|----------|----------|
| Volume slider, language, display mode | `PlayerPrefs` |
| Player stats, inventory, quest progress | JSON file via `JsonUtility` |
| Complex object graphs, dictionaries | JSON file via Newtonsoft `Json.NET` |
| Large open-world state (100k+ entities) | SQLite or custom binary format |
| Cloud saves (Steam, consoles) | Platform SDK → serialize to byte array → upload |
| Competitive / anti-cheat saves | Server-authoritative; client saves are cosmetic only |
