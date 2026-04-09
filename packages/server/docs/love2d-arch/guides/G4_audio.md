# G4 — Audio

> **Category:** guide · **Engine:** Love2D · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## Overview

LÖVE's audio system is built on OpenAL, providing playback, spatial positioning, effects processing, and microphone recording. The two main modules are `love.audio` (playback, effects, listener) and `love.sound` (decoding, raw sample data).

**Supported formats:** Ogg Vorbis (.ogg), WAV (.wav), MP3 (.mp3), FLAC (.flac). Ogg Vorbis is recommended for both music and SFX due to good compression and quality.

---

## Sources: The Core Playback Object

A `Source` is the primary audio playback object. There are three source types:

| Type | Load behavior | Best for |
|------|--------------|----------|
| `"static"` | Loads entire file into memory | Short sound effects (< 5 seconds) |
| `"stream"` | Streams from disk in chunks | Music, ambience, long audio |
| `"queue"` | Manually feed sample buffers | Procedural audio, real-time synthesis |

### Loading Sources

```lua
function love.load()
    -- Static: entire file in memory — fast to play, clone, and seek
    sfx_jump  = love.audio.newSource("audio/jump.ogg", "static")
    sfx_hit   = love.audio.newSource("audio/hit.wav", "static")

    -- Stream: reads from disk as needed — low memory, slight latency
    music_bgm = love.audio.newSource("audio/bgm.ogg", "stream")

    -- Queue: you push SoundData buffers manually
    synth = love.audio.newQueueableSource(44100, 16, 1, 8)
    -- Args: sampleRate, bitDepth, channels, bufferCount
end
```

### Basic Playback

```lua
-- Play / pause / stop
sfx_jump:play()
music_bgm:play()
music_bgm:pause()
music_bgm:stop()     -- resets to the beginning

-- Check state
if sfx_jump:isPlaying() then ... end

-- Looping
music_bgm:setLooping(true)

-- Volume (0.0 to 1.0, default 1.0)
music_bgm:setVolume(0.5)

-- Pitch (1.0 = normal, 0.5 = half speed, 2.0 = double speed)
sfx_jump:setPitch(1.2)

-- Seek to a position (in seconds)
music_bgm:seek(30)
local pos = music_bgm:tell()  -- current playback position
```

### Playing Overlapping Sound Effects

A single Source can only play once at a time. To play the same sound effect simultaneously (e.g., rapid gunfire), **clone** static sources:

```lua
function playSound(source)
    -- Clone creates a lightweight copy sharing the same audio data
    local s = source:clone()
    s:play()
    -- The clone will be garbage-collected after playback finishes
end

-- Usage:
playSound(sfx_hit)
playSound(sfx_hit)  -- overlaps with the first
```

For high-frequency sounds, maintain a **pool** to avoid garbage collection spikes:

```lua
local pool = {}
local POOL_SIZE = 8

function love.load()
    local base = love.audio.newSource("audio/shoot.ogg", "static")
    for i = 1, POOL_SIZE do
        pool[i] = base:clone()
    end
end

local poolIndex = 1
function playPooled()
    pool[poolIndex]:stop()
    pool[poolIndex]:play()
    poolIndex = (poolIndex % POOL_SIZE) + 1
end
```

---

## Volume Management

### Global Volume

```lua
-- Master volume affects all sources
love.audio.setVolume(0.8)  -- 80% master volume

-- Individual source volume is multiplied by master volume
-- Final volume = source:getVolume() * love.audio.getVolume()
```

### Volume Categories

LÖVE doesn't have built-in volume categories (music, SFX, voice), but you can implement them:

```lua
local volumes = { master = 1.0, music = 0.7, sfx = 1.0 }
local music_sources = {}
local sfx_sources = {}

function setMusicVolume(vol)
    volumes.music = vol
    for _, src in ipairs(music_sources) do
        src:setVolume(vol * volumes.master)
    end
end

function setSFXVolume(vol)
    volumes.sfx = vol
    -- Applied per-play for SFX since they're cloned
end
```

---

## Spatial / Positional Audio

LÖVE supports 3D positional audio via OpenAL. The listener (camera/player) and sources each have a position in 3D space.

**Important:** Positional audio only works with **mono** sources. Stereo sources play without spatialization.

```lua
function love.load()
    -- Load as mono for spatial audio
    sfx_enemy = love.audio.newSource("audio/growl_mono.ogg", "static")

    -- Set distance attenuation model (do this once)
    love.audio.setDistanceModel("inverseclamped")
    -- Options: "none", "inverse", "inverseclamped",
    --          "linear", "linearclamped",
    --          "exponent", "exponentclamped"
end

function love.update(dt)
    -- Update listener position (usually the player/camera)
    love.audio.setPosition(player.x, player.y, 0)
    love.audio.setOrientation(0, 0, -1,  0, 1, 0)
    -- Args: forward xyz, up xyz

    -- Update source positions
    sfx_enemy:setPosition(enemy.x, enemy.y, 0)
end
```

### Attenuation Control

```lua
-- How quickly sound fades with distance
sfx_enemy:setAttenuationDistances(200, 2000)
-- referenceDistance: distance at which volume is 100%
-- maxDistance: distance at which volume reaches minimum

-- Air absorption (high frequencies fade faster over distance)
sfx_enemy:setAirAbsorption(5.0)  -- higher = more absorption

-- Cone-based directional audio (e.g., a megaphone or spotlight)
sfx_enemy:setCone(math.rad(45), math.rad(90), 0.5)
-- innerAngle, outerAngle, outerVolume
```

---

## Audio Effects (love.audio 11.0+)

LÖVE 11.0+ supports OpenAL EFX audio effects. Effects are defined globally and applied per-source.

### Available Effect Types

| Effect | Description |
|--------|-------------|
| `reverb` | Room/space simulation |
| `chorus` | Thickens sound with detuned copies |
| `distortion` | Overdrive / clipping |
| `echo` | Decaying repeats |
| `equalizer` | 4-band EQ (low, mid1, mid2, high) |
| `flanger` | Sweeping comb filter |
| `ringmodulator` | Amplitude modulation |
| `compressor` | Dynamic range compression |

### Using Effects

```lua
function love.load()
    -- Define a named effect
    love.audio.setEffect("cave_reverb", {
        type = "reverb",
        decaytime = 3.0,
        density = 1.0,
        diffusion = 1.0,
        gain = 0.5,
    })

    love.audio.setEffect("battle_echo", {
        type = "echo",
        delay = 0.2,
        tapdelay = 0.1,
        damping = 0.5,
        feedback = 0.3,
    })

    -- Apply effect to a source
    sfx_footstep:setEffect("cave_reverb")

    -- Apply effect with a filter (only send certain frequencies to the effect)
    sfx_footstep:setEffect("cave_reverb", {
        type = "lowpass",
        volume = 0.8,
        highgain = 0.4,
    })

    -- Remove effect from source
    sfx_footstep:setEffect("cave_reverb", false)
end
```

### Source Filters

Filters modify the dry (direct) signal from a source, independent of effects:

```lua
-- Apply a lowpass filter (muffle sound, e.g., underwater or behind a wall)
source:setFilter({
    type = "lowpass",    -- "lowpass", "highpass", or "bandpass"
    volume = 1.0,        -- overall volume
    highgain = 0.2,      -- how much high frequency passes (0-1)
})

-- Remove filter
source:setFilter()
```

---

## Recording (love.audio 11.0+)

LÖVE can capture audio from microphones:

```lua
function love.load()
    local devices = love.audio.getRecordingDevices()
    if #devices > 0 then
        mic = devices[1]
        -- Start recording: sampleCount, sampleRate, bitDepth, channels
        mic:start(1024, 44100, 16, 1)
    end
end

function love.update(dt)
    if mic and mic:isRecording() then
        local sampleCount = mic:getSampleCount()
        if sampleCount >= 1024 then
            local soundData = mic:getData()
            -- Process soundData (visualization, voice chat, etc.)
        end
    end
end

function love.quit()
    if mic and mic:isRecording() then
        mic:stop()
    end
end
```

**Note:** Recording is not supported on iOS. Check `love.audio.getRecordingDevices()` returns a non-empty table.

---

## Queueable Sources (Procedural Audio)

For real-time audio generation — synthesizers, dynamic music, voice synthesis:

```lua
function love.load()
    local sampleRate = 44100
    local bitDepth = 16
    local channels = 1
    local bufferCount = 8

    synth = love.audio.newQueueableSource(sampleRate, bitDepth, channels, bufferCount)
    synth:play()
end

function love.update(dt)
    -- Keep the queue fed to avoid audio dropouts
    while synth:getFreeBufferCount() > 0 do
        local samples = 1024
        local data = love.sound.newSoundData(samples, 44100, 16, 1)

        -- Generate a sine wave
        for i = 0, samples - 1 do
            local t = (phase + i) / 44100
            local value = math.sin(2 * math.pi * 440 * t)  -- 440 Hz
            data:setSample(i, value)
        end
        phase = phase + samples

        synth:queue(data)
    end
end
```

---

## Common Patterns

### Crossfading Music Tracks

```lua
local current_music = nil
local next_music = nil
local fade_timer = 0
local FADE_DURATION = 2.0

function crossfadeTo(new_source)
    if current_music then
        next_music = new_source
        next_music:setVolume(0)
        next_music:play()
        fade_timer = FADE_DURATION
    else
        current_music = new_source
        current_music:setVolume(1)
        current_music:play()
    end
end

function love.update(dt)
    if fade_timer > 0 and next_music then
        fade_timer = fade_timer - dt
        local t = math.max(0, fade_timer / FADE_DURATION)
        current_music:setVolume(t)
        next_music:setVolume(1 - t)

        if fade_timer <= 0 then
            current_music:stop()
            current_music = next_music
            next_music = nil
        end
    end
end
```

### Randomized Sound Variations

Avoid repetitive audio by varying pitch and selecting from multiple clips:

```lua
local hit_sounds = {}

function love.load()
    for i = 1, 3 do
        hit_sounds[i] = love.audio.newSource("audio/hit" .. i .. ".ogg", "static")
    end
end

function playHitSound()
    local src = hit_sounds[love.math.random(#hit_sounds)]:clone()
    src:setPitch(0.9 + love.math.random() * 0.2)  -- pitch between 0.9 and 1.1
    src:play()
end
```

---

## Performance Tips

1. **Use `"static"` for short SFX, `"stream"` for music.** Static sources use more memory but have zero disk I/O during playback.
2. **Clone, don't reload.** `source:clone()` shares the underlying audio data — it's cheap.
3. **Pool high-frequency sounds.** Pre-create clones to avoid GC pressure from rapid fire/explosion sounds.
4. **Limit simultaneous sources.** OpenAL typically supports 32–256 concurrent sources depending on the platform. Prioritize important sounds.
5. **Use mono for spatial audio.** Stereo sources ignore positional settings entirely.
6. **Set `love.audio.setDistanceModel()` once.** Changing it mid-game affects all sources.

---

## Common Pitfalls

1. **Playing a streaming source that already finished** — call `source:stop()` then `source:play()` to restart, or `source:rewind()`.
2. **Stereo sources not spatializing** — positional audio requires mono sources. Re-export your audio as mono.
3. **Audio clicks/pops from queueable sources** — keep the buffer queue fed. Check `getFreeBufferCount()` every frame.
4. **Forgetting to stop music on state transitions** — use `love.audio.stop()` to halt all sources, or stop individually.
5. **Volume stacking** — multiple overlapping clones of the same sound can clip. Use a pool with a max count.
