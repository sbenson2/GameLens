# G12 — Screenshot, Video Recording & Dev Tools

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E6 Testing & Debugging](../architecture/E6_testing_and_debugging.md) · [R4 Cargo Feature Collections](../reference/R4_cargo_feature_collections.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy 0.18 added first-party screenshot and video recording plugins to `bevy_dev_tools`. These are designed for quick captures during development — grabbing a screenshot for a bug report, recording a short clip for your devlog, or capturing trailer footage of a scene. They're not a full screen capture suite, but they remove the need for external tools during day-to-day development.

---

## EasyScreenshotPlugin

### Setup

The screenshot plugin lives in `bevy::dev_tools` and is gated behind the `bevy_dev_tools` feature (included in default features).

```rust
use bevy::prelude::*;
use bevy::dev_tools::EasyScreenshotPlugin;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(EasyScreenshotPlugin {
            trigger: KeyCode::F12,  // customize the trigger key
            ..default()
        })
        // ... your game systems
        .run();
}
```

### How It Works

Press the configured trigger key (default varies — `KeyCode::KeyP` is commonly used in examples) and Bevy captures the current frame as a PNG file. The screenshot is saved to the working directory.

### Practical Tips

- **Use in debug builds:** Screenshot capture works in both debug and release, but you'll typically use it during development.
- **Customize the key:** Pick a key that doesn't conflict with your game's input bindings. `F12`, `PrintScreen`, or `KeyP` are common choices.
- **Combine with diagnostics:** Take screenshots alongside `FrameTimeDiagnosticsPlugin` output to document performance issues visually.

```rust
// Pair screenshots with frame diagnostics for bug reports
app.add_plugins((
    EasyScreenshotPlugin { trigger: KeyCode::F12, ..default() },
    bevy::diagnostic::FrameTimeDiagnosticsPlugin::default(),
    bevy::diagnostic::LogDiagnosticsPlugin::default(),
));
```

---

## EasyScreenRecordPlugin

### Setup

Video recording requires the `screenrecording` feature flag in `bevy_dev_tools`.

```toml
[dependencies]
bevy = { version = "0.18", features = ["bevy_dev_tools/screenrecording"] }
```

```rust
use bevy::prelude::*;
use bevy::dev_tools::EasyScreenRecordPlugin;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(EasyScreenRecordPlugin::default())
        .run();
}
```

### How It Works

Press the **Space** key (default) to toggle recording on and off. While recording:

1. Bevy pauses virtual time and advances by a fixed frame interval per captured frame (default 30 FPS).
2. Each frame is encoded to H.264 via the x264 encoder.
3. When you stop recording, the raw `.h264` file is saved.

Convert the raw file to a standard video container with FFmpeg:

```bash
ffmpeg -i recording.h264 -c copy recording.mp4
```

### Programmatic Control

You can start and stop recording from code using `RecordScreen` messages, which is useful for automated capture during specific game events:

```rust
fn capture_boss_fight(
    mut commands: Commands,
    query: Query<&BossFight, Added<BossFight>>,
) {
    if query.iter().next().is_some() {
        // Start recording when the boss fight begins
        // (exact API for RecordScreen — check bevy::dev_tools docs)
    }
}
```

### Important Limitations

| Limitation | Details |
|-----------|---------|
| **No Windows support** | H.264 encoding depends on system libraries not easily available on Windows |
| **Performance impact** | Frame capture and encoding are expensive — always use `--release` builds |
| **Not for active gameplay** | The fixed-time-step approach produces smooth video but makes real-time interaction sluggish during recording |
| **Raw output format** | Output is raw H.264 — requires FFmpeg or similar tool to convert to `.mp4` |
| **GPU animation stalls** | Some GPU-skinned animations may stutter during capture |

### When to Use (and Not Use) Screen Recording

**Good for:**
- Capturing trailer footage of scripted scenes or camera fly-throughs
- Recording short clips for devlogs or social media
- Automated regression testing (capture a known scene, compare frames)
- Documenting visual bugs

**Not ideal for:**
- Recording real-time gameplay (input lag during recording)
- Long recording sessions (file sizes grow quickly)
- Windows development (use OBS or similar instead)

---

## Other Dev Tools in Bevy 0.18

Bevy bundles several other developer tools worth knowing about. These aren't new to 0.18 but pair well with the screenshot/recording plugins.

### Frame Time Diagnostics

```rust
use bevy::diagnostic::{FrameTimeDiagnosticsPlugin, LogDiagnosticsPlugin};

app.add_plugins((
    FrameTimeDiagnosticsPlugin::default(),
    LogDiagnosticsPlugin::default(),  // prints to console
));
```

Logs FPS, frame time, and frame time variance every second. Essential for profiling.

### Entity Count Diagnostics

```rust
use bevy::diagnostic::EntityCountDiagnosticsPlugin;

app.add_plugins(EntityCountDiagnosticsPlugin);
```

Tracks total entity count over time — useful for catching entity leaks.

### System Information

```rust
use bevy::diagnostic::SystemInformationDiagnosticsPlugin;

app.add_plugins(SystemInformationDiagnosticsPlugin::default());
```

Logs CPU and memory usage.

### Wireframe Rendering (3D)

```rust
use bevy::pbr::wireframe::WireframePlugin;

app.add_plugins(WireframePlugin);
// Then add Wireframe component to entities you want to visualize
commands.spawn((Mesh3d(mesh), Wireframe));
```

### Debug Gizmos

Gizmos draw temporary debug shapes (lines, circles, arrows) that last one frame — no entity needed:

```rust
fn debug_draw(mut gizmos: Gizmos) {
    // Draw a circle at the player's position
    gizmos.circle_2d(Vec2::new(100.0, 200.0), 50.0, Color::srgb(0.0, 1.0, 0.0));

    // Draw a line between two points
    gizmos.line(Vec3::ZERO, Vec3::new(10.0, 5.0, 0.0), Color::WHITE);

    // Draw an arrow
    gizmos.arrow(Vec3::ZERO, Vec3::Y * 3.0, Color::srgb(1.0, 0.0, 0.0));
}
```

Gizmos are invaluable for visualizing collision boxes, AI paths, spawn points, and physics forces without cluttering your scene with debug entities.

---

## Putting It All Together: A Dev Tools Setup

Here's a pattern for conditionally enabling dev tools in debug builds:

```rust
use bevy::prelude::*;

fn main() {
    let mut app = App::new();
    app.add_plugins(DefaultPlugins);

    // Only include dev tools in debug builds
    #[cfg(debug_assertions)]
    {
        use bevy::dev_tools::EasyScreenshotPlugin;
        use bevy::diagnostic::*;

        app.add_plugins((
            EasyScreenshotPlugin { trigger: KeyCode::F12, ..default() },
            FrameTimeDiagnosticsPlugin::default(),
            EntityCountDiagnosticsPlugin,
            LogDiagnosticsPlugin::default(),
        ));
    }

    app.add_systems(Startup, setup)
       .run();
}
```

This keeps dev tools out of your release binary entirely. The `#[cfg(debug_assertions)]` block compiles away in `--release` builds, so there's zero runtime cost in production.

---

## Rust Ownership Note

The `EasyScreenshotPlugin` and `EasyScreenRecordPlugin` structs are plain data — they implement `Default` and can be constructed with struct update syntax (`..default()`). They don't hold any borrowed references, so there are no lifetime concerns when configuring them. The actual frame capture happens internally via Bevy's render graph extraction, which safely accesses the GPU texture after rendering completes.
