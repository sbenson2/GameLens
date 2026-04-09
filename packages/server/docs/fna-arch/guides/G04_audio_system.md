# G04 — Audio System with FAudio

> **Category:** Guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [FNA Architecture Rules](../fna-arch-rules.md)

FNA's audio is powered by FAudio, an accuracy-focused reimplementation of Microsoft's XAudio2, X3DAudio, XAPO, and XACT3 libraries. Because FNA preserves the XNA 4.0 API surface exactly, you write audio code using the same `Microsoft.Xna.Framework.Audio` and `Microsoft.Xna.Framework.Media` namespaces as original XNA — but with cross-platform support and different format requirements. This guide covers the full audio stack: SoundEffect for one-shot and looping sounds, Song for background music, XACT for authored audio banks, 3D positional audio, and FNA-specific format considerations.

---

## Table of Contents

1. [Audio Architecture Overview](#1--audio-architecture-overview)
2. [FAudio Native Library Setup](#2--faudio-native-library-setup)
3. [Supported Audio Formats](#3--supported-audio-formats)
4. [SoundEffect — One-Shot and Looping Sounds](#4--soundeffect--one-shot-and-looping-sounds)
5. [SoundEffectInstance — Controlled Playback](#5--soundeffectinstance--controlled-playback)
6. [Song and MediaPlayer — Background Music](#6--song-and-mediaplayer--background-music)
7. [XACT Audio Engine](#7--xact-audio-engine)
8. [3D Positional Audio](#8--3d-positional-audio)
9. [Dynamic Sound Generation](#9--dynamic-sound-generation)
10. [Audio Resource Management](#10--audio-resource-management)
11. [Cross-Platform Format Pipeline](#11--cross-platform-format-pipeline)
12. [Common Pitfalls](#12--common-pitfalls)
13. [Performance Considerations](#13--performance-considerations)
14. [Differences from MonoGame Audio](#14--differences-from-monogame-audio)

---

## 1 — Audio Architecture Overview

FNA's audio stack is a layered system where the C# API surface matches XNA exactly, but the underlying implementation uses FAudio instead of Microsoft's proprietary DirectX Audio libraries.

### The Audio Stack

```
┌─────────────────────────────────────────────┐
│  Your Game Code                              │
│  (Microsoft.Xna.Framework.Audio / .Media)    │
├─────────────────────────────────────────────┤
│  FNA Audio Layer (C#)                        │
│  SoundEffect, Song, AudioEngine, etc.        │
├─────────────────────────────────────────────┤
│  FAudio# (C# bindings)                       │
│  P/Invoke bridge to native FAudio            │
├─────────────────────────────────────────────┤
│  FAudio (native C library)                   │
│  XAudio2 + X3DAudio + XAPO + XACT3          │
├─────────────────────────────────────────────┤
│  SDL3 Audio Backend                          │
│  Platform audio output (ALSA, CoreAudio,     │
│  WASAPI, PulseAudio, etc.)                   │
└─────────────────────────────────────────────┘
```

### Key Namespace Mapping

| Namespace | Purpose | Requires FAudio |
|-----------|---------|-----------------|
| `Microsoft.Xna.Framework.Audio` | SoundEffect, XACT | Yes |
| `Microsoft.Xna.Framework.Media` | Song, MediaPlayer | Yes |

If your game does not use any audio, FAudio is not required at runtime. FNA lazy-loads the native library on first audio API call.

## 2 — FAudio Native Library Setup

FAudio is a native library distributed as part of FNA's "fnalibs" package. It is **not** a NuGet package.

### Obtaining FAudio

Download prebuilt binaries from the FNA repository or the fnalibs archive:

```bash
# Clone fnalibs (includes FAudio, FNA3D, SDL2, Theorafile)
git clone https://github.com/FNA-XNA/fnalibs.git

# Or download a specific platform archive
# The fnalibs repository contains per-platform directories:
#   lib64/       — Linux x86_64
#   osx/         — macOS universal
#   x64/         — Windows x64
```

### Placing Native Libraries

Native libraries must be in the application's working directory or a platform-appropriate library search path at runtime:

| Platform | Library File | Location |
|----------|-------------|----------|
| Windows | `FAudio.dll` | Next to `.exe` |
| Linux | `libFAudio.so.0` | Next to binary or in `LD_LIBRARY_PATH` |
| macOS | `libFAudio.0.dylib` | Next to binary or in `DYLD_LIBRARY_PATH` |

### Build Verification

A quick test to confirm FAudio is loaded:

```csharp
protected override void Initialize()
{
    // This will throw if FAudio native lib is missing
    SoundEffect.MasterVolume = 1.0f;
    System.Console.WriteLine("FAudio loaded successfully");
    base.Initialize();
}
```

## 3 — Supported Audio Formats

This is the most critical difference between FNA and both XNA and MonoGame. FNA does **not** support Windows-specific audio codecs.

### Format Comparison

| Format | XNA (Windows) | FNA | MonoGame |
|--------|---------------|-----|----------|
| WAV (PCM) | Yes | Yes | Yes |
| WAV (ADPCM) | Yes | Yes | Yes |
| Ogg Vorbis | No | **Yes (preferred)** | Yes |
| QOA | No | **Yes** | No |
| MP3 | Yes | No | Yes |
| WMA | Yes | No | No |
| xWMA | Yes | No | No |
| XMA | Yes (Xbox 360) | No | No |

### Recommended Formats for FNA

- **Sound effects:** WAV (PCM, 16-bit, 44100 Hz) for short clips; Ogg Vorbis for longer effects
- **Music:** Ogg Vorbis (`.ogg`) — the standard music format for FNA
- **XACT WaveBanks:** ADPCM compression only — do **not** use xWMA or XMA codecs when building banks for FNA

### QOA (Quite OK Audio)

QOA is a newer fixed-ratio lossy audio format that FNA supports. It offers:

- Fast decoding (faster than Vorbis, simpler than ADPCM)
- Reasonable quality at ~3.2 bits per sample
- Tiny decoder footprint

QOA is useful for games targeting low-spec hardware or wanting minimal decode overhead. For most projects, Ogg Vorbis remains the standard choice.

## 4 — SoundEffect — One-Shot and Looping Sounds

`SoundEffect` is the simplest way to play audio in FNA. It loads an entire sound into memory and plays it on demand.

### Loading a SoundEffect

```csharp
// Via content pipeline (loaded from .xnb)
SoundEffect jumpSound = Content.Load<SoundEffect>("Audio/jump");

// Via raw file loading (no content pipeline needed)
using var stream = File.OpenRead("Content/Audio/jump.wav");
SoundEffect jumpSound = SoundEffect.FromStream(stream);
```

### Playing a SoundEffect

```csharp
// Fire-and-forget — simplest approach
jumpSound.Play();

// With volume, pitch, and pan
// volume: 0.0 (silent) to 1.0 (full)
// pitch: -1.0 (octave down) to 1.0 (octave up), 0.0 = normal
// pan: -1.0 (left) to 1.0 (right), 0.0 = center
jumpSound.Play(volume: 0.8f, pitch: 0.0f, pan: 0.0f);
```

### Master Volume

```csharp
// Global volume control for all SoundEffects (0.0 to 1.0)
SoundEffect.MasterVolume = 0.5f;

// Mute all sound effects
SoundEffect.MasterVolume = 0.0f;
```

### SoundEffect Lifetime

`SoundEffect` implements `IDisposable`. Always dispose when no longer needed:

```csharp
// In UnloadContent or when switching scenes
jumpSound.Dispose();
```

**Warning:** Disposing a `SoundEffect` while instances are playing will stop those instances immediately. Always stop playback before disposing.

## 5 — SoundEffectInstance — Controlled Playback

For sounds that need pause, resume, volume changes during playback, or looping, use `SoundEffectInstance`.

### Creating and Using Instances

```csharp
SoundEffect engineSound = Content.Load<SoundEffect>("Audio/engine_loop");
SoundEffectInstance engineInstance = engineSound.CreateInstance();

// Configure before or during playback
engineInstance.IsLooped = true;
engineInstance.Volume = 0.6f;
engineInstance.Pitch = 0.0f;
engineInstance.Pan = 0.0f;

// Playback control
engineInstance.Play();
engineInstance.Pause();
engineInstance.Resume();
engineInstance.Stop();

// Check state
if (engineInstance.State == SoundState.Playing)
{
    // Currently playing
}
```

### Instance Limits

XNA (and therefore FNA) has a limit on concurrent `SoundEffectInstance` playback. The exact limit depends on the platform and FAudio configuration, but plan for approximately 64 concurrent voices. If you exceed the limit, the oldest non-looping sound may be stopped to make room.

### Instance Pooling Pattern

For frequently played sounds (footsteps, gunshots), pre-create a pool of instances:

```csharp
public class SoundPool
{
    private readonly SoundEffect _effect;
    private readonly SoundEffectInstance[] _instances;
    private int _nextIndex;

    public SoundPool(SoundEffect effect, int poolSize = 8)
    {
        _effect = effect;
        _instances = new SoundEffectInstance[poolSize];
        for (int i = 0; i < poolSize; i++)
            _instances[i] = effect.CreateInstance();
    }

    public void Play(float volume = 1.0f, float pitch = 0.0f, float pan = 0.0f)
    {
        var instance = _instances[_nextIndex];
        if (instance.State == SoundState.Playing)
            instance.Stop();

        instance.Volume = volume;
        instance.Pitch = pitch;
        instance.Pan = pan;
        instance.Play();

        _nextIndex = (_nextIndex + 1) % _instances.Length;
    }

    public void Dispose()
    {
        foreach (var instance in _instances)
            instance.Dispose();
    }
}
```

## 6 — Song and MediaPlayer — Background Music

`Song` and `MediaPlayer` handle streaming music playback. Unlike `SoundEffect` (which loads entirely into memory), `Song` streams from disk.

### Loading and Playing Music

```csharp
// Load via content pipeline
Song backgroundMusic = Content.Load<Song>("Music/overworld");

// Or load from a raw Ogg Vorbis file
Song backgroundMusic = Song.FromUri("overworld", new Uri("Content/Music/overworld.ogg", UriKind.Relative));

// Play with MediaPlayer
MediaPlayer.Play(backgroundMusic);
MediaPlayer.Volume = 0.4f;
MediaPlayer.IsRepeating = true;
```

### MediaPlayer Controls

```csharp
// Volume: 0.0 to 1.0
MediaPlayer.Volume = 0.5f;

// Repeat
MediaPlayer.IsRepeating = true;

// Mute (preserves volume setting)
MediaPlayer.IsMuted = true;

// Playback control
MediaPlayer.Pause();
MediaPlayer.Resume();
MediaPlayer.Stop();

// Current state
MediaPlayer.State // MediaState.Playing, Paused, or Stopped
```

### FNA Music Format Requirement

**FNA requires Ogg Vorbis (`.ogg`) for Song playback.** This is the single most common audio issue when porting from XNA or MonoGame to FNA:

- XNA uses Windows Media Player → supports WMA, MP3
- MonoGame varies by platform → supports MP3 on most platforms
- FNA uses Vorbisfile → **only Ogg Vorbis**

Convert all music files to Ogg Vorbis before targeting FNA. Use FFmpeg:

```bash
# Convert MP3 to Ogg Vorbis at quality 6 (~192 kbps)
ffmpeg -i music.mp3 -c:a libvorbis -q:a 6 music.ogg

# Convert WAV to Ogg Vorbis
ffmpeg -i music.wav -c:a libvorbis -q:a 6 music.ogg

# Batch convert all MP3 files
for f in *.mp3; do ffmpeg -i "$f" -c:a libvorbis -q:a 6 "${f%.mp3}.ogg"; done
```

### Music Crossfading

XNA/FNA `MediaPlayer` does not support crossfading natively. For crossfades, use two `SoundEffectInstance` objects loaded from the full music track (if it fits in memory) or implement a custom streaming solution:

```csharp
// Simple volume-based crossfade using SoundEffectInstance
public class MusicCrossfader
{
    private SoundEffectInstance _current;
    private SoundEffectInstance _next;
    private float _fadeProgress;
    private float _fadeDuration;
    private bool _fading;

    public void StartFade(SoundEffectInstance next, float duration)
    {
        _next = next;
        _fadeDuration = duration;
        _fadeProgress = 0f;
        _fading = true;
        _next.Volume = 0f;
        _next.IsLooped = true;
        _next.Play();
    }

    public void Update(float deltaTime)
    {
        if (!_fading) return;

        _fadeProgress += deltaTime / _fadeDuration;
        if (_fadeProgress >= 1f)
        {
            _current?.Stop();
            _next.Volume = 1f;
            _current = _next;
            _next = null;
            _fading = false;
        }
        else
        {
            _current.Volume = 1f - _fadeProgress;
            _next.Volume = _fadeProgress;
        }
    }
}
```

## 7 — XACT Audio Engine

XACT (Cross-platform Audio Creation Tool) is the professional audio system inherited from XNA. It uses authored sound banks with properties like volume curves, categories, reverb, and cue-based playback — all configured in a tool rather than code.

### When to Use XACT

- Large games with hundreds of sound effects needing organized management
- Audio designers who want to tune without recompiling
- Complex audio behaviors (random selection, sequential playback, fade curves)
- Category-based volume control (SFX, Music, Voice, Ambience)

### XACT Architecture

```
┌────────────────────────────────────────┐
│  XACT Project (.xap)                   │
│  Created in XACT Authoring Tool        │
├────────────────────────────────────────┤
│  Wave Banks (.xwb)                     │
│  Binary containers for audio data      │
│  Compressed with ADPCM (for FNA)       │
├────────────────────────────────────────┤
│  Sound Banks (.xsb)                    │
│  Cue definitions, categories, params   │
├────────────────────────────────────────┤
│  Global Settings (.xgs)                │
│  Categories, variables, RPC curves     │
└────────────────────────────────────────┘
```

### XACT Usage in FNA

```csharp
// Initialize the audio engine
AudioEngine audioEngine = new AudioEngine("Content/Audio/GameAudio.xgs");
WaveBank waveBank = new WaveBank(audioEngine, "Content/Audio/WaveBank.xwb");
SoundBank soundBank = new SoundBank(audioEngine, "Content/Audio/SoundBank.xsb");

// Play a cue by name
soundBank.PlayCue("explosion_large");

// Get a cue for controlled playback
Cue ambientCue = soundBank.GetCue("forest_ambience");
ambientCue.Play();
ambientCue.Pause();
ambientCue.Resume();
ambientCue.Stop(AudioStopOptions.Immediate);

// Set a global variable (for RPC-driven volume, pitch, etc.)
audioEngine.SetGlobalVariable("PlayerHealth", 0.3f);

// Update the engine each frame (required for streaming and 3D)
audioEngine.Update();
```

### XACT Format Warning for FNA

When building XACT WaveBanks for FNA:

- **Use ADPCM compression** — FNA supports this
- **Do NOT use xWMA compression** — FNA cannot decode xWMA
- **Do NOT use XMA compression** — Xbox 360 only
- PCM (uncompressed) also works but results in larger files

## 8 — 3D Positional Audio

FNA supports 3D positional audio through the XNA `AudioEmitter` and `AudioListener` API, powered by FAudio's X3DAudio reimplementation.

### Setting Up 3D Audio

```csharp
private AudioListener _listener = new AudioListener();
private AudioEmitter _emitter = new AudioEmitter();

protected override void Update(GameTime gameTime)
{
    // Update listener position (typically the camera or player)
    _listener.Position = new Vector3(playerX, playerY, 0f);
    _listener.Forward = Vector3.Forward;
    _listener.Up = Vector3.Up;
    _listener.Velocity = new Vector3(playerVelX, playerVelY, 0f);

    // Update emitter position (the sound source)
    _emitter.Position = new Vector3(enemyX, enemyY, 0f);
    _emitter.Forward = Vector3.Forward;
    _emitter.Up = Vector3.Up;
    _emitter.Velocity = new Vector3(enemyVelX, enemyVelY, 0f);

    // Apply 3D positioning to a SoundEffectInstance
    engineInstance.Apply3D(_listener, _emitter);
}
```

### 3D Audio Parameters

- **Position:** Where the sound is in world space
- **Forward/Up:** Orientation vectors (affects directional falloff)
- **Velocity:** Used for Doppler effect calculations
- **DopplerScale:** `SoundEffect.DistanceScale` and `SoundEffect.DopplerScale` control global 3D behavior

### 2D Games and 3D Audio

For 2D games, you can still use 3D audio for panning and distance attenuation. Place everything on the Z=0 plane:

```csharp
_listener.Position = new Vector3(cameraCenter.X, cameraCenter.Y, 0f);
_emitter.Position = new Vector3(soundSource.X, soundSource.Y, 0f);
```

## 9 — Dynamic Sound Generation

FNA supports `DynamicSoundEffectInstance` for procedurally generated audio or custom streaming.

```csharp
var dynamicSound = new DynamicSoundEffectInstance(
    sampleRate: 44100,
    channels: AudioChannels.Mono
);

dynamicSound.BufferNeeded += (sender, args) =>
{
    // Generate or decode audio data
    byte[] buffer = GenerateAudioData();
    dynamicSound.SubmitBuffer(buffer);
};

dynamicSound.Play();
```

### Use Cases for Dynamic Audio

- Procedural sound generation (synthesizers, noise generators)
- Custom audio streaming from non-standard formats
- Real-time audio effects or mixing
- Adaptive music systems that generate stems dynamically

### Buffer Guidelines

- Submit buffers of 2048–8192 samples for low latency
- The `BufferNeeded` event fires when the internal queue runs low
- Always submit at least 2 buffers ahead to prevent gaps
- Audio data must be 16-bit PCM in the format matching the `DynamicSoundEffectInstance` configuration

## 10 — Audio Resource Management

### Memory Considerations

| Type | Memory Model | Best For |
|------|-------------|----------|
| `SoundEffect` | Entire clip in memory | Short sounds (<5 seconds) |
| `SoundEffectInstance` | References parent SoundEffect | Controlled playback of loaded sounds |
| `Song` / `MediaPlayer` | Streaming from disk | Music, long ambient loops |
| `DynamicSoundEffectInstance` | Buffer queue | Procedural or custom streaming |
| XACT WaveBank | Depends on bank type | Large sound libraries |

### Disposal Order

When shutting down audio, dispose in reverse order of creation:

```csharp
protected override void UnloadContent()
{
    // 1. Stop all playback
    MediaPlayer.Stop();
    engineInstance.Stop();

    // 2. Dispose instances
    engineInstance.Dispose();

    // 3. Dispose effects
    engineSound.Dispose();

    // 4. Dispose XACT resources (if used)
    soundBank.Dispose();
    waveBank.Dispose();
    audioEngine.Dispose();
}
```

## 11 — Cross-Platform Format Pipeline

### Recommended Asset Pipeline

```
Source Audio (any format)
        │
        ▼
┌──────────────────┐
│  FFmpeg Convert   │
│  → WAV (effects)  │
│  → OGG (music)    │
│  → ADPCM (XACT)   │
└──────────────────┘
        │
        ▼
┌──────────────────┐
│  Content/Audio/   │  Raw files loaded via FromStream
│  sfx/*.wav        │  or
│  music/*.ogg      │  MGCB (DesktopGL) for .xnb
│  banks/*.xwb      │
└──────────────────┘
```

### FFmpeg Conversion Commands

```bash
# Sound effects: WAV, 16-bit PCM, 44.1kHz, mono (for positional audio)
ffmpeg -i input.wav -ar 44100 -ac 1 -sample_fmt s16 output.wav

# Music: Ogg Vorbis, stereo, quality 6
ffmpeg -i input.mp3 -c:a libvorbis -q:a 6 output.ogg

# Verify format
ffprobe -v quiet -show_format -show_streams output.ogg
```

## 12 — Common Pitfalls

### Pitfall 1: MP3 Files for Music

**Problem:** Loading an MP3 as a `Song` works in MonoGame but crashes in FNA.
**Solution:** Convert all music to Ogg Vorbis format.

### Pitfall 2: Forgetting `AudioEngine.Update()`

**Problem:** XACT cues don't update, 3D sounds don't track.
**Solution:** Call `audioEngine.Update()` in your game's `Update()` method every frame.

### Pitfall 3: Disposing SoundEffect Before Instances Stop

**Problem:** Disposing a `SoundEffect` while a `SoundEffectInstance` from it is playing causes undefined behavior.
**Solution:** Always call `instance.Stop()` before disposing the parent `SoundEffect`.

### Pitfall 4: Too Many Concurrent Sounds

**Problem:** Sounds silently fail to play when exceeding the voice limit.
**Solution:** Implement a sound priority system or use the pooling pattern from Section 5.

### Pitfall 5: xWMA in XACT Banks

**Problem:** XACT WaveBanks compressed with xWMA work in XNA/Windows but produce silence or crash in FNA.
**Solution:** Rebuild WaveBanks using ADPCM compression only.

### Pitfall 6: Missing FAudio Native Library

**Problem:** `DllNotFoundException` on first audio call.
**Solution:** Ensure FAudio native library is in the application directory. FNA lazy-loads it, so the error only appears when audio is first used.

## 13 — Performance Considerations

### Audio Thread

FAudio runs audio processing on a separate thread. This means:

- Audio callbacks (`BufferNeeded`) may fire on the audio thread
- Do not allocate in audio callbacks — pre-allocate buffers
- Use thread-safe patterns if sharing data between game and audio threads

### Memory Budget Guidelines

| Game Scale | Loaded SoundEffects | Music Tracks | Estimated Audio RAM |
|-----------|-------------------|-------------|-------------------|
| Small (jam) | 20–50 effects | 3–5 songs | 10–30 MB |
| Medium (indie) | 50–200 effects | 10–20 songs | 30–100 MB |
| Large | 200+ effects | 20+ songs | Use XACT streaming |

### Optimization Tips

- Use mono WAV for positional audio (stereo is forced to center)
- Reduce sample rate to 22050 Hz for effects where quality loss is acceptable
- Use ADPCM compression in XACT banks for 4:1 size reduction
- Stream long audio (>10 seconds) via `Song` or `DynamicSoundEffectInstance` instead of loading as `SoundEffect`
- Reuse `SoundEffectInstance` objects instead of calling `SoundEffect.Play()` repeatedly

## 14 — Differences from MonoGame Audio

| Aspect | FNA | MonoGame |
|--------|-----|----------|
| Audio backend | FAudio (native) | Platform-varies (OpenAL, XAudio2, etc.) |
| Music format | Ogg Vorbis only | MP3, Ogg, WAV (platform-varies) |
| XACT support | Full (via FAudio) | Partial (some platforms) |
| SoundEffect API | XNA-identical | XNA-compatible with extensions |
| 3D Audio | X3DAudio via FAudio | Platform-varies |
| DynamicSoundEffect | Supported | Supported |
| WaveBank compression | ADPCM only | ADPCM + platform-specific |
| Audio behavior | Bug-for-bug XNA match | May differ in edge cases |

The key takeaway: if your audio code works in XNA, it will work identically in FNA (with format adjustments). MonoGame may behave slightly differently in edge cases because it reimplements audio behavior rather than preserving it exactly.
