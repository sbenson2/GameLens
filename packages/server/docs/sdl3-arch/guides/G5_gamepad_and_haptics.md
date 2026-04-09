# G5 — SDL3 Gamepad, Haptics & Sensors

> **Category:** guide · **Engine:** SDL3 · **Related:** [Getting Started](G1_getting_started.md) · [Events & Windows](../reference/R2_events_and_windows.md) · [Audio & Input](../reference/R1_audio_and_input.md)

SDL3 provides a high-level Gamepad API that maps physical controllers to a standard Xbox-style layout, plus a lower-level Joystick API for raw access. This guide covers gamepad handling, rumble/haptics, and DualSense/DualShock sensor access (gyro, accelerometer, touchpad).

---

## Gamepad vs Joystick

SDL3 has two input layers for controllers:

| Layer | API Prefix | What It Does |
|-------|-----------|--------------|
| **Gamepad** | `SDL_*Gamepad*` | Maps buttons/axes to standard names (A, B, left trigger, etc.) |
| **Joystick** | `SDL_*Joystick*` | Raw numbered buttons and axes — no semantic meaning |

**Use Gamepad for games.** It normalizes controller differences so "press A" works across Xbox, PlayStation, Switch Pro, and hundreds of other controllers via SDL's built-in mapping database and community mappings.

---

## Initialization

```c
// Init with gamepad support (includes joystick subsystem automatically)
if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMEPAD)) {
    SDL_Log("Init failed: %s", SDL_GetError());
    return 1;
}
```

SDL3 note: `SDL_Init` returns `bool` — `true` on success, `false` on failure. This is a change from SDL2 which returned 0 on success.

---

## Opening a Gamepad

SDL3 uses instance IDs (not device indices) for gamepads. You typically respond to the `SDL_EVENT_GAMEPAD_ADDED` event:

```c
SDL_Gamepad *gamepad = NULL;

// In your event loop:
case SDL_EVENT_GAMEPAD_ADDED:
    if (!gamepad) {
        gamepad = SDL_OpenGamepad(event.gdevice.which);
        if (gamepad) {
            SDL_Log("Gamepad connected: %s",
                    SDL_GetGamepadName(gamepad));
        }
    }
    break;

case SDL_EVENT_GAMEPAD_REMOVED:
    if (gamepad &&
        SDL_GetGamepadID(gamepad) == event.gdevice.which) {
        SDL_CloseGamepad(gamepad);
        gamepad = NULL;
        SDL_Log("Gamepad disconnected");
    }
    break;
```

### Opening All Connected Gamepads at Startup

```c
int count = 0;
SDL_JoystickID *joysticks = SDL_GetGamepads(&count);
if (joysticks) {
    for (int i = 0; i < count; i++) {
        SDL_Gamepad *pad = SDL_OpenGamepad(joysticks[i]);
        if (pad) {
            SDL_Log("Opened: %s", SDL_GetGamepadName(pad));
            // Store in your gamepad array
        }
    }
    SDL_free(joysticks);
}
```

---

## Reading Buttons and Axes

### Polling (Per-Frame)

```c
// Buttons: returns true if pressed
bool a_pressed = SDL_GetGamepadButton(gamepad, SDL_GAMEPAD_BUTTON_SOUTH);
bool start     = SDL_GetGamepadButton(gamepad, SDL_GAMEPAD_BUTTON_START);
bool lb        = SDL_GetGamepadButton(gamepad,
                                      SDL_GAMEPAD_BUTTON_LEFT_SHOULDER);

// Axes: returns -32768 to 32767 (sticks) or 0 to 32767 (triggers)
int16_t left_x = SDL_GetGamepadAxis(gamepad, SDL_GAMEPAD_AXIS_LEFTX);
int16_t left_y = SDL_GetGamepadAxis(gamepad, SDL_GAMEPAD_AXIS_LEFTY);
int16_t right_trigger = SDL_GetGamepadAxis(gamepad,
                                           SDL_GAMEPAD_AXIS_RIGHT_TRIGGER);
```

### Standard Button Names (SDL3)

SDL3 uses positional names rather than Xbox-specific labels:

| SDL3 Name | Xbox | PlayStation | Switch |
|-----------|------|-------------|--------|
| `SDL_GAMEPAD_BUTTON_SOUTH` | A | Cross (×) | B |
| `SDL_GAMEPAD_BUTTON_EAST` | B | Circle (○) | A |
| `SDL_GAMEPAD_BUTTON_WEST` | X | Square (□) | Y |
| `SDL_GAMEPAD_BUTTON_NORTH` | Y | Triangle (△) | X |

### Axis Dead Zones

SDL3 does not apply dead zones for you. Always apply your own:

```c
float normalize_axis(int16_t raw, int16_t dead_zone) {
    if (abs(raw) < dead_zone) return 0.0f;
    float max_val = (raw > 0) ? 32767.0f : 32768.0f;
    float sign = (raw > 0) ? 1.0f : -1.0f;
    // Remap: dead_zone..max → 0..1
    return sign * ((float)(abs(raw) - dead_zone) /
                   (fabsf(max_val) - dead_zone));
}

float lx = normalize_axis(
    SDL_GetGamepadAxis(gamepad, SDL_GAMEPAD_AXIS_LEFTX), 8000);
float ly = normalize_axis(
    SDL_GetGamepadAxis(gamepad, SDL_GAMEPAD_AXIS_LEFTY), 8000);
```

### Event-Driven Input

Alternatively, handle input via events — better for menus and UI:

```c
case SDL_EVENT_GAMEPAD_BUTTON_DOWN:
    if (event.gbutton.button == SDL_GAMEPAD_BUTTON_SOUTH) {
        menu_confirm();
    }
    break;

case SDL_EVENT_GAMEPAD_AXIS_MOTION:
    if (event.gaxis.axis == SDL_GAMEPAD_AXIS_LEFT_TRIGGER) {
        float value = event.gaxis.value / 32767.0f;
        set_brake_intensity(value);
    }
    break;
```

---

## Rumble (Force Feedback)

SDL3 provides a simple rumble API directly on the gamepad — no need to open a separate haptic device for standard rumble.

```c
// Low-frequency motor (left) and high-frequency motor (right)
// Intensity: 0 (off) to 0xFFFF (max)
// Duration: milliseconds, 0 = infinite
SDL_RumbleGamepad(gamepad,
                  0xC000,   // low_frequency_rumble
                  0x4000,   // high_frequency_rumble
                  250);     // duration_ms

// Stop rumble
SDL_RumbleGamepad(gamepad, 0, 0, 0);
```

### Trigger Rumble (Xbox Impulse Triggers / DualSense Adaptive)

Some controllers support independent rumble in the triggers:

```c
// Left trigger rumble, right trigger rumble, duration
SDL_RumbleGamepadTriggers(gamepad, 0x8000, 0x8000, 200);
```

### Important Rumble Notes

- Each `SDL_RumbleGamepad` call cancels the previous rumble effect.
- You must call `SDL_PumpEvents()` or process events for rumble state to update.
- Not all controllers support trigger rumble — it silently fails if unsupported.

---

## Advanced Haptics (SDL_Haptic)

For steering wheels, flight sticks, and complex force feedback, use the full Haptic API:

```c
SDL_Joystick *joy = SDL_GetGamepadJoystick(gamepad);
SDL_Haptic *haptic = SDL_OpenHapticFromJoystick(joy);

if (haptic) {
    // Simple rumble shortcut
    if (SDL_InitHapticRumble(haptic)) {
        SDL_PlayHapticRumble(haptic, 0.75f, 500);  // 75% strength, 500ms
    }

    // Or create custom effects (sine wave, constant force, etc.)
    SDL_HapticEffect effect = {0};
    effect.type = SDL_HAPTIC_SINE;
    effect.periodic.direction.type = SDL_HAPTIC_CARTESIAN;
    effect.periodic.period = 100;        // 100ms per cycle
    effect.periodic.magnitude = 20000;   // intensity
    effect.periodic.length = 1000;       // 1 second
    effect.periodic.attack_length = 200; // fade in
    effect.periodic.fade_length = 200;   // fade out

    int effect_id = SDL_CreateHapticEffect(haptic, &effect);
    if (effect_id >= 0) {
        SDL_RunHapticEffect(haptic, effect_id, 1);  // run once
    }

    // Cleanup
    SDL_DestroyHapticEffect(haptic, effect_id);
    SDL_CloseHaptic(haptic);
}
```

---

## Sensor Access (Gyroscope & Accelerometer)

DualShock 4, DualSense, Switch Pro, and Switch Joy-Con controllers have motion sensors. SDL3 exposes them through the sensor API.

```c
// Check if gyroscope is available
if (SDL_GamepadHasSensor(gamepad, SDL_SENSOR_GYRO)) {
    // Enable it (disabled by default to save power/bandwidth)
    SDL_SetGamepadSensorEnabled(gamepad, SDL_SENSOR_GYRO, true);

    // Read rate in Hz
    float rate = SDL_GetGamepadSensorDataRate(gamepad, SDL_SENSOR_GYRO);
    SDL_Log("Gyro sample rate: %.0f Hz", rate);
}

// In your update loop — read 3-axis angular velocity (rad/s)
float gyro[3];
if (SDL_GetGamepadSensorData(gamepad, SDL_SENSOR_GYRO, gyro, 3)) {
    float pitch_rate = gyro[0];
    float yaw_rate   = gyro[1];
    float roll_rate  = gyro[2];
    // Use for aim assist, motion controls, etc.
}

// Accelerometer works the same way
if (SDL_GamepadHasSensor(gamepad, SDL_SENSOR_ACCEL)) {
    SDL_SetGamepadSensorEnabled(gamepad, SDL_SENSOR_ACCEL, true);
    float accel[3];
    SDL_GetGamepadSensorData(gamepad, SDL_SENSOR_ACCEL, accel, 3);
    // Values in m/s², ~9.8 on the gravity axis when stationary
}
```

---

## Touchpad (DualShock 4 / DualSense)

```c
int num_touchpads = SDL_GetNumGamepadTouchpads(gamepad);
if (num_touchpads > 0) {
    int num_fingers = SDL_GetNumGamepadTouchpadFingers(gamepad, 0);

    for (int f = 0; f < num_fingers; f++) {
        bool down;
        float tx, ty, pressure;
        SDL_GetGamepadTouchpadFinger(gamepad, 0, f,
                                     &down, &tx, &ty, &pressure);
        if (down) {
            // tx, ty are normalized 0.0–1.0
            SDL_Log("Finger %d: %.2f, %.2f (pressure: %.2f)",
                    f, tx, ty, pressure);
        }
    }
}
```

---

## LED Color (DualSense / DualShock 4)

```c
// Set the controller's light bar color
SDL_SetGamepadLED(gamepad, 0, 128, 255);  // R, G, B — cyan
```

Use this for player identification, health indicators, or matching in-game state.

---

## Gamepad Type Detection

SDL3 lets you identify the physical controller type for UI prompts:

```c
SDL_GamepadType type = SDL_GetGamepadType(gamepad);
switch (type) {
    case SDL_GAMEPAD_TYPE_XBOX_ONE:
    case SDL_GAMEPAD_TYPE_XBOX_SERIES:
        load_xbox_button_icons();
        break;
    case SDL_GAMEPAD_TYPE_PS4:
    case SDL_GAMEPAD_TYPE_PS5:
        load_playstation_button_icons();
        break;
    case SDL_GAMEPAD_TYPE_NINTENDO_SWITCH_PRO:
    case SDL_GAMEPAD_TYPE_NINTENDO_SWITCH_JOYCON_PAIR:
        load_switch_button_icons();
        break;
    default:
        load_generic_button_icons();
        break;
}
```

---

## Common Mistakes

**Forgetting to pump events.** Gamepad state (including rumble) only updates when you process events. Always call `SDL_PumpEvents()` or `SDL_PollEvent()` each frame.

**Using joystick indices instead of instance IDs.** SDL3 gamepads are identified by `SDL_JoystickID`, not array indices. Store the ID from `SDL_EVENT_GAMEPAD_ADDED`.

**Not handling hot-plug.** Players connect and disconnect controllers mid-game. Always handle `SDL_EVENT_GAMEPAD_ADDED` and `SDL_EVENT_GAMEPAD_REMOVED`.

**Assuming all controllers have rumble/sensors.** Check capabilities before use. `SDL_RumbleGamepad` returns false if unsupported — don't treat it as an error.
