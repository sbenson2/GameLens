# G10 — Audio Systems
> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript  
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Composition](./G1_scene_composition.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G8 Animation Systems](./G8_animation_systems.md) · [Audio Theory](../../core/concepts/audio-theory.md)

---

## What This Guide Covers

Audio is the invisible half of game feel. A perfectly-timed sound effect makes a jump feel weighty; a well-crossfaded music track builds tension before a boss fight. Godot's audio system is bus-based with built-in spatial audio, streaming, and effects — but wiring it all together requires patterns that aren't obvious from the docs.

This guide covers the AudioBus layout, AudioStreamPlayer variants, sound playback patterns, music management with crossfading, spatial 2D audio, sound pooling, dynamic audio (adaptive music, environmental ambience), audio effects, volume settings with persistence, common audio patterns (footsteps, hit sounds, UI sounds), and performance. All code targets Godot 4.4+ with typed GDScript.

For engine-agnostic audio architecture (pooling theory, crossfade math, ducking), see [Audio Theory](../../core/concepts/audio-theory.md). For animation integration (syncing sounds to animation frames), see [G8 Animation Systems](./G8_animation_systems.md).

---

## Audio Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  Audio Pipeline                                          │
│                                                          │
│  AudioStreamPlayer  ─┐                                   │
│  AudioStreamPlayer2D ├──▶ AudioBus ──▶ AudioBus ──▶ Master│
│  AudioStreamPlayer3D ┘     (SFX)       (Master)         │
│                                                          │
│  Each player targets a bus by name.                      │
│  Buses chain left-to-right, all terminating at Master.   │
│  Effects (reverb, EQ, compressor) attach to buses.       │
└──────────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **AudioBus** | A mixing channel. Has volume (dB), effects chain, solo/mute. Defined in the Audio panel (bottom dock). |
| **AudioStreamPlayer** | Non-positional playback. Use for music, UI sounds, global SFX. |
| **AudioStreamPlayer2D** | Positional audio in 2D. Volume attenuates with distance from the active `AudioListener2D` (or camera). |
| **AudioStreamPlayer3D** | Positional audio in 3D. Not covered in this 2D-focused guide. |
| **AudioStream** | The resource: `.wav` (SFX), `.ogg` (music/long), `.mp3` (music). Each format has trade-offs. |

### Audio Format Decision Tree

```
Is it a short sound effect (< 5 seconds)?
├── YES → Import as .wav (uncompressed)
│         ✓ Zero decode latency
│         ✓ Pitch shifting without artifacts
│         ✗ Large file size (OK for short clips)
│
└── NO → Is it music or a long ambient loop?
    ├── YES → Import as .ogg Vorbis
    │         ✓ Small file size
    │         ✓ Seamless looping (set loop points in import)
    │         ✓ Streaming-friendly
    │         ✗ Slight decode overhead
    │
    └── Use .ogg for everything else
        (.mp3 works but has no loop point support
         and slightly worse quality per bit)
```

> **⚠️ Godot 3→4 Migration:** `.wav` import settings changed. In Godot 4, WAV files are imported as `AudioStreamWAV` (not `AudioStreamSample`). The `loop_mode` property replaces the old `loop` boolean — use `AudioStreamWAV.LOOP_FORWARD` instead of `true`.

---

## AudioBus Layout — The Mixing Desk

Configure buses in **Project → Audio Bus Layout** (or the Audio panel at the bottom of the editor). Every project starts with a single `Master` bus.

### Recommended Bus Layout

```
Master (idx 0)
├── Music     (idx 1)  — background music, crossfade layers
├── SFX       (idx 2)  — gameplay sounds (attacks, pickups, explosions)
├── Ambient   (idx 3)  — environmental loops (wind, rain, cave drips)
├── UI        (idx 4)  — menu clicks, hover sounds, notifications
├── Voice     (idx 5)  — dialogue, narrator, barks
└── Footsteps (idx 6)  — player/NPC footsteps (separate for volume control)
```

### Bus Setup in Code

Buses are usually configured in the editor, but you can manipulate them at runtime:

```gdscript
## Get the bus index by name (returns -1 if not found)
var sfx_bus: int = AudioServer.get_bus_index("SFX")

## Set volume in decibels (-80 = silent, 0 = full, +6 = boosted)
AudioServer.set_bus_volume_db(sfx_bus, -10.0)

## Mute/unmute a bus
AudioServer.set_bus_mute(sfx_bus, true)

## Add an effect to a bus at runtime
var reverb := AudioEffectReverb.new()
reverb.room_size = 0.6
reverb.damping = 0.5
AudioServer.add_bus_effect(sfx_bus, reverb)
```

### Volume Conversion — Linear ↔ dB

Players think in linear percentages (0–100%). Godot uses decibels. Always convert:

```gdscript
## Linear (0.0–1.0) to decibels
func linear_to_db_safe(linear: float) -> float:
    if linear <= 0.0:
        return -80.0  # Effectively silent
    return linear_to_db(linear)

## Decibels to linear (for displaying sliders)
func db_to_linear_safe(db: float) -> float:
    if db <= -80.0:
        return 0.0
    return db_to_linear(db)
```

> **Common Mistake:** Setting bus volume directly from a 0–1 slider (`AudioServer.set_bus_volume_db(bus, slider.value)`) makes the slider feel wrong because dB is logarithmic. A slider at 0.5 would be -6dB (still quite loud), not "half volume." Always use `linear_to_db()`.

---

## Playing Sounds — The Three Players

### AudioStreamPlayer (Non-Positional)

```
Node Tree:
  MusicManager (Node)         — Autoload
  ├── MusicPlayer: AudioStreamPlayer    → Bus: Music
  ├── CrossfadePlayer: AudioStreamPlayer → Bus: Music
  └── UIClickPlayer: AudioStreamPlayer   → Bus: UI
```

```gdscript
## Simple one-shot playback
@onready var sfx_player: AudioStreamPlayer = $SFXPlayer

func play_sound(stream: AudioStream, volume_db: float = 0.0) -> void:
    sfx_player.stream = stream
    sfx_player.volume_db = volume_db
    sfx_player.play()
```

### AudioStreamPlayer2D (Positional)

Attach as a child of the node that produces the sound. Volume attenuates based on distance to the listener.

```
Node Tree:
  Enemy: CharacterBody2D
  ├── Sprite2D
  ├── CollisionShape2D
  ├── AttackSound: AudioStreamPlayer2D   → Bus: SFX
  ├── FootstepSound: AudioStreamPlayer2D → Bus: Footsteps
  └── DeathSound: AudioStreamPlayer2D    → Bus: SFX
```

```gdscript
## Positional sound with distance attenuation
@onready var attack_sound: AudioStreamPlayer2D = $AttackSound

func attack() -> void:
    attack_sound.play()
    # Sound is automatically positioned at this node's global_position
    # Volume fades with distance from the AudioListener2D / Camera2D
```

#### Attenuation Settings

| Property | Default | Description |
|----------|---------|-------------|
| `max_distance` | 2000 | Beyond this, sound is silent |
| `attenuation` | 1.0 | Inverse distance power. 1.0 = linear, 2.0 = realistic falloff |
| `max_polyphony` | 1 | Max simultaneous instances. Increase for rapid-fire sounds |
| `panning_strength` | 1.0 | 0 = center, 1 = full stereo panning based on position |

### AudioListener2D

By default, the active `Camera2D` acts as the listener. For more control, add an `AudioListener2D` node:

```gdscript
## Attach to player for listener-follows-player (not camera)
## Camera2D auto-listens unless a separate AudioListener2D exists
@onready var listener: AudioListener2D = $AudioListener2D

func _ready() -> void:
    listener.make_current()
```

> **⚠️ Godot 3→4 Migration:** `AudioListener2D` is new in Godot 4. In Godot 3, the Camera2D was always the listener with no override option.

---

## SFX Manager — Centralized Sound Playback

An Autoload that handles one-shot sound playback with pooling, pitch variation, and bus routing.

```
Node Tree:
  SFXManager (Node)           — Autoload (Project → AutoLoad)
  └── (AudioStreamPlayer nodes created dynamically)
```

```gdscript
## sfx_manager.gd — Add as Autoload named "SFXManager"
extends Node

const MAX_POOL_SIZE: int = 32
const DEFAULT_BUS: StringName = &"SFX"

var _pool: Array[AudioStreamPlayer] = []
var _next_index: int = 0

## Preloaded sound library
var _sounds: Dictionary = {}  # StringName → AudioStream


func _ready() -> void:
    # Pre-create the pool
    for i in MAX_POOL_SIZE:
        var player := AudioStreamPlayer.new()
        player.bus = DEFAULT_BUS
        add_child(player)
        _pool.append(player)


## Register a sound for quick access by name
func register(sound_name: StringName, stream: AudioStream) -> void:
    _sounds[sound_name] = stream


## Play by resource reference
func play(stream: AudioStream, volume_db: float = 0.0,
          pitch_scale: float = 1.0, bus: StringName = DEFAULT_BUS) -> void:
    var player := _get_available_player()
    if player == null:
        return  # All slots busy — sound is dropped
    player.stream = stream
    player.volume_db = volume_db
    player.pitch_scale = pitch_scale
    player.bus = bus
    player.play()


## Play by registered name with random pitch variation
func play_named(sound_name: StringName, volume_db: float = 0.0,
                pitch_variation: float = 0.0, bus: StringName = DEFAULT_BUS) -> void:
    var stream: AudioStream = _sounds.get(sound_name)
    if stream == null:
        push_warning("SFXManager: Unknown sound '%s'" % sound_name)
        return
    var pitch: float = 1.0 + randf_range(-pitch_variation, pitch_variation)
    play(stream, volume_db, pitch, bus)


## Play with random selection from an array of streams
func play_random(streams: Array[AudioStream], volume_db: float = 0.0,
                 pitch_variation: float = 0.05, bus: StringName = DEFAULT_BUS) -> void:
    if streams.is_empty():
        return
    var stream: AudioStream = streams.pick_random()
    var pitch: float = 1.0 + randf_range(-pitch_variation, pitch_variation)
    play(stream, volume_db, pitch, bus)


func _get_available_player() -> AudioStreamPlayer:
    # Try to find a stopped player starting from cursor
    for i in MAX_POOL_SIZE:
        var idx: int = (_next_index + i) % MAX_POOL_SIZE
        if not _pool[idx].playing:
            _next_index = (idx + 1) % MAX_POOL_SIZE
            return _pool[idx]
    # All playing — steal the oldest (cursor position)
    var stolen: AudioStreamPlayer = _pool[_next_index]
    stolen.stop()
    _next_index = (_next_index + 1) % MAX_POOL_SIZE
    return stolen
```

### Using the SFX Manager

```gdscript
## From any script in the project:
func _on_enemy_hit() -> void:
    SFXManager.play_named(&"hit_flesh", 0.0, 0.1)

func _on_coin_pickup() -> void:
    SFXManager.play_named(&"coin", -5.0, 0.15)
```

---

## Spatial SFX Manager — Pooled 2D Positional Audio

For sounds that need to play at a specific world position (explosions, distant gunfire, environmental effects) without attaching players to every node.

```gdscript
## spatial_sfx_manager.gd — Autoload named "SpatialSFX"
extends Node

const POOL_SIZE: int = 24
const DEFAULT_BUS: StringName = &"SFX"

var _pool: Array[AudioStreamPlayer2D] = []
var _next: int = 0


func _ready() -> void:
    for i in POOL_SIZE:
        var player := AudioStreamPlayer2D.new()
        player.bus = DEFAULT_BUS
        player.max_distance = 2000.0
        player.attenuation = 1.0
        add_child(player)
        _pool.append(player)


## Play a sound at a world position
func play_at(stream: AudioStream, world_pos: Vector2,
             volume_db: float = 0.0, pitch_scale: float = 1.0,
             bus: StringName = DEFAULT_BUS) -> void:
    var player := _get_player()
    player.stream = stream
    player.global_position = world_pos
    player.volume_db = volume_db
    player.pitch_scale = pitch_scale
    player.bus = bus
    player.play()


## Play with pitch variation at position
func play_varied_at(stream: AudioStream, world_pos: Vector2,
                    pitch_variation: float = 0.1,
                    volume_db: float = 0.0) -> void:
    var pitch: float = 1.0 + randf_range(-pitch_variation, pitch_variation)
    play_at(stream, world_pos, volume_db, pitch)


func _get_player() -> AudioStreamPlayer2D:
    for i in POOL_SIZE:
        var idx: int = (_next + i) % POOL_SIZE
        if not _pool[idx].playing:
            _next = (idx + 1) % POOL_SIZE
            return _pool[idx]
    var stolen: AudioStreamPlayer2D = _pool[_next]
    stolen.stop()
    _next = (_next + 1) % POOL_SIZE
    return stolen
```

### Usage

```gdscript
## Explosion at a position (called from anywhere)
func _on_grenade_explode(pos: Vector2) -> void:
    SpatialSFX.play_varied_at(explosion_sound, pos, 0.15, 3.0)

## Environmental sound from a tilemap interaction
func _on_tile_break(tile_pos: Vector2) -> void:
    SpatialSFX.play_at(break_sound, tile_pos)
```

---

## Music Manager — Crossfading & Playlists

Music needs smooth transitions, not abrupt cuts. This Autoload manages background music with crossfading, playlists, and layered tracks.

```
Node Tree:
  MusicManager (Node)             — Autoload
  ├── PlayerA: AudioStreamPlayer  → Bus: Music
  ├── PlayerB: AudioStreamPlayer  → Bus: Music
  └── LayerPlayer: AudioStreamPlayer → Bus: Music (for layered tracks)
```

```gdscript
## music_manager.gd — Autoload named "MusicManager"
extends Node

@onready var _player_a: AudioStreamPlayer = $PlayerA
@onready var _player_b: AudioStreamPlayer = $PlayerB

var _active_player: AudioStreamPlayer
var _inactive_player: AudioStreamPlayer
var _crossfade_tween: Tween
var _current_track: AudioStream

## Playlist support
var _playlist: Array[AudioStream] = []
var _playlist_index: int = 0
var _playlist_shuffle: bool = false


func _ready() -> void:
    _player_a.bus = &"Music"
    _player_b.bus = &"Music"
    _active_player = _player_a
    _inactive_player = _player_b
    _player_a.finished.connect(_on_track_finished)
    _player_b.finished.connect(_on_track_finished)


## Play a track with crossfade (default 1.5 seconds)
func play_track(track: AudioStream, fade_duration: float = 1.5) -> void:
    if track == _current_track and _active_player.playing:
        return  # Already playing this track
    
    _current_track = track
    
    # Kill any existing crossfade
    if _crossfade_tween and _crossfade_tween.is_valid():
        _crossfade_tween.kill()
    
    # Swap active/inactive
    var old_player := _active_player
    _active_player = _inactive_player
    _inactive_player = old_player
    
    # Start new track silent, fade in
    _active_player.stream = track
    _active_player.volume_db = -80.0
    _active_player.play()
    
    _crossfade_tween = create_tween().set_parallel(true)
    # Fade in new
    _crossfade_tween.tween_property(
        _active_player, "volume_db", 0.0, fade_duration
    )
    # Fade out old
    if old_player.playing:
        _crossfade_tween.tween_property(
            old_player, "volume_db", -80.0, fade_duration
        )
        _crossfade_tween.chain().tween_callback(old_player.stop)


## Stop music with fade out
func stop(fade_duration: float = 1.0) -> void:
    if _crossfade_tween and _crossfade_tween.is_valid():
        _crossfade_tween.kill()
    
    _crossfade_tween = create_tween()
    _crossfade_tween.tween_property(
        _active_player, "volume_db", -80.0, fade_duration
    )
    _crossfade_tween.tween_callback(_active_player.stop)
    _current_track = null


## Pause/resume music (e.g., during pause menu)
func pause_music() -> void:
    _active_player.stream_paused = true

func resume_music() -> void:
    _active_player.stream_paused = false


## Set up a playlist
func set_playlist(tracks: Array[AudioStream], shuffle: bool = false) -> void:
    _playlist = tracks
    _playlist_shuffle = shuffle
    _playlist_index = 0
    if shuffle:
        _playlist.shuffle()
    if not _playlist.is_empty():
        play_track(_playlist[0])


func _on_track_finished() -> void:
    if _playlist.is_empty():
        return
    _playlist_index = (_playlist_index + 1) % _playlist.size()
    if _playlist_index == 0 and _playlist_shuffle:
        _playlist.shuffle()
    play_track(_playlist[_playlist_index], 0.5)
```

### Usage

```gdscript
## Scene transitions
func _enter_dungeon() -> void:
    MusicManager.play_track(preload("res://audio/music/dungeon_ambient.ogg"))

func _enter_boss_fight() -> void:
    MusicManager.play_track(preload("res://audio/music/boss_battle.ogg"), 2.0)

## Playlist for overworld
func _enter_overworld() -> void:
    MusicManager.set_playlist([
        preload("res://audio/music/overworld_01.ogg"),
        preload("res://audio/music/overworld_02.ogg"),
        preload("res://audio/music/overworld_03.ogg"),
    ], true)  # shuffle
```

---

## Layered / Adaptive Music

Instead of crossfading between entirely different tracks, play multiple layers simultaneously and fade them in/out based on game state. This creates seamless intensity transitions.

### Vertical Layering (Same BPM, Different Instruments)

```
Layers for "Dungeon" music (all same tempo, synced):
  Layer 0: Pad / Drone        — always playing (exploration)
  Layer 1: Percussion          — fade in when enemies nearby
  Layer 2: Bass + Lead         — fade in during combat
  Layer 3: Choir / Stinger     — fade in for boss encounter
```

```gdscript
## layered_music.gd — Attach to a scene or use as component
class_name LayeredMusic
extends Node

@export var layers: Array[AudioStream] = []
@export var fade_speed: float = 2.0  # dB per second equivalent

var _players: Array[AudioStreamPlayer] = []
var _target_volumes: Array[float] = []  # 0.0 to 1.0 linear
var _current_volumes: Array[float] = []


func _ready() -> void:
    for i in layers.size():
        var player := AudioStreamPlayer.new()
        player.stream = layers[i]
        player.bus = &"Music"
        player.volume_db = -80.0 if i > 0 else 0.0
        add_child(player)
        _players.append(player)
        _target_volumes.append(1.0 if i == 0 else 0.0)
        _current_volumes.append(1.0 if i == 0 else 0.0)


## Start all layers synced
func start_all() -> void:
    for player in _players:
        player.play()


## Set the target volume for a specific layer (0.0 = silent, 1.0 = full)
func set_layer_volume(layer_index: int, volume: float) -> void:
    if layer_index < 0 or layer_index >= _target_volumes.size():
        return
    _target_volumes[layer_index] = clampf(volume, 0.0, 1.0)


## Convenience: set intensity level (0.0 to 1.0) to control all layers
func set_intensity(intensity: float) -> void:
    intensity = clampf(intensity, 0.0, 1.0)
    for i in _target_volumes.size():
        # Layer 0 always on; others fade in proportionally
        if i == 0:
            _target_volumes[i] = 1.0
        else:
            var threshold: float = float(i) / float(_target_volumes.size() - 1)
            _target_volumes[i] = clampf(
                (intensity - threshold + 0.3) / 0.3, 0.0, 1.0
            )


func _process(delta: float) -> void:
    for i in _players.size():
        _current_volumes[i] = move_toward(
            _current_volumes[i], _target_volumes[i], fade_speed * delta
        )
        if _current_volumes[i] <= 0.01:
            _players[i].volume_db = -80.0
        else:
            _players[i].volume_db = linear_to_db(_current_volumes[i])
```

### Horizontal Sequencing (Different Sections, Beat-Synced Transitions)

For music that transitions between sections (explore → combat → victory) at musically appropriate moments:

```gdscript
## beat_synced_music.gd
class_name BeatSyncedMusic
extends Node

@export var bpm: float = 120.0
@export var beats_per_bar: int = 4

var _beat_duration: float
var _bar_duration: float
var _pending_track: AudioStream
var _pending_fade: float


func _ready() -> void:
    _beat_duration = 60.0 / bpm
    _bar_duration = _beat_duration * beats_per_bar


## Queue a transition that happens on the next bar boundary
func transition_on_bar(track: AudioStream, fade_duration: float = 0.5) -> void:
    _pending_track = track
    _pending_fade = fade_duration


func _process(_delta: float) -> void:
    if _pending_track == null:
        return
    
    # Check if we're near a bar boundary
    var playback_pos: float = MusicManager._active_player.get_playback_position()
    var bar_progress: float = fmod(playback_pos, _bar_duration)
    
    # Trigger within 50ms of bar start
    if bar_progress < 0.05 or (_bar_duration - bar_progress) < 0.05:
        MusicManager.play_track(_pending_track, _pending_fade)
        _pending_track = null
```

---

## Audio Effects — Bus Processing

Attach effects to buses for environment-wide audio processing. Configure in the Audio panel or at runtime.

### Common Effect Chains

```gdscript
## Environment-based reverb switching
func enter_cave() -> void:
    var reverb := AudioEffectReverb.new()
    reverb.room_size = 0.8
    reverb.damping = 0.3
    reverb.spread = 0.8
    reverb.wet = 0.4
    _set_bus_effect(&"SFX", reverb)
    _set_bus_effect(&"Footsteps", reverb)

func enter_outdoors() -> void:
    # Remove reverb or set very subtle
    var reverb := AudioEffectReverb.new()
    reverb.room_size = 0.2
    reverb.damping = 0.8
    reverb.wet = 0.1
    _set_bus_effect(&"SFX", reverb)
    _set_bus_effect(&"Footsteps", reverb)

func _set_bus_effect(bus_name: StringName, effect: AudioEffect) -> void:
    var idx: int = AudioServer.get_bus_index(bus_name)
    if idx < 0:
        return
    # Replace first effect or add new
    if AudioServer.get_bus_effect_count(idx) > 0:
        AudioServer.remove_bus_effect(idx, 0)
    AudioServer.add_bus_effect(idx, effect, 0)
```

### Useful Effect Types

| Effect | Use Case | Key Properties |
|--------|----------|----------------|
| `AudioEffectReverb` | Caves, halls, bathrooms | `room_size`, `damping`, `wet` |
| `AudioEffectDelay` | Echo, canyon, sci-fi | `tap1_delay_ms`, `tap1_level_db`, `feedback` |
| `AudioEffectLowPassFilter` | Underwater, muffled, behind walls | `cutoff_hz` (lower = more muffled) |
| `AudioEffectHighPassFilter` | Tinny radio, phone, small speaker | `cutoff_hz` (higher = thinner) |
| `AudioEffectCompressor` | Normalize loud/quiet sounds, master bus | `threshold`, `ratio`, `attack_us` |
| `AudioEffectLimiter` | Prevent clipping on Master bus | `ceiling_db`, `threshold_db` |
| `AudioEffectDistortion` | Retro, chip-tune, damaged radio | `mode`, `drive` |
| `AudioEffectChorus` | Shimmer, ethereal feel | `voice_count`, `dry`, `wet` |

### Music Ducking — Lower Music During Dialogue

```gdscript
## Duck the music bus when dialogue plays, restore after
func duck_music(duck_db: float = -12.0, fade_time: float = 0.3) -> void:
    var music_bus: int = AudioServer.get_bus_index("Music")
    var tween := create_tween()
    tween.tween_method(
        func(db: float) -> void: AudioServer.set_bus_volume_db(music_bus, db),
        AudioServer.get_bus_volume_db(music_bus),
        duck_db,
        fade_time
    )

func unduck_music(fade_time: float = 0.5) -> void:
    var music_bus: int = AudioServer.get_bus_index("Music")
    var tween := create_tween()
    tween.tween_method(
        func(db: float) -> void: AudioServer.set_bus_volume_db(music_bus, db),
        AudioServer.get_bus_volume_db(music_bus),
        0.0,
        fade_time
    )
```

---

## Ambient Sound System

Environmental audio creates atmosphere. Use Area2D zones to trigger ambient loops and one-shot sounds.

```
Node Tree:
  ForestZone: Area2D
  ├── CollisionShape2D (large region)
  ├── AmbientLoop: AudioStreamPlayer2D    → Bus: Ambient
  └── AmbientSounds (Node)                — container for random one-shots
```

```gdscript
## ambient_zone.gd
class_name AmbientZone
extends Area2D

@export var ambient_loop: AudioStream
@export var random_sounds: Array[AudioStream] = []
@export var min_interval: float = 3.0
@export var max_interval: float = 10.0
@export var random_sound_radius: float = 300.0
@export var fade_time: float = 1.0

@onready var _loop_player: AudioStreamPlayer2D = $AmbientLoop
var _active: bool = false
var _random_timer: float = 0.0


func _ready() -> void:
    body_entered.connect(_on_body_entered)
    body_exited.connect(_on_body_exited)
    _loop_player.stream = ambient_loop
    _loop_player.volume_db = -80.0


func _on_body_entered(body: Node2D) -> void:
    if body is CharacterBody2D and body.is_in_group("player"):
        _active = true
        _loop_player.play()
        var tween := create_tween()
        tween.tween_property(_loop_player, "volume_db", 0.0, fade_time)
        _random_timer = randf_range(min_interval, max_interval)


func _on_body_exited(body: Node2D) -> void:
    if body is CharacterBody2D and body.is_in_group("player"):
        _active = false
        var tween := create_tween()
        tween.tween_property(_loop_player, "volume_db", -80.0, fade_time)
        tween.tween_callback(_loop_player.stop)


func _process(delta: float) -> void:
    if not _active or random_sounds.is_empty():
        return
    
    _random_timer -= delta
    if _random_timer <= 0.0:
        _random_timer = randf_range(min_interval, max_interval)
        _play_random_ambient()


func _play_random_ambient() -> void:
    var offset := Vector2(
        randf_range(-random_sound_radius, random_sound_radius),
        randf_range(-random_sound_radius, random_sound_radius),
    )
    SpatialSFX.play_varied_at(
        random_sounds.pick_random(),
        global_position + offset,
        0.1, -5.0
    )
```

---

## Common Audio Patterns

### Footstep System with Surface Detection

```gdscript
## footstep_system.gd — Attach to player CharacterBody2D
extends Node

@export var step_interval: float = 0.35  # seconds between steps
@export var step_sounds: Dictionary = {
    # surface_type: Array[AudioStream]
    "grass": [] as Array[AudioStream],
    "stone": [] as Array[AudioStream],
    "wood": [] as Array[AudioStream],
    "water": [] as Array[AudioStream],
}
@export var default_surface: String = "stone"

var _step_timer: float = 0.0
var _last_sound_idx: int = -1  # Avoid repeating same sound


func _physics_process(delta: float) -> void:
    var player := get_parent() as CharacterBody2D
    if player == null:
        return
    
    if not player.is_on_floor() or player.velocity.length() < 10.0:
        _step_timer = 0.0
        return
    
    _step_timer -= delta
    if _step_timer <= 0.0:
        _step_timer = step_interval
        _play_footstep(player.global_position)


func _play_footstep(pos: Vector2) -> void:
    var surface: String = _detect_surface(pos)
    var sounds: Array = step_sounds.get(surface, step_sounds.get(default_surface, []))
    if sounds.is_empty():
        return
    
    # Avoid repeating the same sound consecutively
    var idx: int = randi_range(0, sounds.size() - 1)
    if sounds.size() > 1 and idx == _last_sound_idx:
        idx = (idx + 1) % sounds.size()
    _last_sound_idx = idx
    
    SpatialSFX.play_varied_at(sounds[idx], pos, 0.08, -8.0)


func _detect_surface(pos: Vector2) -> String:
    # Option 1: TileMap custom data layer
    var tilemap: TileMapLayer = get_tree().get_first_node_in_group("ground_tilemap")
    if tilemap:
        var tile_pos: Vector2i = tilemap.local_to_map(tilemap.to_local(pos))
        var data: TileData = tilemap.get_cell_tile_data(tile_pos)
        if data:
            var surface_type: String = data.get_custom_data("surface_type")
            if not surface_type.is_empty():
                return surface_type
    
    # Option 2: Raycast to detect surface material
    # (Use a raycast pointing down to detect Area2D surface zones)
    
    return default_surface
```

### Hit Sound Variation — Avoid Repetition

```gdscript
## Audio resource with multiple variations
@export var hit_sounds: Array[AudioStream] = []
var _last_hit_idx: int = -1

func play_hit_sound(position: Vector2) -> void:
    if hit_sounds.is_empty():
        return
    # Pick a random sound, never the same as last
    var idx: int = randi_range(0, hit_sounds.size() - 1)
    if hit_sounds.size() > 1:
        while idx == _last_hit_idx:
            idx = randi_range(0, hit_sounds.size() - 1)
    _last_hit_idx = idx
    
    # Random pitch variation for natural feel
    SpatialSFX.play_varied_at(hit_sounds[idx], position, 0.12)
```

### UI Sound Feedback

```gdscript
## ui_sounds.gd — Autoload named "UISounds"
extends Node

@export var hover_sound: AudioStream
@export var click_sound: AudioStream
@export var back_sound: AudioStream
@export var error_sound: AudioStream
@export var confirm_sound: AudioStream

@onready var _player: AudioStreamPlayer = AudioStreamPlayer.new()


func _ready() -> void:
    _player.bus = &"UI"
    add_child(_player)


func play_hover() -> void:
    _play(hover_sound, -10.0)

func play_click() -> void:
    _play(click_sound, -5.0)

func play_back() -> void:
    _play(back_sound, -5.0)

func play_error() -> void:
    _play(error_sound, 0.0)

func play_confirm() -> void:
    _play(confirm_sound, -3.0)


func _play(stream: AudioStream, volume_db: float) -> void:
    if stream == null:
        return
    _player.stream = stream
    _player.volume_db = volume_db
    _player.play()


## Connect to any Button automatically
func connect_button(button: BaseButton) -> void:
    button.mouse_entered.connect(play_hover)
    button.pressed.connect(play_click)


## Auto-connect all buttons in a container
func connect_all_buttons(root: Node) -> void:
    for child in root.get_children():
        if child is BaseButton:
            connect_button(child)
        if child.get_child_count() > 0:
            connect_all_buttons(child)
```

### Animation-Synced Sound Effects

Use AnimationPlayer method call tracks to trigger sounds at exact frames:

```gdscript
## In your character script:
func anim_play_sound(stream_path: String, volume_db: float = 0.0) -> void:
    var stream: AudioStream = load(stream_path)
    SpatialSFX.play_varied_at(stream, global_position, 0.05, volume_db)

## Then in AnimationPlayer:
## 1. Add a "Method Call" track targeting the character node
## 2. Add a keyframe at the exact frame (e.g., frame 3 of "attack" animation)
## 3. Set method to "anim_play_sound" with args: ["res://audio/sfx/sword_swing.wav", -3.0]
```

> **Tip:** For frame-accurate audio, use `_physics_process` timing and method call tracks rather than timers. Animation method tracks guarantee the sound plays at the exact frame regardless of frame rate variations.

---

## Volume Settings — Player Controls with Persistence

Integrate with the settings screen pattern from [G9 UI & Control Systems](./G9_ui_control_systems.md).

```gdscript
## audio_settings.gd — Component or part of settings screen
extends VBoxContainer

const SETTINGS_PATH: String = "user://audio_settings.cfg"

## Bus name → HSlider mapping
@onready var _sliders: Dictionary = {
    "Master": $MasterSlider as HSlider,
    "Music": $MusicSlider as HSlider,
    "SFX": $SFXSlider as HSlider,
    "Ambient": $AmbientSlider as HSlider,
    "UI": $UISlider as HSlider,
    "Voice": $VoiceSlider as HSlider,
}


func _ready() -> void:
    _load_settings()
    for bus_name: String in _sliders:
        var slider: HSlider = _sliders[bus_name]
        slider.min_value = 0.0
        slider.max_value = 1.0
        slider.step = 0.01
        # Capture bus_name in lambda
        slider.value_changed.connect(
            func(value: float) -> void: _set_bus_volume(bus_name, value)
        )


func _set_bus_volume(bus_name: String, linear: float) -> void:
    var bus_idx: int = AudioServer.get_bus_index(bus_name)
    if bus_idx < 0:
        return
    if linear <= 0.0:
        AudioServer.set_bus_mute(bus_idx, true)
    else:
        AudioServer.set_bus_mute(bus_idx, false)
        AudioServer.set_bus_volume_db(bus_idx, linear_to_db(linear))


func save_settings() -> void:
    var config := ConfigFile.new()
    for bus_name: String in _sliders:
        config.set_value("audio", bus_name, _sliders[bus_name].value)
    config.save(SETTINGS_PATH)


func _load_settings() -> void:
    var config := ConfigFile.new()
    if config.load(SETTINGS_PATH) != OK:
        return
    for bus_name: String in _sliders:
        var value: float = config.get_value("audio", bus_name, 0.8)
        _sliders[bus_name].value = value
        _set_bus_volume(bus_name, value)
```

---

## AudioStreamRandomizer — Built-in Variation

Godot 4.4+ includes `AudioStreamRandomizer`, which handles random sound selection and pitch variation without custom code:

```gdscript
## Create in the editor or in code:
var randomizer := AudioStreamRandomizer.new()

## Add streams with weights
randomizer.add_stream(0, preload("res://audio/sfx/step_01.wav"), 1.0)
randomizer.add_stream(1, preload("res://audio/sfx/step_02.wav"), 1.0)
randomizer.add_stream(2, preload("res://audio/sfx/step_03.wav"), 0.5)  # less common

## Configure variation
randomizer.random_pitch = 1.1   # Up to 10% pitch variation
randomizer.random_volume_offset_db = 2.0  # ±2 dB volume variation
randomizer.playback_mode = AudioStreamRandomizer.PLAYBACK_RANDOM_NO_REPEATS

## Assign to any player
$FootstepPlayer.stream = randomizer
$FootstepPlayer.play()  # Automatically picks a random variant
```

> **When to use `AudioStreamRandomizer` vs custom SFXManager pooling:**
> - Use `AudioStreamRandomizer` when a single player plays varied sounds (footsteps, hits)
> - Use `SFXManager` pooling when many different sounds play simultaneously from anywhere

---

## One-Shot Scene Pattern — Self-Cleaning Audio

For sounds that need to play and then clean up (no persistent player needed):

```gdscript
## audio_one_shot.gd — Preload and instance as needed
class_name AudioOneShot
extends AudioStreamPlayer2D

@export var auto_free: bool = true


func _ready() -> void:
    finished.connect(_on_finished)


func _on_finished() -> void:
    if auto_free:
        queue_free()


## Static helper to spawn a one-shot sound at a position
static func play_at_position(
    stream: AudioStream, parent: Node, position: Vector2,
    volume_db: float = 0.0, pitch: float = 1.0, bus: StringName = &"SFX"
) -> AudioOneShot:
    var instance := AudioOneShot.new()
    instance.stream = stream
    instance.volume_db = volume_db
    instance.pitch_scale = pitch
    instance.bus = bus
    instance.global_position = position
    parent.add_child(instance)
    instance.play()
    return instance
```

> **⚠️ Performance Warning:** Creating and freeing nodes every time a sound plays creates GC pressure. Use this pattern only for infrequent sounds (death effects, boss roars). For frequent sounds (footsteps, bullets), use the pooled `SFXManager` or `SpatialSFX` patterns above.

---

## Audio in Cutscenes — Syncing with AnimationPlayer

AnimationPlayer can control audio playback alongside visuals for cutscenes:

```gdscript
## In a cutscene AnimationPlayer:
## Track 1: AudioStreamPlayer (Music) — Play boss_intro_music.ogg at t=0.0
## Track 2: AudioStreamPlayer2D (Voice) — Play boss_taunt.wav at t=2.5
## Track 3: Method Call — Call camera.shake(0.3, 8.0) at t=3.0
## Track 4: AudioStreamPlayer (SFX) — Play explosion.wav at t=3.0

## Cutscene controller
func play_boss_intro() -> void:
    # Duck gameplay music
    MusicManager.stop(0.5)
    await get_tree().create_timer(0.5).timeout
    
    $CutsceneAnimator.play("boss_intro")
    await $CutsceneAnimator.animation_finished
    
    # Resume gameplay music
    MusicManager.play_track(boss_fight_music, 1.0)
```

---

## Common Mistakes & Fixes

### 1. Sounds Don't Play — No Bus Assignment

```gdscript
## ❌ Wrong: Player defaults to "Master" bus, but you set Master volume to 0
$Player.play()

## ✅ Right: Always assign the correct bus
$Player.bus = &"SFX"
$Player.play()
```

### 2. Overlapping Rapid Sounds — Machine Gun Effect

```gdscript
## ❌ Wrong: Playing the same sound every frame creates cacophony
func _process(_delta: float) -> void:
    if attacking:
        $AttackSound.play()  # Restarts every frame!

## ✅ Right: Check if already playing, or use a cooldown
func _process(_delta: float) -> void:
    if attacking and not $AttackSound.playing:
        $AttackSound.play()
```

### 3. Positional Sound on a Non-Moving Node

```gdscript
## ❌ Wrong: AudioStreamPlayer2D as child of a static scene root
## The sound always plays at (0,0)

## ✅ Right: Make it a child of the moving entity
## Or update global_position before playing:
$PooledPlayer.global_position = emitter_node.global_position
$PooledPlayer.play()
```

### 4. Music Cuts Abruptly on Scene Change

```gdscript
## ❌ Wrong: MusicPlayer in the scene — destroyed on scene change
## (music stops immediately)

## ✅ Right: MusicManager as Autoload
## Autoloads persist across scene changes
## Play/crossfade from the new scene's _ready()
```

### 5. Volume Slider Feels Non-Linear

```gdscript
## ❌ Wrong: Using slider value directly as dB
AudioServer.set_bus_volume_db(bus, slider.value * -80.0)  # Sounds terrible

## ✅ Right: Convert linear to dB
AudioServer.set_bus_volume_db(bus, linear_to_db(slider.value))
```

### 6. Too Many AudioStreamPlayer Nodes — Scene Bloat

```gdscript
## ❌ Wrong: 20 AudioStreamPlayer2D children on every enemy
## Each enemy has: attack, hurt, death, footstep1, footstep2...

## ✅ Right: Use pooled SFXManager/SpatialSFX
## Enemies call SFXManager.play() or SpatialSFX.play_at()
## One pool serves all enemies
```

### 7. Audio Continues After Node is Freed

```gdscript
## ❌ Wrong: queue_free() while sound is playing — sound cuts off
func die() -> void:
    queue_free()  # Cuts death sound mid-play!

## ✅ Right: Play sound via manager, THEN free
func die() -> void:
    SpatialSFX.play_at(death_sound, global_position)
    queue_free()  # Sound continues because it's on a different node
```

---

## Performance Considerations

| Concern | Recommendation |
|---------|---------------|
| **Pool size** | 24–32 non-positional, 16–24 spatial. Profile and increase if sounds are dropped. |
| **WAV vs OGG for SFX** | WAV for short (<2s) frequently-played sounds. OGG for longer or infrequent sounds. |
| **Streaming** | Music should always stream (`.ogg`). Short SFX should be fully loaded (`.wav`). |
| **Max polyphony** | Set `max_polyphony` on AudioStreamPlayer2D to limit simultaneous instances per node. |
| **Bus effect count** | Each effect adds CPU cost per active voice on that bus. Limit to 2–3 effects per bus. |
| **Attenuation culling** | Sounds beyond `max_distance` are culled automatically. Set sensible max distances. |
| **Process mode** | Use `set_process(false)` on inactive ambient systems. Enable when player enters zone. |
| **One-shot cleanup** | Prefer pooling over one-shot scene instances. `queue_free()` has GC overhead. |

---

## Tuning Reference Tables

### Volume Levels by Sound Type

| Sound Type | Volume (dB) | Notes |
|-----------|-------------|-------|
| Music (default) | -6 to -3 | Sits behind SFX |
| SFX (impacts) | -3 to 0 | Most prominent |
| UI clicks | -10 to -5 | Subtle, not distracting |
| Footsteps | -12 to -8 | Background rhythm |
| Ambient loops | -15 to -8 | Atmospheric, not foreground |
| Dialogue/Voice | -3 to 0 | Clear above music |
| Explosions | 0 to +3 | Impactful (briefly) |

### Pitch Variation by Sound Type

| Sound Type | Variation Range | Effect |
|-----------|----------------|--------|
| Footsteps | ±8–12% | Natural walking feel |
| Hit impacts | ±10–15% | Each hit feels different |
| UI clicks | ±2–3% | Subtle, barely noticeable |
| Coin pickups | ±5–8% + ascending pitch | Satisfying collection |
| Gunfire | ±5–8% | Avoids machine-gun repetition |
| Explosions | ±15–20% | Each explosion unique |

### Crossfade Durations by Context

| Transition | Duration | Technique |
|-----------|----------|-----------|
| Menu → Gameplay | 1.5–2.0s | Crossfade |
| Explore → Combat | 0.5–1.0s | Quick crossfade or beat-sync |
| Combat → Victory | 1.0–1.5s | Fade out → Stinger → Fade in |
| Room → Room (same mood) | 0.3–0.5s | Quick crossfade |
| Scene transition (fade to black) | Match fade duration | Sync with visual fade |
| Death → Respawn | 0.0s (cut) + 1.0s fade in | Abrupt stop, then gentle restart |

### Attenuation Settings by Game Type

| Game Type | Max Distance | Attenuation | Panning |
|-----------|-------------|-------------|---------|
| Top-down (zoomed out) | 800–1200 | 1.0 | 0.5–0.7 |
| Platformer (tight camera) | 400–600 | 1.5 | 0.8–1.0 |
| Open world (large maps) | 1500–2500 | 1.0 | 1.0 |
| Strategy (overhead view) | 600–1000 | 0.8 | 0.3–0.5 |

---

## Godot 3→4 Migration Reference

| Godot 3 | Godot 4 | Notes |
|---------|---------|-------|
| `AudioStreamSample` | `AudioStreamWAV` | Class renamed |
| `AudioStreamOGGVorbis` | `AudioStreamOggVorbis` | Capitalization changed |
| `AudioServer.get_bus_name()` | Same | Unchanged |
| `AudioServer.set_bus_volume_db()` | Same | Unchanged |
| No `AudioListener2D` | `AudioListener2D` node | New in Godot 4 — explicit listener control |
| `AudioStreamPlayer.stream_paused` | Same | Unchanged |
| `AudioStreamRandomPitch` | `AudioStreamRandomizer` | Replaced and expanded |
| `Audio` bus layout in `.tres` | `.tres` | Format slightly changed; re-save in editor |

---

## Related Guides

- [Audio Theory](../../core/concepts/audio-theory.md) — Engine-agnostic audio architecture, pooling theory, crossfade math
- [G1 Scene Composition](./G1_scene_composition.md) — How to structure audio nodes in the scene tree
- [G3 Signal Architecture](./G3_signal_architecture.md) — Signal bus pattern used by audio events
- [G5 Physics & Collision](./G5_physics_and_collision.md) — Area2D zones for ambient audio triggers
- [G7 TileMap & Terrain](./G7_tilemap_and_terrain.md) — Tile custom data for surface-based footsteps
- [G8 Animation Systems](./G8_animation_systems.md) — Animation method tracks for syncing sounds to frames
- [G9 UI & Control Systems](./G9_ui_control_systems.md) — Audio settings UI, button sound connections
