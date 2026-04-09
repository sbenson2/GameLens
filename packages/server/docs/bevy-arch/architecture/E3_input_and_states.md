# E3 — Input Handling & State Management

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](E1_ecs_fundamentals.md) · [G1 Getting Started](../guides/G1_getting_started.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Input Handling

Bevy provides two complementary approaches to input: **polling** (check current state each frame) and **events** (react to input as it arrives). Both are built on the ECS — input state is stored in Resources, and input events flow through the standard Event system.

### Keyboard Input

The primary resource is `ButtonInput<KeyCode>`, which tracks the pressed/released state of every physical key.

```rust
use bevy::prelude::*;

fn player_movement(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut query: Query<&mut Transform, With<Player>>,
    time: Res<Time>,
) {
    let mut transform = query.single_mut();
    let speed = 200.0;

    // pressed() — true every frame the key is held
    if keyboard.pressed(KeyCode::ArrowRight) {
        transform.translation.x += speed * time.delta_secs();
    }
    if keyboard.pressed(KeyCode::ArrowLeft) {
        transform.translation.x -= speed * time.delta_secs();
    }

    // just_pressed() — true only on the frame the key went down
    if keyboard.just_pressed(KeyCode::Space) {
        // jump, shoot, interact — one-shot actions
    }
}
```

**`KeyCode` vs `Key`:** `KeyCode` represents the physical key location (same position regardless of keyboard layout). For logical/symbol input — like `+` for zoom or `?` for help — use `ButtonInput<Key>` instead, which respects the user's layout. Bevy 0.18 supports both.

### Mouse Input

Mouse input is split across several resources:

```rust
fn mouse_example(
    buttons: Res<ButtonInput<MouseButton>>,
    mut motion_events: EventReader<MouseMotion>,
    mut scroll_events: EventReader<MouseWheel>,
    window: Query<&Window>,
) {
    // Button state — same API as keyboard
    if buttons.just_pressed(MouseButton::Left) {
        // handle click
    }

    // Raw mouse motion delta (for camera look, FPS controls)
    for event in motion_events.read() {
        let delta = event.delta; // Vec2
    }

    // Scroll wheel
    for event in scroll_events.read() {
        let scroll_y = event.y; // positive = scroll up
    }

    // Cursor position in window coordinates
    if let Ok(window) = window.get_single() {
        if let Some(pos) = window.cursor_position() {
            // pos is Vec2 in logical pixels, origin at top-left
        }
    }
}
```

### Gamepad Input

Bevy uses the `gilrs` crate internally. Each connected gamepad gets a unique `Entity`, and you query its input via `ButtonInput<GamepadButton>` and axis resources.

```rust
fn gamepad_input(
    gamepads: Query<&Gamepad>,
) {
    for gamepad in &gamepads {
        // Digital buttons
        if gamepad.just_pressed(GamepadButton::South) {
            // A button (Xbox) / Cross (PlayStation)
        }

        // Analog sticks — returns Option<f32> in range [-1.0, 1.0]
        let left_stick_x = gamepad.get(GamepadAxis::LeftStickX).unwrap_or(0.0);
        let left_stick_y = gamepad.get(GamepadAxis::LeftStickY).unwrap_or(0.0);

        // Triggers — returns 0.0 to 1.0
        let right_trigger = gamepad.get(GamepadAxis::RightZ).unwrap_or(0.0);
    }
}
```

**Rumble feedback:** Send a `GamepadRumbleRequest::Add` event to trigger vibration, specifying duration, motor, and intensity. Use `GamepadRumbleRequest::Stop` to cancel.

### Touch Input

For mobile or touch-screen targets, use the `Touches` resource:

```rust
fn touch_input(touches: Res<Touches>) {
    for touch in touches.iter_just_pressed() {
        let position = touch.position(); // Vec2
        let id = touch.id();
    }
}
```

### Action-Based Input (Community Pattern)

For production games, consider `leafwing-input-manager` — it maps physical inputs to logical actions, supports input rebinding, and abstracts over keyboard/gamepad/mouse:

```toml
# Cargo.toml
[dependencies]
leafwing-input-manager = "0.16" # check crates.io for Bevy 0.18 compat
```

```rust
// Define actions as an enum
#[derive(Actionlike, Clone, Debug, Hash, PartialEq, Eq, Reflect)]
enum PlayerAction {
    Move,
    Jump,
    Attack,
}
```

---

## State Management

Bevy's **States** system provides finite state machines that control which systems run each frame. States model high-level game phases: menus, gameplay, paused, loading screens, cutscenes.

### Defining a State

```rust
use bevy::prelude::*;

#[derive(States, Debug, Clone, PartialEq, Eq, Hash, Default)]
enum GameState {
    #[default]
    Menu,
    Loading,
    Playing,
    Paused,
    GameOver,
}
```

Register the state with the app:

```rust
fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .init_state::<GameState>()   // registers with default value (Menu)
        .add_systems(OnEnter(GameState::Menu), setup_menu)
        .add_systems(OnExit(GameState::Menu), teardown_menu)
        .add_systems(OnEnter(GameState::Playing), setup_game)
        .add_systems(Update, game_logic.run_if(in_state(GameState::Playing)))
        .run();
}
```

### Transitioning Between States

Queue a state change via `NextState<T>`:

```rust
fn start_game(
    mut next_state: ResMut<NextState<GameState>>,
    keyboard: Res<ButtonInput<KeyCode>>,
) {
    if keyboard.just_pressed(KeyCode::Enter) {
        next_state.set(GameState::Playing);
    }
}
```

**Transition order (runs in `StateTransition` schedule, after `PreUpdate`):**

1. `StateTransitionEvent` is sent
2. `OnExit(old_state)` systems run
3. `OnTransition { from, to }` systems run
4. `OnEnter(new_state)` systems run

All transitions complete before `FixedMain` and `Update`, so your game systems see the new state the same frame the transition was requested.

### Gating Systems by State

Use `run_if(in_state(...))` to conditionally run systems:

```rust
app.add_systems(Update, (
    player_movement,
    enemy_ai,
    collision_detection,
).run_if(in_state(GameState::Playing)));

app.add_systems(Update, (
    pause_menu_ui,
    handle_unpause,
).run_if(in_state(GameState::Paused)));
```

### SubStates — Child States with Manual Control

A `SubState` only exists when its parent state is in a specific configuration. While active, it can be changed manually like a normal state. When the parent exits the required state, the sub-state is automatically removed.

```rust
#[derive(SubStates, Debug, Clone, PartialEq, Eq, Hash, Default)]
#[source(GameState = GameState::Playing)]
enum PlayingPhase {
    #[default]
    Exploration,
    Combat,
    Dialogue,
}

// Register it
app.add_sub_state::<PlayingPhase>();

// PlayingPhase systems only run while GameState::Playing is active
app.add_systems(Update, combat_ui.run_if(in_state(PlayingPhase::Combat)));
```

### ComputedStates — Derived States (Read-Only)

A `ComputedState` is deterministically derived from one or more source states. You cannot set it manually — it recalculates automatically whenever a source state changes.

```rust
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
enum InGame {
    Yes,
    No,
}

impl ComputedStates for InGame {
    type SourceStates = GameState;

    fn compute(source: GameState) -> Option<Self> {
        match source {
            GameState::Playing | GameState::Paused => Some(InGame::Yes),
            _ => Some(InGame::No),
        }
    }
}

app.add_computed_state::<InGame>();

// Systems that should run in both Playing and Paused
app.add_systems(Update, render_hud.run_if(in_state(InGame::Yes)));
```

### State-Scoped Entities

Bevy automatically despawns entities tagged with `StateScoped<T>` when the associated state exits. This prevents stale UI or game objects from leaking across states:

```rust
fn setup_menu(mut commands: Commands) {
    commands.spawn((
        // This entire entity tree is despawned when we leave GameState::Menu
        StateScoped(GameState::Menu),
        Node { /* ... */ },
        // ... UI children
    ));
}
```

---

## Design Patterns

### Input → Action → State Flow

A common architecture separates raw input reading from game logic using events:

```rust
// 1. Input system reads hardware state, sends game events
fn handle_input(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut pause_events: EventWriter<TogglePause>,
) {
    if keyboard.just_pressed(KeyCode::Escape) {
        pause_events.send(TogglePause);
    }
}

// 2. Game logic reacts to events, transitions state
fn toggle_pause(
    mut events: EventReader<TogglePause>,
    state: Res<State<GameState>>,
    mut next: ResMut<NextState<GameState>>,
) {
    for _ in events.read() {
        match state.get() {
            GameState::Playing => next.set(GameState::Paused),
            GameState::Paused => next.set(GameState::Playing),
            _ => {}
        }
    }
}
```

This keeps input handling testable and makes it trivial to add gamepad or touch support later — just send the same events from a different input system.
