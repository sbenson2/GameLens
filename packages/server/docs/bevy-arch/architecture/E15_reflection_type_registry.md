# Reflection & Type Registry

> **Category:** architecture · **Engine:** Bevy 0.18 · **Related:** [E4 Scenes & Serialization](E4_scenes_animation_serialization.md), [E6 Testing & Debugging](E6_testing_and_debugging.md), [G8 Save/Load](../guides/G8_save_load_persistence.md)

Bevy's reflection system (`bevy_reflect`) provides runtime introspection — accessing struct fields by name, serializing arbitrary components, and calling trait methods without compile-time type knowledge. It powers scenes, the inspector, save/load, and editor tooling.

---

## Why Reflection Matters in Game Dev

Rust's type system is entirely compile-time. Games need runtime flexibility for: loading scenes from files, inspecting entities in debug tools, serializing save games, and building modding/scripting systems. `bevy_reflect` bridges this gap.

---

## Deriving Reflect

Add `#[derive(Reflect)]` to make a type introspectable. All fields must also implement `Reflect` (most Bevy and standard types already do):

```rust
use bevy::prelude::*;

#[derive(Component, Reflect)]
#[reflect(Component)]  // Tells Bevy this Reflect type is a Component
struct Health {
    current: f32,
    max: f32,
}

#[derive(Resource, Reflect)]
#[reflect(Resource)]
struct GameConfig {
    difficulty: u32,
    player_name: String,
}
```

The derive macro generates implementations for:
- `Reflect` — core trait for runtime introspection and downcasting
- `GetTypeRegistration` — allows registering in the type registry
- `Typed` — compile-time type metadata
- `FromReflect` — reconstructing concrete types from reflected data
- Structural traits (`Struct`, `TupleStruct`, or `Enum` as appropriate)

---

## Registering Types

Types must be registered with the `App` so the runtime type registry knows about them:

```rust
fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .register_type::<Health>()
        .register_type::<GameConfig>()
        .run();
}
```

Components and resources that derive `Reflect` with `#[reflect(Component)]` or `#[reflect(Resource)]` are auto-registered when added to the world. Standalone types (not attached to entities) need manual `.register_type::<T>()`.

---

## Dynamic Field Access

Reflected structs expose fields by name at runtime:

```rust
fn inspect_health(health: &dyn Reflect) {
    // Access as a Struct
    if let Some(s) = health.as_struct() {
        if let Some(current) = s.field("current") {
            if let Some(val) = current.try_downcast_ref::<f32>() {
                info!("Current health: {val}");
            }
        }
    }
}

fn modify_health(health: &mut dyn Reflect) {
    if let Some(s) = health.as_struct_mut() {
        if let Some(field) = s.field_mut("current") {
            if let Some(val) = field.try_downcast_mut::<f32>() {
                *val = 100.0;
            }
        }
    }
}
```

### Path-Based Access

For nested structs, use reflection paths:

```rust
#[derive(Reflect)]
struct Player {
    stats: Stats,
}

#[derive(Reflect)]
struct Stats {
    health: f32,
    mana: f32,
}

fn read_nested(player: &dyn Reflect) {
    // Access nested field via path string
    let health = player.reflect_path("stats.health").unwrap();
    info!("Health: {:?}", health.try_downcast_ref::<f32>());
}
```

---

## Serialization with Reflection

Bevy serializes reflected types to RON (Rusty Object Notation), the default scene format:

```rust
use bevy::reflect::serde::{ReflectSerializer, ReflectDeserializer};

fn serialize_to_ron(value: &dyn Reflect, registry: &TypeRegistry) -> String {
    let serializer = ReflectSerializer::new(value, registry);
    ron::ser::to_string_pretty(&serializer, ron::ser::PrettyConfig::default()).unwrap()
}

fn deserialize_from_ron(ron_str: &str, registry: &TypeRegistry) -> Box<dyn Reflect> {
    let mut deserializer = ron::Deserializer::from_str(ron_str).unwrap();
    let reflect_deserializer = ReflectDeserializer::new(registry);
    reflect_deserializer.deserialize(&mut deserializer).unwrap()
}
```

This is what powers `.scn.ron` scene files — each component is serialized through reflection, no manual `Serialize`/`Deserialize` implementations needed.

---

## Trait Reflection

You can make custom traits accessible through reflection with `#[reflect_trait]`:

```rust
use bevy::reflect::reflect_trait;

#[reflect_trait]
trait Damageable {
    fn take_damage(&mut self, amount: f32);
    fn is_alive(&self) -> bool;
}

#[derive(Component, Reflect)]
#[reflect(Component, Damageable)]  // Register the trait reflection
struct Enemy {
    health: f32,
}

impl Damageable for Enemy {
    fn take_damage(&mut self, amount: f32) {
        self.health -= amount;
    }
    fn is_alive(&self) -> bool {
        self.health > 0.0
    }
}
```

At runtime, you can call trait methods on `dyn Reflect` objects through the type registry:

```rust
fn damage_any_entity(
    world: &mut World,
    entity: Entity,
    amount: f32,
) {
    let registry = world.resource::<AppTypeRegistry>().clone();
    let registry = registry.read();

    // Look up the concrete type's ReflectDamageable
    // This enables calling trait methods without knowing the concrete type
    // Useful for scripting, editor tools, and modding systems
}
```

---

## Handling Non-Reflect Fields

If a field's type doesn't implement `Reflect` (common with third-party crates), you have several options:

```rust
// Option 1: Ignore the field (it won't serialize or appear in reflection)
#[derive(Reflect)]
struct MyComponent {
    name: String,
    #[reflect(ignore)]
    internal_handle: SomeOpaqueType,
}

// Option 2: Provide a default (field is reconstructed with Default on deserialization)
#[derive(Reflect)]
struct MyComponent2 {
    name: String,
    #[reflect(default)]
    cached_value: SomeOpaqueType,
}

// Option 3: Opaque wrapper with serde
#[derive(Reflect, Serialize, Deserialize)]
#[reflect(opaque)]
#[reflect(Serialize, Deserialize)]
struct MoneyAmount(rust_decimal::Decimal);
```

---

## Practical Uses in Game Development

### Debug Inspector
The `bevy-inspector-egui` crate uses reflection to display and edit every registered component at runtime — no per-type UI code needed.

### Scene Files
`.scn.ron` files are serialized entities + components via reflection. Drop a scene file in `assets/` and load it:
```rust
fn load_scene(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn(DynamicSceneRoot(asset_server.load("levels/level1.scn.ron")));
}
```

### Save Games
Serialize the entire world (or a subset) to RON, then deserialize to restore state. Reflection handles the type mapping automatically.

### Hot Reloading
Reflection enables patching live component values without recompilation — change a field in a `.ron` file and see it update in real time.

---

## Rust Ownership Gotchas

**`AppTypeRegistry` is a resource with interior mutability.** Accessing it requires a read lock:

```rust
fn use_registry(registry: Res<AppTypeRegistry>) {
    let registry = registry.read();  // Returns a RwLockReadGuard
    // Use registry here — the lock is held until guard drops
}
```

**Don't hold the lock across system boundaries** — if you need the registry in multiple systems, clone the `AppTypeRegistry` (it's `Arc`-backed) and lock independently.

**`#[reflect(ignore)]` fields are skipped during cloning and serialization.** If your component has ignored fields with important state, implement custom `FromReflect` or use `#[reflect(default)]` with a meaningful `Default` implementation.

---

## Cargo Dependencies

```toml
[dependencies]
bevy = { version = "0.18", features = ["default"] }
# bevy_reflect is included in default Bevy. For standalone use:
# bevy_reflect = "0.18"

# Optional — for RON scene serialization
ron = "0.8"
```
