# G22 — Web Publishing & Poki Integration

> **Category:** guide · **Engine:** Defold · **Related:** [G12 Distribution & Publishing](G12_distribution_and_publishing.md) · [G6 Native Extensions & Build](G6_native_extensions_and_build.md) · [G10 Networking & Multiplayer](G10_networking_and_multiplayer.md)

---

## Overview

Defold produces highly optimized HTML5 builds via WebAssembly, making it one of the strongest engines for web game distribution. In 2025, the Defold Foundation partnered with Poki to add first-class web game publishing support — including one-click bundling, the Poki SDK extension, and experimental WebGPU as an optional graphics backend for improved web performance.

This guide covers HTML5 build configuration, the Poki SDK integration, ad monetization, and WebGPU setup.

---

## HTML5 Build Configuration

### game.project Settings

Configure web builds in the `[html5]` section of `game.project`:

```ini
[html5]
htmlfile = /builtins/manifests/web/engine_template.html
custom_heap_size = 0         ; 0 = auto-detect, or set in bytes
set_custom_heap_size = 0
include_dev_tool = 0         ; 1 = include development tools in build
```

Key settings in other sections that affect web builds:

```ini
[project]
title = My Web Game
version = 1.0.0
custom_resources = /assets/data

[display]
width = 960
height = 640

[script]
shared_state = 1             ; recommended for smaller wasm size
```

### Canvas Scaling

Control how the game canvas fills the browser window by editing the HTML template or using JavaScript:

```html
<!-- In your custom HTML template -->
<style>
    #canvas {
        width: 100%;
        height: 100%;
    }
</style>
```

The engine respects the canvas element dimensions. For responsive games, update the canvas size on window resize and call `window.defold.setViewport()` if needed.

### Bundling for Web

From the editor: **Project → Bundle → HTML5 Application**. This produces a folder with:

| File | Purpose |
|------|---------|
| `index.html` | Entry point (from your HTML template) |
| `dmloader.js` | Defold engine loader |
| `game.js` | Compiled engine (WebAssembly glue) |
| `game.wasm` | WebAssembly binary |
| `game.arcd` / `game.arci` | Compressed game archive + index |
| `game.projectc` | Compiled project settings |

### Command-Line Bundling with bob.jar

```bash
java -jar bob.jar \
    --archive \
    --platform js-web \
    --variant release \
    --bundle-output build/web \
    resolve distclean build bundle
```

---

## Poki SDK Integration

[Poki](https://poki.com) is one of the largest web gaming platforms. Defold's native extension provides direct integration for ad monetization, analytics, and one-click deployment.

### Adding the Extension

1. Go to the [extension-poki-sdk releases](https://github.com/defold/extension-poki-sdk/releases) on GitHub
2. Copy the ZIP URL for the latest release
3. Add it to your `game.project` dependencies:

```ini
[project]
dependencies#0 = https://github.com/defold/extension-poki-sdk/archive/refs/tags/2.3.0.zip
```

4. Select **Project → Fetch Libraries** in the editor

### Using the Poki Template

For new projects, start with the [Poki HTML5 template](https://github.com/defold/template-html5-poki) which includes the SDK pre-configured and a ready-made HTML shell.

### Bundle Directly to Poki

With the extension installed, select **Project → Bundle → Poki** from the editor menu. This bundles, ZIPs, and uploads the game directly to your Poki for Developers account — no manual file handling required.

If you are not logged in to Poki for Developers, you will be redirected to the login page.

---

## Poki SDK API Reference

All functions are in the `poki_sdk` module. The SDK is only available in HTML5 builds — guard calls with a platform check:

```lua
local is_web = sys.get_sys_info().system_name == "HTML5"
```

### Gameplay Events

Signal when the player is actively playing. Poki uses these events to manage ad timing and analytics.

```lua
-- Call when gameplay begins (first interaction, unpause, level start)
poki_sdk.gameplay_start()

-- Call when gameplay ends (level complete, game over, pause, quit to menu)
poki_sdk.gameplay_stop()
```

**Rule:** Always call `gameplay_stop()` before showing an ad, and `gameplay_start()` after the ad finishes.

### Commercial Breaks (Interstitial Ads)

Interstitial ads shown between gameplay sessions. Not every call triggers an ad — Poki's system determines ad frequency.

```lua
local function show_commercial_break()
    poki_sdk.gameplay_stop()

    poki_sdk.commercial_break(function(self, status)
        if status == poki_sdk.COMMERCIAL_BREAK_START then
            -- Ad is about to display — mute audio, pause timers
            sound.mute_all()
        elseif status == poki_sdk.COMMERCIAL_BREAK_SUCCESS then
            -- Ad finished (or was skipped / not shown)
            sound.unmute_all()
            poki_sdk.gameplay_start()
        end
    end)
end
```

**Best practice:** Call `commercial_break()` before every `gameplay_start()` — between levels, after game over, on returning from a menu. The SDK decides whether to actually show an ad.

### Rewarded Breaks (Opt-In Video Ads)

Players choose to watch an ad in exchange for an in-game reward (extra life, coins, power-up).

```lua
local function offer_reward()
    poki_sdk.rewarded_break("small", function(self, status)
        if status == poki_sdk.REWARDED_BREAK_START then
            -- Ad is starting — mute audio, pause game
            sound.mute_all()
        elseif status == poki_sdk.REWARDED_BREAK_SUCCESS then
            -- Player watched the full ad — grant reward
            sound.unmute_all()
            grant_extra_life()
            poki_sdk.gameplay_start()
        elseif status == poki_sdk.REWARDED_BREAK_ERROR then
            -- Ad failed to load or user declined
            sound.unmute_all()
            show_message("No reward available right now")
            poki_sdk.gameplay_start()
        end
    end)
end
```

**Size parameter:** `"small"`, `"medium"`, or `"large"` — indicates the reward tier. Defaults to `"small"`.

**Important:** Always make it clear to the player that they are about to watch an ad *before* calling `rewarded_break()`. Poki requires user consent for rewarded ads.

### Shareable URLs

Generate a URL that encodes game state (e.g., a custom level, a challenge score):

```lua
poki_sdk.shareable_url({ level = 5, seed = 12345 }, function(self, url)
    -- url is a string like "https://poki.com/game?level=5&seed=12345"
    gui.set_text(gui.get_node("share_url"), url)
end)
```

Retrieve shared parameters on load:

```lua
local level = poki_sdk.get_url_param("level")
local seed = poki_sdk.get_url_param("seed")
if level then
    load_level(tonumber(level), tonumber(seed))
end
```

### Utility Functions

```lua
-- Enable debug logging (development only)
poki_sdk.set_debug(true)

-- Report errors to Poki's monitoring
poki_sdk.capture_error("Failed to load level data: " .. err_msg)

-- Custom analytics event
poki_sdk.measure("game", "level_complete", "level_3")

-- Reposition the Poki branding pill (percent from top, pixel offset)
poki_sdk.move_pill(0, 60)
```

### Constants Reference

| Constant | Used In | Meaning |
|----------|---------|---------|
| `poki_sdk.COMMERCIAL_BREAK_START` | `commercial_break` callback | Ad is about to display |
| `poki_sdk.COMMERCIAL_BREAK_SUCCESS` | `commercial_break` callback | Ad completed or was not shown |
| `poki_sdk.REWARDED_BREAK_START` | `rewarded_break` callback | Rewarded ad is starting |
| `poki_sdk.REWARDED_BREAK_SUCCESS` | `rewarded_break` callback | Player watched the full ad |
| `poki_sdk.REWARDED_BREAK_ERROR` | `rewarded_break` callback | Ad failed or user declined |

---

## Typical Game Flow with Poki

```
Game Loads
  └─ poki_sdk.gameplay_start()

Level Playing...
  └─ Player dies / level complete
      └─ poki_sdk.gameplay_stop()
      └─ Show results screen
      └─ Player clicks "Continue"
          └─ poki_sdk.commercial_break(callback)
              └─ On COMMERCIAL_BREAK_SUCCESS:
                  └─ poki_sdk.gameplay_start()
                  └─ Load next level

Player clicks "Watch Ad for Extra Life"
  └─ poki_sdk.gameplay_stop()
  └─ poki_sdk.rewarded_break("small", callback)
      └─ On REWARDED_BREAK_SUCCESS:
          └─ Grant extra life
          └─ poki_sdk.gameplay_start()
```

---

## WebGPU (Experimental)

Defold added experimental WebGPU support in 2025 as an alternative graphics backend for HTML5 builds. WebGPU provides lower-overhead GPU access compared to WebGL, with potential for better performance in draw-call-heavy games.

### Enabling WebGPU

Option A — in `game.project`:

```ini
[html5]
webgpu = 1
```

Option B — via an app manifest (`.appmanifest`) that selects the WebGPU graphics adapter.

### Current Status

- **Browser support:** Chrome 113+ and Edge 113+ ship with WebGPU enabled. Firefox and Safari have experimental support behind flags.
- **Fallback:** Defold does **not** automatically fall back to WebGL if WebGPU is unavailable. Test your target browsers.
- **Shader compatibility:** Existing render scripts and materials work without changes — the engine translates internally.
- **Maturity:** Experimental. Use for testing and performance benchmarking, not production releases targeting broad audiences (as of early 2026).

---

## Performance Tips for Web Builds

### Reduce Build Size

1. **Use app manifests** to exclude unused engine modules (physics, 3D, etc.):

```yaml
# game.appmanifest — strip unused components
platforms:
    js-web:
        context:
            excludeLibs: [physics_3d, record, profilerext]
```

2. **Compress assets** — Defold archives are compressed by default, but ensure textures use appropriate compression profiles for web (Basis Universal for broad support).

3. **Enable `shared_state`** in `game.project` to reduce Lua VM memory overhead:

```ini
[script]
shared_state = 1
```

### Loading and Startup

- Use **collection proxies** to defer loading of non-essential content. The bootstrap collection should be minimal.
- Show a loading screen while collection proxies load in the background.
- Consider **Live Update** for very large games — download assets on demand instead of bundling everything upfront.

### Gameplay Performance

- Keep draw calls low — the WebGL/WebGPU bridge has overhead per call.
- Use **texture atlases** aggressively to batch rendering.
- Profile with the browser's built-in performance tools (Chrome DevTools → Performance tab).
- Test on lower-end hardware — web games have a broader device spectrum than native.

---

## Testing Web Builds Locally

```bash
# Python 3 — simple HTTP server
cd build/web
python3 -m http.server 8080

# Then open http://localhost:8080 in your browser
```

**CORS note:** Some browsers block `file://` access to WASM. Always use a local HTTP server.

**SharedArrayBuffer:** Some Defold features require `SharedArrayBuffer`, which needs specific HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Most simple HTTP servers do not set these. Use the Defold editor's built-in preview (**Project → Build**) for the most accurate local testing.
