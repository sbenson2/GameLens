# G15 — Blueprint vs C++ Workflow in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Gameplay Framework](G1_gameplay_framework.md) · [Debugging & Profiling](G10_debugging_profiling.md) · [Unreal Rules](../unreal-arch-rules.md)

Unreal Engine gives you two programming languages — Blueprints (visual scripting) and C++ — and expects you to use both. This guide explains when to use each, how to build the hybrid architecture that Epic recommends, and the specific UE5 macros and patterns that make C++ and Blueprints work together seamlessly.

---

## Why Two Languages?

Unreal's design philosophy: **C++ defines the rules, Blueprints play the game.** C++ programmers build systems, expose knobs and hooks, and handle performance-critical logic. Designers and gameplay scripters use Blueprints to wire those systems together, tweak values, and iterate on game feel without waiting for a compile.

Neither language is "better." They serve different audiences and different concerns:

| Concern | Blueprint | C++ |
|---------|-----------|-----|
| Iteration speed | Instant — change, save, test | Minutes — change, compile, test |
| Runtime performance | ~10x slower per-node for logic-heavy graphs | Native speed |
| Audience | Designers, artists, gameplay scripters | Engine programmers, systems engineers |
| Discoverability | Right-click → search nodes visually | Must know the API or read headers |
| Merge friendliness | Binary `.uasset` — impossible to diff | Text `.h`/`.cpp` — standard diff/merge |
| Access to engine internals | Limited to what's exposed via `UFUNCTION` | Full access to everything |

The ideal workflow uses **both**: C++ for the skeleton, Blueprints for the skin.

---

## The Hybrid Architecture

```
┌──────────────────────────────────────────────────────────┐
│  C++ Layer (programmers)                                 │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Base classes: AMyCharacterBase, AMyWeaponBase       ││
│  │  Core systems: damage calculation, inventory logic   ││
│  │  Exposed via: UPROPERTY, UFUNCTION, delegates        ││
│  └──────────────────────────────────────────────────────┘│
│                          ▲                                │
│                   inherits / overrides                    │
│                          │                                │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Blueprint Layer (designers)                         ││
│  │  BP_PlayerCharacter : AMyCharacterBase               ││
│  │  BP_Sword : AMyWeaponBase                            ││
│  │  Overrides: OnAttack, OnDeath, VFX triggers          ││
│  │  Tweaks: speed, damage, animation montages           ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

**The rule of thumb:** if you find yourself doing math, loops, array processing, or engine API calls in Blueprint, it probably belongs in C++. If you're wiring up assets (meshes, sounds, montages), tuning values, or scripting one-off level events, Blueprint is the right tool.

---

## When to Use C++

### Always use C++ for:

- **Tick-heavy logic** — every node in a Blueprint Tick has overhead. A Blueprint with 30+ nodes in Tick, running on 100 instances, measurably impacts frame time. Write the logic in C++ and call it from Blueprint if needed.

- **Complex math and algorithms** — pathfinding heuristics, procedural generation, physics calculations. Blueprint spaghetti for math is unreadable and slow.

- **Data structures and core systems** — inventory management, save/load serialization, networking RPCs with complex payloads.

- **Engine extensions** — custom movement modes, new component types, editor tools, custom asset types.

- **Third-party library integration** — anything that requires `#include` a C or C++ library (Steam SDK, FMOD, etc.).

- **Performance-critical inner loops** — any code that runs per-frame on many actors: spatial queries, AI perception updates, animation logic.

### C++ base class example:

```cpp
// MyCharacterBase.h — C++ base that exposes hooks for Blueprint
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "MyCharacterBase.generated.h"

UCLASS(Abstract, Blueprintable)
class MYGAME_API AMyCharacterBase : public ACharacter
{
    GENERATED_BODY()

public:
    AMyCharacterBase();

    // --- Exposed properties (designers tweak these in Blueprint subclass) ---

    // EditDefaultsOnly: editable in the Blueprint class defaults, not per-instance.
    // This keeps the designer focused on defining "what IS a Goblin" in one place.
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Combat")
    float BaseDamage = 10.f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Combat")
    float AttackRange = 200.f;

    // BlueprintReadWrite: designers can also change this at runtime via Blueprint.
    UPROPERTY(BlueprintReadWrite, Category = "State")
    float CurrentHealth;

    // --- Functions callable from Blueprint ---

    // BlueprintCallable: Blueprint can call this, but can't override it.
    // Use for utility functions where you want one authoritative implementation.
    UFUNCTION(BlueprintCallable, Category = "Combat")
    float CalculateDamage(float Multiplier) const;

    // --- Functions overridable by Blueprint ---

    // BlueprintNativeEvent: has a C++ default implementation (_Implementation suffix),
    // but Blueprint subclasses can override it. Best of both worlds — safe default
    // behavior with designer-customizable overrides.
    UFUNCTION(BlueprintNativeEvent, Category = "Combat")
    void OnTakeDamage(float DamageAmount, AActor* DamageSource);

    // BlueprintImplementableEvent: NO C++ implementation. This is a pure hook —
    // the Blueprint MUST implement it (or it does nothing). Use for things like
    // "play death VFX" where the C++ layer has no opinion about the specifics.
    UFUNCTION(BlueprintImplementableEvent, Category = "Events")
    void OnDeath();

protected:
    virtual void BeginPlay() override;
};
```

```cpp
// MyCharacterBase.cpp
#include "MyCharacterBase.h"

AMyCharacterBase::AMyCharacterBase()
{
    CurrentHealth = 100.f;
}

void AMyCharacterBase::BeginPlay()
{
    Super::BeginPlay();
    CurrentHealth = 100.f; // Reset on spawn
}

float AMyCharacterBase::CalculateDamage(float Multiplier) const
{
    // Core damage formula lives in C++ — one place to audit, easy to unit-test,
    // and designers never accidentally break it.
    return BaseDamage * Multiplier;
}

// The _Implementation suffix is required by BlueprintNativeEvent.
// This provides the default behavior; Blueprint can override it.
void AMyCharacterBase::OnTakeDamage_Implementation(float DamageAmount, AActor* DamageSource)
{
    CurrentHealth -= DamageAmount;
    if (CurrentHealth <= 0.f)
    {
        // OnDeath is BlueprintImplementableEvent — the Blueprint decides
        // what death looks like (ragdoll? dissolve? explosion?).
        OnDeath();
    }
}
```

A designer then creates `BP_Goblin` inheriting from `AMyCharacterBase`, sets `BaseDamage = 15`, picks an animation montage for death, and overrides `OnDeath` to trigger a dissolve VFX — all without touching C++.

---

## When to Use Blueprints

### Always use Blueprints for:

- **Asset wiring** — assigning meshes, materials, sounds, animation montages, niagara effects to components. This is inherently visual work.

- **Prototyping** — test an idea in 5 minutes before committing to a C++ implementation.

- **One-off level scripting** — "when the player enters this trigger, open that door and play this sound." Level Blueprints exist for this.

- **UI layout and interaction** — UMG widget Blueprints with button clicks, hover states, and animation sequences.

- **Designer-tunable game logic** — the specific sequence of "spawn 3 waves, then boss, then cutscene" for a particular level.

- **Animation state machines** — Animation Blueprints are designed for visual authoring. Rewriting them in C++ is counterproductive.

---

## The UPROPERTY Specifier Cheat Sheet

`UPROPERTY` macros control how C++ variables appear in the editor and Blueprint:

| Specifier | Editor Behavior | Blueprint Access |
|-----------|----------------|-----------------|
| `EditAnywhere` | Editable on class defaults AND per-instance | — |
| `EditDefaultsOnly` | Editable on class defaults only | — |
| `EditInstanceOnly` | Editable per-instance only | — |
| `VisibleAnywhere` | Read-only in Inspector | — |
| `BlueprintReadOnly` | — | Blueprint can read but not write |
| `BlueprintReadWrite` | — | Blueprint can read and write |

Combine them: `UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)` means the designer sets it in the Blueprint class defaults and the Blueprint graph can read it but not change it at runtime.

### Categories and Metadata

```cpp
// Group related properties so they don't drown in a flat list
UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Combat|Melee",
    meta = (ClampMin = "0", ClampMax = "1000", ToolTip = "Base melee damage before multipliers"))
float MeleeDamage = 25.f;

// Expose a soft reference so designers can pick an asset without hard-loading it
UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Effects")
TSoftObjectPtr<UNiagaraSystem> HitEffect;
```

---

## The UFUNCTION Specifier Cheat Sheet

| Specifier | Meaning |
|-----------|---------|
| `BlueprintCallable` | Blueprint can call this function. C++ owns the implementation. |
| `BlueprintPure` | Like BlueprintCallable but has no side effects and no execution pin (used for getters). |
| `BlueprintNativeEvent` | C++ provides a default implementation (`_Implementation`). Blueprint can override. |
| `BlueprintImplementableEvent` | No C++ body. Blueprint must implement it (or it's a no-op). |
| `BlueprintAuthorityOnly` | Only executes on the server (useful for multiplayer). |
| `Category = "X"` | Groups the function in Blueprint's right-click menu under category X. |

### Choosing the right specifier:

```
Does C++ need a default implementation?
├── Yes → Does Blueprint need to override it?
│         ├── Yes → BlueprintNativeEvent
│         └── No  → BlueprintCallable
└── No  → Blueprint provides ALL logic
          └── BlueprintImplementableEvent
```

---

## Delegates: C++ Events That Blueprint Can Bind

For event-driven communication (like the observer pattern), use dynamic multicast delegates:

```cpp
// In the header — declare a delegate type that Blueprint can bind to
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnHealthChanged, float, NewHealth);

UCLASS()
class AMyCharacterBase : public ACharacter
{
    GENERATED_BODY()

public:
    // BlueprintAssignable: Blueprint can bind to this in the Event Graph.
    // This is how you fire events from C++ that designers react to in Blueprint.
    UPROPERTY(BlueprintAssignable, Category = "Events")
    FOnHealthChanged OnHealthChanged;

    void ApplyDamage(float Amount)
    {
        CurrentHealth -= Amount;
        // Broadcast to all Blueprint (and C++) listeners
        OnHealthChanged.Broadcast(CurrentHealth);
    }
};
```

In Blueprint, the designer adds an `OnHealthChanged` event node and wires it to "update health bar," "play damage flash," "check for death" — all without touching C++.

---

## Performance: What Actually Matters

A common misconception is "Blueprints are slow." The reality is more nuanced:

**Blueprint node dispatch is slow.** Each node in a Blueprint graph has overhead (~5–10x slower than equivalent C++ for pure logic). This matters when:
- A Blueprint Tick runs 50+ nodes every frame
- The Blueprint is on 100+ instances (enemies, projectiles)
- You're doing loops over large arrays in Blueprint

**Blueprint calling C++ functions is fast.** Once execution enters a `BlueprintCallable` C++ function, it runs at native speed. A Blueprint that calls 3 C++ functions is nearly as fast as pure C++.

**Practical guideline:**

| Scenario | Recommendation |
|----------|---------------|
| Simple event response (button click → play sound) | Blueprint is fine |
| Per-frame logic on few actors (player controller) | Blueprint is fine |
| Per-frame logic on many actors (100 enemies) | Move to C++ Tick |
| Complex algorithm (A*, sorting, spatial queries) | Always C++ |
| Data-driven configuration (set mesh, set speed) | Always Blueprint |

### Profiling Blueprint Cost

Use **Unreal Insights** or the **Blueprint Profiler** (`Window → Developer Tools → Blueprint Profiler`) to identify expensive Blueprints. Look for:
- High **Inclusive Time** on Blueprint Tick
- Many **Script Calls** per frame from a single class
- Spike frames caused by `ForEachLoop` on large arrays in Blueprint

---

## Migration Strategy: Blueprint → C++

When a prototype Blueprint becomes a bottleneck, here's the migration path:

1. **Create a C++ base class** with the same properties and functions.
2. **Reparent the Blueprint** — in the Blueprint editor, go to `Class Settings → Parent Class` and select your new C++ class.
3. **Move logic incrementally** — start with Tick and inner loops. Expose them as `BlueprintCallable` functions. The Blueprint calls them instead of reimplementing.
4. **Keep Blueprint for asset wiring** — don't move mesh/sound/VFX assignments to C++. That's Blueprint's strength.

---

## Project Setup: Always Start as a C++ Project

Even if your game is 90% Blueprint, **always create a C++ project**, not a Blueprint-only project. Reasons:

- You can't add C++ to a Blueprint-only project without recreating it.
- Build systems (CI/CD) require a C++ project structure.
- Having a compiled module (`MyGame.Build.cs`) is needed for plugins, custom modules, and packaging.
- The `GENERATED_BODY()` and reflection system only work in a C++ project context.

In the Epic Games Launcher: **New Project → choose your template → C++ (not Blueprint).**

---

## Common Pitfalls

### 1. "Pure Blueprint" projects that hit performance walls
Start with C++ project structure. You don't have to write C++ on day one, but you'll need it eventually, and retrofitting is painful.

### 2. Overexposing everything to Blueprint
Not every C++ variable needs `BlueprintReadWrite`. Expose only what designers actually need. Over-exposure creates a confusing API with too many knobs.

### 3. Blueprint spaghetti
If a Blueprint graph doesn't fit on one screen, it's too complex. Collapse logic into functions, use Blueprint macros for reusable patterns, and move complex logic to C++.

### 4. Forgetting `Super::` calls in overrides
When overriding `BeginPlay`, `Tick`, or `BlueprintNativeEvent` functions, always call the parent implementation unless you intentionally want to replace it entirely.

### 5. Not using interfaces for cross-system communication
Instead of casting to concrete types (which creates hard dependencies), define Blueprint Interfaces. Both C++ and Blueprint classes can implement them, keeping systems decoupled.

```cpp
// IDamageable.h — a C++ interface that Blueprint classes can implement
UINTERFACE(MinimalAPI, Blueprintable)
class UDamageable : public UInterface { GENERATED_BODY() };

class IDamageable
{
    GENERATED_BODY()
public:
    // BlueprintNativeEvent so both C++ and Blueprint can implement it
    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Damage")
    void ApplyDamage(float Amount, AActor* Source);
};
```

---

## Decision Flowchart

```
New feature or system to implement?
│
├── Is it a core system (inventory, save, networking, AI logic)?
│   └── C++ base class, expose hooks via UFUNCTION/UPROPERTY
│
├── Is it performance-critical (runs per-frame on many actors)?
│   └── C++ implementation, call from Blueprint if needed
│
├── Is it visual/asset-driven (VFX, UI, animation, level events)?
│   └── Blueprint
│
├── Is it a prototype / unproven idea?
│   └── Blueprint first, migrate to C++ if it graduates to production
│
└── Is it designer-tunable game logic (wave spawning, dialogue flow)?
    └── Blueprint, driven by data from C++ systems
```
