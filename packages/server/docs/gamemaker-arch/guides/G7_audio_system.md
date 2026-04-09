# Audio System and Sound Design

> **Category:** guide · **Engine:** GameMaker · **Related:** [G1_object_events](G1_object_events.md), [G3_particles_and_sequences](G3_particles_and_sequences.md), [R2_surfaces_and_shaders](../reference/R2_surfaces_and_shaders.md)

GameMaker's audio engine supports simple sound playback, 3D positional audio via emitters and listeners, audio groups for memory management, and real-time audio effects (reverb, delay, low-pass filtering). This guide covers patterns for music, SFX, positional audio, and the audio bus/effects system introduced in 2023+.

---

## Basic Playback

### Playing a Sound

```gml
// Play a one-shot sound effect (no loop, priority 10)
audio_play_sound(snd_explosion, 10, false);

// Play looping background music at lower priority
var _music = audio_play_sound(snd_level_theme, 1, true);
audio_sound_gain(_music, 0.6, 0); // set to 60% volume immediately
```

**Priority** determines which sounds survive when the system hits its channel limit (128 by default). Higher priority = less likely to be culled. Use low priority (0–5) for ambient/music, higher (10+) for critical gameplay SFX.

### Extended Playback

`audio_play_sound_ext` accepts a struct for cleaner parameterization:

```gml
var _snd = audio_play_sound_ext({
    sound:    snd_footstep,
    priority: 5,
    loop:     false,
    gain:     0.8,
    offset:   0,       // start position in seconds
    pitch:    random_range(0.9, 1.1), // slight randomization
    listener_mask: 0xF // which listeners hear this (bitmask)
});
```

Pitch randomization on footsteps and impacts is a simple trick that dramatically reduces audio fatigue.

### Stopping and Fading

```gml
// Fade out music over 2 seconds, then stop
audio_sound_gain(snd_level_theme, 0, 2000);
alarm[0] = room_speed * 2;

// In Alarm_0 — stop after fade completes
audio_stop_sound(snd_level_theme);
```

For crossfading between tracks:

```gml
/// scr_crossfade_music(_new_track, _duration_ms)
function crossfade_music(_new_track, _duration_ms) {
    // Fade out whatever is currently playing on the music bus
    if (audio_is_playing(global.current_music)) {
        audio_sound_gain(global.current_music, 0, _duration_ms);
    }
    
    // Start new track at 0, fade in
    global.current_music = audio_play_sound(_new_track, 1, true);
    audio_sound_gain(global.current_music, 0, 0);           // start silent
    audio_sound_gain(global.current_music, 0.7, _duration_ms); // fade to 70%
}
```

---

## Audio Groups

Audio groups let you load and unload banks of sounds to manage memory, particularly important on mobile and HTML5. Assign sounds to groups in the IDE (right-click a sound asset → Audio Group).

```gml
// Load a group (async — sounds aren't available instantly)
audio_group_load(audiogroup_level2);

// Check if loaded before playing
if (audio_group_is_loaded(audiogroup_level2)) {
    audio_play_sound(snd_level2_ambient, 1, true);
}

// Unload when leaving the level to free memory
audio_group_unload(audiogroup_level1);
```

### Audio Group Gain

Each group has its own gain multiplier — useful for settings menus:

```gml
// Apply user's volume settings
audio_group_set_gain(audiogroup_music, global.music_volume, 0);
audio_group_set_gain(audiogroup_sfx, global.sfx_volume, 0);
```

**Best practice:** Create at least three audio groups: `audiogroup_music`, `audiogroup_sfx`, `audiogroup_ui`. This gives you independent volume sliders and lets you unload level-specific sounds without affecting UI bleeps.

---

## 3D Positional Audio (Emitters and Listeners)

For sounds that exist in game-world space (footsteps, gunfire, environmental ambience), use audio emitters.

### Setup: Falloff Model

Set the falloff model once at game start. This controls how volume decreases with distance:

```gml
// Room start or game init — choose a falloff model
audio_falloff_set_model(audio_falloff_linear_distance_clamped);
```

Common models:

| Model | Behavior |
|-------|----------|
| `audio_falloff_linear_distance_clamped` | Linear fade, silent beyond max distance. Best for most 2D games. |
| `audio_falloff_inverse_distance_clamped` | Inverse-square fade, more realistic. Good for 3D-style environments. |
| `audio_falloff_exponent_distance_clamped` | Exponential fade, dramatic dropoff. Useful for horror/stealth. |

### Creating and Positioning Emitters

```gml
// obj_torch — Create event
emitter = audio_emitter_create();
audio_emitter_position(emitter, x, y, 0);
audio_emitter_falloff(emitter, 50, 300, 1.0);
// ref_distance = 50 (full volume within 50px)
// max_distance = 300 (silent beyond 300px)
// falloff_factor = 1.0

audio_play_sound_on(emitter, snd_fire_crackle, true, 1);
```

### Updating Emitter Position (Moving Sources)

```gml
// obj_enemy — Step event
audio_emitter_position(emitter, x, y, 0);
```

### Listener (The Player's Ears)

By default, listener 0 is at the origin. Update it to follow the camera or player:

```gml
// obj_camera — Step event
audio_listener_position(0, camera_get_view_x(view_camera[0]) + camera_get_view_width(view_camera[0]) / 2,
                           camera_get_view_y(view_camera[0]) + camera_get_view_height(view_camera[0]) / 2,
                           0);
```

### Cleanup

Always free emitters when the instance is destroyed:

```gml
// Clean Up or Destroy event
audio_emitter_free(emitter);
```

---

## Audio Effects (Buses and DSP)

GameMaker 2023+ introduced an audio bus system with real-time effects. Effects are applied per-bus, not per-sound, which is more performant and mirrors how professional audio middleware works.

### Audio Bus Structure

```
Main Bus (audio_bus_main)
├── Music Bus
├── SFX Bus
└── UI Bus
```

Create buses and assign sounds to them:

```gml
// Create custom buses as children of the main bus
global.bus_music = audio_bus_create();
global.bus_sfx = audio_bus_create();

// Route a playing sound to a bus
var _mus = audio_play_sound(snd_theme, 1, true);
audio_sound_set_bus(_mus, global.bus_music);
```

### Applying Effects

```gml
// Create a reverb effect
var _reverb = audio_effect_create(AudioEffectType.Reverb1);
audio_effect_set(_reverb, "size", 0.7);    // room size 0–1
audio_effect_set(_reverb, "damp", 0.5);    // high-frequency damping
audio_effect_set(_reverb, "mix", 0.3);     // wet/dry ratio

// Assign to the SFX bus's first effect slot
audio_bus_set_effect(global.bus_sfx, 0, _reverb);
```

### Common Effect Types

| Effect Type | Use Case |
|-------------|----------|
| `AudioEffectType.Reverb1` | Caves, large rooms, underwater |
| `AudioEffectType.Delay` | Echo, repeat effects |
| `AudioEffectType.LPF2` | Muffled sound (underwater, behind walls) |
| `AudioEffectType.HPF2` | Tinny/phone speaker simulation |
| `AudioEffectType.Gain` | Per-bus volume control |
| `AudioEffectType.Bitcrusher` | Retro, lo-fi, distortion |
| `AudioEffectType.Compressor` | Normalize loudness, prevent clipping |

### Dynamic Effects Example: Underwater Muffling

```gml
// When player enters water
var _lpf = audio_effect_create(AudioEffectType.LPF2);
audio_effect_set(_lpf, "cutoff", 800);   // Hz — muffles highs
audio_effect_set(_lpf, "Q", 0.7);        // resonance
audio_bus_set_effect(global.bus_sfx, 0, _lpf);

// When player exits water — remove the effect
audio_bus_set_effect(global.bus_sfx, 0, undefined);
```

---

## Common Patterns

### Music Manager (Singleton Object)

```gml
/// obj_music_manager — Create event (persistent object)
persistent = true;
current_track = noone;
target_volume = 0.7;

/// Play a new track with crossfade
function play_track(_track) {
    if (current_track == _track) return; // already playing
    
    if (audio_is_playing(current_track)) {
        audio_sound_gain(current_track, 0, 1000);
        // Schedule stop after fade (use alarm or timeline)
    }
    
    current_track = audio_play_sound(_track, 1, true);
    audio_sound_gain(current_track, 0, 0);
    audio_sound_gain(current_track, target_volume, 1000);
}
```

### Sound Pooling (Limiting Concurrent Instances)

```gml
/// Prevent 50 overlapping gunshot sounds
function play_sfx_limited(_sound, _max_concurrent, _priority) {
    var _count = 0;
    // audio_is_playing returns true if ANY instance of this sound plays
    // Use audio_sound_get_instances for exact count (2024+)
    if (audio_is_playing(_sound)) {
        // Fallback: skip if already playing to avoid stacking
        return noone;
    }
    return audio_play_sound(_sound, _priority, false);
}
```

---

## Common Pitfalls

1. **Playing music in Step event** — `audio_play_sound` in Step creates a new instance every frame. Play in Create, alarm, or a state-change trigger.
2. **Forgetting to set falloff model** — without `audio_falloff_set_model()`, emitters will all play at full volume regardless of distance.
3. **Using stereo sounds with emitters** — 3D audio requires mono assets. Stereo sounds ignore positional panning. Set sounds to "Mono" or "3D" in the Sound Editor.
4. **Not freeing emitters** — leaked emitters accumulate and eventually hit the system limit. Always `audio_emitter_free()` in Clean Up or Destroy events.
5. **Ignoring audio groups on HTML5** — browsers often require a user interaction before audio plays. GameMaker handles this, but loading groups too early can cause silent starts.
