# G10 — Distribution & Packaging

> **Category:** guide · **Engine:** Love2D · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G8 Filesystem & Save Data](G8_filesystem_and_save_data.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## Overview

LÖVE games are distributed as `.love` files or as **fused executables** that bundle your game with the LÖVE runtime into a single platform-specific binary. This guide covers the full pipeline from development to distributable builds for Windows, macOS, and Linux.

---

## The .love File

A `.love` file is simply a **zip archive** with `main.lua` at the root. Players can run it with an installed copy of LÖVE.

### Creating a .love File

```bash
# From your project directory (where main.lua lives)
cd my-game/
zip -9 -r ../my-game.love . -x ".*" -x "__MACOSX/*"
```

**Critical:** `main.lua` must be at the **root** of the zip, not inside a subdirectory.

```
my-game.love (zip)
├── main.lua          ✓ correct — at root
├── conf.lua
├── assets/
│   ├── player.png
│   └── music.ogg
└── lib/
    └── utils.lua
```

```
my-game.love (zip)
└── my-game/          ✗ wrong — nested in a folder
    ├── main.lua
    └── ...
```

### Testing Your .love File

```bash
love my-game.love
# Or on macOS:
open -a love my-game.love
```

---

## conf.lua for Distribution

Set these fields in `conf.lua` before packaging:

```lua
function love.conf(t)
    t.identity = "my-game"          -- Save directory name (required for fused mode)
    t.version  = "11.5"             -- LÖVE version compatibility
    t.window.title = "My Game"
    t.window.icon  = "icon.png"     -- 256x256 recommended
    t.window.width  = 1280
    t.window.height = 720

    -- Disable unused modules to reduce attack surface and startup time
    t.modules.joystick = false
    t.modules.physics  = false
end
```

**`t.identity` is essential** for fused games. Without it, LÖVE doesn't know which save directory to use. In fused mode, save data goes directly to `AppData/my-game/` (Windows) or `~/Library/Application Support/my-game/` (macOS) rather than being nested under a LÖVE subdirectory.

---

## Fused Executables

A fused executable combines the LÖVE runtime with your `.love` file into a single binary that players can run without installing LÖVE.

### Detecting Fused Mode

```lua
if love.filesystem.isFused() then
    print("Running as fused executable")
end
```

### Windows (.exe)

1. Download the official LÖVE zip (not the installer) from [love2d.org](https://love2d.org):
   - `love-11.5-win64.zip` for 64-bit
   - `love-11.5-win32.zip` for 32-bit

2. Fuse the executable:

```bash
# Concatenate love.exe with your .love file
copy /b love.exe+my-game.love my-game.exe

# Or on Linux/macOS building for Windows:
cat love.exe my-game.love > my-game.exe
```

3. Package for distribution — include all required DLLs alongside the exe:

```
my-game-win64/
├── my-game.exe            # Fused executable
├── love.dll
├── lua51.dll
├── mpg123.dll
├── msvcp120.dll
├── msvcr120.dll
├── OpenAL32.dll
├── SDL2.dll
└── license.txt            # Include LÖVE's license (zlib)
```

**Tip:** You can customize the exe icon using a tool like [rcedit](https://github.com/electron/rcedit):

```bash
rcedit my-game.exe --set-icon my-icon.ico
```

### macOS (.app)

1. Download `love-11.5-macos.zip` from [love2d.org](https://love2d.org).

2. Copy the `.love` file into the app bundle:

```bash
# Unzip to get love.app
unzip love-11.5-macos.zip

# Rename the app
mv love.app "My Game.app"

# Place your .love inside the bundle
cp my-game.love "My Game.app/Contents/Resources/"
```

3. Edit `My Game.app/Contents/Info.plist`:

```xml
<!-- Change the bundle identifier -->
<key>CFBundleIdentifier</key>
<string>com.yourname.mygame</string>

<!-- Change the display name -->
<key>CFBundleName</key>
<string>My Game</string>

<!-- Point to your .love file -->
<!-- The key UTExportedTypeDeclarations handles the .love association -->
```

4. Replace the app icon by swapping `My Game.app/Contents/Resources/OS X AppIcon.icns` with your own `.icns` file.

**Note:** Unsigned macOS apps trigger Gatekeeper warnings. For serious distribution, you'll need an Apple Developer account to sign and notarize the app.

### Linux (AppImage)

The recommended approach for Linux distribution is an **AppImage** — a single portable binary that runs on most distributions.

1. Download the official LÖVE AppImage from [love2d.org](https://love2d.org) or the [GitHub releases](https://github.com/love2d/love/releases).

2. Extract, fuse, and repackage:

```bash
# Extract the AppImage
./love-11.5-x86_64.AppImage --appimage-extract

# Copy your .love file into the extracted structure
# Since LÖVE 11.4+, the AppImage is relocatable
cat squashfs-root/bin/love my-game.love > squashfs-root/bin/love
chmod +x squashfs-root/bin/love

# Or simply fuse externally:
cat love-11.5-x86_64.AppImage my-game.love > MyGame-x86_64.AppImage
chmod +x MyGame-x86_64.AppImage
```

Since LÖVE 11.4, the AppImage is **relocatable** — you can extract its contents and rearrange them, and fusing works the same way as on Windows (concatenation).

---

## Automated Build Tools

Manual packaging is tedious. These community tools automate multi-platform builds:

| Tool | Language | Platforms | Notes |
|------|----------|-----------|-------|
| **makelove** | Python 3 | Windows, Linux (AppImage) | Most feature-rich; config file based |
| **boon** | Rust | Windows, macOS, Linux | Simple CLI, fast |
| **love-export** | Node.js | Windows, macOS, Linux | Quick and straightforward |
| **love-build** | Lua (LÖVE) | Windows, macOS, Linux | Built in LÖVE itself — no extra runtime needed |

### Example: makelove

```bash
pip install makelove

# Initialize config in your project
makelove init

# Build for all configured platforms
makelove

# Build for a specific platform
makelove win64
```

`makelove` reads a `makelove.toml` config file:

```toml
name = "My Game"
love_version = "11.5"
default_targets = ["win64", "appimage"]

[build]
icon = "icon.png"

[win64]
# Optional: path to rcedit for icon embedding
rcedit = "rcedit-x64.exe"
```

---

## Web Distribution (HTML5)

LÖVE does not natively support HTML5 export, but the community project **love.js** provides WebAssembly-based browser builds:

```bash
# love.js packages your game for the web
npx love.js my-game.love output-folder -t "My Game"
```

**Limitations of web builds:**
- Threading (`love.thread`) is not supported
- Filesystem access is emulated via IndexedDB
- Audio may require user interaction to start (browser autoplay policies)
- Performance varies by browser

---

## Distribution Checklist

Before shipping, verify:

- [ ] **`conf.lua` has `t.identity` set** — required for save data in fused mode
- [ ] **`conf.lua` has `t.version` set** — ensures compatibility warnings
- [ ] **Window icon is set** (`t.window.icon`) — shows in taskbar/dock
- [ ] **Unused modules are disabled** — reduces binary size and attack surface
- [ ] **License included** — LÖVE uses the zlib license; include `license.txt` in your distribution
- [ ] **Tested the fused build** on a clean machine (no LÖVE installed) to catch missing dependencies
- [ ] **Save data works** — verify `love.filesystem.getIdentity()` returns the correct name in fused mode
- [ ] **Error handling is graceful** — default LÖVE error screen shows in production; consider a custom `love.errorhandler`

---

## Custom Error Handler

Replace the default blue error screen with something branded:

```lua
function love.errorhandler(msg)
    -- Log the error
    local trace = debug.traceback(tostring(msg), 2)
    pcall(function()
        local file = love.filesystem.newFile("crash.log", "w")
        file:write(trace)
        file:close()
    end)

    -- Show a simple error screen
    love.graphics.reset()
    love.graphics.setBackgroundColor(0.1, 0.1, 0.1)
    local font = love.graphics.newFont(14)
    love.graphics.setFont(font)

    return function()
        love.event.pump()
        for _, a in love.event.poll() do
            if _ == "quit" then return 1 end
        end
        love.graphics.clear()
        love.graphics.setColor(1, 0.3, 0.3)
        love.graphics.printf("Oops! Something went wrong.\n\n" ..
            "A crash log has been saved.\n\n" ..
            "Press any key to exit.",
            50, 50, love.graphics.getWidth() - 100)
        love.graphics.present()
        love.timer.sleep(0.1)
    end
end
```

---

## Save Directory Locations by Platform

| Platform | Fused | Path |
|----------|-------|------|
| Windows | No | `%APPDATA%\LOVE\{identity}\` |
| Windows | Yes | `%APPDATA%\{identity}\` |
| macOS | No | `~/Library/Application Support/LOVE/{identity}/` |
| macOS | Yes | `~/Library/Application Support/{identity}/` |
| Linux | No | `~/.local/share/love/{identity}/` |
| Linux | Yes | `~/.local/share/{identity}/` |

The key difference: fused games drop the `LOVE/` prefix, giving your game its own top-level save directory.
