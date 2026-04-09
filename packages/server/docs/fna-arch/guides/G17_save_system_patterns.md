# G17 — Save System Design Patterns

> **Category:** guide · **Engine:** FNA · **Related:** [G13 SDL3 Storage API](./G13_sdl3_storage_api.md) · [G01 Getting Started](./G01_getting_started.md) · [G08 Cross-Platform Deployment](./G08_cross_platform_deployment.md) · [G11 ECS with MoonTools](./G11_ecs_moontools.md)

How to design a robust save system for FNA games. Covers serialization strategies (JSON, binary, MessagePack), save data versioning and migration, atomic writes for crash safety, slot-based save management, and integration with SDL3 Storage for cross-platform compatibility. This guide focuses on architecture and patterns — for the low-level SDL3 Storage API itself, see [G13](./G13_sdl3_storage_api.md).

---

## Architecture Overview

A save system has four responsibilities:

1. **Serialize** game state into a portable format
2. **Persist** the data to disk (or cloud) safely
3. **Load** and deserialize back into game state
4. **Version** the format so old saves survive game updates

FNA doesn't include a built-in save system — you build one using .NET serialization libraries and SDL3 Storage for cross-platform I/O.

---

## Save Data Model

Define a clear data model that represents your save state. Keep it separate from runtime game objects — your save model should be a plain data transfer object (DTO), not a reference to live entities.

```csharp
// Save data model — pure data, no engine references
public class SaveData
{
    public int Version { get; set; } = 3; // Increment when format changes
    public string SaveName { get; set; } = "";
    public DateTime Timestamp { get; set; }

    // Player state
    public PlayerSaveData Player { get; set; } = new();

    // World state
    public List<ChunkSaveData> Chunks { get; set; } = new();
    public Dictionary<string, bool> Flags { get; set; } = new();

    // Progression
    public List<string> UnlockedAbilities { get; set; } = new();
    public int CurrentLevel { get; set; }
    public TimeSpan PlayTime { get; set; }
}

public class PlayerSaveData
{
    public float X { get; set; }
    public float Y { get; set; }
    public int Health { get; set; }
    public int MaxHealth { get; set; }
    public List<ItemSaveData> Inventory { get; set; } = new();
}

public class ItemSaveData
{
    public string ItemId { get; set; } = ""; // Reference by ID, not object
    public int Quantity { get; set; }
}

public class ChunkSaveData
{
    public int ChunkX { get; set; }
    public int ChunkY { get; set; }
    public byte[] TileData { get; set; } = Array.Empty<byte>();
}
```

### Design Rules

- **Reference by ID, not by object.** Save an item's string ID, not the `Item` instance. Reconstruct references at load time from your item database.
- **No engine types in save data.** Don't save `Vector2`, `Texture2D`, or `Entity` — save floats, strings, and ints. Convert to/from engine types in your load/save logic.
- **Default all fields.** Every property should have a default value so deserialization of older saves with missing fields doesn't produce nulls.
- **Flatten what you can.** Deep nesting makes migration harder. If your player has a weapon with attachments with stats, consider flattening to `List<string> EquippedWeaponIds`.

---

## Serialization Strategies

### JSON with System.Text.Json

Best for development and games where save file readability matters (modding, debugging). Human-readable, but larger files and slower serialization than binary.

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

public static class SaveSerializer
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true, // Readable in dev, set false for release
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingDefault,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() }
    };

    public static byte[] Serialize(SaveData data)
    {
        return JsonSerializer.SerializeToUtf8Bytes(data, Options);
    }

    public static SaveData Deserialize(byte[] bytes)
    {
        return JsonSerializer.Deserialize<SaveData>(bytes, Options)
            ?? new SaveData();
    }
}
```

### MessagePack (Recommended for Release)

Compact binary format with near-JSON ease of use. Install `MessagePack` NuGet package. Smaller files, faster serialization, and the schema is still evolvable (unlike raw `BinaryWriter`).

```csharp
using MessagePack;

// Annotate your save data classes
[MessagePackObject]
public class SaveData
{
    [Key(0)] public int Version { get; set; } = 3;
    [Key(1)] public string SaveName { get; set; } = "";
    [Key(2)] public DateTime Timestamp { get; set; }
    [Key(3)] public PlayerSaveData Player { get; set; } = new();
    [Key(4)] public List<ChunkSaveData> Chunks { get; set; } = new();
    [Key(5)] public Dictionary<string, bool> Flags { get; set; } = new();
    [Key(6)] public List<string> UnlockedAbilities { get; set; } = new();
    [Key(7)] public int CurrentLevel { get; set; }
    [Key(8)] public TimeSpan PlayTime { get; set; }
}

public static class SaveSerializer
{
    public static byte[] Serialize(SaveData data)
    {
        return MessagePackSerializer.Serialize(data);
    }

    public static SaveData Deserialize(byte[] bytes)
    {
        return MessagePackSerializer.Deserialize<SaveData>(bytes);
    }
}
```

### Raw Binary with BinaryWriter/BinaryReader

Maximum control and smallest files, but fragile — any field order change breaks all existing saves. Only use for performance-critical data like large tile maps, not for the whole save file.

```csharp
// Good use of binary: compact tile data inside a larger JSON/MessagePack save
public static byte[] SerializeTileMap(int[,] tiles, int width, int height)
{
    using var ms = new MemoryStream();
    using var bw = new BinaryWriter(ms);
    bw.Write(width);
    bw.Write(height);
    for (int y = 0; y < height; y++)
        for (int x = 0; x < width; x++)
            bw.Write((ushort)tiles[x, y]); // 2 bytes per tile instead of 4
    return ms.ToArray();
}

public static int[,] DeserializeTileMap(byte[] data)
{
    using var ms = new MemoryStream(data);
    using var br = new BinaryReader(ms);
    int width = br.ReadInt32();
    int height = br.ReadInt32();
    var tiles = new int[width, height];
    for (int y = 0; y < height; y++)
        for (int x = 0; x < width; x++)
            tiles[x, y] = br.ReadUInt16();
    return tiles;
}
```

### Strategy Comparison

| Format | File Size | Speed | Readability | Schema Evolution | Best For |
|---|---|---|---|---|---|
| JSON | Large | Slow | Human-readable | Good (missing fields = default) | Dev builds, moddable games |
| MessagePack | Small | Fast | Binary (tooling exists) | Good (keyed fields) | Release builds |
| BinaryWriter | Smallest | Fastest | Opaque | Fragile (order-dependent) | Bulk data (tile maps, terrain) |

---

## Atomic Writes (Crash Safety)

If the game crashes mid-write, a partially written save file is corrupted. Use the write-rename pattern to make saves atomic:

```csharp
public static class SafeFileWriter
{
    /// <summary>
    /// Write data atomically: write to a temp file, then rename over the target.
    /// If the game crashes during write, the original file is untouched.
    /// </summary>
    public static void WriteAtomic(IntPtr userStorage, string path, byte[] data)
    {
        string tempPath = path + ".tmp";

        // Write to temporary file
        SDL3.SDL_WriteStorageFile(userStorage, tempPath, data, (ulong)data.Length);

        // Rename temp over the real file — this is atomic on most filesystems
        SDL3.SDL_RenameStoragePath(userStorage, tempPath, path);
    }
}
```

For platforms that don't support `SDL_RenameStoragePath`, fall back to a three-step approach:

```csharp
// 1. Write new data to save.tmp
// 2. Rename current save.dat to save.bak
// 3. Rename save.tmp to save.dat
// On load: if save.dat is missing but save.bak exists, recover from backup
```

---

## Save Versioning & Migration

Games evolve, and save formats change. Embed a version number and write migration functions:

```csharp
public static class SaveMigrator
{
    public static SaveData LoadAndMigrate(byte[] rawData)
    {
        // Peek at the version field first
        using var doc = JsonDocument.Parse(rawData);
        int version = doc.RootElement.TryGetProperty("version", out var v)
            ? v.GetInt32() : 1;

        // Apply migrations in sequence
        var json = rawData;
        if (version < 2) json = MigrateV1ToV2(json);
        if (version < 3) json = MigrateV2ToV3(json);

        // Now deserialize the current-version data
        return SaveSerializer.Deserialize(json);
    }

    private static byte[] MigrateV1ToV2(byte[] data)
    {
        // V1 → V2: "hp" field renamed to "health", added "maxHealth" default 100
        var node = JsonNode.Parse(data)!;
        var player = node["player"]!;

        if (player["hp"] != null)
        {
            player["health"] = player["hp"]!.GetValue<int>();
            player.AsObject().Remove("hp");
        }
        player["maxHealth"] ??= 100;
        node["version"] = 2;

        return JsonSerializer.SerializeToUtf8Bytes(node);
    }

    private static byte[] MigrateV2ToV3(byte[] data)
    {
        // V2 → V3: inventory changed from string[] to ItemSaveData[]
        var node = JsonNode.Parse(data)!;
        var player = node["player"]!;

        if (player["inventory"] is JsonArray oldInv)
        {
            var newInv = new JsonArray();
            foreach (var item in oldInv)
            {
                newInv.Add(new JsonObject
                {
                    ["itemId"] = item!.GetValue<string>(),
                    ["quantity"] = 1
                });
            }
            player["inventory"] = newInv;
        }
        node["version"] = 3;

        return JsonSerializer.SerializeToUtf8Bytes(node);
    }
}
```

### Migration Rules

- **Never delete migration code.** If V1→V2 exists and V2→V3 exists, a V1 save must go through both. Keep all migrations forever.
- **Migrate on raw JSON/bytes, not on deserialized objects.** Your current `SaveData` class only knows the current version's shape. Operate on `JsonNode` or byte manipulation for old versions.
- **Test migrations with saved test fixtures.** Keep one example save file per version in your test data so you can verify the full migration chain.

---

## Save Slot Management

Most games offer multiple save slots. Here's a simple slot manager:

```csharp
public class SaveSlotManager
{
    private readonly IntPtr _userStorage;
    private const int MaxSlots = 3;

    public SaveSlotManager()
    {
        _userStorage = SDL3.SDL_OpenUserStorage("com.studio", "mygame", 0);
    }

    public string GetSlotPath(int slot) => $"saves/slot_{slot}.sav";
    public string GetMetaPath(int slot) => $"saves/slot_{slot}.meta";

    /// <summary>
    /// Save to a specific slot with metadata for the slot selection screen.
    /// </summary>
    public void Save(int slot, SaveData data)
    {
        data.Timestamp = DateTime.UtcNow;
        byte[] saveBytes = SaveSerializer.Serialize(data);
        SafeFileWriter.WriteAtomic(_userStorage, GetSlotPath(slot), saveBytes);

        // Write lightweight metadata for the slot selection UI
        var meta = new SlotMetadata
        {
            SaveName = data.SaveName,
            Timestamp = data.Timestamp,
            PlayTime = data.PlayTime,
            Level = data.CurrentLevel
        };
        byte[] metaBytes = JsonSerializer.SerializeToUtf8Bytes(meta);
        SDL3.SDL_WriteStorageFile(_userStorage, GetMetaPath(slot), metaBytes, (ulong)metaBytes.Length);
    }

    /// <summary>
    /// Load slot metadata for the save selection screen (fast, small files).
    /// </summary>
    public SlotMetadata? LoadMeta(int slot)
    {
        string path = GetMetaPath(slot);
        if (!SDL3.SDL_GetStorageFileSize(_userStorage, path, out ulong size) || size == 0)
            return null;

        byte[] buffer = new byte[size];
        SDL3.SDL_ReadStorageFile(_userStorage, path, buffer, size);
        return JsonSerializer.Deserialize<SlotMetadata>(buffer);
    }

    /// <summary>
    /// Load full save data from a slot.
    /// </summary>
    public SaveData? Load(int slot)
    {
        string path = GetSlotPath(slot);
        if (!SDL3.SDL_GetStorageFileSize(_userStorage, path, out ulong size) || size == 0)
            return null;

        byte[] buffer = new byte[size];
        SDL3.SDL_ReadStorageFile(_userStorage, path, buffer, size);
        return SaveMigrator.LoadAndMigrate(buffer);
    }

    public void Delete(int slot)
    {
        SDL3.SDL_RemoveStoragePath(_userStorage, GetSlotPath(slot));
        SDL3.SDL_RemoveStoragePath(_userStorage, GetMetaPath(slot));
    }

    public void Dispose()
    {
        SDL3.SDL_CloseStorage(_userStorage);
    }
}

public class SlotMetadata
{
    public string SaveName { get; set; } = "";
    public DateTime Timestamp { get; set; }
    public TimeSpan PlayTime { get; set; }
    public int Level { get; set; }
}
```

### Why Separate Metadata Files?

The save selection screen needs to show slot name, play time, and timestamp for all slots. Loading and deserializing full save files (potentially megabytes each) just to display a menu is wasteful. A small `.meta` file per slot makes the UI snappy.

---

## ECS Integration with MoonTools.ECS

If you're using MoonTools.ECS (see [G11](./G11_ecs_moontools.md)), saving requires extracting component data from the ECS world into your save model. ECS worlds are not directly serializable — you need to iterate entities and map components to save data:

```csharp
public SaveData ExtractSaveData(World world)
{
    var save = new SaveData();

    // Save player entity
    var playerFilter = world.FilterBuilder.Include<Player>().Include<Position>()
        .Include<Health>().Build();
    foreach (var entity in playerFilter.Entities)
    {
        var pos = world.Get<Position>(entity);
        var hp = world.Get<Health>(entity);
        save.Player = new PlayerSaveData
        {
            X = pos.X, Y = pos.Y,
            Health = hp.Current, MaxHealth = hp.Max
        };
    }

    // Save enemy entities
    var enemyFilter = world.FilterBuilder.Include<Enemy>().Include<Position>().Build();
    // ... similar extraction pattern

    return save;
}

public void RestoreSaveData(World world, SaveData save)
{
    // Create player entity from save data
    var player = world.CreateEntity();
    world.Set(player, new Player());
    world.Set(player, new Position(save.Player.X, save.Player.Y));
    world.Set(player, new Health(save.Player.Health, save.Player.MaxHealth));

    // Reconstruct inventory items by ID lookup
    foreach (var item in save.Player.Inventory)
    {
        var itemEntity = world.CreateEntity();
        world.Set(itemEntity, ItemDatabase.Get(item.ItemId));
        world.Set(itemEntity, new InInventory(player));
        world.Set(itemEntity, new StackCount(item.Quantity));
    }
}
```

---

## Checklist

Before shipping your save system, verify:

- **Atomic writes** — kill the process mid-save and confirm the old save survives
- **Migration chain** — load a V1 save in the current build and verify all data arrives
- **Empty/missing fields** — remove a field from a test save file and confirm it defaults gracefully
- **Large saves** — test with maximum inventory, explored chunks, and unlocked content
- **Cross-platform paths** — test on Windows, Linux, and macOS (SDL3 Storage handles this, but verify)
- **Slot deletion** — confirm both `.sav` and `.meta` files are removed
- **Corruption recovery** — write garbage bytes to a save file and confirm the game shows "corrupted save" instead of crashing
