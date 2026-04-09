# G41 — Accessibility: Screen Readers & Inclusive Design

> **Category:** guide · **Engine:** Unity 6 (6000.x+) · **Related:** [G5 UI Toolkit](G5_ui_toolkit.md) · [G2 Input System](G2_input_system.md) · [G24 Mobile Development](G24_mobile_development.md) · [Unity Rules](../unity-arch-rules.md)

Unity 6 includes a native accessibility API that integrates with platform screen readers — TalkBack on Android, VoiceOver on iOS and macOS, and Narrator on Windows. This guide covers the `AccessibilityHierarchy` system, how to make your UI navigable by assistive technology, and broader inclusive design practices for games.

---

## Why Accessibility Matters for Games

Over 400 million gamers worldwide have some form of disability. Accessibility isn't just ethical — it's a market reality. Platform stores increasingly require or promote accessible titles (Xbox Accessibility Guidelines, PlayStation Access controller ecosystem, Apple's VoiceOver expectations for App Store features). Unity 6's native API makes the technical barrier much lower than it used to be.

---

## Platform Support

| Platform | Screen Reader | Min Version |
|---|---|---|
| Android | TalkBack | API level 26 (Android 8.0+) |
| iOS | VoiceOver | iOS 13+ |
| macOS | VoiceOver | Big Sur (11.0+) |
| Windows | Narrator | Build 19043+ |

Desktop screen reader support (Windows Narrator, macOS VoiceOver) was added in **Unity 6.3**.

---

## Core API: The Accessibility Hierarchy

Unity's accessibility system is built around a tree of `AccessibilityNode` objects organized in an `AccessibilityHierarchy`. This tree is **independent of your UI hierarchy** — you build it yourself, which means it works with UI Toolkit, uGUI, world-space UI, or even non-UI game elements.

### Mental Model

```
Your Game UI                    Accessibility Hierarchy
──────────                      ──────────────────────
┌─ Main Menu ─────────┐         AccessibilityHierarchy
│  [Play]              │           ├─ Node: "Play Button"
│  [Settings]          │           ├─ Node: "Settings Button"
│  Health: ████░ 80%   │           ├─ Node: "Health: 80 percent"
│  Gold: 1,250         │           └─ Node: "Gold: 1250"
└──────────────────────┘

The screen reader navigates the hierarchy (right),
not the visual layout (left). You control the order,
labels, and roles.
```

### Building the Hierarchy

```csharp
using UnityEngine;
using UnityEngine.Accessibility;

public class MenuAccessibility : MonoBehaviour
{
    private AccessibilityHierarchy m_Hierarchy;

    private void OnEnable()
    {
        // Build the hierarchy when this screen becomes active
        BuildHierarchy();

        // Listen for screen reader state changes
        // (user might toggle it on/off at any time)
        AssistiveSupport.screenReaderStatusChanged += OnScreenReaderChanged;

        // If the screen reader is already on, activate immediately
        if (AssistiveSupport.isScreenReaderEnabled)
            ActivateHierarchy();
    }

    private void OnDisable()
    {
        AssistiveSupport.screenReaderStatusChanged -= OnScreenReaderChanged;

        // Clear the active hierarchy when this screen is dismissed
        // so the screen reader doesn't read stale nodes
        if (AssistiveSupport.activeHierarchy == m_Hierarchy)
            AssistiveSupport.activeHierarchy = null;
    }

    private void OnScreenReaderChanged(bool isEnabled)
    {
        if (isEnabled)
            ActivateHierarchy();
        else
            AssistiveSupport.activeHierarchy = null;
    }

    private void BuildHierarchy()
    {
        m_Hierarchy = new AccessibilityHierarchy();

        // --- Play Button ---
        // AddNode returns the new AccessibilityNode
        AccessibilityNode playNode = m_Hierarchy.AddNode("Play");
        playNode.role = AccessibilityRole.Button;
        playNode.hint = "Starts a new game";

        // The invoked event fires when the user activates
        // this node (double-tap on mobile, Enter with Narrator)
        playNode.invoked += () =>
        {
            StartGame();
            return true; // true = event was handled
        };

        // --- Settings Button ---
        AccessibilityNode settingsNode = m_Hierarchy.AddNode("Settings");
        settingsNode.role = AccessibilityRole.Button;
        settingsNode.hint = "Opens the settings menu";
        settingsNode.invoked += () =>
        {
            OpenSettings();
            return true;
        };

        // --- Health Display ---
        // StaticText role = read-only information
        AccessibilityNode healthNode = m_Hierarchy.AddNode(
            "Health: 80 percent");
        healthNode.role = AccessibilityRole.StaticText;

        // Use frameGetter so the node's screen position updates
        // dynamically (the screen reader uses this for spatial
        // awareness and touch exploration)
        healthNode.frameGetter = () => GetScreenRect(healthDisplay);
    }

    private void ActivateHierarchy()
    {
        // Tell Unity this is the hierarchy the screen reader
        // should navigate. Only one hierarchy can be active
        // at a time — swap it when screens change.
        AssistiveSupport.activeHierarchy = m_Hierarchy;
    }

    // Helper: convert a RectTransform to screen-space Rect
    private Rect GetScreenRect(RectTransform rt)
    {
        Vector3[] corners = new Vector3[4];
        rt.GetWorldCorners(corners);
        // Convert world corners to screen coordinates
        Vector3 min = RectTransformUtility.WorldToScreenPoint(
            null, corners[0]);
        Vector3 max = RectTransformUtility.WorldToScreenPoint(
            null, corners[2]);
        return new Rect(min.x, min.y, max.x - min.x, max.y - min.y);
    }

    private void StartGame() { /* ... */ }
    private void OpenSettings() { /* ... */ }
    private RectTransform healthDisplay;
}
```

### Key API Reference

#### AccessibilityHierarchy

| Method | Purpose |
|---|---|
| `AddNode(label)` | Add a root-level node with the given label |
| `AddNode(label, parent)` | Add a child node under an existing parent |
| `InsertNode(label, parent, index)` | Insert at a specific position among siblings |
| `RemoveNode(node)` | Remove a node and its descendants |
| `MoveNode(node, newParent, index)` | Reparent a node (e.g., when UI reorders) |
| `Clear()` | Remove all nodes and reset screen reader focus |
| `TryGetNode(id)` | Look up a node by its unique ID |
| `TryGetNodeAt(screenCoords)` | Find the node at a screen position (touch exploration) |
| `RefreshNodeFrames()` | Force-update all nodes' screen positions |
| `ContainsNode(node)` | Check if a node exists in this hierarchy |

#### AccessibilityNode Properties

| Property | Type | Purpose |
|---|---|---|
| `label` | `string` | What the screen reader speaks (keep short and descriptive) |
| `hint` | `string` | Additional guidance ("Double-tap to activate") |
| `value` | `string` | Current value for controls ("50 percent", "On") |
| `role` | `AccessibilityRole` | Semantic type — tells the screen reader how to present the node |
| `state` | `AccessibilityState` | Disabled, selected, etc. |
| `isActive` | `bool` | Whether the screen reader can see this node (default: `true`) |
| `isFocused` | `bool` | Whether this node currently has screen reader focus (read-only) |
| `frame` | `Rect` | Screen-space bounding box for touch exploration |
| `frameGetter` | `Func<Rect>` | Delegate for dynamic frame updates |
| `allowsDirectInteraction` | `bool` | Permits raw touch input even when screen reader is active |

#### AccessibilityRole Values

| Role | When to Use |
|---|---|
| `Button` | Tappable / clickable actions |
| `StaticText` | Read-only labels and information |
| `Image` | Decorative or informational images (provide alt text via `label`) |
| `Toggle` | On/off switches, checkboxes |
| `Slider` | Range controls (volume, brightness) |
| `TextField` | Text input fields |
| `Header` | Section headings (screen readers can jump between headers) |
| `TabBar` | Tab navigation containers |
| `ScrollView` | Scrollable regions |

#### AccessibilityNode Events

| Event | Fires When |
|---|---|
| `invoked` | User activates the node (double-tap / Enter) |
| `incremented` | User swipes up on a slider-role node |
| `decremented` | User swipes down on a slider-role node |
| `scrolled` | User performs a scroll gesture on this node |
| `dismissed` | User performs the dismiss/back gesture (two-finger scrub on iOS) |
| `focusChanged` | Screen reader focus enters or leaves this node |

---

## Navigation Order

The screen reader navigates nodes in **depth-first traversal order** of the hierarchy — *not* by screen position. This means you control the reading order by controlling the tree structure:

```csharp
// This reads: "Main Menu" → "Play" → "Settings" → "Status Bar" → "Health"
var menuGroup = hierarchy.AddNode("Main Menu");
menuGroup.role = AccessibilityRole.Header;

var play = hierarchy.AddNode("Play", menuGroup);       // child of menu
var settings = hierarchy.AddNode("Settings", menuGroup); // child of menu

var statusGroup = hierarchy.AddNode("Status Bar");
statusGroup.role = AccessibilityRole.Header;

var health = hierarchy.AddNode("Health: 80%", statusGroup);
```

**Tip:** Group related elements under a parent node with a `Header` role. This lets screen reader users jump between sections quickly.

---

## Updating the Hierarchy at Runtime

Games are dynamic — health changes, items appear, dialogs open. Keep the hierarchy in sync:

```csharp
// When health changes, update the node's label
private void OnHealthChanged(int newHealth)
{
    m_HealthNode.label = $"Health: {newHealth} percent";

    // Optionally notify the screen reader that this node changed
    // so it re-reads the label if the node is focused
    AssistiveSupport.NotificationDispatcher.SendLayoutChanged();
}

// When a dialog opens, swap to its hierarchy
private void OnDialogOpened(AccessibilityHierarchy dialogHierarchy)
{
    AssistiveSupport.activeHierarchy = dialogHierarchy;
}
```

---

## Accessibility Settings API

Beyond screen readers, Unity provides `AccessibilitySettings` for respecting system-wide preferences:

```csharp
using UnityEngine.Accessibility;

// Check if the user has enabled bold text system-wide
bool boldText = AccessibilitySettings.isBoldTextEnabled;

// Check if closed captions are preferred
bool captions = AccessibilitySettings.isClosedCaptioningEnabled;

// Get the user's preferred font scale (1.0 = default)
float fontScale = AccessibilitySettings.fontScale;

// React to font scale for your UI
float baseFontSize = 16f;
float scaledSize = baseFontSize * fontScale;
```

---

## Debugging with the Hierarchy Viewer

Unity 6 includes the **Accessibility Hierarchy Viewer** (Window > Accessibility > Accessibility Hierarchy Viewer). During Play mode, it displays:

- The active hierarchy tree in real time
- Each node's label, role, state, and frame
- Which node currently has screen reader focus
- Warnings for common issues (missing labels, zero-size frames)

This is your primary debugging tool — use it before testing on a real device.

---

## Beyond Screen Readers: Inclusive Game Design

Screen reader support is one pillar of accessibility. Consider these additional practices:

### Visual

- **Remappable colors** — let players adjust UI colors for color blindness (protanopia, deuteranopia, tritanopia)
- **Scalable UI** — respect `AccessibilitySettings.fontScale` and offer in-game text size options
- **High contrast mode** — provide an option to increase contrast on HUD elements
- **Screen shake toggle** — allow disabling camera shake effects

### Motor

- **Fully remappable controls** — the Unity Input System (see G2) supports runtime rebinding
- **One-handed modes** — offer alternative control schemes
- **Adjustable timings** — QTE windows, hold durations, double-tap speed
- **Auto-aim and aim assist** — configurable levels

### Auditory

- **Subtitles and captions** — with speaker identification and sound-effect descriptions
- **Visual cues for audio** — directional indicators for off-screen sounds
- **Mono audio option** — for players with hearing loss in one ear

### Cognitive

- **Difficulty options** — separate difficulty for combat, puzzles, navigation
- **Objective reminders** — clear, accessible quest/task tracking
- **Tutorial replay** — let players revisit tutorials at any time
- **Reduced UI clutter** — option to simplify the HUD

---

## Testing Checklist

1. Enable TalkBack (Android) or VoiceOver (iOS/macOS) and navigate your entire game using only the screen reader
2. Verify every interactive element has a meaningful label and correct role
3. Confirm navigation order is logical (not random or layout-dependent)
4. Test with system font scaling at 200% — does your UI still function?
5. Test with system bold text enabled
6. Run the Accessibility Hierarchy Viewer and fix any warnings
7. Test with a gamepad and keyboard only — no mouse/touch

---

## Version Notes

| Version | Change |
|---|---|
| Unity 6.0 (6000.0) | `AccessibilityHierarchy`, `AccessibilityNode`, `AssistiveSupport` APIs; Android TalkBack and iOS VoiceOver support |
| Unity 6.1 (6000.1) | `AccessibilitySettings` API for font scale, bold text, closed captions |
| Unity 6.2 (6000.2) | Mobile accessibility optimizations, Hierarchy Viewer improvements |
| Unity 6.3 (6000.3) | Native desktop screen reader support (Windows Narrator, macOS VoiceOver) |
