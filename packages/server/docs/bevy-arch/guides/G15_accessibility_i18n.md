# G15 — Accessibility and Internationalization

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [G4 UI System](G4_ui_system.md) · [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Making a game accessible and localizable expands your audience dramatically. Bevy is the first general-purpose game engine with built-in accessibility support via AccessKit, and the community provides mature localization plugins built on Mozilla's Fluent system. This guide covers both topics with practical integration patterns for Bevy 0.18.

---

## Part 1 — Accessibility with AccessKit

### What is AccessKit?

AccessKit is a Rust crate providing OS-agnostic accessibility primitives. Bevy integrates it through the `bevy_a11y` crate (included in `DefaultPlugins`), giving screen readers access to your UI tree on Windows, macOS, and (experimentally) Linux.

### How it Works

Bevy automatically builds an AccessKit accessibility tree from entities that have `AccessibilityNode` components. When using `bevy_ui`, interactive widgets like buttons can expose labels, roles, and states to assistive technology.

```rust
use bevy::prelude::*;
use bevy::a11y::accesskit::{NodeBuilder, Role};
use bevy::a11y::AccessibilityNode;

fn spawn_accessible_button(mut commands: Commands) {
    commands
        .spawn((
            Button,
            Node {
                width: Val::Px(200.0),
                height: Val::Px(50.0),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                ..default()
            },
            BackgroundColor(Color::srgb(0.3, 0.3, 0.8)),
        ))
        .with_child((
            Text::new("Start Game"),
            TextFont {
                font_size: 24.0,
                ..default()
            },
            // This node is what screen readers see
            AccessibilityNode::from(
                NodeBuilder::new(Role::Button)
                    .set_name("Start Game")
            ),
        ));
}
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `AccessibilityNode` | Wraps an AccessKit `NodeBuilder` — defines the role, name, and state for assistive tech |
| `Role` | Semantic role (Button, Label, TextInput, Image, etc.) — tells the screen reader *what* the element is |
| `NodeBuilder` | Builder pattern for constructing accessible nodes with properties like name, description, value |

### Current Limitations (Bevy 0.18)

- **Focus / keyboard navigation:** `bevy_ui` does not yet have a robust built-in focus system. Screen reader users navigate via "object nav" (moving through the accessibility tree sequentially) rather than Tab-based focus cycling. This works but is clunky.
- **Linux support:** Requires the `accesskit_unix` feature flag and is experimental. The Linux a11y APIs (AT-SPI) are being revised upstream.
- **Dynamic updates:** When UI state changes (e.g. a button becomes disabled), you must manually update the `AccessibilityNode` component. There is no automatic two-way sync yet.

### Best Practices

1. **Label everything interactive.** Every button, slider, and text input should have an `AccessibilityNode` with a human-readable `name`.
2. **Use semantic roles.** Don't make everything `Role::Generic` — use `Role::Button`, `Role::Heading`, `Role::Image` (with alt text) so screen readers convey structure.
3. **Announce state changes.** If a button is disabled or a checkbox is toggled, update the accessibility node's properties accordingly.
4. **Provide keyboard alternatives.** Even without built-in focus management, you can use `leafwing-input-manager` or raw `ButtonInput<KeyCode>` to let keyboard/gamepad users navigate menus.
5. **Test with a screen reader.** On Windows use NVDA (free) or Narrator. On macOS use VoiceOver (built-in). Testing is the only way to catch gaps.

---

## Part 2 — Internationalization (i18n) with Fluent

### Why Fluent?

Mozilla's [Fluent](https://projectfluent.org/) system is designed for natural-sounding translations. Unlike simple key-value formats, Fluent handles plurals, gender, and grammatical cases natively. The Bevy ecosystem has two main plugins:

| Plugin | Approach | Best For |
|--------|----------|----------|
| `bevy_fluent` (v0.13) | Asset-based loading via Bevy's `AssetServer`; hot-reloadable `.ftl` files | Games shipping with many locales; runtime locale switching |
| `bevy_simple_i18n` | Compile-time embedding via `rust-i18n` macros | Small projects; fewer locales; simpler setup |

This guide focuses on `bevy_fluent` as it integrates more naturally with Bevy's asset pipeline.

### Setup

```toml
[dependencies]
bevy = "0.18"
bevy_fluent = "0.13"
```

### File Structure

```
assets/
└── locales/
    ├── en-US/
    │   └── main.ftl
    ├── es-ES/
    │   └── main.ftl
    └── ja-JP/
        └── main.ftl
```

Each `.ftl` file contains Fluent messages:

```ftl
# assets/locales/en-US/main.ftl
hello-world = Hello, World!
start-game = Start Game
score = Score: { $value }
items-collected =
    { $count ->
        [one] You collected { $count } item.
       *[other] You collected { $count } items.
    }
```

```ftl
# assets/locales/es-ES/main.ftl
hello-world = ¡Hola, Mundo!
start-game = Comenzar Juego
score = Puntuación: { $value }
items-collected =
    { $count ->
        [one] Recogiste { $count } objeto.
       *[other] Recogiste { $count } objetos.
    }
```

### Loading and Using Translations

```rust
use bevy::prelude::*;
use bevy_fluent::prelude::*;

fn main() {
    App::new()
        .add_plugins((DefaultPlugins, FluentPlugin))
        .insert_resource(Locale::new("en-US"))
        .add_systems(Startup, load_locales)
        .add_systems(Update, display_localized_text)
        .run();
}

fn load_locales(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
) {
    // Load all .ftl.ron bundle descriptors
    let handle = asset_server
        .load_glob("locales/**/main.ftl.ron")
        .expect("Failed to load locale files");
    commands.insert_resource(LocaleAssets(handle));
}

fn display_localized_text(
    localization: Res<Localization>,
    mut query: Query<&mut Text, With<ScoreText>>,
) {
    if let Some(content) = localization.content("score") {
        for mut text in &mut query {
            // Pass variables using Fluent's argument system
            // In practice, use fluent_args! macro or build args manually
            *text = Text::new(content);
        }
    }
}
```

> **Note:** `bevy_fluent` uses `.ftl.ron` descriptor files alongside `.ftl` resource files. The `.ftl.ron` file tells the asset loader which `.ftl` resources belong to a bundle and what locale they target. See the [bevy_fluent README](https://github.com/kgv/bevy_fluent) for the descriptor format.

### Runtime Locale Switching

```rust
/// System that switches locale when the player presses L
fn switch_locale(
    keys: Res<ButtonInput<KeyCode>>,
    mut locale: ResMut<Locale>,
) {
    if keys.just_pressed(KeyCode::KeyL) {
        let next = match locale.current().as_str() {
            "en-US" => "es-ES",
            "es-ES" => "ja-JP",
            _ => "en-US",
        };
        locale.set(next);
        info!("Locale switched to {}", next);
    }
}
```

### Combining Accessibility + i18n

When you localize UI text, update accessibility nodes too:

```rust
fn update_button_a11y(
    localization: Res<Localization>,
    mut query: Query<(&mut Text, &mut AccessibilityNode), With<StartButton>>,
) {
    if let Some(label) = localization.content("start-game") {
        for (mut text, mut a11y) in &mut query {
            *text = Text::new(label.clone());
            // Keep screen reader label in sync with visible text
            *a11y = AccessibilityNode::from(
                NodeBuilder::new(Role::Button).set_name(label)
            );
        }
    }
}
```

---

## Ownership Gotchas

- **`String` vs `&str` in Fluent:** Fluent's `content()` returns owned `String`s. When passing to `Text::new()` this is fine (it accepts `impl Into<String>`), but be mindful of allocations in hot loops — cache translated strings in a resource if they don't change every frame.
- **`AccessibilityNode` is not `Clone`:** You can't cheaply duplicate it. Build new nodes from `NodeBuilder` when you need to update.

---

## Recommended Crates

| Crate | Version | Purpose |
|-------|---------|---------|
| `bevy_fluent` | 0.13 | Fluent-based localization with Bevy asset integration |
| `bevy_simple_i18n` | latest | Compile-time i18n via `rust-i18n` macros |
| `accesskit` | (bundled) | OS accessibility primitives — included via `bevy_a11y` |
| `sys-locale` | latest | Detect OS locale at runtime for default language selection |
