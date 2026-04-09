# G4 — UI System (bevy_ui)

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [E3 Input & States](../architecture/E3_input_and_states.md) · [G1 Getting Started](G1_getting_started.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy includes a built-in UI system (`bevy_ui`) that provides a declarative, ECS-driven layout engine powered by the [Taffy](https://github.com/DioxusLabs/taffy) library. It supports both **Flexbox** and **CSS Grid** layout algorithms. UI elements are ordinary entities with `Node` components — no special runtime, just the ECS you already know.

Starting in Bevy 0.17, the engine also ships **headless standard widgets** (buttons, checkboxes, sliders) that provide behavior without styling. Bevy 0.18 continues to expand this collection. For themed/styled editor widgets, look at **Feathers** (`bevy_feathers`), which is being developed alongside the upcoming Bevy Editor.

---

## Core Concepts

### The `Node` Component

Every UI element starts with a `Node`. It controls the element's size, position, layout direction, padding, margin, and more. `Node` is the equivalent of a `<div>` — it's a box that participates in layout.

```rust
use bevy::prelude::*;

fn setup_ui(mut commands: Commands) {
    // Camera is required to render UI
    commands.spawn(Camera2d);

    // Root container — fills the screen, centers children
    commands.spawn(Node {
        width: Val::Percent(100.0),
        height: Val::Percent(100.0),
        justify_content: JustifyContent::Center,
        align_items: AlignItems::Center,
        flex_direction: FlexDirection::Column,
        ..default()
    });
}
```

### Layout Values (`Val`)

Sizes and spacing use the `Val` enum:

| Value | Meaning |
|-------|---------|
| `Val::Px(f32)` | Absolute pixels |
| `Val::Percent(f32)` | Percentage of parent's size |
| `Val::Auto` | Let the layout engine decide (default) |
| `Val::Vw(f32)` / `Val::Vh(f32)` | Percentage of viewport width/height |

### Flexbox vs. CSS Grid

`Node` defaults to Flexbox. Switch to Grid by setting `display: Display::Grid`:

```rust
// Flexbox (default) — row or column of children
Node {
    flex_direction: FlexDirection::Row,
    column_gap: Val::Px(10.0),
    ..default()
}

// CSS Grid — explicit rows and columns
Node {
    display: Display::Grid,
    grid_template_columns: vec![
        GridTrack::flex(1.0),
        GridTrack::flex(2.0),
        GridTrack::flex(1.0),
    ],
    grid_template_rows: vec![
        GridTrack::px(60.0),
        GridTrack::flex(1.0),
    ],
    ..default()
}
```

---

## Adding Visuals

### Background Color

```rust
commands.spawn((
    Node {
        width: Val::Px(200.0),
        height: Val::Px(100.0),
        ..default()
    },
    BackgroundColor(Color::srgb(0.2, 0.2, 0.8)),
));
```

### Borders and Rounded Corners

```rust
commands.spawn((
    Node {
        width: Val::Px(200.0),
        height: Val::Px(80.0),
        border: UiRect::all(Val::Px(2.0)),
        ..default()
    },
    BackgroundColor(Color::srgb(0.15, 0.15, 0.15)),
    BorderColor(Color::srgb(0.5, 0.5, 0.5)),
    BorderRadius::all(Val::Px(8.0)),
));
```

### Background Gradients (Bevy 0.17+)

```rust
commands.spawn((
    Node {
        width: Val::Px(200.0),
        height: Val::Px(80.0),
        ..default()
    },
    BackgroundGradient(vec![
        LinearGradient {
            angle: 0.0,
            stops: vec![
                ColorStop::new(Color::srgb(0.2, 0.5, 1.0), Val::Percent(0.0)),
                ColorStop::new(Color::srgb(0.8, 0.2, 1.0), Val::Percent(100.0)),
            ],
        },
    ]),
));
```

---

## Text

Use the `Text` component as a child of a `Node`:

```rust
commands.spawn((
    Node {
        width: Val::Percent(100.0),
        justify_content: JustifyContent::Center,
        ..default()
    },
)).with_children(|parent| {
    parent.spawn((
        Text::new("Hello, Bevy UI!"),
        TextFont {
            font_size: 32.0,
            ..default()
        },
        TextColor(Color::WHITE),
    ));
});
```

### Loading Custom Fonts

```rust
fn setup_ui(mut commands: Commands, asset_server: Res<AssetServer>) {
    let font: Handle<Font> = asset_server.load("fonts/my_font.ttf");

    commands.spawn((
        Text::new("Custom Font"),
        TextFont {
            font,
            font_size: 24.0,
            ..default()
        },
    ));
}
```

---

## Images in UI

```rust
fn setup_ui(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn((
        Node {
            width: Val::Px(128.0),
            height: Val::Px(128.0),
            ..default()
        },
        ImageNode::new(asset_server.load("textures/icon.png")),
    ));
}
```

---

## Interaction and Buttons

Bevy detects pointer interaction on any `Node` that has the `Interaction` component. The component is automatically updated by the UI picking system.

```rust
#[derive(Component)]
struct MenuButton;

fn setup_button(mut commands: Commands) {
    commands.spawn((
        Node {
            width: Val::Px(200.0),
            height: Val::Px(60.0),
            justify_content: JustifyContent::Center,
            align_items: AlignItems::Center,
            ..default()
        },
        BackgroundColor(Color::srgb(0.3, 0.3, 0.3)),
        BorderRadius::all(Val::Px(6.0)),
        Interaction::default(),
        MenuButton,
    )).with_children(|parent| {
        parent.spawn((
            Text::new("Play"),
            TextFont { font_size: 24.0, ..default() },
            TextColor(Color::WHITE),
        ));
    });
}

fn handle_button(
    mut query: Query<
        (&Interaction, &mut BackgroundColor),
        (Changed<Interaction>, With<MenuButton>),
    >,
) {
    for (interaction, mut bg) in &mut query {
        match *interaction {
            Interaction::Pressed => {
                *bg = BackgroundColor(Color::srgb(0.1, 0.6, 0.1));
                // Handle the click action here
            }
            Interaction::Hovered => {
                *bg = BackgroundColor(Color::srgb(0.4, 0.4, 0.5));
            }
            Interaction::None => {
                *bg = BackgroundColor(Color::srgb(0.3, 0.3, 0.3));
            }
        }
    }
}
```

> **Rust ownership note:** The `Changed<Interaction>` query filter is important — without it the system runs every frame for every button, which wastes CPU. With the filter it only runs when interaction state actually changes.

---

## Standard Headless Widgets (Bevy 0.17+)

Bevy ships "headless" widgets — components that add behavior to any `Node` without imposing visual style. You provide the look; Bevy provides the logic.

### Button Widget

```rust
use bevy::ui_widgets::prelude::*;

commands.spawn((
    Node { width: Val::Px(160.0), height: Val::Px(50.0), ..default() },
    Button, // Headless — tracks "pressed" state, emits Activate events
    BackgroundColor(Color::srgb(0.3, 0.3, 0.3)), // Your styling
)).observe(|_trigger: Trigger<Activate>| {
    println!("Button activated!");
});
```

### Checkbox Widget

```rust
use bevy::ui_widgets::prelude::*;

commands.spawn((
    Node { width: Val::Px(24.0), height: Val::Px(24.0), ..default() },
    Checkbox,     // Headless — toggles Checked component
    Checked(false),
    BackgroundColor(Color::srgb(0.2, 0.2, 0.2)),
)).observe(|trigger: Trigger<ValueChange<bool>>| {
    println!("Checkbox now: {}", trigger.value);
});
```

### Slider Widget

```rust
use bevy::ui_widgets::prelude::*;

commands.spawn((
    Node { width: Val::Px(200.0), height: Val::Px(20.0), ..default() },
    Slider,
    SliderValue(0.5),
    SliderRange { min: 0.0, max: 1.0 },
    SliderStep(0.1), // Optional — snap to increments
    BackgroundColor(Color::srgb(0.15, 0.15, 0.15)),
));
```

> **Headless ≠ invisible.** You still need `BackgroundColor`, `BorderColor`, etc. to see anything. The widgets only provide behavior (press tracking, value changes, keyboard/accessibility support).

---

## Input Focus (Bevy 0.16+)

Bevy has first-class input focus management in `bevy::input_focus`:

```rust
use bevy::input_focus::InputFocus;

fn check_focus(focus: Res<InputFocus>) {
    if let Some(focused_entity) = focus.0 {
        println!("Currently focused: {:?}", focused_entity);
    }
}
```

This replaced the older `bevy::a11y::Focus`. Widgets like `Button` and `Checkbox` integrate with this system automatically — pressing Tab cycles focus, and Enter/Space activates the focused widget.

---

## Nesting and Hierarchy

UI uses Bevy's standard parent-child hierarchy. Children are laid out inside their parent's `Node`:

```rust
fn build_menu(mut commands: Commands) {
    // Outer container
    commands.spawn(Node {
        width: Val::Percent(100.0),
        height: Val::Percent(100.0),
        justify_content: JustifyContent::Center,
        align_items: AlignItems::Center,
        ..default()
    }).with_children(|parent| {
        // Inner panel
        parent.spawn((
            Node {
                width: Val::Px(400.0),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(Val::Px(20.0)),
                row_gap: Val::Px(12.0),
                ..default()
            },
            BackgroundColor(Color::srgba(0.0, 0.0, 0.0, 0.85)),
            BorderRadius::all(Val::Px(12.0)),
        )).with_children(|panel| {
            // Title
            panel.spawn((
                Text::new("Main Menu"),
                TextFont { font_size: 36.0, ..default() },
                TextColor(Color::WHITE),
            ));

            // Buttons
            for label in ["New Game", "Load Game", "Settings", "Quit"] {
                panel.spawn((
                    Node {
                        width: Val::Percent(100.0),
                        height: Val::Px(50.0),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.25, 0.25, 0.35)),
                    BorderRadius::all(Val::Px(6.0)),
                    Interaction::default(),
                )).with_children(|btn| {
                    btn.spawn((
                        Text::new(label),
                        TextFont { font_size: 20.0, ..default() },
                        TextColor(Color::WHITE),
                    ));
                });
            }
        });
    });
}
```

---

## Showing/Hiding UI

Toggle visibility with the `Visibility` component — the entity and its children remain in the ECS but stop rendering:

```rust
fn toggle_hud(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut query: Query<&mut Visibility, With<HudRoot>>,
) {
    if keyboard.just_pressed(KeyCode::F1) {
        for mut vis in &mut query {
            *vis = match *vis {
                Visibility::Inherited | Visibility::Visible => Visibility::Hidden,
                Visibility::Hidden => Visibility::Inherited,
            };
        }
    }
}
```

---

## bevy_egui: Alternative Immediate-Mode UI

For developer tools, debug panels, and editor-style UIs, many projects use `bevy_egui` — an integration of the popular `egui` immediate-mode GUI library.

```toml
[dependencies]
bevy = "0.18"
bevy_egui = "0.38"  # Check crates.io for latest Bevy 0.18-compatible version
```

```rust
use bevy::prelude::*;
use bevy_egui::{egui, EguiContexts, EguiPlugin};

fn main() {
    App::new()
        .add_plugins((DefaultPlugins, EguiPlugin))
        .add_systems(Update, debug_panel)
        .run();
}

fn debug_panel(mut contexts: EguiContexts) {
    egui::Window::new("Debug").show(contexts.ctx_mut(), |ui| {
        ui.label("FPS: 60");
        if ui.button("Reset Level").clicked() {
            // handle reset
        }
    });
}
```

**When to use which:**

| Use `bevy_ui` when… | Use `bevy_egui` when… |
|----------------------|----------------------|
| Building in-game HUD, menus, inventory | Building dev tools, debug panels, inspectors |
| You need game-art styling and theming | You want rapid prototyping with zero styling |
| Performance-critical UI (batched rendering) | Content-dense panels with many controls |

---

## Common Pitfalls

1. **Forgetting the camera:** UI won't render without a camera entity in the scene.
2. **`Val::Auto` surprises:** A `Node` with `width: Val::Auto` sizes to its content. If the node has no children and no min-size, it collapses to zero.
3. **Z-ordering:** Later-spawned UI entities render on top. Use `ZIndex::Global(i32)` to override draw order explicitly.
4. **`Interaction` requires picking:** As of Bevy 0.16+, the UI picking backend is a separate feature. If you disabled default features, ensure `bevy_ui_picking_backend` is enabled in your `Cargo.toml` features.
5. **Text without a parent Node:** `Text` should be a child of a `Node` entity. Spawning `Text` alone produces a floating text element that doesn't participate in layout.
6. **Widget styling is your job:** Headless widgets (`Button`, `Checkbox`, `Slider`) are invisible by default. You must add `BackgroundColor`, borders, or custom rendering.
