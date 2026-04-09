# G19 — SDL3 Storage API & Platform Abstraction

> **Category:** guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [G08 Cross-Platform Deployment](./G08_cross_platform_deployment.md) · [G17 Save System Patterns](./G17_save_system_patterns.md) · [G13 SDL3 Storage API](./G13_sdl3_storage_api.md)

How to use SDL3's Storage API for portable file I/O in FNA games. Covers the two storage interfaces (`SDL_TitleStorage` for read-only game assets and `SDL_UserStorage` for read-write save data), the async callback model, platform-specific path resolution, and practical patterns for integrating SDL3 Storage into FNA's content and save workflows.

---

## Why SDL3 Storage Over System.IO

FNA games historically use `System.IO` for file access, which works but creates platform headaches:

| Problem | System.IO | SDL3 Storage |
|---------|-----------|-------------|
| Save data location | Manual per-platform path logic | Auto-resolved to platform-correct location |
| Console/mobile sandboxing | Breaks on restricted filesystems | Designed for sandboxed environments |
| Async I/O | DIY threading | Built-in async with callbacks |
| Cloud save integration | Requires per-platform SDK | Future hook point in SDL |

SDL3 Storage provides two typed interfaces that map to the two fundamental file access patterns in games.

## SDL_TitleStorage — Read-Only Game Assets

`SDL_TitleStorage` represents the game's installed read-only data — your content directory, asset bundles, or any data that ships with the game and is never modified at runtime.

### Opening Title Storage

```csharp
// Open title storage rooted at the game's content directory
IntPtr titleStorage = SDL3.SDL_OpenTitleStorage("Content", 0);
if (titleStorage == IntPtr.Zero)
{
    throw new Exception($"Failed to open title storage: {SDL3.SDL_GetError()}");
}
```

The first argument is a path hint. On desktop platforms this is typically a relative path from the executable. On consoles or mobile, the platform resolves it to the appropriate read-only mount point.

### Reading Files

All reads are async. You register a callback that fires when data is available:

```csharp
// Check if a file exists and get its size
if (SDL3.SDL_GetStorageFileSize(titleStorage, "maps/level1.bin", out ulong size))
{
    byte[] buffer = new byte[size];

    // Pin the buffer and request the read
    GCHandle handle = GCHandle.Alloc(buffer, GCHandleType.Pinned);
    SDL3.SDL_ReadStorageFile(
        titleStorage,
        "maps/level1.bin",
        handle.AddrOfPinnedObject(),
        size
    );
    handle.Free();
}
```

### Checking Readiness

Storage backends may need time to initialize (network mounts, cloud sync):

```csharp
// Poll until storage is ready
while (!SDL3.SDL_StorageReady(titleStorage))
{
    SDL3.SDL_Delay(10); // Don't busy-wait
}
```

In practice, desktop title storage is ready immediately. Network-backed or console storage may take time.

## SDL_UserStorage — Read-Write Save Data

`SDL_UserStorage` is for player-specific data: save files, settings, key bindings, screenshots. The platform decides where this data lives.

### Opening User Storage

```csharp
// Organization and app name determine the save directory
IntPtr userStorage = SDL3.SDL_OpenUserStorage("MyStudio", "MyGame", 0);
if (userStorage == IntPtr.Zero)
{
    throw new Exception($"Failed to open user storage: {SDL3.SDL_GetError()}");
}
```

The organization and app name map to platform-specific directories:

| Platform | Typical Path |
|----------|-------------|
| Windows | `%APPDATA%/MyStudio/MyGame/` |
| macOS | `~/Library/Application Support/MyStudio/MyGame/` |
| Linux | `$XDG_DATA_HOME/MyStudio/MyGame/` or `~/.local/share/MyStudio/MyGame/` |
| Console | Platform-specific user data partition |

### Writing Files

```csharp
byte[] saveData = SerializeSaveState(currentState);

bool success = SDL3.SDL_WriteStorageFile(
    userStorage,
    "saves/slot1.sav",
    saveData,
    (ulong)saveData.Length
);

if (!success)
{
    Console.WriteLine($"Save failed: {SDL3.SDL_GetError()}");
}
```

### Creating Directories

SDL3 Storage creates intermediate directories automatically when writing files. If you need to create a directory explicitly:

```csharp
SDL3.SDL_CreateStorageDirectory(userStorage, "saves/backups");
```

### Enumerating Files

```csharp
// List all files in the saves directory
// Uses a callback pattern
SDL3.SDL_EnumerateStorageDirectory(
    userStorage,
    "saves",
    EnumerateCallback,
    IntPtr.Zero
);

static SDL_EnumerationResult EnumerateCallback(
    IntPtr userdata, string dirname, string fname)
{
    Console.WriteLine($"Found: {dirname}/{fname}");
    return SDL_EnumerationResult.SDL_ENUM_CONTINUE;
}
```

## Integration with FNA Content Loading

FNA's `ContentManager` uses `TitleContainer.OpenStream()` internally, which maps to `System.IO.File.OpenRead` on desktop. To route content loading through SDL3 Storage instead:

### Custom TitleContainer Bridge

```csharp
public static class SDL3ContentBridge
{
    private static IntPtr _titleStorage;

    public static void Initialize(string contentRoot)
    {
        _titleStorage = SDL3.SDL_OpenTitleStorage(contentRoot, 0);
        while (!SDL3.SDL_StorageReady(_titleStorage))
            SDL3.SDL_Delay(1);
    }

    public static byte[] LoadAsset(string path)
    {
        if (!SDL3.SDL_GetStorageFileSize(_titleStorage, path, out ulong size))
            throw new FileNotFoundException($"Asset not found: {path}");

        byte[] buffer = new byte[size];
        GCHandle handle = GCHandle.Alloc(buffer, GCHandleType.Pinned);
        SDL3.SDL_ReadStorageFile(
            _titleStorage, path,
            handle.AddrOfPinnedObject(), size
        );
        handle.Free();
        return buffer;
    }

    public static void Shutdown()
    {
        if (_titleStorage != IntPtr.Zero)
        {
            SDL3.SDL_CloseStorage(_titleStorage);
            _titleStorage = IntPtr.Zero;
        }
    }
}
```

This approach is most valuable when targeting platforms where `System.IO` doesn't have access to the content directory (consoles, some mobile platforms).

## Integration with Save Systems

Combine SDL3 Storage with the save patterns from [G17 Save System Patterns](./G17_save_system_patterns.md):

```csharp
public class SDL3SaveManager
{
    private IntPtr _userStorage;

    public SDL3SaveManager(string org, string app)
    {
        _userStorage = SDL3.SDL_OpenUserStorage(org, app, 0);
        while (!SDL3.SDL_StorageReady(_userStorage))
            SDL3.SDL_Delay(1);
    }

    public void Save<T>(string slot, T data) where T : struct
    {
        byte[] bytes = StructSerializer.Serialize(data);
        SDL3.SDL_WriteStorageFile(
            _userStorage,
            $"saves/{slot}.sav",
            bytes,
            (ulong)bytes.Length
        );
    }

    public T? Load<T>(string slot) where T : struct
    {
        string path = $"saves/{slot}.sav";
        if (!SDL3.SDL_GetStorageFileSize(_userStorage, path, out ulong size))
            return null;

        byte[] buffer = new byte[size];
        GCHandle handle = GCHandle.Alloc(buffer, GCHandleType.Pinned);
        SDL3.SDL_ReadStorageFile(
            _userStorage, path,
            handle.AddrOfPinnedObject(), size
        );
        handle.Free();

        return StructSerializer.Deserialize<T>(buffer);
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

## Remaining Free for System.IO

You don't have to go all-in on SDL3 Storage. A practical middle-ground:

- **Use System.IO** for desktop-only games where you control the filesystem layout and don't plan console/mobile ports.
- **Use SDL3 Storage** for save data on any game you might port to constrained platforms, since the API is designed for that from day one.
- **Use SDL3 Storage for title data** only when targeting platforms where `System.IO` can't reach the content directory.

## Cleanup

Always close storage handles when shutting down:

```csharp
protected override void OnExiting(object sender, EventArgs args)
{
    SDL3.SDL_CloseStorage(_userStorage);
    SDL3.SDL_CloseStorage(_titleStorage);
    base.OnExiting(sender, args);
}
```

## Troubleshooting

**"Storage not ready" hangs forever** — Check that the path exists and permissions are correct. On Linux, verify `$XDG_DATA_HOME` is writable.

**Files written but can't find them** — SDL3 Storage resolves paths relative to the storage root. Don't mix absolute paths with storage paths.

**Performance concerns** — Desktop SDL3 Storage is a thin wrapper over platform I/O. There's no meaningful overhead compared to `System.IO`. The async model adds a callback layer but no extra copies.
