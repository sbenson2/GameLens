# E4 — Scenes, Animation & Serialization

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](E1_ecs_fundamentals.md) · [G3 Assets & Audio](../guides/G3_assets_and_audio.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy provides built-in systems for saving/loading game state via **scenes** and for skeletal/procedural animation via **AnimationGraph** and **AnimationPlayer**. Both lean heavily on `bevy_reflect` for serialization and on the ECS for runtime composition.

---

## Scenes & Serialization

### What Is a Scene?

A scene is a serialized snapshot of entities and their components. Bevy supports two scene types:

| Type | Use case |
|------|----------|
| `Scene` | Static, pre-baked hierarchy (e.g. a level prefab) — cloned from existing entities |
| `DynamicScene` | Serializable at runtime — can be saved to and loaded from `.scn.ron` files |

### Scene File Format (RON)

Bevy uses **Rusty Object Notation (RON)** for scene files. A typical `.scn.ron` file:

```ron
(
  resources: {},
  entities: {
    4294967299: (
      components: {
        "game::Player": (
          name: "Hero",
          health: 100,
        ),
        "bevy_transform::components::transform::Transform": (
          translation: (0.0, 1.0, 0.0),
          rotation: (0.0, 0.0, 0.0, 1.0),
          scale: (1.0, 1.0, 1.0),
        ),
      },
    ),
  },
)
```

### Registering Types for Reflection

Components must derive `Reflect` and be registered for scene serialization to work:

```rust
use bevy::prelude::*;

#[derive(Component, Reflect, Default)]
#[reflect(Component)]
struct Player {
    name: String,
    health: i32,
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .register_type::<Player>()  // Required for scene serialization
        .run();
}
```

> **Rust gotcha — orphan rule:** You cannot derive `Reflect` on third-party types. Use wrapper newtypes or `#[reflect(from_reflect = false)]` when needed.

### Saving a Scene at Runtime

```rust
use bevy::prelude::*;

fn save_scene(world: &World) {
    // Build a DynamicScene from selected entities
    let scene = DynamicSceneBuilder::from_world(world)
        .allow::<Player>()
        .allow::<Transform>()
        .extract_entities(world.iter_entities().map(|e| e.id()))
        .build();

    // Serialize to RON
    let type_registry = world.resource::<AppTypeRegistry>().read();
    let serialized = scene
        .serialize(&type_registry)
        .expect("Failed to serialize scene");

    // Write to file (in a real game, use async I/O)
    std::fs::write("save.scn.ron", serialized.to_string())
        .expect("Failed to write scene file");
}
```

### Loading & Spawning a Scene

```rust
fn load_scene(mut commands: Commands, asset_server: Res<AssetServer>) {
    // DynamicSceneRoot triggers automatic deserialization + spawning
    commands.spawn(DynamicSceneRoot(
        asset_server.load("scenes/my_level.scn.ron"),
    ));
}

// Listen for scene load completion
fn on_scene_ready(
    mut events: EventReader<SceneInstanceReady>,
) {
    for event in events.read() {
        println!("Scene spawned on entity {:?}", event.parent);
    }
}
```

### Scene Gotchas

- **Missing registrations:** If a component type isn't registered with `register_type::<T>()`, it will be silently skipped during deserialization.
- **Entity IDs are not stable** across save/load — use a custom `SaveId` component if you need cross-session identity.
- **Resources** can be included in `DynamicScene` via the builder, but only if they also implement `Reflect`.

---

## Animation System

### Architecture

Bevy's animation system (Bevy 0.18) is built on three core types:

| Type | Role |
|------|------|
| `AnimationClip` | A single animation containing curves for properties (transform, morph weights, etc.) |
| `AnimationGraph` | A DAG describing how clips blend together — evaluated bottom-up each frame |
| `AnimationPlayer` | Drives playback on an entity — plays nodes within the graph |

### AnimationGraph Structure

The graph is a **directed acyclic graph (DAG)** with three node types:

- **Clip nodes** — reference an `AnimationClip` asset plus a weight
- **Blend nodes** — combine children by weighted average
- **Add nodes** — layer child animations additively

Every frame, Bevy walks the graph from root to leaves, collecting weighted poses that blend into the final result.

### Loading Animations from glTF

Most Bevy projects load animations from `.gltf` / `.glb` files:

```rust
use bevy::prelude::*;

#[derive(Resource)]
struct Animations {
    graph: Handle<AnimationGraph>,
    node_indices: Vec<AnimationNodeIndex>,
}

fn setup_animated_character(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    // Load animation clips from a glTF file
    let idle = asset_server.load(GltfAssetLabel::Animation(0).from_asset("models/character.glb"));
    let walk = asset_server.load(GltfAssetLabel::Animation(1).from_asset("models/character.glb"));
    let run  = asset_server.load(GltfAssetLabel::Animation(2).from_asset("models/character.glb"));

    // Build a blend graph: root blends idle, walk, and run
    let (graph, node_indices) = AnimationGraph::from_clips([idle, walk, run]);

    let graph_handle = graphs.add(graph);

    commands.insert_resource(Animations {
        graph: graph_handle.clone(),
        node_indices,
    });

    // Spawn the scene — AnimationPlayer is added automatically by glTF loader
    commands.spawn(SceneRoot(
        asset_server.load(GltfAssetLabel::Scene(0).from_asset("models/character.glb")),
    ));
}
```

### Controlling Playback

```rust
fn control_animation(
    animations: Res<Animations>,
    mut players: Query<(&mut AnimationPlayer, &mut AnimationGraphHandle)>,
    input: Res<ButtonInput<KeyCode>>,
) {
    for (mut player, mut graph_handle) in &mut players {
        // Ensure our graph is assigned
        if graph_handle.0 != animations.graph {
            graph_handle.0 = animations.graph.clone();
        }

        if input.just_pressed(KeyCode::Digit1) {
            player.play(animations.node_indices[0]).repeat(); // idle
        }
        if input.just_pressed(KeyCode::Digit2) {
            player.play(animations.node_indices[1]).repeat(); // walk
        }
        if input.just_pressed(KeyCode::Digit3) {
            player.play(animations.node_indices[2]).repeat(); // run
        }
    }
}
```

### Procedural Animation (Code-Driven Clips)

You can build `AnimationClip` from code for procedural motion:

```rust
fn create_bounce_animation(
    mut commands: Commands,
    mut animations: ResMut<Assets<AnimationClip>>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    let mut clip = AnimationClip::default();

    // Add a translation curve (entity name must match hierarchy)
    clip.add_curve_to_target(
        AnimationTargetId::from_names(["Root"].iter()),
        AnimatableCurve::new(
            animated_field!(Transform::translation),
            EasingCurve::new(
                Vec3::ZERO,
                Vec3::new(0.0, 1.0, 0.0),
                EaseFunction::CubicInOut,
            )
            .ping_pong()
            .unwrap()
            .reparametrize_linear(interval(0.0, 1.0).unwrap())
            .unwrap(),
        ),
    );

    let (graph, index) = AnimationGraph::from_clip(animations.add(clip));

    // Spawn entity with animation
    commands.spawn((
        AnimationGraphHandle(graphs.add(graph)),
        AnimationPlayer::default(),
    ));
}
```

### Animation Events

Bevy 0.18 supports **animation events** — callbacks triggered at specific keyframes:

```rust
clip.add_event(0.5, PlaySound { clip: "footstep.ogg".into() });
```

Events fire as triggers when the playback cursor crosses the keyframe time.

---

## Combining Scenes + Animation

A common pattern: load a level as a `DynamicScene`, where animated entities carry `AnimationPlayer` components that reference pre-built `AnimationGraph` assets. On `SceneInstanceReady`, query for players and begin playback.

```rust
fn start_scene_animations(
    mut events: EventReader<SceneInstanceReady>,
    mut players: Query<&mut AnimationPlayer>,
) {
    for _event in events.read() {
        for mut player in &mut players {
            // Start the default animation on all players in the scene
            player.play(AnimationNodeIndex::default()).repeat();
        }
    }
}
```

---

## Key Cargo Dependencies

```toml
[dependencies]
bevy = "0.18"
```

Scenes and animation are part of `bevy`'s default features — no extra crates required.

---

## Further Reading

- [Official scene example](https://github.com/bevyengine/bevy/blob/main/examples/scene/scene.rs)
- [Animation graph example](https://github.com/bevyengine/bevy/blob/main/examples/animation/animation_graph.rs)
- [Bevy 0.18 release notes](https://bevy.org/news/bevy-0-18/)
