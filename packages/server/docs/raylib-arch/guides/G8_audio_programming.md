# Audio Programming with Raylib

> **Category:** guide · **Engine:** Raylib · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Getting Started](G1_getting_started.md)

Raylib's audio module (`raudio`) provides a minimal, zero-dependency audio system built on top of miniaudio. It supports three distinct audio types — Sound for short clips, Music for streamed playback, and AudioStream for procedural/real-time generation — all accessible through raylib's characteristically simple C API.

## Audio System Initialization

Before any audio operations, initialize the audio device. This must happen after `InitWindow()`:

```c
#include "raylib.h"

int main(void) {
    InitWindow(800, 600, "Audio Example");
    InitAudioDevice();          // Initialize audio device and context

    // ... game loop ...

    CloseAudioDevice();         // Close audio device (before CloseWindow)
    CloseWindow();
    return 0;
}
```

### Device Control

| Function | Purpose |
|----------|---------|
| `InitAudioDevice()` | Initialize audio device and context |
| `CloseAudioDevice()` | Close device and free resources |
| `IsAudioDeviceReady()` | Check if device is ready |
| `SetMasterVolume(float)` | Set master volume (0.0–1.0) |
| `GetMasterVolume()` | Get current master volume |

## Sound — Short Clips

`Sound` loads an entire audio file into memory for instant playback. Use this for sound effects, UI clicks, and any clip under ~10 seconds.

### Loading and Playback

```c
// Load from file (supports WAV, OGG, MP3, FLAC, QOA, XM, MOD)
Sound fx_jump = LoadSound("resources/jump.wav");
Sound fx_coin = LoadSoundFromWave(my_wave);   // from an existing Wave

// Play during game loop
if (IsKeyPressed(KEY_SPACE)) {
    PlaySound(fx_jump);
}

// Clean up
UnloadSound(fx_jump);
```

### Sound Aliases

When you need to play the same sound effect multiple times simultaneously (e.g., rapid gunfire), use aliases to share the underlying audio buffer:

```c
Sound fx_shot = LoadSound("resources/shot.wav");
Sound fx_shot_alias = LoadSoundAlias(fx_shot);  // shares same buffer

PlaySound(fx_shot);         // first instance
PlaySound(fx_shot_alias);   // second overlapping instance

UnloadSoundAlias(fx_shot_alias);  // free alias first
UnloadSound(fx_shot);             // then free the base sound
```

### Sound Controls

| Function | Purpose |
|----------|---------|
| `PlaySound(Sound)` | Begin playback (restarts if already playing) |
| `StopSound(Sound)` | Stop and reset position |
| `PauseSound(Sound)` | Pause at current position |
| `ResumeSound(Sound)` | Resume from pause |
| `IsSoundPlaying(Sound)` | Query playback state |
| `SetSoundVolume(Sound, float)` | Volume (0.0–1.0) |
| `SetSoundPitch(Sound, float)` | Pitch multiplier (1.0 = normal) |
| `SetSoundPan(Sound, float)` | Pan (0.0 left, 0.5 center, 1.0 right) |
| `UpdateSound(Sound, void*, int)` | Replace PCM data in-place |

## Music — Streamed Playback

`Music` decodes audio progressively from disk, keeping only a small buffer in memory. Use this for background music, ambient tracks, and anything longer than ~10 seconds.

**Critical:** You must call `UpdateMusicStream()` every frame or playback will stall.

### Loading and Playback

```c
Music bgm = LoadMusicStream("resources/ambient.ogg");
bgm.looping = true;        // enable looping (default: true for Music)

PlayMusicStream(bgm);

// Game loop
while (!WindowShouldClose()) {
    UpdateMusicStream(bgm);   // MUST call every frame

    // Display progress
    float played = GetMusicTimePlayed(bgm);
    float total = GetMusicTimeLength(bgm);
    float progress = played / total;

    BeginDrawing();
    // ... render ...
    EndDrawing();
}

UnloadMusicStream(bgm);
```

### Music Controls

| Function | Purpose |
|----------|---------|
| `PlayMusicStream(Music)` | Start streaming playback |
| `UpdateMusicStream(Music)` | **Call every frame** — refills decode buffer |
| `StopMusicStream(Music)` | Stop and reset to beginning |
| `PauseMusicStream(Music)` | Pause at current position |
| `ResumeMusicStream(Music)` | Resume from pause |
| `IsMusicStreamPlaying(Music)` | Query playback state |
| `SeekMusicStream(Music, float)` | Seek to position in seconds |
| `SetMusicVolume(Music, float)` | Volume (0.0–1.0) |
| `SetMusicPitch(Music, float)` | Pitch multiplier |
| `SetMusicPan(Music, float)` | Pan control |
| `GetMusicTimeLength(Music)` | Total duration in seconds |
| `GetMusicTimePlayed(Music)` | Current position in seconds |
| `LoadMusicStreamFromMemory(char*, uchar*, int)` | Stream from a memory buffer |

## AudioStream — Procedural Audio

`AudioStream` is the lowest-level audio type. You create a raw stream and feed it samples manually, which is useful for synthesizers, real-time voice chat, or custom audio effects.

### Push-Based Approach

```c
// Create a raw audio stream (44100 Hz, 16-bit, stereo)
AudioStream stream = LoadAudioStream(44100, 16, 2);
PlayAudioStream(stream);

// Game loop
while (!WindowShouldClose()) {
    if (IsAudioStreamProcessed(stream)) {
        // Buffer consumed — generate and push new samples
        short samples[4096];
        generate_sine_wave(samples, 4096);
        UpdateAudioStream(stream, samples, 4096);
    }

    BeginDrawing();
    // ... render ...
    EndDrawing();
}

UnloadAudioStream(stream);
```

### Callback-Based Approach

For tighter timing, attach a callback that raylib invokes from the audio thread when the buffer needs refilling:

```c
// Callback runs on the audio thread — keep it fast, no allocations
void audio_callback(void* buffer, unsigned int frames) {
    float* samples = (float*)buffer;
    for (unsigned int i = 0; i < frames * 2; i++) {  // *2 for stereo
        samples[i] = generate_next_sample();
    }
}

AudioStream stream = LoadAudioStream(44100, 32, 2);  // 32-bit float
SetAudioStreamCallback(stream, audio_callback);
PlayAudioStream(stream);
```

### AudioStream Controls

| Function | Purpose |
|----------|---------|
| `LoadAudioStream(uint, uint, uint)` | Create stream (rate, bits, channels) |
| `UnloadAudioStream(AudioStream)` | Free stream resources |
| `IsAudioStreamValid(AudioStream)` | Check validity |
| `UpdateAudioStream(AudioStream, void*, int)` | Push new sample data |
| `IsAudioStreamProcessed(AudioStream)` | True when buffer needs refilling |
| `PlayAudioStream(AudioStream)` | Start playback |
| `StopAudioStream(AudioStream)` | Stop playback |
| `PauseAudioStream(AudioStream)` | Pause |
| `ResumeAudioStream(AudioStream)` | Resume |
| `SetAudioStreamVolume(AudioStream, float)` | Volume |
| `SetAudioStreamPitch(AudioStream, float)` | Pitch |
| `SetAudioStreamPan(AudioStream, float)` | Pan |
| `SetAudioStreamCallback(AudioStream, callback)` | Attach fill callback |
| `SetAudioStreamBufferSizeDefault(int)` | Set default buffer size |

## DSP Processors

You can attach audio processors for real-time effects on individual streams:

```c
void reverb_processor(void* buffer, unsigned int frames) {
    float* samples = (float*)buffer;
    // Apply reverb effect to samples in-place
    apply_reverb(samples, frames);
}

AttachAudioStreamProcessor(stream, reverb_processor);

// Later, remove it:
DetachAudioStreamProcessor(stream, reverb_processor);
```

**Constraint:** Only one mixed-output processor can be active at a time (global). Per-stream processors via `AttachAudioStreamProcessor` are unlimited.

## Wave — Raw Audio Data

`Wave` represents raw PCM data loaded entirely into CPU memory. It's the starting point for audio manipulation before converting to a Sound:

```c
// Load and manipulate
Wave wave = LoadWave("resources/raw_recording.wav");
WaveCrop(&wave, 1000, 50000);                    // trim to frames 1000–50000
WaveFormat(&wave, 44100, 16, 1);                  // convert to 44100 Hz, 16-bit, mono

// Convert to a Sound for playback
Sound processed = LoadSoundFromWave(wave);

// Export manipulated audio
ExportWave(wave, "resources/processed.wav");
ExportWaveAsCode(wave, "resources/audio_data.h"); // embed as C header

// Access raw samples
float* samples = LoadWaveSamples(wave);
// ... analyze or modify samples ...
UnloadWaveSamples(samples);

UnloadWave(wave);
```

## Supported Formats

| Format | Sound | Music (Streaming) | Notes |
|--------|-------|--------------------|-------|
| WAV | Yes | Yes | Uncompressed, instant load |
| OGG (Vorbis) | Yes | Yes | Good compression, widely used |
| MP3 | Yes | Yes | Universal compatibility |
| FLAC | Yes | Yes | Lossless compression |
| QOA | Yes | Yes | Fast decode, moderate compression |
| XM | No | Yes | Tracker module format |
| MOD | No | Yes | Tracker module format |

## Common Patterns

### Audio Manager Pattern

```c
typedef struct {
    Sound effects[MAX_EFFECTS];
    Music current_bgm;
    float sfx_volume;
    float bgm_volume;
} AudioManager;

void audio_manager_update(AudioManager* am) {
    if (IsMusicStreamPlaying(am->current_bgm)) {
        UpdateMusicStream(am->current_bgm);
    }
}

void audio_manager_play_sfx(AudioManager* am, int id) {
    SetSoundVolume(am->effects[id], am->sfx_volume);
    PlaySound(am->effects[id]);
}

void audio_manager_play_bgm(AudioManager* am, Music music) {
    if (IsMusicStreamPlaying(am->current_bgm)) {
        StopMusicStream(am->current_bgm);
    }
    am->current_bgm = music;
    SetMusicVolume(music, am->bgm_volume);
    PlayMusicStream(music);
}
```

### Pitch Variation for Sound Effects

Add slight pitch variation to repeated sound effects to avoid the "machine gun" effect:

```c
void play_with_variation(Sound sound, float base_pitch, float variation) {
    float pitch = base_pitch + ((float)GetRandomValue(-100, 100) / 100.0f) * variation;
    SetSoundPitch(sound, pitch);
    PlaySound(sound);
}

// Usage: slight variation around normal pitch
play_with_variation(fx_footstep, 1.0f, 0.15f);
```

## Performance Tips

- **Sound vs. Music threshold:** Use Sound for clips under ~10 seconds, Music for anything longer. Sound loads fully into memory; Music streams from disk.
- **Preload sounds** at startup or level transitions, not during gameplay.
- **Sound aliases** are cheaper than loading the same file multiple times.
- **Audio callbacks run on a separate thread** — avoid allocations, locks, or slow operations inside them.
- **Wave manipulation** (crop, format) is a CPU operation — do it during loading, not per-frame.
- **QOA format** offers a good balance of compression ratio and decode speed for games.
