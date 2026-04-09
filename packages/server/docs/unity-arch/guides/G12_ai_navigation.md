# AI & Navigation (NavMesh)

> **Category:** guide · **Engine:** Unity 6 · **Related:** [G1 Scene Management](G1_scene_management.md), [G3 Physics & Collision](G3_physics_and_collision.md)

Unity's AI Navigation package (2.0+) provides a high-level pathfinding system built on NavMesh — a simplified mesh representing walkable surfaces. Agents query this mesh to find optimal paths, avoid obstacles, and traverse links between disconnected areas. This guide covers the Navigation 2.0 package shipped with Unity 6 (com.unity.ai.navigation 2.0.x).

---

## Core Architecture

The navigation system has four layers:

1. **NavMesh** — baked or runtime-generated walkable surface data
2. **NavMeshAgent** — component that moves a character along computed paths
3. **NavMeshObstacle** — dynamic blocker that carves holes in the NavMesh
4. **NavMeshLink** — bridge between disconnected NavMesh regions (jumps, ladders, teleports)

Supporting components control *how* the mesh is built:

- **NavMeshSurface** — defines which geometry contributes to a baked NavMesh
- **NavMeshModifier** — overrides area type for a hierarchy of objects
- **NavMeshModifierVolume** — overrides area type inside a volume

### Why NavMesh instead of grid-based pathfinding?

NavMesh is more memory-efficient for 3D worlds because it represents
walkable *polygons* rather than a dense grid of cells. Path queries run
on the polygon graph, which is orders of magnitude smaller than an
equivalent grid. Grid-based approaches (like A* on a tile map) are
still valid for 2D or highly uniform layouts.

---

## Setting Up Navigation

### 1. Install the Package

The AI Navigation package ships with Unity 6 but may need activation:

```
Window → Package Manager → Unity Registry → AI Navigation → Install
```

### 2. Add a NavMeshSurface

Attach a `NavMeshSurface` component to an empty GameObject (often named "NavMesh"). Configure:

| Property | Recommended Default | Why |
|---|---|---|
| Agent Type | Humanoid | Matches most character capsules |
| Collect Objects | All Game Objects | Navigation 2.0 no longer requires "Navigation Static" flag |
| Use Geometry | Render Meshes | More accurate than colliders for walkable surfaces |
| Default Area | Walkable | Base cost = 1 for pathfinding |

Click **Bake** in the inspector to generate the mesh. The blue overlay in Scene view confirms success.

### 3. Add a NavMeshAgent

```csharp
using UnityEngine;
using UnityEngine.AI;

/// Controls AI movement toward a target using Unity's NavMesh system.
/// WHY NavMeshAgent instead of manual steering:
///   - Handles path smoothing, obstacle avoidance, and crowd simulation
///   - Automatically re-paths when the NavMesh changes at runtime
[RequireComponent(typeof(NavMeshAgent))]
public class AIChaser : MonoBehaviour
{
    [SerializeField] private Transform target;
    private NavMeshAgent _agent;

    void Start()
    {
        _agent = GetComponent<NavMeshAgent>();
        // Speed and stopping distance are set in the Inspector,
        // but you can override them here for dynamic difficulty
    }

    void Update()
    {
        if (target != null)
        {
            // SetDestination triggers a path query on the NavMesh.
            // The agent will automatically navigate around obstacles.
            _agent.SetDestination(target.position);
        }
    }
}
```

Key `NavMeshAgent` properties to tune:

- **Speed** — movement speed in world units/second
- **Angular Speed** — turn rate in degrees/second
- **Stopping Distance** — how close to the destination before the agent stops
- **Auto Braking** — decelerate near the destination (disable for patrol loops)
- **Avoidance Priority** — lower values = higher priority in crowd avoidance (0–99)

---

## Common Patterns

### Patrol Between Waypoints

```csharp
using UnityEngine;
using UnityEngine.AI;

/// Patrols between a set of waypoints in order.
/// WHY we check remainingDistance instead of comparing positions:
///   - NavMeshAgent snaps to the NavMesh surface, so exact position
///     matching is unreliable. remainingDistance accounts for path length.
public class Patrol : MonoBehaviour
{
    [SerializeField] private Transform[] waypoints;
    private NavMeshAgent _agent;
    private int _currentIndex = 0;

    void Start()
    {
        _agent = GetComponent<NavMeshAgent>();
        // Disable auto-braking so the agent doesn't slow at each waypoint
        _agent.autoBraking = false;
        GoToNextWaypoint();
    }

    void Update()
    {
        // pathPending is true while the NavMesh is computing the path.
        // We wait until it's ready before checking distance.
        if (!_agent.pathPending && _agent.remainingDistance < 0.5f)
        {
            GoToNextWaypoint();
        }
    }

    private void GoToNextWaypoint()
    {
        if (waypoints.Length == 0) return;
        _agent.SetDestination(waypoints[_currentIndex].position);
        _currentIndex = (_currentIndex + 1) % waypoints.Length;
    }
}
```

### Dynamic Obstacle Avoidance

Attach `NavMeshObstacle` to moving objects (doors, vehicles) that block paths:

```csharp
/// WHY Carve mode vs. just using a collider:
///   - Carve dynamically updates the NavMesh, creating new paths around the obstacle.
///   - A plain collider only blocks the agent's local avoidance, not global pathfinding.
///   - Use Carve for objects that stay still for a while (doors, barricades).
///   - Use non-Carve for constantly moving objects (the local avoidance system handles them).
[RequireComponent(typeof(NavMeshObstacle))]
public class DynamicDoor : MonoBehaviour
{
    private NavMeshObstacle _obstacle;

    void Awake()
    {
        _obstacle = GetComponent<NavMeshObstacle>();
        // Carve = true cuts a hole in the NavMesh when the door is closed
        _obstacle.carving = true;
        // Move threshold: only re-carve if the obstacle moves more than this distance
        _obstacle.carvingMoveThreshold = 0.1f;
    }

    public void Open()
    {
        // Disabling the obstacle restores the NavMesh underneath
        _obstacle.enabled = false;
    }

    public void Close()
    {
        _obstacle.enabled = true;
    }
}
```

### NavMeshLink for Jumps / Ladders

Use `NavMeshLink` to connect disconnected surfaces:

1. Add a `NavMeshLink` component to a GameObject at the jump origin
2. Set **Start Point** and **End Point** (local offsets or world positions)
3. Set **Width** to control how wide the traversal is
4. Assign an **Area Type** (e.g., "Jump") with a higher cost so agents prefer walking

```csharp
/// Detect when an agent starts traversing a link (e.g., to play a jump animation).
/// WHY we use OffMeshLinkData instead of just checking position:
///   - The NavMeshAgent provides exact link start/end via currentOffMeshLinkData
///   - This lets you lerp the agent's position for smooth jump arcs
public class LinkTraversal : MonoBehaviour
{
    private NavMeshAgent _agent;

    void Start()
    {
        _agent = GetComponent<NavMeshAgent>();
        _agent.autoTraverseOffMeshLink = false; // We handle it manually
    }

    void Update()
    {
        if (_agent.isOnOffMeshLink)
        {
            StartCoroutine(JumpAcross());
        }
    }

    private System.Collections.IEnumerator JumpAcross()
    {
        OffMeshLinkData data = _agent.currentOffMeshLinkData;
        Vector3 start = _agent.transform.position;
        Vector3 end = data.endPos + Vector3.up * _agent.baseOffset;

        float duration = 0.5f;
        float elapsed = 0f;

        while (elapsed < duration)
        {
            float t = elapsed / duration;
            // Parabolic arc: rise then fall
            float yOffset = 2f * Mathf.Sin(Mathf.PI * t);
            _agent.transform.position = Vector3.Lerp(start, end, t)
                                        + Vector3.up * yOffset;
            elapsed += Time.deltaTime;
            yield return null;
        }

        // Tell the agent the link traversal is complete
        _agent.CompleteOffMeshLink();
    }
}
```

---

## Runtime NavMesh Building

For procedurally generated levels, bake the NavMesh at runtime:

```csharp
using Unity.AI.Navigation;
using UnityEngine;

/// Rebuilds the NavMesh after procedural level generation.
/// WHY runtime baking instead of pre-baked:
///   - Procedural levels don't exist at edit time
///   - NavMeshSurface.BuildNavMesh() is synchronous — call it after
///     all geometry is placed but before spawning agents
public class RuntimeNavMeshBuilder : MonoBehaviour
{
    [SerializeField] private NavMeshSurface surface;

    public void RebuildAfterGeneration()
    {
        // RemoveData clears the old mesh; BuildNavMesh creates a new one
        surface.RemoveData();
        surface.BuildNavMesh();
        Debug.Log("NavMesh rebuilt for procedural level");
    }
}
```

> **Performance note:** `BuildNavMesh()` is synchronous and can cause a
> frame spike. For large worlds, split into multiple `NavMeshSurface`
> components covering different zones and bake them independently.

---

## Querying the NavMesh Directly

Sometimes you need NavMesh data without an agent:

```csharp
using UnityEngine;
using UnityEngine.AI;

public static class NavMeshQueries
{
    /// Find the closest point on the NavMesh to a world position.
    /// WHY: Useful for snapping spawn points or UI markers to walkable areas.
    public static bool GetClosestNavMeshPoint(Vector3 worldPos, out Vector3 result,
                                               float maxDistance = 10f)
    {
        if (NavMesh.SamplePosition(worldPos, out NavMeshHit hit, maxDistance, NavMesh.AllAreas))
        {
            result = hit.position;
            return true;
        }
        result = worldPos;
        return false;
    }

    /// Check if a straight line between two points is walkable (no gaps/walls).
    /// WHY: Cheaper than a full path query when you just need line-of-sight on the mesh.
    public static bool IsDirectPathClear(Vector3 from, Vector3 to)
    {
        return !NavMesh.Raycast(from, to, out NavMeshHit _, NavMesh.AllAreas);
    }
}
```

---

## Performance & Debugging

### Profiler Markers

Use **Window → Analysis → Profiler** and look for:

- `NavMesh.Pathfinding` — time spent computing paths
- `NavMesh.CrowdUpdate` — time spent on local avoidance between agents

### Optimization Checklist

| Issue | Solution |
|---|---|
| Path queries are slow | Reduce NavMesh detail (increase voxel size) |
| Too many agents re-pathing | Cache paths; only re-path when target moves significantly |
| Large open-world NavMesh | Split into multiple NavMeshSurface zones |
| Frame spike on bake | Use async NavMeshSurface updates or bake in chunks |
| Agents clip through geometry | Increase agent radius; verify colliders match visual mesh |

### Visual Debugging

```csharp
// Draw the agent's current path in the Scene view
void OnDrawGizmos()
{
    if (_agent != null && _agent.hasPath)
    {
        Gizmos.color = Color.yellow;
        Vector3[] corners = _agent.path.corners;
        for (int i = 0; i < corners.Length - 1; i++)
        {
            Gizmos.DrawLine(corners[i], corners[i + 1]);
        }
    }
}
```

---

## Integration with Behavior Systems

NavMesh handles *movement*. For *decision-making*, combine with:

- **State machines** — simple patrol/chase/flee logic
- **Behavior trees** (e.g., NodeCanvas, Behavior Designer) — complex multi-step AI
- **Utility AI** — score-based action selection
- **GOAP** — goal-oriented planning for emergent behavior

The NavMeshAgent is the "legs"; the behavior system is the "brain."

---

## Version Notes

| Version | Key Changes |
|---|---|
| Unity 2022 LTS+ | AI Navigation package replaces built-in NavMesh components |
| Unity 6 (6000.x) | Navigation 2.0 — no "Navigation Static" flag, multi-surface support, NavMeshLink improvements |
| Package 2.0.12 | Latest stable for Unity 6.3 LTS |
