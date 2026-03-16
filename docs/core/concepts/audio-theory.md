# Audio Systems -- Theory & Concepts

This document covers engine-agnostic audio system theory for games. For engine-specific implementations, see the relevant engine module.

---

## Audio Architecture

### Category/Bus System

Organize sounds into categories with independent volume controls:

| Category | Typical Default | Examples |
|----------|----------------|----------|
| Master | 1.0 | Controls everything |
| Music | 0.7 | Background music |
| SFX | 1.0 | Explosions, footsteps |
| Ambient | 0.5 | Wind, rain, crickets |
| UI | 0.8 | Button clicks, menu sounds |

**Effective volume:** `master_volume * category_volume * individual_volume`

---

## Sound Pooling

Sound effect instances are limited resources. A pool manages a fixed number of playback slots:

```
function play_sound(pool, sound, volume, pitch, pan):
    // Find a stopped slot or steal the oldest
    slot = find_available_slot(pool)
    if no slot available:
        slot = oldest_slot
        stop(slot)

    slot.sound = sound
    slot.volume = volume
    slot.pitch = pitch
    slot.pan = pan
    slot.play()
```

**Typical pool size:** 32 instances. When the pool is full, the oldest sound is stolen -- acceptable since old sounds are usually fading out.

---

## Music Systems

### Crossfading

Transition smoothly between music tracks:

```
function crossfade_to(new_track, fade_duration):
    next = create_instance(new_track, volume=0, looping=true)
    next.play()
    fading = true
    fade_timer = 0

function update_crossfade(dt, category_volume):
    if not fading: return
    fade_timer += dt
    t = clamp(fade_timer / fade_duration, 0, 1)

    current.volume = (1 - t) * category_volume
    next.volume = t * category_volume

    if t >= 1:
        stop(current)
        current = next
        fading = false
```

### Vertical Layering (Dynamic Music)

Play multiple synchronized music layers simultaneously, fading individual layers in/out based on game state:

- **Layer 0:** Base ambient loop (always playing)
- **Layer 1:** Percussion (fades in during exploration)
- **Layer 2:** Melody (fades in during story moments)
- **Layer 3:** Combat strings (fades in during combat)

All layers start playing simultaneously and stay in sync. Only their volumes change.

```
music.set_layer_volume(COMBAT_LAYER, in_combat ? 1.0 : 0.0)
```

---

## Spatial Audio (2D)

Position sounds in the stereo field based on world position relative to the listener (camera/player):

```
function calculate_spatial(source_pos, listener_pos, max_distance):
    dist = distance(source_pos, listener_pos)
    volume = clamp(1 - (dist / max_distance), 0, 1)
    volume *= volume    // quadratic falloff sounds more natural

    dx = source_pos.x - listener_pos.x
    pan = clamp(dx / max_distance, -1, 1)

    return (volume, pan)
```

Apply the computed volume and pan to the sound effect instance.

---

## Sound Variation

Avoid repetition by randomizing sounds:

### Multiple Variants

Store 3--5 variants of the same sound. Randomly pick one, avoiding repeating the same variant consecutively.

### Pitch Randomization

Slight random pitch variation (+/-5%) makes repeated sounds feel natural:

```
pitch = (random() - 0.5) * 0.1    // +/- 5%
play_sound(sfx, volume, pitch, pan)
```

---

## Impact Layering

For impactful game feel, layer multiple sounds for a single game event:

| Layer | Role | Volume |
|-------|------|--------|
| **Transient** | Sharp attack (click, crack) | 100% |
| **Body** | Weight/substance (thud, crunch) | 80% |
| **Sweetener** | Character (shatter, ring, sparkle) | 40% |
| **Tail** | Decay/reverb | Handled by DSP or long sample |

Playing all layers simultaneously creates a rich, satisfying sound from simple components.

---

## Audio Best Practices

- **Never play duplicate sounds on the same frame** -- if two identical sounds trigger simultaneously, play only one (or slightly offset the second)
- **Limit simultaneous instances of the same sound** -- e.g., max 3 concurrent footstep sounds
- **Preload frequently used sounds** -- avoid loading from disk during gameplay
- **Use compressed formats for music** (streaming) and uncompressed for short SFX (low latency)
- **Provide separate volume sliders** for music, SFX, and master in the options menu
- **Support muting** when the game loses focus

---

*Implementation examples are available in engine-specific modules.*
