# G5 — UI Toolkit for Runtime Game UI

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unity Rules](../unity-arch-rules.md)

UI Toolkit is Unity 6's recommended system for building runtime game interfaces — HUDs, menus, inventories, and dialogues. It replaces the legacy Unity UI (uGUI/Canvas) approach with a web-inspired architecture: UXML for structure, USS for styling, and C# for logic. This guide covers setup, element querying, data binding, styling, and performance patterns.

---

## Why UI Toolkit Over uGUI?

| Concern | uGUI (Legacy) | UI Toolkit |
|---------|---------------|------------|
| Layout model | RectTransform anchors | Flexbox-like (row/column, grow, shrink) |
| Styling | Per-element Inspector overrides | USS stylesheets (reusable, cascading) |
| Data binding | Manual `text = value.ToString()` | Built-in binding system (MVVM) |
| Merge conflicts | Binary scene references | XML/text-based UXML + USS files |
| Performance (many elements) | Canvas rebuild overhead | Retained-mode, partial updates |
| Editor + Runtime | Separate systems (IMGUI vs uGUI) | Same system for both |

> **When to still use uGUI:** Projects already deep into uGUI, or if you need world-space UI attached to 3D objects (UI Toolkit's world-space support is limited as of Unity 6).

---

## Setup: UIDocument + PanelSettings

Every runtime UI starts with two assets and one component:

1. **PanelSettings** asset — controls rendering (sort order, scale mode, target texture)
2. **UXML document** — the layout file (your "HTML")
3. **UIDocument** component on a GameObject — connects the UXML to the scene

**Quick setup:** `GameObject > UI Toolkit > UI Document` auto-creates a PanelSettings, a default theme, and the UIDocument GameObject.

```
Scene Hierarchy:
├── GameManager
├── Player
└── UI                          ← Empty parent for organization
    └── HUD (UIDocument)        ← Drag your HUD.uxml into Source Asset
```

### PanelSettings Configuration

```
Scale Mode:        Scale With Screen Size    ← Responsive across resolutions
Reference Resolution: 1920 x 1080
Match:             0.5 (width ↔ height)      ← Balanced scaling
Sort Order:        0                         ← Higher values render on top
```

> **WHY Scale With Screen Size?** It mirrors how most games handle resolution independence. "Constant Pixel Size" breaks on different displays; "Constant Physical Size" is meant for tools, not games.

---

## UXML: Structuring Your Layout

UXML is XML that defines the visual tree. Think of it as HTML for your game UI.

```xml
<!-- HUD.uxml — A simple health bar + score display -->
<ui:UXML xmlns:ui="UnityEngine.UIElements">
    <ui:VisualElement name="hud-root" class="hud-container">

        <!-- Health bar: a filled bar inside a background track -->
        <ui:VisualElement name="health-bar-track" class="bar-track">
            <ui:VisualElement name="health-bar-fill" class="bar-fill health-fill" />
        </ui:VisualElement>

        <!-- Score display -->
        <ui:Label name="score-label" text="Score: 0" class="score-text" />

        <!-- Ammo counter -->
        <ui:Label name="ammo-label" text="30 / 30" class="ammo-text" />

    </ui:VisualElement>
</ui:UXML>
```

### Key Elements

| UXML Element | C# Type | Common Use |
|-------------|---------|------------|
| `<ui:VisualElement>` | `VisualElement` | Container / div equivalent |
| `<ui:Label>` | `Label` | Read-only text |
| `<ui:Button>` | `Button` | Clickable button |
| `<ui:TextField>` | `TextField` | Text input |
| `<ui:Toggle>` | `Toggle` | Checkbox |
| `<ui:Slider>` | `Slider` | Numeric slider |
| `<ui:ListView>` | `ListView` | Virtualized scrollable list |
| `<ui:ScrollView>` | `ScrollView` | Scrollable container |
| `<ui:DropdownField>` | `DropdownField` | Dropdown selector |
| `<ui:Foldout>` | `Foldout` | Collapsible section |

---

## USS: Styling Your UI

USS (Unity Style Sheets) use CSS-like syntax. They cascade, support class selectors, and keep your styling separate from your layout.

```css
/* HUD.uss — Styles for the HUD */

/* WHY class selectors over name selectors: Classes are reusable across
   elements and documents. Name selectors (#name) are for unique elements. */

.hud-container {
    position: absolute;
    width: 100%;
    height: 100%;
    padding: 20px;
    /* Flexbox layout — UI Toolkit uses flex by default */
    flex-direction: column;
    justify-content: space-between;
}

/* Health bar track (background) */
.bar-track {
    width: 300px;
    height: 24px;
    background-color: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    overflow: hidden;         /* Clip the fill to the track bounds */
}

/* Health bar fill — width is set from C# based on current HP */
.bar-fill {
    height: 100%;
    transition-property: width;
    transition-duration: 0.3s;  /* Smooth health changes */
}

.health-fill {
    background-color: #4CAF50;
}

/* Score text — top-right corner */
.score-text {
    align-self: flex-end;
    font-size: 28px;
    color: white;
    -unity-font-style: bold;
    /* WHY -unity- prefix: These are Unity-specific USS properties
       that extend CSS syntax for game UI needs. */
}

.ammo-text {
    align-self: flex-end;
    font-size: 22px;
    color: #CCCCCC;
}

/* Hover state for interactive elements */
.menu-button:hover {
    background-color: rgba(255, 255, 255, 0.1);
    scale: 1.05 1.05;
    transition-duration: 0.15s;
}
```

### USS Selector Reference

| Selector | Syntax | Example |
|----------|--------|---------|
| Type | `Button { }` | Matches all Button elements |
| Class | `.my-class { }` | Matches elements with that class |
| Name | `#my-name { }` | Matches element with that name |
| Pseudo-class | `:hover`, `:active`, `:focus`, `:disabled`, `:checked` | State-based styling |
| Descendant | `.parent .child { }` | Child anywhere inside parent |
| Child | `.parent > .child { }` | Direct child only |

---

## C#: Querying and Controlling UI

### Querying Elements

Use `Q()` (query) and `Q<T>()` (typed query) to find elements by name or class. Always query in `OnEnable` after the visual tree has loaded.

```csharp
using UnityEngine;
using UnityEngine.UIElements;

public class HUDController : MonoBehaviour
{
    // WHY [SerializeField] on UIDocument: Explicit dependency —
    // the Inspector shows exactly which UIDocument this controller drives.
    [SerializeField] private UIDocument _hudDocument;

    private VisualElement _healthFill;
    private Label _scoreLabel;
    private Label _ammoLabel;

    private void OnEnable()
    {
        // WHY OnEnable and not Awake: The visual tree may not be ready in Awake.
        // OnEnable is the earliest safe point to query elements.
        var root = _hudDocument.rootVisualElement;

        _healthFill = root.Q<VisualElement>("health-bar-fill");
        _scoreLabel = root.Q<Label>("score-label");
        _ammoLabel  = root.Q<Label>("ammo-label");
    }

    /// <summary>
    /// Call from PlayerHealth when HP changes.
    /// </summary>
    public void UpdateHealth(float normalizedHealth)
    {
        // WHY set width as percentage: The USS transition on width
        // handles smooth interpolation automatically — no coroutine needed.
        _healthFill.style.width = Length.Percent(normalizedHealth * 100f);
    }

    public void UpdateScore(int score)
    {
        _scoreLabel.text = $"Score: {score:N0}";
    }

    public void UpdateAmmo(int current, int max)
    {
        _ammoLabel.text = $"{current} / {max}";
    }
}
```

### Event Handling

Register callbacks on interactive elements. Always unregister in `OnDisable` to prevent leaks.

```csharp
public class MainMenuController : MonoBehaviour
{
    [SerializeField] private UIDocument _menuDocument;

    private Button _playButton;
    private Button _settingsButton;
    private Button _quitButton;

    private void OnEnable()
    {
        var root = _menuDocument.rootVisualElement;

        _playButton     = root.Q<Button>("play-button");
        _settingsButton = root.Q<Button>("settings-button");
        _quitButton     = root.Q<Button>("quit-button");

        // WHY RegisterCallback<ClickEvent> over .clicked:
        // ClickEvent provides position, modifier keys, and propagation control.
        // .clicked is simpler but less flexible.
        _playButton.RegisterCallback<ClickEvent>(OnPlayClicked);
        _settingsButton.RegisterCallback<ClickEvent>(OnSettingsClicked);
        _quitButton.RegisterCallback<ClickEvent>(OnQuitClicked);
    }

    private void OnDisable()
    {
        _playButton.UnregisterCallback<ClickEvent>(OnPlayClicked);
        _settingsButton.UnregisterCallback<ClickEvent>(OnSettingsClicked);
        _quitButton.UnregisterCallback<ClickEvent>(OnQuitClicked);
    }

    private void OnPlayClicked(ClickEvent evt) => SceneLoader.LoadGameScene();
    private void OnSettingsClicked(ClickEvent evt) => SettingsPanel.Show();
    private void OnQuitClicked(ClickEvent evt) => Application.Quit();
}
```

---

## Data Binding (Unity 6)

Unity 6 introduces a runtime data binding system that connects UI elements directly to C# properties — no manual `text = value.ToString()` in Update loops.

### Binding Modes

| Mode | Direction | Use Case |
|------|-----------|----------|
| `TwoWay` (default) | Data ↔ UI | Sliders, toggles, text fields |
| `ToTarget` | Data → UI | Health bars, score labels |
| `ToSource` | UI → Data | Player name input |
| `ToTargetOnce` | Data → UI (once) | Static labels set at init |

### Setting Up Bindings in C#

```csharp
using Unity.Properties;
using UnityEngine;
using UnityEngine.UIElements;

// WHY [CreateProperty]: This attribute generates compile-time binding code,
// avoiding runtime reflection. Without it, the binding system can't see the property.
public class PlayerStats : ScriptableObject
{
    [CreateProperty]
    public int Health { get; set; } = 100;

    [CreateProperty]
    public int Score { get; set; } = 0;
}

public class HUDBindingController : MonoBehaviour
{
    [SerializeField] private UIDocument _hudDocument;
    [SerializeField] private PlayerStats _stats;

    private void OnEnable()
    {
        var root = _hudDocument.rootVisualElement;
        var scoreLabel = root.Q<Label>("score-label");

        // Bind the label's text property to PlayerStats.Score
        scoreLabel.SetBinding("text", new DataBinding
        {
            dataSource = _stats,
            dataSourcePath = new PropertyPath(nameof(PlayerStats.Score)),
            bindingMode = BindingMode.ToTarget  // One-way: data → label
        });

        // WHY this is powerful: When you modify _stats.Score from anywhere
        // in your game code, the label updates automatically — no event
        // wiring, no Update() polling, no manual string formatting.
    }
}
```

### Efficient Change Notification

For the binding system to detect changes efficiently, implement `INotifyBindablePropertyChanged`:

```csharp
using System;
using Unity.Properties;
using UnityEngine;

// WHY INotifyBindablePropertyChanged: Without it, the binding system polls
// every frame. With it, updates only fire when you raise the event —
// much better for performance with many bound properties.
public class PlayerStats : ScriptableObject, INotifyBindablePropertyChanged
{
    public event EventHandler<BindablePropertyChangedEventArgs> propertyChanged;

    private int _health = 100;

    [CreateProperty]
    public int Health
    {
        get => _health;
        set
        {
            if (_health == value) return;
            _health = value;
            propertyChanged?.Invoke(this,
                new BindablePropertyChangedEventArgs(nameof(Health)));
        }
    }
}
```

---

## ListView: Virtualized Lists for Inventories & Logs

`ListView` is critical for performance — it only creates visual elements for visible items, recycling them as the user scrolls. Use it for inventories, chat logs, leaderboards, and any list with dynamic length.

```csharp
public class InventoryUI : MonoBehaviour
{
    [SerializeField] private UIDocument _document;
    [SerializeField] private VisualTreeAsset _itemTemplate; // UXML for one row

    private ListView _listView;
    private List<InventoryItem> _items;

    private void OnEnable()
    {
        _listView = _document.rootVisualElement.Q<ListView>("inventory-list");

        // WHY makeItem + bindItem: ListView uses a virtual recycling pattern.
        // makeItem creates the visual element (called sparingly),
        // bindItem populates it with data (called on scroll).
        _listView.makeItem = () => _itemTemplate.Instantiate();

        _listView.bindItem = (element, index) =>
        {
            var item = _items[index];
            element.Q<Label>("item-name").text = item.Name;
            element.Q<Label>("item-count").text = $"x{item.Count}";
            element.Q<VisualElement>("item-icon").style.backgroundImage =
                new StyleBackground(item.Icon);
        };

        _listView.itemsSource = _items;
        _listView.fixedItemHeight = 60; // WHY: Fixed height enables fast scroll
                                        // calculations without measuring each item.
        _listView.selectionType = SelectionType.Single;
        _listView.selectionChanged += OnItemSelected;
    }

    private void OnItemSelected(IEnumerable<object> selectedItems)
    {
        // Handle selection — show item details, equip, etc.
    }
}
```

---

## Creating UI Dynamically from Code

Sometimes you need to build UI at runtime — procedural tooltips, dynamic buff icons, debug overlays.

```csharp
public void ShowFloatingDamage(int amount, Vector2 screenPos)
{
    var root = _hudDocument.rootVisualElement;

    // Create a label entirely from code — no UXML needed
    var dmgLabel = new Label($"-{amount}");
    dmgLabel.AddToClassList("floating-damage");
    dmgLabel.style.position = Position.Absolute;
    dmgLabel.style.left = screenPos.x;
    dmgLabel.style.top = screenPos.y;

    root.Add(dmgLabel);

    // WHY schedule: UI Toolkit has a built-in scheduler for delayed actions.
    // This avoids coroutines for simple timed UI behavior.
    dmgLabel.schedule.Execute(() => root.Remove(dmgLabel)).ExecuteLater(1000);
}
```

---

## Performance Best Practices

1. **Use USS classes, not inline styles.** Inline `style.color = ...` in C# triggers per-element style recalculation. USS class toggling (`AddToClassList` / `RemoveFromClassList`) is batched.

2. **Prefer `ListView` for any list > 20 items.** It virtualizes rendering — only visible items exist in the visual tree.

3. **Minimize visual tree depth.** Deeply nested `VisualElement` containers slow layout passes. Flatten where possible.

4. **Use `INotifyBindablePropertyChanged`** for data binding instead of relying on per-frame polling.

5. **Avoid `Q()` queries every frame.** Cache element references in `OnEnable` and reuse them.

6. **Use transitions in USS, not C# lerps.** USS `transition-property` / `transition-duration` is handled natively and avoids per-frame C# overhead.

7. **Profile with the UI Toolkit Debugger** (`Window > UI Toolkit > Debugger`) — it shows the live visual tree, applied styles, and layout box model, similar to browser DevTools.

---

## Common Patterns

### Screen Manager (Show/Hide Panels)

```csharp
public class ScreenManager : MonoBehaviour
{
    [SerializeField] private UIDocument _document;

    private readonly Dictionary<string, VisualElement> _screens = new();

    private void OnEnable()
    {
        var root = _document.rootVisualElement;

        // WHY register by name: Each "screen" is a top-level VisualElement
        // in the UXML. Showing one hides the others — simple state machine.
        _screens["main-menu"]  = root.Q("main-menu");
        _screens["settings"]   = root.Q("settings");
        _screens["hud"]        = root.Q("hud");
        _screens["pause-menu"] = root.Q("pause-menu");

        ShowScreen("main-menu");
    }

    public void ShowScreen(string screenName)
    {
        foreach (var (name, screen) in _screens)
        {
            // WHY display instead of visibility: display=none removes the
            // element from layout entirely (like CSS display:none).
            // visibility=hidden keeps the layout space reserved.
            screen.style.display = (name == screenName)
                ? DisplayStyle.Flex
                : DisplayStyle.None;
        }
    }
}
```

### Responsive Layout

```css
/* USS responsive pattern using flex */
.inventory-grid {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: flex-start;
}

.inventory-slot {
    width: 80px;
    height: 80px;
    margin: 4px;
    /* WHY flex-grow 0: Fixed-size slots that wrap to the next row
       when the container narrows. The container flexes; the items don't. */
    flex-grow: 0;
    flex-shrink: 0;
}
```
