# Localization and Text System

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G3 UMG & Common UI](G3_umg_and_common_ui.md), [G15 Blueprint/C++ Workflow](G15_blueprint_cpp_workflow.md)

Localize your Unreal Engine game using the built-in text system: FText, LOCTEXT macros, String Tables, plural/gender forms, the Localization Dashboard, and export/import workflows for professional translation.

## Why FText Matters

Unreal Engine has three string types — `FName` (identifiers), `FString` (mutable general-purpose), and `FText` (display text). **FText is the only type that participates in the localization pipeline.** Every user-facing string in your game should be FText.

```cpp
// WRONG: FString bypasses localization entirely.
// This text will never appear in gathered translation files.
FString BadGreeting = TEXT("Hello, player!");

// RIGHT: FText is gathered by the Localization Dashboard and
// can be translated per-culture.
FText GoodGreeting = NSLOCTEXT("UI", "Greeting", "Hello, player!");
```

**Critical rule:** Never convert FText to FString and back for display purposes. The round-trip destroys the localization identity (namespace + key), and the reconstituted FText won't resolve to translations.

## Text Macros

### NSLOCTEXT

Defines localizable text with an explicit namespace. Use anywhere in your codebase:

```cpp
// NSLOCTEXT(Namespace, Key, SourceString)
// WHY: The namespace groups related strings (e.g., all UI strings,
// all dialogue strings). The key must be unique within its namespace.
// The source string is what English-speaking players see AND what
// translators use as the reference text.
FText WelcomeMessage = NSLOCTEXT("MainMenu", "WelcomeMsg", "Welcome to the Arena!");
```

### LOCTEXT with LOCTEXT_NAMESPACE

For files where all strings share a namespace, reduce repetition:

```cpp
// WHY: Define the namespace once at the top of the file rather than
// repeating it in every NSLOCTEXT call. This reduces typos and makes
// namespace-wide searches easier.
#define LOCTEXT_NAMESPACE "InventoryUI"

FText ItemName = LOCTEXT("SwordName", "Iron Sword");
FText ItemDesc = LOCTEXT("SwordDesc", "A sturdy blade forged in the mountain smithy.");

// WHY: Always #undef at the end of the file to prevent namespace
// leaking into other translation units via header includes.
#undef LOCTEXT_NAMESPACE
```

### INVTEXT (Invariant Text)

For text that should never be translated (debug output, log messages):

```cpp
// WHY: INVTEXT explicitly marks text as non-localizable. The
// Localization Dashboard skips these, keeping your translation
// files clean.
FText DebugLabel = INVTEXT("DEBUG: Frame timing overlay");
```

## String Tables

String Tables decouple localizable text from C++ source files. They live as CSV files in your project and are loaded at module startup.

### CSV Format

```csv
Key,SourceString,Comment
Greeting,"Hello there, and welcome to the game!",Shown on first login
QuitLabel,"Quit Game",Main menu button
ItemCount,"{ItemCount}|plural(one=1 item,other={ItemCount} items)",Inventory count display
```

### Loading String Tables in C++

```cpp
// In your game module's StartupModule():
#include "Internationalization/StringTableRegistry.h"

void FMyGameModule::StartupModule()
{
    FDefaultGameModuleImpl::StartupModule();

    // WHY: LOCTABLE_FROMFILE_GAME loads the CSV relative to
    // your project's Content directory. The first argument is the
    // table ID you'll reference in code and Blueprints.
    // The second is the LOCTEXT namespace for gathered text.
    // The third is the file path relative to project root.
    LOCTABLE_FROMFILE_GAME(
        "UIStrings",           // Table ID
        "UIStringsNamespace",  // Namespace for text gathering
        "Localization/UIStringTable.csv"  // File path
    );
}
```

### Retrieving Strings at Runtime

```cpp
// WHY: FromStringTable looks up the key in the loaded table,
// resolves it against the current culture, and returns the
// translated FText. If no translation exists, it falls back
// to the source string from the CSV.
FText WelcomeText = FText::FromStringTable("UIStrings", "Greeting");
```

### Blueprints

In Blueprints, use the **Make Literal Text** node and point it at a String Table entry, or use **FText::FromStringTable** in a Blueprint function library.

## Text Formatting

### Simple Substitution

```cpp
// WHY: FText::Format preserves localization metadata through the
// formatting pipeline. Using FString::Printf would lose it.
FText PlayerName = LOCTEXT("PlayerName", "Aldric");
FText Formatted = FText::Format(
    LOCTEXT("KillFeed", "{0} defeated {1}!"),
    PlayerName,
    LOCTEXT("EnemyName", "Dragon")
);
// Result: "Aldric defeated Dragon!"
```

### Named Arguments (UE5 Preferred)

```cpp
// WHY: Named arguments let translators reorder placeholders freely.
// In Japanese, the sentence structure is SOV, so translators need
// "{Enemy}を{Player}が倒した！" — impossible with positional {0}/{1}.
FFormatNamedArguments Args;
Args.Add(TEXT("Player"), PlayerName);
Args.Add(TEXT("Enemy"), LOCTEXT("DragonName", "Dragon"));
FText Result = FText::Format(
    LOCTEXT("KillFeedNamed", "{Player} defeated {Enemy}!"),
    Args
);
```

## Plural Forms

Unreal supports CLDR plural rules through the `plural()` format specifier:

```cpp
// WHY: Different languages have different plural categories.
// English: one, other
// Polish: one, few, many, other
// Arabic: zero, one, two, few, many, other
// Using plural() lets translators define all required forms.
FText ItemCount = FText::Format(
    LOCTEXT("ItemsRemaining",
        "{Count}|plural(one=1 item remains,other={Count} items remain)"),
    FFormatOrderedArguments({ FText::AsNumber(Count) })
);
```

In String Table CSV format:

```csv
ItemsRemaining,"{Count}|plural(one=1 item,other={Count} items) remaining",Uses CLDR plural rules
```

## Gender Forms

```cpp
// WHY: Languages like French, Spanish, and German have grammatical
// gender that affects articles, adjectives, and verb forms. Unreal's
// gender() construct handles this without branching in game code.
FText CharacterTitle = FText::Format(
    LOCTEXT("Title", "{Name} the {Gender}|gender(brave,brave,brave) warrior"),
    FFormatNamedArguments{
        {TEXT("Name"), CharName},
        {TEXT("Gender"), FText::FromString(TEXT("masculine"))}
    }
);
// Translators provide locale-specific gendered variants:
// French: "{Name} le|gender(le,la,le) guerrier|gender(guerrier,guerrière,guerrier) courageux|gender(courageux,courageuse,courageux)"
```

## Localization Dashboard

The Localization Dashboard is the central UI for managing translations.

### Setup

1. **Window → Localization Dashboard**
2. Add a **Game** target (not Engine — you only translate your game's text)
3. Add **Cultures**: click "Add New Culture" and select from the list (en, ja, fr, de, etc.)
4. Set **Gather** paths — typically `Source/` and `Content/` directories

### Workflow

```
[Gather Text] → [Export] → Translate → [Import] → [Compile] → Ship
     ↓
  Scans C++ source for LOCTEXT/NSLOCTEXT,
  Blueprints for FText properties,
  String Tables for CSV entries
```

**Step-by-step:**

1. **Gather Text** — Click the Gather button. The engine scans configured paths and builds a manifest of all localizable strings.
2. **Export** — Export to `.po` (Portable Object) files for professional translation tools (memoQ, Trados, Crowdin, Phrase) or to CSV.
3. **Translate** — Send `.po` files to translators. They return completed translations.
4. **Import** — Import the translated `.po` files back into the project.
5. **Compile** — Compile text to binary `.locres` files that ship with your game.

### Automation with Python

The Localization Dashboard commands are exposed to Unreal's Python API, enabling automated pipelines:

```python
# WHY: Automate nightly text exports so translators always have
# the latest strings without manual Dashboard clicks.
import unreal

# Gather all text from the "Game" localization target
loc_target = unreal.LocalizationTarget()  # Configure via project settings
unreal.LocalizationCommandletTasks.gather_text_for_targets(
    [loc_target]
)
```

## Blueprint Localization

All `FText` properties on Actors, Widgets, and Data Assets are automatically gathered by the Localization Dashboard. In UMG:

- Use `Text` type for any widget text (not `String`)
- The `Format Text` Blueprint node supports the same `{ArgName}` and `plural()` syntax as C++
- Set the **Text** property of widgets to String Table references via the Details panel dropdown

## Font Management for CJK

CJK languages require special font handling:

- **Composite Fonts**: Unreal's Slate uses composite font definitions — map Unicode ranges to specific font faces
- Define a default Latin font, then add sub-font ranges for CJK blocks (U+4E00–U+9FFF for CJK Unified, U+3040–U+309F for Hiragana, etc.)
- Keep font assets in per-locale directories and reference them in your Slate style

```cpp
// WHY: A single "mega-font" that covers all scripts is impractical
// (file size, glyph conflicts between Simplified Chinese and Japanese).
// Composite fonts let each Unicode range use the optimal typeface.
FSlateFontInfo GameFont = FCoreStyle::GetDefaultFontStyle("Regular", 16);
// Additional ranges added via UFont → CompositeFontEditor in the Editor
```

## Packaging and Distribution

Localization data ships as `.locres` files inside `Content/Localization/<TargetName>/<Culture>/`.

**Chunking per locale:** In `DefaultGame.ini`, configure localization targets to package into separate chunks. This lets platforms like Steam or consoles download only the languages players select.

```ini
; DefaultGame.ini
[Internationalization]
+LocalizationPaths=%GAMEDIR%Content/Localization/Game

; Package each culture as a separate chunk for download-on-demand
[/Script/UnrealEd.ProjectPackagingSettings]
+CulturesToStage=en
+CulturesToStage=ja
+CulturesToStage=fr
+CulturesToStage=de
+CulturesToStage=es
```

## Testing Localization

### Culture Preview

In the Editor: **Edit → Editor Preferences → Region & Language** → set **Preview Game Language** to test any locale without rebuilding.

### Pseudo-Localization

Enable pseudo-localization to catch text overflow and hardcoded strings:

```ini
; DefaultEngine.ini — enable for QA builds
[Internationalization]
ShouldUseNativeLocalization=true
```

Pseudo-localization replaces characters with accented equivalents (e.g., "Hello" → "Ĥêĺĺö") and pads strings to simulate expansion, making untranslated or truncated text immediately visible.

## Common Pitfalls

**Using FString for UI text.** FString content is invisible to the Localization Dashboard. Always use FText for anything players see.

**Concatenating FText.** `FText::Format` is the correct way to combine localized strings. String concatenation (`+` operator) destroys localization metadata and produces results that can't be translated as a whole phrase.

**Gathering noise.** The Dashboard gathers ALL FText it finds, including engine text you don't need to translate. Configure gather paths carefully and review the manifest to exclude irrelevant entries — typically ~80% of first-pass gathered text is engine content.

**Forgetting to Compile.** After importing translations, you must click **Compile** in the Dashboard to generate `.locres` files. Without this step, the game falls back to source strings at runtime.

**Text expansion.** German and French text runs 30-40% longer than English. Turkish puts `%` before numbers (`%5` not `5%`). Test with expanded pseudo-localization to catch layout issues early.

## Checklist: Localization-Ready UE5 Project

- [ ] Use `FText` exclusively for all player-facing text
- [ ] Apply `LOCTEXT_NAMESPACE` / `LOCTEXT` consistently across source files
- [ ] Create String Tables for UI text that changes frequently
- [ ] Use `FText::Format` with named arguments for dynamic text
- [ ] Add plural/gender forms for all count-dependent or gendered text
- [ ] Set up the Localization Dashboard with Game target and all cultures
- [ ] Gather → Export → Translate → Import → Compile cycle verified
- [ ] Configure composite fonts with CJK Unicode range fallbacks
- [ ] Stage cultures for per-locale chunked packaging
- [ ] Test with pseudo-localization and preview each target culture
