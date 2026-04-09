# G8 — Audio System and Sound Management in GDevelop

> **Category:** guide · **Engine:** GDevelop · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Events and Behaviors](G1_events_and_behaviors.md) · [R2 Variables and Data Management](../reference/R2_variables_and_data_management.md)

---

GDevelop separates audio into two categories: **sounds** (short effects like jumps, explosions, UI clicks) and **music** (longer tracks like background loops, ambient audio). Both use the same underlying Web Audio API, but they differ in how GDevelop loads and manages them. This guide covers the audio system end-to-end — from importing files to advanced channel management and spatial audio patterns.

---

## Sounds vs. Music

| | Sounds | Music |
|---|--------|-------|
| **Typical use** | Short effects (< 10 seconds) | Background tracks, ambience |
| **Loading** | Fully decoded into memory before playback | Streamed from disk/network |
| **Simultaneous playback** | Many at once | Usually 1–2 tracks |
| **Memory cost** | Higher per file (decoded PCM) | Lower (streamed) |
| **Latency** | Very low (instant playback) | Slightly higher (buffering) |

**Rule of thumb:** If the file is under ~10 seconds and needs instant response (footsteps, gunshots, UI), use a sound. If it plays for a long time or loops as background, use music.

### Supported Formats

GDevelop supports common web audio formats: **WAV**, **OGG**, **MP3**, and **AAC**. For maximum compatibility across all export targets:

- Use **OGG** for sounds (small file size, good quality, wide support).
- Use **MP3** or **AAC** for music (universally supported for streaming).
- Avoid WAV for anything shipped — file sizes are large.

---

## Basic Playback

### Playing a Sound

The simplest action plays a sound file immediately:

```
Action: Play the sound "jump.ogg"
  Channel: (leave empty for auto-assigned)
  Volume: 100
  Loop: No
```

When no channel is specified, GDevelop assigns the sound to an internal slot automatically. The sound plays and is discarded from memory when finished.

### Playing Music

```
Action: Play the music "level1_theme.mp3"
  Channel: 0
  Volume: 80
  Loop: Yes
```

Music actions work the same way, but you should **always assign a channel** to music so you can control it later (fade, pause, stop).

### Volume

Volume ranges from **0** (silent) to **100** (full). This applies to both the initial play action and runtime volume adjustments. There is also a **global volume** that scales all audio output.

---

## Channel System

Channels give you control over individual audio streams after playback starts. A channel is simply an integer ID you choose — there is no setup step.

### How Channels Work

- Playing audio on a channel **replaces** whatever was already playing on that channel.
- Channel numbers are arbitrary — use any positive integer.
- Sounds and music use **separate** channel pools (sound channel 0 ≠ music channel 0).

### Recommended Channel Layout

| Channel | Purpose | Type |
|---------|---------|------|
| 0 | Background music | Music |
| 1 | Ambient track (rain, wind) | Music |
| 0–9 | UI sounds (clicks, hovers) | Sound |
| 10–19 | Player sounds (jump, attack, hurt) | Sound |
| 20–29 | Enemy sounds | Sound |
| 30–39 | Environment (doors, pickups) | Sound |

This is a convention, not a requirement — use whatever numbering makes sense for your project.

### Channel Actions

| Action | Description |
|--------|-------------|
| Play a sound on a channel | Play and assign to a specific channel |
| Play a music file on a channel | Stream music on a specific channel |
| Pause the sound on a channel | Pause (resume later) |
| Resume the sound on a channel | Continue from where it was paused |
| Stop the sound on a channel | Stop and release the channel |
| Set volume of a sound on a channel | Change volume (0–100) at runtime |
| Set playback rate on a channel | Speed up or slow down (1 = normal, 2 = double speed) |
| Seek to a position on a channel | Jump to a specific time (seconds) |

### Channel Conditions

| Condition | Description |
|-----------|-------------|
| Sound on a channel is playing | True while audio is active on that channel |
| Sound on a channel is paused | True if paused |
| Sound on a channel has ended | Triggered once when playback finishes |
| Compare volume of sound on a channel | Check current volume |
| Compare playback position | Check current time in seconds |

### Channel Expressions

| Expression | Returns |
|------------|---------|
| `SoundChannelVolume(channel)` | Current volume (0–100) |
| `SoundChannelPlaybackPosition(channel)` | Current position in seconds |
| `SoundChannelDuration(channel)` | Total duration in seconds |
| `MusicChannelVolume(channel)` | Music channel volume |
| `MusicChannelPlaybackPosition(channel)` | Music playback position |

---

## Volume Fading

GDevelop provides a dedicated fade action for smooth volume transitions:

```
Action: Fade the volume of the sound on channel 0
  From: 100
  To: 0
  Duration: 2 (seconds)
```

### Common Fade Patterns

**Fade in music at scene start:**
```
Event: At the beginning of the scene
  Action: Play music "forest_theme.mp3" on channel 0, volume 0, loop yes
  Action: Fade volume of music on channel 0 from 0 to 80 over 3 seconds
```

**Cross-fade between tracks:**
```
Event: Player enters cave area
  Action: Fade volume of music on channel 0 from 80 to 0 over 2 seconds
  Action: Play music "cave_theme.mp3" on channel 1, volume 0, loop yes
  Action: Fade volume of music on channel 1 from 0 to 80 over 2 seconds

Event: Wait 2 seconds (use timer)
  Action: Stop music on channel 0
```

**Fade out before scene change:**
```
Event: Player touches ExitDoor
  Action: Fade volume of music on channel 0 from 80 to 0 over 1 second
  Action: Wait 1 second (timer)
  Action: Change scene to "NextLevel"
```

---

## Spatial Audio Patterns

GDevelop does not have a built-in 3D/spatial audio system, but you can simulate positional audio using events and volume math.

### Distance-Based Volume

```
Event: Every frame
  Local variable: dist = DistanceBetweenPositions(Player.X, Player.Y, Waterfall.X, Waterfall.Y)
  Local variable: vol = max(0, 100 - (dist / 5))
  Action: Set volume of sound on channel 30 to vol
```

This creates a linear falloff — the waterfall sound gets quieter as the player moves away.

### Stereo Panning (Left/Right)

GDevelop does not have a native panning action, but you can approximate it with two channels:

```
Event: Every frame
  Local variable: pan = clamp((Enemy.X - Player.X) / 400, -1, 1)
  Action: Set volume on channel 20 (left) to 100 * max(0, 1 - pan)
  Action: Set volume on channel 21 (right) to 100 * max(0, 1 + pan)
```

---

## Built-In Sound Effect Creator (jfxr)

The desktop version of GDevelop bundles **jfxr**, a retro sound effect synthesizer. You can generate common game sounds without any external tools.

### Accessing jfxr

1. Open the **Resources** panel.
2. Click **+** → **Create a new sound effect with jfxr**.
3. Choose a preset (Pickup, Laser, Explosion, Jump, Powerup, Hit, Blip).
4. Tweak parameters (frequency, sustain, decay, tremolo, etc.).
5. Click **Save** — the generated WAV is added to your project resources.

### jfxr Preset Categories

| Preset | Typical Use |
|--------|-------------|
| Pickup / Coin | Collecting items, scoring |
| Laser / Shoot | Projectile firing |
| Explosion | Destruction, impacts |
| Powerup | Gaining abilities, level up |
| Hit / Hurt | Taking damage |
| Jump | Player jumping |
| Blip / Select | Menu navigation, UI feedback |

**Note:** jfxr is only available in the desktop editor, not the web editor.

---

## Audio Context Extension

For advanced procedural audio, GDevelop offers an experimental **Audio Context** extension that exposes the underlying Web Audio API.

### What It Enables

- Oscillator-based sound generation (sine, square, sawtooth, triangle waves)
- Real-time frequency and gain manipulation
- Procedural sound effects without pre-recorded files

### When to Use It

- Retro-style games that want fully synthesized audio
- Dynamic sound effects that change based on game state (engine RPM, wind speed)
- Prototyping when you don't have sound assets yet

This extension is community-maintained and marked experimental — test thoroughly across export targets.

---

## Performance Tips

- **Preload critical sounds** — Sounds play from memory. The first play of a sound file incurs a loading delay. Play sounds with volume 0 at scene start to preload them, or use the "Preload" action if available.
- **Limit simultaneous sounds** — Playing dozens of overlapping sounds causes audio clipping and performance drops. Use a cooldown timer (e.g., 0.05 seconds) between rapid-fire effects.
- **Stop sounds that are no longer relevant** — An explosion sound on channel 25 keeps the channel occupied. Stop it when the effect is done.
- **Use OGG over WAV** — WAV files are 5–10x larger. Compressed formats reduce download size and loading time.
- **Keep music files under 5 MB** — Larger files increase scene load times, especially on mobile and web exports.
- **Mute audio when the game is paused** — Save the current volumes, set to 0, and restore on resume.

---

## Common Pitfalls

| Problem | Cause | Solution |
|---------|-------|----------|
| Sound doesn't play on mobile web | Browser autoplay policy blocks audio before user interaction | Play first sound inside a "On touch" or "On click" event |
| Music restarts when scene restarts | New "Play music" action replaces the track | Check if music is already playing before starting it |
| Volume changes have no effect | Changing volume before anything plays on the channel | Play the audio first, then adjust volume |
| Sounds overlap and distort | Same sound fired every frame | Add a cooldown timer between plays |
| jfxr not available | Using the web editor | Switch to the desktop editor for jfxr access |
| Audio plays after scene ends | Sound channel still active | Stop all channels at end of scene |

---

## Next Steps

- **[G1 Events and Behaviors](G1_events_and_behaviors.md)** — Build the event logic that triggers audio
- **[G3 Publishing and Export](G3_publishing_and_export.md)** — Audio format considerations per platform
- **[R1 Extensions and Custom Behaviors](../reference/R1_extensions_and_custom_behaviors.md)** — Explore the Audio Context extension
