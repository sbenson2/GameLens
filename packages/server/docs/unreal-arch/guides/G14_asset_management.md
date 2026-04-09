# G14 — Asset Management and Async Loading in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G12 World Partition & Streaming](G12_world_partition_streaming.md) · [G9 Rendering (Nanite/Lumen)](G9_rendering_nanite_lumen.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unreal Rules](../unreal-arch-rules.md)

Asset management determines how your game loads content into memory, when it loads, and when it releases. Poor asset management causes the three most common shipping bugs: hitches from synchronous loads during gameplay, out-of-memory crashes from assets that never unload, and 5-minute initial load screens from hard references that pull in the entire project. This guide covers Unreal's reference system, the Asset Manager, async loading with StreamableManager, Primary Assets, and practical patterns for keeping load times fast and memory predictable.

---

## Why Asset Management Matters

Every `UPROPERTY` that points to a `UObject` asset (mesh, texture, blueprint, data table) creates a **reference**. Unreal follows references at load time — when one asset loads, all referenced assets load too. Without discipline, this creates a **reference chain** where loading a single Blueprint pulls in half the project:

```
BP_PlayerCharacter
  ├─ SK_PlayerMesh (10 MB)
  ├─ ABP_PlayerAnimBP
  │    └─ 47 Animation Sequences (200 MB)
  ├─ BP_WeaponBase
  │    ├─ SM_Sword (2 MB)
  │    ├─ SM_Shield (3 MB)
  │    └─ BP_ProjectileBase
  │         ├─ NS_Explosion (5 MB)
  │         └─ SM_Arrow (500 KB)
  └─ WBP_PlayerHUD
       └─ T_AllUITextures (50 MB)

Total loaded just to spawn the player: ~270 MB
Most of it not needed at spawn time.
```

The fix is **soft references** — they store the *path* to an asset without loading it, letting you decide *when* and *whether* to load.

---

## Hard vs Soft References

| Aspect | Hard Reference | Soft Reference |
|--------|---------------|----------------|
| **C++ type** | `TObjectPtr<UStaticMesh>` / raw `UStaticMesh*` | `TSoftObjectPtr<UStaticMesh>` |
| **Blueprint** | Direct asset reference | Soft Object Reference |
| **Load behavior** | Asset loaded automatically with the outer | Asset NOT loaded — path stored only |
| **Class variant** | `TSubclassOf<AActor>` | `TSoftClassPtr<AActor>` |
| **When to use** | Always-needed assets (player mesh) | Conditional assets (weapon pickups, level-specific content) |
| **Memory impact** | Immediate — loaded at outer load time | Deferred — loaded only when you request it |

### Declaring Soft References

```cpp
UCLASS()
class AWeaponPickup : public AActor
{
    GENERATED_BODY()

public:
    // HARD reference — this mesh loads when the pickup loads.
    // Fine for the small pickup mesh itself.
    UPROPERTY(EditDefaultsOnly)
    TObjectPtr<UStaticMesh> PickupMesh;

    // SOFT reference — the full weapon Blueprint is NOT loaded until
    // the player actually picks this up. Could be a 50 MB weapon with
    // VFX, sounds, and animations.
    // WHY soft: the player might never pick up this weapon. Loading it
    // eagerly wastes memory for every pickup in the level.
    UPROPERTY(EditDefaultsOnly)
    TSoftClassPtr<AWeaponBase> WeaponClass;

    // SOFT object reference — a specific asset instance (not a class)
    UPROPERTY(EditDefaultsOnly)
    TSoftObjectPtr<USoundBase> PickupSound;
};
```

---

## Async Loading with FStreamableManager

`FStreamableManager` is the workhorse for loading soft references on demand without hitching the game thread:

### Basic Async Load

```cpp
void AWeaponPickup::OnPlayerInteract(ACharacter* Player)
{
    if (WeaponClass.IsNull())
        return;

    // WHY async: synchronous LoadObject() blocks the game thread until
    // the asset is fully loaded from disk. On HDD this can be 100ms+,
    // causing a visible hitch. Async loading spreads the work across
    // multiple frames.
    FStreamableManager& StreamableManager =
        UAssetManager::GetStreamableManager();

    // RequestAsyncLoad returns a handle that keeps the asset in memory
    // until the handle is released.
    StreamableHandle = StreamableManager.RequestAsyncLoad(
        WeaponClass.ToSoftObjectPath(),
        FStreamableDelegate::CreateUObject(
            this, &AWeaponPickup::OnWeaponLoaded, Player)
    );
}

void AWeaponPickup::OnWeaponLoaded(ACharacter* Player)
{
    // WHY we check IsValid: the player might have moved away or died
    // between the load request and completion.
    if (!IsValid(Player))
        return;

    UClass* LoadedClass = WeaponClass.Get();
    if (LoadedClass)
    {
        AWeaponBase* Weapon = GetWorld()->SpawnActor<AWeaponBase>(LoadedClass);
        Player->EquipWeapon(Weapon);
    }
}
```

### Loading Multiple Assets

```cpp
void AMyGameMode::PreloadLevelAssets()
{
    // WHY batch loading: loading assets one at a time causes overhead from
    // repeated IO scheduling. Batching lets the IO system optimize disk
    // seeks and parallelize decompression.

    TArray<FSoftObjectPath> AssetsToLoad;
    AssetsToLoad.Add(EnemyMesh.ToSoftObjectPath());
    AssetsToLoad.Add(EnemyAnimBP.ToSoftObjectPath());
    AssetsToLoad.Add(AmbientSoundscape.ToSoftObjectPath());

    FStreamableManager& Manager = UAssetManager::GetStreamableManager();

    // RequestAsyncLoad with an array — all assets load in parallel
    BatchHandle = Manager.RequestAsyncLoad(
        AssetsToLoad,
        FStreamableDelegate::CreateUObject(this, &AMyGameMode::OnAssetsReady)
    );
}

void AMyGameMode::OnAssetsReady()
{
    // All three assets are now in memory — safe to spawn enemies, etc.
    UE_LOG(LogGame, Log, TEXT("Level assets preloaded"));
}
```

### Handle Lifetime and Memory Release

```cpp
// The StreamableHandle keeps assets in memory. When you're done:
if (StreamableHandle.IsValid())
{
    // ReleaseHandle decrements the reference count. If no other handle
    // references these assets, they become eligible for GC.
    StreamableHandle->ReleaseHandle();
    StreamableHandle.Reset();
}

// WHY explicit release: unlike garbage collection for UObjects, Streamable
// assets are reference-counted. If you never release the handle, the asset
// stays in memory forever — even if no gameplay code references it.
```

---

## The Asset Manager (UAssetManager)

The Asset Manager is a global singleton that provides higher-level asset management: discovery, loading by type, and memory budgets. It builds on top of `FStreamableManager`.

### Primary Assets

A **Primary Asset** is any asset identified by a `FPrimaryAssetId` — a struct with a Type and Name. Primary Assets are the units the Asset Manager tracks:

```cpp
// WHY UPrimaryDataAsset: regular UDataAsset works but doesn't integrate
// with the Asset Manager's type system. UPrimaryDataAsset automatically
// registers itself by type, enabling bulk queries like "load all items."

UCLASS()
class UItemDefinition : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    // Override to define this asset's type + name for the Asset Manager
    virtual FPrimaryAssetId GetPrimaryAssetId() const override
    {
        // WHY custom type: the Asset Manager uses type strings to group
        // assets. "Item" lets you call GetPrimaryAssetIdList("Item") to
        // get all items in the project.
        return FPrimaryAssetId("Item", GetFName());
    }

    UPROPERTY(EditDefaultsOnly)
    FText DisplayName;

    UPROPERTY(EditDefaultsOnly)
    TSoftObjectPtr<UStaticMesh> Mesh;

    UPROPERTY(EditDefaultsOnly)
    int32 BaseValue;
};
```

### Configuring Asset Manager Rules

In `DefaultGame.ini`, tell the Asset Manager where to find primary assets:

```ini
[/Script/Engine.AssetManagerSettings]
; WHY directory rules: the Asset Manager scans these paths at startup
; to discover primary assets. Without this, it won't find your items.
+PrimaryAssetTypesToScan=(PrimaryAssetType="Item",AssetBaseClass="/Script/MyGame.UItemDefinition",bHasBlueprintClasses=false,Directories=((Path="/Game/Data/Items")))
+PrimaryAssetTypesToScan=(PrimaryAssetType="Map",AssetBaseClass="/Script/Engine.World",bHasBlueprintClasses=false,Directories=((Path="/Game/Maps")))
```

### Loading Primary Assets

```cpp
void AMyGameMode::LoadAllItems()
{
    UAssetManager& AssetManager = UAssetManager::Get();

    // Get all registered items
    TArray<FPrimaryAssetId> ItemIds;
    AssetManager.GetPrimaryAssetIdList("Item", ItemIds);

    UE_LOG(LogGame, Log, TEXT("Found %d items to load"), ItemIds.Num());

    // Async-load all of them. The "BundleName" parameter can filter
    // which secondary assets to load (e.g., only meshes, not sounds).
    TArray<FName> Bundles;
    Bundles.Add("Gameplay"); // Load only gameplay-relevant sub-assets

    AssetManager.LoadPrimaryAssets(
        ItemIds,
        Bundles,
        FStreamableDelegate::CreateUObject(this, &AMyGameMode::OnItemsLoaded)
    );
}

void AMyGameMode::OnItemsLoaded()
{
    UAssetManager& AssetManager = UAssetManager::Get();

    TArray<FPrimaryAssetId> ItemIds;
    AssetManager.GetPrimaryAssetIdList("Item", ItemIds);

    for (const FPrimaryAssetId& Id : ItemIds)
    {
        // GetPrimaryAssetObject returns the loaded UObject
        UItemDefinition* Item = AssetManager.GetPrimaryAssetObject<UItemDefinition>(Id);
        if (Item)
        {
            UE_LOG(LogGame, Log, TEXT("Loaded item: %s"), *Item->DisplayName.ToString());
        }
    }
}
```

### Asset Bundles

Bundles let you tag secondary assets within a primary asset so you can load subsets:

```cpp
UCLASS()
class UItemDefinition : public UPrimaryDataAsset
{
    GENERATED_BODY()

public:
    // "UI" bundle — only load this when showing the inventory screen
    UPROPERTY(EditDefaultsOnly, meta = (AssetBundles = "UI"))
    TSoftObjectPtr<UTexture2D> InventoryIcon;

    // "Gameplay" bundle — load this when spawning the item in-world
    UPROPERTY(EditDefaultsOnly, meta = (AssetBundles = "Gameplay"))
    TSoftObjectPtr<UStaticMesh> WorldMesh;

    // "Gameplay" bundle
    UPROPERTY(EditDefaultsOnly, meta = (AssetBundles = "Gameplay"))
    TSoftObjectPtr<USoundBase> PickupSound;
};
```

Now you can load only the UI textures for the inventory screen without pulling in 3D meshes and sounds:

```cpp
// Only load UI sub-assets — much faster for inventory screen
TArray<FName> UIBundles;
UIBundles.Add("UI");
AssetManager.LoadPrimaryAssets(ItemIds, UIBundles, OnUIReady);
```

---

## Common Patterns

### Preloading During Loading Screens

```cpp
void UMyLoadingScreen::StartLoad(FName LevelName)
{
    UAssetManager& Manager = UAssetManager::Get();

    // WHY preload during loading screen: the player is already waiting.
    // Use this time to async-load everything the level needs so there
    // are zero hitches once gameplay starts.

    // Load level-specific items, enemies, environment
    TArray<FPrimaryAssetId> LevelAssets = GetAssetsForLevel(LevelName);

    TArray<FName> AllBundles;
    AllBundles.Add("Gameplay");
    AllBundles.Add("UI");

    Manager.LoadPrimaryAssets(
        LevelAssets, AllBundles,
        FStreamableDelegate::CreateLambda([this, LevelName]()
        {
            UE_LOG(LogGame, Log, TEXT("Assets preloaded for %s"), *LevelName.ToString());
            OpenLevel(LevelName);
        })
    );
}
```

### Reference Auditing with the Size Map

The **Size Map** tool (Window → Developer Tools → Size Map) visualizes the memory cost of hard references. Use it regularly to catch accidental reference chains:

1. Right-click any asset → Size Map
2. Look for unexpectedly large branches — these are assets pulled in by hard references
3. Convert the largest unnecessary references to `TSoftObjectPtr`

### The Golden Rule

> **Default to soft references. Use hard references only for assets you need *immediately* and *always*.**

A `TSoftObjectPtr` costs 40 bytes (just a path). A hard reference costs the entire asset in memory. When in doubt, go soft and load on demand.

---

## Memory Management Checklist

| Concern | Solution |
|---------|----------|
| Assets loading at startup that aren't needed | Convert to `TSoftObjectPtr`, load on demand |
| Hitch when entering a new area | Preload during loading screen or transition |
| Memory climbing over time | Release `StreamableHandle` when leaving area/level |
| "Why is this asset loaded?" | Use Asset Audit window or Size Map to trace references |
| Large Blueprint loading chains | Break into smaller Blueprints, use soft class references |
| Packaging assets for DLC | Asset Manager chunks + primary asset rules in `DefaultGame.ini` |

---

## Reference vs Loading Strategy Matrix

| Scenario | Reference Type | Loading Strategy |
|----------|---------------|-----------------|
| Player character mesh (always visible) | Hard | Loaded with level |
| Enemy type (one of 20 variants) | Soft class | Async load on spawn or preload at level start |
| Weapon pickup (player may never get it) | Soft object | Async load on interact |
| Inventory icon (only shown in menus) | Soft + UI bundle | Load with inventory screen, unload on close |
| Cutscene assets (played once) | Soft object | Preload before cutscene, release after |
| Audio bank for a biome | Soft object | Preload on area enter, release on area exit |

---

## Further Reading

- [Asset Management (UE5 Official)](https://dev.epicgames.com/documentation/unreal-engine/asset-management-in-unreal-engine)
- [Tom Looman: Asset Manager for Data Assets & Async Loading](https://tomlooman.com/unreal-engine-asset-manager-async-loading/)
- [Async Loading with StreamableManager](https://zomgmoz.tv/unreal/How-to-load-assets-asynchronously-with-StreamableManager)
- [Unreal Community Wiki: Using the Asset Manager](https://unrealcommunity.wiki/using-the-asset-manager-qj38astq)
