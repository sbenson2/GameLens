# R1 — SDL3 Audio & Input Reference

> **Category:** reference · **Engine:** SDL3 · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](../guides/G1_getting_started.md) · [GPU Rendering](../guides/G2_gpu_rendering.md) · [Migrating from SDL2](../guides/G3_migrating_from_sdl2.md)

SDL3 redesigned both the audio and input subsystems compared to SDL2. Audio is now entirely stream-based (no more audio callbacks), and input handling adds better multi-device support and gamepad features. This reference covers the key APIs, patterns, and migration gotchas.

---

## Audio Subsystem

### Core Concept: Everything is an AudioStream

In SDL3, `SDL_AudioStream` is the backbone of the entire audio system. There are no audio callbacks. Instead, you open a device, create one or more audio streams, bind them to the device, and feed data into the streams. The device pulls from all bound streams and mixes them automatically.

```
┌──────────────┐     ┌──────────────────┐
│ Your Game    │────▶│ SDL_AudioStream  │──┐
│ (PCM data)   │     └──────────────────┘  │   ┌──────────────────┐
│              │     ┌──────────────────┐  ├──▶│ SDL_AudioDevice  │──▶ Speaker
│              │────▶│ SDL_AudioStream  │──┘   │  (mixing point)  │
│              │     └──────────────────┘      └──────────────────┘
└──────────────┘
```

### Opening an Audio Device

```c
// Open the default playback device with your preferred format
SDL_AudioSpec spec = {
    .format = SDL_AUDIO_S16,    // 16-bit signed integers
    .channels = 2,              // stereo
    .freq = 44100               // sample rate
};

SDL_AudioDeviceID dev = SDL_OpenAudioDevice(
    SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK,  // magic ID for default device
    &spec                                // desired format (NULL for device default)
);
if (dev == 0) {
    SDL_Log("Failed to open audio: %s", SDL_GetError());
}
```

**Key differences from SDL2:**
- Devices are opened by instance ID, not by name string.
- The `SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK` and `SDL_AUDIO_DEVICE_DEFAULT_RECORDING` constants replace passing `NULL` or device name strings.
- There is no separate `SDL_OpenAudio()` (the 1.2-era API is removed).

### Creating and Binding Audio Streams

```c
// Create a stream that accepts 44100 Hz stereo S16 and outputs
// in whatever format the device wants
SDL_AudioSpec src_spec = { .format = SDL_AUDIO_S16, .channels = 2, .freq = 44100 };
SDL_AudioStream *stream = SDL_CreateAudioStream(&src_spec, NULL);

// Bind the stream to the device — the device will pull data from it
SDL_BindAudioStream(dev, stream);

// Feed PCM data into the stream whenever you have it
SDL_PutAudioStreamData(stream, pcm_buffer, pcm_buffer_size_in_bytes);
```

Audio streams handle format conversion automatically. You can push data in one format and the device will receive it in its native format. You can even change the source format mid-stream with `SDL_SetAudioStreamFormat()`.

### Convenience: SDL_OpenAudioDeviceStream

For simple cases (one stream, one device), SDL3 provides a shortcut that opens a device and creates a bound stream in one call:

```c
SDL_AudioStream *stream = SDL_OpenAudioDeviceStream(
    SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK,
    &spec,
    NULL,   // optional callback (for SDL2-like behavior)
    NULL    // callback userdata
);

// Feed data directly
SDL_PutAudioStreamData(stream, pcm_buffer, pcm_buffer_size_in_bytes);

// Resume playback (devices start paused)
SDL_ResumeAudioDevice(SDL_GetAudioStreamDevice(stream));
```

If you pass a callback to `SDL_OpenAudioDeviceStream`, it closely simulates the SDL2 audio callback model — but the recommended pattern is to feed data via `SDL_PutAudioStreamData` in your main loop.

### Querying Stream State

```c
// How many bytes are queued and ready for the device to consume
int available = SDL_GetAudioStreamAvailable(stream);

// How many bytes the stream can still accept before its internal buffer is full
int queued = SDL_GetAudioStreamQueued(stream);

// Signal that no more data is coming (flush remaining buffered data)
SDL_FlushAudioStream(stream);
```

**Migration note:** SDL2's `SDL_AudioStreamAvailable()` returned 0 for a NULL stream. SDL3's `SDL_GetAudioStreamAvailable()` returns -1 and sets an error string, matching the behavior of other audiostream APIs.

### Cleanup

```c
SDL_DestroyAudioStream(stream);  // Unbinds from device automatically
SDL_CloseAudioDevice(dev);
```

---

## Event System

### The SDL_Event Union

All SDL3 input comes through `SDL_Event`, a union with a common header followed by event-specific data:

```c
SDL_Event event;
while (SDL_PollEvent(&event)) {
    switch (event.type) {
        case SDL_EVENT_QUIT:
            running = false;
            break;
        case SDL_EVENT_KEY_DOWN:
            handle_key(event.key);
            break;
        case SDL_EVENT_MOUSE_MOTION:
            handle_mouse(event.motion);
            break;
        case SDL_EVENT_GAMEPAD_BUTTON_DOWN:
            handle_gamepad_button(event.gbutton);
            break;
    }
}
```

**SDL3 naming change:** Event type constants are now `SDL_EVENT_*` instead of SDL2's `SDL_*` (e.g., `SDL_EVENT_KEY_DOWN` replaces `SDL_KEYDOWN`). The struct field names also changed (e.g., `event.key` instead of `event.key`).

---

## Keyboard Input

SDL3 distinguishes between **scancodes** (physical key position) and **keycodes** (logical key meaning based on layout):

- `SDL_Scancode` — Physical position on the keyboard. `SDL_SCANCODE_W` is always the same physical key regardless of keyboard layout. Use for WASD-style movement.
- `SDL_Keycode` — Virtual key. `SDLK_W` produces "W" on QWERTY but "Z" on AZERTY. Use for text-related input or menu shortcuts.

### Key Events

```c
case SDL_EVENT_KEY_DOWN:
    SDL_KeyboardEvent *key = &event.key;
    SDL_Scancode scan = key->scancode;   // physical key
    SDL_Keycode  sym  = key->key;        // virtual key (was key->keysym.sym in SDL2)
    Uint16 mod        = key->mod;        // modifier flags (Shift, Ctrl, Alt)
    bool repeat       = key->repeat;     // true if this is a key-repeat event
    break;
```

**Migration note:** In SDL2, the virtual key was at `event.key.keysym.sym`. In SDL3, the `keysym` struct is removed — the keycode is directly at `event.key.key`.

### Polling Keyboard State

```c
const bool *state = SDL_GetKeyboardState(NULL);
if (state[SDL_SCANCODE_W]) {
    // W key is currently held — scancode-based, layout-independent
    player.y -= speed * dt;
}
```

The returned pointer remains valid for the life of the application. Values update after `SDL_PollEvent()` or `SDL_PumpEvents()`.

### Best Practices

- Use **scancodes** for gameplay controls (movement, actions). They are layout-independent.
- Use **keycodes** for text input and shortcut display. Show the user the key name from their layout.
- Always let players rebind keys. Store bindings as scancodes internally.
- Filter out `key->repeat` events for action triggers (jump, shoot) — you usually want those on first press only.

---

## Mouse Input

### Mouse Events

```c
case SDL_EVENT_MOUSE_MOTION:
    float x    = event.motion.x;      // position relative to window (float in SDL3)
    float y    = event.motion.y;
    float xrel = event.motion.xrel;   // relative motion since last event
    float yrel = event.motion.yrel;
    break;

case SDL_EVENT_MOUSE_BUTTON_DOWN:
case SDL_EVENT_MOUSE_BUTTON_UP:
    Uint8 button = event.button.button;  // SDL_BUTTON_LEFT, SDL_BUTTON_RIGHT, etc.
    Uint8 clicks = event.button.clicks;  // 1 = single, 2 = double-click
    float x = event.button.x;
    float y = event.button.y;
    break;

case SDL_EVENT_MOUSE_WHEEL:
    float scroll_x = event.wheel.x;   // horizontal scroll
    float scroll_y = event.wheel.y;   // vertical scroll (positive = up)
    break;
```

**SDL3 change:** Mouse coordinates are `float` instead of `int` for sub-pixel precision on high-DPI displays.

### Polling Mouse State

```c
float x, y;
SDL_MouseButtonFlags buttons = SDL_GetMouseState(&x, &y);
if (buttons & SDL_BUTTON_LMASK) {
    // Left mouse button is held
}
```

### Relative Mouse Mode (FPS Camera)

```c
SDL_SetWindowRelativeMouseMode(window, true);   // Hides cursor, reports relative motion only
// event.motion.xrel / .yrel give raw deltas
SDL_SetWindowRelativeMouseMode(window, false);  // Restore normal cursor
```

**Migration note:** SDL2 used `SDL_SetRelativeMouseMode(SDL_TRUE)` (global). SDL3 scopes relative mode per-window.

---

## Gamepad Input

SDL3 renames "Game Controller" to "Gamepad" throughout the API. The gamepad API maps arbitrary controllers to an Xbox/PlayStation-style layout automatically.

### Gamepad Lifecycle

```c
// Gamepads are detected via events
case SDL_EVENT_GAMEPAD_ADDED:
    SDL_JoystickID id = event.gdevice.which;
    SDL_Gamepad *pad = SDL_OpenGamepad(id);
    break;

case SDL_EVENT_GAMEPAD_REMOVED:
    // The gamepad pointer is invalidated automatically
    pad = NULL;
    break;
```

### Button and Axis Input

```c
// Event-driven
case SDL_EVENT_GAMEPAD_BUTTON_DOWN:
    SDL_GamepadButton btn = event.gbutton.button;
    if (btn == SDL_GAMEPAD_BUTTON_SOUTH) {  // A on Xbox, Cross on PlayStation
        player_jump();
    }
    break;

case SDL_EVENT_GAMEPAD_AXIS_MOTION:
    SDL_GamepadAxis axis = event.gaxis.axis;
    Sint16 value = event.gaxis.value;  // -32768 to 32767
    if (axis == SDL_GAMEPAD_AXIS_LEFT_STICK_X) {
        // Apply deadzone
        float normalized = (fabsf(value) > 8000) ? value / 32767.0f : 0.0f;
        player.dx = normalized * max_speed;
    }
    break;

// Polling-based
bool jump = SDL_GetGamepadButton(pad, SDL_GAMEPAD_BUTTON_SOUTH);
Sint16 lx = SDL_GetGamepadAxis(pad, SDL_GAMEPAD_AXIS_LEFT_STICK_X);
```

### Gamepad Features

```c
// Rumble (if supported)
SDL_RumbleGamepad(pad,
    0xC000,  // low-frequency motor intensity (0–0xFFFF)
    0x4000,  // high-frequency motor intensity
    250      // duration in milliseconds
);

// LED color (DualSense, DualShock 4)
SDL_SetGamepadLED(pad, 255, 0, 0);  // RGB red

// Check feature support at runtime
bool has_rumble = SDL_GetGamepadProperties(pad) & SDL_PROP_GAMEPAD_CAP_RUMBLE;
```

**Migration note:** SDL2's `SDL_GameControllerRumble()` becomes `SDL_RumbleGamepad()`. All `SDL_GameController*` functions are renamed to `SDL_*Gamepad*`.

---

## Touch Input

SDL3 exposes multi-touch on supported platforms:

```c
case SDL_EVENT_FINGER_DOWN:
case SDL_EVENT_FINGER_UP:
case SDL_EVENT_FINGER_MOTION:
    SDL_TouchID touch_id  = event.tfinger.touchID;   // which touch device
    SDL_FingerID finger_id = event.tfinger.fingerID;  // which finger
    float x = event.tfinger.x;    // normalized 0.0–1.0 within window
    float y = event.tfinger.y;
    float pressure = event.tfinger.pressure;
    break;
```

---

## Common Patterns

### Input Abstraction Layer

For games supporting keyboard + gamepad, abstract input into actions:

```c
typedef struct {
    bool jump;
    bool attack;
    float move_x;
    float move_y;
} GameInput;

GameInput input_poll(SDL_Gamepad *pad) {
    GameInput input = {0};
    const bool *keys = SDL_GetKeyboardState(NULL);

    // Keyboard
    input.move_x += keys[SDL_SCANCODE_D] - keys[SDL_SCANCODE_A];
    input.move_y += keys[SDL_SCANCODE_S] - keys[SDL_SCANCODE_W];
    input.jump   |= keys[SDL_SCANCODE_SPACE];
    input.attack |= keys[SDL_SCANCODE_J];

    // Gamepad (if connected)
    if (pad) {
        float lx = SDL_GetGamepadAxis(pad, SDL_GAMEPAD_AXIS_LEFT_STICK_X) / 32767.0f;
        float ly = SDL_GetGamepadAxis(pad, SDL_GAMEPAD_AXIS_LEFT_STICK_Y) / 32767.0f;
        if (fabsf(lx) > 0.25f) input.move_x += lx;  // deadzone
        if (fabsf(ly) > 0.25f) input.move_y += ly;
        input.jump   |= SDL_GetGamepadButton(pad, SDL_GAMEPAD_BUTTON_SOUTH);
        input.attack |= SDL_GetGamepadButton(pad, SDL_GAMEPAD_BUTTON_WEST);
    }

    // Clamp movement
    float len = sqrtf(input.move_x * input.move_x + input.move_y * input.move_y);
    if (len > 1.0f) { input.move_x /= len; input.move_y /= len; }

    return input;
}
```

### Audio: Simple Sound Effect Player

```c
typedef struct {
    SDL_AudioStream *stream;
    Uint8 *buffer;
    Uint32 length;
} SoundEffect;

SoundEffect sfx_load(SDL_AudioDeviceID dev, const char *path) {
    SoundEffect sfx = {0};
    SDL_AudioSpec spec;

    // Load entire WAV into memory
    SDL_LoadWAV(path, &spec, &sfx.buffer, &sfx.length);

    // Create a stream in the WAV's native format
    sfx.stream = SDL_CreateAudioStream(&spec, NULL);
    SDL_BindAudioStream(dev, sfx.stream);
    return sfx;
}

void sfx_play(SoundEffect *sfx) {
    // Clear any previously queued data, then push the full clip
    SDL_ClearAudioStream(sfx->stream);
    SDL_PutAudioStreamData(sfx->stream, sfx->buffer, sfx->length);
}

void sfx_destroy(SoundEffect *sfx) {
    SDL_DestroyAudioStream(sfx->stream);
    SDL_free(sfx->buffer);
}
```

---

## Quick Migration Cheat Sheet (SDL2 → SDL3)

| SDL2 | SDL3 | Notes |
|------|------|-------|
| `SDL_OpenAudio()` | Removed | Use `SDL_OpenAudioDevice()` |
| `SDL_OpenAudioDevice(name, ...)` | `SDL_OpenAudioDevice(id, spec)` | Devices identified by ID, not string |
| Audio callback in `SDL_AudioSpec` | `SDL_AudioStream` push model | Bind streams to devices instead |
| `SDL_KEYDOWN` | `SDL_EVENT_KEY_DOWN` | All event types renamed |
| `event.key.keysym.sym` | `event.key.key` | `keysym` struct removed |
| Mouse coords `int` | Mouse coords `float` | Sub-pixel precision |
| `SDL_SetRelativeMouseMode()` | `SDL_SetWindowRelativeMouseMode()` | Per-window scoping |
| `SDL_GameController*` | `SDL_*Gamepad*` | Full rename across API |
| `SDL_GameControllerRumble()` | `SDL_RumbleGamepad()` | Same parameters |
