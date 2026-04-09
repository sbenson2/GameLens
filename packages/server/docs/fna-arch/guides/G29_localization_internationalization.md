# G29 — Localization & Internationalization

> **Category:** guide · **Engine:** FNA · **Related:** [G06 Content Loading Without Pipeline](./G06_content_loading_without_pipeline.md) · [G17 Save System Patterns](./G17_save_system_patterns.md) · [FNA Architecture Rules](../fna-arch-rules.md)

Patterns for building localization (l10n) and internationalization (i18n) systems in FNA games. Covers text management, font rendering for non-Latin scripts, right-to-left layout, asset localization, and shipping a multi-language game.

---

## Table of Contents

1. [Architecture Overview](#1--architecture-overview)
2. [String Table System](#2--string-table-system)
3. [Font Rendering for International Text](#3--font-rendering-for-international-text)
4. [Runtime Language Switching](#4--runtime-language-switching)
5. [Localizing Non-Text Assets](#5--localizing-non-text-assets)
6. [Right-to-Left and CJK Layout](#6--right-to-left-and-cjk-layout)
7. [Pluralization and Variables](#7--pluralization-and-variables)
8. [Integration with SpriteBatch](#8--integration-with-spritebatch)
9. [Common Pitfalls](#9--common-pitfalls)
10. [FNA vs MonoGame: Localization Differences](#10--fna-vs-monogame-localization-differences)

---

## 1 — Architecture Overview

FNA (and XNA before it) has no built-in localization framework. This is actually an advantage — you build exactly what your game needs without fighting a framework opinion. The standard approach:

| Layer | Responsibility | Implementation |
|-------|---------------|----------------|
| **String storage** | Hold translated text per locale | JSON/CSV files or embedded resources |
| **Lookup** | Resolve a key to the current locale's string | Dictionary-based string table |
| **Font rendering** | Draw international glyphs correctly | SharpFont (FreeType wrapper) or pre-baked SpriteFont |
| **Asset routing** | Swap textures/audio per locale | Folder-per-locale content structure |
| **UI layout** | Handle variable text length and direction | Measure-then-place pattern |

Keep locale data **outside** compiled content. JSON or CSV files can be edited by translators without rebuilding the game.

---

## 2 — String Table System

A string table maps keys to localized values. Keep it simple — a nested dictionary keyed by locale code, then by string key.

### String Table File Format

```json
// Content/Localization/en.json
{
  "menu.play": "Play",
  "menu.options": "Options",
  "menu.quit": "Quit",
  "dialog.greeting": "Welcome, {player_name}!",
  "item.potion.name": "Health Potion",
  "item.potion.desc": "Restores {amount} HP."
}
```

```json
// Content/Localization/ja.json
{
  "menu.play": "プレイ",
  "menu.options": "オプション",
  "menu.quit": "終了",
  "dialog.greeting": "ようこそ、{player_name}さん！",
  "item.potion.name": "回復ポーション",
  "item.potion.desc": "{amount}HP回復する。"
}
```

### String Table Loader

```csharp
using System.Text.Json;

namespace MyGame.Localization;

/// <summary>
/// Loads and serves localized strings from JSON files.
/// String files live in Content/Localization/{locale}.json.
/// </summary>
public class StringTable
{
    private Dictionary<string, string> _strings = new();
    private string _currentLocale = "en";
    private readonly string _basePath;

    public string CurrentLocale => _currentLocale;

    public StringTable(string contentBasePath)
    {
        // contentBasePath is the absolute path to the Content directory
        _basePath = Path.Combine(contentBasePath, "Localization");
    }

    /// <summary>
    /// Load all strings for the given locale.
    /// Falls back to English if the locale file is missing.
    /// </summary>
    public void LoadLocale(string locale)
    {
        string path = Path.Combine(_basePath, $"{locale}.json");

        if (!File.Exists(path))
        {
            // Fall back to English rather than crashing
            path = Path.Combine(_basePath, "en.json");
            locale = "en";
        }

        string json = File.ReadAllText(path);
        _strings = JsonSerializer.Deserialize<Dictionary<string, string>>(json)
            ?? new Dictionary<string, string>();
        _currentLocale = locale;
    }

    /// <summary>
    /// Get a localized string by key. Returns the key itself if missing
    /// (makes untranslated strings obvious during development).
    /// </summary>
    public string Get(string key)
    {
        return _strings.TryGetValue(key, out var value) ? value : $"[{key}]";
    }

    /// <summary>
    /// Get a localized string with variable substitution.
    /// Variables use {name} syntax in the string file.
    /// </summary>
    public string Get(string key, params (string name, string value)[] vars)
    {
        string text = Get(key);
        foreach (var (name, value) in vars)
        {
            text = text.Replace($"{{{name}}}", value);
        }
        return text;
    }
}
```

### Usage

```csharp
// In Game1.Initialize() or a service locator
var strings = new StringTable(Content.RootDirectory);
strings.LoadLocale("ja");

// In your menu code
string playText = strings.Get("menu.play"); // "プレイ"
string greeting = strings.Get("dialog.greeting",
    ("player_name", playerName)); // "ようこそ、Aliceさん！"
```

---

## 3 — Font Rendering for International Text

### The Problem with SpriteFont

XNA's `SpriteFont` (and FNA's identical implementation) pre-rasterizes a fixed set of characters into a texture atlas at build time. This works for Latin scripts but fails for CJK (Chinese, Japanese, Korean) because:

- CJK has thousands of commonly used characters
- Pre-rasterizing them all creates enormous texture atlases (tens of MB)
- You may not know which characters your translators will use

### Solution: Runtime Font Rendering with SharpFont

SharpFont is a managed wrapper around FreeType that renders TrueType/OpenType glyphs on demand. Several shipped FNA games use this approach (Reus, SpeedRunners, Owlboy).

```csharp
using SharpFont;
using Microsoft.Xna.Framework.Graphics;

namespace MyGame.Rendering;

/// <summary>
/// Renders TrueType font glyphs on demand, caching them into a texture atlas.
/// Supports any Unicode script the .ttf file contains.
/// </summary>
public class DynamicFont : IDisposable
{
    private readonly Face _face;
    private readonly Library _ftLib;
    private readonly Dictionary<char, GlyphInfo> _glyphCache = new();
    private readonly GraphicsDevice _device;
    private Texture2D _atlas;
    private int _atlasX, _atlasY, _rowHeight;
    private readonly int _atlasSize;
    private Color[] _atlasPixels;

    public int LineHeight { get; }

    public DynamicFont(GraphicsDevice device, string fontPath, int pointSize,
        int atlasSize = 1024)
    {
        _device = device;
        _atlasSize = atlasSize;

        // FreeType library and font face initialization
        _ftLib = new Library();
        _face = new Face(_ftLib, fontPath);
        _face.SetPixelSizes(0, (uint)pointSize);

        LineHeight = (int)(_face.Size.Metrics.Height >> 6);

        // Create initial atlas texture
        _atlas = new Texture2D(device, atlasSize, atlasSize);
        _atlasPixels = new Color[atlasSize * atlasSize];
    }

    /// <summary>
    /// Get glyph info for a character, rasterizing it on first use.
    /// </summary>
    public GlyphInfo GetGlyph(char c)
    {
        if (_glyphCache.TryGetValue(c, out var cached))
            return cached;

        // Load and render the glyph with FreeType
        _face.LoadChar(c, LoadFlags.Render, LoadTarget.Normal);
        var bitmap = _face.Glyph.Bitmap;
        var metrics = _face.Glyph.Metrics;

        int w = bitmap.Width;
        int h = bitmap.Rows;

        // Advance to next row if this glyph doesn't fit
        if (_atlasX + w >= _atlasSize)
        {
            _atlasX = 0;
            _atlasY += _rowHeight + 1;
            _rowHeight = 0;
        }

        // Copy glyph bitmap into atlas pixel array
        if (w > 0 && h > 0)
        {
            byte[] bitmapData = bitmap.BufferData;
            for (int row = 0; row < h; row++)
            {
                for (int col = 0; col < w; col++)
                {
                    byte alpha = bitmapData[row * bitmap.Pitch + col];
                    int px = (_atlasY + row) * _atlasSize + (_atlasX + col);
                    _atlasPixels[px] = new Color(255, 255, 255, alpha);
                }
            }
            _atlas.SetData(_atlasPixels);
        }

        var info = new GlyphInfo
        {
            Source = new Rectangle(_atlasX, _atlasY, w, h),
            Offset = new Vector2(
                _face.Glyph.BitmapLeft,
                LineHeight - _face.Glyph.BitmapTop - (LineHeight / 4)),
            Advance = (int)(metrics.HorizontalAdvance >> 6)
        };

        _atlasX += w + 1;
        _rowHeight = Math.Max(_rowHeight, h);

        _glyphCache[c] = info;
        return info;
    }

    public Texture2D Atlas => _atlas;

    public void Dispose()
    {
        _atlas?.Dispose();
        _face?.Dispose();
        _ftLib?.Dispose();
    }
}

public struct GlyphInfo
{
    public Rectangle Source;
    public Vector2 Offset;
    public int Advance;
}
```

### Drawing Text with DynamicFont

```csharp
/// <summary>
/// Draw a string using the dynamic font. Works with any Unicode text
/// the loaded .ttf supports.
/// </summary>
public static void DrawString(SpriteBatch batch, DynamicFont font,
    string text, Vector2 position, Color color)
{
    float x = position.X;
    float y = position.Y;

    foreach (char c in text)
    {
        if (c == '\n')
        {
            x = position.X;
            y += font.LineHeight;
            continue;
        }

        var glyph = font.GetGlyph(c);
        if (glyph.Source.Width > 0)
        {
            batch.Draw(font.Atlas, new Vector2(x, y) + glyph.Offset,
                glyph.Source, color);
        }
        x += glyph.Advance;
    }
}
```

### SpriteFont Still Works for Latin-Only Games

If your game only targets Latin-script languages (English, Spanish, French, German, Portuguese, etc.), XNA's built-in `SpriteFont` via MGCB is perfectly adequate. Use `DynamicFont` only when you need CJK, Arabic, Thai, or other complex scripts.

---

## 4 — Runtime Language Switching

Players expect to change language without restarting the game. Design your UI to support hot-swapping:

```csharp
namespace MyGame.Localization;

/// <summary>
/// Central localization service. All UI code reads from this.
/// Fires an event when locale changes so UI can refresh.
/// </summary>
public class LocalizationService
{
    private readonly StringTable _strings;
    private readonly Dictionary<string, DynamicFont> _fonts = new();

    /// <summary>
    /// Fired when the locale changes. UI screens should
    /// subscribe and rebuild their text elements.
    /// </summary>
    public event Action<string>? LocaleChanged;

    public string CurrentLocale => _strings.CurrentLocale;

    public LocalizationService(string contentBasePath, GraphicsDevice device)
    {
        _strings = new StringTable(contentBasePath);
        _strings.LoadLocale("en");
    }

    public void SetLocale(string locale)
    {
        _strings.LoadLocale(locale);
        LocaleChanged?.Invoke(locale);
    }

    public string Get(string key) => _strings.Get(key);

    public string Get(string key, params (string, string)[] vars)
        => _strings.Get(key, vars);
}
```

```csharp
// In your options menu
public class OptionsScreen
{
    private readonly LocalizationService _loc;

    public OptionsScreen(LocalizationService loc)
    {
        _loc = loc;
        _loc.LocaleChanged += OnLocaleChanged;
    }

    private void OnLocaleChanged(string newLocale)
    {
        // Rebuild all text elements with new translations
        _playButtonText = _loc.Get("menu.play");
        _optionsButtonText = _loc.Get("menu.options");
    }
}
```

---

## 5 — Localizing Non-Text Assets

Some assets need per-locale variants: tutorial images with baked text, voice-over audio, or culturally adapted sprites.

### Folder-per-Locale Pattern

```
Content/
├── Localization/
│   ├── en.json
│   ├── ja.json
│   └── de.json
├── Textures/           # Shared (language-neutral) textures
│   ├── player.png
│   └── tileset.png
├── Textures_l10n/      # Locale-specific texture overrides
│   ├── en/
│   │   └── tutorial_01.png
│   ├── ja/
│   │   └── tutorial_01.png
│   └── de/
│       └── tutorial_01.png
└── Audio_l10n/         # Locale-specific audio
    ├── en/
    │   └── narrator_intro.ogg
    └── ja/
        └── narrator_intro.ogg
```

### Localized Asset Loader

```csharp
/// <summary>
/// Loads assets with locale-specific override support.
/// Checks the locale folder first, then falls back to the shared folder.
/// </summary>
public Texture2D LoadLocalizedTexture(GraphicsDevice device,
    string basePath, string assetName, string locale)
{
    // Try locale-specific path first
    string localePath = Path.Combine(basePath, $"Textures_l10n/{locale}/{assetName}");
    if (File.Exists(localePath))
    {
        using var stream = File.OpenRead(localePath);
        return Texture2D.FromStream(device, stream);
    }

    // Fall back to English
    string enPath = Path.Combine(basePath, $"Textures_l10n/en/{assetName}");
    if (File.Exists(enPath))
    {
        using var stream = File.OpenRead(enPath);
        return Texture2D.FromStream(device, stream);
    }

    // Fall back to shared (non-localized) texture
    string sharedPath = Path.Combine(basePath, $"Textures/{assetName}");
    using var sharedStream = File.OpenRead(sharedPath);
    return Texture2D.FromStream(device, sharedStream);
}
```

---

## 6 — Right-to-Left and CJK Layout

### Right-to-Left (Arabic, Hebrew)

RTL text requires mirrored layout — not just reversed character order. Unicode's bidirectional algorithm handles mixed LTR/RTL text. For a game, the simplest correct approach:

- Use a library like `ICU4N` (C# port of ICU) for bidi reordering, or
- Keep RTL strings pre-ordered in your JSON files (translators provide display-order text)
- Mirror your UI anchoring: menus anchor right instead of left

```csharp
// Simple check for whether a locale uses RTL layout
public static bool IsRightToLeft(string locale)
{
    return locale is "ar" or "he" or "fa" or "ur";
}
```

### CJK Considerations

- **Line breaking:** CJK text can break at almost any character boundary (no spaces between words). Break after any CJK character unless it's a punctuation mark that can't start a line.
- **Vertical text:** Some Japanese games use vertical layout. This requires rotating your text rendering 90 degrees and adjusting glyph placement.
- **Font size:** CJK characters are visually denser than Latin. Consider using a slightly larger font size for CJK locales.

---

## 7 — Pluralization and Variables

English has simple plurals (1 apple, 2 apples). Other languages have complex plural rules (Russian has three forms, Arabic has six). A lightweight approach:

```json
// en.json
{
  "items.count.zero": "No items",
  "items.count.one": "{count} item",
  "items.count.other": "{count} items"
}
```

```json
// ru.json (Russian: one / few / many / other)
{
  "items.count.one": "{count} предмет",
  "items.count.few": "{count} предмета",
  "items.count.many": "{count} предметов",
  "items.count.other": "{count} предметов"
}
```

```csharp
/// <summary>
/// Returns the correct plural form key suffix for a count
/// based on CLDR plural rules for the current locale.
/// Supports: en, ja, ru, de, fr, es, ar (extend as needed).
/// </summary>
public static string GetPluralForm(string locale, int count)
{
    return locale switch
    {
        "ja" or "zh" or "ko" => "other",     // No plural distinction
        "en" or "de" or "es" or "it" =>
            count == 1 ? "one" : "other",
        "fr" or "pt" =>
            count <= 1 ? "one" : "other",
        "ru" =>
            count % 10 == 1 && count % 100 != 11 ? "one" :
            count % 10 >= 2 && count % 10 <= 4
                && (count % 100 < 10 || count % 100 >= 20) ? "few" : "many",
        _ => count == 1 ? "one" : "other"
    };
}
```

---

## 8 — Integration with SpriteBatch

### Measuring Text Before Drawing

Always measure localized text before placing it — translated strings vary wildly in length. German text is often 30% longer than English.

```csharp
/// <summary>
/// Measure the pixel width of a string rendered with a DynamicFont.
/// Use this to center or right-align localized text.
/// </summary>
public static float MeasureStringWidth(DynamicFont font, string text)
{
    float width = 0;
    foreach (char c in text)
    {
        var glyph = font.GetGlyph(c);
        width += glyph.Advance;
    }
    return width;
}

// Center text horizontally on screen
string title = loc.Get("menu.title");
float titleWidth = MeasureStringWidth(font, title);
float x = (screenWidth - titleWidth) / 2f;
DrawString(spriteBatch, font, title, new Vector2(x, 100), Color.White);
```

### UI Layout Tips

- **Never hardcode text positions.** Calculate positions from measured text size.
- **Use anchors** (center, left, right) rather than pixel offsets.
- **Add padding** to text containers — a button that fits "Play" may clip "Iniciar juego".
- **Test with the longest language first** (usually German or Portuguese) to catch overflow early.

---

## 9 — Common Pitfalls

**Concatenating strings for localization** — Never do `"You have " + count + " items"`. Word order differs by language. Use template strings with named variables: `"You have {count} items"` → Japanese: `"{count}個のアイテムがあります"`.

**Embedding text in textures** — Every texture with baked text needs a per-locale variant. Prefer rendering text dynamically over sprites. If you must bake text (logos, stylized titles), plan for per-locale variants from the start.

**Assuming text direction** — Not all text flows left-to-right. Arabic, Hebrew, and some other scripts flow right-to-left. UI layout must account for this.

**Forgetting about text expansion** — German and Finnish translations can be 40-60% longer than English. If your UI breaks at 150% text length, it will break in production.

**Hardcoding date/time/number formats** — Use `CultureInfo` for formatting numbers, dates, and currencies: `count.ToString("N0", new CultureInfo(locale))` formats 1000 as "1,000" in English but "1.000" in German.

**Shipping without fallback** — If a key is missing from a translation file, show the English string (or the key in brackets during development). Never crash on a missing translation.

---

## 10 — FNA vs MonoGame: Localization Differences

| Aspect | FNA | MonoGame |
|--------|-----|----------|
| Built-in l10n | None (roll your own) | None (same) |
| SpriteFont | XNA-identical (MGCB DesktopGL) | MGCB with platform variants |
| Runtime font rendering | SharpFont recommended | SharpFont or SpriteFontPlus |
| Content hot-reload | Manual (reload from files) | Same |
| String file format | Your choice (JSON, CSV, RESX) | Same |
| CJK font rendering | SharpFont + DynamicFont pattern | SpriteFontPlus or SharpFont |

The localization approach is identical between FNA and MonoGame because neither framework provides localization features. The only practical difference: MonoGame's `SpriteFontPlus` NuGet package wraps StbTrueType for dynamic font rendering, while FNA projects typically use SharpFont (FreeType). Both solve the same problem — choose whichever your project already depends on.
