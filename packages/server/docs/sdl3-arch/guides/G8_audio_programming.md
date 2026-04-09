# G8 — SDL3 Audio Programming

> **Category:** guide · **Engine:** SDL3 · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Audio & Input Reference](../reference/R1_audio_and_input.md) · [Migration from SDL2](G3_migrating_from_sdl2.md) · [SDL3 Rules](../sdl3-arch-rules.md)

SDL3 completely redesigned the audio subsystem around `SDL_AudioStream`. The old SDL2 audio callback model is gone. This guide covers everything you need to play, record, mix, and stream audio in SDL3.

---

## Core Concept: Everything Is an AudioStream

In SDL3, `SDL_AudioStream` is the central audio primitive. Every audio operation — playback, recording, format conversion, mixing — flows through audio streams. An audio stream accepts data in one format and outputs it in another, handling resampling and channel remapping automatically.

The mental model:

```
Your audio data ──► SDL_AudioStream ──► Audio device (speakers/headphones)
                    (converts format,
                     resamples, buffers)
```

### Why the Change from SDL2?

SDL2 used a callback model where the audio thread called your function to fill a buffer. This was error-prone: the callback ran on a separate thread, making shared state tricky and debugging painful. SDL3's stream model lets you push data from your main thread (or any thread) at any time, and SDL drains it to hardware as needed. Hot-plugging audio devices is also handled automatically — if a user unplugs headphones, SDL migrates the stream to the new default device.

---

## Quick Start: Playing a WAV File

The fastest path from silence to sound. This uses `SDL_OpenAudioDeviceStream` — a convenience function that opens a device, creates a stream, and binds them together in one call.

```c
#define SDL_MAIN_USE_CALLBACKS
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>

static SDL_AudioStream *stream = NULL;

SDL_AppResult SDL_AppInit(void **appstate, int argc, char **argv) {
    if (!SDL_Init(SDL_INIT_AUDIO)) {
        SDL_Log("SDL_Init failed: %s", SDL_GetError());
        return SDL_APP_FAILURE;
    }

    // Load a WAV file
    SDL_AudioSpec wav_spec;
    Uint8 *wav_data = NULL;
    Uint32 wav_len = 0;
    if (!SDL_LoadWAV("sound.wav", &wav_spec, &wav_data, &wav_len)) {
        SDL_Log("Failed to load WAV: %s", SDL_GetError());
        return SDL_APP_FAILURE;
    }

    // Open a device stream matching the WAV format
    // NULL callback = we push data manually
    stream = SDL_OpenAudioDeviceStream(
        SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK,
        &wav_spec,
        NULL,   // no callback
        NULL    // no userdata
    );
    if (!stream) {
        SDL_Log("Failed to open audio: %s", SDL_GetError());
        SDL_free(wav_data);
        return SDL_APP_FAILURE;
    }

    // Push all audio data into the stream
    SDL_PutAudioStreamData(stream, wav_data, wav_len);
    SDL_free(wav_data);

    // Device starts paused — resume to begin playback
    SDL_ResumeAudioStreamDevice(stream);

    return SDL_APP_CONTINUE;
}

SDL_AppResult SDL_AppIterate(void *appstate) {
    // Check if all audio has drained
    if (SDL_GetAudioStreamAvailable(stream) == 0) {
        return SDL_APP_SUCCESS;  // quit when done
    }
    return SDL_APP_CONTINUE;
}

SDL_AppResult SDL_AppEvent(void *appstate, SDL_Event *event) {
    if (event->type == SDL_EVENT_QUIT)
        return SDL_APP_SUCCESS;
    return SDL_APP_CONTINUE;
}

void SDL_AppQuit(void *appstate, SDL_AppResult result) {
    SDL_DestroyAudioStream(stream);  // also closes the device
}
```

Key points:

- `SDL_OpenAudioDeviceStream` is a convenience wrapper — it opens the device, creates the stream, and binds them. When you destroy the stream, the device closes too.
- The device starts **paused**. You must call `SDL_ResumeAudioStreamDevice()` to begin playback.
- `SDL_PutAudioStreamData` accepts raw PCM bytes. You can push any amount at any time.

---

## Manual Stream Setup (More Control)

For games that need multiple simultaneous audio streams (music + SFX + voice), use the lower-level API:

```c
// Open the default playback device
SDL_AudioDeviceID dev = SDL_OpenAudioDevice(
    SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, NULL
);

// Create streams for different audio channels
SDL_AudioSpec music_spec = { SDL_AUDIO_F32, 2, 44100 };  // stereo float
SDL_AudioSpec sfx_spec   = { SDL_AUDIO_S16, 1, 22050 };  // mono 16-bit

SDL_AudioStream *music_stream = SDL_CreateAudioStream(&music_spec, NULL);
SDL_AudioStream *sfx_stream   = SDL_CreateAudioStream(&sfx_spec, NULL);

// Bind both streams to the same device — SDL mixes them automatically
SDL_BindAudioStream(dev, music_stream);
SDL_BindAudioStream(dev, sfx_stream);

// Resume the device
SDL_ResumeAudioDevice(dev);

// Push data to either stream independently
SDL_PutAudioStreamData(music_stream, music_pcm, music_bytes);
SDL_PutAudioStreamData(sfx_stream, sfx_pcm, sfx_bytes);
```

When multiple streams are bound to one device, SDL mixes them together automatically. Each stream can have a different source format — SDL converts everything to match the device.

### Volume Control Per Stream

```c
// Set volume (0.0 = silent, 1.0 = full)
SDL_SetAudioStreamGain(music_stream, 0.7f);
SDL_SetAudioStreamGain(sfx_stream, 1.0f);
```

---

## Callback-Based Audio (Procedural Generation)

For synthesizers, procedural audio, or porting SDL2 code, you can use a callback with `SDL_OpenAudioDeviceStream`:

```c
// Callback runs on the audio thread — generate audio on demand
void audio_callback(void *userdata, SDL_AudioStream *stream,
                    int additional_amount, int total_amount) {
    // additional_amount = bytes the device wants right now
    if (additional_amount <= 0) return;

    float *samples = SDL_malloc(additional_amount);
    int num_samples = additional_amount / sizeof(float);

    // Generate a 440 Hz sine wave
    static double phase = 0.0;
    double phase_inc = 440.0 / 48000.0;  // assuming 48kHz

    for (int i = 0; i < num_samples; i++) {
        samples[i] = (float)SDL_sin(phase * 2.0 * SDL_PI_D);
        phase += phase_inc;
        if (phase >= 1.0) phase -= 1.0;
    }

    SDL_PutAudioStreamData(stream, samples, additional_amount);
    SDL_free(samples);
}

// Set up with callback
SDL_AudioSpec spec = { SDL_AUDIO_F32, 1, 48000 };  // mono float 48kHz
SDL_AudioStream *synth = SDL_OpenAudioDeviceStream(
    SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK,
    &spec,
    audio_callback,
    NULL  // userdata
);
SDL_ResumeAudioStreamDevice(synth);
```

The callback's `additional_amount` parameter tells you how many bytes the device needs. Generate that much data and push it into the stream.

---

## Audio Recording (Capture)

SDL3 renamed "capture" to "recording" in its API. Recording follows the same stream pattern:

```c
// Open the default recording device
SDL_AudioDeviceID mic = SDL_OpenAudioDevice(
    SDL_AUDIO_DEVICE_DEFAULT_RECORDING, NULL
);

// Create a stream to receive recorded audio
SDL_AudioSpec rec_spec = { SDL_AUDIO_F32, 1, 44100 };
SDL_AudioStream *rec_stream = SDL_CreateAudioStream(NULL, &rec_spec);
SDL_BindAudioStream(mic, rec_stream);
SDL_ResumeAudioDevice(mic);

// In your game loop, drain recorded data
int available = SDL_GetAudioStreamAvailable(rec_stream);
if (available > 0) {
    float *buffer = SDL_malloc(available);
    int got = SDL_GetAudioStreamData(rec_stream, buffer, available);
    // Process `got` bytes of recorded audio
    SDL_free(buffer);
}
```

---

## Hot-Plug and Device Migration

SDL3 handles audio device hot-plugging automatically. When a user unplugs headphones, streams bound to the default device migrate to the new default. You receive events to track this:

```c
SDL_AppResult SDL_AppEvent(void *appstate, SDL_Event *event) {
    switch (event->type) {
        case SDL_EVENT_AUDIO_DEVICE_ADDED:
            SDL_Log("Audio device connected: %u", event->adevice.which);
            break;
        case SDL_EVENT_AUDIO_DEVICE_REMOVED:
            SDL_Log("Audio device disconnected: %u", event->adevice.which);
            break;
    }
    return SDL_APP_CONTINUE;
}
```

If you opened a device with `SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK`, SDL handles the migration. If you opened a specific physical device, you need to handle reconnection yourself.

---

## Format Conversion Without a Device

`SDL_AudioStream` works as a standalone format converter — no device needed:

```c
SDL_AudioSpec src = { SDL_AUDIO_S16, 1, 22050 };  // 16-bit mono 22kHz
SDL_AudioSpec dst = { SDL_AUDIO_F32, 2, 48000 };  // float stereo 48kHz

SDL_AudioStream *converter = SDL_CreateAudioStream(&src, &dst);
SDL_PutAudioStreamData(converter, input_data, input_bytes);
SDL_FlushAudioStream(converter);  // signal end of input

int available = SDL_GetAudioStreamAvailable(converter);
float *output = SDL_malloc(available);
SDL_GetAudioStreamData(converter, output, available);
// output now contains converted audio
```

This is useful for normalizing audio assets to a consistent format at load time.

---

## Common Audio Patterns for Games

### Fire-and-Forget Sound Effects

Create a pool of streams bound to the playback device. When a sound fires, find an idle stream, push the audio data, and let it play:

```c
#define SFX_POOL_SIZE 16

typedef struct {
    SDL_AudioStream *streams[SFX_POOL_SIZE];
} SfxPool;

void sfx_pool_init(SfxPool *pool, SDL_AudioDeviceID dev, SDL_AudioSpec *spec) {
    for (int i = 0; i < SFX_POOL_SIZE; i++) {
        pool->streams[i] = SDL_CreateAudioStream(spec, NULL);
        SDL_BindAudioStream(dev, pool->streams[i]);
    }
}

void sfx_play(SfxPool *pool, Uint8 *data, int len) {
    for (int i = 0; i < SFX_POOL_SIZE; i++) {
        if (SDL_GetAudioStreamAvailable(pool->streams[i]) == 0) {
            SDL_PutAudioStreamData(pool->streams[i], data, len);
            return;
        }
    }
    // All streams busy — skip or evict oldest
}
```

### Background Music Streaming

For large music files, decode in chunks rather than loading the entire file into memory. Push decoded chunks into the stream each frame:

```c
// In your frame update:
int queued = SDL_GetAudioStreamQueued(music_stream);
if (queued < TARGET_BUFFER_BYTES) {
    // Decode more audio from your music decoder (Vorbis, MP3, etc.)
    int decoded = decode_music(decode_buffer, CHUNK_SIZE);
    if (decoded > 0) {
        SDL_PutAudioStreamData(music_stream, decode_buffer, decoded);
    }
}
```

---

## SDL2 → SDL3 Audio Migration Checklist

| SDL2 Pattern | SDL3 Replacement |
|---|---|
| `SDL_AudioCallback` in `SDL_OpenAudioDevice` | `SDL_OpenAudioDeviceStream` with callback, or push-based streams |
| `SDL_QueueAudio()` | `SDL_PutAudioStreamData()` |
| `SDL_DequeueAudio()` | `SDL_GetAudioStreamData()` |
| `SDL_PauseAudioDevice(dev, 0)` | `SDL_ResumeAudioDevice(dev)` or `SDL_ResumeAudioStreamDevice(stream)` |
| `SDL_LockAudioDevice()` | No longer needed for stream-based code |
| "capture" terminology | "recording" terminology |
| Manual format conversion with `SDL_AudioCVT` | `SDL_AudioStream` handles all conversion |

---

## Key Functions Reference

| Function | Purpose |
|---|---|
| `SDL_OpenAudioDeviceStream()` | One-call device + stream setup (convenience) |
| `SDL_OpenAudioDevice()` | Open a device for manual stream binding |
| `SDL_CreateAudioStream()` | Create a stream (independent of device) |
| `SDL_BindAudioStream()` | Bind a stream to a device for playback/recording |
| `SDL_UnbindAudioStream()` | Detach a stream from its device |
| `SDL_PutAudioStreamData()` | Push audio data into a stream |
| `SDL_GetAudioStreamData()` | Pull audio data out of a stream |
| `SDL_GetAudioStreamAvailable()` | Check bytes available to read |
| `SDL_GetAudioStreamQueued()` | Check bytes queued for playback |
| `SDL_SetAudioStreamGain()` | Set per-stream volume (0.0–1.0+) |
| `SDL_FlushAudioStream()` | Signal that no more data will be pushed |
| `SDL_ClearAudioStream()` | Discard all buffered data |
| `SDL_ResumeAudioStreamDevice()` | Start playback (device starts paused) |
| `SDL_PauseAudioStreamDevice()` | Pause playback |
| `SDL_DestroyAudioStream()` | Clean up (closes device if opened via convenience API) |
