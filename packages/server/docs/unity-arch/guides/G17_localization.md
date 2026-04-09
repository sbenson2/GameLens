# Localization System

> **Category:** guide · **Engine:** Unity 6 / 2022.3 LTS · **Related:** [G5 UI Toolkit](G5_ui_toolkit.md), [G9 Addressables](G9_addressables_asset_management.md)

Ship your game in multiple languages using Unity's official Localization package (com.unity.localization 1.5+). This guide covers String Tables, Asset Tables, Smart Strings, runtime locale switching, and integration with UI Toolkit and TextMeshPro.

## Why Use the Official Package?

Unity's Localization package replaces ad-hoc `Dictionary<string, string>` approaches with a system that handles pluralization, gender, asset swapping (audio, textures, fonts), and async loading out of the box. It integrates directly with the Editor's table UI and supports CSV/XLIFF export for professional translation workflows.

## Installation

Install via Package Manager → Unity Registry → **Localization** (version 1.5+). Unity 6 ships with full compatibility.

After installation the package creates a default `LocalizationSettings` asset. If one doesn't exist, go to **Edit → Project Settings → Localization** and click **Create**.

## Core Concepts

### Locales

A Locale represents a language + region combination (e.g., `en-US`, `ja-JP`). Create Locale assets via **Assets → Create → Localization → Locale** or let the package generate them from the Locale Generator window.

```
// Locales live as ScriptableObject assets in your project.
// The package ships a Locale Generator that creates assets
// for any ISO 639-1 / BCP 47 code you select.
```

### String Tables

String Tables store key-value pairs for translated text. Each table has a **Table Collection** (shared across locales) and per-locale **Table** assets.

Create tables via **Window → Asset Management → Localization Tables → New Table Collection**.

| Key            | en-US                  | ja-JP            | es-MX                    |
|----------------|------------------------|------------------|--------------------------|
| greeting       | Hello, adventurer!     | 冒険者よ、ようこそ！ | ¡Hola, aventurero!       |
| item_collected | You found {0}!         | {0}を見つけた！   | ¡Encontraste {0}!        |

### Asset Tables

Asset Tables let you swap entire assets per locale — different voice-over clips, textures with baked-in text, or fonts for CJK support. Create them alongside String Tables in the same editor window.

## Smart Strings

Smart Strings are a template language built into the Localization package. They replace `String.Format` with richer formatting: pluralization, conditional text, list joining, and nested references.

**Enable Smart Strings** on a table entry by clicking the ⋮ menu → check **Smart String (All)**. Entries with Smart Strings show an `{S}` icon.

### Pluralization Example

```
// Smart String entry for "items_remaining":
// "{ItemCount:plural:one{1 item}other{{ItemCount} items}} remaining"
//
// WHY: English only has "one" and "other" plural forms, but languages
// like Polish, Arabic, and Welsh have up to 6 forms. Smart Strings
// use CLDR plural rules so translators can add all required forms
// without code changes.
```

### Conditional Formatting

```
// Smart String entry for "player_status":
// "{Health:choose(0):Dead|{Health:choose(1,2,3):Critical|Healthy}}"
//
// WHY: Keeps display logic in the localization data rather than
// scattered across C# scripts. Translators can reorder or rephrase
// conditions per language without touching code.
```

## C# Scripting API

### Subscribing to Localized Strings

```csharp
using UnityEngine;
using UnityEngine.Localization;

public class LocalizedGreeting : MonoBehaviour
{
    // Assign this in the Inspector — it references a specific
    // table + key combination and resolves automatically.
    public LocalizedString greetingString;

    string _currentText;

    void OnEnable()
    {
        // WHY: StringChanged fires whenever the active locale changes
        // or the string table finishes async loading. This keeps your
        // UI in sync without polling.
        greetingString.StringChanged += OnStringChanged;
    }

    void OnDisable()
    {
        // WHY: Always unsubscribe to prevent memory leaks and updates
        // to destroyed objects.
        greetingString.StringChanged -= OnStringChanged;
    }

    void OnStringChanged(string value)
    {
        _currentText = value;
        // Update your UI element here (TMP_Text, UI Toolkit label, etc.)
    }
}
```

### Smart String Arguments at Runtime

```csharp
using UnityEngine;
using UnityEngine.Localization;

public class ItemPickupUI : MonoBehaviour
{
    public LocalizedString itemCollectedString;

    // WHY: Smart Strings resolve arguments by name or index.
    // Passing `this` lets the template access any public property
    // on this MonoBehaviour (e.g., {ItemName}, {ItemCount}).
    public string ItemName { get; private set; }
    public int ItemCount { get; private set; }

    void OnEnable()
    {
        // Arguments array provides data sources for Smart String resolution.
        itemCollectedString.Arguments = new object[] { this };
        itemCollectedString.StringChanged += OnTextChanged;
    }

    void OnDisable()
    {
        itemCollectedString.StringChanged -= OnTextChanged;
    }

    public void ShowPickup(string itemName, int count)
    {
        ItemName = itemName;
        ItemCount = count;
        // WHY: RefreshString re-evaluates the Smart String template
        // with the current argument values. Call this whenever the
        // underlying data changes.
        itemCollectedString.RefreshString();
    }

    void OnTextChanged(string value)
    {
        Debug.Log(value); // e.g., "You found 3 Health Potions!"
    }
}
```

### Runtime Locale Switching

```csharp
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Localization.Settings;
using UnityEngine.UI;

public class LocaleSelector : MonoBehaviour
{
    [SerializeField] Dropdown _dropdown;

    IEnumerator Start()
    {
        // WHY: The localization system loads tables asynchronously.
        // Wait for initialization before accessing locale data to
        // avoid null references on first frame.
        yield return LocalizationSettings.InitializationOperation;

        var options = new List<Dropdown.OptionData>();
        int selectedIndex = 0;

        for (int i = 0; i < LocalizationSettings.AvailableLocales.Locales.Count; i++)
        {
            var locale = LocalizationSettings.AvailableLocales.Locales[i];
            if (LocalizationSettings.SelectedLocale == locale)
                selectedIndex = i;

            // WHY: locale.Identifier.CultureInfo.NativeName shows the
            // language name in its own script (e.g., "日本語" instead
            // of "Japanese"), which is the UX convention for language
            // selection menus.
            options.Add(new Dropdown.OptionData(
                locale.Identifier.CultureInfo?.NativeName ?? locale.name));
        }

        _dropdown.options = options;
        _dropdown.value = selectedIndex;
        _dropdown.onValueChanged.AddListener(OnLocaleSelected);
    }

    void OnLocaleSelected(int index)
    {
        // WHY: Setting SelectedLocale triggers all LocalizedString
        // and LocalizedAsset subscribers to re-resolve, so the
        // entire game updates automatically.
        LocalizationSettings.SelectedLocale =
            LocalizationSettings.AvailableLocales.Locales[index];
    }
}
```

## UI Toolkit Integration

Unity 6 supports localization directly in UXML via the `Localize` component or by binding `LocalizedString` properties.

```xml
<!-- In your UXML file, use the localization binding syntax -->
<ui:Label text="#STRING_TABLE/greeting" />
```

For runtime UI Toolkit panels, bind via C#:

```csharp
using UnityEngine.Localization;
using UnityEngine.UIElements;

public class HudPanel
{
    LocalizedString _healthLabel = new LocalizedString("UI", "health_label");

    public void Bind(VisualElement root)
    {
        var label = root.Q<Label>("health-label");

        // WHY: The callback pattern is the same whether you use UGUI,
        // TMP, or UI Toolkit — subscribe to StringChanged and update
        // the element when the value resolves.
        _healthLabel.StringChanged += value => label.text = value;
    }
}
```

## Asset Localization (Audio, Textures, Fonts)

```csharp
using UnityEngine;
using UnityEngine.Localization;

public class LocalizedVoiceover : MonoBehaviour
{
    // WHY: LocalizedAudioClip works like LocalizedString but swaps
    // entire AudioClip assets per locale. This is essential for
    // voiced dialogue — you don't want to ship all languages in
    // one build when Addressables can stream them on demand.
    public LocalizedAudioClip localizedClip;

    AudioSource _source;

    void Awake() => _source = GetComponent<AudioSource>();

    void OnEnable()
    {
        localizedClip.AssetChanged += OnClipChanged;
    }

    void OnDisable()
    {
        localizedClip.AssetChanged -= OnClipChanged;
    }

    void OnClipChanged(AudioClip clip)
    {
        _source.clip = clip;
        _source.Play();
    }
}
```

## Translation Workflow (CSV / XLIFF Export)

1. **Window → Asset Management → Localization Tables** → select your collection
2. Click **Export** → choose CSV or XLIFF format
3. Send the exported file to translators
4. **Import** the translated file back — the package merges entries by key

**Tip:** Use Google Sheets or Excel for CSV round-tripping. Ensure UTF-8 encoding to preserve CJK and special characters.

## Font Management for CJK

CJK (Chinese, Japanese, Korean) languages require large font atlases. Best practices:

- Use **TMP Font Asset** fallbacks: set a Latin primary font with CJK fallback fonts
- Create separate font assets per locale and swap them via Asset Tables
- Keep SDF atlas sizes reasonable (2048x2048) and use dynamic font features in TextMeshPro to generate glyphs on demand

## Testing in Editor

Use the **Game View Locale** dropdown (bottom-right of the Game view) to preview any locale without changing project settings. This dropdown is editor-only — build a runtime locale selector (see above) for player-facing builds.

## Common Pitfalls

**Hardcoded strings.** Any `"string literal"` in C# bypasses the localization system. Use `LocalizedString` references or load from String Tables via `LocalizationSettings.StringDatabase.GetLocalizedStringAsync()`.

**Forgetting async initialization.** Accessing `LocalizationSettings.SelectedLocale` before `InitializationOperation` completes returns null. Always yield or await initialization first.

**Text expansion.** German and French translations are typically 30-40% longer than English. Design UI layouts with flexible containers or test with pseudo-localization to catch overflow early.

**Missing plural forms.** English only has "one" and "other" plural forms, but Arabic has six. Smart Strings handle this automatically if translators provide all required CLDR plural categories.

## Checklist: Localization-Ready Project

- [ ] Install Localization package and create `LocalizationSettings`
- [ ] Create Locale assets for all target languages
- [ ] Replace all hardcoded UI strings with String Table references
- [ ] Use Smart Strings for dynamic text (counts, names, conditions)
- [ ] Set up Asset Tables for locale-specific audio/textures/fonts
- [ ] Add TMP font fallbacks for CJK character sets
- [ ] Build a runtime locale selector for players
- [ ] Export tables → translate → import and verify
- [ ] Test with pseudo-localization for text expansion issues
- [ ] Configure Addressables groups per locale for download-on-demand
