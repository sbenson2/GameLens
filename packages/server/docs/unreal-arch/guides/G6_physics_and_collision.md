# G6 — Physics & Collision in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Gameplay Framework](G1_gameplay_framework.md) · [Unreal Rules](../unreal-arch-rules.md)

Unreal Engine 5 uses the **Chaos** physics engine as its default simulation backend, replacing PhysX from UE4. Chaos powers rigid body simulation, destruction, cloth, and vehicles. This guide covers the practical physics and collision patterns you need for gameplay — collision channels, traces, physics materials, constraints, and Chaos destruction — with emphasis on getting predictable, performant results.

---

## Physics Engine Options in UE5

| Engine | Built-in | Best For | Notes |
|--------|----------|----------|-------|
| **Chaos** | Yes (default) | General gameplay, destruction, ragdolls | Tightly integrated; supports fracture/destruction natively |
| **Havok** | Plugin (licensed) | Vehicles, weighted interactions, AAA stability | More deterministic; used by many AAA studios for predictable vehicle physics |

For most projects, **Chaos is the correct default**. Switch to Havok only if you have specific vehicle physics or determinism requirements and the license.

---

## Core Concepts

### Physics Bodies (Body Instances)

Every component that participates in physics simulation has a **Body Instance** — the runtime physics representation. Key properties:

| Property | What It Does | Default |
|----------|-------------|---------|
| `Simulate Physics` | Enables dynamic simulation (gravity, forces, collisions) | Off |
| `Mobility` | Must be `Movable` for physics simulation | Static |
| `Mass (kg)` | Determines inertia; affects collision response weight | Auto-calculated from volume |
| `Linear/Angular Damping` | Slows velocity over time; prevents perpetual motion | 0.01 / 0.0 |
| `Enable Gravity` | Whether gravity applies to this body | On |
| `CCD (Continuous Collision Detection)` | Prevents fast objects tunneling through thin walls | Off |

### When to Enable CCD

```
Enable CCD for:
  ✓ Projectiles (bullets, arrows, thrown objects)
  ✓ Fast-moving gameplay objects (racing game vehicles)
  ✓ Any object that moves more than its own thickness per frame

Leave CCD off for:
  ✗ Characters (CharacterMovementComponent handles this)
  ✗ Slow-moving or large objects
  ✗ Static/kinematic bodies
```

**Why:** CCD adds a swept-shape test between frames, catching collisions that discrete detection misses. It costs ~2x per body, so apply selectively.

---

## Collision System

### Collision Channels (Object Types & Trace Channels)

UE5's collision system is **channel-based**. Every collidable component has an **Object Type** (what it is) and a **response table** (how it reacts to other channels).

**Built-in Object Channels:**

| Channel | Typical Use |
|---------|-------------|
| `WorldStatic` | Floors, walls, terrain — anything that never moves |
| `WorldDynamic` | Movable props, doors, platforms |
| `Pawn` | Player and AI characters |
| `PhysicsBody` | Simulated rigid bodies (crates, barrels) |
| `Vehicle` | Vehicles |
| `Destructible` | Chaos destruction geometry |

**Built-in Trace Channels:**

| Channel | Typical Use |
|---------|-------------|
| `Visibility` | Line-of-sight checks, AI perception |
| `Camera` | Camera collision (prevents clipping through walls) |

**Collision Responses:**

| Response | Behavior |
|----------|----------|
| `Block` | Stops movement; generates hit events |
| `Overlap` | Passes through; generates overlap events |
| `Ignore` | No interaction at all |

### Custom Collision Channels

Define custom channels in **Project Settings → Collision** for game-specific categories:

```
Example custom channels:
  Projectile     — bullets pass through pawns' capsules but block world geometry
  Interactable   — objects the player can interact with via trace
  Loot           — pickups that overlap with the player but block world
```

**Best practice:** Set the default response for custom channels to `Ignore`, then explicitly set `Block` or `Overlap` only in the collision profiles that need it. This prevents accidental collisions with unrelated objects.

### Collision Profiles (Presets)

Collision Profiles bundle an Object Type + response table into a reusable preset. Use presets instead of configuring collision per-instance.

```cpp
// In C++, set collision profile on a component:
// WHY preset over manual: Presets are centrally defined in Project Settings,
// so collision rules change in one place instead of per-actor.
MeshComponent->SetCollisionProfileName(TEXT("Projectile"));
```

**Common built-in presets:**

| Preset | Object Type | Blocks | Overlaps |
|--------|-------------|--------|----------|
| `BlockAll` | WorldStatic | Everything | — |
| `OverlapAll` | WorldStatic | — | Everything |
| `BlockAllDynamic` | WorldDynamic | Everything | — |
| `Pawn` | Pawn | WorldStatic, WorldDynamic | — |
| `NoCollision` | — | — | — |

---

## Line Traces and Sweeps

Traces are the primary tool for runtime collision queries — raycasts for hit detection, interaction checks, ground detection, and AI sight lines.

### Line Trace (Raycast)

```cpp
// Single line trace — returns the first blocking hit
// WHY LineTraceSingleByChannel: Most common trace type. Use for
// bullets, interaction checks, ground detection, and AI line of sight.
bool AMyActor::TraceForInteractable(FHitResult& OutHit) const
{
    FVector Start = GetActorLocation();
    FVector End = Start + GetActorForwardVector() * InteractionRange;

    FCollisionQueryParams Params;
    // WHY AddIgnoredActor: Prevent the trace from hitting the actor
    // that is performing the trace (self-hit).
    Params.AddIgnoredActor(this);

    return GetWorld()->LineTraceSingleByChannel(
        OutHit,
        Start,
        End,
        ECC_Visibility,    // Use Visibility channel for interaction checks
        Params
    );
}
```

### Shape Sweep (Sphere / Capsule / Box)

```cpp
// Sphere sweep — wider detection area than a line trace
// WHY sphere sweep: Line traces miss near-misses. A sphere sweep
// adds tolerance, which feels better for player-facing interactions
// like picking up items or targeting enemies.
bool AMyActor::SweepForPickups(TArray<FHitResult>& OutHits) const
{
    FVector Start = GetActorLocation();
    FVector End = Start + GetActorForwardVector() * PickupRange;

    FCollisionShape Sphere = FCollisionShape::MakeSphere(50.f);

    FCollisionQueryParams Params;
    Params.AddIgnoredActor(this);

    // WHY Multi: Returns ALL overlapping objects, not just the first block.
    // Useful for AoE damage, pickup collection, or multi-target abilities.
    return GetWorld()->SweepMultiByChannel(
        OutHits,
        Start,
        End,
        FQuat::Identity,
        ECC_WorldDynamic,
        Sphere,
        Params
    );
}
```

### Trace in Blueprints

For Blueprint users, the equivalent nodes are:

| C++ Function | Blueprint Node |
|-------------|----------------|
| `LineTraceSingleByChannel` | **Line Trace By Channel** |
| `LineTraceMultiByChannel` | **Multi Line Trace By Channel** |
| `SweepSingleByChannel` | **Sphere/Box/Capsule Trace By Channel** |
| `SweepMultiByChannel` | **Multi Sphere/Box/Capsule Trace By Channel** |
| `OverlapMultiByChannel` | **Overlap Sphere/Box/Capsule** |

**Debug visualization:** Enable `Draw Debug Type` → `For Duration` in Blueprint trace nodes to see traces in the viewport during play.

---

## Physics Materials

Physics Materials control surface properties — how bouncy, slippery, or grippy a surface is.

```cpp
// Create via C++ or assign in the editor on any collision component
// WHY Physics Material: Default friction/restitution works for walls,
// but ice, rubber, metal, and mud need distinct surface properties
// to make environments feel different under the player's feet.
UPhysicalMaterial* IceMaterial = NewObject<UPhysicalMaterial>();
IceMaterial->Friction = 0.05f;          // Very slippery
IceMaterial->Restitution = 0.1f;        // Barely bouncy
IceMaterial->FrictionCombineMode = EFrictionCombineMode::Min;  // Use the lowest friction of the two surfaces

FloorMesh->SetPhysMaterialOverride(IceMaterial);
```

**Common friction values for reference:**

| Surface | Friction | Restitution | Notes |
|---------|----------|-------------|-------|
| Concrete | 0.7 | 0.05 | Default feel |
| Ice | 0.02–0.05 | 0.1 | Slide-heavy |
| Rubber | 0.9 | 0.8 | Grippy + bouncy |
| Metal | 0.4 | 0.3 | Moderate |
| Mud / Sand | 0.8 | 0.0 | High friction, no bounce — movement feels heavy |

---

## Physics Constraints

Constraints join two physics bodies with configurable limits — hinges, ball joints, prismatic sliders, etc.

```cpp
// Example: Door hinge — constrained to rotate on one axis only
// WHY constraint over animation: A physics constraint lets the door
// react to impulses (explosions, character collision) naturally,
// while an animation only plays a fixed sequence.
UPhysicsConstraintComponent* HingeConstraint = CreateDefaultSubobject<UPhysicsConstraintComponent>(
    TEXT("DoorHinge"));
HingeConstraint->SetupAttachment(DoorFrame);

// Lock all axes except Swing1 (the hinge rotation)
HingeConstraint->SetAngularSwing1Limit(EAngularConstraintMotion::ACM_Limited, 90.f);
HingeConstraint->SetAngularSwing2Limit(EAngularConstraintMotion::ACM_Locked, 0.f);
HingeConstraint->SetAngularTwistLimit(EAngularConstraintMotion::ACM_Locked, 0.f);

// WHY soft limit: A hard limit causes abrupt stops. A soft limit
// with spring/damping makes the door slow down smoothly near its limit.
HingeConstraint->SetAngularSwing1Limit(EAngularConstraintMotion::ACM_Limited, 90.f);
HingeConstraint->SetSoftSwingLimitParams(/*bEnabled=*/true, /*Stiffness=*/50.f, /*Damping=*/5.f);
```

---

## Chaos Destruction

Chaos Destruction allows meshes to fracture and break apart at runtime — walls crumbling, pillars shattering, vehicles deforming.

### Setup Pipeline

```
1. Create a Geometry Collection from a Static Mesh (right-click → Create → Geometry Collection)
2. Open the Fracture Editor and apply fracture patterns (Voronoi, Planar, Cluster)
3. Configure damage thresholds per fracture level
4. Place the Geometry Collection Actor in the level
5. Apply damage via gameplay systems (projectile hits, explosions, etc.)
```

### Applying Damage

```cpp
// Apply point damage to trigger destruction at a location
// WHY point damage: Destruction is most convincing when it originates
// from the impact point rather than destroying the whole mesh uniformly.
void AMyProjectile::OnHit(UPrimitiveComponent* HitComponent, AActor* OtherActor,
    UPrimitiveComponent* OtherComp, FVector NormalImpulse, const FHitResult& Hit)
{
    if (UGeometryCollectionComponent* GC =
        Cast<UGeometryCollectionComponent>(OtherComp))
    {
        // Apply radial damage centered on the impact point
        FRadialDamageEvent DamageEvent;
        DamageEvent.Origin = Hit.ImpactPoint;
        DamageEvent.Params = FRadialDamageParams(
            /*BaseDamage=*/500.f,
            /*MinimumDamage=*/100.f,
            /*InnerRadius=*/50.f,
            /*OuterRadius=*/200.f,
            /*DamageFalloff=*/1.f
        );

        OtherActor->TakeDamage(500.f, FDamageEvent(DamageEvent), GetInstigatorController(), this);
    }
}
```

### Destruction Performance Tips

| Technique | Impact | When to Use |
|-----------|--------|-------------|
| **Anchor Fields** | Prevents pieces from falling until damaged | Structural walls, pillars — keeps them upright until hit |
| **Cluster grouping** | Reduces active body count | Large structures — groups pieces so they fracture in chunks |
| **Remove on break** | Removes small debris after N seconds | Always — prevents body count from growing unbounded |
| **Chaos Cache** | Pre-records simulation, replays at near-zero cost | Cinematic destruction sequences |
| **Collision complexity** | Use convex hulls, not per-poly collision on fragments | Always — per-poly collision on debris tanks performance |

---

## Common Pitfalls

1. **Don't set collision to "Query Only" and expect physics blocking** — "Query Only" is for traces and overlaps only; physics simulation requires "Physics Only" or "Query and Physics"
2. **Don't forget `Params.AddIgnoredActor(this)`** — self-hits are the most common trace bug
3. **Don't use per-poly collision on dynamic objects** — it's orders of magnitude more expensive than convex hulls; reserve it for static world geometry only
4. **Don't simulate physics on the Character capsule** — `UCharacterMovementComponent` handles character movement; enabling `Simulate Physics` on the capsule breaks it. Use a separate physics body for ragdoll
5. **Don't stack rigid bodies without damping** — zero damping + stacking = jitter. Add small linear/angular damping (0.01–0.1) for stability
6. **Don't ignore the physics sub-stepping setting** — for fast projectiles or precise constraint behavior, increase `Max Substeps` in Project Settings → Physics (default 6, increase to 8–12 for demanding scenarios)
7. **Don't use `BlockAll` as a default profile for everything** — over-blocking causes unexpected collision with UI, triggers, and non-physical volumes. Use the narrowest profile that matches the actor's purpose
8. **Don't apply forces in `Tick` without multiplying by `DeltaTime`** — frame-rate-dependent forces cause inconsistent behavior across hardware

---

## Quick Reference: Collision Setup Checklist

```
For a new collidable actor:
  □ Choose the correct Object Type (WorldStatic, Pawn, etc.)
  □ Assign a Collision Preset (or create a custom one)
  □ Set Mobility to Movable (if dynamic)
  □ Enable Simulate Physics (if it should be affected by forces)
  □ Enable CCD (if fast-moving)
  □ Assign a Physical Material (if surface properties matter)
  □ Test with "Show Collision" viewport mode (Alt+C)
  □ Verify with "Draw Debug" on trace nodes / in C++
```
