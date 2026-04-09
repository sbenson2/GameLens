# G119 — 3D Camera Systems

> **Category:** guide · **Engine:** MonoGame · **Related:** [G20 Camera Systems (2D)](./G20_camera_systems.md) · [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G19 Display & Resolution](./G19_display_resolution_viewports.md) · [G21 Coordinate Systems](./G21_coordinate_systems.md) · [G7 Input Handling](./G7_input_handling.md) · [G93 ECS Library Integration](./G93_ecs_library_integration.md) · [G52 Character Controller](./G52_character_controller.md)

How to implement 3D camera systems in MonoGame: first-person, third-person, orbit, and free-fly cameras. Covers the view/projection matrix pipeline, input-driven rotation with yaw/pitch, collision-aware orbiting, smooth interpolation, and ECS integration.

---

## Table of Contents

1. [View & Projection Fundamentals](#1-view--projection-fundamentals)
2. [Base Camera Class](#2-base-camera-class)
3. [First-Person Camera](#3-first-person-camera)
4. [Third-Person Follow Camera](#4-third-person-follow-camera)
5. [Orbit Camera](#5-orbit-camera)
6. [Free-Fly / Debug Camera](#6-free-fly--debug-camera)
7. [Smooth Interpolation & Damping](#7-smooth-interpolation--damping)
8. [Camera Collision](#8-camera-collision)
9. [Screen Shake in 3D](#9-screen-shake-in-3d)
10. [ECS Integration](#10-ecs-integration)
11. [Common Pitfalls](#11-common-pitfalls)

---

## 1. View & Projection Fundamentals

Every 3D camera produces two matrices that transform world-space geometry into screen pixels:

```
World Position ──→ [View Matrix] ──→ Camera Space ──→ [Projection Matrix] ──→ Clip Space ──→ Screen
```

### View Matrix — Where the Camera Is

`Matrix.CreateLookAt` is the standard MonoGame API:

```csharp
Matrix view = Matrix.CreateLookAt(
    cameraPosition: new Vector3(0, 5, -10),  // eye position in world
    cameraTarget:   new Vector3(0, 0, 0),    // point the camera looks at
    cameraUpVector: Vector3.Up               // which direction is "up"
);
```

**Parameters:**
- `cameraPosition` — the eye location in world space.
- `cameraTarget` — the world-space point the camera looks toward. The forward direction is `normalize(target - position)`.
- `cameraUpVector` — typically `Vector3.Up` (0,1,0). Only change this for roll effects (e.g., airplane banking).

### Projection Matrix — How the Camera Sees

```csharp
// Perspective — most 3D games
Matrix projection = Matrix.CreatePerspectiveFieldOfView(
    fieldOfView:     MathHelper.ToRadians(70f),  // vertical FOV in radians
    aspectRatio:     GraphicsDevice.Viewport.AspectRatio,
    nearPlaneDistance: 0.1f,   // objects closer than this are clipped
    farPlaneDistance:  1000f   // objects farther than this are clipped
);

// Orthographic — isometric, strategy, level editors
Matrix ortho = Matrix.CreateOrthographic(
    width: 20f, height: 15f,
    zNearPlane: 0.1f, zFarPlane: 500f
);
```

**FOV guidance:**
- 60°–70° for third-person games.
- 80°–100° for first-person games (wider reduces motion sickness).
- Avoid very narrow FOV (<50°) — it feels claustrophobic. Avoid very wide (>110°) — it distorts edges.

**Near/far plane guidance:**
- Keep `near / far` ratio as small as possible. A 0.01 near with a 100000 far wastes depth buffer precision — you'll get z-fighting. Prefer `near = 0.1, far = 1000` and scale your world to fit.

---

## 2. Base Camera Class

A reusable base that all camera types extend:

```csharp
public abstract class Camera3D
{
    public Vector3 Position { get; set; }
    public Matrix View { get; protected set; }
    public Matrix Projection { get; protected set; }

    // Derived classes override to recalculate View each frame
    public abstract void Update(GameTime gameTime);

    public void SetProjection(float fov, float aspect, float near, float far)
    {
        Projection = Matrix.CreatePerspectiveFieldOfView(
            MathHelper.ToRadians(fov), aspect, near, far);
    }

    /// <summary>
    /// Combined View * Projection — pass this to your shaders as the
    /// viewProjection parameter.
    /// </summary>
    public Matrix ViewProjection => View * Projection;

    /// <summary>
    /// Forward direction the camera is facing (useful for raycasts, audio).
    /// </summary>
    public Vector3 Forward => Vector3.Normalize(
        Vector3.Transform(Vector3.Forward, Matrix.Invert(View)));
}
```

> **Why a base class?** Swapping between first-person, orbit, and cinematic cameras at runtime is a common need. A shared interface lets your renderer call `camera.View` without caring which mode is active.

---

## 3. First-Person Camera

Yaw + pitch rotation driven by mouse delta. Position moves with WASD.

```csharp
public class FirstPersonCamera : Camera3D
{
    private float _yaw;    // horizontal rotation (radians)
    private float _pitch;  // vertical rotation (radians)
    private float _moveSpeed = 10f;
    private float _lookSensitivity = 0.002f;

    // Clamp pitch to avoid flipping at poles
    private const float MaxPitch = MathHelper.PiOver2 - 0.01f;

    public override void Update(GameTime gameTime)
    {
        float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;
        var mouse = Mouse.GetState();
        var keyboard = Keyboard.GetState();

        // --- Rotation from mouse delta ---
        // Center mouse each frame for continuous rotation
        int centerX = GraphicsAdapter.DefaultAdapter.CurrentDisplayMode.Width / 2;
        int centerY = GraphicsAdapter.DefaultAdapter.CurrentDisplayMode.Height / 2;
        float deltaX = mouse.X - centerX;
        float deltaY = mouse.Y - centerY;
        Mouse.SetPosition(centerX, centerY);

        _yaw   -= deltaX * _lookSensitivity;
        _pitch -= deltaY * _lookSensitivity;
        _pitch  = MathHelper.Clamp(_pitch, -MaxPitch, MaxPitch);

        // Build rotation matrix from yaw/pitch
        Matrix rotation = Matrix.CreateFromYawPitchRoll(_yaw, _pitch, 0f);

        // Forward and right vectors in world space
        Vector3 forward = Vector3.Transform(Vector3.Forward, rotation);
        Vector3 right   = Vector3.Transform(Vector3.Right, rotation);

        // --- Movement from keyboard ---
        Vector3 move = Vector3.Zero;
        if (keyboard.IsKeyDown(Keys.W)) move += forward;
        if (keyboard.IsKeyDown(Keys.S)) move -= forward;
        if (keyboard.IsKeyDown(Keys.A)) move -= right;
        if (keyboard.IsKeyDown(Keys.D)) move += right;

        if (move.LengthSquared() > 0f)
            move = Vector3.Normalize(move) * _moveSpeed * dt;

        Position += move;

        // --- Build view matrix ---
        View = Matrix.CreateLookAt(Position, Position + forward, Vector3.Up);
    }
}
```

**Key points:**
- `Matrix.CreateFromYawPitchRoll` takes yaw (Y-axis), pitch (X-axis), roll (Z-axis). MonoGame uses a right-handed coordinate system by default.
- Always clamp pitch to `±(π/2 - ε)` to prevent gimbal lock at straight up/down.
- `Mouse.SetPosition` re-centers the cursor for infinite mouse look. Only do this when the game window is focused and mouse capture is active.

---

## 4. Third-Person Follow Camera

The camera follows a target entity at a fixed offset, with smooth interpolation:

```csharp
public class ThirdPersonCamera : Camera3D
{
    public Vector3 TargetPosition { get; set; }
    public float   TargetYaw { get; set; }  // character's facing direction

    // Offset from target (behind and above)
    public Vector3 Offset { get; set; } = new Vector3(0f, 3f, -8f);

    // Smoothing factor — lower = smoother, higher = snappier
    public float SmoothSpeed { get; set; } = 5f;

    public override void Update(GameTime gameTime)
    {
        float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;

        // Rotate offset by target's yaw so camera stays behind character
        Matrix targetRotation = Matrix.CreateRotationY(TargetYaw);
        Vector3 rotatedOffset = Vector3.Transform(Offset, targetRotation);

        // Desired camera position
        Vector3 desiredPosition = TargetPosition + rotatedOffset;

        // Smooth interpolation (exponential decay)
        Position = Vector3.Lerp(Position, desiredPosition,
            1f - MathF.Exp(-SmoothSpeed * dt));

        // Look at a point slightly above the target (chest height, not feet)
        Vector3 lookTarget = TargetPosition + Vector3.Up * 1.5f;

        View = Matrix.CreateLookAt(Position, lookTarget, Vector3.Up);
    }
}
```

> **Why exponential decay instead of raw lerp?** `Lerp(a, b, 1 - e^(-speed * dt))` is framerate-independent. A fixed lerp factor like `Lerp(a, b, 0.1f)` moves faster at higher framerates.

---

## 5. Orbit Camera

Rotates around a focus point (e.g., inspecting objects, strategy view):

```csharp
public class OrbitCamera : Camera3D
{
    public Vector3 FocusPoint { get; set; }
    public float Distance { get; set; } = 15f;
    public float MinDistance { get; set; } = 2f;
    public float MaxDistance { get; set; } = 50f;

    private float _yaw;
    private float _pitch = -0.3f; // start slightly above

    private const float MinPitch = -MathHelper.PiOver2 + 0.05f;
    private const float MaxPitch = MathHelper.PiOver2 - 0.05f;

    public override void Update(GameTime gameTime)
    {
        var mouse = Mouse.GetState();

        // Right-drag to orbit
        if (mouse.RightButton == ButtonState.Pressed)
        {
            // Delta would come from tracking previous mouse state
            // _yaw += deltaX * 0.005f;
            // _pitch += deltaY * 0.005f;
        }

        _pitch = MathHelper.Clamp(_pitch, MinPitch, MaxPitch);

        // Scroll wheel to zoom
        // Distance -= scrollDelta * 0.5f;
        Distance = MathHelper.Clamp(Distance, MinDistance, MaxDistance);

        // Spherical coordinates → Cartesian offset
        float cosP = MathF.Cos(_pitch);
        Vector3 offset = new Vector3(
            cosP * MathF.Sin(_yaw),
            MathF.Sin(_pitch),
            cosP * MathF.Cos(_yaw)
        ) * Distance;

        Position = FocusPoint + offset;
        View = Matrix.CreateLookAt(Position, FocusPoint, Vector3.Up);
    }
}
```

**Spherical coordinates explained:**
- `yaw` sweeps horizontally (0 → 2π).
- `pitch` tilts vertically (-π/2 → +π/2).
- `distance` is the radius of the sphere.
- Converting to Cartesian: `x = cos(pitch) * sin(yaw) * dist`, `y = sin(pitch) * dist`, `z = cos(pitch) * cos(yaw) * dist`.

---

## 6. Free-Fly / Debug Camera

Combines first-person rotation with six-degrees-of-freedom movement — useful for level editors and debug views:

```csharp
public class FreeFlyCamera : Camera3D
{
    private float _yaw, _pitch;
    private float _speed = 20f;
    private float _fastMultiplier = 3f;

    public override void Update(GameTime gameTime)
    {
        float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;
        var kb = Keyboard.GetState();

        // Rotation (same mouse-delta pattern as FirstPersonCamera)
        Matrix rotation = Matrix.CreateFromYawPitchRoll(_yaw, _pitch, 0f);
        Vector3 forward = Vector3.Transform(Vector3.Forward, rotation);
        Vector3 right   = Vector3.Transform(Vector3.Right, rotation);
        Vector3 up      = Vector3.Transform(Vector3.Up, rotation);

        float speed = _speed * (kb.IsKeyDown(Keys.LeftShift) ? _fastMultiplier : 1f);

        Vector3 move = Vector3.Zero;
        if (kb.IsKeyDown(Keys.W)) move += forward;
        if (kb.IsKeyDown(Keys.S)) move -= forward;
        if (kb.IsKeyDown(Keys.A)) move -= right;
        if (kb.IsKeyDown(Keys.D)) move += right;
        if (kb.IsKeyDown(Keys.E)) move += up;   // fly up
        if (kb.IsKeyDown(Keys.Q)) move -= up;   // fly down

        if (move.LengthSquared() > 0f)
            move = Vector3.Normalize(move) * speed * dt;

        Position += move;
        View = Matrix.CreateLookAt(Position, Position + forward, Vector3.Up);
    }
}
```

> **Tip:** Toggle between your game camera and the free-fly camera with a debug key. Store the game camera's matrices separately so you can visualize its frustum from the debug camera.

---

## 7. Smooth Interpolation & Damping

### Framerate-Independent Smoothing

```csharp
// Exponential decay — the standard for camera smoothing
// k = speed (higher = faster catch-up), dt = delta time
float t = 1f - MathF.Exp(-k * dt);
Position = Vector3.Lerp(Position, target, t);

// For rotations, use Quaternion.Slerp
Quaternion.Slerp(currentRotation, targetRotation, t);
```

### Spring Damping

For juicier follow cameras (slight overshoot that settles):

```csharp
// Critically-damped spring (no oscillation)
public static Vector3 SmoothDamp(
    Vector3 current, Vector3 target, ref Vector3 velocity,
    float smoothTime, float dt)
{
    float omega = 2f / smoothTime;
    float x = omega * dt;
    float exp = 1f / (1f + x + 0.48f * x * x + 0.235f * x * x * x);
    Vector3 delta = current - target;
    Vector3 temp = (velocity + omega * delta) * dt;
    velocity = (velocity - omega * temp) * exp;
    return target + (delta + temp) * exp;
}
```

This is the same algorithm Unity's `Vector3.SmoothDamp` uses — it produces smooth, critically-damped motion with no oscillation.

---

## 8. Camera Collision

Prevent the third-person camera from clipping through walls:

```csharp
public Vector3 ResolveCollision(
    Vector3 target, Vector3 desiredCameraPos, float cameraRadius)
{
    Vector3 direction = desiredCameraPos - target;
    float maxDistance = direction.Length();
    direction /= maxDistance; // normalize

    // Raycast from target toward desired camera position
    if (PhysicsWorld.Raycast(target, direction, maxDistance, out RayHit hit))
    {
        // Pull camera in front of the hit, offset by radius
        float safeDistance = MathF.Max(hit.Distance - cameraRadius, 0.5f);
        return target + direction * safeDistance;
    }

    return desiredCameraPos;
}
```

**Design note:** Use a sphere cast (not a thin ray) for the camera radius. A thin ray can slip between geometry cracks. If your physics system doesn't support sphere casts, cast 4–5 rays in a small cone pattern.

---

## 9. Screen Shake in 3D

Apply shake by perturbing the view matrix, not the camera position:

```csharp
public class CameraShake
{
    private float _trauma;       // 0–1, accumulated from impacts
    private float _decayRate = 2f;
    private float _maxOffset = 0.5f;
    private float _maxAngle = 0.05f; // radians

    public void AddTrauma(float amount)
    {
        _trauma = MathF.Min(_trauma + amount, 1f);
    }

    /// <summary>
    /// Returns a shake offset matrix. Multiply: View = baseView * GetShakeMatrix()
    /// </summary>
    public Matrix GetShakeMatrix(GameTime gameTime)
    {
        if (_trauma <= 0f) return Matrix.Identity;

        float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;
        float shake = _trauma * _trauma; // quadratic falloff feels natural

        // Perlin noise or random offsets
        float offsetX = (Random.Shared.NextSingle() * 2f - 1f) * _maxOffset * shake;
        float offsetY = (Random.Shared.NextSingle() * 2f - 1f) * _maxOffset * shake;
        float angle   = (Random.Shared.NextSingle() * 2f - 1f) * _maxAngle * shake;

        _trauma = MathF.Max(_trauma - _decayRate * dt, 0f);

        return Matrix.CreateTranslation(offsetX, offsetY, 0f)
             * Matrix.CreateRotationZ(angle);
    }
}
```

> **Perlin noise vs random:** Random produces jittery shake (explosions). Perlin noise produces smooth, rolling shake (earthquakes). Use whichever fits the game feel — or blend both.

---

## 10. ECS Integration

With an Arch ECS architecture, cameras become components:

```csharp
// Components
public record struct Camera3DComponent(
    Matrix View,
    Matrix Projection,
    float Fov,
    float Near,
    float Far,
    bool IsActive
);

public record struct CameraFollowTarget(
    Entity Target,
    Vector3 Offset,
    float SmoothSpeed
);

// System
public class CameraFollowSystem : BaseSystem<World, GameTime>
{
    private readonly QueryDescription _query = new QueryDescription()
        .WithAll<Camera3DComponent, CameraFollowTarget, Position>();

    public override void Update(in GameTime gameTime)
    {
        float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;

        World.Query(in _query, (
            ref Camera3DComponent cam,
            ref CameraFollowTarget follow,
            ref Position pos) =>
        {
            if (!cam.IsActive) return;

            var targetPos = World.Get<Position>(follow.Target);
            Vector3 desired = targetPos.Value + follow.Offset;
            float t = 1f - MathF.Exp(-follow.SmoothSpeed * dt);
            pos.Value = Vector3.Lerp(pos.Value, desired, t);

            Vector3 lookAt = targetPos.Value + Vector3.Up * 1.5f;
            cam.View = Matrix.CreateLookAt(pos.Value, lookAt, Vector3.Up);
        });
    }
}
```

> **Design:** Keep the `Camera3DComponent` on the same entity as a `Position` component. Query for the active camera in your render system to extract `View` and `Projection`.

---

## 11. Common Pitfalls

| Pitfall | Cause | Fix |
|---------|-------|-----|
| Camera flips upside down | Pitch exceeds ±90° | Clamp pitch to `±(π/2 - ε)` |
| Jittery movement | Framerate-dependent lerp | Use `1 - e^(-speed * dt)` smoothing |
| Z-fighting / flickering surfaces | Near/far ratio too large | Keep `far / near < 10000`; prefer `near ≥ 0.1` |
| Camera clips through walls | No collision check | Sphere-cast from target to desired position |
| Mouse look speed varies with resolution | Using raw pixel deltas | Normalize by viewport size or use fixed sensitivity |
| View matrix "jumps" on first frame | Mouse delta includes accumulated offset | Set mouse to center on first frame, skip delta |

---

## See Also

- [G20 Camera Systems (2D)](./G20_camera_systems.md) — 2D camera patterns, deadzone, parallax
- [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) — SpriteBatch, BasicEffect, rendering pipeline
- [G52 Character Controller](./G52_character_controller.md) — movement systems the camera follows
- [G7 Input Handling](./G7_input_handling.md) — mouse capture, input action mapping
- [G93 ECS Library Integration](./G93_ecs_library_integration.md) — Arch ECS setup and query patterns
- [MonoGame Docs: What is a Camera?](https://docs.monogame.net/articles/getting_to_know/whatis/graphics/WhatIs_Camera.html)
- [MonoGame Docs: How to Rotate and Move the Camera](https://docs.monogame.net/articles/getting_to_know/howto/graphics/HowTo_RotateMoveCamera.html)
