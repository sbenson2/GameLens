# G28 — Localization & Internationalization

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#  
> **Related:** [G26 Dialogue & Narrative Systems](./G26_dialogue_narrative_systems.md) · [G9 UI & Control Systems](./G9_ui_control_systems.md) · [G11 Save/Load Systems](./G11_save_load_systems.md) · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md)

---

## What This Guide Covers

Localization (l10n) and internationalization (i18n) let your game reach players in any language. Godot has built-in support for translation files, locale switching, right-to-left text, and font fallback chains — but using these systems well requires planning from day one.

This guide covers Godot's `TranslationServer` API, CSV and gettext (.po) translation workflows, marking strings for translation with `tr()`, locale detection and runtime switching, right-to-left and bidirectional text, font fallback chains for CJK/Arabic/Cyrillic, pluralization rules, translating assets (audio, images), and integration with external translation services.

**Start localization early.** Retrofitting `tr()` calls into a finished game is painful. Even if you ship in one language, structuring strings for translation from the start costs almost nothing.

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [Project Setup](#2-project-setup)
3. [The tr() Function](#3-the-tr-function)
4. [CSV Translation Files](#4-csv-translation-files)
5. [Gettext / PO Files](#5-gettext--po-files)
6. [TranslationServer API](#6-translationserver-api)
7. [Runtime Locale Switching](#7-runtime-locale-switching)
8. [Right-to-Left & Bidirectional Text](#8-right-to-left--bidirectional-text)
9. [Font Fallback Chains](#9-font-fallback-chains)
10. [Pluralization & Context](#10-pluralization--context)
11. [Translating Non-Text Assets](#11-translating-non-text-assets)
12. [Integration with External Services](#12-integration-with-external-services)
13. [Testing Localization](#13-testing-localization)
14. [Common Mistakes & Fixes](#14-common-mistakes--fixes)

---

## 1. Core Concepts

```
┌─────────────────────────────────────────────────────┐
│               LOCALIZATION PIPELINE                  │
│                                                     │
│  Source Strings ──► Translation Files ──► Runtime    │
│  (tr() calls)       (CSV or .po)      TranslServer  │
│                                                     │
│  ┌─────────┐    ┌──────────┐    ┌──────────────┐   │
│  │ GDScript │    │ en.csv   │    │ TranslServer │   │
│  │ Scenes   │───►│ es.po    │───►│ get_locale() │   │
│  │ Resources│    │ ja.csv   │    │ set_locale() │   │
│  └─────────┘    └──────────┘    └──────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Key terms:**

- **Locale** — a language + region code, e.g. `en_US`, `ja_JP`, `pt_BR`
- **Translation key** — the identifier used in `tr()`, typically the English string or a key like `MENU_START`
- **Translation domain** — a namespace for translations. The main (default) domain covers most use cases; addons can use their own domains
- **TranslationServer** — the singleton that manages all loaded translations and resolves `tr()` calls at runtime

---

## 2. Project Setup

### Enable localization in Project Settings

1. Go to **Project → Project Settings → Localization → Translations**
2. Add your translation files (CSV or .po)
3. Set the **default locale** under **Localization → Locale → Test**

### Recommended directory structure

```
project/
├── locale/
│   ├── translations.en.csv    # or messages.pot + .po files
│   ├── translations.es.csv
│   ├── translations.ja.csv
│   └── fonts/
│       ├── NotoSansCJK-Regular.ttf
│       └── NotoSansArabic-Regular.ttf
├── scenes/
└── scripts/
```

### GDScript — mark strings from the start

```gdscript
# BAD — hardcoded string, impossible to translate later
label.text = "Press Start"

# GOOD — translation-ready from day one
label.text = tr("Press Start")
```

### C# — equivalent usage

```csharp
// Use Tr() (capital T) in C#
label.Text = Tr("Press Start");
```

---

## 3. The tr() Function

Every `Node` in Godot inherits `tr()` which looks up the current locale in `TranslationServer` and returns the translated string.

### Basic usage

```gdscript
# Simple translation
var text: String = tr("GAME_OVER")

# With string formatting for dynamic values
var score_text: String = tr("SCORE_DISPLAY").format({"score": score})
# Translation file entry: "SCORE_DISPLAY" → "Score: {score}"
```

### Key vs. natural language keys

**Natural language keys** — the source string IS the key:
```gdscript
label.text = tr("Start Game")
# CSV: "Start Game","Iniciar Juego","ゲームスタート"
```

**Abstract keys** — separate identifier from display text:
```gdscript
label.text = tr("MENU_START_GAME")
# CSV: "MENU_START_GAME","Start Game","Iniciar Juego","ゲームスタート"
```

| Approach | Pros | Cons |
|----------|------|------|
| Natural language | Readable code, works without translation file | Breaks if English text changes |
| Abstract keys | Stable, rename-proof | Code less readable, English file required |

**Recommendation:** Use abstract keys for games with more than ~50 translatable strings. Use natural language keys for prototypes and small projects.

### Scene-level translation

UI nodes like `Label`, `Button`, and `RichTextLabel` support automatic translation. Set the `auto_translate_mode` property:

```gdscript
# Enabled by default on Control nodes
label.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_ALWAYS
```

When enabled, setting `label.text = "MENU_START"` will automatically display the translated string. This works in the editor too — useful for previewing layouts in different languages.

---

## 4. CSV Translation Files

CSV is the simplest translation format. Each row is a translation key, each column is a locale.

### File format

```csv
keys,en,es,ja,pt_BR
MENU_START,"Start Game","Iniciar Juego","ゲームスタート","Iniciar Jogo"
MENU_OPTIONS,"Options","Opciones","オプション","Opções"
MENU_QUIT,"Quit","Salir","終了","Sair"
DIALOG_HELLO,"Hello, {name}!","¡Hola, {name}!","こんにちは、{name}！","Olá, {name}!"
```

**Requirements:**
- UTF-8 encoding (with or without BOM)
- First column is always `keys`
- Column headers are locale codes
- Save as `.csv` — Godot auto-detects translation CSVs

### Importing

1. Place the CSV in your project (e.g. `locale/translations.csv`)
2. Godot imports it automatically, generating `.translation` resources
3. Add the generated `.translation` files in **Project Settings → Localization → Translations**

### Tips for managing CSV translations

- Use a spreadsheet tool (Google Sheets, LibreOffice Calc) for editing
- Export as CSV with UTF-8 encoding
- Keep one CSV per domain (main UI, item names, dialogue)
- Use `#` prefix on a key to mark it as a comment row (Godot ignores these)

---

## 5. Gettext / PO Files

For larger projects or professional translation workflows, gettext `.po` files are more powerful than CSV.

### Why gettext over CSV?

- **Pluralization support** — handles "1 item" vs. "5 items" per-language rules
- **Context strings** — disambiguate identical source strings with different meanings
- **Translator comments** — provide context for translators
- **Industry standard** — compatible with professional translation tools (Crowdin, Lokalise, Transifex, Weblate)
- **Fuzzy matching** — mark translations as needing review when source changes

### Workflow

```
project/
└── locale/
    ├── messages.pot          # Template — extracted source strings
    ├── es/
    │   └── messages.po       # Spanish translations
    └── ja/
        └── messages.po       # Japanese translations
```

### Example .po file

```po
# Spanish translations for MyGame
msgid ""
msgstr ""
"Language: es\n"
"Content-Type: text/plain; charset=UTF-8\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\n"

#. Shown on the main menu start button
msgctxt "main_menu"
msgid "Start Game"
msgstr "Iniciar Juego"

#. Item count in inventory — uses pluralization
msgid "You have %d item."
msgid_plural "You have %d items."
msgstr[0] "Tienes %d objeto."
msgstr[1] "Tienes %d objetos."
```

### Extracting strings

Use Godot's built-in POT generation:

1. **Project → Project Settings → Localization → POT Generation**
2. Add your scene and script files to the list
3. Click **Generate POT** — Godot scans for `tr()` calls and creates a `.pot` template
4. Send the `.pot` to translators or upload to a translation platform

---

## 6. TranslationServer API

`TranslationServer` is the singleton that manages translations at runtime.

### Key methods

```gdscript
# Get current locale
var locale: String = TranslationServer.get_locale()
# Returns e.g. "en_US", "es_MX", "ja_JP"

# Set locale (triggers retranslation of auto-translated nodes)
TranslationServer.set_locale("es")

# Get the language name for a locale
var name: String = TranslationServer.get_locale_name("ja")
# Returns "Japanese"

# Get all loaded locales
var locales: PackedStringArray = TranslationServer.get_loaded_locales()

# Translate a string programmatically (outside a Node)
var text: String = TranslationServer.translate("MENU_START")

# Translate with context
var text2: String = TranslationServer.translate_message(
    "Open", "file_menu"  # msgctxt = "file_menu"
)

# Plural translation
var items_text: String = TranslationServer.translate_plural(
    "You have %d item.",
    "You have %d items.",
    item_count
)
```

### C# equivalent

```csharp
// Get/set locale
string locale = TranslationServer.GetLocale();
TranslationServer.SetLocale("es");

// Translate
string text = TranslationServer.Translate("MENU_START");

// Plural
string itemsText = TranslationServer.TranslatePlural(
    "You have %d item.",
    "You have %d items.",
    itemCount
);
```

---

## 7. Runtime Locale Switching

### Language selection menu

```gdscript
class_name LanguageSelector
extends OptionButton

const LANGUAGES: Array[Dictionary] = [
    {"code": "en", "name": "English"},
    {"code": "es", "name": "Español"},
    {"code": "ja", "name": "日本語"},
    {"code": "pt_BR", "name": "Português (Brasil)"},
    {"code": "ar", "name": "العربية"},
]

func _ready() -> void:
    for lang: Dictionary in LANGUAGES:
        add_item(lang["name"])
    # Restore saved preference
    var saved_locale: String = _load_locale_preference()
    if saved_locale:
        TranslationServer.set_locale(saved_locale)
        _select_by_code(saved_locale)

func _on_item_selected(index: int) -> void:
    var code: String = LANGUAGES[index]["code"]
    TranslationServer.set_locale(code)
    _save_locale_preference(code)

func _save_locale_preference(code: String) -> void:
    var config := ConfigFile.new()
    config.set_value("settings", "locale", code)
    config.save("user://settings.cfg")

func _load_locale_preference() -> String:
    var config := ConfigFile.new()
    if config.load("user://settings.cfg") == OK:
        return config.get_value("settings", "locale", "")
    return ""

func _select_by_code(code: String) -> void:
    for i: int in LANGUAGES.size():
        if LANGUAGES[i]["code"] == code:
            selected = i
            return
```

### Detecting system locale

```gdscript
func _ready() -> void:
    # OS.get_locale() returns the user's system locale
    var system_locale: String = OS.get_locale()  # e.g. "en_US"
    var language: String = OS.get_locale_language()  # e.g. "en"
    
    # Check if we have translations for this locale
    if language in TranslationServer.get_loaded_locales():
        TranslationServer.set_locale(language)
    else:
        TranslationServer.set_locale("en")  # fallback
```

---

## 8. Right-to-Left & Bidirectional Text

Godot 4.x has built-in support for RTL text (Arabic, Hebrew, Farsi) via the HarfBuzz text shaping engine and ICU BiDi algorithm.

### Enabling RTL on UI controls

```gdscript
# On any Control node
label.text_direction = Control.TEXT_DIRECTION_AUTO
# AUTO detects direction from content
# RTL forces right-to-left
# LTR forces left-to-right

# For RichTextLabel
rich_label.text_direction = Control.TEXT_DIRECTION_AUTO

# Mirror the entire UI layout for RTL locales
func _apply_rtl_layout() -> void:
    var locale: String = TranslationServer.get_locale()
    var is_rtl: bool = locale.begins_with("ar") or locale.begins_with("he") or locale.begins_with("fa")
    if is_rtl:
        get_tree().root.layout_direction = Window.LAYOUT_DIRECTION_RTL
```

### BiDi considerations

- **Mixed text:** Godot handles embedded LTR text within RTL paragraphs automatically (e.g. English brand names inside Arabic text)
- **Numbers:** Displayed LTR inside RTL text by default (correct behavior)
- **UI mirroring:** `Container` nodes respect `layout_direction` — HBoxContainer reverses child order in RTL mode
- **Icons:** May need manual mirroring (arrows, progress bars) — use `is_layout_rtl()` to check

---

## 9. Font Fallback Chains

Not all fonts support all scripts. Godot's font fallback system lets you chain fonts so missing glyphs fall through to a font that has them.

### Setting up fallbacks

```gdscript
# In code — add fallback to a FontVariation or SystemFont
var main_font := preload("res://fonts/Roboto-Regular.ttf")
var cjk_font := preload("res://fonts/NotoSansCJK-Regular.ttf")
var arabic_font := preload("res://fonts/NotoSansArabic-Regular.ttf")

# FontVariation allows fallback configuration
var font_var := FontVariation.new()
font_var.base_font = main_font
font_var.fallbacks = [cjk_font, arabic_font]

label.add_theme_font_override("font", font_var)
```

### Best practice: use SystemFont for broad coverage

```gdscript
# SystemFont tries system-installed fonts — great for CJK
var sys_font := SystemFont.new()
sys_font.font_names = PackedStringArray([
    "Roboto", "Noto Sans", "Noto Sans CJK", "Arial"
])
# Falls back through the list until it finds a glyph
```

### Font size considerations by script

| Script | Min readable size | Notes |
|--------|------------------|-------|
| Latin | 12px | Standard |
| CJK (Chinese/Japanese/Korean) | 14px | More complex glyphs need larger size |
| Arabic/Hebrew | 14px | Connected script needs breathing room |
| Thai/Devanagari | 14px | Stacking diacritics need vertical space |

---

## 10. Pluralization & Context

### Pluralization with gettext

Different languages have different pluralization rules. English has 2 forms (singular/plural), but Russian has 3, Arabic has 6, and Japanese has 1.

```gdscript
# GDScript — plural translation
var count: int = inventory.get_item_count()
var text: String = tr_n(
    "%d item remaining",       # singular
    "%d items remaining",      # plural
    count                      # count determines which form
) % count
```

### Context for disambiguation

The same English word can translate differently based on context:

```gdscript
# "Open" as in "Open File" vs "Open" as in "The door is open"
var file_open: String = tr("Open", "file_action")
var state_open: String = tr("Open", "door_state")
```

In the .po file:
```po
msgctxt "file_action"
msgid "Open"
msgstr "Abrir"

msgctxt "door_state"
msgid "Open"
msgstr "Abierto"
```

---

## 11. Translating Non-Text Assets

Some assets need to change per locale — voice lines, texture with baked text, tutorial images.

### Using remaps

1. **Project Settings → Localization → Remaps**
2. Add the base asset path
3. Map each locale to its localized variant

```
res://audio/vo/greeting.ogg
  → en: res://audio/vo/en/greeting.ogg
  → es: res://audio/vo/es/greeting.ogg
  → ja: res://audio/vo/ja/greeting.ogg
```

Godot automatically loads the correct variant based on the current locale.

### Programmatic remap

```gdscript
# For dynamically loaded assets
func load_localized(base_path: String) -> Resource:
    var locale: String = TranslationServer.get_locale()
    var localized_path: String = base_path.replace(
        "res://", "res://locale/%s/" % locale
    )
    if ResourceLoader.exists(localized_path):
        return load(localized_path)
    return load(base_path)  # fallback to default
```

---

## 12. Integration with External Services

### Crowdin / Lokalise / Transifex workflow

1. Export `.pot` from Godot (or maintain CSV source of truth)
2. Upload to translation platform
3. Translators work in the web UI
4. Download translated `.po` or `.csv` files
5. Place in `locale/` directory, re-import

### Automation with CI/CD

```yaml
# GitHub Actions — download translations on push
- name: Pull translations from Crowdin
  uses: crowdin/github-action@v2
  with:
    upload_sources: true
    download_translations: true
    localization_branch_name: l10n
    config: crowdin.yml
```

See [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) for full pipeline setup.

---

## 13. Testing Localization

### Pseudolocalization

Test your UI without real translations by generating "pseudo" text that stretches strings and adds accents:

```gdscript
# Simple pseudolocale generator for testing
func pseudolocalize(text: String) -> String:
    var result: String = ""
    var accents: Dictionary = {
        "a": "à", "e": "é", "i": "ì", "o": "ö", "u": "ü",
        "A": "À", "E": "É", "I": "Ì", "O": "Ö", "U": "Ü",
    }
    for ch: String in text:
        result += accents.get(ch, ch)
    # Pad ~30% for expansion (German/French are longer than English)
    var padding: String = " ẍẍ"
    return "[" + result + padding + "]"
```

### What to test

- **Text overflow:** German and French strings are typically 20-40% longer than English
- **RTL layout:** Switch to Arabic/Hebrew and verify UI mirrors correctly
- **CJK rendering:** Check that Japanese/Chinese/Korean glyphs display (font fallback working)
- **Pluralization:** Test counts of 0, 1, 2, 5, 21 (catches Russian/Arabic plural rules)
- **Format strings:** Verify `{name}` and `%d` substitutions work in all languages
- **Missing translations:** Check that missing keys fall back gracefully (show key or English)
- **Line breaks:** CJK text wraps differently (no spaces between words)

---

## 14. Common Mistakes & Fixes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Concatenating translated fragments | "You have " + tr("sword") — word order differs by language | Use a single key: `tr("YOU_HAVE_ITEM").format({"item": item_name})` |
| Hardcoded strings in scenes | Changing locale doesn't update text set in the editor | Use `auto_translate_mode` on Controls, or set text via `tr()` in `_ready()` |
| Forgetting to add .translation to Project Settings | `tr()` returns the key unchanged | Add generated .translation files under Localization → Translations |
| Wrong CSV encoding | Garbled characters for CJK/Arabic | Save CSV as UTF-8 (not Latin-1) |
| No font fallback for CJK | Chinese/Japanese/Korean text shows as `□` boxes | Add CJK font to fallback chain (see Section 9) |
| Baking text into sprites | Can't translate textures easily | Use Godot's text rendering over sprites; or use remaps (Section 11) |
| Not testing text expansion | UI overflows in German/French | Pseudolocalize and test with long strings early |
| Ignoring pluralization | "1 items" in English, worse in other languages | Use `tr_n()` / gettext plural forms |

---

## Quick Reference

```gdscript
# Essential API
tr("KEY")                              # Basic translation
tr("KEY", "context")                   # Contextual translation
tr_n("singular", "plural", count)      # Plural translation
TranslationServer.set_locale("es")     # Change language
TranslationServer.get_locale()         # Current locale
OS.get_locale()                        # System locale
```

**Next steps:** Combine localization with [G26 Dialogue Systems](./G26_dialogue_narrative_systems.md) for translated branching dialogue, and [G9 UI Systems](./G9_ui_control_systems.md) for adaptive layouts that handle text expansion and RTL mirroring.
