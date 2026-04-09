# G5 — Networking & Replication

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Gameplay Framework](G1_gameplay_framework.md) · [Unreal Rules](../unreal-arch-rules.md)

Unreal Engine has a built-in, server-authoritative networking model designed for real-time multiplayer games. This guide covers property replication, RPCs (Remote Procedure Calls), authority and ownership, relevancy, dormancy, and optimization patterns. All examples target UE5.4+ C++.

---

## The Server-Authoritative Model

Unreal's networking follows one core principle: **the server is the source of truth**. Clients send input and intent; the server validates, processes, and replicates the result.

```
┌──────────────┐        Input / RPCs         ┌──────────────────┐
│   Client A   │  ─────────────────────────►  │                  │
│ (Autonomous   │                              │     Server       │
│  Proxy)       │  ◄─────────────────────────  │  (Authority)     │
│              │    Replicated Properties      │                  │
└──────────────┘                              │  Validates input  │
                                              │  Runs game rules  │
┌──────────────┐        Replicated State      │  Replicates state │
│   Client B   │  ◄─────────────────────────  │                  │
│ (Simulated   │                              └──────────────────┘
│  Proxy)       │
└──────────────┘
```

### Network Roles

Every replicated actor has a **Local Role** and a **Remote Role**:

| Role | Meaning | Example |
|------|---------|---------|
| `ROLE_Authority` | This machine owns the authoritative state | Server's copy of any actor |
| `ROLE_AutonomousProxy` | Local player-controlled; can send Server RPCs | Client's own character |
| `ROLE_SimulatedProxy` | Non-owned; receives replicated updates only | Other players on your screen |
| `ROLE_None` | Not replicated | Local-only effects |

```cpp
// WHY check roles: Prevents double-execution. Without role checks,
// both server and client would run the same logic simultaneously.
if (GetLocalRole() == ROLE_Authority)
{
    // Server-only logic: validate hit, apply damage
}
else if (GetLocalRole() == ROLE_AutonomousProxy)
{
    // Owning client: play local effects immediately (client-side prediction)
}
```

---

## Property Replication

Property replication automatically synchronizes UPROPERTY values from server to clients.

### Step 1: Mark Properties as Replicated

```cpp
// Header (.h)
UCLASS()
class MYGAME_API AMyCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    // WHY Replicated: Every connected client needs to see current health.
    // The server sets this value; clients receive updates automatically.
    UPROPERTY(Replicated, BlueprintReadOnly, Category = "Stats")
    float Health = 100.f;

    // WHY ReplicatedUsing: When ammo changes, clients need to update their
    // HUD. OnRep fires on clients when the new value arrives.
    UPROPERTY(ReplicatedUsing = OnRep_CurrentAmmo, BlueprintReadOnly, Category = "Weapon")
    int32 CurrentAmmo = 30;

protected:
    UFUNCTION()
    void OnRep_CurrentAmmo();
};
```

### Step 2: Register in GetLifetimeReplicatedProps

```cpp
// Implementation (.cpp)
#include "Net/UnrealNetwork.h"

void AMyCharacter::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    // WHY DOREPLIFETIME: This macro registers the property with the
    // replication system. Without it, the UPROPERTY(Replicated) tag
    // alone does nothing — the property won't actually replicate.
    DOREPLIFETIME(AMyCharacter, Health);

    // Conditional replication: only send ammo to the owning client.
    // WHY COND_OwnerOnly: Other players don't need your ammo count.
    // This saves bandwidth in games with many players.
    DOREPLIFETIME_CONDITION(AMyCharacter, CurrentAmmo, COND_OwnerOnly);
}
```

### Step 3: Handle OnRep Callbacks

```cpp
void AMyCharacter::OnRep_CurrentAmmo()
{
    // WHY OnRep: This fires on CLIENTS when the server's value arrives.
    // It does NOT fire on the server — if the server needs to react,
    // call the update logic manually after changing the value.
    UpdateAmmoUI(CurrentAmmo);
}
```

> **Critical rule:** `GetLifetimeReplicatedProps` is called **once per class**, not per instance. Never conditionally register properties based on instance state — the replication layout must be identical for all instances of the class.

### Common Replication Conditions

| Condition | Replicates To |
|-----------|---------------|
| `COND_None` | All clients (default) |
| `COND_OwnerOnly` | Only the actor's owner |
| `COND_SkipOwner` | Everyone except the owner |
| `COND_SimulatedOnly` | Simulated proxies only |
| `COND_AutonomousOnly` | Autonomous proxy only |
| `COND_InitialOnly` | Once at spawn, then never again |
| `COND_Custom` | Override `PreReplication()` for per-property logic |

---

## Remote Procedure Calls (RPCs)

RPCs are function calls that execute on a different machine than where they were invoked.

### Three RPC Types

```cpp
UCLASS()
class MYGAME_API AMyCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    // ── SERVER RPC ──
    // Called on client → executed on server
    // WHY Reliable: Firing a weapon is gameplay-critical; dropped packets
    // would mean the shot never registers.
    // WHY WithValidation: Server must validate client requests to prevent
    // cheating (e.g., firing faster than the weapon allows).
    UFUNCTION(Server, Reliable, WithValidation)
    void Server_Fire(FVector AimDirection);

    // ── CLIENT RPC ──
    // Called on server → executed on the owning client only
    // WHY Client RPC: Notify the specific player of a personal event
    // (reward, achievement, cooldown reset) without broadcasting to everyone.
    UFUNCTION(Client, Reliable)
    void Client_NotifyReward(int32 XPGained);

    // ── MULTICAST RPC ──
    // Called on server → executed on server AND all clients
    // WHY Unreliable: Cosmetic effects (explosions, hit FX) are fire-and-forget.
    // Dropping one doesn't affect gameplay correctness.
    UFUNCTION(NetMulticast, Unreliable)
    void Multicast_PlayHitEffect(FVector HitLocation, FRotator HitNormal);
};
```

### RPC Implementation

```cpp
// Server RPC: requires _Implementation and _Validate suffixes
void AMyCharacter::Server_Fire_Implementation(FVector AimDirection)
{
    // WHY validate: Reject impossible aim directions, rate-limit fire requests.
    // This runs on the server where we have authority.

    // Spawn projectile, apply damage, update replicated ammo
    CurrentAmmo--;
    // OnRep_CurrentAmmo fires automatically on the owning client

    // Tell ALL clients to show the muzzle flash
    Multicast_PlayHitEffect(GetActorLocation(), AimDirection.Rotation());
}

bool AMyCharacter::Server_Fire_Validate(FVector AimDirection)
{
    // WHY Validate: Returning false disconnects the client — use it for
    // cheat detection. Return true for legitimate requests.
    return AimDirection.IsNormalized() && CurrentAmmo > 0;
}

// Client RPC: no _Validate needed (server-initiated, so trust is assumed)
void AMyCharacter::Client_NotifyReward_Implementation(int32 XPGained)
{
    ShowRewardPopup(XPGained);
}

// Multicast RPC
void AMyCharacter::Multicast_PlayHitEffect_Implementation(
    FVector HitLocation, FRotator HitNormal)
{
    // Spawn a Niagara particle system, play a sound cue, etc.
    // This runs on every machine including the server.
    UNiagaraFunctionLibrary::SpawnSystemAtLocation(
        this, HitEffectSystem, HitLocation, HitNormal);
}
```

### Reliable vs. Unreliable

| | Reliable | Unreliable |
|---|----------|------------|
| Delivery | Guaranteed, ordered | Best-effort, may drop |
| Use for | Gameplay-critical (fire, ability, purchase) | Cosmetic (FX, sounds, animation triggers) |
| Danger | **Overflow risk** — too many Reliable calls in a burst can saturate the buffer and disconnect the client | Dropped packets are invisible |

> **Rule of thumb:** If dropping the call doesn't break the game, make it Unreliable.

---

## Ownership

Ownership determines which client can send Server RPCs on an actor and which receives Client RPCs.

```
PlayerController (Owner)
    └── Pawn (Owned by the PlayerController)
        └── Weapon Actor (Owned transitively)
```

- `SetOwner(AActor*)` — sets the owner chain
- `GetOwner()` — returns the immediate owner
- `IsOwnedBy(AActor*)` — checks the full ownership chain

```cpp
// WHY ownership matters for RPCs: A client can only call Server RPCs
// on actors they own. If a weapon isn't owned by the calling client,
// the Server RPC will be silently dropped.
void AMyCharacter::EquipWeapon(AWeapon* Weapon)
{
    if (HasAuthority())
    {
        Weapon->SetOwner(this);
        // Now the owning client can call Server RPCs on the weapon
    }
}
```

---

## Relevancy

Not every actor needs to replicate to every client. **Relevancy** controls which clients receive updates for which actors, saving bandwidth.

### Key Relevancy Properties

| Property | Effect |
|----------|--------|
| `bAlwaysRelevant` | Replicates to all clients regardless of distance |
| `bOnlyRelevantToOwner` | Only replicates to the owning client |
| `bNetLoadOnClient` | Client loads this actor from the level (not spawned by replication) |
| `NetCullDistanceSquared` | Squared distance beyond which the actor stops replicating |

```cpp
// In the actor's constructor
APickupItem::APickupItem()
{
    bReplicates = true;

    // WHY set cull distance: Pickups 50m away don't need to replicate.
    // This saves bandwidth in large open-world maps.
    NetCullDistanceSquared = 5000.f * 5000.f; // 50m squared
}
```

### Custom Relevancy

Override `IsNetRelevantFor()` for fine-grained control:

```cpp
bool AStealthEnemy::IsNetRelevantFor(
    const AActor* RealViewer,
    const AActor* ViewTarget,
    const FVector& SrcLocation) const
{
    // WHY custom relevancy: Invisible enemies shouldn't replicate to
    // clients that can't see them — prevents wallhack exploits.
    if (bIsCloaked && !IsVisibleToTeam(ViewTarget))
        return false;

    return Super::IsNetRelevantFor(RealViewer, ViewTarget, SrcLocation);
}
```

---

## Net Dormancy

Dormancy is an optimization that pauses replication for actors whose state isn't changing. This is significant for large worlds with many static or rarely-changing actors.

### Dormancy Modes

| Mode | Behavior |
|------|----------|
| `DORM_Never` | Always checks for replication (default) |
| `DORM_Awake` | Currently replicating; can go dormant when state stabilizes |
| `DORM_DormantAll` | Not replicating; must be explicitly woken |
| `DORM_DormantPartial` | Dormant to connections that already received latest state |
| `DORM_Initial` | Dormant from start until explicitly woken |

```cpp
// A treasure chest that only needs to replicate when opened
ATreasureChest::ATreasureChest()
{
    bReplicates = true;
    // WHY DormantAll: This chest sits in the world unchanged for most of
    // the match. No point in checking it for replication every frame.
    NetDormancy = DORM_DormantAll;
}

void ATreasureChest::Open(APlayerController* Opener)
{
    if (HasAuthority())
    {
        bIsOpen = true;

        // WHY FlushNetDormancy: Wakes the actor so the server sends
        // the updated bIsOpen state to all relevant clients.
        FlushNetDormancy();

        // After the open animation, this actor can go dormant again
        // because its state won't change further.
    }
}
```

---

## Common Architecture Patterns

### Pattern 1: Client-Side Prediction

For responsive movement, the owning client predicts locally while the server validates.

```cpp
// UCharacterMovementComponent handles this automatically for movement.
// WHY: Waiting for server confirmation before moving would add a full
// round-trip of latency to every input. Prediction hides this.
//
// For custom predicted actions, use the pattern:
// 1. Client executes action locally (optimistic)
// 2. Client sends Server RPC with the action
// 3. Server validates and either confirms or corrects
// 4. On correction, client snaps to the authoritative state
```

### Pattern 2: Gameplay State Replication (GameState + PlayerState)

```cpp
// Use GameState for match-wide data all clients need
UCLASS()
class AMyGameState : public AGameStateBase
{
    GENERATED_BODY()

public:
    UPROPERTY(ReplicatedUsing = OnRep_MatchTimer)
    float MatchTimeRemaining = 300.f;

    UFUNCTION()
    void OnRep_MatchTimer();
};

// Use PlayerState for per-player data all clients need
UCLASS()
class AMyPlayerState : public APlayerState
{
    GENERATED_BODY()

public:
    // WHY PlayerState and not PlayerController: PlayerState replicates
    // to all clients. PlayerController is only relevant to its owner.
    UPROPERTY(Replicated)
    int32 Kills = 0;

    UPROPERTY(Replicated)
    int32 Deaths = 0;

    UPROPERTY(Replicated)
    ETeam Team = ETeam::None;
};
```

### Pattern 3: Replicated Struct with Fast TArray Replication

For large, frequently-changing arrays (inventory, buff lists), use `FFastArraySerializer` to replicate only the changed elements instead of the entire array.

```cpp
// WHY Fast TArray: Regular TArray replication resends the entire array
// whenever any element changes. FFastArraySerializer diffs at the
// element level — critical for inventories with 50+ items.

USTRUCT()
struct FInventoryItem : public FFastArraySerializerItem
{
    GENERATED_BODY()

    UPROPERTY()
    int32 ItemID = 0;

    UPROPERTY()
    int32 StackCount = 1;

    // Called on clients when this specific item changes
    void PreReplicatedRemove(const FInventoryArray& ArraySerializer);
    void PostReplicatedAdd(const FInventoryArray& ArraySerializer);
    void PostReplicatedChange(const FInventoryArray& ArraySerializer);
};

USTRUCT()
struct FInventoryArray : public FFastArraySerializer
{
    GENERATED_BODY()

    UPROPERTY()
    TArray<FInventoryItem> Items;

    bool NetDeltaSerialize(FNetDeltaSerializeInfo& DeltaParms)
    {
        return FFastArraySerializer::FastArrayDeltaSerialize<
            FInventoryItem, FInventoryArray>(Items, DeltaParms, *this);
    }
};
```

---

## Optimization Checklist

1. **Replicate only what clients need.** Cosmetic effects (particles, sounds, ragdolls, decals) should NOT be replicated — play them locally via Multicast or OnRep callbacks.

2. **Use replication conditions.** `COND_OwnerOnly` for personal data (ammo, ability cooldowns), `COND_InitialOnly` for spawn-time config that never changes (team color, character mesh).

3. **Use Net Dormancy** for actors with infrequent state changes (pickups, doors, switches, environment objects).

4. **Set `NetCullDistanceSquared`** appropriately. Items far from a player don't need state updates.

5. **Prefer Unreliable Multicasts for cosmetics.** Reliable Multicasts for 100 clients means 100 guaranteed deliveries — that adds up fast.

6. **Validate all Server RPCs.** `WithValidation` + `_Validate()` is your cheat prevention boundary. Never trust client input.

7. **Batch state changes.** Modify multiple replicated properties in one function call rather than spreading them across ticks — the replication system batches per-actor, not per-property.

8. **Profile with `stat net`** and the Network Profiler (`-netprofile` launch arg) to identify bandwidth hogs.

```
stat net                — Live network stats (in/out bytes, packets, RPCs)
stat net conditions     — Connection quality per client
net.ListActorReplication— Show what's replicating and why
```

---

## Quick Reference: Where Networking Logic Lives

| Logic | Class | Why |
|-------|-------|-----|
| Match rules (scoring, win condition) | `AGameModeBase` | Server-only; can't be tampered with |
| Match state visible to all | `AGameStateBase` | Replicated to all clients |
| Per-player stats (kills, team) | `APlayerState` | Replicated to all clients, persists across respawns |
| Input → Server commands | `APlayerController` | Owns the connection; persists across Pawn death |
| Movement prediction | `UCharacterMovementComponent` | Built-in client prediction + server reconciliation |
| Abilities / buffs | Gameplay Ability System | Replication built into GAS framework |
| Persistent data (save, settings) | `UGameInstance` | Not replicated (local to each machine) |
