# R2 — Raylib Audio & Input Systems Reference

> **Category:** reference · **Engine:** Raylib · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Getting Started](../guides/G1_getting_started.md) · [R1 Language Bindings](R1_language_bindings.md)

Raylib's audio module (`raudio.c`) and input system (part of `rcore.c`) are designed for simplicity. This reference covers the complete API surface for both systems with usage patterns and gotchas.

---

## Audio System

Raylib's audio module handles sound effects and music streaming through a minimal API backed by miniaudio internally. There are two distinct audio types:

- **Sound** — Short clips loaded entirely into memory. Best for effects (gunshots, jumps, UI clicks). Use for anything under ~10 seconds.
- **Music** — Streamed progressively from disk. Best for background music, ambiance, long audio. Requires `UpdateMusicStream()` every frame.

### Audio Device Lifecycle

```c
InitAudioDevice();      // Must be called before any audio functions
// ... your game loop ...
CloseAudioDevice();     // Must be called before CloseWindow()
```

`InitAudioDevice()` must be called **after** `InitWindow()` and should only be called once. `CloseAudioDevice()` must be called **before** `CloseWindow()`.

### Sound API

```c
// Loading and unloading
Sound fx = LoadSound("resources/sound.wav");      // Load from file (WAV, OGG, MP3, FLAC)
Sound alias = LoadSoundAlias(fx);                 // Create alias (shares audio data, independent playback)
UnloadSoundAlias(alias);                          // Unload alias (does not free original data)
UnloadSound(fx);                                  // Unload sound from memory

// Playback control
PlaySound(fx);                                    // Play sound
StopSound(fx);                                    // Stop sound
PauseSound(fx);                                   // Pause sound
ResumeSound(fx);                                  // Resume paused sound
bool playing = IsSoundPlaying(fx);                // Check if sound is currently playing

// Properties
SetSoundVolume(fx, 0.5f);                         // Set volume (0.0 to 1.0)
SetSoundPitch(fx, 1.2f);                          // Set pitch multiplier (1.0 = normal)
SetSoundPan(fx, 0.0f);                            // Set pan (-1.0 left, 0.0 center, 1.0 right)
```

**Sound aliases** let you play the same sound effect multiple times simultaneously (e.g., rapid gunfire) without loading the data multiple times. Each alias has independent playback state.

### Music API

```c
// Loading and unloading
Music music = LoadMusicStream("resources/music.ogg");  // Load music for streaming
UnloadMusicStream(music);                              // Unload music stream

// Playback control
PlayMusicStream(music);                                // Start playing
StopMusicStream(music);                                // Stop (resets to beginning)
PauseMusicStream(music);                               // Pause
ResumeMusicStream(music);                              // Resume
UpdateMusicStream(music);                              // ⚠️ MUST call every frame!
bool playing = IsMusicStreamPlaying(music);            // Check if playing
SeekMusicStream(music, 30.0f);                         // Seek to position in seconds

// Properties
SetMusicVolume(music, 0.8f);                           // Set volume (0.0 to 1.0)
SetMusicPitch(music, 1.0f);                            // Set pitch multiplier
SetMusicPan(music, 0.0f);                              // Set pan
float length = GetMusicTimeLength(music);              // Get total length in seconds
float played = GetMusicTimePlayed(music);              // Get current playback position
```

**Critical:** `UpdateMusicStream()` must be called every frame in your game loop. If you forget, the music buffer runs dry and playback stutters or stops.

```c
// Typical game loop with music
while (!WindowShouldClose()) {
    UpdateMusicStream(music);  // Keep the audio buffer filled

    BeginDrawing();
        ClearBackground(RAYWHITE);
    EndDrawing();
}
```

### Supported Audio Formats

| Format | Sound (LoadSound) | Music (LoadMusicStream) |
|--------|-------------------|-------------------------|
| WAV    | Yes               | Yes                     |
| OGG    | Yes               | Yes                     |
| MP3    | Yes               | Yes                     |
| FLAC   | Yes               | Yes                     |
| XM     | No                | Yes (tracker music)     |
| MOD    | No                | Yes (tracker music)     |
| QOA    | Yes               | Yes                     |

---

## Input System

Raylib's input system uses a polling model — you check the state of keys, buttons, and axes each frame during your update step. The input state is refreshed each frame by `PollInputEvents()` (called internally by `EndDrawing()`).

### Keyboard Input

Raylib provides four states for each key, covering the full lifecycle of a press:

```c
// State queries — call during update, before EndDrawing()
bool IsKeyPressed(int key);     // True on the FIRST frame a key is pressed
bool IsKeyDown(int key);        // True every frame while key is held
bool IsKeyReleased(int key);    // True on the FIRST frame a key is released
bool IsKeyUp(int key);          // True every frame while key is NOT held

// Auto-repeat aware
bool IsKeyPressedRepeat(int key);  // True on press and on OS key-repeat ticks

// Character input (for text fields)
int GetCharPressed(void);       // Get next character from input queue (Unicode)
int GetKeyPressed(void);        // Get next key from input queue (key code)
```

**Key constants** use the `KEY_` prefix: `KEY_W`, `KEY_A`, `KEY_S`, `KEY_D`, `KEY_SPACE`, `KEY_ESCAPE`, `KEY_LEFT_SHIFT`, `KEY_ENTER`, etc.

```c
// Example: movement input
if (IsKeyDown(KEY_W)) player.y -= speed * dt;
if (IsKeyDown(KEY_S)) player.y += speed * dt;
if (IsKeyDown(KEY_A)) player.x -= speed * dt;
if (IsKeyDown(KEY_D)) player.x += speed * dt;

// Example: one-shot action
if (IsKeyPressed(KEY_SPACE)) FireBullet();
```

### Mouse Input

```c
// Button states (same lifecycle as keyboard)
bool IsMouseButtonPressed(int button);   // First frame pressed
bool IsMouseButtonDown(int button);      // Held
bool IsMouseButtonReleased(int button);  // First frame released
bool IsMouseButtonUp(int button);        // Not held

// Position and movement
Vector2 GetMousePosition(void);          // Current position (screen coords)
int GetMouseX(void);                     // X only
int GetMouseY(void);                     // Y only
Vector2 GetMouseDelta(void);             // Frame-to-frame movement delta
float GetMouseWheelMove(void);           // Wheel scroll amount this frame
Vector2 GetMouseWheelMoveV(void);        // Wheel scroll as 2D vector

// Cursor control
void SetMousePosition(int x, int y);     // Set cursor position
void SetMouseCursor(int cursor);         // Set cursor shape (MOUSE_CURSOR_*)
void ShowCursor(void);
void HideCursor(void);
bool IsCursorHidden(void);
void EnableCursor(void);                 // Unlock + show
void DisableCursor(void);               // Lock + hide (FPS camera mode)
bool IsCursorOnScreen(void);
```

**Mouse button constants:** `MOUSE_BUTTON_LEFT`, `MOUSE_BUTTON_RIGHT`, `MOUSE_BUTTON_MIDDLE`, `MOUSE_BUTTON_SIDE`, `MOUSE_BUTTON_EXTRA`, `MOUSE_BUTTON_FORWARD`, `MOUSE_BUTTON_BACK`.

```c
// Example: aiming + shooting
Vector2 target = GetMousePosition();
if (IsMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
    ShootAt(target);
}
```

### Gamepad Input

```c
// Availability
bool IsGamepadAvailable(int gamepad);              // Is gamepad connected? (0-indexed)
const char *GetGamepadName(int gamepad);            // Get gamepad name string

// Button states
bool IsGamepadButtonPressed(int gamepad, int button);
bool IsGamepadButtonDown(int gamepad, int button);
bool IsGamepadButtonReleased(int gamepad, int button);
bool IsGamepadButtonUp(int gamepad, int button);
int GetGamepadButtonPressed(void);                  // Last button pressed (any gamepad)

// Axes
float GetGamepadAxisMovement(int gamepad, int axis); // -1.0 to 1.0
int GetGamepadAxisCount(int gamepad);                // Number of axes
```

**Gamepad button constants** follow Xbox layout: `GAMEPAD_BUTTON_RIGHT_FACE_DOWN` (A), `GAMEPAD_BUTTON_RIGHT_FACE_RIGHT` (B), `GAMEPAD_BUTTON_LEFT_TRIGGER_1` (LB), etc.

**Axis constants:** `GAMEPAD_AXIS_LEFT_X`, `GAMEPAD_AXIS_LEFT_Y`, `GAMEPAD_AXIS_RIGHT_X`, `GAMEPAD_AXIS_RIGHT_Y`, `GAMEPAD_AXIS_LEFT_TRIGGER`, `GAMEPAD_AXIS_RIGHT_TRIGGER`.

```c
// Example: gamepad movement with deadzone
if (IsGamepadAvailable(0)) {
    float lx = GetGamepadAxisMovement(0, GAMEPAD_AXIS_LEFT_X);
    float ly = GetGamepadAxisMovement(0, GAMEPAD_AXIS_LEFT_Y);
    if (fabsf(lx) > 0.2f) player.x += lx * speed * dt;
    if (fabsf(ly) > 0.2f) player.y += ly * speed * dt;
}
```

### Touch Input (Mobile / Web)

```c
int GetTouchPointCount(void);                       // Number of active touches
int GetTouchPointId(int index);                     // Get touch ID for a point index
Vector2 GetTouchPosition(int index);                // Get position of touch point
```

### Gesture Detection

```c
void SetGesturesEnabled(unsigned int flags);        // Enable specific gestures
bool IsGestureDetected(unsigned int gesture);       // Check if gesture occurred
int GetGestureDetected(void);                       // Get latest detected gesture
float GetGesturePinchAngle(void);                   // Pinch angle
Vector2 GetGesturePinchVector(void);                // Pinch displacement
float GetGestureHoldDuration(void);                 // Hold time in seconds
Vector2 GetGestureDragVector(void);                 // Drag displacement
float GetGestureDragAngle(void);                    // Drag angle
```

**Gesture flags:** `GESTURE_TAP`, `GESTURE_DOUBLETAP`, `GESTURE_HOLD`, `GESTURE_DRAG`, `GESTURE_SWIPE_RIGHT`, `GESTURE_SWIPE_LEFT`, `GESTURE_SWIPE_UP`, `GESTURE_SWIPE_DOWN`, `GESTURE_PINCH_IN`, `GESTURE_PINCH_OUT`.

---

## Common Patterns

### Input Abstraction Layer

For games supporting keyboard + gamepad, abstract input into actions:

```c
typedef struct {
    bool move_left, move_right, move_up, move_down;
    bool fire, jump;
    Vector2 aim;
} GameInput;

GameInput ReadInput(void) {
    GameInput input = {0};

    // Keyboard
    input.move_left  = IsKeyDown(KEY_A) || IsKeyDown(KEY_LEFT);
    input.move_right = IsKeyDown(KEY_D) || IsKeyDown(KEY_RIGHT);
    input.move_up    = IsKeyDown(KEY_W) || IsKeyDown(KEY_UP);
    input.move_down  = IsKeyDown(KEY_S) || IsKeyDown(KEY_DOWN);
    input.fire       = IsKeyPressed(KEY_SPACE) || IsMouseButtonPressed(MOUSE_BUTTON_LEFT);
    input.jump       = IsKeyPressed(KEY_UP);
    input.aim        = GetMousePosition();

    // Gamepad overlay
    if (IsGamepadAvailable(0)) {
        float lx = GetGamepadAxisMovement(0, GAMEPAD_AXIS_LEFT_X);
        float ly = GetGamepadAxisMovement(0, GAMEPAD_AXIS_LEFT_Y);
        if (fabsf(lx) > 0.2f) { input.move_left = lx < 0; input.move_right = lx > 0; }
        if (fabsf(ly) > 0.2f) { input.move_up = ly < 0; input.move_down = ly > 0; }
        if (IsGamepadButtonPressed(0, GAMEPAD_BUTTON_RIGHT_FACE_DOWN)) input.fire = true;
        if (IsGamepadButtonPressed(0, GAMEPAD_BUTTON_RIGHT_FACE_UP)) input.jump = true;
    }

    return input;
}
```

### Audio Manager Pattern

Centralize audio to avoid resource leaks and simplify volume control:

```c
typedef struct {
    Sound sfx[32];
    int sfx_count;
    Music current_music;
    float master_volume;
    float sfx_volume;
    float music_volume;
} AudioManager;

void AudioManager_PlaySFX(AudioManager *am, int id) {
    SetSoundVolume(am->sfx[id], am->master_volume * am->sfx_volume);
    PlaySound(am->sfx[id]);
}

void AudioManager_Update(AudioManager *am) {
    if (IsMusicStreamPlaying(am->current_music)) {
        SetMusicVolume(am->current_music, am->master_volume * am->music_volume);
        UpdateMusicStream(am->current_music);
    }
}
```

---

## Common Mistakes

- **Forgetting `UpdateMusicStream()`** — Music plays for ~1 second then stops. Call it every frame.
- **Loading audio before `InitAudioDevice()`** — Will crash or return empty handles.
- **Not applying deadzone to gamepad axes** — Raw axis values drift near 0.0; always threshold at 0.1–0.2.
- **Checking `IsKeyPressed` in draw code** — Input state is per-frame; checking during draw may miss the frame boundary. Always read input in your update step.
- **Playing the same Sound simultaneously** — A `Sound` can only play once at a time. Use `LoadSoundAlias()` for overlapping playback of the same clip.
