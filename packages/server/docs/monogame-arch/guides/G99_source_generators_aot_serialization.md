# G99 — Source Generators & AOT-Safe Serialization

> **Category:** guide · **Engine:** MonoGame · **Related:** [G13 C# Performance](./G13_csharp_performance.md) · [G69 Save/Load Serialization](./G69_save_load_serialization.md) · [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) · [G88 Dependency Injection](./G88_dependency_injection.md)

How to use C# source generators to eliminate reflection-based serialization in MonoGame projects. Covers AOT-safe JSON serialization with `System.Text.Json`, source-generated save/load systems, and patterns for making your entire game pipeline compatible with NativeAOT publishing.

---

## Why This Matters for MonoGame

MonoGame projects increasingly target **NativeAOT** (see [G81](./G81_nativeaot_publishing.md)) for faster startup, smaller binaries, and console deployment. NativeAOT's key restriction: **no runtime reflection or dynamic code generation**. This breaks most serialization libraries that rely on `System.Reflection` to inspect types at runtime.

C# source generators solve this by generating serialization code **at compile time** — the output is plain C# that the AOT compiler can statically analyze. No reflection, no runtime code generation, no trimming surprises.

```
Traditional (reflection):     Source-generated (AOT-safe):
┌─────────────┐               ┌─────────────┐
│  Runtime     │               │  Compile     │
│  Reflection  │──→ Serialize  │  Time Gen    │──→ Serialize
│  (slow, AOT  │               │  (fast, AOT  │
│   unsafe)    │               │   safe)      │
└─────────────┘               └─────────────┘
```

---

## System.Text.Json Source Generation

Since .NET 6, `System.Text.Json` supports source-generated serialization contexts. This is the recommended approach for MonoGame save/load systems targeting AOT.

### Step 1: Define Your Save Data Types

```csharp
public sealed class SaveData
{
    public int Version { get; set; } = 1;
    public string PlayerName { get; set; } = "";
    public Vector2Dto PlayerPosition { get; set; } = new();
    public List<InventorySlot> Inventory { get; set; } = new();
    public Dictionary<string, bool> Flags { get; set; } = new();
    public DateTime SavedAt { get; set; }
}

// MonoGame's Vector2 is not JSON-friendly out of the box.
// Use a DTO and convert at the boundary.
public struct Vector2Dto
{
    public float X { get; set; }
    public float Y { get; set; }

    public Vector2 ToVector2() => new(X, Y);
    public static Vector2Dto FromVector2(Vector2 v) => new() { X = v.X, Y = v.Y };
}

public sealed class InventorySlot
{
    public string ItemId { get; set; } = "";
    public int Count { get; set; }
}
```

### Step 2: Create a Serialization Context

The `[JsonSerializable]` attribute tells the source generator which types to generate serialization code for. You must list every type (and generic specialization) that appears in your save data graph.

```csharp
using System.Text.Json.Serialization;

[JsonSourceGenerationOptions(
    WriteIndented = true,
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(SaveData))]
[JsonSerializable(typeof(Vector2Dto))]
[JsonSerializable(typeof(InventorySlot))]
[JsonSerializable(typeof(List<InventorySlot>))]
[JsonSerializable(typeof(Dictionary<string, bool>))]
public partial class SaveDataContext : JsonSerializerContext
{
    // The source generator fills this class at compile time.
    // No hand-written code needed here.
}
```

### Step 3: Serialize and Deserialize

```csharp
using System.Text.Json;

public static class SaveSystem
{
    private static readonly string SaveDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                     "MyGame", "saves");

    public static void Save(SaveData data, string slotName = "save1")
    {
        Directory.CreateDirectory(SaveDir);
        string path = Path.Combine(SaveDir, $"{slotName}.json");

        // Use the source-generated context — no reflection
        string json = JsonSerializer.Serialize(data, SaveDataContext.Default.SaveData);
        File.WriteAllText(path, json);
    }

    public static SaveData? Load(string slotName = "save1")
    {
        string path = Path.Combine(SaveDir, $"{slotName}.json");
        if (!File.Exists(path)) return null;

        string json = File.ReadAllText(path);
        return JsonSerializer.Deserialize(json, SaveDataContext.Default.SaveData);
    }
}
```

The key line is `SaveDataContext.Default.SaveData` — this passes the pre-generated type metadata instead of relying on runtime reflection. This code works identically under JIT and NativeAOT.

---

## Handling MonoGame Types

MonoGame's math types (`Vector2`, `Rectangle`, `Color`, etc.) use fields, not properties, and don't have parameterless constructors that `System.Text.Json` expects. Three options:

### Option A: DTOs at the Boundary (Recommended)

Define simple DTO structs (as shown above) and convert at serialization boundaries. This is the simplest approach and keeps your game logic using real MonoGame types.

### Option B: Custom JsonConverter with Source Gen

Write a custom converter for each MonoGame type, then register it on the context:

```csharp
public sealed class Vector2Converter : JsonConverter<Vector2>
{
    public override Vector2 Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions opts)
    {
        reader.Read(); // StartObject
        reader.Read(); float x = reader.GetSingle(); // x value
        reader.Read(); reader.Read(); float y = reader.GetSingle(); // y value
        reader.Read(); // EndObject
        return new Vector2(x, y);
    }

    public override void Write(Utf8JsonWriter writer, Vector2 value, JsonSerializerOptions opts)
    {
        writer.WriteStartObject();
        writer.WriteNumber("x", value.X);
        writer.WriteNumber("y", value.Y);
        writer.WriteEndObject();
    }
}

// Register on the context options
[JsonSourceGenerationOptions(Converters = new[] { typeof(Vector2Converter) })]
[JsonSerializable(typeof(SaveData))]
public partial class SaveDataContext : JsonSerializerContext { }
```

### Option C: MemoryPack (Zero-Copy, Source-Generated)

For binary save formats where human readability is not needed, [MemoryPack](https://github.com/Cysharp/MemoryPack) is a source-generated binary serializer. It generates serialization code at compile time and produces compact, zero-copy output.

```csharp
using MemoryPack;

[MemoryPackable]
public partial class SaveData
{
    public int Version { get; set; }
    public string PlayerName { get; set; } = "";
    public float PlayerX { get; set; } // Flatten Vector2 to primitives
    public float PlayerY { get; set; }
}

// Serialize
byte[] bytes = MemoryPackSerializer.Serialize(saveData);

// Deserialize
SaveData? loaded = MemoryPackSerializer.Deserialize<SaveData>(bytes);
```

MemoryPack is fully AOT-safe and significantly faster than JSON for large save files (e.g., procedural world data).

---

## Source Generators for Game Configuration

Beyond save/load, source generators can eliminate boilerplate in other areas:

### Auto-Generating Content Manifest Entries

If you have many content assets, a source generator can scan your content directory at build time and produce a strongly-typed manifest class — no more magic strings for `Content.Load<T>("path")`.

```csharp
// Generated by a custom source generator at compile time:
public static class Assets
{
    public static class Textures
    {
        public const string Player = "textures/player";
        public const string Enemy = "textures/enemy";
        public const string Tileset = "textures/tileset";
    }

    public static class Sounds
    {
        public const string Jump = "sounds/jump";
        public const string Hit = "sounds/hit";
    }
}

// Usage — compile-time checked, no typos
var tex = Content.Load<Texture2D>(Assets.Textures.Player);
```

### Enum-to-String Without Reflection

The `NetEscapades.EnumGenerators` NuGet package generates fast, AOT-safe `ToString()`, `TryParse()`, and `IsDefined()` methods for enums — useful for debug displays and configuration files.

```csharp
using NetEscapades.EnumGenerators;

[EnumExtensions]
public enum GameState { MainMenu, Playing, Paused, GameOver }

// Generated extension method — no Enum.ToString() reflection
string name = GameState.Playing.ToStringFast(); // "Playing"
```

---

## Trimming and Publish Configuration

When publishing with NativeAOT or trimming enabled, add these properties to your `.csproj` to avoid surprises:

```xml
<PropertyGroup>
    <PublishAot>true</PublishAot>
    <!-- Suppress trimming warnings for types you know are safe -->
    <SuppressTrimAnalysisWarnings>false</SuppressTrimAnalysisWarnings>
    <!-- Enable trim analysis so the compiler warns about reflection usage -->
    <EnableTrimAnalyzer>true</EnableTrimAnalyzer>
    <JsonSerializerIsReflectionEnabledByDefault>false</JsonSerializerIsReflectionEnabledByDefault>
</PropertyGroup>
```

Setting `JsonSerializerIsReflectionEnabledByDefault` to `false` ensures that any accidental use of reflection-based JSON serialization throws at runtime rather than silently producing wrong results.

---

## Checklist: AOT-Safe Serialization

```
✅ All serialized types listed in [JsonSerializable] context
✅ MonoGame math types converted via DTOs or custom converters
✅ No Newtonsoft.Json (reflection-only, not AOT-compatible)
✅ No BinaryFormatter (deprecated and unsafe)
✅ EnableTrimAnalyzer = true in .csproj
✅ Tested with PublishAot=true before release build
✅ Save/load round-trip unit tests pass under AOT
```

---

## Further Reading

- [System.Text.Json Source Generation — Microsoft Docs](https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation)
- [MemoryPack — GitHub](https://github.com/Cysharp/MemoryPack)
- [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) — end-to-end AOT publish workflow
- [G69 Save/Load Serialization](./G69_save_load_serialization.md) — general serialization patterns
