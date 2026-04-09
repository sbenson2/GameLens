# G13 — SDL3 Storage API: Modern Data Persistence for FNA Games

> **Category:** guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [G08 Cross-Platform Deployment](./G08_cross_platform_deployment.md) · [G10 Debugging & Profiling](./G10_debugging_profiling_performance.md)

FNA 25.03 made SDL3 the default platform, and with it comes `SDL_Storage` — a new cross-platform storage API that replaces the legacy `Microsoft.Xna.Framework.Storage` namespace. This guide covers why you should migrate, how the SDL3 Storage API works, how to use it from FNA via the included C# bindings, and patterns for save systems, cloud saves, and console-compatible storage.

---

## Why Migrate from XNA Storage?

The `Microsoft.Xna.Framework.Storage` API was designed for Xbox 360's storage device model (memory units, hard drives, user-selectable storage). On modern platforms it maps poorly:

- **No cloud save support** — XNA Storage predates cloud saves entirely
- **Platform-specific hacks** — on PC, `StorageContainer.Path` just returns an AppData path, making the abstraction pointless
- **Console incompatibility** — modern consoles (Switch, PlayStation, Xbox Series) use platform-specific save APIs that don't map to XNA's `StorageDevice` model
- **Deprecated by FNA** — the FNA team recommends SDL3 Storage as the replacement

SDL3 Storage provides:

- **Platform-appropriate save locations** automatically (AppData on Windows, XDG on Linux, Application Support on macOS, platform-native on consoles)
- **Title storage** — read-only access to game assets shipped with the application
- **User storage** — read/write access to per-user save data
- **Async-ready design** — non-blocking operations for platforms where I/O is asynchronous (consoles)
- **Console-ready** — the same API works on PC and consoles through SDL's platform backends

---

## Storage API Concepts

SDL3 Storage has two distinct storage types:

### Title Storage

Read-only access to files shipped with your game. This is your game's install directory — assets, configuration defaults, and bundled data.

```csharp
// Open title storage (read-only, game install directory)
IntPtr titleStorage = SDL3.SDL_OpenTitleStorage(null, 0);

// Check if a file exists
bool exists = SDL3.SDL_GetStorageFileSize(titleStorage, "data/levels.json", out ulong size);

// Read file contents
byte[] buffer = new byte[size];
SDL3.SDL_ReadStorageFile(titleStorage, "data/levels.json", buffer, size);
string json = System.Text.Encoding.UTF8.GetString(buffer);

// Close when done
SDL3.SDL_CloseStorage(titleStorage);
```

### User Storage

Read/write access to per-user data. This is where save games, settings, and player profiles live.

```csharp
// Open user storage — SDL picks the platform-appropriate location
// Parameters: organization name, application name, properties
IntPtr userStorage = SDL3.SDL_OpenUserStorage("MyStudio", "MyGame", 0);

// Write a save file
byte[] saveData = System.Text.Encoding.UTF8.GetBytes(saveJson);
SDL3.SDL_WriteStorageFile(userStorage, "saves/slot1.json", saveData, (ulong)saveData.Length);

// Read it back
SDL3.SDL_GetStorageFileSize(userStorage, "saves/slot1.json", out ulong size);
byte[] readBuffer = new byte[size];
SDL3.SDL_ReadStorageFile(userStorage, "saves/slot1.json", readBuffer, size);

// Delete a file
SDL3.SDL_RemoveStoragePath(userStorage, "saves/slot1.json");

// Close
SDL3.SDL_CloseStorage(userStorage);
```

---

## Where Files Actually Go

SDL3 Storage maps to platform-appropriate directories automatically:

| Platform | User Storage Location |
|----------|----------------------|
| Windows | `%APPDATA%\MyStudio\MyGame\` |
| Linux | `$XDG_DATA_HOME/MyStudio/MyGame/` (typically `~/.local/share/...`) |
| macOS | `~/Library/Application Support/MyStudio/MyGame/` |
| Steam Deck | Same as Linux, compatible with Steam Cloud sync |
| Consoles | Platform-specific save data partition |

You never hardcode paths. The organization and application names you pass to `SDL_OpenUserStorage` determine the directory structure.

---

## Practical Save System

Here's a complete save system pattern using SDL3 Storage:

```csharp
using System;
using System.Text.Json;

public class SaveSystem : IDisposable
{
    private IntPtr _userStorage;
    private readonly string _saveDirectory;

    public SaveSystem(string org, string app, string saveDir = "saves")
    {
        _userStorage = SDL3.SDL_OpenUserStorage(org, app, 0);
        if (_userStorage == IntPtr.Zero)
        {
            throw new InvalidOperationException(
                $"Failed to open user storage: {SDL3.SDL_GetError()}");
        }
        _saveDirectory = saveDir;

        // Ensure save directory exists
        SDL3.SDL_CreateStorageDirectory(_userStorage, _saveDirectory);
    }

    public void Save<T>(string slotName, T data)
    {
        string path = $"{_saveDirectory}/{slotName}.json";
        string json = JsonSerializer.Serialize(data, new JsonSerializerOptions
        {
            WriteIndented = true
        });
        byte[] bytes = System.Text.Encoding.UTF8.GetBytes(json);

        if (!SDL3.SDL_WriteStorageFile(_userStorage, path, bytes, (ulong)bytes.Length))
        {
            throw new InvalidOperationException(
                $"Failed to write save '{path}': {SDL3.SDL_GetError()}");
        }
    }

    public T Load<T>(string slotName)
    {
        string path = $"{_saveDirectory}/{slotName}.json";

        if (!SDL3.SDL_GetStorageFileSize(_userStorage, path, out ulong size))
        {
            throw new FileNotFoundException($"Save file not found: {path}");
        }

        byte[] buffer = new byte[size];
        if (!SDL3.SDL_ReadStorageFile(_userStorage, path, buffer, size))
        {
            throw new InvalidOperationException(
                $"Failed to read save '{path}': {SDL3.SDL_GetError()}");
        }

        string json = System.Text.Encoding.UTF8.GetString(buffer);
        return JsonSerializer.Deserialize<T>(json);
    }

    public bool SaveExists(string slotName)
    {
        string path = $"{_saveDirectory}/{slotName}.json";
        return SDL3.SDL_GetStorageFileSize(_userStorage, path, out _);
    }

    public void DeleteSave(string slotName)
    {
        string path = $"{_saveDirectory}/{slotName}.json";
        SDL3.SDL_RemoveStoragePath(_userStorage, path);
    }

    public void Dispose()
    {
        if (_userStorage != IntPtr.Zero)
        {
            SDL3.SDL_CloseStorage(_userStorage);
            _userStorage = IntPtr.Zero;
        }
    }
}
```

Usage in your game:

```csharp
// In Game.Initialize() or a service locator
var saves = new SaveSystem("MyStudio", "MyGame");

// Save player progress
saves.Save("autosave", new PlayerData
{
    Level = 5,
    Health = 100,
    Position = new Vector2(320, 240),
    Inventory = playerInventory
});

// Load it back
var data = saves.Load<PlayerData>("autosave");
```

---

## Migration from XNA Storage

### Before (XNA Storage)

```csharp
// Old pattern — platform-specific, no cloud support
StorageDevice device = /* guide-based selection */;
StorageContainer container = device.OpenContainer("MyGame");
string path = Path.Combine(container.Path, "save.json");
File.WriteAllText(path, json);
container.Dispose();
```

### After (SDL3 Storage)

```csharp
// New pattern — platform-native, console-ready
IntPtr storage = SDL3.SDL_OpenUserStorage("MyStudio", "MyGame", 0);
byte[] data = Encoding.UTF8.GetBytes(json);
SDL3.SDL_WriteStorageFile(storage, "save.json", data, (ulong)data.Length);
SDL3.SDL_CloseStorage(storage);
```

### Migration Checklist

1. **Remove** all `using Microsoft.Xna.Framework.Storage` references
2. **Replace** `StorageDevice` / `StorageContainer` with `SDL_OpenUserStorage`
3. **Replace** `System.IO.File` calls (for saves) with `SDL_ReadStorageFile` / `SDL_WriteStorageFile`
4. **Replace** `System.IO.Directory.CreateDirectory` with `SDL_CreateStorageDirectory`
5. **Update** your settings loader to use SDL3 Storage for user preferences
6. **Keep** `System.IO` for logging, temp files, and non-save data — SDL3 Storage is specifically for persistent user data and title assets

---

## Console Considerations

The primary reason to use SDL3 Storage over raw `System.IO` is console compatibility. On consoles:

- File I/O is restricted to designated save partitions
- Save operations may require platform-specific permission flows
- Save data size is often limited and must be declared in advance
- Cloud sync is managed by the platform (PlayStation Plus, Nintendo Switch Online, Xbox Cloud)

SDL3 Storage handles all of this through platform backends. Your FNA game code calls the same API on PC and console — SDL's platform layer translates to the native save system.

FNA's console support documentation (see [Appendix B](https://fna-xna.github.io/docs/appendix/Appendix-B:-FNA-on-Consoles/)) covers the setup for each platform, but the storage API itself requires no platform-specific code changes.

---

## Settings Storage Pattern

For game settings (resolution, volume, keybindings), use a dedicated settings file in user storage:

```csharp
public class SettingsManager
{
    private readonly IntPtr _storage;
    private const string SettingsPath = "settings.json";

    public GameSettings Current { get; private set; }

    public SettingsManager(IntPtr userStorage)
    {
        _storage = userStorage;
        Current = LoadOrDefault();
    }

    private GameSettings LoadOrDefault()
    {
        if (!SDL3.SDL_GetStorageFileSize(_storage, SettingsPath, out ulong size))
        {
            return GameSettings.Default;
        }

        byte[] buffer = new byte[size];
        SDL3.SDL_ReadStorageFile(_storage, SettingsPath, buffer, size);
        string json = System.Text.Encoding.UTF8.GetString(buffer);

        try
        {
            return JsonSerializer.Deserialize<GameSettings>(json);
        }
        catch
        {
            // Corrupted settings — return defaults
            return GameSettings.Default;
        }
    }

    public void Apply(GameSettings settings)
    {
        Current = settings;
        string json = JsonSerializer.Serialize(settings);
        byte[] data = System.Text.Encoding.UTF8.GetBytes(json);
        SDL3.SDL_WriteStorageFile(_storage, SettingsPath, data, (ulong)data.Length);
    }
}
```

---

## Error Handling

SDL3 Storage functions return `bool` (success/failure). Always check return values and call `SDL_GetError()` for details:

```csharp
if (!SDL3.SDL_WriteStorageFile(storage, path, data, (ulong)data.Length))
{
    string error = SDL3.SDL_GetError();
    // Log the error — common causes:
    // - Disk full
    // - Permission denied (sandboxed app)
    // - Console save quota exceeded
    // - Storage not ready (async platforms)
    Console.Error.WriteLine($"Save failed: {error}");
}
```

On async platforms (some consoles), storage may not be immediately ready after opening. Check readiness:

```csharp
IntPtr storage = SDL3.SDL_OpenUserStorage("MyStudio", "MyGame", 0);

// On async platforms, poll until ready
while (!SDL3.SDL_StorageReady(storage))
{
    SDL3.SDL_Delay(10); // Or integrate into your game loop
}

// Now safe to read/write
```

---

## Recommendations

- **Always use SDL3 Storage for save data** — even if you only target PC today, it costs nothing and makes future console ports trivial
- **Use `System.IO` for non-persistent data** — log files, temp caches, debug dumps
- **Serialize to JSON or binary** — SDL3 Storage works with raw bytes, so use whatever format suits your data
- **Handle missing/corrupt saves gracefully** — players will lose save files; always have a fallback to defaults
- **Open storage once, close on exit** — don't open/close per save operation; keep the handle for the game's lifetime
