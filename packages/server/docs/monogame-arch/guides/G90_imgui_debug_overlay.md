# G90 — ImGui Debug Overlay & Entity Inspector

> **Category:** guide · **Engine:** MonoGame · **Related:** [G16 Debugging](./G16_debugging.md) · [G29 Game Editor](./G29_game_editor.md) · [G88 Dependency Injection](./G88_dependency_injection.md) · [G10 Custom Game Systems](./G10_custom_game_systems.md) · [G77 ECS Event & Messaging](./G77_ecs_event_messaging.md)

How to integrate Dear ImGui into a MonoGame project for runtime debug tools, entity inspectors, and performance overlays. Covers setup with ImGui.NET, the MonoGame rendering backend, building reusable debug panels, and ECS entity inspection with the Arch framework.

---

## Why ImGui for Game Debugging

MonoGame provides no built-in editor or inspector. During development you need visibility into:

- Entity state (positions, health, AI state)
- Performance counters (FPS, draw calls, memory)
- Tweakable parameters (physics values, spawn rates, colors)
- System toggles (disable rendering layers, pause AI, show collision shapes)

Dear ImGui is an immediate-mode GUI library designed exactly for this. It renders on top of your game, has near-zero setup cost per widget, and is stripped from release builds. The `ImGui.NET` package provides C# bindings.

---

## Setup

### NuGet Packages

```xml
<!-- In your .csproj -->
<PackageReference Include="ImGui.NET" Version="1.91.*" />
```

You also need a MonoGame rendering backend. The `Monogame.ImGui` NuGet package provides one, or you can use the widely-referenced backend gist by Jjagg.

```xml
<PackageReference Include="Monogame.ImGui" Version="1.0.0" />
```

> **Note:** `Monogame.ImGui` targets .NET Standard 2.0. For .NET 8+ projects, you may need to use the `Monogame.ImGui.Standard` package or include the backend source directly. Verify compatibility with your MonoGame version before adopting.

### Initialization

```csharp
using ImGuiNET;
using MonoGame.ImGui; // or your chosen backend namespace

public class Game1 : Game
{
    private ImGuiRenderer _imGuiRenderer;

    protected override void Initialize()
    {
        base.Initialize();

        // Initialize after base — needs the graphics device to be ready
        _imGuiRenderer = new ImGuiRenderer(this);
        _imGuiRenderer.RebuildFontAtlas();
    }
}
```

### Render Loop Integration

ImGui rendering must happen **after** your game scene draws, so it appears on top:

```csharp
protected override void Draw(GameTime gameTime)
{
    GraphicsDevice.Clear(Color.CornflowerBlue);

    // 1. Draw your game scene
    _spriteBatch.Begin();
    // ... game rendering ...
    _spriteBatch.End();

    // 2. Draw ImGui overlay on top
    #if DEBUG
    _imGuiRenderer.BeginLayout(gameTime);
    DrawDebugUI(gameTime);
    _imGuiRenderer.EndLayout();
    #endif

    base.Draw(gameTime);
}
```

The `#if DEBUG` guard ensures ImGui code is stripped from release builds.

---

## Building Debug Panels

### Performance Overlay

```csharp
private readonly float[] _frameTimes = new float[120];
private int _frameIndex;

private void DrawPerformancePanel(GameTime gameTime)
{
    _frameTimes[_frameIndex] = (float)gameTime.ElapsedGameTime.TotalMilliseconds;
    _frameIndex = (_frameIndex + 1) % _frameTimes.Length;

    ImGui.SetNextWindowPos(new System.Numerics.Vector2(10, 10),
        ImGuiCond.FirstUseEver);
    ImGui.SetNextWindowSize(new System.Numerics.Vector2(300, 120),
        ImGuiCond.FirstUseEver);

    if (ImGui.Begin("Performance"))
    {
        float avg = 0;
        foreach (float t in _frameTimes) avg += t;
        avg /= _frameTimes.Length;

        ImGui.Text($"FPS: {1000f / avg:F0}");
        ImGui.Text($"Frame: {avg:F2} ms");
        ImGui.PlotLines("##frametimes", ref _frameTimes[0],
            _frameTimes.Length, _frameIndex, "", 0, 33.3f,
            new System.Numerics.Vector2(280, 50));
    }
    ImGui.End();
}
```

### Tweakable Parameters

Use `ImGui.SliderFloat`, `ImGui.ColorEdit4`, `ImGui.Checkbox` etc. to expose runtime-adjustable values:

```csharp
private float _gravity = 9.81f;
private float _jumpForce = 350f;
private bool _showColliders;

private void DrawTweaksPanel()
{
    if (ImGui.Begin("Physics Tweaks"))
    {
        ImGui.SliderFloat("Gravity", ref _gravity, 0f, 30f);
        ImGui.SliderFloat("Jump Force", ref _jumpForce, 100f, 800f);
        ImGui.Checkbox("Show Colliders", ref _showColliders);

        if (ImGui.Button("Reset Defaults"))
        {
            _gravity = 9.81f;
            _jumpForce = 350f;
        }
    }
    ImGui.End();
}
```

---

## ECS Entity Inspector (Arch)

Inspecting entities in an Arch ECS world requires iterating the world and displaying component data. The immediate-mode nature of ImGui makes this natural — no data binding needed.

### Entity List

```csharp
private Entity _selectedEntity;

private void DrawEntityList(World world)
{
    if (ImGui.Begin("Entities"))
    {
        var allQuery = new QueryDescription();
        int index = 0;

        world.Query(in allQuery, (Entity entity) =>
        {
            // Build a label from known components
            string label = $"Entity {entity.Id}";
            if (world.Has<Name>(entity))
            {
                ref var name = ref world.Get<Name>(entity);
                label = $"{name.Value} ({entity.Id})";
            }

            if (ImGui.Selectable(label, _selectedEntity == entity))
            {
                _selectedEntity = entity;
            }
            index++;
        });

        ImGui.Text($"Total: {index}");
    }
    ImGui.End();
}
```

### Component Inspector

Display and edit component fields for the selected entity:

```csharp
private void DrawComponentInspector(World world)
{
    if (!world.IsAlive(_selectedEntity)) return;

    if (ImGui.Begin("Inspector"))
    {
        ImGui.Text($"Entity {_selectedEntity.Id}");
        ImGui.Separator();

        // Position component
        if (world.Has<Position>(_selectedEntity))
        {
            if (ImGui.CollapsingHeader("Position",
                ImGuiTreeNodeFlags.DefaultOpen))
            {
                ref var pos = ref world.Get<Position>(_selectedEntity);
                var v = new System.Numerics.Vector2(pos.X, pos.Y);
                if (ImGui.DragFloat2("XY", ref v, 0.5f))
                {
                    pos.X = v.X;
                    pos.Y = v.Y;
                }
            }
        }

        // Health component
        if (world.Has<Health>(_selectedEntity))
        {
            if (ImGui.CollapsingHeader("Health",
                ImGuiTreeNodeFlags.DefaultOpen))
            {
                ref var hp = ref world.Get<Health>(_selectedEntity);
                ImGui.ProgressBar(
                    (float)hp.Current / hp.Max,
                    new System.Numerics.Vector2(-1, 0),
                    $"{hp.Current}/{hp.Max}");
                ImGui.InputInt("Current", ref hp.Current);
                ImGui.InputInt("Max", ref hp.Max);
            }
        }

        // Velocity component
        if (world.Has<Velocity>(_selectedEntity))
        {
            if (ImGui.CollapsingHeader("Velocity"))
            {
                ref var vel = ref world.Get<Velocity>(_selectedEntity);
                var v = new System.Numerics.Vector2(vel.X, vel.Y);
                if (ImGui.DragFloat2("VXY", ref v, 0.1f))
                {
                    vel.X = v.X;
                    vel.Y = v.Y;
                }
            }
        }
    }
    ImGui.End();
}
```

### Reflection-Based Auto-Inspector (Optional)

For projects with many component types, a reflection-based inspector avoids writing per-component UI code:

```csharp
/// <summary>
/// Inspects any struct component by reflecting over its public fields.
/// Useful during prototyping; replace with hand-tuned inspectors for
/// components that need custom UI (sliders, color pickers, etc.).
/// </summary>
private void InspectComponent<T>(World world, Entity entity) where T : struct
{
    if (!world.Has<T>(entity)) return;

    string name = typeof(T).Name;
    if (!ImGui.CollapsingHeader(name)) return;

    ref var component = ref world.Get<T>(entity);
    object boxed = component; // Box once for reflection

    foreach (var field in typeof(T).GetFields(
        System.Reflection.BindingFlags.Public |
        System.Reflection.BindingFlags.Instance))
    {
        var value = field.GetValue(boxed);
        switch (value)
        {
            case float f:
                if (ImGui.DragFloat(field.Name, ref f, 0.1f))
                    field.SetValue(boxed, f);
                break;
            case int i:
                if (ImGui.InputInt(field.Name, ref i))
                    field.SetValue(boxed, i);
                break;
            case bool b:
                if (ImGui.Checkbox(field.Name, ref b))
                    field.SetValue(boxed, b);
                break;
            default:
                ImGui.Text($"{field.Name}: {value}");
                break;
        }
    }

    // Unbox back into the world
    component = (T)boxed;
}
```

> **Warning:** Reflection allocates and boxes every frame. Use this for prototyping only — not in hot paths or with hundreds of inspected entities. Replace with hand-written inspectors for components that need custom widgets or appear frequently.

---

## Input Handling

ImGui captures mouse/keyboard input when hovering over its windows. Check `ImGui.GetIO().WantCaptureMouse` and `ImGui.GetIO().WantCaptureKeyboard` before processing game input:

```csharp
protected override void Update(GameTime gameTime)
{
    var io = ImGui.GetIO();

    if (!io.WantCaptureMouse)
    {
        // Process game mouse input
    }

    if (!io.WantCaptureKeyboard)
    {
        // Process game keyboard input
    }
}
```

---

## Organizing Debug Panels

For larger projects, use a panel registry pattern:

```csharp
public interface IDebugPanel
{
    string Name { get; }
    bool Visible { get; set; }
    void Draw(GameTime gameTime);
}

public class DebugOverlay
{
    private readonly List<IDebugPanel> _panels = new();

    public void Register(IDebugPanel panel) => _panels.Add(panel);

    public void Draw(GameTime gameTime)
    {
        // Main menu bar for toggling panels
        if (ImGui.BeginMainMenuBar())
        {
            if (ImGui.BeginMenu("Debug"))
            {
                foreach (var panel in _panels)
                {
                    bool visible = panel.Visible;
                    ImGui.MenuItem(panel.Name, null, ref visible);
                    panel.Visible = visible;
                }
                ImGui.EndMenu();
            }
            ImGui.EndMainMenuBar();
        }

        // Draw visible panels
        foreach (var panel in _panels)
        {
            if (panel.Visible)
                panel.Draw(gameTime);
        }
    }
}
```

This keeps debug UI modular — each system can register its own panel without coupling to a central Draw method.

---

## Stripping from Release Builds

All ImGui code should be wrapped in `#if DEBUG` or behind a conditional compilation symbol:

```csharp
// In your .csproj — define a custom symbol for debug overlays
<PropertyGroup Condition="'$(Configuration)' == 'Debug'">
    <DefineConstants>$(DefineConstants);ENABLE_IMGUI</DefineConstants>
</PropertyGroup>
```

```csharp
#if ENABLE_IMGUI
_debugOverlay.Draw(gameTime);
#endif
```

This ensures zero overhead in shipping builds — no ImGui rendering, no input capture, no NuGet dependency.
