# G48 — Audio Middleware Integration (FMOD & Wwise)

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G10 Audio Systems](./G10_audio_systems.md) · [G16 GDExtension Native Code](./G16_gdextension_native_code.md) · [G42 Platform Integration & Steamworks](./G42_platform_integration_and_steamworks.md) · [G22 Mobile & Web Export](./G22_mobile_and_web_export.md)

---

## What This Guide Covers

Godot's built-in audio system (AudioServer, AudioStreamPlayer, AudioBus) is solid for many games, but professional productions often need features that only dedicated audio middleware provides: adaptive music systems, real-time parameter-driven mixing, RTPC (Real-Time Parameter Control), complex event routing, occlusion/reverb simulation, and a non-linear authoring workflow for sound designers. The two industry-standard middleware solutions — **FMOD Studio** and **Audiokinetic Wwise** — both have GDExtension integrations for Godot 4.x.

This guide covers when to use audio middleware vs. Godot's built-in audio, how to set up both FMOD and Wwise integrations, the core workflow for each, spatial audio patterns, and practical code examples for common game audio scenarios.

**Use this guide when:** your game requires adaptive/dynamic audio, you're working with a dedicated sound designer who uses FMOD or Wwise, or you need features like real-time parameter control, convolution reverb, or complex music layering that exceed Godot's built-in capabilities.

---

## Table of Contents

1. [When to Use Audio Middleware](#1-when-to-use-audio-middleware)
2. [FMOD Studio Integration](#2-fmod-studio-integration)
3. [Wwise Integration](#3-wwise-integration)
4. [Core Concepts: Events, Parameters, and Banks](#4-core-concepts-events-parameters-and-banks)
5. [Playing Events in GDScript](#5-playing-events-in-gdscript)
6. [Spatial Audio and 3D Positioning](#6-spatial-audio-and-3d-positioning)
7. [Adaptive Music Systems](#7-adaptive-music-systems)
8. [Real-Time Parameter Control (RTPC)](#8-real-time-parameter-control-rtpc)
9. [Snapshots and Mixing States](#9-snapshots-and-mixing-states)
10. [Performance and Memory Management](#10-performance-and-memory-management)
11. [Export and Licensing](#11-export-and-licensing)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. When to Use Audio Middleware

| Feature | Godot Built-in | FMOD Studio | Wwise |
|---------|---------------|-------------|-------|
| Basic SFX playback | Yes | Yes | Yes |
| Audio bus routing | Yes (AudioBus) | Yes (advanced) | Yes (advanced) |
| 3D spatial audio | Yes (AudioStreamPlayer3D) | Yes (HRTF, occlusion) | Yes (HRTF, occlusion) |
| Real-time parameters | Manual (scripts) | Native (RTPC) | Native (RTPC/Game Syncs) |
| Adaptive music layers | Manual (complex) | Visual authoring | Visual authoring |
| Non-linear music | Very manual | Native (transitions, stingers) | Native (interactive music) |
| Sound designer workflow | Limited (Inspector) | Full DAW-like editor | Full DAW-like editor |
| Convolution reverb | No | Yes | Yes |
| Profiler/debugger | Basic | FMOD Profiler | Wwise Profiler |
| License cost | Free | Free < $200K revenue | Free < $150K budget |

**Use Godot built-in when:** your game has straightforward audio needs, you don't have a dedicated sound designer, or you want to minimize dependencies.

**Use FMOD/Wwise when:** you need adaptive music, complex spatial audio, or your sound designer already works in one of these tools.

---

## 2. FMOD Studio Integration

### Installation

The FMOD GDExtension (`fmod-gdextension`) is maintained by the community and supports Windows, macOS, Linux, Android, and iOS.

**Step 1:** Download the FMOD Studio API from [fmod.com](https://www.fmod.com/download) (requires free account).

**Step 2:** Download the Godot FMOD GDExtension from the [GitHub releases](https://github.com/utopia-rise/fmod-gdextension/releases) or the Godot Asset Library.

**Step 3:** Copy the `addons/fmod/` folder into your Godot project.

**Step 4:** Copy the FMOD native libraries into the correct platform folders as documented in the plugin's setup guide.

**Step 5:** Enable the plugin in Project Settings → Plugins → FMOD GDExtension.

### Project Structure

```
project/
├── addons/fmod/              # GDExtension plugin
├── fmod/                     # Your FMOD Studio banks
│   ├── Master.bank
│   ├── Master.strings.bank
│   └── SFX.bank
└── project.godot
```

### Configuring Banks

In Project Settings → FMOD, set the bank path to your exported banks directory. The Master and Master.strings banks are loaded automatically on startup.

```gdscript
## Load additional banks at runtime
func load_music_bank() -> void:
    FmodServer.load_bank("res://fmod/Music.bank", FmodServer.FMOD_STUDIO_LOAD_BANK_NORMAL)
```

---

## 3. Wwise Integration

### Installation

The official Wwise integration (`wwise-godot-integration`) is maintained by Audiokinetic and supports Windows, macOS, Linux, Android, and iOS.

**Step 1:** Install the Wwise SDK via the Audiokinetic Launcher.

**Step 2:** Download the Wwise Godot Integration from the [GitHub repository](https://github.com/alessandrofama/wwise-godot-integration).

**Step 3:** Copy the `addons/wwise/` folder into your Godot project.

**Step 4:** Set the Wwise SDK path in the plugin configuration or via environment variable.

**Step 5:** Enable the plugin in Project Settings → Plugins.

### Project Structure

```
project/
├── addons/wwise/               # GDExtension plugin
├── wwise/                      # Generated SoundBanks
│   ├── Init.bnk
│   ├── GeneratedSoundBanks/
│   └── Wwise_IDs.gd           # Auto-generated event/RTPC IDs
└── project.godot
```

### Wwise Nodes

The integration provides custom nodes that integrate with Godot's scene tree:

- `AkEvent3D` / `AkEvent2D` — Play Wwise events attached to a node's position.
- `AkBank` — Load/unload SoundBanks.
- `AkListener3D` / `AkListener2D` — Define the listener position (usually on the camera).
- `AkEnvironment` — Define reverb/environment zones.
- `AkEarlyReflections` — Geometry-driven early reflections.

---

## 4. Core Concepts: Events, Parameters, and Banks

Both FMOD and Wwise share the same fundamental concepts, though they use different terminology:

| Concept | FMOD | Wwise | Purpose |
|---------|------|-------|---------|
| Sound event | Event | Event | A triggered sound (footstep, explosion, music cue) |
| Parameters | Parameter | Game Parameter / RTPC | Values that modify playback (speed, health, distance) |
| Container | Bank | SoundBank | Package of audio assets loaded into memory |
| Mix snapshot | Snapshot | State | A preset mixing state (combat, underwater, paused) |
| Listener | Listener | Listener | The point in space where audio is "heard" |
| Bus | Bus / VCA | Bus | Audio routing and volume control channel |

### Event-Driven Audio

Instead of playing audio files directly, you trigger **events** by name or ID. The middleware decides which sound to play based on the event's configuration (randomization, conditions, parameters).

```
# Instead of this (Godot built-in):
$AudioStreamPlayer.stream = preload("res://footstep_01.ogg")
$AudioStreamPlayer.play()

# You do this (middleware):
FmodServer.play_one_shot("event:/Player/Footstep")
```

The sound designer can then add variation, surface-type switching, and volume randomization in the FMOD/Wwise editor — no code changes needed.

---

## 5. Playing Events in GDScript

### FMOD

```gdscript
## One-shot (fire and forget) — good for UI clicks, impacts
func play_ui_click() -> void:
    FmodServer.play_one_shot("event:/UI/Click")

## Persistent instance — good for looping sounds, music
var _engine_event: FmodEvent

func start_engine_sound() -> void:
    _engine_event = FmodServer.create_event_instance("event:/Vehicle/Engine")
    _engine_event.start()

func stop_engine_sound() -> void:
    if _engine_event:
        _engine_event.stop(FmodServer.FMOD_STUDIO_STOP_ALLOWFADEOUT)
        _engine_event.release()
        _engine_event = null
```

### Using FMOD Nodes

```gdscript
## Attach an FmodEventEmitter3D to a CharacterBody3D
## The emitter automatically updates its 3D position to match the node
@onready var footstep_emitter: FmodEventEmitter3D = $FmodEventEmitter3D

func _on_footstep() -> void:
    footstep_emitter.play()
```

### Wwise

```gdscript
## Post an event using Wwise IDs (auto-generated)
func play_footstep() -> void:
    AkSoundEngine.post_event(AK.EVENTS.PLAY_FOOTSTEP, self)

## Post with a callback
func play_dialogue(line_id: int) -> void:
    AkSoundEngine.post_event_callback(
        AK.EVENTS.PLAY_DIALOGUE,
        AkSoundEngine.AK_DURATION | AkSoundEngine.AK_END_OF_EVENT,
        self,
        "_on_dialogue_callback"
    )

func _on_dialogue_callback(data: Dictionary) -> void:
    if data["callback_type"] == AkSoundEngine.AK_END_OF_EVENT:
        dialogue_finished.emit()
```

---

## 6. Spatial Audio and 3D Positioning

### FMOD 3D Events

```gdscript
extends CharacterBody3D

var _footstep_instance: FmodEvent

func _ready() -> void:
    _footstep_instance = FmodServer.create_event_instance("event:/Player/Footstep")

func _process(_delta: float) -> void:
    # Update the event's 3D attributes to match this node's position
    if _footstep_instance:
        _footstep_instance.set_3d_attributes(global_transform)

func _on_step() -> void:
    _footstep_instance.start()
```

### Wwise Spatial Audio

Wwise provides geometry-aware spatial audio with the `AkGeometry` and `AkEarlyReflections` nodes:

```gdscript
## Attach AkEvent3D to a moving enemy
## The Wwise integration automatically sends position updates

## For listener setup, add AkListener3D to your camera:
## Camera3D
##   └── AkListener3D    ← listener follows camera automatically
```

### Occlusion

Both FMOD and Wwise support occlusion (muffling sounds behind walls). Implementation depends on the middleware:

```gdscript
## FMOD occlusion via raycast
func update_occlusion(emitter_pos: Vector3, listener_pos: Vector3) -> void:
    var space := get_world_3d().direct_space_state
    var query := PhysicsRayQueryParameters3D.create(listener_pos, emitter_pos)
    query.collision_mask = 1  # Occlusion layer

    var result := space.intersect_ray(query)
    var occlusion_value := 1.0 if result else 0.0

    _event_instance.set_parameter_by_name("Occlusion", occlusion_value)
```

---

## 7. Adaptive Music Systems

One of the primary reasons to use audio middleware is adaptive music — music that responds to gameplay.

### FMOD Music Transitions

In FMOD Studio, the sound designer creates a music event with multiple regions, transition markers, and parameter-driven layers. The programmer just sets parameters:

```gdscript
## music_manager.gd — Autoload
extends Node

var _music_event: FmodEvent

func start_music() -> void:
    _music_event = FmodServer.create_event_instance("event:/Music/GameplayMusic")
    _music_event.start()

func set_intensity(value: float) -> void:
    ## The sound designer mapped "Intensity" from 0 (exploration) to 1 (boss fight)
    ## FMOD handles the crossfading, layering, and transitions automatically
    if _music_event:
        _music_event.set_parameter_by_name("Intensity", clampf(value, 0.0, 1.0))

func transition_to_boss() -> void:
    set_intensity(1.0)

func transition_to_exploration() -> void:
    set_intensity(0.0)
```

### Wwise Interactive Music

```gdscript
## Wwise uses States and Switches for music transitions
func enter_combat() -> void:
    AkSoundEngine.set_state(AK.STATES.GAMESTATE.GROUP, AK.STATES.GAMESTATE.STATE.COMBAT)

func enter_exploration() -> void:
    AkSoundEngine.set_state(AK.STATES.GAMESTATE.GROUP, AK.STATES.GAMESTATE.STATE.EXPLORATION)

func trigger_stinger() -> void:
    AkSoundEngine.post_event(AK.EVENTS.PLAY_STINGER_VICTORY, self)
```

---

## 8. Real-Time Parameter Control (RTPC)

RTPCs let you drive audio behavior from gameplay values — health, speed, altitude, time of day.

### FMOD Parameters

```gdscript
## Vehicle engine that responds to RPM and speed
func _process(delta: float) -> void:
    if _engine_event:
        _engine_event.set_parameter_by_name("RPM", engine_rpm)
        _engine_event.set_parameter_by_name("Speed", current_speed)
        _engine_event.set_parameter_by_name("Surface",
            1.0 if is_on_gravel else 0.0)
```

### Wwise Game Parameters

```gdscript
func _process(delta: float) -> void:
    AkSoundEngine.set_rtpc_value("Player_Health", health / max_health)
    AkSoundEngine.set_rtpc_value("Player_Speed", velocity.length())
    AkSoundEngine.set_rtpc_value("TimeOfDay", world_time / 24.0)
```

### Design Pattern: Audio Parameter Bridge

Create an autoload that syncs game state to audio parameters each frame:

```gdscript
## audio_bridge.gd — Autoload that syncs game state to middleware params
extends Node

@export var player_path: NodePath

@onready var _player: CharacterBody3D = get_node(player_path)

func _process(_delta: float) -> void:
    if not _player:
        return

    var health_ratio: float = _player.health / float(_player.max_health)
    var speed: float = _player.velocity.length()
    var altitude: float = _player.global_position.y

    # FMOD version
    FmodServer.set_global_parameter_by_name("PlayerHealth", health_ratio)
    FmodServer.set_global_parameter_by_name("PlayerSpeed", speed)
    FmodServer.set_global_parameter_by_name("Altitude", altitude)

    # OR Wwise version
    # AkSoundEngine.set_rtpc_value("PlayerHealth", health_ratio)
    # AkSoundEngine.set_rtpc_value("PlayerSpeed", speed)
    # AkSoundEngine.set_rtpc_value("Altitude", altitude)
```

---

## 9. Snapshots and Mixing States

### FMOD Snapshots

Snapshots modify the mix in real-time (duck music during dialogue, muffle audio when paused):

```gdscript
var _pause_snapshot: FmodEvent

func pause_game() -> void:
    _pause_snapshot = FmodServer.create_event_instance("snapshot:/PauseMenu")
    _pause_snapshot.start()

func unpause_game() -> void:
    if _pause_snapshot:
        _pause_snapshot.stop(FmodServer.FMOD_STUDIO_STOP_ALLOWFADEOUT)
        _pause_snapshot.release()
        _pause_snapshot = null
```

### Wwise States

```gdscript
func enter_underwater() -> void:
    AkSoundEngine.set_state(AK.STATES.ENVIRONMENT.GROUP, AK.STATES.ENVIRONMENT.STATE.UNDERWATER)

func exit_underwater() -> void:
    AkSoundEngine.set_state(AK.STATES.ENVIRONMENT.GROUP, AK.STATES.ENVIRONMENT.STATE.DEFAULT)
```

---

## 10. Performance and Memory Management

### Bank Loading Strategy

Don't load all audio into memory at once. Load banks by game area or feature:

```gdscript
## Load/unload banks when changing game areas
func _on_enter_forest_area() -> void:
    FmodServer.load_bank("res://fmod/Forest.bank", FmodServer.FMOD_STUDIO_LOAD_BANK_NORMAL)

func _on_exit_forest_area() -> void:
    FmodServer.unload_bank("res://fmod/Forest.bank")
```

### Voice Limits

Both FMOD and Wwise have voice limiting (maximum simultaneous sounds). Configure these in the middleware editor, not in code. Typical settings:

- **Max real voices:** 32–64 (actually playing audio)
- **Max virtual voices:** 256–1024 (tracked but silent — for priority management)

### Profiling

- **FMOD:** Connect the FMOD Studio Profiler to a running game via Live Update (network connection). Shows CPU usage, voice count, memory, and per-event stats.
- **Wwise:** Connect the Wwise Authoring Tool's Profiler. Shows voice graph, memory, streaming, and performance warnings.

Enable Live Update only in debug builds:

```gdscript
## In your FMOD initialization
func _ready() -> void:
    if OS.is_debug_build():
        FmodServer.set_live_update_enabled(true)
```

---

## 11. Export and Licensing

### FMOD Licensing

- **Free** for games with total budget under $200K USD.
- **Indie license** for budgets $200K–$500K.
- **Commercial license** for larger projects.
- You must include FMOD attribution in your credits.

### Wwise Licensing

- **Free** for projects with total budget under $150K USD.
- **Project-based licensing** above that threshold.
- Includes a limit of 200 media assets in the free tier.

### Export Checklist

1. Export your FMOD/Wwise banks for each target platform (Windows, macOS, Linux, Android, iOS).
2. Include the correct native libraries (`.dll`, `.dylib`, `.so`) in your export template.
3. Test audio playback on each target platform — spatial audio behavior can differ.
4. Strip Live Update/profiling from release builds.
5. Verify licensing compliance before shipping.

---

## 12. Common Mistakes

1. **Not releasing event instances** — FMOD event instances must be explicitly released after stopping. Forgetting this leaks memory and voices.
2. **Loading all banks at startup** — Large games can have hundreds of MB of audio. Load and unload banks as players move through content.
3. **Setting parameters every frame unnecessarily** — Only update parameters when the value actually changes. Both FMOD and Wwise handle interpolation internally.
4. **Ignoring the sound designer's workflow** — The whole point of middleware is collaboration. Don't hardcode audio behavior in scripts that the sound designer should control in the middleware editor.
5. **Forgetting platform-specific libraries** — Each platform needs its own native FMOD/Wwise libraries. Test exports on all target platforms.
6. **Mixing Godot AudioServer with middleware** — Pick one audio system. Running both simultaneously wastes CPU and causes confusion about which system is handling what.
7. **Not testing with headphones** — Spatial audio and HRTF effects are dramatically different on speakers vs. headphones. Test both.
