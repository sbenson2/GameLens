# G69 — UI Toolkit Advanced: Data Binding & Custom Controls

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G5 UI Toolkit](G5_ui_toolkit.md) · [G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md) · [G37 Event-Driven Architecture](G37_event_driven_architecture.md)

Unity 6 introduced a runtime data binding system for UI Toolkit that automatically synchronizes C# data with UI elements — no manual `text = value.ToString()` updates. Combined with the new `[UxmlElement]` / `[UxmlAttribute]` attributes for custom controls, this enables an MVVM (Model-View-ViewModel) architecture for game UI. This guide covers the binding system, custom controls, type converters, and production patterns.

> **Prerequisite:** Read [G5 — UI Toolkit for Runtime Game UI](G5_ui_toolkit.md) for foundational UIDocument, UXML, USS, and element querying concepts.

---

## Why Data Binding?

Without bindings, every UI update requires imperative code:

```csharp
// Old approach — manual updates scattered across MonoBehaviours
void UpdateHealthBar()
{
    healthLabel.text = player.Health.ToString();
    healthBar.style.width = new Length(player.Health, LengthUnit.Percent);
    healthBar.style.backgroundColor = GetHealthColor(player.Health);
}
```

With Unity 6's binding system, you declare the connection once and the framework handles synchronization:

```
MVVM Architecture
────────────────────────────────────────────────────
Model (C# data)    ←→    ViewModel (bindings)    ←→    View (UXML)
  PlayerDataSO              DataBinding                 Label, ProgressBar
  health: 75               dataSourcePath:              text="{Health}"
                           "Health"
```

---

## Data Source Setup

A **data source** is any C# object whose properties you want to bind to UI elements. Unity's binding system uses **property bags** (compile-time generated) to efficiently traverse data — no runtime reflection.

### Using ScriptableObjects as Data Sources

ScriptableObjects are the most common data source pattern for game UI — they decouple data from MonoBehaviour lifecycle:

```csharp
using System;
using Unity.Properties;
using UnityEngine;

/// <summary>
/// Data source for player health UI. ScriptableObject lets you edit
/// values in the Inspector and share data between systems.
///
/// Key attributes:
/// - [CreateProperty] exposes a property to the binding system
/// - [DontCreateProperty] hides a serialized field from bindings
/// - Unity.Properties namespace provides the binding infrastructure
/// </summary>
[CreateAssetMenu(fileName = "PlayerData", menuName = "Game/Player Data")]
public class PlayerDataSO : ScriptableObject
{
    // Backing fields — serialized for Inspector but hidden from bindings
    [SerializeField, DontCreateProperty]
    private string m_PlayerName = "Player 1";

    [SerializeField, DontCreateProperty]
    private int m_MaxHealth = 100;

    [SerializeField, DontCreateProperty, Range(0, 200)]
    private int m_CurrentHealth = 100;

    // Public properties — exposed to the binding system via [CreateProperty]
    // The binding system reads these, NOT the backing fields

    [CreateProperty]
    public string PlayerName => m_PlayerName;

    [CreateProperty]
    public int CurrentHealth => Mathf.Clamp(m_CurrentHealth, 0, m_MaxHealth);

    [CreateProperty]
    public int MaxHealth => m_MaxHealth;

    // Computed property — bindings auto-update when dependencies change
    [CreateProperty]
    public float HealthPercent => MaxHealth > 0
        ? (float)CurrentHealth / MaxHealth
        : 0f;
}
```

### Using Plain C# Classes

Any C# object works as a data source — it doesn't have to be a ScriptableObject:

```csharp
using Unity.Properties;

/// <summary>
/// Lightweight data source for inventory slot UI.
/// Plain C# class — no MonoBehaviour or ScriptableObject needed.
/// </summary>
public class InventorySlotData
{
    [CreateProperty]
    public string ItemName { get; set; } = "Empty";

    [CreateProperty]
    public int Quantity { get; set; } = 0;

    [CreateProperty]
    public string IconPath { get; set; } = "";

    [CreateProperty]
    public bool IsEmpty => Quantity <= 0;
}
```

---

## Binding in C# Code

### Basic Binding Setup

```csharp
using UnityEngine;
using UnityEngine.UIElements;
using Unity.Properties;

/// <summary>
/// Sets up data bindings between a PlayerDataSO and the HUD elements.
/// Attach to the same GameObject as your UIDocument.
/// </summary>
public class HealthBarController : MonoBehaviour
{
    [SerializeField] private PlayerDataSO m_PlayerData;

    void OnEnable()
    {
        var root = GetComponent<UIDocument>().rootVisualElement;

        // Option A: Set data source on a parent — all children inherit it
        // This is the preferred pattern for panels with a single data source
        var healthPanel = root.Q<VisualElement>("health-panel");
        healthPanel.dataSource = m_PlayerData;

        // Option B: Bind individual elements with explicit paths
        var nameLabel = root.Q<Label>("player-name");
        nameLabel.SetBinding("text", new DataBinding
        {
            // dataSource inherited from parent (healthPanel)
            dataSourcePath = new PropertyPath(nameof(PlayerDataSO.PlayerName)),
            bindingMode = BindingMode.ToTarget  // Data → UI only (read-only)
        });

        var healthBar = root.Q<ProgressBar>("health-bar");
        healthBar.SetBinding("value", new DataBinding
        {
            dataSourcePath = new PropertyPath(nameof(PlayerDataSO.CurrentHealth)),
            bindingMode = BindingMode.ToTarget
        });

        healthBar.SetBinding("highValue", new DataBinding
        {
            dataSourcePath = new PropertyPath(nameof(PlayerDataSO.MaxHealth)),
            bindingMode = BindingMode.ToTarget
        });
    }
}
```

### Binding Modes

| Mode | Direction | Use Case |
|---|---|---|
| `BindingMode.TwoWay` | Data ↔ UI | Settings sliders, input fields |
| `BindingMode.ToTarget` | Data → UI | Health bars, score displays (read-only) |
| `BindingMode.ToSource` | UI → Data | Capturing user input back to the model |
| `BindingMode.ToTargetOnce` | Data → UI (once) | Static labels set at load time |

### Data Source Inheritance

Data sources cascade down the visual tree, just like USS styles:

```csharp
// Parent sets the data source — all descendants can bind to it
var root = new VisualElement();
root.dataSource = playerData;

// Child elements automatically inherit the data source
// They only need a dataSourcePath, not their own dataSource
var nameLabel = new Label();
nameLabel.SetBinding("text", new DataBinding
{
    dataSourcePath = new PropertyPath("PlayerName"),
    // No dataSource needed — inherited from root
});
root.Add(nameLabel);

// Override for a subtree with different data
var enemyPanel = new VisualElement();
enemyPanel.dataSource = enemyData;  // Children of this panel use enemyData
root.Add(enemyPanel);
```

---

## Binding in UXML (UI Builder)

You can set up bindings directly in UXML — no C# required for the binding wiring:

```xml
<ui:UXML xmlns:ui="UnityEngine.UIElements">
  <ui:VisualElement name="health-panel">

    <!-- Bind label text to PlayerName property on the inherited data source -->
    <ui:Label name="player-name" text="Placeholder">
      <Bindings>
        <ui:DataBinding property="text"
                        data-source-path="PlayerName"
                        binding-mode="ToTarget" />
      </Bindings>
    </ui:Label>

    <!-- Bind progress bar value to CurrentHealth -->
    <ui:ProgressBar name="health-bar">
      <Bindings>
        <ui:DataBinding property="value"
                        data-source-path="CurrentHealth"
                        binding-mode="ToTarget" />
        <ui:DataBinding property="highValue"
                        data-source-path="MaxHealth"
                        binding-mode="ToTarget" />
      </Bindings>
    </ui:ProgressBar>

  </ui:VisualElement>
</ui:UXML>
```

The data source is still assigned at runtime in C#:

```csharp
void OnEnable()
{
    var root = GetComponent<UIDocument>().rootVisualElement;
    // UXML already has binding paths — just assign the data source
    root.Q("health-panel").dataSource = m_PlayerData;
}
```

**Hybrid approach tip:** Define binding paths in UXML (via UI Builder), then assign data sources at runtime in C#. This reduces boilerplate and lets you swap data sources dynamically (e.g., switching which player's stats are displayed).

---

## Type Converters

When the data source type doesn't match the UI property type, register a **ConverterGroup** to transform values automatically.

```csharp
using UnityEngine;
using UnityEngine.UIElements;

/// <summary>
/// Converts a health percentage (float 0-1) to a color for the health bar.
/// Registered globally — any binding can reference this converter by name.
/// </summary>
public static class HealthConverters
{
    static readonly Color FullHealth  = new Color(0.2f, 1f, 0.2f);  // Green
    static readonly Color MidHealth   = Color.yellow;
    static readonly Color LowHealth   = new Color(1f, 0.3f, 0f);    // Orange
    static readonly Color CritHealth  = Color.red;

    // Use InitializeOnLoadMethod (Editor) + RuntimeInitializeOnLoadMethod (builds)
    // to ensure converters are registered before any UI binds
#if UNITY_EDITOR
    [UnityEditor.InitializeOnLoadMethod]
#endif
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
    public static void Register()
    {
        var group = new ConverterGroup("HealthColor");

        // float → StyleColor conversion
        group.AddConverter((ref float healthPercent) =>
        {
            Color color;
            if (healthPercent > 0.5f)
                color = Color.Lerp(MidHealth, FullHealth, (healthPercent - 0.5f) * 2f);
            else if (healthPercent > 0.25f)
                color = Color.Lerp(LowHealth, MidHealth, (healthPercent - 0.25f) * 4f);
            else
                color = Color.Lerp(CritHealth, LowHealth, healthPercent * 4f);

            return new StyleColor(color);
        });

        ConverterGroups.RegisterConverterGroup(group);
    }
}
```

Reference the converter in UXML:

```xml
<ui:VisualElement name="health-fill">
  <Bindings>
    <ui:DataBinding property="style.backgroundColor"
                    data-source-path="HealthPercent"
                    binding-mode="ToTarget"
                    source-to-ui-converters="HealthColor" />
  </Bindings>
</ui:VisualElement>
```

---

## Custom Controls with UxmlElement & UxmlAttribute

Unity 6 replaced the legacy `UxmlFactory` / `UxmlTraits` pattern with simple attributes.

### Before (Legacy — Unity 2021–2022)

```csharp
// Old approach — verbose boilerplate for every custom control
public class StatBar : VisualElement
{
    public new class UxmlFactory : UxmlFactory<StatBar, UxmlTraits> {}
    public new class UxmlTraits : VisualElement.UxmlTraits
    {
        UxmlStringAttributeDescription m_Label = new() { name = "label" };
        UxmlFloatAttributeDescription m_Value = new() { name = "value" };

        public override void Init(VisualElement ve, IUxmlAttributes bag, CreationContext cc)
        {
            base.Init(ve, bag, cc);
            ((StatBar)ve).Label = m_Label.GetValueFromBag(bag, cc);
            ((StatBar)ve).Value = m_Value.GetValueFromBag(bag, cc);
        }
    }
    // ... actual properties and logic
}
```

### After (Unity 6 — UxmlElement)

```csharp
using UnityEngine;
using UnityEngine.UIElements;

/// <summary>
/// Custom stat bar control — displays a label, fill bar, and numeric value.
/// [UxmlElement] makes it available in UI Builder's Library panel.
/// [UxmlAttribute] exposes properties as editable attributes in the Inspector.
///
/// Usage in UXML: <StatBar label="Health" value="0.75" bar-color="#44ff44" />
/// </summary>
[UxmlElement]
public partial class StatBar : VisualElement
{
    // UxmlAttribute properties appear in UI Builder's Inspector
    // when you select an instance of this control

    [UxmlAttribute]
    public string Label
    {
        get => m_Label.text;
        set => m_Label.text = value;
    }

    [UxmlAttribute]
    public float Value
    {
        get => m_Value;
        set
        {
            m_Value = Mathf.Clamp01(value);
            m_Fill.style.width = new Length(m_Value * 100f, LengthUnit.Percent);
            m_ValueLabel.text = $"{Mathf.RoundToInt(m_Value * 100)}%";
        }
    }

    [UxmlAttribute]
    public Color BarColor
    {
        get => m_BarColor;
        set
        {
            m_BarColor = value;
            m_Fill.style.backgroundColor = value;
        }
    }

    // Internal elements
    private readonly Label m_Label;
    private readonly VisualElement m_Fill;
    private readonly Label m_ValueLabel;
    private float m_Value;
    private Color m_BarColor = Color.green;

    public StatBar()
    {
        // Build the visual tree in the constructor
        // This runs when UI Builder or runtime instantiates the element

        style.flexDirection = FlexDirection.Row;
        style.alignItems = Align.Center;
        style.height = 24;

        m_Label = new Label("Stat") { name = "stat-label" };
        m_Label.style.width = 80;
        m_Label.style.unityTextAlign = TextAnchor.MiddleLeft;
        Add(m_Label);

        var track = new VisualElement { name = "stat-track" };
        track.style.flexGrow = 1;
        track.style.height = new Length(100, LengthUnit.Percent);
        track.style.backgroundColor = new Color(0.2f, 0.2f, 0.2f);
        Add(track);

        m_Fill = new VisualElement { name = "stat-fill" };
        m_Fill.style.height = new Length(100, LengthUnit.Percent);
        m_Fill.style.backgroundColor = m_BarColor;
        track.Add(m_Fill);

        m_ValueLabel = new Label("0%") { name = "stat-value" };
        m_ValueLabel.style.width = 40;
        m_ValueLabel.style.unityTextAlign = TextAnchor.MiddleRight;
        Add(m_ValueLabel);
    }
}
```

### Using Custom Controls in UXML

Once decorated with `[UxmlElement]`, the control appears in UI Builder's Library:

```xml
<ui:UXML xmlns:ui="UnityEngine.UIElements">
  <StatBar label="Health" value="1.0" bar-color="#44ff44" />
  <StatBar label="Mana" value="0.6" bar-color="#4488ff" />
  <StatBar label="Stamina" value="0.85" bar-color="#ffcc00" />
</ui:UXML>
```

### Combining Custom Controls with Data Binding

```csharp
/// <summary>
/// Wires up StatBar custom controls to a character's data source.
/// Each StatBar binds its Value property to a different stat.
/// </summary>
public class CharacterStatsUI : MonoBehaviour
{
    [SerializeField] private CharacterDataSO m_CharacterData;

    void OnEnable()
    {
        var root = GetComponent<UIDocument>().rootVisualElement;
        root.dataSource = m_CharacterData;

        // Query custom controls by name and bind
        var healthBar = root.Q<StatBar>("health-bar");
        healthBar.SetBinding("Value", new DataBinding
        {
            dataSourcePath = new PropertyPath("HealthPercent"),
            bindingMode = BindingMode.ToTarget
        });

        var manaBar = root.Q<StatBar>("mana-bar");
        manaBar.SetBinding("Value", new DataBinding
        {
            dataSourcePath = new PropertyPath("ManaPercent"),
            bindingMode = BindingMode.ToTarget
        });
    }
}
```

---

## ListView Binding

For dynamic lists (inventory, leaderboards, chat), bind a ListView to a collection property:

```csharp
using System.Collections.Generic;
using Unity.Properties;
using UnityEngine;
using UnityEngine.UIElements;

/// <summary>
/// Data source containing a list of players for a leaderboard.
/// </summary>
public class LeaderboardData : ScriptableObject
{
    [SerializeField, DontCreateProperty]
    private List<string> m_Players = new();

    // Expose the list to the binding system
    [CreateProperty]
    public List<string> Players => m_Players;
}

/// <summary>
/// Binds a ListView to the Players collection.
/// The list auto-updates when items are added or removed.
/// </summary>
public class LeaderboardUI : MonoBehaviour
{
    [SerializeField] private LeaderboardData m_Data;

    void OnEnable()
    {
        var root = GetComponent<UIDocument>().rootVisualElement;
        var listView = root.Q<ListView>("leaderboard-list");

        // Set the data source on the ListView
        listView.dataSource = m_Data;

        // Bind itemsSource to the Players property
        listView.SetBinding("itemsSource", new DataBinding
        {
            dataSourcePath = new PropertyPath(nameof(LeaderboardData.Players))
        });

        // Configure how each item is displayed
        listView.makeItem = () => new Label();
        listView.bindItem = (element, index) =>
        {
            ((Label)element).text = m_Data.Players[index];
        };
    }
}
```

---

## Production Patterns

### Pattern 1: ViewModel Layer

For complex UI, add a ViewModel between raw game data and the UI:

```csharp
using Unity.Properties;
using UnityEngine;

/// <summary>
/// ViewModel that formats raw game data for UI consumption.
/// Keeps formatting logic out of both the data model and UI code.
/// </summary>
public class PlayerHUDViewModel
{
    private PlayerDataSO _data;

    public PlayerHUDViewModel(PlayerDataSO data) => _data = data;

    [CreateProperty]
    public string HealthText => $"{_data.CurrentHealth} / {_data.MaxHealth}";

    [CreateProperty]
    public float HealthPercent => _data.HealthPercent;

    [CreateProperty]
    public string PlayerName => _data.PlayerName;

    [CreateProperty]
    public bool IsLowHealth => _data.HealthPercent < 0.25f;

    [CreateProperty]
    public string StatusText => _data.CurrentHealth <= 0
        ? "DEFEATED"
        : _data.HealthPercent < 0.25f
            ? "CRITICAL"
            : "OK";
}
```

### Pattern 2: Panel Manager with Dynamic Data Sources

```csharp
/// <summary>
/// Manages which character's data is displayed in a shared detail panel.
/// Swapping the data source automatically rebinds all UI elements.
/// </summary>
public class CharacterDetailPanel : MonoBehaviour
{
    private VisualElement _panel;

    void OnEnable()
    {
        _panel = GetComponent<UIDocument>().rootVisualElement.Q("detail-panel");
        // Bindings are defined in UXML — just need to assign/swap data source
    }

    /// <summary>
    /// Called when the player selects a different character.
    /// All bindings in the panel update automatically.
    /// </summary>
    public void ShowCharacter(CharacterDataSO character)
    {
        _panel.dataSource = character;
    }
}
```

---

## Performance Tips

1. **Use `ToTarget` mode** for read-only displays — avoids unnecessary UI→data polling
2. **Minimize binding count** — bind at the panel level with inheritance rather than per-element
3. **Use `ToTargetOnce`** for static labels (player name, item description) that don't change after load
4. **Prefer UXML bindings** over C# setup — paths are resolved once at build time
5. **Avoid deep property paths** — `dataSourcePath = "Stats.Health.Current"` traverses multiple property bags each frame. Flatten your ViewModel.
6. **Custom controls:** Build the visual tree in the constructor, not in a callback — the constructor runs once during instantiation

---

## Migration from uGUI

| uGUI Pattern | UI Toolkit Equivalent |
|---|---|
| `Text.text = value` | `DataBinding` with `ToTarget` mode |
| `Slider.onValueChanged` | `DataBinding` with `TwoWay` mode |
| `ScrollRect` + `ContentSizeFitter` | `ListView` with `itemsSource` binding |
| Custom `Graphic` subclass | `[UxmlElement]` with `generateVisualContent` |
| `Canvas.sortingOrder` | `PanelSettings.sortingOrder` |
| `LayoutGroup` components | USS `flex-direction`, `flex-grow`, `flex-wrap` |

---

## Common Pitfalls

1. **Missing `[CreateProperty]`** — Properties without this attribute are invisible to the binding system. The binding silently does nothing.
2. **Forgetting `partial` on `[UxmlElement]` classes** — The source generator requires the `partial` keyword. You'll get a compile error without it.
3. **sRGB / data source not assigned** — Bindings in UXML won't do anything until you assign `element.dataSource` at runtime in C#.
4. **Converter not registered early enough** — Use `[RuntimeInitializeOnLoadMethod(SubsystemRegistration)]` to guarantee converters exist before the first binding resolves.
5. **Two-way binding on computed properties** — If a property has no setter, `TwoWay` mode silently falls back to `ToTarget`. Use an explicit `ToTarget` for clarity.
