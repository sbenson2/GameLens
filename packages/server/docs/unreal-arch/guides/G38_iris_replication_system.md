# Iris Replication System

> **Category:** guide · **Engine:** Unreal Engine · **Related:** [G5 Networking & Replication](G5_networking_replication.md), [G12 World Partition & Streaming](G12_world_partition_streaming.md), [G23 Mass Entity Framework](G23_mass_entity_framework.md)

Iris is Unreal Engine's next-generation opt-in replication system designed to replace the legacy `UNetDriver`-based replication pipeline. It targets robust multiplayer experiences with large interactive worlds and high player counts (100+ concurrent players in a single area). Introduced experimentally in UE 5.3, Iris moved to **Beta** status in UE 5.7.

---

## Why Iris?

The legacy replication system in Unreal Engine was designed for smaller-scale multiplayer (typically 16–64 players). As open-world games and large-scale simulations became more common, several bottlenecks emerged:

- **O(N²) relevancy checks** — every actor is checked against every connection each tick
- **Single-threaded replication** — the net driver serializes all actor state on the game thread
- **Tight coupling** — replication logic is deeply embedded in `AActor` and `UActorChannel`

Iris addresses these by introducing a modular, data-driven architecture with spatial filtering, parallel serialization, and cleaner API boundaries.

## Architecture Overview

Iris is built around four core components that replace or wrap the legacy systems:

### 1. ReplicationSystem

The top-level coordinator that manages the replication lifecycle. It owns the bridges, protocols, and data streams. You interact with it primarily through configuration rather than direct API calls.

```cpp
// In your GameMode or GameInstance, Iris is enabled via project settings
// or by adding to DefaultEngine.ini:
// [/Script/Engine.Engine]
// NetDriverDefinition=(DefName="GameNetDriver",DriverClassName="/Script/IrisCore.IrisNetDriver",...)
```

### 2. ReplicationBridge

The bridge translates between Unreal's object model and Iris's internal replication protocol. In UE 5.7, the base `UReplicationBridge` class was refactored to reduce virtual call overhead, resulting in cleaner API boundaries.

Key responsibilities:
- Registering objects (Actors, UObjects) for replication
- Managing object lifecycle (creation, destruction, dormancy)
- Handling property serialization deltas

### 3. DataStream

DataStreams are the transport layer — they move serialized replication data between server and clients. Iris uses `DataStreamChannel` as the net driver channel class, replacing the legacy `UActorChannel` approach.

Configuration in `DefaultEngine.ini`:
```ini
[/Script/IrisCore.IrisNetDriver]
NetConnectionClassName=/Script/IrisCore.IrisNetConnection
```

### 4. Spatial Filtering (ReplicationFilter)

Instead of the legacy relevancy system that checks every actor against every connection, Iris uses spatial partitioning to efficiently determine which objects are relevant to which clients. This integrates with World Partition's grid-based streaming.

## Enabling Iris (UE 5.7+)

### Step 1: Enable the Plugin

In the Unreal Editor, go to **Edit → Plugins** and enable **Iris Networking (Beta)**.

### Step 2: Update Project Configuration

Add Iris support to your `.Build.cs` module:

```csharp
// In your game module's Build.cs
public class MyGame : ModuleRules
{
    public MyGame(ReadOnlyTargetRules Target) : base(Target)
    {
        // ... existing configuration ...
        
        SetupIrisSupport(Target);
    }
}
```

### Step 3: Configure the Net Driver

In `DefaultEngine.ini`, register the Iris net driver:

```ini
[/Script/Engine.Engine]
!NetDriverDefinitions=ClearArray
+NetDriverDefinitions=(DefName="GameNetDriver",DriverClassName="/Script/IrisCore.IrisNetDriver",DriverClassNameFallback="/Script/OnlineSubsystemUtils.IpNetDriver")
```

### Step 4: Verify in Editor

Launch a PIE session with multiple clients. Open the console and run:
```
net.Iris.LogLevel 2
```
You should see Iris-specific log output confirming the system is active.

## Key Concepts

### Object Replication

Iris supports replication of both `AActor` and `UObject` subclasses. UObject replication is a significant improvement over the legacy system, which was limited to Actor-based replication.

```cpp
// Mark a UObject subclass for Iris replication
UCLASS()
class UMyReplicatedObject : public UObject
{
    GENERATED_BODY()
    
    UPROPERTY(Replicated)
    int32 Score;
    
    UPROPERTY(Replicated)
    FVector Position;
    
    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override;
};
```

### Prioritization and Frequency

Iris uses a priority system that considers:
- **Distance** from the client's view
- **Update frequency** caps per object class
- **Bandwidth budget** allocation per connection

### Dormancy

Objects that haven't changed can enter dormancy, removing them from the active replication set entirely. This is critical for open-world games with thousands of static objects.

```cpp
// Force an actor to flush its state and go dormant
MyActor->FlushNetDormancy();
MyActor->SetNetDormancy(DORM_DormantAll);
```

## Performance Characteristics

| Metric | Legacy Replication | Iris |
|--------|-------------------|------|
| Relevancy complexity | O(N × C) per tick | Spatial grid lookup |
| Max practical players | ~64 | 100+ tested |
| UObject replication | Not supported | Supported |
| Thread safety | Game thread only | Parallel serialization |
| World Partition integration | Limited | Native spatial filtering |

## Migration Guide

Iris is designed as opt-in and backward-compatible. Existing `UPROPERTY(Replicated)` and `DOREPLIFETIME` macros continue to work. Migration steps:

1. **Enable the plugin** and configure the net driver (see above)
2. **Test existing replication** — most Actor-based replication works unchanged
3. **Migrate custom net code** — replace any direct `UActorChannel` usage with Iris APIs
4. **Profile with `stat net`** and Iris-specific stats to validate performance improvements
5. **Adopt UObject replication** where appropriate to reduce Actor overhead

## Common Pitfalls

- **Don't mix net drivers in the same session** — Iris and legacy cannot coexist on the same connection
- **FastArray replication** requires Iris-specific setup in UE 5.7+ (see Epic's FastArray example)
- **Custom serialization** (`NetSerialize`) works but must be tested — some edge cases differ from the legacy path
- **Plugin dependencies** — ensure `IrisCore` is listed in your `.uproject` and `.Build.cs` dependencies

## Version History

| Version | Status | Key Changes |
|---------|--------|-------------|
| UE 5.3 | Experimental | Initial Iris introduction |
| UE 5.4 | Experimental | Spatial filtering improvements |
| UE 5.5 | Experimental | Stability fixes, better profiling hooks |
| UE 5.6 | Experimental | UObject replication support expanded |
| UE 5.7 | **Beta** | Removed UReplicationBridge base class overhead, cleaner APIs, production-ready for testing |

## Further Reading

- [Epic Official: Introduction to Iris](https://dev.epicgames.com/documentation/en-us/unreal-engine/introduction-to-iris-in-unreal-engine)
- [Epic Official: Components of Iris](https://dev.epicgames.com/documentation/en-us/unreal-engine/components-of-iris-in-unreal-engine)
- [BorMor: Iris — 100 Players in One Place](https://bormor.dev/posts/iris-one-hundred-players/)
- [BorMor: Iris UObject Replication](https://bormor.dev/posts/iris-uobject-replication/)
- [Epic Forums: Getting Started With Iris](https://dev.epicgames.com/community/learning/tutorials/Xexv/unreal-engine-experimental-getting-started-with-iris)
