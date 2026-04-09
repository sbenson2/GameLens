# G8 — Hot Reload & Live Update

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Message Passing](G1_message_passing.md) · [G6 Native Extensions & Build](G6_native_extensions_and_build.md)

---

## Two Systems, Different Goals

Defold provides two distinct mechanisms for updating game content at runtime:

- **Hot Reload** — Development tool. Push code and resource changes to a running game during development without restarting. Used from the Defold Editor.
- **Live Update** — Production system. Ship a smaller initial bundle and download additional content at runtime. Used in published games.

These serve different stages of the development lifecycle and have different APIs, limitations, and mental models.

---

## Hot Reload (Development)

### How It Works

Hot reload lets you modify Lua scripts, shaders, and other resources while the game is running, then push the changes instantly. The Editor communicates with the running engine to replace resources in memory.

**Trigger hot reload:** `File → Hot Reload` or the keyboard shortcut (Ctrl+R / Cmd+R) in the Defold Editor.

### What Gets Reloaded

| Resource Type | Reloaded? | Behavior |
|---------------|-----------|----------|
| Lua scripts (.script, .gui_script, .render_script) | Yes | Script is re-executed in the running Lua environment |
| Vertex/fragment shaders | Yes | GLSL code is recompiled by the GPU driver and re-uploaded |
| Collections | Yes | Collection structure updates are applied |
| Sprites, tilesets, other assets | Yes | Resource data is replaced in memory |

### Script Reload Behavior

When a Lua script is hot-reloaded, the **entire script file is re-executed** in the existing Lua environment. This means:

1. **Top-level code runs again.** Any module-level variable assignments or `require` calls execute a second time.
2. **The `init()` function is NOT called again.** The game object's lifecycle does not restart.
3. **`on_reload()` IS called** (if defined) — this is your hook to respond to the reload.
4. **Local state inside `self` is preserved.** Properties and state set during `init()` or `update()` persist.

```lua
-- my_component.script

-- This runs on every reload — be careful with side effects
local SPEED = 200

function init(self)
    -- Only called once at game object creation, NOT on reload
    self.position = go.get_position()
    self.velocity = vmath.vector3(0)
end

function on_reload(self)
    -- Called after hot reload — use to re-apply settings
    -- or refresh state that depends on reloaded constants
    print("Script reloaded! New SPEED = " .. SPEED)
end

function update(self, dt)
    self.position = self.position + self.velocity * SPEED * dt
    go.set_position(self.position)
end
```

### Hot Reload on Device

Hot reload works on physical devices too, not just desktop. When running the game from the Editor on a connected device (via `Project → Build` with a target), the Editor can push hot reload updates over the network.

### Gotchas

- **State in local variables at the top level resets** on reload (they're re-initialized when the script re-executes), but `self.*` properties persist.
- **New `go.property()` declarations** won't take effect until you restart — property definitions are read at build/load time, not at reload.
- **Shader recompilation can fail** if you introduce a syntax error. The engine will log the error and keep the old shader.
- **Hot reload does not handle structural changes** like adding or removing game objects from a collection — use a full restart for those.

---

## Live Update (Production)

### The Mental Model

When you bundle a Defold game, all resources are packed into the application binary. With Live Update, you can **exclude specific resources** from the initial bundle, host them elsewhere (CDN, your own server), and download them on demand at runtime.

This is useful for:

- **Reducing initial download size** (especially for mobile/HTML5)
- **Downloadable content (DLC)** — seasons, levels, cosmetics
- **A/B testing** — swap assets without a full app update
- **Deferred loading** — download level packs as the player progresses

### Setting Up Live Update

#### 1. Mark Resources as Excluded

In `game.project`, configure which collection proxies should be excluded from the bundle:

```ini
[liveupdate]
enabled = 1
```

In the Editor, right-click a **collection proxy** component and select `Exclude from bundle`. Resources referenced only by excluded proxies are left out of the build.

#### 2. Bundle the Game

Build your game normally (`Project → Bundle`). Defold produces two outputs:

- **The application bundle** (without excluded resources)
- **A Live Update archive** (a zip containing the excluded resources + a manifest)

#### 3. Host the Archive

Upload the Live Update archive to a web server, CDN, or cloud storage accessible by the game at runtime.

### Scripting Live Update

#### Mounting an Archive

The modern approach uses **mount-based loading** — download an archive, mount it, and its resources become immediately available:

```lua
local function on_archive_loaded(self, uri, response)
    if response.status == 200 or response.status == 304 then
        -- Save the archive data to disk
        local path = "dlc_levels.zip"
        local file = io.open(path, "wb")
        file:write(response.response)
        file:close()

        -- Mount the archive — resources are instantly available
        -- name: identifier for this mount
        -- priority: higher = checked first when loading resources
        liveupdate.add_mount("dlc_levels", "zip:" .. path, 10)

        -- Now you can load the collection proxy that references these resources
        msg.post("#level_proxy", "load")
    end
end

function init(self)
    http.request("https://cdn.example.com/dlc_levels.zip",
                 "GET", on_archive_loaded)
end
```

#### Checking Resource Availability

Before trying to load a proxy, verify its resources are present:

```lua
-- Check if a specific resource exists
local missing = collectionproxy.missing_resources("#level_proxy")
if #missing > 0 then
    -- Need to download content first
    download_live_update_archive()
else
    -- Resources available — safe to load
    msg.post("#level_proxy", "load")
end
```

#### Storing a Complete Archive

For bulk content delivery, use `liveupdate.store_archive`:

```lua
-- Store a downloaded zip as live update content
-- The zip is verified against the manifest for integrity
liveupdate.store_archive(zip_data, function(self, status)
    if status == liveupdate.LIVEUPDATE_OK then
        print("Archive stored successfully")
    end
end)
```

### Live Update API Reference

```lua
-- Mount management
liveupdate.add_mount(name, uri, priority)    -- Mount an archive
liveupdate.remove_mount(name)                -- Unmount an archive
liveupdate.get_mounts()                      -- List active mounts

-- Archive storage
liveupdate.store_archive(zip, callback)      -- Store and verify a zip archive
liveupdate.store_manifest(manifest, callback) -- Store an updated manifest

-- Resource verification
liveupdate.is_using_liveupdate_data()        -- Check if live update data is active
liveupdate.get_current_manifest()            -- Get the current manifest reference

-- Collection proxy helper
collectionproxy.missing_resources(url)       -- List missing resources for a proxy
```

### Live Update Architecture

```
┌─────────────────────────────────────────────────┐
│                  Defold Engine                    │
│                                                   │
│  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ Base Bundle   │  │  Live Update Mounts       │ │
│  │ (shipped)     │  │  ┌─────────┐ ┌─────────┐ │ │
│  │               │  │  │ Mount A │ │ Mount B │ │ │
│  │ - core assets │  │  │ pri: 10 │ │ pri: 5  │ │ │
│  │ - main logic  │  │  └─────────┘ └─────────┘ │ │
│  └──────────────┘  └───────────────────────────┘ │
│                                                   │
│  Resource request → Check mounts (highest pri     │
│  first) → Fall back to base bundle                │
└─────────────────────────────────────────────────┘
         ▲
         │ Download at runtime
         │
    ┌────┴─────┐
    │   CDN    │
    │ (zips)   │
    └──────────┘
```

### Production Considerations

1. **Always verify before loading.** Use `collectionproxy.missing_resources()` to check availability before sending `"load"` to a proxy.

2. **Handle download failures gracefully.** Network requests can fail — show progress UI, support retry, and degrade gracefully if content isn't available.

3. **Mount priority matters.** When the same resource exists in multiple mounts, the highest-priority mount wins. Use this for patching — mount a patch archive with higher priority than the base content.

4. **Archive integrity is automatic.** `liveupdate.store_archive` verifies zip contents against the build manifest. Tampered or corrupted files are rejected.

5. **HTML5 considerations.** Live Update is especially valuable for web builds where initial download size directly impacts load times. The `defold-liveupdate-reszip` community library provides optimized loading for HTML5.

6. **Storage persistence.** Mounted archives persist across sessions if stored to the save directory. The engine checks for stored manifests and mounts on startup.

---

## Hot Reload vs. Live Update Summary

| Aspect | Hot Reload | Live Update |
|--------|-----------|-------------|
| **When** | Development | Production |
| **Triggered by** | Editor menu/shortcut | Game code (HTTP + API) |
| **What changes** | Scripts, shaders, assets | Excluded collection proxy resources |
| **Requires restart?** | No | No (with mount-based approach) |
| **Network** | Editor ↔ Engine | Game ↔ CDN/server |
| **Manifest verification** | No | Yes (integrity checks) |
| **Available since** | Always | Defold 1.x (archive mounts from 1.6+) |
