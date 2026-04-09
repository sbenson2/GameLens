# G6 — Native Extensions & Build System

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Message Passing](G1_message_passing.md)

---

## Why Native Extensions?

Defold games are scripted in Lua, but sometimes you need to go lower: platform SDKs (ads, analytics, IAP), performance-critical code (pathfinding, procedural generation), or existing C/C++ libraries. Native extensions let you write C/C++ code that compiles into the engine and exposes functions to Lua.

The key insight: native extensions are compiled **server-side** by Defold's build infrastructure. You don't need a local C++ toolchain for most workflows — push your code, the build server compiles it for every target platform.

---

## Extension Structure

A native extension lives inside your project as a folder with a specific layout:

```
my_project/
├── game.project
├── main/
│   └── ...
└── myextension/
    ├── ext.manifest              -- Extension configuration
    ├── src/
    │   └── myextension.cpp       -- C/C++ source files
    ├── include/                   -- Header files (optional)
    ├── lib/                       -- Pre-compiled libraries (optional)
    │   ├── android/
    │   ├── ios/
    │   ├── x86_64-linux/
    │   └── ...
    └── res/                       -- Platform resources (optional)
        ├── android/
        │   └── AndroidManifest.xml
        └── ...
```

### ext.manifest

The `ext.manifest` file controls compilation flags, defines, and linked libraries. It uses YAML-like syntax:

```yaml
name: "MyExtension"

platforms:
    common:
        context:
            defines: ["MY_DEFINE"]
            flags: ["-std=c++17"]

    armv7-android:
        context:
            linkFlags: ["-llog"]

    x86_64-linux:
        context:
            libs: ["pthread"]
```

**Key sections:**

| Key | Purpose |
|-----|---------|
| `name` | Must match the first argument to `DM_DECLARE_EXTENSION` |
| `platforms.common` | Flags applied to all platforms |
| `platforms.<arch-os>` | Platform-specific overrides |
| `context.defines` | Preprocessor defines |
| `context.flags` | Compiler flags |
| `context.linkFlags` | Linker flags |
| `context.libs` | Libraries to link |

---

## Writing a Native Extension

### Minimal Example — Expose a Function to Lua

```cpp
// myextension/src/myextension.cpp
#include <dmsdk/sdk.h>

// The Lua function: myextension.add(a, b) -> number
static int Add(lua_State* L)
{
    DM_LUA_STACK_CHECK(L, 1);  // Expect 1 return value

    double a = luaL_checknumber(L, 1);
    double b = luaL_checknumber(L, 2);

    lua_pushnumber(L, a + b);
    return 1;
}

// Function table exposed to Lua
static const luaL_reg Module_methods[] =
{
    {"add", Add},
    {0, 0}
};

// Called when the extension initializes (Lua bindings go here)
static dmExtension::Result AppInitialize(dmExtension::AppParams* params)
{
    return dmExtension::RESULT_OK;
}

static dmExtension::Result Initialize(dmExtension::Params* params)
{
    luaL_register(params->m_L, "myextension", Module_methods);
    lua_pop(params->m_L, 1);
    return dmExtension::RESULT_OK;
}

static dmExtension::Result Finalize(dmExtension::Params* params)
{
    return dmExtension::RESULT_OK;
}

static dmExtension::Result AppFinalize(dmExtension::AppParams* params)
{
    return dmExtension::RESULT_OK;
}

// The macro name must match ext.manifest "name"
// Signature: symbol, name, app_init, app_final, init, update, on_event, final
DM_DECLARE_EXTENSION(MyExtension, "MyExtension",
    AppInitialize, AppFinalize,
    Initialize, 0, 0, Finalize)
```

Then in Lua:
```lua
-- game.script
function init(self)
    local result = myextension.add(3, 4)
    print(result)   -- 7
end
```

### Extension Lifecycle Callbacks

| Callback | When | Typical Use |
|----------|------|-------------|
| `AppInitialize` | Engine startup (once) | Global SDK init |
| `Initialize` | Extension init, all Defold APIs ready | **Register Lua bindings** |
| `Update` | Every frame (if provided) | Background processing |
| `OnEvent` | System events (pause, resume, etc.) | Respond to app lifecycle |
| `Finalize` | Extension shutdown | Cleanup Lua state |
| `AppFinalize` | Engine shutdown | Global cleanup |

### Best Practices

- **Register Lua bindings in `Initialize`**, not `AppInitialize`. All Defold APIs (including Lua) are guaranteed to be ready at that point.
- **Use `DM_LUA_STACK_CHECK`** to catch stack imbalance bugs early.
- **Stub extensions for unsupported platforms.** Use `#if defined(DM_PLATFORM_ANDROID)` guards and provide no-op Lua functions on other platforms so your game code doesn't need platform checks.
- **Prefer Defold's official extensions** for common needs (in-app purchases, push notifications, ads). Check [defold.com/assets](https://defold.com/assets/) before writing your own.

---

## Build System

### Editor Build (F5 / Build & Run)

When you build from the Defold Editor:

1. Lua scripts and resources are compiled locally.
2. If native extensions are present, source code is uploaded to the **Defold build server** (build.defold.com).
3. The build server compiles the engine + your extensions for the target platform.
4. A custom engine binary is returned and cached locally.
5. The game launches with the custom engine.

Subsequent builds reuse the cached engine binary unless extension source code changes.

### Bob.jar — Command-Line Builder

Bob is Defold's standalone build tool, distributed as a Java JAR. It handles everything the Editor does, plus CI/CD automation.

**Requirements:** OpenJDK 25 for Defold 1.12.0+, OpenJDK 21 for older versions.

**Basic commands:**

```bash
# Resolve library dependencies (fetches library URLs from game.project)
java -jar bob.jar resolve

# Build data archives
java -jar bob.jar --archive build

# Bundle for a specific platform
java -jar bob.jar --archive --platform armv7-android bundle

# Full pipeline: clean → resolve → build → bundle
java -jar bob.jar --archive --platform x86_64-macos resolve distclean build bundle
```

**Key flags:**

| Flag | Purpose |
|------|---------|
| `--platform <arch-os>` | Target platform (e.g., `armv7-android`, `arm64-ios`, `x86_64-linux`, `js-web`) |
| `--archive` | Build a data archive (required for bundling) |
| `--variant debug\|release` | Engine variant. Release is default. |
| `--strip-executable` | Strip debug symbols from the engine binary |
| `--bundle-output <dir>` | Output directory for the bundle |
| `--max-cpu-threads <n>` | Parallel resource build threads |
| `--settings <path>` | Override game.project settings file |
| `--build-server <url>` | Use a custom build server (for self-hosted extender) |

### Platform Identifiers

| Platform | Identifier |
|----------|-----------|
| Windows (64-bit) | `x86_64-win32` |
| macOS (Intel) | `x86_64-macos` |
| macOS (Apple Silicon) | `arm64-macos` |
| Linux (64-bit) | `x86_64-linux` |
| Android (32-bit) | `armv7-android` |
| Android (64-bit) | `arm64-android` |
| iOS (64-bit) | `arm64-ios` |
| HTML5 | `js-web` |
| Nintendo Switch | `arm64-nx64` |

### Self-Hosted Build Server (Extender)

For teams that can't send source code to Defold's public build server, the [Extender](https://github.com/defold/extender) can be self-hosted. It runs as a Java server with Docker or natively on macOS.

```bash
# Point bob.jar at your own server
java -jar bob.jar --build-server https://build.mycompany.com --archive --platform arm64-ios bundle
```

---

## Hot Reload

Defold supports **hot reload** during development. When you modify a Lua script or resource and press Ctrl+R (Cmd+R on macOS) in the Editor, the running game reloads affected scripts without restarting. This calls the `on_reload` callback in your scripts:

```lua
function on_reload(self)
    -- Called when this script is hot-reloaded
    -- Re-initialize visual state, recalculate derived values, etc.
    print("Script reloaded!")
end
```

**Limitations:** Hot reload applies to Lua scripts and some resources. Changes to native extension C/C++ code require a full rebuild. Changes to `game.project` settings require a restart.

---

## CI/CD Example (GitHub Actions)

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '25'
      - name: Download Bob
        run: |
          wget https://github.com/defold/defold/releases/download/1.9.8/bob.jar
      - name: Build and Bundle
        run: |
          java -jar bob.jar --archive --platform js-web resolve distclean build bundle
```

---

*Native extensions bridge Lua and C/C++. The cloud build server means you rarely need a local toolchain. Bob.jar automates everything for CI/CD.*
