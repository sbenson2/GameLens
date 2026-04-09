# Audio System & Sound Design

> **Category:** guide · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 Behaviors and Effects](../reference/R1_behaviors_and_effects.md) · [G1 Event Sheet Patterns](G1_event_sheet_patterns.md)

Construct 3's Audio plugin wraps the Web Audio API behind an event-sheet-friendly interface. This guide covers importing sound assets, playing music and SFX, managing playback with tags, applying real-time audio effects, and common patterns for game audio.

---

## Importing Sound Assets

### Sounds vs. Music

Construct separates audio imports into two folders in the Project Bar:

| Folder | Decoding | Best For |
|--------|----------|----------|
| **Sounds** | Fully decoded into memory on load | Short SFX (jumps, hits, UI clicks) — low latency |
| **Music** | Streamed from disk during playback | BGM, ambient loops — lower memory usage |

Place assets in the correct folder. A 3-minute music track in the Sounds folder will eat memory; a tiny UI blip in the Music folder will add unnecessary streaming overhead.

### Supported Formats

Construct exports both **WebM Opus** and **AAC (.m4a)** for broad browser compatibility. You import one source file (WAV or OGG recommended) and Construct encodes both at export time. Do not import compressed MP3s — re-encoding a lossy format produces artifacts.

---

## The Audio Object

Add the **Audio** object to your project from Insert New Object (it has no visual presence — it is a project-wide singleton).

### Basic Playback

**Play a sound effect:**

| Step | Event/Action |
|------|-------------|
| Condition | Keyboard → On key pressed → Space |
| Action | Audio → **Play** → `"jump"` (from Sounds folder), **Not looping**, Volume **-10 dB**, Tag `"sfx"` |

**Play background music on layout start:**

| Step | Event/Action |
|------|-------------|
| Condition | System → On start of layout |
| Action | Audio → **Play** → `"main_theme"` (from Music folder), **Looping**, Volume **-12 dB**, Tag `"music"` |

### Volume Units

Construct uses **decibels (dB)** for volume. Key reference points:

| dB | Perceived Level |
|----|----------------|
| 0 | Maximum (often too loud) |
| -10 | Comfortable default for SFX |
| -12 to -15 | Comfortable default for BGM |
| -30 | Quiet / ambient |
| -60 | Effectively silent |

---

## Tags — Organizing and Controlling Audio

Every Play action assigns a **tag** string. Tags let you control groups of sounds or address individual playback instances.

### Tag Strategies

| Pattern | Tag Value | Use Case |
|---------|-----------|----------|
| Category tags | `"music"`, `"sfx"`, `"ambient"`, `"ui"` | Volume sliders in options menu |
| Instance tags | `"music"` (shared) | Only one BGM plays at a time — new Play with same tag stops the old one |
| Unique tags | `"footstep_" & Self.UID` | Per-instance spatial SFX |

### Controlling Audio by Tag

| Action | What It Does |
|--------|-------------|
| **Stop** `"music"` | Stops all sounds with the `"music"` tag |
| **Set volume** `"sfx"` to -20 | Changes volume for all sounds tagged `"sfx"` |
| **Set muted** `"music"` | Mutes without stopping (preserves playback position) |
| **Set paused** `"sfx"` | Pauses all SFX (useful for pause menus) |
| **Set playback rate** `"music"` to 0.8 | Slow-mo effect on music |

### Options Menu Pattern

Use global variables for volume settings and apply them on every layout start:

| Event | Action |
|-------|--------|
| On start of layout | Audio → Set volume `"music"` to `Global.MusicVolume` |
| On start of layout | Audio → Set volume `"sfx"` to `Global.SFXVolume` |
| Slider "MusicSlider" changed | Set `Global.MusicVolume` to `MusicSlider.Value` → Audio → Set volume `"music"` to `Global.MusicVolume` |

---

## Audio Effects Chain

Construct 3 supports **real-time audio effects** routed through the Web Audio API. Effects are applied per-tag, creating a processing chain.

### Available Effects

| Effect | Description | Common Use |
|--------|-------------|------------|
| **Convolution** | Applies an impulse response recording to simulate a space | Room reverb, cave echo |
| **Delay** | Repeats the signal after a time gap with feedback | Echo, slapback |
| **Chorus** | Modulates pitch/timing of copies | Thickening pads, shimmering ambience |
| **Flanger** | Short modulated delay with feedback | Sweeping metallic SFX |
| **Phaser** | All-pass filter sweep | Swooshy transitions |
| **Gain** | Volume boost/cut in the chain | Leveling between effects |
| **Tremolo** | Periodic volume modulation | Pulsing tension |
| **Ring modulator** | Multiplies signal with a sine wave | Robotic or alien voices |
| **Distortion** | Waveshaping distortion | Aggressive SFX, damage feedback |
| **Compressor** | Reduces dynamic range | Leveling music, preventing clipping |
| **Filter** | Low-pass, high-pass, band-pass, etc. | Muffled underwater sound, radio effect |
| **Analyser** | Provides frequency data (no audible change) | Visualizers, beat detection |

### Applying Effects via Events

Effects are added to a tag's processing chain in order:

| Action | Parameters |
|--------|-----------|
| Audio → **Add effect** | Tag: `"music"`, Effect: **Filter**, Type: Low-pass, Frequency: 500, Q: 1 |
| Audio → **Add effect** | Tag: `"music"`, Effect: **Convolution**, Source: `"cave_ir"` |

Effects stack: audio flows through them in the order they were added.

### Removing Effects

Use **Remove all effects** on a tag to clear the chain. You cannot remove a single effect by index — clear and rebuild if needed.

### Practical Patterns

**Underwater / indoor muffling:**

| Event | Action |
|-------|--------|
| Player overlaps WaterZone | Audio → Add effect `"sfx"`: **Filter**, Low-pass, Freq 400, Q 2 |
| Player stops overlapping WaterZone | Audio → Remove all effects `"sfx"` |

**Boss entrance dramatic reverb:**

| Event | Action |
|-------|--------|
| Boss enters screen | Audio → Add effect `"music"`: **Convolution** with `"cathedral_ir"` |
| Battle starts | Audio → Remove all effects `"music"` → Audio → Play `"boss_theme"` |

---

## Positional Audio

Construct does not have a built-in 3D positional audio system, but you can simulate proximity-based audio with events.

### Distance-Based Volume Pattern

For each sound-emitting object, calculate its distance to the listener (typically the player) and map that to volume:

| Event | Condition | Action |
|-------|-----------|--------|
| Every tick | (none — runs each frame) | Audio → Set volume `"campfire_" & Campfire.UID` to `max(-60, -0.05 * distance(Player.X, Player.Y, Campfire.X, Campfire.Y))` |

The formula maps distance linearly to dB. Adjust the multiplier (-0.05) to control falloff. The `max(-60, …)` prevents extreme negative values.

### Stereo Panning

Use the **Set stereo pan** action to pan sounds left/right based on horizontal position:

```
Pan = clamp((Campfire.X - Player.X) / 400, -1, 1)
```

Apply via: Audio → Set stereo pan `"campfire_" & Campfire.UID` to the calculated pan value.

---

## Music Crossfading

Construct does not have a built-in crossfade action, but you can implement it with two tagged music channels:

| Step | Event/Action |
|------|-------------|
| 1 | Play new track on `"music_b"` at volume **-60** (silent) |
| 2 | Every tick: increase `"music_b"` volume by `60 * dt` until it reaches target |
| 3 | Every tick: decrease `"music_a"` volume by `60 * dt` until it reaches -60 |
| 4 | When `"music_a"` reaches -60 → Stop `"music_a"` |
| 5 | Swap tag references so the next crossfade reverses direction |

Use a global variable (`ActiveMusicTag`) to track which tag is currently "live."

---

## Audio and Browser Autoplay Policy

Modern browsers block audio playback until the user interacts with the page (click, tap, or key press). Construct handles this automatically — it queues Play actions and releases them after the first user gesture. However:

- Do not assume audio is playing immediately on layout start in a browser build.
- If you display a "Press any key to start" screen, audio will work naturally after that interaction.
- The **User media** permission is only needed for microphone input, not for playback.

---

## Performance Tips

| Tip | Why |
|-----|-----|
| Keep SFX files short (< 3 seconds) and in the Sounds folder | Fully decoded — no streaming overhead, instant playback |
| Use the Music folder for anything > 10 seconds | Streamed — saves memory |
| Limit simultaneous SFX of the same type | 20 overlapping "hit" sounds cause clipping; use conditions to throttle |
| Avoid adding effects every tick | Add once, then modify parameters; rebuilding chains each frame is wasteful |
| Use `-60 dB` as "silent" rather than stopping | Allows smooth fade-ins without restarting playback |
| Preload music on layout start | Use the **Preload** action so there is no delay when Play is called |

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Music restarts on layout change | New Play action fires on every start-of-layout | Check `Audio.IsTagPlaying("music")` before playing |
| SFX sounds clipped or distorted | Too many overlapping instances at 0 dB | Lower default volume to -10 dB; limit concurrent plays |
| No audio on mobile browser | Autoplay policy blocking playback | Ensure a user interaction occurs before gameplay starts |
| Effect chain sounds wrong | Effects added in unexpected order | Clear all effects and re-add in the correct sequence |
| Volume slider has no effect | Tag mismatch | Verify the tag string in Set Volume matches the tag used in Play exactly (case-sensitive) |
