# G26 — Splines & World Building in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x, Splines 2.8+) · **Related:** [G19 Procedural Content Generation](G19_procedural_content_generation.md) · [G20 Cinemachine Camera Systems](G20_cinemachine_camera_systems.md) · [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [Unity Rules](../unity-arch-rules.md)

The Unity Splines package (`com.unity.splines` v2.8.x) provides a runtime and editor API for creating, editing, and querying Bezier splines. Splines are the backbone of roads, rivers, rail tracks, camera paths, roller coasters, procedural mesh extrusion, and object placement along paths. This guide covers the full Splines API, the built-in SplineAnimate and SplineExtrude components, custom spline data, and world-building workflows.

---

## Package Overview

```
com.unity.splines (v2.8.2 for Unity 6000.x)
├── SplineContainer       — MonoBehaviour that holds one or more Splines
├── Spline                — Data structure: list of BezierKnots
├── BezierKnot            — Position + tangent-in + tangent-out + rotation
├── SplineAnimate         — Move/rotate a GameObject along a spline
├── SplineExtrude         — Generate a mesh tube/road along a spline
├── SplineInstantiate     — Place prefabs along a spline
├── SplineData<T>         — Attach custom per-spline data (Unity 6 feature)
└── SplineUtility         — Static helpers: evaluate, nearest point, length
```

### Installation

```
// Package Manager → Unity Registry → Splines
// Or add to Packages/manifest.json:
// "com.unity.splines": "2.8.2"
//
// Unity 6 bundles Splines as a recommended package.
// Cinemachine 3.x and Terrain Tools reference it internally.
```

---

## Core Concepts

### SplineContainer

```csharp
using UnityEngine;
using UnityEngine.Splines;

// SplineContainer is the MonoBehaviour that holds spline data.
// One container can hold MULTIPLE splines (e.g., a road network).
// All positions are in the container's LOCAL space.

public class SplineBasics : MonoBehaviour
{
    [SerializeField] private SplineContainer container;

    void Start()
    {
        // Access the first (default) spline
        Spline spline = container.Spline;

        // Query spline properties
        float totalLength = spline.GetLength();
        int knotCount = spline.Count;
        bool isClosed = spline.Closed;

        Debug.Log($"Spline: {knotCount} knots, " +
                  $"length={totalLength:F1} units, " +
                  $"closed={isClosed}");
    }
}
```

### BezierKnot

```csharp
using Unity.Mathematics;
using UnityEngine.Splines;

// A BezierKnot defines a point on the spline with:
// - Position: world-space location (in container's local space)
// - TangentIn: direction handle approaching this knot
// - TangentOut: direction handle leaving this knot
// - Rotation: orientation at this knot

// Create a knot programmatically:
BezierKnot knot = new BezierKnot(
    position: new float3(0, 0, 0),       // Knot position
    tangentIn: new float3(-1, 0, 0),     // Incoming tangent
    tangentOut: new float3(1, 0, 0),     // Outgoing tangent
    rotation: quaternion.identity         // Orientation
);

// Tangent modes (set via the Spline Editor tool in Scene View):
// - Broken: tangent-in and tangent-out are independent
// - Mirrored: tangent-out mirrors tangent-in (smooth curves)
// - Auto Smooth: Unity calculates tangents for smooth Catmull-Rom style
// - Linear: zero-length tangents (straight line segments)
```

### Evaluating Points on a Spline

```csharp
using UnityEngine;
using UnityEngine.Splines;
using Unity.Mathematics;

public class SplineEvaluation : MonoBehaviour
{
    [SerializeField] private SplineContainer container;

    void Example()
    {
        Spline spline = container.Spline;

        // Evaluate at a normalized parameter t (0 = start, 1 = end)
        // Returns position in the container's LOCAL space
        float t = 0.5f; // Midpoint
        float3 localPos = SplineUtility.EvaluatePosition(spline, t);

        // Convert to world space
        Vector3 worldPos = container.transform.TransformPoint(localPos);

        // Evaluate tangent (direction of travel) at t
        float3 tangent = SplineUtility.EvaluateTangent(spline, t);

        // Evaluate up vector at t (useful for banking/tilting)
        float3 upVector = SplineUtility.EvaluateUpVector(spline, t);

        // Find the nearest point on the spline to a world position
        // Returns: normalized t, distance, and the nearest point
        float3 queryPoint = new float3(5, 0, 3);
        SplineUtility.GetNearestPoint(
            spline,
            queryPoint,
            out float3 nearestPoint,
            out float nearestT,
            out float distance
        );
    }
}
```

---

## SplineAnimate — Moving Objects Along Paths

SplineAnimate moves and rotates a GameObject along a spline at runtime. Use it for: moving platforms, patrolling enemies, camera fly-throughs, conveyor items, train cars.

```csharp
using UnityEngine;
using UnityEngine.Splines;

// === Component Setup (Inspector) ===
// 1. Add SplineAnimate component to the moving GameObject
// 2. Assign the SplineContainer
// 3. Configure:
//    - Method: Speed (units/sec) or Time (total duration)
//    - MaxSpeed: travel speed in units per second
//    - Loop Mode: Once, Loop, PingPong
//    - Easing Mode: None, EaseIn, EaseOut, EaseInOut
//    - Alignment: Spline Object (orient to spline direction)
//    - Up Axis: Object Up or Spline Up (use spline up for banking)

/// <summary>
/// Example: control a patrol enemy that follows a spline path.
/// SplineAnimate handles the movement; this script adds game logic.
/// </summary>
public class PatrolEnemy : MonoBehaviour
{
    private SplineAnimate _splineAnimate;

    void Awake()
    {
        _splineAnimate = GetComponent<SplineAnimate>();
    }

    void Start()
    {
        // Start moving automatically
        _splineAnimate.Play();
    }

    public void Pause()
    {
        _splineAnimate.Pause();
    }

    public void Resume()
    {
        _splineAnimate.Play();
    }

    void Update()
    {
        // NormalizedTime: integer part = loop count, fractional = progress
        // e.g., 2.75 means third loop, 75% through
        float progress = _splineAnimate.NormalizedTime % 1f;

        // Increase aggression as the enemy approaches the player's area
        if (progress > 0.8f)
        {
            // Near end of patrol — heighten alertness
        }
    }
}
```

---

## SplineExtrude — Procedural Mesh Generation

SplineExtrude generates a 3D mesh along a spline. Perfect for roads, tunnels, pipes, rails, and rivers.

```csharp
// === Component Setup ===
// 1. Add SplineExtrude to a GameObject with a SplineContainer
// 2. Configure in Inspector:
//    - Profile: Circle, Square, Road, or custom Spline profile
//    - Radius: thickness of the extruded mesh
//    - Segments Per Unit: mesh density along the spline
//    - Sides: cross-section resolution (higher = smoother circle)
//    - Cap Ends: generate end caps (for pipes/tunnels)
//    - Range: extrude only a portion of the spline (0-1)
//
// The mesh updates automatically when the spline is edited.
// At runtime, modifications to the spline also update the mesh.

// === Custom Profile (Unity 6) ===
// Instead of Circle/Square, you can use a Spline as the extrusion profile.
// This lets you create custom cross-sections:
// - Road with curb profile
// - River bed with sloped banks
// - Pipe with internal ridges
//
// Create a 2D closed spline as the profile shape, then assign it
// to SplineExtrude's Profile → Spline option.
```

### Road Generation Example

```csharp
using UnityEngine;
using UnityEngine.Splines;

/// <summary>
/// Generates a road mesh along a spline with automatic UV mapping
/// for road texture tiling. Uses SplineExtrude under the hood.
/// </summary>
public class RoadBuilder : MonoBehaviour
{
    [SerializeField] private SplineContainer roadSpline;
    [SerializeField] private Material roadMaterial;
    [SerializeField] private float roadWidth = 4f;
    [SerializeField] private int segmentsPerUnit = 2;

    void Start()
    {
        BuildRoad();
    }

    void BuildRoad()
    {
        // SplineExtrude handles mesh generation automatically.
        // We just need to configure it properly.
        var extrude = gameObject.GetComponent<SplineExtrude>();
        if (extrude == null)
            extrude = gameObject.AddComponent<SplineExtrude>();

        // The Road profile creates a flat plane along the spline
        // (as opposed to Circle which creates a tube)
        extrude.Container = roadSpline;
        extrude.Radius = roadWidth / 2f;
        extrude.SegmentsPerUnit = segmentsPerUnit;

        // Assign road material with tiling texture
        var meshRenderer = GetComponent<MeshRenderer>();
        if (meshRenderer != null)
            meshRenderer.material = roadMaterial;

        // The mesh auto-generates and updates when the spline changes
    }
}
```

---

## SplineInstantiate — Object Placement Along Paths

SplineInstantiate places prefabs along a spline — ideal for fences, trees along roads, lampposts, track-side objects, and procedural decoration.

```csharp
// === Component Setup ===
// 1. Add SplineInstantiate to a GameObject with a SplineContainer
// 2. Configure:
//    - Items to Instantiate: list of prefabs with probability weights
//    - Method: Spacing (fixed distance) or Count (total instances)
//    - Spacing: distance between instances in world units
//    - Up Axis: how instances orient relative to the spline
//    - Forward Axis: which axis of the prefab points along the spline
//    - Offset: position offset from the spline (useful for roadside objects)
//    - Randomize: position, rotation, scale variation ranges

// Example setup for roadside lamp posts:
// - Prefab: LampPost
// - Method: Spacing
// - Spacing: 15 (one lamp every 15 units)
// - Offset: (3, 0, 0) — 3 units to the side of the road
// - Random Scale: (0.9, 1.0, 1.1) for subtle variation
// - Up Axis: Object Up
//
// For variety, add multiple items with weights:
// - LampPost: weight 0.7 (70% chance)
// - BenchPrefab: weight 0.2 (20% chance)
// - TrashCan: weight 0.1 (10% chance)
```

---

## SplineData — Custom Data Per Spline (Unity 6)

Unity 6 added the ability to store custom data on spline points. This is powerful for gameplay: speed zones, terrain types, event triggers, width variation.

```csharp
using UnityEngine;
using UnityEngine.Splines;
using System.Collections.Generic;

/// <summary>
/// Stores custom speed data along a spline.
/// Useful for: race track speed limits, river flow rates, conveyor speeds.
/// In Unity 6, SplineData<T> associates key-value data along a spline.
/// </summary>
public class SplineSpeedZones : MonoBehaviour
{
    [SerializeField] private SplineContainer container;

    // SplineData<T> stores values keyed to normalized spline positions (0–1)
    // You can query interpolated values at any t along the spline
    private SplineData<float> _speedData = new SplineData<float>();

    void Start()
    {
        // Define speed zones along the spline
        // Key = normalized position (0–1), Value = speed multiplier
        _speedData.Add(new DataPoint<float>(0.0f, 1.0f));   // Start: normal speed
        _speedData.Add(new DataPoint<float>(0.3f, 0.5f));   // Sharp curve: half speed
        _speedData.Add(new DataPoint<float>(0.5f, 1.5f));   // Straight: boost
        _speedData.Add(new DataPoint<float>(0.8f, 0.3f));   // Hairpin: slow zone
        _speedData.Add(new DataPoint<float>(1.0f, 1.0f));   // End: normal speed
    }

    /// <summary>
    /// Get the interpolated speed at any point on the spline.
    /// </summary>
    public float GetSpeedAt(float normalizedT)
    {
        // Evaluate interpolates between data points
        float splineLength = container.Spline.GetLength();
        return _speedData.Evaluate(
            container.Spline,
            normalizedT,
            PathIndexUnit.Normalized,
            new UnityEngine.Splines.Interpolators.LerpFloat()
        );
    }
}
```

---

## Spline Editing in the Scene View

### Editor Tools (Unity 6 Enhancements)

```
Scene View Spline Editing:
├── Knot Tool: select, move, add, delete knots
├── Tangent Tool: adjust tangent handles for curvature
├── Draw Tool: click to place knots sequentially
├── Context Menu (new in Unity 6):
│   ├── Split Segment: add a knot at the click point
│   ├── Reverse Spline: flip direction
│   ├── Join Splines: connect two spline endpoints
│   └── Set Tangent Mode: Mirrored/Broken/Auto/Linear
└── Inspector:
    ├── Knot list with editable positions
    ├── Tangent values (new: editable per-knot in Inspector)
    └── Closed toggle
```

### Linking Knots

```csharp
// Knots from different splines within the SAME SplineContainer
// can be linked. Linked knots share position — moving one moves both.
// This is how you create road intersections, branching paths, etc.

// Linked knots can ONLY link within the same SplineContainer.
// For multi-container linking, you must manage positions manually.
```

---

## World Building Workflows

### Terrain + Splines for Rivers

```csharp
// Workflow for creating a river that follows terrain:
//
// 1. Create terrain with Unity Terrain system
// 2. Add a SplineContainer and draw the river path in Scene View
// 3. Add SplineExtrude for the water surface mesh:
//    - Profile: Road (flat plane)
//    - Radius: river width / 2
//    - Material: water shader (URP Water shader or custom)
// 4. Use a script to conform spline knots to terrain height:

using UnityEngine;
using UnityEngine.Splines;
using Unity.Mathematics;

public class SplineTerrainConformer : MonoBehaviour
{
    [SerializeField] private SplineContainer splineContainer;
    [SerializeField] private Terrain terrain;
    [SerializeField] private float heightOffset = -0.5f; // Below terrain surface

    /// <summary>
    /// Adjusts all knot positions to sit on (or below) the terrain surface.
    /// Call this after editing the spline to snap it to terrain.
    /// </summary>
    [ContextMenu("Conform to Terrain")]
    public void ConformToTerrain()
    {
        Spline spline = splineContainer.Spline;

        for (int i = 0; i < spline.Count; i++)
        {
            BezierKnot knot = spline[i];
            // Convert knot local position to world position
            Vector3 worldPos = splineContainer.transform
                .TransformPoint((Vector3)knot.Position);

            // Sample terrain height at this XZ position
            float terrainHeight = terrain.SampleHeight(worldPos)
                + terrain.transform.position.y;

            // Set the knot's Y to terrain height + offset
            worldPos.y = terrainHeight + heightOffset;

            // Convert back to local space and update
            Vector3 localPos = splineContainer.transform
                .InverseTransformPoint(worldPos);
            knot.Position = new float3(localPos.x, localPos.y, localPos.z);
            spline[i] = knot;
        }

        // Notify the spline system that data changed
        // (triggers mesh rebuild on SplineExtrude, etc.)
        splineContainer.Spline.SetDirty();
    }
}
```

### Procedural Fence/Wall Placement

```csharp
using UnityEngine;
using UnityEngine.Splines;
using Unity.Mathematics;

/// <summary>
/// Places fence posts and panels along a spline at fixed intervals.
/// More control than SplineInstantiate for structured placement.
/// </summary>
public class FenceBuilder : MonoBehaviour
{
    [SerializeField] private SplineContainer fencePath;
    [SerializeField] private GameObject fencePostPrefab;
    [SerializeField] private GameObject fencePanelPrefab;
    [SerializeField] private float postSpacing = 3f;

    [ContextMenu("Build Fence")]
    public void BuildFence()
    {
        // Clear existing fence objects
        for (int i = transform.childCount - 1; i >= 0; i--)
            DestroyImmediate(transform.GetChild(i).gameObject);

        Spline spline = fencePath.Spline;
        float totalLength = spline.GetLength();
        int postCount = Mathf.FloorToInt(totalLength / postSpacing) + 1;

        for (int i = 0; i < postCount; i++)
        {
            // Convert distance along spline to normalized t
            float distance = i * postSpacing;
            float t = distance / totalLength;
            if (t > 1f) t = 1f;

            // Get world-space position and direction at this point
            float3 localPos = SplineUtility.EvaluatePosition(spline, t);
            float3 localTangent = SplineUtility.EvaluateTangent(spline, t);
            float3 localUp = SplineUtility.EvaluateUpVector(spline, t);

            Vector3 worldPos = fencePath.transform
                .TransformPoint((Vector3)localPos);
            Vector3 worldForward = fencePath.transform
                .TransformDirection(math.normalize(localTangent));

            // Place fence post
            Quaternion rotation = Quaternion.LookRotation(worldForward,
                fencePath.transform.TransformDirection(localUp));
            Instantiate(fencePostPrefab, worldPos, rotation, transform);

            // Place fence panel between this post and the next
            if (i < postCount - 1)
            {
                float nextT = (distance + postSpacing) / totalLength;
                if (nextT <= 1f)
                {
                    float3 nextLocalPos = SplineUtility
                        .EvaluatePosition(spline, nextT);
                    Vector3 nextWorldPos = fencePath.transform
                        .TransformPoint((Vector3)nextLocalPos);

                    Vector3 midpoint = (worldPos + nextWorldPos) / 2f;
                    Vector3 panelForward = (nextWorldPos - worldPos).normalized;
                    Quaternion panelRot = Quaternion.LookRotation(panelForward,
                        Vector3.up);

                    GameObject panel = Instantiate(fencePanelPrefab,
                        midpoint, panelRot, transform);
                    // Scale panel to span the gap
                    float gap = Vector3.Distance(worldPos, nextWorldPos);
                    panel.transform.localScale = new Vector3(
                        panel.transform.localScale.x,
                        panel.transform.localScale.y,
                        gap / postSpacing // Normalize scale to spacing
                    );
                }
            }
        }
    }
}
```

### Camera Fly-Through with Splines + Cinemachine

```csharp
// Cinemachine 3.x (com.unity.cinemachine) integrates natively with Splines.
//
// Setup:
// 1. Create a SplineContainer with your camera path
// 2. Create a CinemachineCamera
// 3. Add CinemachineSplineDolly component to the camera
// 4. Assign the SplineContainer
// 5. Configure:
//    - Position Units: Normalized (0–1) or Distance (world units)
//    - Camera Position: the current position along the spline
//    - Auto Dolly: enable to automatically advance based on target
//
// For a scripted fly-through (cutscene, menu background):

using UnityEngine;
using Unity.Cinemachine;

public class CameraFlyThrough : MonoBehaviour
{
    [SerializeField] private CinemachineSplineDolly dolly;
    [SerializeField] private float duration = 10f;

    private float _elapsed;

    void Update()
    {
        _elapsed += Time.deltaTime;
        float t = Mathf.Clamp01(_elapsed / duration);

        // Smoothstep for ease-in/ease-out
        t = t * t * (3f - 2f * t);

        dolly.CameraPosition = t;
    }
}
```

---

## Performance Considerations

| Aspect | Recommendation |
|--------|---------------|
| Knot count | Keep under 50 knots per spline for editor responsiveness |
| SplineExtrude segments | 1-2 segments/unit for distant objects, 4+ for close-up |
| SplineInstantiate | Use LOD groups on instantiated prefabs for large-scale placement |
| Runtime spline evaluation | Cache `GetLength()` — it iterates all segments. Don't call per frame |
| Multiple splines | Prefer one SplineContainer with multiple splines over many containers |
| Mesh colliders on extruded roads | Use simplified collider meshes or box collider approximations |

---

## Quick Reference

```
Splines Package Components:
├── SplineContainer      — Holds Spline data (MonoBehaviour)
├── SplineAnimate        — Move GameObject along spline
├── SplineExtrude        — Generate mesh along spline
├── SplineInstantiate    — Place prefabs along spline
└── SplineData<T>        — Custom data at spline positions (Unity 6)

Key APIs:
├── SplineUtility.EvaluatePosition(spline, t)    → float3
├── SplineUtility.EvaluateTangent(spline, t)     → float3
├── SplineUtility.EvaluateUpVector(spline, t)    → float3
├── SplineUtility.GetNearestPoint(spline, pos, ...) → nearest t
├── spline.GetLength()                            → float
├── spline[i]                                     → BezierKnot
└── spline.Add(knot) / Insert(index, knot)        → modify spline

World Building Patterns:
├── Roads: SplineExtrude (Road profile) + SplineInstantiate (roadside objects)
├── Rivers: SplineExtrude + terrain conforming + water shader
├── Rails: SplineAnimate (train car) + SplineExtrude (track mesh)
├── Fences: Custom script with EvaluatePosition at fixed intervals
└── Camera paths: CinemachineSplineDolly + SplineContainer
```
