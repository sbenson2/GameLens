# G6 — SDL3 Storage & Filesystem APIs

> **Category:** guide · **Engine:** SDL3 · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Migrating from SDL2](G3_migrating_from_sdl2.md) · [SDL3 Rules](../sdl3-arch-rules.md)

---

## Overview

SDL3 introduces a high-level **Storage API** that abstracts platform-specific filesystem differences — particularly important for game consoles, where "game content" and "user save data" are physically separate storage devices with different access patterns. This replaces the ad-hoc file handling approaches common in SDL2.

SDL3 provides three layers for file access:

1. **SDL_Storage** (high-level) — portable title content and user save data
2. **SDL_IOStream** (mid-level) — replaces SDL2's `SDL_RWops`, for streaming reads/writes
3. **SDL_Filesystem** (low-level) — raw path queries (`SDL_GetBasePath`, `SDL_GetPrefPath`, etc.)

For most games, **SDL_Storage is the recommended approach** for loading assets and saving player data.

---

## SDL_Storage: The High-Level API

### Two Storage Types

SDL3 separates storage into two containers with distinct semantics:

| Container | Function | Use Case | Access |
|-----------|----------|----------|--------|
| **Title Storage** | `SDL_OpenTitleStorage()` | Game assets, bundled content | Read-only |
| **User Storage** | `SDL_OpenUserStorage()` | Save files, preferences, progress | Read-write |

This separation exists because many platforms (consoles, mobile) enforce strict boundaries between shipped content and user-generated data.

### Title Storage (Read-Only Game Assets)

Title storage provides access to your game's bundled assets. On desktop, this typically maps to the game's installation directory. On consoles, it maps to the title's read-only content partition.

```c
#include <SDL3/SDL.h>

bool LoadGameAsset(const char *path, void **out_data, Uint64 *out_size) {
    // Open title storage — pass NULL for default override directory
    SDL_Storage *title = SDL_OpenTitleStorage(NULL, 0);
    if (!title) {
        SDL_Log("Failed to open title storage: %s", SDL_GetError());
        return false;
    }

    // Storage may not be immediately ready (async on some platforms)
    while (!SDL_StorageReady(title)) {
        SDL_Delay(1);
    }

    // Get file size
    Uint64 file_size = 0;
    if (!SDL_GetStorageFileSize(title, path, &file_size)) {
        SDL_Log("File not found: %s", path);
        SDL_CloseStorage(title);
        return false;
    }

    // Allocate and read
    void *data = SDL_malloc(file_size);
    if (!SDL_ReadStorageFile(title, path, data, file_size)) {
        SDL_Log("Failed to read %s: %s", path, SDL_GetError());
        SDL_free(data);
        SDL_CloseStorage(title);
        return false;
    }

    *out_data = data;
    *out_size = file_size;

    SDL_CloseStorage(title);
    return true;
}
```

**Important:** The `length` parameter in `SDL_ReadStorageFile()` must match the file size exactly (obtained from `SDL_GetStorageFileSize()`). Passing a larger buffer will fail.

**Lifetime tip:** Title storage can be kept open for the entire application lifetime — it's read-only and cheap to hold open.

### User Storage (Save Data)

User storage provides a read-write container for player save files, preferences, and progress. On desktop, this maps to platform-standard locations (e.g., `~/.local/share/` on Linux, `AppData` on Windows). On consoles, it maps to the user's save data partition.

```c
#include <SDL3/SDL.h>

// --- Saving ---
bool SavePlayerData(const char *org, const char *app,
                    const void *data, Uint64 size) {
    SDL_Storage *user = SDL_OpenUserStorage(org, app, 0);
    if (!user) {
        SDL_Log("Failed to open user storage: %s", SDL_GetError());
        return false;
    }

    while (!SDL_StorageReady(user)) {
        SDL_Delay(1);
    }

    bool ok = SDL_WriteStorageFile(user, "save.dat", data, size);
    if (!ok) {
        SDL_Log("Write failed: %s", SDL_GetError());
    }

    // Close promptly — lets the backend flush/sync
    SDL_CloseStorage(user);
    return ok;
}

// --- Loading ---
bool LoadPlayerData(const char *org, const char *app,
                    void **out_data, Uint64 *out_size) {
    SDL_Storage *user = SDL_OpenUserStorage(org, app, 0);
    if (!user) return false;

    while (!SDL_StorageReady(user)) {
        SDL_Delay(1);
    }

    Uint64 file_size = 0;
    if (!SDL_GetStorageFileSize(user, "save.dat", &file_size)) {
        SDL_CloseStorage(user);
        return false;  // No save file yet — not an error
    }

    void *data = SDL_malloc(file_size);
    if (!SDL_ReadStorageFile(user, "save.dat", data, file_size)) {
        SDL_free(data);
        SDL_CloseStorage(user);
        return false;
    }

    *out_data = data;
    *out_size = file_size;
    SDL_CloseStorage(user);
    return true;
}
```

**Important:** Unlike title storage, user storage should be opened briefly — do your reads/writes, then close it. This allows the backend to properly batch I/O operations and flush data (critical on consoles where save operations may be managed by the platform OS).

### Checking Available Space

Before writing large files, check remaining space:

```c
Uint64 remaining = SDL_GetStorageSpaceRemaining(user);
if (remaining < save_size) {
    SDL_Log("Not enough storage space: need %llu, have %llu",
            save_size, remaining);
    // Prompt player to free space
}
```

---

## SDL_IOStream: The Mid-Level API

`SDL_IOStream` replaces SDL2's `SDL_RWops`. It's an opaque, seekable byte stream used for lower-level I/O — reading custom file formats, streaming audio, etc.

### Key Changes from SDL2

| SDL2 (`SDL_RWops`) | SDL3 (`SDL_IOStream`) | Notes |
|--------------------|-----------------------|-------|
| `SDL_RWFromFile()` | `SDL_IOFromFile()` | Same behavior, new name |
| `SDL_RWFromMem()` | `SDL_IOFromMem()` | Same behavior |
| `SDL_RWFromConstMem()` | `SDL_IOFromConstMem()` | Same behavior |
| `SDL_RWread()` | `SDL_ReadIO()` | Returns `size_t`, not `size_t * nmemb` |
| `SDL_RWwrite()` | `SDL_WriteIO()` | Returns `size_t` |
| `SDL_RWseek()` | `SDL_SeekIO()` | Same semantics |
| `SDL_RWtell()` | `SDL_TellIO()` | Same semantics |
| `SDL_RWclose()` | `SDL_CloseIO()` | Same semantics |
| Custom `SDL_RWops` struct | `SDL_OpenIO()` | Provide callbacks via `SDL_IOStreamInterface` |

### Basic File I/O with SDL_IOStream

```c
// Read a file
SDL_IOStream *io = SDL_IOFromFile("config.json", "rb");
if (io) {
    Sint64 size = SDL_GetIOSize(io);
    char *buf = SDL_malloc(size + 1);
    SDL_ReadIO(io, buf, size);
    buf[size] = '\0';
    SDL_CloseIO(io);
    // Parse buf...
    SDL_free(buf);
}

// Write a file
SDL_IOStream *io = SDL_IOFromFile("log.txt", "wb");
if (io) {
    const char *msg = "Game started\n";
    SDL_WriteIO(io, msg, SDL_strlen(msg));
    SDL_CloseIO(io);
}
```

### Custom IOStream (Replacing Custom SDL_RWops)

In SDL2 you'd fill in function pointers on `SDL_RWops` directly. In SDL3, use `SDL_OpenIO()`:

```c
static Sint64 SDLCALL my_size(void *userdata) {
    MyArchive *arc = (MyArchive *)userdata;
    return arc->current_entry_size;
}

static size_t SDLCALL my_read(void *userdata, void *ptr,
                               size_t size, SDL_IOStatus *status) {
    MyArchive *arc = (MyArchive *)userdata;
    // Read from your custom archive format...
    return bytes_read;
}

static bool SDLCALL my_close(void *userdata) {
    // Cleanup
    return true;
}

SDL_IOStream *CreateArchiveStream(MyArchive *arc) {
    SDL_IOStreamInterface iface = {0};
    iface.version = sizeof(SDL_IOStreamInterface);
    iface.size = my_size;
    iface.read = my_read;
    iface.close = my_close;
    return SDL_OpenIO(&iface, arc);
}
```

---

## SDL_Filesystem: Low-Level Path Queries

For cases where you need actual filesystem paths (e.g., integrating with third-party libraries that expect paths):

| Function | Returns | Example |
|----------|---------|---------|
| `SDL_GetBasePath()` | Directory where the application binary lives | `/opt/mygame/` |
| `SDL_GetPrefPath(org, app)` | Platform-standard writable directory for app data | `~/.local/share/org/app/` |
| `SDL_GetUserFolder(folder)` | Standard user folders (Documents, Downloads, etc.) | `~/Documents/` |

```c
// Get a writable config directory
const char *pref = SDL_GetPrefPath("MyStudio", "MyGame");
// pref = "/home/user/.local/share/MyStudio/MyGame/" on Linux
// pref = "C:\Users\user\AppData\Roaming\MyStudio\MyGame\" on Windows
```

> **When to use Filesystem vs. Storage:** Use `SDL_Storage` for game assets and save data (portable across desktop and console). Use `SDL_Filesystem` only when you need raw paths — for example, passing a directory to a third-party library, opening a file browser dialog, or logging.

---

## Which API to Use

| Scenario | Recommended API |
|----------|----------------|
| Loading bundled game assets (textures, levels, audio) | `SDL_OpenTitleStorage()` |
| Saving/loading player progress | `SDL_OpenUserStorage()` |
| Reading a custom binary format with seeking | `SDL_IOFromFile()` / `SDL_IOStream` |
| Integrating a library that needs a file path string | `SDL_GetBasePath()` / `SDL_GetPrefPath()` |
| Streaming large files in chunks | `SDL_IOStream` with `SDL_ReadIO()` |
| Console / platform portability is critical | `SDL_Storage` (handles platform differences automatically) |

---

## Migration Checklist (from SDL2)

1. Replace `SDL_RWFromFile()` → `SDL_IOFromFile()` and update read/write calls
2. Replace custom `SDL_RWops` structs → `SDL_OpenIO()` with `SDL_IOStreamInterface`
3. For game assets: consider switching from raw file paths to `SDL_OpenTitleStorage()`
4. For save data: consider switching from `SDL_GetPrefPath()` + manual I/O to `SDL_OpenUserStorage()`
5. Check that `SDL_ReadStorageFile()` buffer sizes match exactly (no oversized buffers)
6. Close user storage promptly after I/O to allow platform flush
