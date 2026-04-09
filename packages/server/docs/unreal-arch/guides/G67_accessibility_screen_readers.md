# G67 — Accessibility and Screen Reader Support in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.0+ · **Related:** [G3 UMG and Common UI](G3_umg_and_common_ui.md) · [G65 UMG Viewmodel MVVM](G65_umg_viewmodel_mvvm.md) · [G19 Localization](G19_localization_text.md) · [Unreal Rules](../unreal-arch-rules.md)

Unreal Engine includes built-in accessibility features that allow games to support **screen readers**, **keyboard/gamepad-only navigation**, **text scaling**, **colorblind modes**, and other accommodations. These features are critical for reaching a wider audience and increasingly required for platform certification (Microsoft's Xbox Accessibility Guidelines, PlayStation's accessibility recommendations). This guide covers the engine's accessibility architecture, how to make UMG widgets accessible, screen reader integration, input accessibility through Common UI, and practical patterns for shipping accessible game UIs.

---

## Why Accessibility Matters for Games

Beyond ethical responsibility, accessibility has practical implications:

- **Platform requirements** — Xbox, PlayStation, and Steam Deck all have accessibility guidelines; some are mandatory for certification
- **Market reach** — approximately 15-20% of the global population has some form of disability; accessible games reach more players
- **Legal compliance** — accessibility regulations (ADA, EAA, EN 301 549) increasingly apply to interactive software including games
- **Design quality** — accessibility improvements (readable fonts, clear contrast, remappable controls) benefit all players, not just those with disabilities

---

## Architecture Overview

Unreal Engine's accessibility system operates at the Slate level (below UMG), which means it works regardless of whether you build UI in pure Slate or UMG:

```
┌─────────────────────────────────────────────────────┐
│  Platform Accessibility API                          │
│  (Windows UI Automation / macOS Accessibility /      │
│   iOS VoiceOver / Android TalkBack)                  │
└──────────────────────┬──────────────────────────────┘
                       ▲
                       │ Bridge
┌──────────────────────┴──────────────────────────────┐
│  FSlateAccessibleMessageHandler                      │
│  (Translates Slate widget tree → platform a11y tree) │
├─────────────────────────────────────────────────────┤
│  FSlateAccessibleWidget (per-widget accessible node) │
│  - AccessibleText (what the screen reader speaks)    │
│  - AccessibleRole (button, text, slider, etc.)       │
│  - AccessibleBehavior (Auto, Summary, Custom)        │
└──────────────────────┬──────────────────────────────┘
                       ▲
                       │ Wraps
┌──────────────────────┴──────────────────────────────┐
│  SWidget / UWidget (your UI widgets)                 │
│  Accessible properties set in C++, Blueprint, or     │
│  the UMG Widget Designer details panel               │
└─────────────────────────────────────────────────────┘
```

---

## Enabling Accessibility

### Project Settings

In **Project Settings → Engine → Accessibility**:

| Setting | Purpose | Recommended |
|---------|---------|-------------|
| **Enable Accessibility** | Master toggle for the accessibility subsystem | ✅ Enabled |
| **Initial Delay** | Seconds before first screen reader announcement on widget focus | 0.5s |
| **Enable Text-to-Speech** | Use platform TTS when no third-party screen reader is detected | ✅ Enabled (for fallback) |

### Platform Notes

| Platform | Screen Reader | Notes |
|----------|---------------|-------|
| Windows | NVDA, JAWS, Narrator | Uses UI Automation API (UIA). Most mature integration. |
| macOS | VoiceOver | Accessibility API bridge built-in since UE 4.26. |
| iOS | VoiceOver | Supported via Slate accessibility on iOS builds. |
| Android | TalkBack | Limited support — verify with target devices. |
| Consoles | Platform-specific | Xbox Narrator supported; PlayStation requires custom TTS integration. |

---

## Making UMG Widgets Accessible

### Per-Widget Settings (Designer)

Select any widget in the UMG Widget Designer and expand the **Accessibility** section in the Details panel:

| Property | Values | When to Use |
|----------|--------|-------------|
| **Accessible Behavior** | `Auto`, `Summary`, `Custom`, `Not Accessible` | How the screen reader determines text for this widget |
| **Accessible Summary Behavior** | `Auto`, `Summary`, `Custom`, `Not Accessible` | How child widgets are aggregated when this widget is treated as a group |
| **Accessible Text** | FText | Custom text spoken by the screen reader (only used when Behavior = Custom) |

**Behavior options:**

- **Auto** — the widget provides its own accessible text (e.g., a Text Block reads its text content, a Button reads its label)
- **Summary** — concatenates the accessible text of all child widgets (useful for containers like a list row that should be read as one phrase)
- **Custom** — you provide explicit text via the `Accessible Text` property (essential for icon-only buttons, decorative images with meaning, or complex composite widgets)
- **Not Accessible** — the widget is invisible to screen readers (use for purely decorative elements)

### Example: Icon-Only Button

An icon-only button has no text for a screen reader to auto-detect:

```
Button (Accessible Behavior: Custom, Accessible Text: "Open Inventory")
└── Image (icon_backpack.png, Accessible Behavior: Not Accessible)
```

### Example: Health Bar

A progress bar doesn't convey meaningful information through Auto behavior:

```
HealthBar (Accessible Behavior: Custom, Accessible Text: "Health: 75%")
```

Update the accessible text dynamically when health changes:

```cpp
void UHealthBarWidget::UpdateAccessibleText(float HealthPercent)
{
    FText NewText = FText::Format(
        LOCTEXT("HealthA11y", "Health: {0} percent"),
        FText::AsNumber(FMath::RoundToInt(HealthPercent * 100)));
    HealthProgressBar->SetAccessibleText(NewText);
}
```

---

## Custom Accessible Widgets (C++)

For Slate widgets that need specialized screen reader behavior, override `CreateAccessibleWidget()`:

```cpp
TSharedRef<FSlateAccessibleWidget> SMyCustomWidget::CreateAccessibleWidget()
{
    // Return a custom accessible widget with specific role and text
    return MakeShared<FSlateAccessibleWidget>(
        SharedThis(this),
        EAccessibleWidgetType::Custom);
}

FText SMyCustomWidget::GetAccessibleText() const
{
    // Dynamic text based on widget state
    return FText::Format(
        LOCTEXT("SlotA11y", "Inventory slot {0}: {1}"),
        FText::AsNumber(SlotIndex),
        ItemName.IsEmpty()
            ? LOCTEXT("EmptySlot", "Empty")
            : ItemName);
}
```

---

## Keyboard and Gamepad Navigation

### Focus Navigation

Accessible UIs must be fully navigable without a mouse. Common UI (see [G3](G3_umg_and_common_ui.md)) provides the foundation:

- **Activatable Widgets** (`UCommonActivatableWidget`) support focus-based navigation out of the box
- **Input routing** ensures only the topmost activatable widget receives input
- **Action bars** display context-sensitive button prompts that update for the current input device

### Tab Order and Focus Groups

```cpp
// In your widget, set explicit navigation rules
MyButton->SetNavigationRuleExplicit(
    EUINavigation::Down, AnotherButton);
MyButton->SetNavigationRuleExplicit(
    EUINavigation::Right, SidePanel);
```

For grids and lists, use `UCommonListView` which handles row/column navigation automatically.

### Skip Navigation for Decorative Elements

Widgets that are purely visual should not receive focus:

```cpp
DecorativeBorder->SetIsEnabled(false);  // Removes from tab order
// OR
DecorativeBorder->SetVisibility(ESlateVisibility::HitTestInvisible);
```

---

## Text and Visual Accessibility

### Font Scaling

Support user-configurable text scaling:

```cpp
// Read from game settings
float UserScale = GetGameUserSettings()->GetTextScaleMultiplier();

// Apply to widget
MyTextBlock->SetRenderTransformPivot(FVector2D(0, 0));
MyTextBlock->SetRenderTransform(
    FSlateRenderTransform(FScale2D(UserScale)));
```

Better approach — use **font size settings** in your Common UI Style Asset:

```cpp
// In your UI settings subsystem
void UUISettingsSubsystem::ApplyTextScale(float Scale)
{
    // Scale all font sizes through a global multiplier
    // Common UI styles reference this multiplier
    TextScaleMultiplier = FMath::Clamp(Scale, 0.75f, 2.0f);
    OnTextScaleChanged.Broadcast(TextScaleMultiplier);
}
```

### Colorblind Modes

UE5 includes built-in colorblind simulation and correction:

```cpp
// Project Settings → Engine → Rendering → Accessibility
// Or at runtime:
UGameUserSettings* Settings = GEngine->GetGameUserSettings();
Settings->SetColorVisionDeficiencyType(
    EColorVisionDeficiency::Deuteranope);  // Green-blind
Settings->SetColorVisionDeficiencySeverity(1.0f);  // Full correction
Settings->ApplySettings(false);
```

Available types: `NormalVision`, `Deuteranope` (green), `Protanope` (red), `Tritanope` (blue).

### High Contrast and Icon Accessibility

- Use **icon + color** combinations (never color alone) to convey information
- Provide a high-contrast mode that increases border thickness and adjusts background opacity
- Minimum touch/click target size: **44×44 logical pixels** (WCAG 2.1 AA recommendation)

---

## Audio and Haptic Accessibility

### Subtitle System

```cpp
// UE5's built-in subtitle manager
FSubtitleManager::GetSubtitleManager()->SetSubtitleDisplayDelegate(
    FOnSubtitleDisplay::CreateLambda(
        [](const TArray<FSubtitleCue>& Cues, float CueDuration)
        {
            // Display subtitles in your custom widget
            // Include speaker name and directional indicators
        }));
```

Best practices for subtitles:
- Include **speaker identification** (character name or description)
- Support **subtitle sizing** (small, medium, large, extra large)
- Add **background opacity control** for readability
- Include **sound descriptions** in brackets for non-speech audio (e.g., "[explosion in the distance]")

### Haptic Feedback as Audio Alternative

For deaf or hard-of-hearing players, important audio cues should have haptic equivalents:

```cpp
// When an important sound plays, also trigger haptics
void AMyPlayerController::OnDangerSoundPlayed(
    const FVector& SoundLocation)
{
    // Vibrate controller with intensity based on proximity
    float Distance = FVector::Distance(
        GetPawn()->GetActorLocation(), SoundLocation);
    float Intensity = FMath::GetMappedRangeValueClamped(
        FVector2D(0, 2000), FVector2D(1.0, 0.1), Distance);

    PlayDynamicForceFeedback(
        Intensity, 0.3f, true, true, true, true);
}
```

---

## Testing Accessibility

### Screen Reader Testing Checklist

1. **Enable Narrator** (Windows) or **VoiceOver** (macOS) and navigate your UI with keyboard only
2. **Every interactive element** should announce its purpose and state
3. **Focus order** should follow a logical reading order (left-to-right, top-to-bottom for LTR languages)
4. **State changes** should be announced (e.g., "checkbox checked", "tab 2 of 4 selected")
5. **Error messages** should be announced when they appear
6. **No focus traps** — the user can always navigate away from any widget

### Automated Testing

```cpp
// In your automated tests, verify accessible text is set
UTEST_TRUE("Health bar has accessible text",
    !HealthBar->GetAccessibleText().IsEmpty());

UTEST_TRUE("Button has accessible behavior",
    MyButton->GetAccessibleBehavior() != ESlateAccessibleBehavior::NotAccessible);
```

### UE5 Widget Reflector

Use **Window → Developer Tools → Widget Reflector** to inspect the accessibility properties of any on-screen widget. The reflector shows the accessible text, role, and behavior for each widget in the hierarchy.

---

## Shipping Accessibility Settings

Provide an in-game accessibility settings menu with these categories:

| Category | Settings |
|----------|----------|
| **Visual** | Text size, colorblind mode, high contrast, screen shake reduction, subtitle options |
| **Audio** | Separate volume sliders, mono audio option, visual sound indicators |
| **Controls** | Remappable inputs, toggle vs. hold options, auto-aim strength, input sensitivity |
| **Gameplay** | Difficulty options, QTE alternatives, skip puzzle option, navigation assists |
| **Screen Reader** | Enable/disable, speech rate, verbosity level |

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Screen reader announces "button" with no context | Set Custom accessible text on icon-only buttons |
| Focus gets stuck in a widget | Ensure all widgets have explicit navigation rules or are part of a Common UI activation stack |
| Colorblind mode doesn't affect gameplay elements | Apply color correction to materials and particle systems, not just post-process |
| Subtitle text too small on console | Default to larger subtitle sizes on TV-distance platforms; let players increase further |
| Settings menu itself isn't accessible | Ensure the accessibility settings menu is navigable before any settings are applied — use sensible defaults |

---

## Further Reading

- [Supporting Screen Readers — Epic Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/supporting-screen-readers-in-unreal-engine)
- [Xbox Accessibility Guidelines (XAGs)](https://learn.microsoft.com/en-us/gaming/accessibility/guidelines)
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [G3 UMG and Common UI](G3_umg_and_common_ui.md) — focus navigation and input routing
- [G19 Localization and Text](G19_localization_text.md) — text handling for accessible content
