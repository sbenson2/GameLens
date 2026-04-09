# G31 — Chaos Destruction System Deep Dive

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G6 Physics & Collision](G6_physics_and_collision.md) · [G17 Niagara VFX](G17_niagara_vfx_system.md) · [G20 Performance Optimization](G20_performance_optimization_memory.md) · [Unreal Rules](../unreal-arch-rules.md)

The **Chaos Destruction** system enables real-time, cinematic-quality destruction using **Geometry Collections** — fractured meshes that break apart at runtime based on physics forces, damage events, and field systems. This guide is a deep dive into the destruction pipeline: fracturing, clustering, damage thresholds, runtime C++ control, Niagara integration, networking, optimization, and the Chaos Cache system. For general Chaos physics (rigid bodies, collision channels, traces), see [G6](G6_physics_and_collision.md).

---

## Core Concepts

### What is a Geometry Collection?

A Geometry Collection is a specialized asset built from one or more Static Meshes that have been fractured into pieces (bones). At runtime, Chaos simulates each piece as an individual rigid body when it breaks free from the structure.

```
Static Mesh (Wall)                 Geometry Collection (Fractured Wall)
┌────────────────────┐             ┌────────────────────┐
│                    │             │ ╱╲  ╱╲  ╱╲  ╱╲    │
│                    │  Fracture   │╱__╲╱__╲╱__╲╱__╲   │
│    Solid mesh      │  ──────►   │╲  ╱╲  ╱╲  ╱╲  ╱   │
│                    │  Editor    │ ╲╱  ╲╱  ╲╱  ╲╱    │
│                    │             │  Each piece = bone  │
└────────────────────┘             └────────────────────┘
```

### The Destruction Pipeline

```
1. Create Geometry Collection from Static Mesh(es)
       │
2. Fracture in the Fracture Editor
       │  (Voronoi, Uniform, Radial, Planar, Mesh, Brick)
       │
3. Configure Clustering (hierarchical groups)
       │
4. Set Damage Thresholds per cluster level
       │
5. Place in level with AGeometryCollectionActor
       │
6. At runtime: Force/Damage exceeds threshold → pieces break free
       │
7. Broken pieces simulate as rigid bodies
       │
8. Niagara reads break/collision events for VFX
```

---

## Fracture Modes

The Fracture Editor (accessible from the Geometry Collection asset) provides several fracture algorithms:

| Fracture Mode | Description | Best For |
|---------------|-------------|----------|
| **Voronoi** | Random seed points generate natural-looking irregular shards | Walls, rocks, concrete, glass |
| **Uniform Voronoi** | Evenly distributed seed points | Regular fragmentation patterns |
| **Radial** | Fractures radiate outward from a center point | Impact craters, bullet holes |
| **Planar** | Cuts along flat planes | Clean architectural breaks, slicing |
| **Brick** | Grid-based fracture simulating brick/block patterns | Brick walls, tiled surfaces |
| **Mesh** | Uses another mesh's geometry as cut shapes | Custom artistic fracture patterns |
| **Cluster** | Groups existing fracture pieces into hierarchical clusters | Multi-stage destruction (first cracks, then crumbles) |

### Multi-Level Fracturing

For realistic destruction, apply multiple fracture passes to create a **hierarchy**:

```
Level 0 (root):    Entire wall — one piece
                         │
Level 1 (clusters): 4 large sections
                    ┌────┼────┬────┐
                    │    │    │    │
Level 2 (detail):  12 medium chunks per section
                   ╱╲  ╱╲  ╱╲  ╱╲
Level 3 (debris):  Tiny fragments from each chunk
```

When damage hits, Level 1 breaks first (big sections fall away). If those sections hit the ground hard enough, Level 2 breaks (chunks scatter). Level 3 provides fine debris. This cascading fracture creates convincing, multi-stage destruction.

---

## Damage Thresholds and Clustering

### Configuring Damage Thresholds

Each cluster level has a **damage threshold** — the minimum force needed to break it apart. Configure these in the Geometry Collection's Cluster Properties:

| Property | What It Controls |
|----------|-----------------|
| `DamageThreshold` | Minimum damage to break this cluster level. Array indexed by hierarchy depth. |
| `ClusterConnectionType` | How pieces connect: `PointImplicit` (any overlap), `DelaunayTriangulation` (mesh-based), `MinimalSpanningSubsetDelaunay` (optimized subset) |
| `ClusterGroupIndex` | Groups clusters that should break together |

### Damage Types

Chaos Destruction responds to Unreal's standard damage system:

```cpp
// Apply point damage to trigger destruction at a specific location
// WHY PointDamage over RadialDamage: Point damage creates a localized
// fracture origin, which looks more realistic for projectile impacts.
// Radial damage breaks everything within a radius (better for explosions).

void AMyWeapon::OnProjectileHit(
    const FHitResult& Hit,
    AActor* HitActor)
{
    // Point damage — single impact location
    FPointDamageEvent DamageEvent;
    DamageEvent.Damage = 500.f;
    DamageEvent.HitInfo = Hit;
    DamageEvent.ShotDirection = GetActorForwardVector();

    HitActor->TakeDamage(
        DamageEvent.Damage,
        DamageEvent,
        GetInstigatorController(),
        this);
}

void AMyExplosive::Detonate()
{
    // Radial damage — affects everything in a sphere
    // WHY radial for explosions: It applies falloff-based damage to all
    // Geometry Collections in range, creating a blast pattern.
    UGameplayStatics::ApplyRadialDamage(
        GetWorld(),
        1000.f,                    // Base damage
        GetActorLocation(),         // Origin
        500.f,                      // Damage radius
        UDamageType::StaticClass(),
        TArray<AActor*>(),          // Ignore actors
        this,                       // Damage causer
        GetInstigatorController(),
        true,                       // Do full damage (no falloff)
        ECollisionChannel::ECC_Destructible  // Only hit destructibles
    );
}
```

---

## Runtime C++ Control

### Direct Component Access

```cpp
void AMyActor::BreakGeometryCollection(
    UGeometryCollectionComponent* GCComponent,
    FVector ImpactPoint,
    float BreakForce)
{
    if (!GCComponent) return;

    // WHY ApplyExternalStrain: This bypasses the damage system and applies
    // force directly to the Chaos simulation. Useful for environmental
    // triggers (earthquake, collapsing floor) that aren't "damage" per se.
    GCComponent->ApplyExternalStrain(
        /*ClusterIndex=*/ 0,
        FVector(0.f, 0.f, -1.f),  // Direction of strain
        BreakForce
    );
}
```

### Physics Field System

Physics Fields let you affect Chaos simulations in a region of space without direct component references:

```cpp
// Place a UFieldSystemComponent in your explosion actor
// Then at runtime, create and apply field nodes:

void AMyExplosive::CreateDestructionField()
{
    // WHY Field System: It affects ALL Geometry Collections in the region,
    // not just one specific actor. Perfect for area-of-effect destruction
    // like bombing runs or earthquake zones.

    // Create a radial falloff field centered on the explosion
    URadialFalloff* FalloffNode = NewObject<URadialFalloff>(this);
    FalloffNode->SetRadialFalloff(
        /*Magnitude=*/ 1000000.f,   // Peak force at center
        /*MinRange=*/ 0.f,
        /*MaxRange=*/ 500.f,         // Effect radius
        /*Default=*/ 0.f,
        /*Radius=*/ 500.f,
        /*Position=*/ GetActorLocation(),
        /*FieldType=*/ EFieldFalloffType::Field_FallOff_Linear
    );

    // Apply to the field system — affects all nearby Chaos objects
    if (FieldSystemComp)
    {
        FieldSystemComp->ApplyPhysicsField(
            /*Enabled=*/ true,
            EFieldPhysicsType::Field_ExternalClusterStrain,
            /*MetaData=*/ nullptr,
            FalloffNode
        );
    }
}
```

---

## Anchor Fields

Anchor Fields prevent pieces from breaking until the anchor is removed. This is essential for structures that should only collapse when their supports are destroyed:

```
Before anchor removal:        After anchor removal:
┌──────────────────┐          ┌──────────────────┐
│  Ceiling (held)  │          │  Ceiling          │
├──────────────────┤          ├────────┐          │
│  ▓▓▓▓  PILLAR   │          │        │ ← falls  │
│  ▓▓▓▓  (anchor) │          │  Gone  │          │
│  ▓▓▓▓           │          │        │          │
└──────────────────┘          └────────┘──────────┘
```

```cpp
// Removing an anchor at runtime triggers a cascade collapse
void AMyPillar::OnPillarDestroyed()
{
    // Disable the anchor field — everything it was holding breaks free
    // WHY disable instead of destroy: Destroying the field actor can cause
    // one-frame physics artifacts. Disabling is cleaner.
    if (AnchorFieldActor)
    {
        AnchorFieldActor->GetFieldSystemComponent()->SetActive(false);
    }
}
```

Setup: Place an `AFieldSystemActor` with an `AnchorField` node at the base of the structure. The anchor applies a "strain override" that keeps pieces connected regardless of damage, until the field is deactivated.

---

## Niagara Integration

Chaos Destruction fires events that Niagara can consume for particle effects:

| Event Type | When It Fires | Niagara Use |
|------------|---------------|-------------|
| **Break Event** | A cluster breaks apart | Spawn dust clouds, sparks, debris particles at break location |
| **Collision Event** | A broken piece hits something | Spawn impact sparks, dust puffs on contact |
| **Trailing Event** | A piece is moving through the air | Spawn smoke trails behind flying debris |

### Niagara Data Interface Setup

```
1. In your Niagara System, add a "Chaos Destruction" data interface
2. Bind it to the Geometry Collection Component
3. In the Emitter:
   - Spawn Module: Read BreakEvent → spawn N particles at break position
   - Particle Update: Use collision event velocity for directional sparks
```

```cpp
// C++ — Bind Niagara to Chaos events programmatically
void AMyDestructible::BeginPlay()
{
    Super::BeginPlay();

    if (UGeometryCollectionComponent* GC = GetGeometryCollectionComponent())
    {
        // WHY OnChaosBreakEvent: This delegate fires for every fracture event.
        // Use it for gameplay logic (scoring, triggering further events)
        // alongside the Niagara VFX binding.
        GC->OnChaosBreakEvent.AddDynamic(
            this, &AMyDestructible::HandleBreakEvent);
    }
}

void AMyDestructible::HandleBreakEvent(const FChaosBreakEvent& Event)
{
    // Event.Location — where the break occurred
    // Event.Velocity — velocity of the breaking piece
    // Event.Mass — mass of the broken cluster

    // Spawn a gameplay effect (sound, camera shake) scaled by mass
    float ShakeIntensity = FMath::Clamp(Event.Mass / 1000.f, 0.1f, 1.f);
    PlayCameraShake(ShakeIntensity);
    PlaySoundAtLocation(BreakSound, Event.Location);
}
```

---

## Chaos Cache (Pre-Recorded Destruction)

For cinematic or scripted destruction sequences, the **Chaos Cache** pre-records the physics simulation and replays it at near-zero runtime cost:

### When to Use Chaos Cache

| Scenario | Use Cache? | Why |
|----------|-----------|-----|
| Cinematic cutscene destruction | **Yes** | Deterministic replay, zero physics cost |
| Scripted level event (bridge collapse) | **Yes** | Guaranteed to look the same every time |
| Player-triggered destruction (shooting walls) | **No** | Must react to dynamic input |
| Procedural destruction in open world | **No** | Too many permutations to cache |

### Recording a Cache

1. Set up your Geometry Collection with fractures and anchors
2. Open **Sequencer** and add the Geometry Collection actor
3. Add a **Geometry Cache** track
4. Press **Record** — Sequencer runs the physics simulation and captures per-frame transforms
5. The cache is stored as a `.abc` (Alembic) file or UE's internal cache format
6. At runtime, the cache replays transforms without running physics

> **WHY cache over simulation:** A complex building collapse might involve 500+ rigid bodies. Simulating that in real-time costs ~5ms+ per frame. Cached playback costs <0.1ms because it's just reading pre-baked transforms.

---

## Networking Destruction

Chaos Destruction networking requires special handling because replicating hundreds of rigid body states is expensive:

### Strategy 1: Server-Authoritative Damage, Client-Side Fracture

```cpp
// Server applies damage (replicated via TakeDamage → GameplayCue)
// Clients run their own local fracture simulation
// WHY: Exact piece positions don't need to match — players don't notice
// if debris lands slightly differently. What matters is WHEN and WHERE
// the break occurs, not the exact trajectory of every shard.

// Server RPC
UFUNCTION(Server, Reliable, WithValidation)
void Server_ApplyDestructionDamage(
    AGeometryCollectionActor* Target,
    FVector ImpactPoint,
    float Damage);

// Multicast to all clients
UFUNCTION(NetMulticast, Reliable)
void Multicast_TriggerDestruction(
    AGeometryCollectionActor* Target,
    FVector ImpactPoint,
    float Damage);
```

### Strategy 2: Replicated Geometry Collection State

For competitive games where destruction must be identical:

- Use `UNetworkPhysicsComponent` (UE 5.4+) on the Geometry Collection actor
- This replicates the full physics state using Chaos's networked physics system
- **Cost:** High bandwidth. Only use for gameplay-critical destructibles (walls that block sightlines, cover objects)

### Best Practice: Tiered Destruction

```
Gameplay-critical (cover, walls): Full replication via NetworkPhysicsComponent
Visual-only (vases, crates):      Multicast trigger → local simulation
Background (distant buildings):    Client-side only, no replication
```

---

## Optimization

### Performance Budget

| Object Count | Expected Frame Cost | Strategy |
|-------------|-------------------|----------|
| < 50 active pieces | < 1ms | No optimization needed |
| 50–200 active pieces | 1–3ms | Use clustering and sleep thresholds |
| 200–500 active pieces | 3–8ms | Aggressive removal, Chaos Cache for scripted sequences |
| 500+ active pieces | > 8ms | Redesign — too many active bodies |

### Key Optimization Techniques

**1. Hierarchical Clustering** — Group small pieces into clusters that simulate as one body until enough force is applied. Reduces active body count by 10–50x.

**2. Removal on Break** — Configure pieces to be removed after breaking instead of simulating:

```cpp
// In Geometry Collection settings:
// RemoveOnBreak → removes pieces after N seconds
// WHY: Debris on the ground that's stopped moving still costs collision
// queries every frame. Removing it reclaims both physics and rendering budget.
```

**3. Sleep Thresholds** — Chaos puts pieces to sleep when velocity drops below a threshold. Sleeping bodies cost near-zero CPU. Configure in Physics Settings:

```ini
; DefaultEngine.ini
[/Script/Engine.PhysicsSettings]
; Lower threshold = bodies sleep sooner = better performance
SleepLinearVelocityThreshold=1.0
SleepAngularVelocityThreshold=1.0
```

**4. Max Active Cluster Level** — Limit how deep the fracture hierarchy can break at runtime. Level 2 max means Level 3 (fine debris) pieces never simulate individually — they stay grouped.

**5. Distance-Based LOD** — Only allow full-detail fracture near the camera. Distant objects use fewer fracture levels or pre-baked destruction meshes.

**6. Chaos Cache for Scripted Sequences** — Pre-record complex destruction and replay it. See the Chaos Cache section above.

---

## Common Pitfalls

1. **Fracturing without clustering.** A Voronoi fracture with 200 pieces and no clustering means 200 rigid bodies activate simultaneously when the first break occurs. Always create a cluster hierarchy (3–4 levels) to cascade the destruction.

2. **Too many fracture pieces.** More pieces ≠ better destruction. 50–100 pieces per Geometry Collection is a good starting point. Beyond 200, performance degrades rapidly. Use Niagara particles for fine debris instead of simulated rigid bodies.

3. **Missing collision on broken pieces.** By default, broken pieces use the `Destructible` collision channel. Ensure your projectiles and traces include this channel, or destruction won't respond to continued damage.

4. **Anchor field covers the whole mesh.** An anchor field that encompasses the entire Geometry Collection prevents ALL fracture. Size the field precisely to the structural supports — pillars, beams, foundations.

5. **Not testing on target hardware.** Chaos Destruction performance varies wildly between PC and consoles. A 100-piece fracture that runs fine on a desktop GPU may cause hitches on Switch or mobile. Profile with `stat Chaos` in-game.

6. **Forgetting RemoveOnBreak for multiplayer.** In networked games, debris that persists indefinitely accumulates across the match. Configure `RemoveOnBreak` with a 5–10 second delay to keep the physics scene clean.

7. **Using Chaos Destruction for everything.** Not every breakable object needs the full Chaos pipeline. Simple breakables (vases, crates) can use a "swap mesh" approach — replace the intact mesh with a pre-fractured Blueprint on hit. Reserve Chaos Destruction for large, complex structures where the fracture pattern matters.
