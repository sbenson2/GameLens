# G7 — Animation & Audio

> **Category:** guide · **Engine:** Defold · **Related:** [G2 Game Objects & Collections](G2_game_objects_and_collections.md) · [G1 Message Passing](G1_message_passing.md) · [G5 Input & Properties](G5_input_and_properties.md)

---

## Animation Types in Defold

Defold has three built-in animation systems, each targeting a different domain:

| System | What it animates | Typical use |
|--------|-----------------|-------------|
| **Flipbook** | Sprite frames from an Atlas or Tile Source | Walk cycles, explosions, UI icons |
| **Property animation** | Any numeric property (`position`, `rotation`, `scale`, `tint`, shader constants) | Tweened movement, fading, screen shake |
| **Spine / Rive** | Skeletal meshes via extension | Character rigs with blending and IK |

Most 2D games combine flipbook for visual frame changes with property animation for smooth movement and effects.

---

## Flipbook Animation

A flipbook is a sequence of images played back at a set frame rate. You define them inside an **Atlas** (`.atlas`) or **Tile Source** (`.tilesource`) file by grouping images into named animation groups.

### Setting Up in the Atlas

1. Create or open an `.atlas` file.
2. Add images (individual `.png` frames).
3. Group frames into an **Animation Group** — give it an `id` (e.g., `"run"`, `"idle"`).
4. Set **FPS**, **Playback** mode (`Once Forward`, `Loop Forward`, `Loop Pingpong`, etc.), and **Flip Horizontal/Vertical**.

### Playing at Runtime

```lua
-- Play a flipbook animation on a sprite component
-- "#sprite" addresses the sprite component on the current game object
sprite.play_flipbook("#sprite", hash("run"))

-- Play with a callback when the animation finishes (non-looping)
sprite.play_flipbook("#sprite", hash("jump"), function(self, message_id, message, sender)
    -- Fires when "jump" animation completes
    sprite.play_flipbook("#sprite", hash("idle"))
end)
```

Key parameters for `sprite.play_flipbook(url, id, [complete_function], [play_properties])`:

- `url` — the sprite component to target
- `id` — hashed name of the animation group
- `complete_function` — optional callback for non-looping animations
- `play_properties` — optional table with `offset` (0–1 normalized start point) and `playback_rate` (1.0 = normal speed)

### GUI Flipbook

GUI nodes can also play flipbook animations from their assigned atlas:

```lua
gui.play_flipbook(gui.get_node("enemy_icon"), hash("alert_blink"))
```

---

## Property Animation (Tweening)

`go.animate()` smoothly interpolates any numeric property over time. This is Defold's built-in tween system — no external library needed.

### Basic Syntax

```lua
go.animate(url, property, playback, to, easing, duration, [delay], [complete_function])
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string/hash/url | Target game object or component |
| `property` | string/hash | Property to animate (e.g., `"position.y"`, `"euler.z"`) |
| `playback` | constant | `go.PLAYBACK_ONCE_FORWARD`, `go.PLAYBACK_LOOP_PINGPONG`, etc. |
| `to` | number/vector | Target value |
| `easing` | constant/vector | Easing curve |
| `duration` | number | Duration in seconds |
| `delay` | number | Seconds to wait before starting (default 0) |
| `complete_function` | function | Called when animation finishes |

### Examples

```lua
-- Slide a game object to x=400 over 0.5 seconds
go.animate(".", "position.x", go.PLAYBACK_ONCE_FORWARD, 400, go.EASING_INOUTQUAD, 0.5)

-- Fade out a sprite by animating tint alpha
go.animate("#sprite", "tint.w", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_LINEAR, 0.3)

-- Looping hover bob on y-axis
go.animate(".", "position.y", go.PLAYBACK_LOOP_PINGPONG, 20, go.EASING_INOUTSINE, 1.0)

-- Chained animations via complete callback
go.animate(".", "position.x", go.PLAYBACK_ONCE_FORWARD, 500, go.EASING_OUTBACK, 0.4, 0, function()
    go.animate(".", "position.y", go.PLAYBACK_ONCE_FORWARD, 300, go.EASING_OUTBOUNCE, 0.6)
end)
```

### Common Easing Constants

Defold provides a full set of Robert Penner easing functions:

- **Linear:** `go.EASING_LINEAR`
- **Quad:** `go.EASING_INQUAD`, `go.EASING_OUTQUAD`, `go.EASING_INOUTQUAD`
- **Cubic:** `go.EASING_INCUBIC`, `go.EASING_OUTCUBIC`, `go.EASING_INOUTCUBIC`
- **Back:** `go.EASING_INBACK`, `go.EASING_OUTBACK`, `go.EASING_INOUTBACK`
- **Bounce:** `go.EASING_INBOUNCE`, `go.EASING_OUTBOUNCE`, `go.EASING_INOUTBOUNCE`
- **Elastic:** `go.EASING_INELASTIC`, `go.EASING_OUTELASTIC`, `go.EASING_INOUTELASTIC`
- **Sine:** `go.EASING_INSINE`, `go.EASING_OUTSINE`, `go.EASING_INOUTSINE`
- **Expo:** `go.EASING_INEXPO`, `go.EASING_OUTEXPO`, `go.EASING_INOUTEXPO`
- **Circ:** `go.EASING_INCIRC`, `go.EASING_OUTCIRC`, `go.EASING_INOUTCIRC`

### Custom Easing

You can provide a `vmath.vector()` of sample points instead of a constant. Values range from 0 (start) to 1 (target), with the runtime interpolating between samples:

```lua
local custom = vmath.vector({ 0, 0.5, 0.2, 0.8, 1.0 })
go.animate(".", "position.x", go.PLAYBACK_ONCE_FORWARD, 500, custom, 1.0)
```

### Cancelling Animations

```lua
-- Cancel a specific property animation
go.cancel_animations(".", "position.x")

-- Cancel ALL animations on a game object
go.cancel_animations(".")
```

Always cancel running animations on a property before starting a new one on the same property, otherwise they stack and fight.

---

## Audio System

Defold handles audio through **Sound components** attached to game objects. There is no free-standing "play sound" function — sounds always live on a game object.

### Supported Formats

| Format | Extension | Use for |
|--------|-----------|---------|
| **WAV** | `.wav` | Short sound effects (uncompressed, fast decode) |
| **Ogg Vorbis** | `.ogg` | Music and longer sounds (compressed, streamed) |
| **Ogg Opus** | `.opus` | Music and longer sounds (compressed, lower bitrate) |

### Adding a Sound Component

1. Open (or create) a game object file (`.go`).
2. Right-click → **Add Component → Sound**.
3. Set the `sound` property to your audio file.
4. Optionally assign a **Group** (e.g., `"music"`, `"sfx"`) for volume mixing.

### Playing Sounds via Messages

```lua
-- Play a sound component on the current game object
sound.play("#sfx_jump")

-- Play with gain and speed overrides
sound.play("#sfx_hit", { gain = 0.5, speed = 1.2 })

-- Play with a completion callback
sound.play("#sfx_explosion", { gain = 1.0 }, function(self, message_id, message, sender)
    -- Sound finished playing
    print("Explosion sound complete")
end)

-- Stop a playing sound
sound.stop("#sfx_music")
```

Each sound component supports up to **32 concurrent voices**. If you call `sound.play` while 32 voices are already active on that component, the oldest voice is stopped.

### Sound Properties

You can read and write sound properties at runtime:

```lua
-- Set volume on a specific sound component (0.0 to 1.0+)
go.set("#sfx_music", "gain", 0.7)

-- Get current gain
local gain = go.get("#sfx_music", "gain")

-- Set stereo panning (-1.0 = full left, 0.0 = center, 1.0 = full right)
go.set("#sfx_hit", "pan", -0.3)

-- Set playback speed (1.0 = normal)
go.set("#sfx_music", "speed", 0.8)
```

Because these are standard Defold properties, you can animate them with `go.animate`:

```lua
-- Fade out music over 2 seconds
go.animate("#sfx_music", "gain", go.PLAYBACK_ONCE_FORWARD, 0, go.EASING_LINEAR, 2.0, 0, function()
    sound.stop("#sfx_music")
end)
```

### Sound Groups (Mixer)

Sound groups let you control volume for categories of sounds independently:

```lua
-- Get all registered group names
local groups = sound.get_groups()
-- Returns a table of hashes, e.g., { hash("music"), hash("sfx"), hash("voice") }

-- Get/set group gain (master volume for the group)
local music_vol = sound.get_group_gain(hash("music"))
sound.set_group_gain(hash("music"), 0.5)

-- Check if a group is muted
local muted = sound.is_music_playing()  -- not a real function; use:
local muted = sound.get_group_gain(hash("music")) == 0

-- Get the RMS (loudness) of a group — useful for visualizers
local left, right = sound.get_rms(hash("master"), 2048)

-- Get peak values
local left_peak, right_peak = sound.get_peak(hash("master"), 2048)
```

### Sound Group Ducking Pattern

A common pattern is ducking background music when dialogue or UI sounds play:

```lua
-- Duck music when dialogue starts
local original_music_gain = sound.get_group_gain(hash("music"))
sound.set_group_gain(hash("music"), original_music_gain * 0.3)

-- Restore after dialogue (use a timer or completion callback)
sound.set_group_gain(hash("music"), original_music_gain)
```

---

## Combining Animation and Audio

A typical pattern ties flipbook animation completion to sound playback:

```lua
function on_message(self, message_id, message, sender)
    if message_id == hash("attack") then
        -- Play attack animation
        sprite.play_flipbook("#sprite", hash("slash"), function()
            -- When animation finishes, return to idle
            sprite.play_flipbook("#sprite", hash("idle"))
        end)
        -- Play attack sound simultaneously (not waiting for anim)
        sound.play("#sfx_slash")
    end
end
```

For frame-accurate sync (e.g., footstep sounds), use property animation delays timed to match specific flipbook frames, or handle timing in `update()` by checking the animation cursor.
