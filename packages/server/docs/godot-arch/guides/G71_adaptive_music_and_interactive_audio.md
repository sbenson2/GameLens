# G71 — Adaptive Music & Interactive Audio

> **Category:** Guide · **Engine:** Godot 4.3+ · **Language:** GDScript / C#
> **Related:** [G10 Audio Systems](./G10_audio_systems.md) · [G48 Audio Middleware (FMOD/Wwise)](./G48_audio_middleware_fmod_wwise.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G37 Scene Management & Transitions](./G37_scene_management_and_transitions.md)

---

## What This Guide Covers

Godot 4.3 introduced three powerful audio stream types — `AudioStreamInteractive`, `AudioStreamPlaylist`, and `AudioStreamSynchronized` — that enable adaptive music systems previously requiring middleware like FMOD or Wwise. This guide covers how to use these built-in tools to create music that responds to gameplay: layered stems that fade in/out, beat-synced transitions between tracks, playlists that shuffle exploration music, and practical patterns for tying audio state to game state.

**Use this guide when:** you want music that changes with gameplay intensity, smooth transitions between combat and exploration themes, layered instrument stems, or beat-aligned track switching — all without external middleware.

**G10** covers foundational audio (buses, spatial audio, sound effects). **G48** covers FMOD/Wwise integration. This guide covers Godot's built-in interactive music system.

---

## Table of Contents

1. [Adaptive Music Concepts](#1-adaptive-music-concepts)
2. [AudioStreamSynchronized — Layered Stems](#2-audiostreamsynchronized--layered-stems)
3. [AudioStreamInteractive — State-Based Transitions](#3-audiostreaminteractive--state-based-transitions)
4. [AudioStreamPlaylist — Sequential and Shuffle Playback](#4-audiostreamplaylist--sequential-and-shuffle-playback)
5. [Combining Systems](#5-combining-systems)
6. [Beat and Bar Synchronization](#6-beat-and-bar-synchronization)
7. [Connecting Music to Game State](#7-connecting-music-to-game-state)
8. [Audio Bus Setup for Music Layers](#8-audio-bus-setup-for-music-layers)
9. [Performance and Memory](#9-performance-and-memory)
10. [Common Mistakes](#10-common-mistakes)
11. [C# Examples](#11-c-examples)

---

## 1. Adaptive Music Concepts

Adaptive music changes in response to what the player is doing. There are two main techniques:

### Horizontal Re-sequencing

Switch between different music clips at musically appropriate moments (beat boundaries, bar boundaries, end of phrase). Think of moving from an "exploration" track to a "combat" track when enemies appear.

**Godot tool:** `AudioStreamInteractive`

### Vertical Layering (Stems)

Play multiple synchronized audio tracks simultaneously — drums, bass, melody, strings — and control each layer's volume independently. Adding layers increases intensity; removing them decreases it.

**Godot tool:** `AudioStreamSynchronized`

### Playlists

Play a sequence of tracks with optional shuffle, looping, and crossfade. Good for ambient exploration music or menu screen tracks.

**Godot tool:** `AudioStreamPlaylist`

---

## 2. AudioStreamSynchronized — Layered Stems

`AudioStreamSynchronized` plays multiple audio streams in perfect sync. Each stream is a "layer" whose volume you control independently.

### Creating a Layered Music Resource

1. In the Inspector, create a new `AudioStreamSynchronized` resource
2. Set `stream_count` to the number of layers (e.g., 4)
3. Assign each stream slot an audio file (`.ogg` or `.wav`)

**Critical requirement:** All stem files must have the **exact same length, sample rate, and tempo**. Even a fraction of a second difference causes drift.

### Resource Setup

```
AudioStreamSynchronized
├── stream_count: 4
├── stream_0: res://audio/music/combat_drums.ogg
├── stream_1: res://audio/music/combat_bass.ogg
├── stream_2: res://audio/music/combat_melody.ogg
└── stream_3: res://audio/music/combat_strings.ogg
```

### Controlling Layers via Script

```gdscript
class_name AdaptiveMusicPlayer
extends AudioStreamPlayer

## Maps intensity levels to which stems are active
## Each stem: [drums, bass, melody, strings]
const INTENSITY_LAYERS: Dictionary[int, Array] = {
    0: [false, false, false, false],  # Silence
    1: [false, true,  false, false],  # Calm — bass only
    2: [true,  true,  false, false],  # Building — drums + bass
    3: [true,  true,  true,  false],  # Action — drums + bass + melody
    4: [true,  true,  true,  true],   # Full combat — all layers
}

var _current_intensity: int = 0
var _target_volumes: Array[float] = [0.0, 0.0, 0.0, 0.0]

@export var fade_duration: float = 1.5
@export var layer_count: int = 4

func set_intensity(level: int) -> void:
    level = clampi(level, 0, INTENSITY_LAYERS.size() - 1)
    if level == _current_intensity:
        return
    _current_intensity = level
    
    var layers: Array = INTENSITY_LAYERS[level]
    for i in range(layer_count):
        var target_db: float = 0.0 if layers[i] else -80.0
        _fade_layer(i, target_db)

func _fade_layer(index: int, target_db: float) -> void:
    var playback := get_stream_playback() as AudioStreamPlaybackSynchronized
    if not playback:
        return
    
    # Create a tween to smoothly fade the layer volume
    var tween := create_tween()
    tween.tween_method(
        func(db: float): playback.set_stream_volume(index, db),
        playback.get_stream_volume(index),
        target_db,
        fade_duration
    )

func _ready() -> void:
    # Start playing — all layers run simultaneously
    play()
    # Mute all layers initially
    var playback := get_stream_playback() as AudioStreamPlaybackSynchronized
    for i in range(layer_count):
        playback.set_stream_volume(i, -80.0)
```

### Best Practices for Stems

- **Export stems at the same loudness** — normalize all stems to the same LUFS target
- **Use .ogg for music** — smaller files, good quality, seamless looping with loop points
- **Loop points matter** — set loop start/end in the Import dock for seamless playback
- **4–6 layers max** — more layers means more memory and CPU; group instruments

---

## 3. AudioStreamInteractive — State-Based Transitions

`AudioStreamInteractive` manages transitions between distinct music clips (horizontal re-sequencing). You define clips and a transition table that controls how and when each clip can transition to another.

### Setting Up Clips

```
AudioStreamInteractive
├── clip_count: 3
├── clip_0:
│   ├── name: "Explore"
│   ├── stream: res://audio/music/explore_loop.ogg
│   └── auto_advance: DISABLED
├── clip_1:
│   ├── name: "Combat"
│   ├── stream: res://audio/music/combat_loop.ogg
│   └── auto_advance: DISABLED
└── clip_2:
    ├── name: "Boss"
    ├── stream: res://audio/music/boss_loop.ogg
    └── auto_advance: DISABLED
```

### Transition Table

The transition table defines how to move between clips:

| From \ To | Explore | Combat | Boss |
|-----------|---------|--------|------|
| Explore | — | Next Beat | Immediate (Crossfade) |
| Combat | Next Bar | — | Next Beat |
| Boss | Next Bar | Next Bar | — |

### Transition Types

| Type | Behavior |
|------|----------|
| `TRANSITION_IMMEDIATE` | Switch right now |
| `TRANSITION_SYNC` | Switch at the next beat/bar boundary |
| `TRANSITION_FROM_END` | Wait for the current clip to finish |

### Fade Modes

| Mode | Behavior |
|------|----------|
| `FADE_DISABLED` | Hard cut |
| `FADE_IN` | New clip fades in |
| `FADE_OUT` | Old clip fades out |
| `FADE_CROSS` | Crossfade between old and new |

### Switching Clips via Script

```gdscript
@onready var music_player: AudioStreamPlayer = $MusicPlayer

func switch_to_combat() -> void:
    var playback := music_player.get_stream_playback() as AudioStreamPlaybackInteractive
    playback.switch_to_clip_by_name(&"Combat")

func switch_to_explore() -> void:
    var playback := music_player.get_stream_playback() as AudioStreamPlaybackInteractive
    playback.switch_to_clip_by_name(&"Explore")
```

### Setting BPM and Beat Size

For beat-synced transitions, configure the stream's musical properties:

```gdscript
# In the AudioStreamInteractive resource (Inspector or code):
# initial_clip: 0 (start on "Explore")
# clip_0/stream → In the Import dock, set:
#   bpm: 120
#   beat_count: 16
#   bar_beats: 4
```

The `bpm`, `beat_count`, and `bar_beats` properties are set on the individual `AudioStream` resources in the Import dock — not on the `AudioStreamInteractive` itself.

---

## 4. AudioStreamPlaylist — Sequential and Shuffle Playback

`AudioStreamPlaylist` plays a list of streams in order or shuffled, with crossfade support.

### Setup

```
AudioStreamPlaylist
├── stream_count: 4
├── stream_0: res://audio/music/ambient_01.ogg
├── stream_1: res://audio/music/ambient_02.ogg
├── stream_2: res://audio/music/ambient_03.ogg
├── stream_3: res://audio/music/ambient_04.ogg
├── shuffle: true
├── loop: true
└── fade_time: 2.0  # Crossfade between tracks
```

### Use Cases

- **Menu music** — shuffle a few tracks to avoid repetition
- **Exploration ambience** — cycle through environmental tracks
- **Jukebox system** — player-selected playlists

```gdscript
# Create a playlist programmatically
var playlist := AudioStreamPlaylist.new()
playlist.stream_count = ambient_tracks.size()
for i in range(ambient_tracks.size()):
    playlist.set_list_stream(i, ambient_tracks[i])
playlist.shuffle = true
playlist.loop = true
playlist.fade_time = 2.5

$MusicPlayer.stream = playlist
$MusicPlayer.play()
```

---

## 5. Combining Systems

The real power comes from nesting these stream types:

### Example: Layered Combat with Exploration Transitions

```
AudioStreamInteractive
├── clip_0: "Explore"
│   └── stream: AudioStreamPlaylist (3 ambient tracks, shuffled)
├── clip_1: "Combat"
│   └── stream: AudioStreamSynchronized (4 stems: drums, bass, melody, strings)
└── clip_2: "Boss"
    └── stream: AudioStreamSynchronized (5 stems: boss theme layers)
```

This gives you:
- **Exploration:** shuffled ambient tracks with crossfade
- **Combat:** layered stems you can mix by intensity
- **Boss:** its own layered theme
- **Transitions:** beat-synced switching between all three states

### Controller Script

```gdscript
class_name MusicController
extends Node

@onready var player: AudioStreamPlayer = $MusicPlayer
var _current_state: StringName = &"Explore"

func transition_to(state: StringName) -> void:
    if state == _current_state:
        return
    _current_state = state
    
    var playback := player.get_stream_playback() as AudioStreamPlaybackInteractive
    playback.switch_to_clip_by_name(state)

func set_combat_intensity(level: int) -> void:
    # Only works when the current clip uses AudioStreamSynchronized
    if _current_state != &"Combat":
        return
    
    var interactive_pb := player.get_stream_playback() as AudioStreamPlaybackInteractive
    # Access the synchronized playback within the interactive clip
    # Note: accessing nested playbacks requires the clip to be active
    # The stem volumes are controlled through the AudioStreamSynchronized resource
    _update_stem_volumes(level)

func _update_stem_volumes(level: int) -> void:
    # Adjust individual stem volumes based on intensity
    # This requires direct access to the synchronized stream's playback
    pass  # Implementation depends on your nesting depth
```

> **Tip:** Deep nesting (Interactive → Synchronized → individual streams) works but gets hard to debug. For complex games, consider using `AudioStreamInteractive` for scene-level transitions and separate `AudioStreamPlayer` nodes with `AudioStreamSynchronized` for per-scene layer control.

---

## 6. Beat and Bar Synchronization

### Setting Musical Properties

In the Import dock for each `.ogg` / `.wav` file:

| Property | Meaning | Example |
|----------|---------|---------|
| `bpm` | Beats per minute | 120 |
| `beat_count` | Total beats in the clip | 64 (16 bars × 4 beats) |
| `bar_beats` | Beats per bar (time signature numerator) | 4 |
| `loop_mode` | How the clip loops | Forward |
| `loop_begin` | Loop start sample | 0 |
| `loop_end` | Loop end sample | (end of file) |

### Querying Beat Position

```gdscript
func _process(_delta: float) -> void:
    if player.playing:
        var pos: float = player.get_playback_position()
        var stream: AudioStream = player.stream
        
        if stream is AudioStreamOggVorbis:
            var bpm: float = stream.bpm
            if bpm > 0.0:
                var beat: float = pos / (60.0 / bpm)
                var current_beat: int = int(beat) % int(stream.bar_beats)
                var current_bar: int = int(beat) / int(stream.bar_beats)
                # Use current_beat / current_bar for visual sync
```

### Syncing Visual Effects to Beats

```gdscript
signal beat_hit(beat_number: int)
signal bar_hit(bar_number: int)

var _last_beat: int = -1

func _process(_delta: float) -> void:
    if not player.playing:
        return
    
    var pos: float = player.get_playback_position()
    var bpm: float = 120.0  # Get from your stream
    var beat: int = int(pos / (60.0 / bpm))
    
    if beat != _last_beat:
        _last_beat = beat
        beat_hit.emit(beat)
        if beat % 4 == 0:
            bar_hit.emit(beat / 4)
```

---

## 7. Connecting Music to Game State

### Signal-Driven Music Manager

```gdscript
class_name GameMusicManager
extends Node

@onready var music: AudioStreamPlayer = $MusicPlayer

## Connect to game signals to drive music state
func _ready() -> void:
    # Assuming a GameEvents autoload (see G3 Signal Architecture)
    GameEvents.combat_started.connect(_on_combat_started)
    GameEvents.combat_ended.connect(_on_combat_ended)
    GameEvents.boss_encountered.connect(_on_boss_encountered)
    GameEvents.player_health_changed.connect(_on_health_changed)
    GameEvents.area_entered.connect(_on_area_entered)

func _on_combat_started() -> void:
    _switch_clip(&"Combat")
    _set_intensity(2)  # Start at medium

func _on_combat_ended() -> void:
    _switch_clip(&"Explore")

func _on_boss_encountered(_boss_name: String) -> void:
    _switch_clip(&"Boss")

func _on_health_changed(current: int, max_hp: int) -> void:
    # Ramp intensity as health drops
    var health_pct: float = float(current) / float(max_hp)
    if health_pct < 0.25:
        _set_intensity(4)  # Critical — full intensity
    elif health_pct < 0.5:
        _set_intensity(3)
    else:
        _set_intensity(2)

func _on_area_entered(area_name: String) -> void:
    # Different exploration playlists per area
    match area_name:
        "forest":
            _load_exploration_playlist("res://audio/playlists/forest.tres")
        "dungeon":
            _load_exploration_playlist("res://audio/playlists/dungeon.tres")

func _switch_clip(clip_name: StringName) -> void:
    var pb := music.get_stream_playback() as AudioStreamPlaybackInteractive
    if pb:
        pb.switch_to_clip_by_name(clip_name)

func _set_intensity(_level: int) -> void:
    pass  # Delegate to stem volume control

func _load_exploration_playlist(_path: String) -> void:
    pass  # Load and assign new playlist resource
```

---

## 8. Audio Bus Setup for Music Layers

Route music through a dedicated bus structure for global volume control:

```
Master
├── Music (volume slider in settings)
│   ├── MusicStems (for synchronized layers)
│   └── MusicAmbient (for playlist/ambient)
├── SFX
└── UI
```

```gdscript
# Route the music player to the Music bus
$MusicPlayer.bus = &"Music"

# Apply effects to the music bus for transitions
# e.g., Low-pass filter when pausing the game
func _on_game_paused() -> void:
    var bus_idx: int = AudioServer.get_bus_index("Music")
    var filter: AudioEffectLowPassFilter = AudioServer.get_bus_effect(bus_idx, 0)
    var tween := create_tween()
    tween.tween_property(filter, "cutoff_hz", 800.0, 0.5)

func _on_game_resumed() -> void:
    var bus_idx: int = AudioServer.get_bus_index("Music")
    var filter: AudioEffectLowPassFilter = AudioServer.get_bus_effect(bus_idx, 0)
    var tween := create_tween()
    tween.tween_property(filter, "cutoff_hz", 20500.0, 0.3)
```

---

## 9. Performance and Memory

### Memory Considerations

| Stream Type | Memory Use |
|-------------|-----------|
| `.ogg` (Vorbis) | Streamed from disk — low memory (~few KB buffer) |
| `.wav` | Loaded entirely into RAM — fast but large |
| `.mp3` | Streamed — similar to .ogg but no loop point support |

**Recommendation:** Use `.ogg` for music stems. A 4-stem synchronized setup with 2-minute loops at 192kbps ≈ 12 MB on disk, ~50 KB in RAM (streamed).

### CPU Cost

- `AudioStreamSynchronized` with 4 layers: negligible CPU vs. a single stream
- `AudioStreamInteractive` transition logic: negligible
- Beat tracking in `_process()`: negligible
- The audio mixer itself: one thread, scales with bus count and effects

### Optimization Tips

- **Pre-load music resources** during scene transitions — not during gameplay
- **Limit simultaneous layers** to 6 or fewer for mobile targets
- **Use .ogg, not .wav** for music — file size matters for download and load time
- **Set unused layers to -80 dB** rather than stopping/starting streams — avoids sync issues

---

## 10. Common Mistakes

### Stems Drift Out of Sync

**Cause:** Audio files have slightly different lengths (even by a few samples).

**Fix:** Export all stems from the same DAW project with identical start/end points. Verify file lengths match exactly (`ffprobe -show_entries format=duration`).

### Transitions Sound Abrupt

**Cause:** `TRANSITION_IMMEDIATE` with `FADE_DISABLED` causes a hard cut mid-note.

**Fix:** Use `TRANSITION_SYNC` with `FADE_CROSS` and set appropriate BPM/bar data on the source stream.

### Music Doesn't Loop

**Cause:** Loop mode not set, or loop points not configured in Import dock.

**Fix:** Select the audio file → Import dock → set `loop_mode` to Forward, verify `loop_begin` and `loop_end`.

### Beat-Synced Transitions Fire at Wrong Time

**Cause:** BPM not set on the `AudioStream` resource, so the engine can't calculate beat boundaries.

**Fix:** Set `bpm`, `beat_count`, and `bar_beats` in the Import dock for each audio file used in `AudioStreamInteractive`.

---

## 11. C# Examples

### Basic Interactive Music Controller

```csharp
using Godot;

public partial class MusicController : Node
{
    [Export] private AudioStreamPlayer _musicPlayer;
    
    private StringName _currentState = new("Explore");

    public void TransitionTo(StringName state)
    {
        if (state == _currentState) return;
        _currentState = state;
        
        var playback = _musicPlayer.GetStreamPlayback() as AudioStreamPlaybackInteractive;
        playback?.SwitchToClipByName(state);
    }
}
```

### Stem Volume Controller

```csharp
using Godot;

public partial class StemController : AudioStreamPlayer
{
    [Export] public float FadeDuration { get; set; } = 1.5f;

    public void SetLayerActive(int index, bool active)
    {
        var playback = GetStreamPlayback() as AudioStreamPlaybackSynchronized;
        if (playback == null) return;
        
        float targetDb = active ? 0.0f : -80.0f;
        float currentDb = playback.GetStreamVolume(index);
        
        var tween = CreateTween();
        tween.TweenMethod(
            Callable.From((float db) => playback.SetStreamVolume(index, db)),
            currentDb, targetDb, FadeDuration);
    }
}
```

---

## Next Steps

- **[G10 Audio Systems](./G10_audio_systems.md)** — Audio bus fundamentals, spatial audio, SFX patterns
- **[G48 Audio Middleware](./G48_audio_middleware_fmod_wwise.md)** — When built-in isn't enough: FMOD/Wwise integration
- **[G3 Signal Architecture](./G3_signal_architecture.md)** — Event bus pattern for connecting game state to music
- **[G37 Scene Management](./G37_scene_management_and_transitions.md)** — Scene transitions that coordinate with music
