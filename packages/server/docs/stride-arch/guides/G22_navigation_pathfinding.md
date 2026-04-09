# G22 — Navigation and Pathfinding

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G02 — Bepu Physics](G02_bepu_physics.md)

Stride includes a built-in navigation system based on navigation meshes (navmeshes). Entities with a `NavigationComponent` can find and follow paths through walkable areas of your scene. Stride supports both editor-baked static navmeshes and runtime dynamic navmesh generation via `DynamicNavigationMeshSystem`. The underlying navmesh generation uses Recast-based algorithms (ported to C# via the DotRecast library).

---

## Table of Contents

1. [Core Concepts](#1--core-concepts)
2. [Navigation Mesh Setup (Editor)](#2--navigation-mesh-setup-editor)
3. [Navigation Groups and Agent Settings](#3--navigation-groups-and-agent-settings)
4. [Adding Navigation to Entities](#4--adding-navigation-to-entities)
5. [Pathfinding in Code](#5--pathfinding-in-code)
6. [Dynamic Navigation Meshes](#6--dynamic-navigation-meshes)
7. [Navigation Bounding Boxes](#7--navigation-bounding-boxes)
8. [Performance Considerations](#8--performance-considerations)
9. [Common Patterns](#9--common-patterns)
10. [Troubleshooting](#10--troubleshooting)

---

## 1 — Core Concepts

Stride's navigation system has three key pieces:

- **Navigation Mesh** — a baked representation of walkable surfaces in a scene, stored as an asset (`.sdnavmesh`). Stride creates one mesh layer per navigation group.
- **Navigation Group** — a configuration describing an agent type (radius, height, max climb, max slope). Different groups let you have different-sized agents (e.g., infantry vs. vehicles).
- **Navigation Component** — an entity component that references a navmesh and group, providing pathfinding methods like `TryFindPath`.

The navigation mesh is built from static colliders in the scene. Stride's Game Studio shows navmesh overlays as colored layers in the Scene Editor, updating in real time as you move geometry.

---

## 2 — Navigation Mesh Setup (Editor)

### Creating a Navigation Mesh Asset

1. In the **Asset View**, click **Add asset → Scenes → Navigation mesh**.
2. In the **Property Grid**, set the **Scene** property to the scene you want to generate a navmesh for.
3. Under **Groups**, click the green **+** button to add a navigation group.
4. Click **Replace** to assign a pre-defined navigation group (or create a new one).
5. Configure **Included collision groups** to control which physics colliders contribute to the mesh.

### Visualizing the Navmesh

Game Studio displays navigation meshes as colored overlays in the Scene Editor. Use the visibility menu (eye icon) to toggle individual group layers on or off. These display options are editor-only and have no effect on runtime behavior.

### Build Settings

The navigation mesh asset exposes build settings that control mesh granularity:

| Setting | Description | Default |
|---------|-------------|---------|
| **Cell Size** | Horizontal voxel resolution (smaller = more accurate, slower to build) | 0.3 |
| **Cell Height** | Vertical voxel resolution | 0.2 |
| **Tile Size** | Size of navmesh tiles (0 = single tile) | 32 |
| **Min Region Area** | Minimum region size to keep (filters small islands) | 2 |

> **Tip:** Start with defaults. Only reduce cell size if agents get stuck on tight geometry.

---

## 3 — Navigation Groups and Agent Settings

Navigation groups define the physical characteristics of an agent type. Create them in Game Settings under **Navigation Settings → Groups**.

| Property | Description | Typical Values |
|----------|-------------|----------------|
| **Agent Height** | How tall the agent is | 1.8 (humanoid) |
| **Agent Radius** | How wide the agent is | 0.4 (humanoid) |
| **Agent Max Climb** | Maximum step height the agent can climb | 0.25 |
| **Agent Max Slope** | Maximum walkable slope angle (degrees) | 45 |

### Multiple Groups

You can define multiple groups for different agent types:

```
NavigationSettings:
  Groups:
    - Name: "Humanoid"     → Height 1.8, Radius 0.4, MaxClimb 0.25, MaxSlope 45
    - Name: "SmallCreature" → Height 0.6, Radius 0.2, MaxClimb 0.15, MaxSlope 60
    - Name: "Vehicle"      → Height 2.5, Radius 1.2, MaxClimb 0.1,  MaxSlope 20
```

Each group produces its own navmesh layer. A humanoid can traverse narrow doorways that a vehicle cannot.

---

## 4 — Adding Navigation to Entities

### In the Editor

1. Select the entity that should navigate (e.g., an NPC).
2. In the **Property Grid**, click **Add component → Navigation**.
3. Set the **Navigation mesh** field to your navmesh asset (or leave empty for dynamic navigation).
4. Set the **Group** to the appropriate agent group.

### In Code

```csharp
// NavigationComponent is in Stride.Navigation namespace
var navComponent = new NavigationComponent();
navComponent.NavigationMesh = navMeshAsset; // reference to your NavigationMesh
navComponent.Group = myNavigationGroup;
entity.Add(navComponent);
```

---

## 5 — Pathfinding in Code

### Basic Pathfinding

The primary pathfinding method on `NavigationComponent`:

```csharp
public class EnemyAI : SyncScript
{
    // Assign in editor or code
    public Entity Target { get; set; }
    public float MoveSpeed { get; set; } = 3.0f;

    private readonly List<Vector3> pathPoints = new();
    private int currentWaypoint = 0;

    public override void Start()
    {
        FindPathToTarget();
    }

    public override void Update()
    {
        if (currentWaypoint >= pathPoints.Count)
            return;

        var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;
        var direction = pathPoints[currentWaypoint] - Entity.Transform.Position;

        if (direction.Length() < 0.3f)
        {
            // Reached waypoint, advance to next
            currentWaypoint++;
            return;
        }

        direction.Normalize();
        Entity.Transform.Position += direction * MoveSpeed * dt;
    }

    private void FindPathToTarget()
    {
        if (Target == null) return;

        var nav = Entity.Get<NavigationComponent>();
        var from = Entity.Transform.WorldMatrix.TranslationVector;
        var to = Target.Transform.WorldMatrix.TranslationVector;

        pathPoints.Clear();
        currentWaypoint = 0;

        // TryFindPath returns true if a valid path was found
        // pathPoints is populated with waypoints from 'from' to 'to'
        bool found = nav.TryFindPath(to, pathPoints);

        if (!found)
        {
            Log.Warning("No path found to target!");
        }
    }
}
```

### Key API Methods

| Method | Description |
|--------|-------------|
| `TryFindPath(Vector3 end, List<Vector3> path)` | Finds a path from the entity's current position to `end`. Returns `true` if a path exists. |
| `TryFindPath(Vector3 end, List<Vector3> path, NavigationQuerySettings settings)` | Overload with custom query settings (max path points, etc.). |

> **Important:** `TryFindPath` uses the entity's current world position as the start point. The entity must be on or near the navmesh for pathfinding to succeed.

---

## 6 — Dynamic Navigation Meshes

For scenes with runtime-modifiable geometry, Stride supports dynamic navmesh regeneration.

### Enabling Dynamic Navigation

1. Open **Game Settings** in the editor.
2. Under **Navigation Settings**, enable **Enable Dynamic Navigation**.
3. At runtime, `DynamicNavigationMeshSystem` automatically regenerates the navmesh when static colliders change.

### How It Works

- `DynamicNavigationMeshSystem` is a game system (registered automatically when dynamic navigation is enabled).
- It monitors scene colliders and rebuilds affected navmesh tiles when geometry changes.
- Entities with `NavigationComponent` and no explicit navmesh asset assigned will use the dynamically generated mesh.

### Performance Notes

- Dynamic regeneration rebuilds only the tiles affected by geometry changes (tiled navmesh).
- Set a reasonable **Tile Size** in your navigation build settings — smaller tiles mean faster incremental rebuilds but more tiles overall.
- For large scenes, use navigation bounding boxes to limit the area that is dynamically rebuilt.

---

## 7 — Navigation Bounding Boxes

Navigation bounding boxes limit the area considered for navmesh generation. This is useful for:

- **Performance:** Only build navmesh for playable areas, not the entire scene.
- **Dynamic navigation:** Restrict rebuild scope to relevant areas.

Add a `NavigationBoundingBoxComponent` to an entity to define the bounds:

```csharp
var boundingBox = new NavigationBoundingBoxComponent();
boundingBox.Size = new Vector3(50, 10, 50); // 50x50 area, 10 units tall
entity.Add(boundingBox);
```

In the editor, you can add the component and size it visually using the gizmo.

---

## 8 — Performance Considerations

| Concern | Recommendation |
|---------|----------------|
| **Navmesh build time** | Use tiled meshes (non-zero Tile Size). Increase Cell Size if build time is too long. |
| **Dynamic rebuild cost** | Use bounding boxes to limit scope. Avoid triggering rebuilds every frame. |
| **Pathfinding frequency** | Cache paths — don't call `TryFindPath` every frame. Re-path periodically or on events. |
| **Many agents** | Stagger pathfinding across frames. Not all agents need new paths simultaneously. |
| **Large scenes** | Use tile-based navmesh. Consider multiple navmesh assets for different scene regions. |

---

## 9 — Common Patterns

### Periodic Re-pathing

```csharp
public class PatrolAI : AsyncScript
{
    public List<Entity> PatrolPoints { get; set; } = new();
    public float MoveSpeed { get; set; } = 2.5f;
    public float RepathInterval { get; set; } = 1.0f;

    public override async Task Execute()
    {
        var nav = Entity.Get<NavigationComponent>();
        var path = new List<Vector3>();
        int patrolIndex = 0;

        while (Game.IsRunning)
        {
            if (PatrolPoints.Count == 0)
            {
                await Script.NextFrame();
                continue;
            }

            var target = PatrolPoints[patrolIndex].Transform.WorldMatrix.TranslationVector;
            nav.TryFindPath(target, path);

            // Follow path waypoints
            foreach (var waypoint in path)
            {
                while ((waypoint - Entity.Transform.Position).Length() > 0.3f)
                {
                    var dir = Vector3.Normalize(waypoint - Entity.Transform.Position);
                    var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;
                    Entity.Transform.Position += dir * MoveSpeed * dt;
                    await Script.NextFrame();
                }
            }

            // Advance to next patrol point
            patrolIndex = (patrolIndex + 1) % PatrolPoints.Count;

            // Small delay before next patrol leg
            await Task.Delay(TimeSpan.FromSeconds(RepathInterval));
        }
    }
}
```

### Click-to-Move

```csharp
public class ClickToMove : SyncScript
{
    public float MoveSpeed { get; set; } = 4.0f;
    public CameraComponent Camera { get; set; }

    private readonly List<Vector3> path = new();
    private int waypointIndex = 0;

    public override void Update()
    {
        // On mouse click, raycast to find target position
        if (Input.IsMouseButtonPressed(MouseButton.Left) && Camera != null)
        {
            var ray = Camera.ScreenToWorldRay(Input.MousePosition);
            // Use physics raycast to find ground hit point
            var simulation = this.GetSimulation();
            if (simulation != null)
            {
                // Find path to click position via navmesh
                var nav = Entity.Get<NavigationComponent>();
                // Use the hit point as target (simplified — real code needs raycast)
                // nav.TryFindPath(hitPoint, path);
                waypointIndex = 0;
            }
        }

        // Follow current path
        if (waypointIndex < path.Count)
        {
            var target = path[waypointIndex];
            var dir = target - Entity.Transform.Position;
            if (dir.Length() < 0.3f)
            {
                waypointIndex++;
            }
            else
            {
                dir.Normalize();
                var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;
                Entity.Transform.Position += dir * MoveSpeed * dt;
            }
        }
    }
}
```

---

## 10 — Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `TryFindPath` always returns `false` | Entity not on navmesh | Ensure entity position is on or very near a walkable surface |
| Agent walks through walls | Navmesh cell size too large | Reduce Cell Size in build settings |
| Navmesh doesn't cover expected areas | Collision groups mismatch | Check Included collision groups on the navmesh asset |
| Dynamic navmesh not updating | Dynamic navigation not enabled | Enable in Game Settings → Navigation Settings |
| Agent oscillates between two points | Waypoint tolerance too tight | Increase the arrival distance threshold (e.g., 0.3 → 0.5) |
| Navmesh build is slow | Cell size too small or scene too large | Increase cell size, use tiled generation, add bounding boxes |

---

## See Also

- [G02 — Bepu Physics](G02_bepu_physics.md) — physics colliders that inform navmesh generation
- [G18 — Scripting Patterns](G18_scripting_patterns.md) — AsyncScript patterns used in AI agents
- [G20 — Scene Management](G20_scene_management_composition.md) — loading scenes with navigation data
