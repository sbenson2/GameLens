# G77 — ECS Event & Messaging Systems

> **Category:** guide · **Engine:** MonoGame · **Related:** [G10 Custom Game Systems](./G10_custom_game_systems.md) · [G12 Design Patterns](./G12_design_patterns.md) · [G18 Game Programming Patterns](./G18_game_programming_patterns.md) · [G4 AI Systems](./G4_ai_systems.md) · [G64 Combat & Damage](./G64_combat_damage_systems.md) · [G67 Object Pooling](./G67_object_pooling.md)

How to decouple ECS systems using event channels, tag components, and deferred command buffers in MonoGame + Arch ECS. Covers fire-and-forget events, request/response patterns, event queuing, and frame-safe event consumption — all without breaking the pure-data ECS contract.

---

## The Problem: System-to-System Communication

In a pure ECS architecture, systems should not reference each other directly. But game logic constantly requires cross-system communication:

- A combat system deals damage → the audio system plays a hit sound
- A pickup system collects a coin → the UI system updates the score display
- An AI system detects the player → the alert system triggers a warning

Without an event mechanism, you end up with one of these anti-patterns:

```
❌ Systems calling each other directly (tight coupling)
❌ Giant "god systems" that handle everything (monolith)
❌ Shared mutable state that multiple systems read/write (race conditions)
```

---

## Strategy 1: Tag Components as Events

The simplest ECS-native event pattern. Create zero-size structs as "event tags" and add them to entities. Consumer systems query for the tag, process the event, then remove the tag.

### Event Definition

```csharp
// Zero-size tag components — no heap allocation, no data
public struct DamageDealtEvent;
public struct ItemPickedUpEvent;
public struct EnemyAlertedEvent;
public struct EntityDestroyedEvent;
```

### Producer System (adds the tag)

```csharp
public partial class CombatSystem : BaseSystem<World, float>
{
    public CombatSystem(World world) : base(world) { }

    [Query]
    [All<Health, IncomingDamage>]
    public void ApplyDamage(Entity entity, ref Health hp, ref IncomingDamage dmg)
    {
        hp.Current -= dmg.Amount;

        // Signal that damage was dealt — other systems will react
        World.Add<DamageDealtEvent>(entity);

        // Clean up the incoming damage request
        World.Remove<IncomingDamage>(entity);
    }
}
```

### Consumer System (reacts to the tag)

```csharp
public partial class DamageVfxSystem : BaseSystem<World, float>
{
    public DamageVfxSystem(World world) : base(world) { }

    [Query]
    [All<DamageDealtEvent, Position, SpriteRenderer>]
    public void SpawnHitEffect(Entity entity, ref Position pos, ref SpriteRenderer sprite)
    {
        // Flash the sprite white for one frame
        sprite.Tint = Color.White;

        // Spawn a particle burst at the damage location
        SpawnParticles(pos.X, pos.Y, particleCount: 8);
    }

    public override void AfterUpdate(in float dt)
    {
        // Clean up all event tags after processing
        var query = new QueryDescription().WithAll<DamageDealtEvent>();
        World.Remove<DamageDealtEvent>(query);
    }

    private void SpawnParticles(float x, float y, int particleCount) { /* ... */ }
}
```

### Pros and Cons

| Pros | Cons |
|------|------|
| Zero allocation — tag is a zero-size struct | Event lives only one frame (must be consumed before cleanup) |
| Fully ECS-native — uses queries, no special infrastructure | System execution order matters (producer before consumer) |
| Visible in entity inspector/debugger | Cannot carry data beyond what's already on the entity |
| Works with Arch's archetype chunking efficiently | Not suitable for events that don't target a specific entity |

---

## Strategy 2: Event Components with Data

When the event needs to carry payload beyond what's already on the entity, use a data-carrying event component.

```csharp
// Event component with payload
public record struct DamageEvent(int Amount, DamageType Type, Entity Source);
public record struct CollisionEvent(Entity Other, Vector2 ContactPoint, Vector2 Normal);
public record struct LevelUpEvent(int NewLevel, int SkillPointsGained);
```

### Producer

```csharp
[Query]
[All<Health, IncomingDamage>]
public void ApplyDamage(Entity entity, ref Health hp, ref IncomingDamage dmg)
{
    hp.Current -= dmg.Amount;

    // Attach event with full context for consumers
    World.Add(entity, new DamageEvent(
        Amount: dmg.Amount,
        Type: dmg.DamageType,
        Source: dmg.Attacker
    ));

    World.Remove<IncomingDamage>(entity);
}
```

### Consumer

```csharp
[Query]
[All<DamageEvent, Position>]
public void PlayDamageAudio(ref DamageEvent evt, ref Position pos)
{
    // Different sounds based on damage type
    var soundId = evt.Type switch
    {
        DamageType.Fire => "sfx_fire_hit",
        DamageType.Ice => "sfx_ice_hit",
        DamageType.Physical => "sfx_physical_hit",
        _ => "sfx_generic_hit"
    };

    AudioManager.PlayAtPosition(soundId, new Vector2(pos.X, pos.Y));
}
```

---

## Strategy 3: World-Level Event Queues

For events that are not tied to a specific entity (e.g., "level completed", "game paused", "wave started"), use a shared event queue stored as a World resource.

### Event Queue Implementation

```csharp
/// <summary>
/// Type-safe event queue. One instance per event type, stored as a World resource.
/// Events are buffered during the frame and consumed in the next system pass.
/// </summary>
public class EventQueue<T> where T : struct
{
    private readonly List<T> _current = new(16);
    private readonly List<T> _pending = new(16);

    /// <summary>Enqueue an event to be available next frame (or after Swap).</summary>
    public void Publish(T evt) => _pending.Add(evt);

    /// <summary>Read all events published last frame. Do not modify.</summary>
    public ReadOnlySpan<T> Read() => _current.AsSpan();

    /// <summary>True if there are events to consume this frame.</summary>
    public bool HasEvents => _current.Count > 0;

    /// <summary>Call once per frame to rotate buffers. Clears consumed events.</summary>
    public void Swap()
    {
        _current.Clear();
        // Swap references to avoid allocation
        _current.AddRange(_pending);
        _pending.Clear();
    }
}
```

### Registration as World Resource

```csharp
// During game initialization, register event queues
var world = World.Create();

// Create and store event queues as shared resources
var damageEvents = new EventQueue<GlobalDamageEvent>();
var waveEvents = new EventQueue<WaveEvent>();
var uiEvents = new EventQueue<UiNotification>();

// Store in a service container or pass to systems directly
```

### Event Swap System (runs first every frame)

```csharp
/// <summary>
/// Must execute FIRST in the system pipeline. Rotates all event queues
/// so that events published last frame become available for reading.
/// </summary>
public class EventSwapSystem : BaseSystem<World, float>
{
    private readonly EventQueue<GlobalDamageEvent> _damageEvents;
    private readonly EventQueue<WaveEvent> _waveEvents;
    private readonly EventQueue<UiNotification> _uiEvents;

    public EventSwapSystem(
        World world,
        EventQueue<GlobalDamageEvent> damageEvents,
        EventQueue<WaveEvent> waveEvents,
        EventQueue<UiNotification> uiEvents
    ) : base(world)
    {
        _damageEvents = damageEvents;
        _waveEvents = waveEvents;
        _uiEvents = uiEvents;
    }

    public override void Update(in float dt)
    {
        _damageEvents.Swap();
        _waveEvents.Swap();
        _uiEvents.Swap();
    }
}
```

### Publishing Events

```csharp
public class WaveSpawnerSystem : BaseSystem<World, float>
{
    private readonly EventQueue<WaveEvent> _waveEvents;

    public WaveSpawnerSystem(World world, EventQueue<WaveEvent> waveEvents)
        : base(world)
    {
        _waveEvents = waveEvents;
    }

    public override void Update(in float dt)
    {
        if (AllEnemiesDefeated())
        {
            _currentWave++;
            _waveEvents.Publish(new WaveEvent(
                WaveNumber: _currentWave,
                EnemyCount: CalculateEnemyCount(_currentWave),
                Type: WaveEventType.Started
            ));

            SpawnWaveEnemies(_currentWave);
        }
    }
}
```

### Consuming Events

```csharp
public class WaveUiSystem : BaseSystem<World, float>
{
    private readonly EventQueue<WaveEvent> _waveEvents;

    public WaveUiSystem(World world, EventQueue<WaveEvent> waveEvents)
        : base(world)
    {
        _waveEvents = waveEvents;
    }

    public override void Update(in float dt)
    {
        foreach (ref readonly var evt in _waveEvents.Read())
        {
            if (evt.Type == WaveEventType.Started)
                ShowWaveBanner($"Wave {evt.WaveNumber} — {evt.EnemyCount} enemies!");
        }
    }
}
```

---

## Strategy 4: Deferred Command Buffers

For structural changes (adding/removing entities or components) that cannot safely happen during a query iteration, use Arch's `CommandBuffer`:

```csharp
public partial class DeathSystem : BaseSystem<World, float>
{
    private readonly CommandBuffer _buffer;

    public DeathSystem(World world) : base(world)
    {
        _buffer = new CommandBuffer(world);
    }

    [Query]
    [All<Health, DamageDealtEvent>]
    public void CheckDeath(Entity entity, ref Health hp)
    {
        if (hp.Current <= 0)
        {
            // Don't destroy during iteration — buffer it
            _buffer.Add<EntityDestroyedEvent>(entity);
            _buffer.Destroy(entity);
        }
    }

    public override void AfterUpdate(in float dt)
    {
        // Apply all buffered commands after iteration is complete
        _buffer.Playback();
    }
}
```

### When to Use CommandBuffer vs Direct World Operations

| Scenario | Approach |
|----------|----------|
| Adding a tag during query iteration | `CommandBuffer.Add<T>(entity)` |
| Destroying entities during query | `CommandBuffer.Destroy(entity)` |
| Adding components outside of queries | `World.Add<T>(entity)` directly |
| Bulk operations in `AfterUpdate` | `World` operations are safe here |

---

## System Execution Order

Event-based communication requires careful system ordering. Events produced in one system must be consumed in a later system within the same frame (tag events) or the next frame (queue events).

```
Frame N execution order:
┌─────────────────────────────────────────────┐
│ 1. EventSwapSystem      (rotate queues)     │
│ 2. InputSystem          (produce input)     │
│ 3. AiSystem             (read perception)   │
│ 4. CombatSystem         (produce damage)    │◄─ adds DamageDealtEvent tag
│ 5. DeathSystem          (read damage)       │◄─ reads DamageDealtEvent, buffers destroy
│ 6. DamageVfxSystem      (read damage)       │◄─ reads DamageDealtEvent, spawns VFX
│ 7. DamageAudioSystem    (read damage)       │◄─ reads DamageDealtEvent, plays SFX
│ 8. EventCleanupSystem   (remove all tags)   │◄─ removes DamageDealtEvent from all
│ 9. PhysicsSystem        (movement)          │
│ 10. RenderSystem        (draw)              │
└─────────────────────────────────────────────┘
```

### Registering System Order in Arch

```csharp
// Build the system pipeline with explicit ordering
var pipeline = new World.CreateSystemGroup()
    .Add(new EventSwapSystem(world, damageEvents, waveEvents, uiEvents))
    .Add(new InputSystem(world))
    .Add(new AiSystem(world))
    .Add(new CombatSystem(world))
    .Add(new DeathSystem(world))
    .Add(new DamageVfxSystem(world))
    .Add(new DamageAudioSystem(world))
    .Add(new EventCleanupSystem(world))
    .Add(new PhysicsSystem(world))
    .Add(new RenderSystem(world))
    .Build();
```

---

## Common Mistakes

### 1. Consuming Events Before They're Produced

If `DamageVfxSystem` runs before `CombatSystem`, it will never see `DamageDealtEvent` tags. Always verify system execution order.

### 2. Forgetting to Clean Up Event Tags

Leftover event tags cause systems to re-process stale events every frame. Always remove event tags in a dedicated cleanup pass or in each consumer's `AfterUpdate`.

### 3. Modifying Entities During Query Iteration

Adding or removing components while iterating an Arch query can cause undefined behavior. Use `CommandBuffer` for structural changes during iteration.

### 4. Event Storms

A single event triggers another event, which triggers another — creating an unbounded chain within one frame. Guard against this with depth limits or by deferring chained events to the next frame via event queues.

```csharp
// BAD: chain explosion in one frame
// DamageEvent → DeathEvent → LootDropEvent → InventoryFullEvent → ...

// GOOD: use event queues so chains resolve over multiple frames
// Frame N: DamageEvent → DeathEvent
// Frame N+1: LootDropEvent
// Frame N+2: InventoryFullEvent
```

### 5. Using C# Events/Delegates in ECS

```csharp
// WRONG: bypasses ECS, creates hidden coupling, not serializable
public struct Health
{
    public int Current;
    public event Action<int> OnDamaged;  // NO! Not a pure data component
}
```

Standard C# events and delegates break the ECS contract. Keep components as pure data and route all communication through ECS-native mechanisms described in this guide.

---

## Choosing the Right Strategy

| Need | Strategy | Latency |
|------|----------|---------|
| Entity-specific event, no extra data | Tag components | Same frame |
| Entity-specific event with payload | Data event components | Same frame |
| Global event not tied to an entity | EventQueue\<T\> | Next frame |
| Structural changes during iteration | CommandBuffer | End of system |
| Multi-frame event chains | EventQueue\<T\> with chaining | 1 frame per link |

Start with tag components — they handle 80% of cases with zero infrastructure. Graduate to event queues only when you need global or cross-frame events.
