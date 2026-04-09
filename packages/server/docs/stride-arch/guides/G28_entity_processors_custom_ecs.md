# G28 — Entity Processors and Custom ECS Patterns

> **Category:** Guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G18 Scripting Patterns](./G18_scripting_patterns.md) · [Stride Architecture Rules](../stride-arch-rules.md)

A deep-dive into Stride's entity-component-processor architecture: creating custom EntityComponents, writing EntityProcessors to operate on them, the DefaultEntityComponentProcessor attribute for auto-registration, advanced TData patterns, and best practices for separating data from logic. This guide shows how to extend Stride's ECS beyond scripts for high-performance, data-driven systems.

---

## Table of Contents

1. [Stride's ECS Model](#1--strides-ecs-model)
2. [EntityComponent Basics](#2--entitycomponent-basics)
3. [EntityProcessor Fundamentals](#3--entityprocessor-fundamentals)
4. [Auto-Registration with DefaultEntityComponentProcessor](#4--auto-registration-with-defaultentitycomponentprocessor)
5. [Requiring Multiple Components](#5--requiring-multiple-components)
6. [EntityProcessor with Custom TData](#6--entityprocessor-with-custom-tdata)
7. [Managing Processor Lifecycle](#7--managing-processor-lifecycle)
8. [Manual Processor Registration](#8--manual-processor-registration)
9. [Script vs Processor — When to Use Each](#9--script-vs-processor--when-to-use-each)
10. [Building a Custom Damage System (Worked Example)](#10--building-a-custom-damage-system-worked-example)
11. [Performance Considerations](#11--performance-considerations)
12. [Common Pitfalls](#12--common-pitfalls)

---

## 1 — Stride's ECS Model

Stride uses a hybrid entity-component-system. Entities are containers of components, and **EntityProcessors** run each frame to update entities that match specific component requirements. Unlike pure ECS frameworks (like Arch or Flecs), Stride components can contain both data and behaviour. However, best practice for performance-critical systems is to separate data (components) from logic (processors).

### Architecture Overview

```
Entity
 ├── TransformComponent (built-in)
 ├── ModelComponent (built-in)
 ├── CustomHealthComponent (your data)
 └── ... more components

EntityProcessor<CustomHealthComponent>
 └── Update() → iterates all entities with CustomHealthComponent
```

When an entity with the right set of components is added to a scene, Stride's `SceneInstance` automatically routes it to the matching processor(s).

---

## 2 — EntityComponent Basics

Every custom component derives from `EntityComponent` and carries data fields.

```csharp
using Stride.Core;
using Stride.Engine;
using Stride.Engine.Design;

[DataContract("HealthComponent")]
[DefaultEntityComponentProcessor(typeof(HealthProcessor),
    ExecutionMode = ExecutionMode.Runtime)]
[ComponentCategory("Gameplay")]
public class HealthComponent : EntityComponent
{
    /// <summary>Maximum hit points for this entity.</summary>
    [DataMember(10)]
    public float MaxHealth { get; set; } = 100f;

    /// <summary>Current hit points (clamped to 0..MaxHealth at runtime).</summary>
    [DataMember(20)]
    public float CurrentHealth { get; set; } = 100f;

    /// <summary>Passive regeneration per second. Set to 0 to disable.</summary>
    [DataMember(30)]
    public float RegenPerSecond { get; set; } = 0f;

    /// <summary>Runtime flag — not serialized, set by processor.</summary>
    [DataMemberIgnore]
    public bool IsDead { get; set; }
}
```

### Key Attributes

| Attribute | Purpose |
|-----------|---------|
| `[DataContract]` | Enables serialization so the editor can save/load this component. The string argument is the serialization alias. |
| `[DefaultEntityComponentProcessor]` | Links this component to its processor. Stride auto-creates the processor when the component is in a scene. |
| `[ComponentCategory]` | Groups the component in the editor's "Add Component" menu. |
| `[DataMember(order)]` | Controls serialization order and makes the field visible in the editor property grid. |
| `[DataMemberIgnore]` | Excludes a property from serialization (runtime-only state). |

### ExecutionMode Options

- `ExecutionMode.Runtime` — processor runs only during gameplay
- `ExecutionMode.Editor` — processor runs in the editor (useful for gizmos or preview)
- `ExecutionMode.All` — runs in both contexts

---

## 3 — EntityProcessor Fundamentals

An `EntityProcessor<TComponent>` runs once per frame and iterates every entity that has `TComponent`.

```csharp
using Stride.Engine;
using Stride.Games;

public class HealthProcessor : EntityProcessor<HealthComponent>
{
    /// <summary>
    /// Called every frame for each entity with a HealthComponent.
    /// </summary>
    public override void Update(GameTime time)
    {
        float dt = (float)time.Elapsed.TotalSeconds;

        foreach (var kvp in ComponentDatas)
        {
            HealthComponent health = kvp.Key;

            // Passive regeneration
            if (health.RegenPerSecond > 0f && !health.IsDead)
            {
                health.CurrentHealth = Math.Min(
                    health.CurrentHealth + health.RegenPerSecond * dt,
                    health.MaxHealth
                );
            }

            // Clamp and check death
            health.CurrentHealth = Math.Clamp(health.CurrentHealth, 0f, health.MaxHealth);
            health.IsDead = health.CurrentHealth <= 0f;
        }
    }
}
```

### Processor Lifecycle Methods

| Method | When It Runs |
|--------|-------------|
| `Update(GameTime)` | Every frame — your main logic loop. |
| `OnEntityComponentAdding(Entity, TComponent, TData)` | When a matching entity enters the scene (or a component is added at runtime). |
| `OnEntityComponentRemoved(Entity, TComponent, TData)` | When a matching entity leaves the scene (or a component is removed). |
| `OnSystemAdd()` | When the processor itself is first added to the SceneInstance. |
| `OnSystemRemove()` | When the processor is removed from the SceneInstance. |

---

## 4 — Auto-Registration with DefaultEntityComponentProcessor

The `[DefaultEntityComponentProcessor]` attribute is the standard way to wire components to processors. When Stride loads a scene containing a component decorated with this attribute, it automatically instantiates and registers the processor.

```csharp
[DefaultEntityComponentProcessor(typeof(HealthProcessor),
    ExecutionMode = ExecutionMode.Runtime)]
public class HealthComponent : EntityComponent { /* ... */ }
```

**How it works internally:**

1. Scene loads → `SceneInstance` scans all entities for their components.
2. For each component type, Stride checks for `DefaultEntityComponentProcessor`.
3. If found and the processor isn't already registered, Stride creates it and calls `OnSystemAdd()`.
4. The processor's `Update()` is called every frame by the `SceneSystem`.

---

## 5 — Requiring Multiple Components

A processor can require that entities have additional components beyond the primary one. Pass required types to the base constructor.

```csharp
public class DamageFlashProcessor : EntityProcessor<DamageFlashComponent>
{
    /// <summary>
    /// Only processes entities that have BOTH DamageFlashComponent
    /// AND ModelComponent.
    /// </summary>
    public DamageFlashProcessor()
        : base(typeof(ModelComponent))
    {
    }

    public override void Update(GameTime time)
    {
        foreach (var kvp in ComponentDatas)
        {
            DamageFlashComponent flash = kvp.Key;
            Entity entity = flash.Entity;

            // Safe to access — Stride guarantees ModelComponent exists
            var model = entity.Get<ModelComponent>();

            // Apply flash effect to model materials...
        }
    }
}
```

### Rules for Required Components

- The primary component (`TComponent`) is always required.
- Additional requirements are passed as `Type` arguments to the constructor.
- An entity is tracked by the processor **only if all required components are present**.
- If a required component is removed at runtime, the entity is automatically removed from the processor.

---

## 6 — EntityProcessor with Custom TData

For advanced scenarios, use `EntityProcessor<TComponent, TData>` to associate custom per-entity data with each tracked component.

```csharp
/// <summary>Cached data generated per entity by the processor.</summary>
public class BoidData
{
    public Vector3 Velocity;
    public Vector3 Acceleration;
    public List<Entity> Neighbors;

    public BoidData()
    {
        Neighbors = new List<Entity>();
    }
}

public class BoidProcessor : EntityProcessor<BoidComponent, BoidData>
{
    public BoidProcessor()
        : base(typeof(TransformComponent))
    {
    }

    /// <summary>
    /// Called when an entity first matches this processor.
    /// Return a TData instance to associate with it.
    /// </summary>
    protected override BoidData GenerateComponentData(
        Entity entity, BoidComponent component)
    {
        return new BoidData();
    }

    /// <summary>
    /// Return true if the cached data still matches the component.
    /// Return false to force re-generation via GenerateComponentData.
    /// </summary>
    protected override bool IsAssociatedDataValid(
        Entity entity, BoidComponent component, BoidData data)
    {
        return data != null;
    }

    public override void Update(GameTime time)
    {
        float dt = (float)time.Elapsed.TotalSeconds;

        // Phase 1: Find neighbors for each boid
        foreach (var kvp in ComponentDatas)
        {
            BoidComponent boid = kvp.Key;
            BoidData data = kvp.Value;
            var position = boid.Entity.Transform.WorldMatrix.TranslationVector;

            data.Neighbors.Clear();
            foreach (var other in ComponentDatas)
            {
                if (other.Key == boid) continue;
                var otherPos = other.Key.Entity.Transform.WorldMatrix
                    .TranslationVector;
                if (Vector3.Distance(position, otherPos) < boid.NeighborRadius)
                    data.Neighbors.Add(other.Key.Entity);
            }
        }

        // Phase 2: Apply flocking rules and update positions
        foreach (var kvp in ComponentDatas)
        {
            BoidComponent boid = kvp.Key;
            BoidData data = kvp.Value;
            // ... apply separation, alignment, cohesion using data.Neighbors
        }
    }
}
```

### When to Use Custom TData

- When the processor needs to cache derived or computed state per entity (e.g., spatial hashes, AI state machines, cached lookups).
- When the data is runtime-only and should not be serialized with the component.
- When the same component data maps to different processor states depending on context.

---

## 7 — Managing Processor Lifecycle

Use `OnEntityComponentAdding` and `OnEntityComponentRemoved` for setup/teardown of per-entity resources.

```csharp
public class AudioZoneProcessor : EntityProcessor<AudioZoneComponent>
{
    private readonly Dictionary<AudioZoneComponent, AudioEmitter> _emitters = new();

    protected override void OnEntityComponentAdding(
        Entity entity,
        AudioZoneComponent component,
        AudioZoneComponent data)
    {
        // Create an audio emitter when the component enters the scene
        var emitter = new AudioEmitter();
        _emitters[component] = emitter;
    }

    protected override void OnEntityComponentRemoved(
        Entity entity,
        AudioZoneComponent component,
        AudioZoneComponent data)
    {
        // Clean up when the component leaves
        if (_emitters.TryGetValue(component, out var emitter))
        {
            emitter.Dispose();
            _emitters.Remove(component);
        }
    }
}
```

---

## 8 — Manual Processor Registration

Sometimes you need a processor that is not tied to a specific component, or you want to register it conditionally.

```csharp
// In a startup script or game service:
var sceneInstance = SceneSystem.SceneInstance;

// Add the processor manually
var myProcessor = new GlobalWeatherProcessor();
sceneInstance.Processors.Add(myProcessor);

// Later, remove it if needed
sceneInstance.Processors.Remove(myProcessor);
```

**Use cases for manual registration:**

- Global systems that don't need a component (e.g., day/night cycle, weather).
- Debug or profiling processors enabled by a runtime flag.
- Processors that depend on configuration loaded after scene init.

---

## 9 — Script vs Processor — When to Use Each

| Criterion | Script (SyncScript/AsyncScript) | EntityProcessor |
|-----------|--------------------------------|-----------------|
| **Scope** | Per-entity behaviour | System-wide iteration |
| **Best for** | Unique logic (player controller, boss AI) | Batch updates (health regen, flocking, spawners) |
| **Data access** | Direct via `Entity.Get<T>()` | Batch via `ComponentDatas` dictionary |
| **Performance** | Virtual call per entity per frame | One `Update()` call processes all matching entities |
| **Editor setup** | Drag script onto entity | Automatic via `DefaultEntityComponentProcessor` |
| **State** | Lives in the script instance | Lives in component + optional TData |

**Rule of thumb:** if three or more entities run the same logic every frame, consider an EntityProcessor.

---

## 10 — Building a Custom Damage System (Worked Example)

This example ties together components, processors, and scripts.

### Step 1: Data Components

```csharp
[DataContract("DamageReceiver")]
[DefaultEntityComponentProcessor(typeof(DamageProcessor),
    ExecutionMode = ExecutionMode.Runtime)]
[ComponentCategory("Combat")]
public class DamageReceiverComponent : EntityComponent
{
    [DataMember(10)] public float MaxHealth { get; set; } = 100f;
    [DataMember(20)] public float Armor { get; set; } = 0f;

    [DataMemberIgnore] public float CurrentHealth { get; set; }
    [DataMemberIgnore] public readonly Queue<DamageEvent> PendingDamage = new();
}

public struct DamageEvent
{
    public float Amount;
    public Entity Source;
    public DamageType Type;
}

public enum DamageType { Physical, Fire, Ice }
```

### Step 2: Processor

```csharp
public class DamageProcessor : EntityProcessor<DamageReceiverComponent>
{
    protected override void OnEntityComponentAdding(
        Entity entity,
        DamageReceiverComponent component,
        DamageReceiverComponent data)
    {
        component.CurrentHealth = component.MaxHealth;
    }

    public override void Update(GameTime time)
    {
        foreach (var kvp in ComponentDatas)
        {
            var receiver = kvp.Key;
            while (receiver.PendingDamage.TryDequeue(out var dmg))
            {
                float effective = dmg.Type switch
                {
                    DamageType.Physical => Math.Max(0, dmg.Amount - receiver.Armor),
                    DamageType.Fire => dmg.Amount * 1.5f, // fire ignores armor
                    DamageType.Ice => dmg.Amount * 0.75f,
                    _ => dmg.Amount,
                };
                receiver.CurrentHealth -= effective;
            }
            receiver.CurrentHealth = Math.Clamp(
                receiver.CurrentHealth, 0f, receiver.MaxHealth);
        }
    }
}
```

### Step 3: Inflicting Damage from a Script

```csharp
public class ProjectileScript : SyncScript
{
    public float Damage = 25f;
    public DamageType Type = DamageType.Physical;

    public override void Update()
    {
        // On collision (from Bepu contact event):
        // var hitEntity = collisionInfo.Entity;
        // var receiver = hitEntity.Get<DamageReceiverComponent>();
        // if (receiver != null)
        // {
        //     receiver.PendingDamage.Enqueue(new DamageEvent
        //     {
        //         Amount = Damage,
        //         Source = Entity,
        //         Type = Type,
        //     });
        // }
    }
}
```

This pattern keeps the damage calculation deterministic and centralized in the processor, while scripts only enqueue events.

---

## 11 — Performance Considerations

- **Batch over per-entity:** A single processor iterating 500 entities is faster than 500 individual script updates due to reduced virtual dispatch overhead.
- **Avoid allocations in Update:** Pre-allocate lists and buffers in `OnSystemAdd()` or `GenerateComponentData()`.
- **Use TData for caches:** Instead of re-computing spatial queries every frame, cache results in TData.
- **Processor ordering:** Processors run in registration order. If processor B depends on results from processor A, ensure A is registered first (usually handled automatically by component load order).
- **Conditional processing:** Check a bool flag or timestamp in your component to skip entities that don't need updating this frame.

---

## 12 — Common Pitfalls

**Forgetting `[DataContract]`**
Without this attribute, the component won't serialize. It will work at runtime from code but won't appear in the editor or save with the scene.

**Modifying ComponentDatas during iteration**
Don't add or remove entities from the scene inside `Update()` while iterating `ComponentDatas`. Queue changes and apply them after the loop, or use `OnEntityComponentAdding`/`Removed`.

**Circular processor dependencies**
If Processor A reads state that Processor B writes, and vice versa, you'll get frame-delay bugs. Design a clear data flow direction.

**Using `Entity.Get<T>()` in processor hot loops**
`Entity.Get<T>()` does a linear scan of the entity's components. If you need another component frequently, require it in the constructor and cache it in TData.
