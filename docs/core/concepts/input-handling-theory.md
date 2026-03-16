# Input Handling -- Theory & Concepts

This document covers engine-agnostic input handling theory for games. For engine-specific implementations, see the relevant engine module.

---

## Input Abstraction Layer

Map physical inputs to game actions. This decouples gameplay code from specific hardware:

```
Game Actions:    Jump, Attack, Interact, Pause, MoveLeft, MoveRight
Physical Inputs: Space, Z, E, Escape, Left Arrow, Right Arrow, Gamepad A, etc.
```

Each game action maps to one or more physical inputs. The gameplay code only queries actions, never raw keys.

### Benefits

- Rebinding is trivial -- change the mapping, not the gameplay code
- Multi-device support -- keyboard and gamepad share the same action queries
- Clean gameplay code -- `if action_pressed(Jump)` instead of `if key_pressed(Space) or gamepad_pressed(A)`

---

## Edge Detection

| Method | Meaning |
|--------|---------|
| **Pressed** | Just pressed this frame (rising edge) |
| **Released** | Just released this frame (falling edge) |
| **Held** | Currently held down |
| **HeldOnly** | Held but not just pressed (excludes the press frame) |

Edge detection requires comparing the current frame's input state with the previous frame's state.

---

## Input Buffering

Store input for a short window so actions are not lost if pressed slightly early. Essential for responsive game feel.

### Jump Buffering

If the player presses jump while airborne (just before landing), buffer the input. When they land within the buffer window, execute the jump.

```
if jump_pressed:
    jump_buffer_timer = buffer_duration    // e.g., 0.08--0.13 seconds

each frame:
    jump_buffer_timer -= dt
    if grounded and jump_buffer_timer > 0:
        execute_jump()
        jump_buffer_timer = 0
```

### Attack Buffering

Same concept applied to combo attacks -- the next attack input is buffered during the current attack animation.

---

## Key Rebinding

### Runtime Rebinding

1. Enter "listening" mode for a specific action
2. Wait for the next key/button press
3. Assign that input to the action
4. Rebuild the input condition

### Persistence

Save bindings to a file (JSON or similar). Load on startup and rebuild conditions. Use a default fallback if no saved bindings exist.

### Conflict Detection

When a new binding is assigned, check if it conflicts with an existing binding. Either warn the user or automatically unbind the conflicting action.

---

## Gamepad Support

### Dead Zones

Analog sticks rarely rest at exactly (0, 0). Apply a radial dead zone:

```
magnitude = length(raw_stick)
if magnitude < dead_zone:
    return (0, 0)

// Rescale to 0--1 range after dead zone
normalized = (magnitude - dead_zone) / (1 - dead_zone)
normalized = clamp(normalized, 0, 1)
return (raw_stick / magnitude) * normalized
```

**Typical dead zone:** 0.15--0.25

### Response Curves

Apply a response curve after dead zone for precision at low ranges:

- **Linear:** `output = input` -- direct mapping
- **Quadratic:** `output = input^2` -- more precision at low values, useful for aiming
- **Cubic:** `output = input^3` -- even more precision at low values

### Rumble/Haptics

Trigger vibration for impacts, explosions, and feedback. Always provide a setting to disable it. Schedule a stop timer since most APIs do not auto-stop vibration.

---

## Simultaneous Input Devices

Support keyboard and gamepad simultaneously:

- Poll both devices every frame
- For movement, use whichever has greater magnitude (analog stick vs digital keys)
- For actions, trigger if either device fires the action

---

## Input Priority and Consumption

When multiple systems need input (UI and gameplay), establish priority:

1. UI processes input first using "tracked" or "consumable" conditions
2. If UI consumes an input, gameplay does not see it
3. If UI does not consume it, gameplay processes normally

This prevents actions like "confirm menu selection" from also triggering "attack" in the game behind the menu.

---

## Touch Input

### Tap, Swipe, Pinch

- **Tap:** Touch press and release within a small movement threshold
- **Swipe:** Touch press, drag beyond threshold, release. Direction determined by delta
- **Pinch:** Two touches; track distance change between them for zoom

### Virtual Joystick

Define a screen region. Track the touch position relative to the region center, normalize to -1..1 range, clamp to the region radius.

---

## Input Recording and Playback

For replays, testing, and demos:

1. Record: each frame, capture all pressed keys, mouse position, and gamepad state with a tick number
2. Playback: feed recorded frames back instead of live input
3. Requires deterministic game logic (fixed timestep, seeded random)

Save/load recordings as serialized frame lists.

---

*Implementation examples are available in engine-specific modules.*
