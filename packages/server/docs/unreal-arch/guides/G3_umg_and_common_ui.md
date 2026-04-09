# G3 — UMG and Common UI in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Gameplay Framework](G1_gameplay_framework.md) · [G2 Enhanced Input](G2_enhanced_input.md) · [Unreal Rules](../unreal-arch-rules.md)

Unreal Motion Graphics (UMG) is UE5's UI framework — a retained-mode widget system for HUDs, menus, and in-world interfaces. **Common UI** is an official plugin that layers multiplatform input routing, activatable widget stacks, and standardized base classes on top of UMG. This guide covers both: core UMG patterns for creating and managing widgets in C++, then Common UI's architecture for shipping UI that works seamlessly across mouse, gamepad, and touch.

---

## Why Two Systems?

UMG handles widget layout, rendering, and basic interaction. It is always available and sufficient for many projects. But UMG alone leaves several hard problems to you:

- **Input mode management** — manually calling `SetInputModeGameOnly`, `SetInputModeUIOnly`, or `SetInputModeGameAndUI` for every widget transition
- **Focus management** — tracking which widget has focus, especially when new panels open/close
- **Gamepad navigation** — making every menu work with both mouse and gamepad requires per-widget focus configuration
- **Platform-specific button prompts** — showing "A" on Xbox, "Cross" on PlayStation, "Enter" on keyboard

Common UI solves all of these with an opinionated architecture. Use plain UMG if you're building a PC-only game with mouse-only UI. Use Common UI if you need gamepad support, console shipping, or complex layered menus.

---

## Part 1: UMG Fundamentals

### Creating Widgets in C++

Widgets are created from Blueprint classes (Widget Blueprints) but managed from C++. The standard pattern: define a `TSubclassOf` property for the Blueprint class, create the widget at runtime, and store a reference.

```cpp
// MyHUD.h
UCLASS()
class MYGAME_API AMyHUD : public AHUD
{
    GENERATED_BODY()

public:
    // WHY TSubclassOf: Designers create the visual layout in a Widget Blueprint.
    // C++ references the Blueprint class, not a specific instance. This decouples
    // visual design from logic — artists edit the Blueprint, programmers edit C++.
    UPROPERTY(EditDefaultsOnly, Category = "UI")
    TSubclassOf<UUserWidget> MainHUDClass;

    UPROPERTY(EditDefaultsOnly, Category = "UI")
    TSubclassOf<UUserWidget> PauseMenuClass;

protected:
    virtual void BeginPlay() override;

private:
    UPROPERTY()
    TObjectPtr<UUserWidget> MainHUDWidget;

    UPROPERTY()
    TObjectPtr<UUserWidget> PauseMenuWidget;
};
```

```cpp
// MyHUD.cpp
void AMyHUD::BeginPlay()
{
    Super::BeginPlay();

    APlayerController* PC = GetOwningPlayerController();

    // WHY check IsLocalController: In multiplayer, each client has its own HUD
    // but the server doesn't need widgets. Creating widgets on a dedicated server
    // wastes memory and can crash (no viewport).
    if (!PC || !PC->IsLocalController()) return;

    if (MainHUDClass)
    {
        // CreateWidget<T> instantiates the widget. The PlayerController is the
        // "owning player" — needed for input routing and viewport targeting.
        MainHUDWidget = CreateWidget<UUserWidget>(PC, MainHUDClass);
        MainHUDWidget->AddToViewport(0);  // ZOrder 0 = bottom layer
    }
}
```

### Widget Binding with `BindWidget`

The `BindWidget` meta tag links C++ properties to widgets placed in the Blueprint editor by **name matching**. This lets you reference specific UI elements (text blocks, progress bars, buttons) from C++ without hard-coded widget lookups.

```cpp
// MyHealthBar.h
UCLASS()
class MYGAME_API UMyHealthBar : public UUserWidget
{
    GENERATED_BODY()

protected:
    // WHY BindWidget: The Widget Blueprint MUST contain a ProgressBar named
    // "HealthBar" or it won't compile. This enforces a contract between the
    // C++ logic and the visual layout, catching missing elements at compile time.
    UPROPERTY(meta = (BindWidget))
    TObjectPtr<UProgressBar> HealthBar;

    // BindWidgetOptional: Won't error if missing, but you must null-check
    UPROPERTY(meta = (BindWidgetOptional))
    TObjectPtr<UTextBlock> HealthText;

    // BindWidgetAnim: Links to a UMG animation by name
    UPROPERTY(meta = (BindWidgetAnim), Transient)
    TObjectPtr<UWidgetAnimation> DamageFlash;

public:
    void SetHealth(float Current, float Max)
    {
        if (HealthBar)
        {
            HealthBar->SetPercent(Current / Max);
        }

        if (HealthText)
        {
            HealthText->SetText(FText::AsNumber(FMath::CeilToInt(Current)));
        }

        // Play the damage flash animation if health decreased
        if (DamageFlash)
        {
            PlayAnimation(DamageFlash);
        }
    }
};
```

### Widget Lifecycle

UMG widgets have a well-defined lifecycle. Understanding it prevents initialization bugs:

```
NativeConstruct()        → Widget fully constructed, all BindWidget refs valid
                            Use for: binding delegates, initial state setup

NativeDestruct()         → Widget about to be destroyed
                            Use for: unbinding delegates, cleanup

NativeTick()             → Called every frame (if ticking is enabled)
                            Use for: animations, interpolation
                            WARNING: Disable tick on widgets that don't need it

AddToViewport() / RemoveFromParent()
                         → Controls visibility and input processing
```

```cpp
void UMyPauseMenu::NativeConstruct()
{
    Super::NativeConstruct();

    // WHY NativeConstruct, not the constructor: BindWidget properties aren't
    // resolved in the constructor. Accessing them there gives null pointers.
    if (ResumeButton)
    {
        ResumeButton->OnClicked.AddDynamic(this, &UMyPauseMenu::OnResumeClicked);
    }
}
```

### Input Modes

When showing interactive UI, you must tell the engine how to route input between the game and the UI system:

```cpp
void AMyPlayerController::ShowPauseMenu()
{
    if (!PauseMenuWidget)
    {
        PauseMenuWidget = CreateWidget<UUserWidget>(this, PauseMenuClass);
    }

    PauseMenuWidget->AddToViewport(100);  // High ZOrder so it renders on top

    // WHY SetInputModeUIOnly: Without this, mouse clicks pass through the menu
    // into the game world. The player might fire their weapon while clicking
    // a "Resume" button.
    FInputModeUIOnly InputMode;
    InputMode.SetWidgetToFocus(PauseMenuWidget->TakeWidget());
    // WHY SetWidgetToFocus: Ensures the menu receives keyboard/gamepad events
    // immediately. Without it, the player must click the menu first.
    SetInputMode(InputMode);
    SetShowMouseCursor(true);

    SetPause(true);
}

void AMyPlayerController::HidePauseMenu()
{
    if (PauseMenuWidget)
    {
        PauseMenuWidget->RemoveFromParent();
    }

    // Restore game input
    SetInputMode(FInputModeGameOnly());
    SetShowMouseCursor(false);
    SetPause(false);
}
```

**Input Mode Options:**

| Mode | Mouse Behavior | Keyboard/Gamepad | Use Case |
|------|---------------|-----------------|----------|
| `FInputModeGameOnly` | Captured (hidden) | Game input | Normal gameplay |
| `FInputModeUIOnly` | Free cursor | UI navigation only | Full-screen menus |
| `FInputModeGameAndUI` | Free cursor | Both game and UI | HUD with clickable elements |

---

## Part 2: Common UI

### Setup

1. **Enable the plugin:** Edit → Plugins → search "Common UI" → enable → restart editor

2. **Set the viewport class** in `DefaultEngine.ini`:

```ini
[/Script/CommonUI.CommonUISettings]
bAutoAddSoftObjectPath=true

[/Script/Engine.Engine]
GameViewportClientClass=/Script/CommonUI.CommonGameViewportClient
```

3. **Create an Input Data asset:** Subclass `UCommonUIInputData` to define universal actions (Confirm, Back/Cancel) and platform-specific controller data:

```cpp
// WHY custom InputData: CommonUI needs to know which actions are "universal"
// (confirm, cancel, navigate) across all platforms. This asset maps those
// universal concepts to your Enhanced Input actions.
UCLASS()
class MYGAME_API UMyCommonInputData : public UCommonUIInputData
{
    GENERATED_BODY()

public:
    virtual FDataTableRowHandle GetDefaultClickAction() const override
    { return DefaultConfirmAction; }

    virtual FDataTableRowHandle GetDefaultBackAction() const override
    { return DefaultCancelAction; }
};
```

4. **Assign in Project Settings:** Project Settings → Game → Common Input Settings → set your Input Data class and platform controller data assets.

### Core Classes

Common UI replaces several UMG base classes with enhanced versions:

| UMG Class | Common UI Replacement | What It Adds |
|-----------|-----------------------|-------------|
| `UUserWidget` | `UCommonActivatableWidget` | Activation lifecycle, automatic input routing |
| `UButton` | `UCommonButtonBase` | Gamepad selection, input action display, style assets |
| `UTextBlock` | `UCommonTextBlock` | Shared text styles, auto-scrolling |
| `UListView` | `UCommonListView` | Focus-aware list navigation |
| — | `UCommonActivatableWidgetStack` | LIFO widget stack with input priority |
| — | `UCommonActivatableWidgetSwitcher` | Tab-like switching with activation |

### Activatable Widgets

The core abstraction in Common UI. An **Activatable Widget** has an explicit activation lifecycle that the system manages:

```cpp
UCLASS()
class MYGAME_API UMyMenuPanel : public UCommonActivatableWidget
{
    GENERATED_BODY()

protected:
    // Called when this widget becomes the active (focused) widget
    // WHY: Set up input bindings, start animations, request focus
    virtual void NativeOnActivated() override
    {
        Super::NativeOnActivated();

        // WHY focus here: When a menu panel activates, it should immediately
        // accept gamepad input. Without setting focus, the player must
        // navigate to it manually.
        if (DefaultFocusWidget)
        {
            DefaultFocusWidget->SetFocus();
        }
    }

    // Called when this widget is deactivated (another widget took priority)
    virtual void NativeOnDeactivated() override
    {
        Super::NativeOnDeactivated();
        // Clean up, stop polling, release resources
    }

    // The widget this panel should focus when activated
    UPROPERTY(meta = (BindWidget))
    TObjectPtr<UCommonButtonBase> DefaultFocusWidget;
};
```

**Activation Settings** (configured per-widget in the Details panel):

| Setting | Options | Effect |
|---------|---------|--------|
| `ActivateOnAdded` | true/false | Auto-activate when pushed to a stack |
| `IsModal` | true/false | Block input to widgets behind this one |
| `InputConfig` | Default/Custom | Override input mode while active |

### Widget Stacks

A `UCommonActivatableWidgetStack` manages a LIFO (last-in-first-out) stack of activatable widgets. The topmost widget receives input; pushing a new widget automatically deactivates the previous one.

```
Widget Stack (LIFO):
┌─────────────────────────────────┐
│  [TOP] Confirm Dialog (modal)   │  ← receives all input
├─────────────────────────────────┤
│  Settings Menu                  │  ← deactivated, paused
├─────────────────────────────────┤
│  Main Menu                      │  ← deactivated, paused
└─────────────────────────────────┘

Pop "Confirm Dialog" → Settings Menu reactivates and regains focus
```

```cpp
// In your root UI layout widget
UPROPERTY(meta = (BindWidget))
TObjectPtr<UCommonActivatableWidgetStack> MenuStack;

// Push a new menu onto the stack
void UMyRootLayout::OpenSettings()
{
    // WHY push to stack instead of AddToViewport: The stack manages activation,
    // deactivation, input routing, and back-button handling automatically.
    // With raw AddToViewport you'd need to manage all of this yourself.
    MenuStack->AddWidget(SettingsMenuClass);
}
```

### Layer System (Lyra Pattern)

Production games organize stacks into **layers** using Gameplay Tags. Each layer represents a priority level:

```
UI.Layer.Game       →  HUD, health bars, minimaps (lowest priority)
UI.Layer.GameMenu   →  Inventory, skill tree (pauses gameplay input)
UI.Layer.Menu       →  Main menu, settings (highest interactive priority)
UI.Layer.Modal      →  Confirmation dialogs, popups (blocks everything below)
```

Higher layers receive input first. When a Modal layer has an active widget, all lower layers are input-blocked.

### Common UI Buttons

`UCommonButtonBase` extends UMG buttons with:

- **Automatic gamepad highlighting** — selected state when navigated to via stick/d-pad
- **Input action display** — a child `UCommonActionWidget` automatically shows the platform-appropriate button icon ("A", "Cross", "Enter")
- **Style assets** — shared `UCommonButtonStyle` assets for consistent look across the game

```cpp
UCLASS()
class MYGAME_API UMyMenuButton : public UCommonButtonBase
{
    GENERATED_BODY()

protected:
    // WHY override NativeOnCurrentTextStyleChanged: CommonButtonBase automatically
    // updates text style based on button state (normal, hovered, pressed, disabled).
    // Override to apply additional custom styling.
    virtual void NativeOnCurrentTextStyleChanged() override
    {
        Super::NativeOnCurrentTextStyleChanged();
        // Additional styling logic
    }

    // BindWidget convention: CommonButtonBase expects a UCommonTextBlock
    // named "ButtonText" and a UCommonActionWidget named "InputActionWidget"
    // for automatic text and input icon updates.
    UPROPERTY(meta = (BindWidget))
    TObjectPtr<UCommonTextBlock> ButtonText;

    UPROPERTY(meta = (BindWidgetOptional))
    TObjectPtr<UCommonActionWidget> InputActionWidget;
};
```

### Tabs and Switchers

Common UI provides tab navigation through a trio of classes:

- **`UCommonTabListWidgetBase`** — the tab bar (a row of buttons)
- **`UCommonActivatableWidgetSwitcher`** — the content area that shows one child at a time
- **`UCommonAnimatedSwitcher`** — like the above but adds transition animations (fade, slide, zoom)

```cpp
// In your tab container widget's NativeConstruct:
void UMyTabContainer::NativeConstruct()
{
    Super::NativeConstruct();

    // WHY SetLinkedSwitcher: This connects tab button presses to content switching.
    // Clicking a tab activates the corresponding content widget and deactivates
    // the previous one. Without linking, tabs do nothing.
    TabList->SetLinkedSwitcher(ContentSwitcher);

    // Register tabs — each tab gets an ID, a button class, and content widget
    TabList->RegisterTab(FName("Settings"), SettingsTabButtonClass, SettingsPanel);
    TabList->RegisterTab(FName("Audio"), AudioTabButtonClass, AudioPanel);
    TabList->RegisterTab(FName("Controls"), ControlsTabButtonClass, ControlsPanel);
}
```

The Activatable Widget Switcher ensures proper activation: the outgoing widget is fully deactivated (and its exit animation completes) before the incoming widget activates.

### Input Routing with CommonUI

Common UI takes over input routing from the engine. Instead of calling `SetInputMode` manually, the **CommonUI Action Router** manages input mode based on which activatable widgets are active:

- When no menu widgets are active → game input mode (gameplay controls work)
- When a menu widget activates → UI input mode (mouse cursor appears, gamepad navigates widgets)
- When a modal widget activates → input is exclusively routed to that widget

This eliminates the error-prone manual `SetInputMode` calls scattered throughout your codebase.

**Back/Cancel handling** is also automatic: pressing Escape/B/Circle deactivates the topmost widget on the stack. Override `GetDesiredInputConfig()` on your activatable widget to customize this behavior:

```cpp
TOptional<FUIInputConfig> UMySettingsMenu::GetDesiredInputConfig() const
{
    // WHY override: By default, CommonUI uses the widget's bIsModal flag.
    // Override to create custom input configurations, like allowing
    // game input while a transparent HUD overlay is active.
    FUIInputConfig Config(ECommonInputMode::Menu, EMouseCaptureMode::NoCapture);
    return Config;
}
```

---

## Debugging UMG and Common UI

### UMG Debugging

- **Widget Reflector:** `Ctrl+Shift+W` in PIE — click any widget to see its hierarchy, class, and layout
- **Debug Drawing:** Enable "Show Widget Reflector Info" in viewport options
- **Console commands:**
  - `Slate.HitTestGridEnabled 1` — visualize hit-test regions
  - `SlateDebugger.Start` — detailed Slate event logging

### Common UI Debugging

- **`CommonUI.DumpActivatableTree`** — prints the current widget stack and activation state to the log. Essential for debugging "why isn't my widget receiving input?"
- **`CommonUI.bDumpInputActionBindings 1`** — logs all active input action bindings

---

## Common Pitfalls

1. **Creating widgets on the server.** Always guard with `IsLocalController()`. Dedicated servers have no viewport — creating widgets crashes or wastes memory.

2. **Forgetting `SetWidgetToFocus`.** Without explicitly setting focus when showing a menu, gamepad navigation doesn't work until the player moves the mouse or presses a directional input. Always focus the first interactive element.

3. **`BindWidget` name mismatch.** The C++ property name must exactly match the widget name in the Blueprint. `HealthBar` in C++ requires a widget named `HealthBar` in the Blueprint — not `Health_Bar` or `healthBar`. The Blueprint won't compile if it mismatches (which is the point — it catches errors early).

4. **Not using `RemoveFromParent` before re-adding.** Calling `AddToViewport()` on an already-visible widget is safe (it's a no-op), but mixing `AddToViewport` and `RemoveFromParent` without null-checking the widget reference leads to crashes.

5. **Mixing Common UI and manual `SetInputMode`.** Once you adopt Common UI, let the Action Router manage input modes. Calling `SetInputMode` directly bypasses Common UI's routing and causes input to get stuck or lost.

6. **Forgetting to set the GameViewportClientClass.** Common UI requires `CommonGameViewportClient`. Without it, the Action Router doesn't initialize and input routing fails silently.

7. **Widget tick performance.** UMG widgets tick by default. For a HUD with 20+ widgets, this adds overhead. Set `bCanEverTick = false` on widgets that only update reactively (via delegates or function calls).

8. **Not enabling Enhanced Input support in Common UI.** In Project Settings → Common Input Settings, ensure `bEnableEnhancedInputSupport` is true. Without it, Common UI falls back to legacy input handling.

---

## Decision Table: When to Use What

| Scenario | Approach |
|----------|----------|
| PC-only, mouse-only HUD | Plain UMG |
| PC-only, simple pause menu | Plain UMG + manual `SetInputMode` |
| Multiplatform (PC + console) | Common UI |
| Complex layered menus (RPG inventory, settings, dialogs) | Common UI with widget stacks |
| Local multiplayer with split-screen UI | Common UI with per-player stacks |
| In-world UI (health bars above enemies) | UMG with `UWidgetComponent` (no Common UI needed) |
