# Input Handling & Event System

> **Category:** guide · **Engine:** Pygame · **Related:** [game-loop-and-state](../architecture/game-loop-and-state.md), [sprites-and-collision](sprites-and-collision.md)

Pygame provides two complementary input systems: an **event queue** for discrete actions (key press, mouse click, window close) and **state polling** for continuous queries (is a key held down right now?). Understanding when to use each — and how to combine them — is essential for responsive game controls.

## The Event Queue

Every frame, Pygame collects OS-level input into an internal queue. You drain it with `pygame.event.get()`, which returns a list of `Event` objects and empties the queue:

```python
for event in pygame.event.get():
    if event.type == pygame.QUIT:
        running = False
    elif event.type == pygame.KEYDOWN:
        if event.key == pygame.K_SPACE:
            player.jump()
    elif event.type == pygame.KEYUP:
        if event.key == pygame.K_SPACE:
            player.end_jump()
```

Key event attributes:

| Attribute | Description |
|-----------|-------------|
| `event.key` | Key constant (e.g. `pygame.K_a`, `pygame.K_SPACE`) |
| `event.mod` | Bitmask of active modifiers (`KMOD_SHIFT`, `KMOD_CTRL`, `KMOD_ALT`) |
| `event.unicode` | System-translated character (respects keyboard layout, shift state) |
| `event.scancode` | Hardware scan code (layout-independent) |

**When to use events:** One-shot actions — jumping, shooting, menu selection, toggling pause, text input. Events fire once per state change.

### Filtering Events

If you only care about certain event types, filter early to reduce processing:

```python
# Block events you never handle
pygame.event.set_blocked([pygame.MOUSEMOTION, pygame.ACTIVEEVENT])

# Or allow only specific types
pygame.event.set_allowed([pygame.QUIT, pygame.KEYDOWN, pygame.KEYUP])
```

### Custom Events

Define game-specific events with `pygame.event.custom_type()` (pygame 2.0+) or manual IDs starting at `pygame.USEREVENT`:

```python
# Modern approach (pygame 2.0+ / pygame-ce)
ENEMY_SPAWN = pygame.event.custom_type()
pygame.time.set_timer(ENEMY_SPAWN, 3000)  # fire every 3 seconds

for event in pygame.event.get():
    if event.type == ENEMY_SPAWN:
        spawn_enemy()
```

**pygame-ce note:** `pygame.event.custom_type()` works identically in pygame-ce. The community edition also supports `pygame.event.Event` construction with arbitrary attributes, same as upstream.

## State Polling (Continuous Input)

For movement and held-key actions, poll input state every frame instead of waiting for events:

### Keyboard Polling

```python
keys = pygame.key.get_pressed()

dx, dy = 0, 0
if keys[pygame.K_LEFT] or keys[pygame.K_a]:
    dx = -1
if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
    dx = 1
if keys[pygame.K_UP] or keys[pygame.K_w]:
    dy = -1
if keys[pygame.K_DOWN] or keys[pygame.K_s]:
    dy = 1

# Normalize diagonal movement
if dx != 0 and dy != 0:
    length = (dx**2 + dy**2) ** 0.5
    dx /= length
    dy /= length

player.x += dx * speed * dt
player.y += dy * speed * dt
```

**When to use polling:** Continuous movement, acceleration, camera control — anything that should respond smoothly while a key is held.

### Mouse Polling

```python
mouse_pos = pygame.mouse.get_pos()      # (x, y) pixel position
buttons = pygame.mouse.get_pressed()     # (left, middle, right) booleans

if buttons[0]:  # left button held
    shoot_at(mouse_pos)
```

### Mouse Events vs Polling

| Need | Use |
|------|-----|
| Detect single click | `MOUSEBUTTONDOWN` event |
| Detect click-and-drag | `MOUSEBUTTONDOWN` + `MOUSEMOTION` events |
| Track cursor position every frame | `pygame.mouse.get_pos()` |
| Detect held button for continuous fire | `pygame.mouse.get_pressed()` |
| Mouse wheel scroll | `MOUSEBUTTONDOWN` with `event.button == 4` (up) or `5` (down) |

**pygame-ce note:** pygame-ce 2.2.0+ added `MOUSEWHEEL` as a dedicated event type with `event.x` and `event.y` scroll amounts, replacing the older button 4/5 pattern. Both styles still work in pygame-ce, but `MOUSEWHEEL` is preferred.

## Combining Events and Polling

The standard pattern uses events for one-shot triggers and polling for continuous state, both in the same frame:

```python
while running:
    dt = clock.tick(60) / 1000.0  # delta time in seconds

    # Phase 1: Drain events for discrete actions
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_SPACE:
                player.jump()
            elif event.key == pygame.K_ESCAPE:
                paused = not paused

    if paused:
        continue

    # Phase 2: Poll state for continuous input
    keys = pygame.key.get_pressed()
    player.move(keys, dt)
    player.aim(pygame.mouse.get_pos())
```

## Joystick / Gamepad Input

Pygame supports gamepads through the `pygame.joystick` module. Initialize and reference joysticks by index:

```python
pygame.joystick.init()

joysticks = []
for i in range(pygame.joystick.get_count()):
    js = pygame.joystick.Joystick(i)
    js.init()  # required before reading input
    joysticks.append(js)
    print(f"Detected: {js.get_name()}")
```

### Reading Joystick State

```python
if joysticks:
    js = joysticks[0]
    # Axes return float -1.0 to 1.0
    left_x = js.get_axis(0)
    left_y = js.get_axis(1)

    # Apply deadzone to avoid drift
    DEADZONE = 0.15
    if abs(left_x) < DEADZONE:
        left_x = 0
    if abs(left_y) < DEADZONE:
        left_y = 0

    player.x += left_x * speed * dt
    player.y += left_y * speed * dt

    # Buttons
    if js.get_button(0):  # typically A / Cross
        player.jump()
```

### Joystick Events

Joystick events include `JOYAXISMOTION`, `JOYBUTTONDOWN`, `JOYBUTTONUP`, `JOYHATMOTION`, and `JOYDEVICEADDED` / `JOYDEVICEREMOVED` for hot-plug support.

```python
for event in pygame.event.get():
    if event.type == pygame.JOYBUTTONDOWN:
        if event.button == 0:
            player.jump()
    elif event.type == pygame.JOYDEVICEADDED:
        js = pygame.joystick.Joystick(event.device_index)
        js.init()
        joysticks.append(js)
```

**pygame-ce note:** pygame-ce includes improved joystick support with the `instance_id` attribute on joystick events (deprecated `joy` attribute). The `pygame.controller` module in pygame-ce provides SDL GameController mappings for standardized button/axis names across different gamepads.

## Delta-Time Movement

Never tie movement to frame rate. Use `clock.tick()` to compute delta time:

```python
clock = pygame.time.Clock()

while running:
    dt = clock.tick(60) / 1000.0  # seconds since last frame, capped at 60 FPS

    keys = pygame.key.get_pressed()
    if keys[pygame.K_RIGHT]:
        # 200 pixels per second regardless of frame rate
        player.x += 200 * dt
```

This ensures consistent behavior whether the game runs at 30 FPS on a slow machine or 144 FPS on a fast one.

## Detecting Press/Release from Polling

If you need one-shot detection but prefer polling (useful in state-machine architectures), compare frame-to-frame snapshots:

```python
prev_keys = pygame.key.get_pressed()

while running:
    curr_keys = pygame.key.get_pressed()

    # Just pressed this frame (rising edge)
    if curr_keys[pygame.K_e] and not prev_keys[pygame.K_e]:
        interact()

    # Just released this frame (falling edge)
    if not curr_keys[pygame.K_f] and prev_keys[pygame.K_f]:
        throw_object()

    prev_keys = curr_keys
```

## Text Input

For proper text entry (respecting keyboard layout, IME, dead keys), use `TEXTINPUT` and `TEXTEDITING` events rather than `KEYDOWN`:

```python
pygame.key.start_text_input()

for event in pygame.event.get():
    if event.type == pygame.TEXTINPUT:
        input_buffer += event.text
    elif event.type == pygame.TEXTEDITING:
        # IME composition in progress
        composition = event.text
        cursor_pos = event.start
```

Call `pygame.key.stop_text_input()` when the text field loses focus to prevent stray input events.

## Common Pitfalls

**Forgetting to pump events.** If you never call `pygame.event.get()` or `pygame.event.pump()`, the OS considers the window unresponsive. Always drain the queue every frame, even if you only use polling.

**Mixing event types for movement.** Using `KEYDOWN` for walking causes stuttery movement because the event fires once, then pauses for the OS key-repeat delay. Use `key.get_pressed()` instead.

**Ignoring diagonal normalization.** Pressing right + up simultaneously produces `(1, -1)` movement — a magnitude of ~1.41 instead of 1.0. Normalize the vector to keep speed consistent.

**Stale joystick references.** If a gamepad is disconnected, calling methods on the old `Joystick` object raises errors. Listen for `JOYDEVICEREMOVED` and remove the reference.
