# G29 — Prefabs and Archetypes

> **Category:** Guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G20 Scene Management](./G20_scene_management_composition.md) · [Stride Architecture Rules](../stride-arch-rules.md)

Stride's prefab system lets you define reusable entity templates in the editor and instantiate them at runtime from C#. This guide covers creating prefabs in Game Studio, nesting prefabs, overriding properties per-instance, runtime instantiation and pooling, and architectural patterns for building modular game content.

---

## Table of Contents

1. [What Is a Prefab?](#1--what-is-a-prefab)
2. [Creating Prefabs in Game Studio](#2--creating-prefabs-in-game-studio)
3. [Using Prefab Instances in Scenes](#3--using-prefab-instances-in-scenes)
4. [Nested Prefabs](#4--nested-prefabs)
5. [Property Overrides](#5--property-overrides)
6. [Runtime Instantiation from C#](#6--runtime-instantiation-from-c)
7. [Prefab Pooling Pattern](#7--prefab-pooling-pattern)
8. [Prefab vs Scene — When to Use Each](#8--prefab-vs-scene--when-to-use-each)
9. [Archetype Pattern with Prefabs](#9--archetype-pattern-with-prefabs)
10. [Common Pitfalls](#10--common-pitfalls)

---

## 1 — What Is a Prefab?

A prefab is a reusable template for one or more entities, stored as an asset (`.sdprefab`). When you modify the prefab, every instance in every scene inherits the change — unless the instance has explicit overrides. Prefabs are Stride's primary tool for building modular, maintainable content.

### Key Properties

- A single prefab can contain **multiple entities** in a hierarchy.
- Prefabs can be **nested**: a "Room" prefab can contain "Furniture" prefabs.
- Instances can **override** any property without breaking the link to the master prefab.
- At runtime, `Prefab.Instantiate()` returns a `List<Entity>`, not a single entity.

---

## 2 — Creating Prefabs in Game Studio

### From an Existing Entity

1. Select one or more entities in the **Scene Editor**.
2. Right-click → **Create prefab from selection**.
3. Game Studio creates a `.sdprefab` asset in your Assets folder.
4. The original entities are replaced with a **prefab instance** linked to the new asset.

### From Scratch

1. In the **Asset View**, right-click → **New Asset → Prefab**.
2. Double-click the prefab to open it in the **Prefab Editor** (a dedicated scene-like view).
3. Add entities, components, and scripts inside the prefab editor.
4. Save (Ctrl+S). The prefab is ready to use.

### Prefab Editor vs Scene Editor

The prefab editor looks like the scene editor but operates on the prefab asset directly. Changes here propagate to all instances. The scene editor shows instances with their overrides.

---

## 3 — Using Prefab Instances in Scenes

Drag a `.sdprefab` asset from the Asset View into the Scene Editor. Stride creates an instance with a visual link indicator. Instance entities appear slightly grayed in the hierarchy to indicate they are prefab-managed.

**Adding instances via the Property Grid:**

1. Select a parent entity in the scene.
2. In the Property Grid, click **Add component** → select a component, or drag the prefab directly as a child.

---

## 4 — Nested Prefabs

Prefabs can contain other prefabs, enabling compositional design.

```
HousePrefab
 ├── WallsEntity
 ├── RoofEntity
 ├── LivingRoomPrefab (nested)
 │    ├── TablePrefab (nested)
 │    ├── ChairPrefab (nested)
 │    └── LampEntity
 └── KitchenPrefab (nested)
```

### Rules for Nesting

- There is **no depth limit** on nesting.
- Changes to an inner prefab propagate through all outer prefabs that use it.
- Overrides are **per-level**: the LivingRoomPrefab instance inside HousePrefab can override the table's scale without affecting the standalone TablePrefab.
- Circular nesting (A contains B contains A) is prevented by the editor.

---

## 5 — Property Overrides

When you modify a property on a prefab instance, the change becomes an **override** displayed in bold in the Property Grid. Overrides persist even when the master prefab is updated.

### Managing Overrides

- **Apply override to prefab:** Right-click the overridden property → **Apply to prefab base** to push the change back to the master.
- **Reset override:** Right-click → **Reset to prefab value** to discard the instance-specific change.
- **Break prefab link:** Right-click the instance root → **Break link to prefab** to turn it into standalone entities. This is destructive and cannot be undone easily.

### What Can Be Overridden

- Any `[DataMember]` property on any component (transform, materials, physics settings, custom data).
- Adding new components or child entities to an instance.
- Removing components or children is **not supported** — the override system is additive. To "hide" a child, disable its entity instead.

---

## 6 — Runtime Instantiation from C#

Instantiating a prefab at runtime returns a `List<Entity>` — not a single entity — because a prefab may contain multiple root entities.

```csharp
using Stride.Engine;

public class SpawnerScript : SyncScript
{
    /// <summary>Assign in the editor by dragging a .sdprefab asset.</summary>
    public Prefab EnemyPrefab;

    /// <summary>Spawn point transform.</summary>
    public Entity SpawnPoint;

    public override void Update()
    {
        if (Input.IsKeyPressed(Keys.Space) && EnemyPrefab != null)
        {
            // Instantiate returns List<Entity>
            List<Entity> entities = EnemyPrefab.Instantiate();

            // Position the root entity at the spawn point
            if (entities.Count > 0 && SpawnPoint != null)
            {
                entities[0].Transform.Position =
                    SpawnPoint.Transform.WorldMatrix.TranslationVector;
            }

            // Add all entities to the current scene
            foreach (var entity in entities)
            {
                Entity.Scene.Entities.Add(entity);
            }
        }
    }
}
```

### Important Details

- **Scripts activate on scene add:** Any `SyncScript` or `AsyncScript` on the instantiated entities starts running as soon as they are added to `Entity.Scene.Entities`.
- **Physics bodies initialize:** Bepu/Bullet colliders are created when the entity enters the scene.
- **Entity references are new:** Each call to `Instantiate()` creates fresh entity instances. They do not share state with other instances.

---

## 7 — Prefab Pooling Pattern

For games that spawn and despawn frequently (bullets, particles, enemies), avoid the cost of `Instantiate()` by pre-creating a pool.

```csharp
public class PrefabPool
{
    private readonly Prefab _prefab;
    private readonly Scene _scene;
    private readonly Stack<List<Entity>> _available = new();

    public PrefabPool(Prefab prefab, Scene scene, int preloadCount = 10)
    {
        _prefab = prefab;
        _scene = scene;

        for (int i = 0; i < preloadCount; i++)
        {
            var entities = _prefab.Instantiate();
            // Disable so they don't update or render
            foreach (var e in entities)
                e.EnableAll(false, true);
            foreach (var e in entities)
                _scene.Entities.Add(e);
            _available.Push(entities);
        }
    }

    /// <summary>Get an instance from the pool (or create a new one).</summary>
    public List<Entity> Get()
    {
        List<Entity> entities;
        if (_available.Count > 0)
        {
            entities = _available.Pop();
            foreach (var e in entities)
                e.EnableAll(true, true);
        }
        else
        {
            entities = _prefab.Instantiate();
            foreach (var e in entities)
                _scene.Entities.Add(e);
        }
        return entities;
    }

    /// <summary>Return an instance to the pool.</summary>
    public void Return(List<Entity> entities)
    {
        foreach (var e in entities)
            e.EnableAll(false, true);
        _available.Push(entities);
    }
}
```

> **Note:** This is a simplified pattern. Production code should handle entity removal, pool size limits, and physics body resets.

---

## 8 — Prefab vs Scene — When to Use Each

| Use Case | Prefab | Scene |
|----------|--------|-------|
| Reusable game object (enemy, pickup, weapon) | ✅ | |
| Modular level piece (room, corridor) | ✅ | |
| Entire game level | | ✅ |
| UI screen or overlay | Depends on complexity | ✅ for full screens |
| Shared across multiple scenes | ✅ | |
| Needs independent loading/streaming | | ✅ (child scene) |

**Rule of thumb:** Prefabs are for reusable content. Scenes are for unique, loadable spaces.

---

## 9 — Archetype Pattern with Prefabs

An "archetype" is a game design concept — a prefab used as a template for a category of game objects with shared base behaviour. This is not a built-in Stride feature but a useful organizational pattern.

### Folder Structure

```
Assets/
├── Prefabs/
│   ├── Enemies/
│   │   ├── EnemyBase.sdprefab       ← archetype
│   │   ├── EnemyGoblin.sdprefab     ← inherits + overrides
│   │   └── EnemyDragon.sdprefab     ← inherits + overrides
│   ├── Pickups/
│   │   ├── PickupBase.sdprefab
│   │   ├── PickupHealth.sdprefab
│   │   └── PickupAmmo.sdprefab
│   └── Weapons/
│       └── ...
```

### How to Implement

1. Create a **base prefab** (`EnemyBase`) with shared components: HealthComponent, NavAgentComponent, ModelComponent (placeholder mesh).
2. Create **variant prefabs** by dragging `EnemyBase` into a new prefab and then modifying it (override the model, adjust health values, add unique scripts).
3. Each variant is a nested prefab instance of the base, so changes to `EnemyBase` cascade to all variants.

This gives you inheritance-like behaviour without code — purely through the prefab override system.

---

## 10 — Common Pitfalls

**Expecting `Instantiate()` to return one entity**
A prefab can contain a hierarchy. Always handle `List<Entity>`. If you know your prefab has a single root, use `entities[0]` but check `Count` first.

**Modifying a prefab asset at runtime**
`Prefab.Instantiate()` clones from the asset. Changing the asset at runtime changes all future instantiations — this is rarely what you want. Modify the instantiated entities instead.

**Forgetting to add instantiated entities to a scene**
Until entities are added to `Entity.Scene.Entities`, they are invisible and their scripts do not run. Physics bodies are not created.

**Breaking prefab links accidentally**
Once you break a prefab link, the entities become standalone. This is hard to undo. Use overrides instead of breaking links.

**Deep nesting performance**
While there is no depth limit, very deep nesting (10+ levels) can make the editor slower and overrides harder to reason about. Keep nesting to 2–3 levels for maintainability.
