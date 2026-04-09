# Extensions and Marketplace

> **Category:** guide · **Engine:** GameMaker · **Related:** [R1_gml_data_structures](../reference/R1_gml_data_structures.md), [E1_architecture_overview](../architecture/E1_architecture_overview.md), [G6_structs_state_machines](G6_structs_state_machines.md)

Extensions let you package reusable GML functions, constants, and native-platform libraries into portable assets. They are the primary mechanism for sharing code between projects and distributing functionality through the GameMaker Marketplace. This guide covers creating extensions, structuring them for maintainability, and publishing to the Marketplace.

---

## Extension Types

| Type | Platform Support | Use Case |
|------|-----------------|----------|
| **GML Extension** | All platforms | Pure GML function libraries — utility functions, math helpers, data structures |
| **DLL/dylib/SO** | Windows / macOS / Linux | Native code for performance-critical work — C/C++ libraries, OS-level APIs |
| **Android (Java/Kotlin)** | Android | SDK integrations — ads, analytics, in-app purchases, push notifications |
| **iOS (Objective-C/Swift)** | iOS / tvOS | SDK integrations — StoreKit, Game Center, platform-specific APIs |
| **JavaScript** | HTML5 | Browser APIs — WebGL extensions, Web Audio, IndexedDB, third-party JS libs |

GML extensions are the simplest and most portable. Start here unless you need native platform access.

---

## Creating a GML Extension

### Step 1: Create the Extension Asset

Right-click in the Asset Browser → **Create** → **Extension**. This creates an `.yy` extension definition file.

### Step 2: Add a GML File

In the Extension Editor, click **Add Placeholder** and choose a `.gml` file. This file holds your functions and is compatible with all target platforms.

```gml
/// @function array_shuffle(_array)
/// @description Returns a new array with elements in random order.
/// @param {Array} _array The source array to shuffle.
/// @returns {Array} A new shuffled array.
function array_shuffle(_array) {
    var _len = array_length(_array);
    var _result = array_create(_len);
    array_copy(_result, 0, _array, 0, _len);

    // Fisher-Yates shuffle
    for (var _i = _len - 1; _i > 0; _i--) {
        var _j = irandom(_i);
        var _temp = _result[_i];
        _result[_i] = _result[_j];
        _result[_j] = _temp;
    }

    return _result;
}
```

### Step 3: Define Functions in the Extension Editor

After adding the GML file, each function must be registered in the Extension Editor:

- **Name** — The function name as it will be called in GML.
- **External Name** — Must match the function name in the `.gml` file exactly.
- **Return Type** — `double` or `string` (GML's two primitive types).
- **Arguments** — Define each parameter's type.

For GML extensions, the editor auto-detects functions in most cases.

### Step 4: Define Macros (Constants)

Click **Macros** in the Extension Properties panel to add named constants:

```
EXT_VERSION    "1.2.0"
EXT_DEBUG      false
TILE_SIZE      16
```

Macros defined here are globally available wherever the extension is included.

---

## Extension File Structure

```
my_extension/
├── my_extension.yy          # Extension definition (auto-managed)
├── my_extension.gml         # GML source — functions, logic
├── datafiles/               # Optional: bundled data files
└── AndroidSource/           # Optional: Android-specific source
    └── Java/
        └── MyExtension.java
```

### Placeholder vs. Proxy Files

- **Placeholder file** — A generic file (any type except platform-specific binaries) that acts as a container. You attach functions and macros to it. The file itself isn't executed — it's a "linker" that groups your API definitions.
- **Proxy file** — A platform-specific replacement. When you need different native libraries per platform (e.g., `.dll` for Windows, `.dylib` for macOS), proxy files let you map them all to the same set of function declarations. Proxy files must share the same base filename — GameMaker selects the correct one at build time.

---

## Native Extensions (DLL Example)

For performance-critical code, you can wrap C/C++ libraries:

### 1. Write Your DLL (C)

```c
// my_native.c
#define GMEXPORT __declspec(dllexport)

GMEXPORT double my_fast_distance(double x1, double y1, double x2, double y2) {
    double dx = x2 - x1;
    double dy = y2 - y1;
    return sqrt(dx * dx + dy * dy);
}
```

### 2. Register in Extension Editor

Add the `.dll` file, then define the function:

- **Name:** `my_fast_distance`
- **External Name:** `my_fast_distance`
- **Return Type:** `double`
- **Arguments:** `double, double, double, double`

### 3. Platform Considerations

| Platform | Library Format | Notes |
|----------|---------------|-------|
| Windows | `.dll` | Must be 64-bit for modern GameMaker |
| macOS | `.dylib` | Requires code signing for distribution |
| Linux | `.so` | Compiled for x86_64 |
| HTML5 | `.js` | Use `window` object for global access |

---

## Extension Best Practices

### Naming Conventions

Prefix all functions and macros with a short namespace to avoid collisions:

```gml
// Good — namespaced
function ext_cam_shake(_intensity, _duration) { ... }
function ext_cam_follow(_target, _speed) { ... }

// Bad — generic names that will collide
function camera_shake(_intensity, _duration) { ... }
function follow(_target, _speed) { ... }
```

### Initialization and Cleanup

Use extension init/cleanup functions that run automatically:

```gml
/// @function ext_cam_init()
/// @description Called automatically when the extension loads.
function ext_cam_init() {
    global.__ext_cam = {
        shake_intensity: 0,
        shake_timer: 0,
        target: noone,
        follow_speed: 0.1
    };
}

/// @function ext_cam_cleanup()
/// @description Called when the game ends. Free resources here.
function ext_cam_cleanup() {
    global.__ext_cam = undefined;
}
```

Register these as **Init Function** and **Final Function** in the Extension Editor's properties.

### Documentation

Include a companion script or doc file with JSDoc-style comments. Feather (GameMaker's linter) reads `@function`, `@param`, and `@returns` tags for autocompletion.

```gml
/// @function ext_cam_shake(intensity, duration)
/// @description Triggers a screen shake effect on the active camera.
/// @param {Real} intensity Shake magnitude in pixels (1–20 recommended).
/// @param {Real} duration Duration in frames (60 = 1 second at 60fps).
/// @returns {Undefined}
```

---

## Publishing to the Marketplace

### Package Format

GameMaker uses **Local Asset Packages** (`.yymps` for 2.3+, legacy `.yymp`) to bundle extensions for distribution.

### Creating a Package

1. **Tools → Create Local Package** in the IDE.
2. Select the extension asset and any associated scripts, sprites, or objects.
3. Set package metadata:
   - **Display Name** — Human-readable name.
   - **Package ID** — Reverse-URL format: `com.yourname.extensionname`.
   - **Version** — Semantic versioning (e.g., `1.0.0`). Must increment on each update.

### Upload Process

1. Go to [marketplace.gamemaker.io](https://marketplace.gamemaker.io).
2. Register as a publisher (requires YoYo account).
3. Upload the `.yymps` file.
4. Fill in description, screenshots, and pricing.
5. Submit for review.

### Marketplace Guidelines

- **Test on all claimed platforms** before uploading. Mark unsupported platforms clearly.
- **Include a demo project** — buyers strongly prefer assets with working examples.
- **Version your package ID correctly** — uploading with a duplicate version number will fail.
- **Provide a README** script or included text file explaining setup, dependencies, and API usage.
- **Keep the extension self-contained** — avoid requiring other Marketplace assets unless explicitly documented as a dependency.

---

## Common Patterns

### Wrapping Native APIs for Cross-Platform

```gml
/// @function platform_vibrate(duration_ms)
/// @description Triggers haptic feedback. Falls back gracefully on unsupported platforms.
function platform_vibrate(_duration_ms) {
    switch (os_type) {
        case os_android:
            // Calls Java extension function
            ext_android_vibrate(_duration_ms);
            break;
        case os_ios:
            // Calls Objective-C extension function
            ext_ios_haptic(_duration_ms);
            break;
        default:
            // Desktop/HTML5 — no-op or visual feedback
            show_debug_message("Vibration not supported on this platform.");
            break;
    }
}
```

### Extension Configuration via Macros

Define user-configurable defaults as macros, then let users override in their project:

```gml
// In extension — default values
#macro EXT_CAM_DEFAULT_SPEED   0.1
#macro EXT_CAM_MAX_SHAKE       20
#macro EXT_CAM_SHAKE_DECAY     0.9
```

Users can redefine these macros in their own scripts to customize behavior without editing extension source.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Function not found at runtime | External Name doesn't match GML function name | Verify exact spelling in Extension Editor |
| DLL crashes on load | 32-bit DLL on 64-bit build (or vice versa) | Rebuild DLL matching your target architecture |
| Extension works in IDE but not in build | Files not included in package | Check "Copy to output" is enabled for data files |
| Marketplace upload fails | Duplicate version number or bad Package ID | Increment version; use `com.publisher.name` format |
| Macros not visible | Extension not in the resource tree | Ensure extension is added to the project, not just in a folder |
