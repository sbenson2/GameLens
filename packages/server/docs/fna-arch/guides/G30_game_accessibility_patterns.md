# G30 — Game Accessibility Patterns

> **Category:** guide · **Engine:** FNA · **Related:** [G05 Input Handling](./G05_input_handling.md) · [G04 Audio System](./G04_audio_system.md) · [G29 Localization Internationalization](./G29_localization_internationalization.md) · [FNA Architecture Rules](../fna-arch-rules.md)

Implementing accessibility features in FNA games. Covers input remapping, colorblind modes, scalable UI, subtitle systems, reduced-motion options, and screen reader integration. Based on Microsoft's Xbox Accessibility Guidelines (XAG) and the IGDA Game Accessibility SIG top ten.

---

## Table of Contents

1. [Why Accessibility Matters for Indie Games](#1--why-accessibility-matters-for-indie-games)
2. [Input Remapping](#2--input-remapping)
3. [Colorblind Modes](#3--colorblind-modes)
4. [Scalable Text and UI](#4--scalable-text-and-ui)
5. [Subtitle and Caption System](#5--subtitle-and-caption-system)
6. [Reduced Motion and Photosensitivity](#6--reduced-motion-and-photosensitivity)
7. [Difficulty and Assist Modes](#7--difficulty-and-assist-modes)
8. [Audio Accessibility](#8--audio-accessibility)
9. [One-Handed and Switch Controls](#9--one-handed-and-switch-controls)
10. [Steam Accessibility Tags](#10--steam-accessibility-tags)
11. [Common Pitfalls](#11--common-pitfalls)

---

## 1 — Why Accessibility Matters for Indie Games

Accessibility is not charity — it expands your audience. Roughly 1 in 4 adults has a disability. Colorblindness alone affects ~8% of men. Celeste (built with FNA/XNA) demonstrated that robust assist modes increase both the audience size and critical reception.

The key principle: **accessibility features are options, not mandates.** They sit in a settings menu and default to off (or to a sensible default). The player opts in.

FNA has no built-in accessibility framework, but its architecture — direct SDL3 access, full control over rendering and input — makes it straightforward to implement these features yourself.

---

## 2 — Input Remapping

Input remapping is the single highest-impact accessibility feature. It helps players with motor disabilities, non-standard controllers, and personal preference.

### Architecture: Action Map Pattern

Decouple game actions from physical inputs. Never check `Keys.Space` directly — check `InputAction.Jump`.

```csharp
namespace MyGame.Input;

/// <summary>
/// Maps abstract game actions to physical inputs.
/// Supports keyboard and gamepad, with per-player bindings.
/// </summary>
public class ActionMap
{
    private Dictionary<string, List<InputBinding>> _bindings = new();

    public void Bind(string action, InputBinding binding)
    {
        if (!_bindings.ContainsKey(action))
            _bindings[action] = new List<InputBinding>();
        _bindings[action].Add(binding);
    }

    public void Unbind(string action, InputBinding binding)
    {
        if (_bindings.TryGetValue(action, out var list))
            list.Remove(binding);
    }

    /// <summary>
    /// Replace all bindings for an action (used by the remap UI).
    /// </summary>
    public void Rebind(string action, InputBinding newBinding)
    {
        _bindings[action] = new List<InputBinding> { newBinding };
    }

    public bool IsPressed(string action, KeyboardState kb, GamePadState gp)
    {
        if (!_bindings.TryGetValue(action, out var list))
            return false;

        foreach (var binding in list)
        {
            if (binding.Type == BindingType.Key && kb.IsKeyDown(binding.Key))
                return true;
            if (binding.Type == BindingType.Button && gp.IsButtonDown(binding.Button))
                return true;
        }
        return false;
    }

    /// <summary>
    /// Serialize bindings to a dictionary for saving to a JSON config file.
    /// </summary>
    public Dictionary<string, List<InputBinding>> GetAllBindings() => _bindings;

    /// <summary>
    /// Load bindings from a saved config.
    /// </summary>
    public void LoadBindings(Dictionary<string, List<InputBinding>> saved)
    {
        _bindings = saved;
    }
}

public enum BindingType { Key, Button, Axis }

public struct InputBinding
{
    public BindingType Type;
    public Keys Key;           // For keyboard
    public Buttons Button;     // For gamepad
    public string AxisName;    // For analog (e.g., "LeftStickX")
    public float AxisThreshold;
}
```

### Remap UI Flow

```csharp
/// <summary>
/// Listens for the next input and returns it as a binding.
/// Call this in a "Press the key you want to use..." prompt.
/// </summary>
public InputBinding? ListenForInput(KeyboardState kb, KeyboardState prevKb,
    GamePadState gp, GamePadState prevGp)
{
    // Check for any newly pressed key
    foreach (Keys key in Enum.GetValues<Keys>())
    {
        if (kb.IsKeyDown(key) && prevKb.IsKeyUp(key))
            return new InputBinding { Type = BindingType.Key, Key = key };
    }

    // Check for any newly pressed gamepad button
    foreach (Buttons btn in Enum.GetValues<Buttons>())
    {
        if (gp.IsButtonDown(btn) && prevGp.IsButtonUp(btn))
            return new InputBinding { Type = BindingType.Button, Button = btn };
    }

    return null; // Nothing pressed yet
}
```

### Save and Load Bindings

Persist input bindings to a JSON file alongside other settings. Load them on game start so the player's remapping survives between sessions. See G17 for save system patterns.

---

## 3 — Colorblind Modes

Approximately 8% of males and 0.5% of females have some form of color vision deficiency. The three main types:

| Type | Affects | Frequency |
|------|---------|-----------|
| Protanopia | Red perception | ~1% of males |
| Deuteranopia | Green perception | ~5% of males |
| Tritanopia | Blue perception | ~0.01% |

### Approach 1: Palette Swap (Recommended for Pixel Art)

Define multiple color palettes and swap at draw time:

```csharp
namespace MyGame.Accessibility;

/// <summary>
/// Provides alternative color palettes for colorblind players.
/// Games should use semantic color names (Danger, Safe, Neutral)
/// rather than literal colors (Red, Green, Blue).
/// </summary>
public static class ColorPalettes
{
    public enum Mode { Default, Protanopia, Deuteranopia, Tritanopia }

    // Semantic colors — what the color MEANS, not what it looks like
    public static Color GetDanger(Mode mode) => mode switch
    {
        Mode.Default => new Color(220, 50, 50),       // Red
        Mode.Protanopia => new Color(230, 159, 0),     // Orange (visible)
        Mode.Deuteranopia => new Color(230, 159, 0),   // Orange
        Mode.Tritanopia => new Color(220, 50, 50),     // Red (still visible)
        _ => Color.Red
    };

    public static Color GetSafe(Mode mode) => mode switch
    {
        Mode.Default => new Color(50, 180, 50),        // Green
        Mode.Protanopia => new Color(0, 114, 178),     // Blue
        Mode.Deuteranopia => new Color(0, 114, 178),   // Blue
        Mode.Tritanopia => new Color(50, 180, 50),     // Green (still visible)
        _ => Color.Green
    };

    public static Color GetHighlight(Mode mode) => mode switch
    {
        Mode.Default => new Color(255, 220, 0),        // Yellow
        Mode.Protanopia => new Color(86, 180, 233),    // Sky blue
        Mode.Deuteranopia => new Color(86, 180, 233),  // Sky blue
        Mode.Tritanopia => new Color(255, 220, 0),     // Yellow (still visible)
        _ => Color.Yellow
    };
}
```

### Approach 2: Post-Processing Shader

Apply a full-screen color matrix shader that simulates or corrects for colorblindness. This works for any art style but requires an Effect:

```hlsl
// colorblind_correction.fx
// Daltonization shader — shifts problem colors into visible range

float4x4 CorrectionMatrix;
texture ScreenTexture;
sampler ScreenSampler = sampler_state { Texture = <ScreenTexture>; };

float4 PixelShaderFunction(float2 texCoord : TEXCOORD0) : COLOR0
{
    float4 color = tex2D(ScreenSampler, texCoord);
    float3 corrected = mul(float3(color.rgb), (float3x3)CorrectionMatrix);
    return float4(corrected, color.a);
}
```

**Important:** Compile this shader with FXC to DXBC format, not MGFX. FNA uses standard DXBC shaders (see G07 for shader compilation).

### Principle: Don't Rely on Color Alone

The best accessibility practice is to never convey information through color alone. Supplement color with shape, pattern, icon, or text:

- Health bar: color + numeric value
- Enemy types: color + silhouette shape
- Interactive objects: color + icon + sparkle animation

---

## 4 — Scalable Text and UI

Players with low vision need larger text. Steam recommends a minimum body text size of 24px at 1080p, with options to scale up to 200%.

```csharp
namespace MyGame.Accessibility;

/// <summary>
/// UI scaling settings. Applied to all text rendering and UI layout.
/// Stored in the player's settings file.
/// </summary>
public class UIScaleSettings
{
    /// <summary>
    /// Text scale multiplier. 1.0 = default, 1.5 = 150%, 2.0 = 200%.
    /// Offer at least 3 steps: 1.0, 1.5, 2.0.
    /// </summary>
    public float TextScale { get; set; } = 1.0f;

    /// <summary>
    /// UI element scale (buttons, menus, HUD).
    /// Can be independent of text scale.
    /// </summary>
    public float UIScale { get; set; } = 1.0f;

    /// <summary>
    /// High contrast mode — increases contrast between
    /// UI elements and backgrounds.
    /// </summary>
    public bool HighContrast { get; set; } = false;
}
```

### Applying Scale to Drawing

```csharp
// When drawing text, multiply the position and font size by the scale
float scale = settings.TextScale;
Vector2 position = basePosition * scale;

// If using DynamicFont from G29, load different point sizes per scale level
// rather than using SpriteBatch scaling (which blurs pixel fonts)
int fontSize = (int)(baseFontSize * settings.TextScale);
```

---

## 5 — Subtitle and Caption System

Subtitles and closed captions serve deaf and hard-of-hearing players, players in noisy environments, and players whose language skills benefit from reading along.

```csharp
namespace MyGame.UI;

/// <summary>
/// Subtitle display with configurable size, background, and speaker labels.
/// Follows game accessibility best practices:
/// - Max 38 characters per line
/// - Contrasting background
/// - Speaker identification by name and color
/// </summary>
public class SubtitleRenderer
{
    public float TextScale { get; set; } = 1.0f;
    public float BackgroundOpacity { get; set; } = 0.7f;
    public bool ShowSpeakerName { get; set; } = true;
    public bool ShowSoundEffects { get; set; } = false; // [EXPLOSION]

    private readonly Queue<SubtitleEntry> _queue = new();
    private SubtitleEntry? _current;
    private float _timer;

    public void Show(string speaker, string text, float duration,
        Color speakerColor)
    {
        _queue.Enqueue(new SubtitleEntry
        {
            Speaker = speaker,
            Text = WrapText(text, 38),
            Duration = duration,
            SpeakerColor = speakerColor
        });
    }

    public void ShowSoundEffect(string description, float duration)
    {
        if (ShowSoundEffects)
        {
            _queue.Enqueue(new SubtitleEntry
            {
                Speaker = "",
                Text = $"[{description.ToUpper()}]",
                Duration = duration,
                SpeakerColor = Color.Gray
            });
        }
    }

    public void Update(float deltaTime)
    {
        if (_current == null && _queue.Count > 0)
            _current = _queue.Dequeue();

        if (_current != null)
        {
            _timer += deltaTime;
            if (_timer >= _current.Value.Duration)
            {
                _current = null;
                _timer = 0;
            }
        }
    }

    public void Draw(SpriteBatch batch, DynamicFont font,
        int screenWidth, int screenHeight)
    {
        if (_current == null) return;

        var entry = _current.Value;
        string displayText = ShowSpeakerName && !string.IsNullOrEmpty(entry.Speaker)
            ? $"{entry.Speaker}: {entry.Text}"
            : entry.Text;

        float textWidth = MeasureStringWidth(font, displayText) * TextScale;
        float x = (screenWidth - textWidth) / 2f;
        float y = screenHeight - 80 * TextScale;

        // Draw background box for readability
        var bgRect = new Rectangle(
            (int)(x - 10), (int)(y - 5),
            (int)(textWidth + 20), (int)(font.LineHeight * TextScale + 10));
        batch.Draw(pixelTexture, bgRect,
            Color.Black * BackgroundOpacity);

        // Draw text
        DrawString(batch, font, displayText,
            new Vector2(x, y), Color.White);
    }

    private static string WrapText(string text, int maxCharsPerLine)
    {
        if (text.Length <= maxCharsPerLine) return text;

        var lines = new List<string>();
        var words = text.Split(' ');
        string current = "";

        foreach (var word in words)
        {
            if ((current + " " + word).Trim().Length > maxCharsPerLine)
            {
                lines.Add(current.Trim());
                current = word;
            }
            else
            {
                current += " " + word;
            }
        }
        if (current.Trim().Length > 0)
            lines.Add(current.Trim());

        return string.Join("\n", lines);
    }
}

public struct SubtitleEntry
{
    public string Speaker;
    public string Text;
    public float Duration;
    public Color SpeakerColor;
}
```

---

## 6 — Reduced Motion and Photosensitivity

Screen shake, rapid flashing, and particle effects can cause discomfort, motion sickness, or seizures (photosensitive epilepsy affects ~1 in 4,000 people).

```csharp
namespace MyGame.Accessibility;

public class MotionSettings
{
    /// <summary>
    /// Screen shake intensity multiplier. 0 = disabled, 1 = full.
    /// </summary>
    public float ScreenShakeIntensity { get; set; } = 1.0f;

    /// <summary>
    /// When true, suppress rapid color changes and flashing effects.
    /// </summary>
    public bool ReduceFlashing { get; set; } = false;

    /// <summary>
    /// Particle count multiplier. 0.0 = no particles, 1.0 = full.
    /// Some players find dense particles distracting or nauseating.
    /// </summary>
    public float ParticleDensity { get; set; } = 1.0f;
}
```

### Applying Motion Settings

```csharp
// In your camera/screen shake system
public void ApplyScreenShake(float intensity, float duration,
    MotionSettings settings)
{
    float adjustedIntensity = intensity * settings.ScreenShakeIntensity;
    if (adjustedIntensity < 0.01f) return; // Effectively disabled
    StartShake(adjustedIntensity, duration);
}

// In your particle emitter
public void Emit(int count, MotionSettings settings)
{
    int adjustedCount = (int)(count * settings.ParticleDensity);
    for (int i = 0; i < adjustedCount; i++)
        SpawnParticle();
}
```

### Flashing Check

The W3C WCAG standard limits flashes to 3 per second. If your game has rapid flashing effects, gate them behind the `ReduceFlashing` setting:

```csharp
if (!motionSettings.ReduceFlashing)
{
    // Play flash effect
    StartFlash(Color.White, duration: 0.05f);
}
else
{
    // Gentler alternative: brief brightness increase
    StartFade(Color.White * 0.3f, duration: 0.2f);
}
```

---

## 7 — Difficulty and Assist Modes

Celeste (an FNA game) set the industry standard for assist modes. The principle: let players tune individual difficulty knobs rather than offering a single easy/medium/hard toggle.

```csharp
namespace MyGame.Accessibility;

/// <summary>
/// Per-feature assist settings. Each can be adjusted independently.
/// This approach (inspired by Celeste) lets players customize
/// exactly the help they need.
/// </summary>
public class AssistSettings
{
    public float GameSpeed { get; set; } = 1.0f;     // 0.5 to 1.0
    public bool Invincible { get; set; } = false;
    public int ExtraDashes { get; set; } = 0;         // 0 to 2
    public bool InfiniteStamina { get; set; } = false;
    public bool SkipableDialogue { get; set; } = true;
    public bool AutoAim { get; set; } = false;
    public float AimAssistStrength { get; set; } = 0f; // 0 to 1
}
```

**Do not lock achievements or content behind difficulty.** Players using assist features should still be able to complete the game and earn achievements. Celeste proved this doesn't diminish the experience for other players.

---

## 8 — Audio Accessibility

- **Separate volume sliders** for music, sound effects, voice, and UI sounds. Never a single master-only slider.
- **Visual audio cues** for important game sounds (an indicator showing the direction of an off-screen enemy sound).
- **Mono audio option** for players deaf in one ear — mix stereo down to mono.

```csharp
// FAudio (FNA's audio library) supports stereo-to-mono mixing
// through the audio engine's channel configuration.
// Set this in your audio initialization:

public void SetMonoAudio(bool enabled)
{
    if (enabled)
    {
        // Mix all audio to center channel
        SoundEffect.MasterVolume = 1.0f;
        // Configure FAudio to output mono
        // (Implementation depends on your audio manager)
    }
}
```

---

## 9 — One-Handed and Switch Controls

Some players use only one hand or use switch/adaptive controllers. Support this with:

- **All actions reachable with one hand on keyboard** (left side: WASD + nearby keys)
- **All actions reachable with one gamepad stick + bumpers**
- **Toggle mode for hold-to-run/hold-to-aim** — turns a hold action into a press-to-toggle

```csharp
/// <summary>
/// Wraps a held action as a toggle.
/// Press once to start, press again to stop.
/// </summary>
public class ToggleAction
{
    private bool _active;
    private bool _wasPressed;

    public bool IsActive(bool currentlyPressed, bool useToggle)
    {
        if (!useToggle)
            return currentlyPressed; // Normal hold behavior

        // Toggle mode: press to activate, press again to deactivate
        if (currentlyPressed && !_wasPressed)
            _active = !_active;

        _wasPressed = currentlyPressed;
        return _active;
    }
}
```

---

## 10 — Steam Accessibility Tags

Steam's Accessibility Feature Tags help players find games that meet their needs. After implementing accessibility features, tag your game appropriately on the Steamworks dashboard:

| Tag | Meaning |
|-----|---------|
| Full Controller Support | All gameplay works with a controller |
| Full Input Remapping | All controls can be rebound |
| Adjustable Difficulty | Difficulty settings or assist modes |
| Colorblind Mode | Color alternatives or corrections |
| Subtitle Options | Configurable subtitles |
| Text Scaling | Resizable text |

See G26 for full Steam storefront integration.

---

## 11 — Common Pitfalls

**Adding accessibility at the end** — Retrofit is harder than building it in. Start with action maps and scalable text from day one.

**Treating accessibility as a toggle** — "Accessibility mode on/off" is too blunt. Different players need different features. Offer granular settings.

**Forgetting to save accessibility settings** — These settings should persist across sessions, load before the title screen, and ideally carry across save files (they're player preferences, not game state).

**Colorblind mode that just shifts hues** — Shifting all colors doesn't help if the problem is two specific colors being indistinguishable. Use semantic colors with tested alternative palettes.

**Not testing with real users** — Automated checks catch some issues, but nothing replaces testing with players who have disabilities. Organizations like AbleGamers and SpecialEffect can connect you with testers.
