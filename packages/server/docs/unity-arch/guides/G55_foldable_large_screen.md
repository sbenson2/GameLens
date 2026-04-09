# G55 — Foldable & Large Screen Adaptive Layout

> **Category:** guide · **Engine:** Unity 6.1+ (6000.1) · **Related:** [G24 Mobile Development](G24_mobile_development.md) · [G5 UI Toolkit](G5_ui_toolkit.md) · [G2 Input System](G2_input_system.md) · [Unity Rules](../unity-arch-rules.md)

Unity 6.1 adds first-class support for **foldable Android devices** and **large-format screens** (tablets, Chromebooks, desktop Android). Games must handle dynamic resolution changes, safe areas that shift mid-session, and multi-window mode. This guide covers the APIs, UI adaptation strategies, and testing patterns needed to ship on these form factors.

---

## Why This Matters

Foldable phones (Samsung Galaxy Fold/Flip, Google Pixel Fold, OnePlus Open) represent a growing segment of the Android market. When a player unfolds their device mid-game, your game's screen dimensions change instantly. If your game doesn't adapt, it either letterboxes, stretches, or crashes.

```
Folded State (narrow)              Unfolded State (wide)
┌──────────┐                      ┌────────────────────────┐
│          │                      │                        │
│  Game    │   ── unfold ──►      │       Game             │
│  View    │                      │       View             │
│          │                      │                        │
│          │                      │                        │
└──────────┘                      └────────────────────────┘
 ~900×2100px                       ~1800×2100px (landscape)

 Your game must handle this transition
 at runtime without restarting.
```

---

## Platform Requirements

### Resizable Activity

Unity 6 enables **Resizable Activity** by default for new projects. This sets `android:resizeableActivity="true"` in the Android manifest, which allows:

- Fold/unfold transitions without activity restart
- Multi-window (split-screen) mode
- Freeform window resizing on desktop Android / ChromeOS

```
Player Settings → Android → Resolution and Presentation
  ✓ Resizable Window (enabled by default in Unity 6+)
```

> **Warning:** If your game disables Resizable Activity, Android may force-restart the activity on fold/unfold, causing the player to lose unsaved progress.

### Minimum API Level

Foldable APIs require Android 10+ (API level 29). The `AndroidApplication.onConfigurationChanged` callback requires Unity 6.0+.

---

## Core API: Configuration Change Detection

The `AndroidApplication.onConfigurationChanged` event fires whenever the device configuration changes — fold/unfold, rotation, multi-window resize, or display mode switch.

```csharp
using UnityEngine;
using UnityEngine.Android;

// WHY: This is the central hook for responding to foldable device changes.
// Unlike Screen.width/height polling, this callback fires immediately when
// the OS reports a configuration change, with full details about WHAT changed.
public class FoldableLayoutManager : MonoBehaviour
{
    private AndroidConfiguration _previousConfig;

    void Start()
    {
        // WHY: Only subscribe on Android. Other platforms don't have
        // AndroidApplication and this would cause compile errors
        // without platform-conditional compilation.
#if UNITY_ANDROID && !UNITY_EDITOR
        _previousConfig = new AndroidConfiguration(AndroidApplication.currentConfiguration);
        AndroidApplication.onConfigurationChanged += OnConfigurationChanged;

        // Apply initial layout based on current state
        ApplyLayout(AndroidApplication.currentConfiguration);
#endif
    }

    void OnDestroy()
    {
#if UNITY_ANDROID && !UNITY_EDITOR
        AndroidApplication.onConfigurationChanged -= OnConfigurationChanged;
#endif
    }

    private void OnConfigurationChanged(AndroidConfiguration newConfig)
    {
        // WHY: Check WHAT changed to respond appropriately.
        // A language change shouldn't trigger a layout rebuild.

        bool screenChanged =
            _previousConfig.screenWidthDp != newConfig.screenWidthDp ||
            _previousConfig.screenHeightDp != newConfig.screenHeightDp ||
            _previousConfig.screenLayoutSize != newConfig.screenLayoutSize ||
            _previousConfig.orientation != newConfig.orientation;

        if (screenChanged)
        {
            Debug.Log($"Screen changed: {newConfig.screenWidthDp}x{newConfig.screenHeightDp}dp, " +
                      $"layout={newConfig.screenLayoutSize}, orientation={newConfig.orientation}");
            ApplyLayout(newConfig);
        }

        // WHY: Night mode changes let you switch themes dynamically
        // without requiring the player to restart the game.
        if (_previousConfig.uiModeNight != newConfig.uiModeNight)
        {
            ApplyNightMode(newConfig.uiModeNight);
        }

        // WHY: Store the config for diffing on the next change.
        _previousConfig = new AndroidConfiguration(newConfig);
    }

    private void ApplyLayout(AndroidConfiguration config)
    {
        // Determine screen category
        bool isLargeScreen = config.screenLayoutSize >= ScreenLayoutSize.Large;
        bool isTablet = config.smallestScreenWidthDp >= 600;

        if (isTablet || isLargeScreen)
        {
            // WHY: On large screens, use wider UI layouts, larger touch
            // targets, and potentially show more game world.
            SetTabletLayout();
        }
        else
        {
            SetPhoneLayout();
        }
    }

    private void SetTabletLayout() { /* Adjust UI panels, camera FOV, etc. */ }
    private void SetPhoneLayout()  { /* Compact layout for narrow screens */ }
    private void ApplyNightMode(UIModeNight mode) { /* Switch color theme */ }
}
```

### Key `AndroidConfiguration` Properties

| Property | Type | What It Tells You |
|----------|------|-------------------|
| `screenWidthDp` | int | Current screen width in density-independent pixels |
| `screenHeightDp` | int | Current screen height in dp |
| `smallestScreenWidthDp` | int | Smallest dimension (stable across rotation) |
| `screenLayoutSize` | enum | `Small`, `Normal`, `Large`, `XLarge` |
| `orientation` | enum | `Portrait`, `Landscape`, `Undefined` |
| `uiModeNight` | enum | `No` (day), `Yes` (night) |

---

## Safe Area Handling

The safe area is the rectangular region of the screen not obscured by notches, rounded corners, camera cutouts, or system UI. On foldable devices, the safe area changes when folding/unfolding.

### Screen.safeArea API

```csharp
using UnityEngine;

// WHY: Screen.safeArea returns a Rect in pixel coordinates with origin
// at bottom-left. UI Toolkit uses top-left origin, so you need to invert Y.
// UGUI's Canvas uses bottom-left, matching safeArea directly.
public class SafeAreaAdapter : MonoBehaviour
{
    [SerializeField] private RectTransform _safeAreaPanel;

    private Rect _lastSafeArea;

    void Update()
    {
        // WHY: Poll every frame because safe area can change at any time
        // (fold/unfold, rotation, system bar show/hide).
        // The cost is negligible — it's just reading a cached Rect.
        if (Screen.safeArea != _lastSafeArea)
        {
            _lastSafeArea = Screen.safeArea;
            ApplySafeArea(_lastSafeArea);
        }
    }

    private void ApplySafeArea(Rect safeArea)
    {
        // WHY: Convert pixel coordinates to anchor positions (0-1 range)
        // so the RectTransform adapts to any resolution.
        Vector2 anchorMin = safeArea.position;
        Vector2 anchorMax = safeArea.position + safeArea.size;

        anchorMin.x /= Screen.width;
        anchorMin.y /= Screen.height;
        anchorMax.x /= Screen.width;
        anchorMax.y /= Screen.height;

        _safeAreaPanel.anchorMin = anchorMin;
        _safeAreaPanel.anchorMax = anchorMax;

        // WHY: Zero out offsets so the panel matches anchors exactly.
        _safeAreaPanel.offsetMin = Vector2.zero;
        _safeAreaPanel.offsetMax = Vector2.zero;

        Debug.Log($"Safe area applied: {safeArea} → anchors ({anchorMin}, {anchorMax})");
    }
}
```

### Safe Area with UI Toolkit

UI Toolkit's coordinate system has its origin at the **top-left**, while `Screen.safeArea` uses **bottom-left**. You must invert the Y axis:

```csharp
using UnityEngine;
using UnityEngine.UIElements;

// WHY: UI Toolkit doesn't have a built-in safe area element.
// This script applies safe area margins to a root VisualElement
// so all child UI stays within the safe region.
[RequireComponent(typeof(UIDocument))]
public class UIToolkitSafeArea : MonoBehaviour
{
    private VisualElement _root;
    private Rect _lastSafeArea;

    void OnEnable()
    {
        _root = GetComponent<UIDocument>().rootVisualElement;
        // WHY: Register a callback so we also update when the UI rebuilds.
        _root.RegisterCallback<GeometryChangedEvent>(OnGeometryChanged);
    }

    void Update()
    {
        if (Screen.safeArea != _lastSafeArea)
        {
            _lastSafeArea = Screen.safeArea;
            ApplySafeArea();
        }
    }

    private void OnGeometryChanged(GeometryChangedEvent evt)
    {
        ApplySafeArea();
    }

    private void ApplySafeArea()
    {
        var safeArea = Screen.safeArea;

        // WHY: Convert bottom-left origin to top-left origin for UI Toolkit.
        // safeArea.y is distance from bottom; we need distance from top.
        float topInset = Screen.height - (safeArea.y + safeArea.height);
        float bottomInset = safeArea.y;
        float leftInset = safeArea.x;
        float rightInset = Screen.width - (safeArea.x + safeArea.width);

        // WHY: Apply as padding on the root element so all children
        // are inset within the safe area automatically.
        _root.style.paddingTop = topInset;
        _root.style.paddingBottom = bottomInset;
        _root.style.paddingLeft = leftInset;
        _root.style.paddingRight = rightInset;
    }
}
```

### Screen.cutouts (Advanced)

For precise cutout shapes (not just a bounding rect), use `Screen.cutouts`:

```csharp
// WHY: Screen.cutouts returns an array of Rects, one per physical cutout
// (notch, hole-punch camera, etc.). Use this if you need to render
// content around the exact cutout shape rather than the full safe area.
Rect[] cutouts = Screen.cutouts;
foreach (var cutout in cutouts)
{
    Debug.Log($"Cutout at: {cutout}");
    // Position UI elements to avoid this specific region
}
```

---

## Multi-Window Mode

On tablets and foldables, Android can display your game alongside other apps in split-screen or freeform windows.

### Handling Window Resize

```csharp
using UnityEngine;

// WHY: When the player resizes the game window (split-screen, freeform),
// Screen.width/height change. Camera aspect ratios and UI layouts
// must adapt. This is the same flow as fold/unfold handling.
public class MultiWindowHandler : MonoBehaviour
{
    private int _lastWidth;
    private int _lastHeight;

    void Update()
    {
        if (Screen.width != _lastWidth || Screen.height != _lastHeight)
        {
            _lastWidth = Screen.width;
            _lastHeight = Screen.height;
            OnWindowResized(_lastWidth, _lastHeight);
        }
    }

    private void OnWindowResized(int width, int height)
    {
        float aspect = (float)width / height;

        // WHY: Adjust the camera's aspect ratio or field of view
        // so the game world isn't distorted in non-standard ratios.
        Camera.main.aspect = aspect;

        // WHY: For 2D games, adjust the orthographic size
        // to show more content on wider screens instead of stretching.
        if (Camera.main.orthographic)
        {
            // Keep vertical size fixed, expand horizontal
            Camera.main.orthographicSize = 5f; // Your base size
        }

        Debug.Log($"Window resized: {width}x{height} (aspect={aspect:F2})");
    }
}
```

### Pausing in Background

When your game enters split-screen, Android may consider it "not focused" even though it's visible:

```csharp
// WHY: In multi-window mode, OnApplicationFocus(false) fires when the
// player taps the other app. Your game is still VISIBLE but not focused.
// Don't pause gameplay — just reduce frame rate to save battery.

void OnApplicationFocus(bool hasFocus)
{
    if (!hasFocus)
    {
        // WHY: Drop to 30fps when not focused to save battery.
        // The game is still visible in split-screen, so don't freeze.
        Application.targetFrameRate = 30;
    }
    else
    {
        Application.targetFrameRate = 60;
    }
}

// WHY: OnApplicationPause is different — it fires when the game is
// completely hidden (home button, app switch). THAT is when you pause.
void OnApplicationPause(bool isPaused)
{
    if (isPaused)
    {
        // Save state, pause audio, etc.
        Time.timeScale = 0;
    }
    else
    {
        Time.timeScale = 1;
    }
}
```

---

## Adaptive Layout Strategies

### Strategy 1: Breakpoint-Based (Recommended)

Define layout breakpoints based on screen width in dp, similar to responsive web design:

```csharp
// WHY: Breakpoints give you discrete layout modes to design for,
// rather than trying to make everything continuously responsive.
// This is the same pattern web developers use with CSS media queries.

public enum LayoutMode
{
    Compact,   // Phone portrait (< 600dp wide)
    Medium,    // Phone landscape, small tablet, folded foldable (600-839dp)
    Expanded   // Tablet, unfolded foldable, desktop (840dp+)
}

public static LayoutMode GetLayoutMode(int screenWidthDp)
{
    // WHY: These breakpoints match Android's official Material Design
    // window size classes, ensuring your game feels native.
    if (screenWidthDp < 600) return LayoutMode.Compact;
    if (screenWidthDp < 840) return LayoutMode.Medium;
    return LayoutMode.Expanded;
}
```

### Strategy 2: Camera Adaptation

```csharp
// WHY: On wider screens, show more of the game world rather than
// stretching the same view. This prevents gameplay advantages on
// ultra-wide devices while keeping the experience fair.

public class AdaptiveCamera : MonoBehaviour
{
    [SerializeField] private float _baseOrthographicSize = 5f;
    [SerializeField] private float _baseAspect = 9f / 16f; // Portrait phone

    void LateUpdate()
    {
        float currentAspect = (float)Screen.width / Screen.height;

        if (Camera.main.orthographic)
        {
            // WHY: Scale orthographic size so vertical view stays constant.
            // Wider screens see more horizontal content.
            Camera.main.orthographicSize = _baseOrthographicSize;
        }
        else
        {
            // WHY: For perspective cameras, adjust vertical FOV to maintain
            // the same horizontal FOV across different aspect ratios.
            float baseFOV = 60f;
            float hFOV = 2f * Mathf.Atan(Mathf.Tan(baseFOV * 0.5f * Mathf.Deg2Rad)
                * _baseAspect) * Mathf.Rad2Deg;
            Camera.main.fieldOfView = 2f * Mathf.Atan(Mathf.Tan(hFOV * 0.5f * Mathf.Deg2Rad)
                / currentAspect) * Mathf.Rad2Deg;
        }
    }
}
```

---

## Testing Foldable Layouts

### Unity Editor: Device Simulator

Unity's Device Simulator (Window → General → Device Simulator) includes profiles for foldable devices:

1. Switch from **Game** view to **Simulator** view
2. Select a foldable device profile (e.g., Samsung Galaxy Z Fold)
3. Toggle between folded/unfolded states
4. Verify safe area, layout breakpoints, and camera adaptation

### Android Emulator

The Android Emulator supports foldable device profiles:

```bash
# WHY: The Android emulator can simulate fold/unfold at runtime,
# letting you test transitions without physical hardware.

# Create a foldable AVD (Android Virtual Device)
sdkmanager "system-images;android-34;google_apis;x86_64"
avdmanager create avd -n FoldableTest -k "system-images;android-34;google_apis;x86_64" \
  -d "7.6in Foldable"

# Launch the emulator
emulator -avd FoldableTest
```

### Physical Device Checklist

| Test Case | What to Verify |
|-----------|---------------|
| Fold → unfold during gameplay | No crash, UI adapts, gameplay continues |
| Unfold → fold during gameplay | UI compacts, nothing clips off-screen |
| Rotate while unfolded | Safe area and layout update correctly |
| Enter split-screen mode | Game renders in half-screen, UI scales |
| Exit split-screen mode | Game returns to full-screen, UI restores |
| Change system font size | UI text remains readable, no overflow |
| Enable dark mode mid-game | Theme switches (if supported) |

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Game restarts on fold/unfold | `android:resizeableActivity="false"` | Enable Resizable Window in Player Settings |
| UI clips outside safe area | Not using safe area margins | Apply `Screen.safeArea` to root UI panel |
| Black bars on large screens | Fixed resolution or aspect ratio | Use adaptive resolution, avoid hardcoded dimensions |
| `AndroidApplication` not found | Targeting non-Android platform | Wrap in `#if UNITY_ANDROID` preprocessor directive |
| Touch targets too small on tablet | Same pixel sizes as phone | Scale touch targets based on DPI or dp |
| Performance drops on unfold | Rendering at 2× resolution suddenly | Use dynamic resolution scaling to smooth transitions |

---

## Version History

| Version | Change |
|---------|--------|
| Unity 2019+ | `Screen.safeArea` API, `Screen.cutouts` |
| Unity 6.0 | `AndroidApplication.onConfigurationChanged`, `AndroidConfiguration` class |
| Unity 6.1 | Official foldable/large screen support, Device Simulator profiles |
