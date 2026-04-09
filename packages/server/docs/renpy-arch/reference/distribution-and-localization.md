# Distribution & Localization Reference

> **Category:** reference · **Engine:** Ren'Py · **Related:** [screenplay-scripting](../architecture/screenplay-scripting.md), [python-integration](../guides/python-integration.md)

How to build, package, and distribute a Ren'Py game across platforms, and how to add multi-language support using Ren'Py's built-in translation framework.

## Building Distributions

Ren'Py's Launcher provides one-click builds for multiple platforms. Select **Build Distributions** from the Launcher and choose your target packages.

### Supported Platforms

| Platform | Package Type | Notes |
|----------|-------------|-------|
| Windows 10+ | `.zip` / installer | x86_64, bundled Python + Ren'Py runtime |
| macOS 10.10+ | `.dmg` / `.zip` | Universal binary (Intel + Apple Silicon as of 8.1+) |
| Linux x86_64 | `.tar.bz2` | Includes shell launcher script |
| Linux ARM | `.tar.bz2` | Raspberry Pi and ARM64 |
| Android 5.0+ | `.apk` / `.aab` | Via RAPT (Ren'Py Android Packaging Tool) |
| iOS 11+ | Xcode project | Via Renios; requires macOS + Xcode for final build |
| Web (HTML5) | `.zip` web archive | Via Renpyweb; WebAssembly-based (beta) |

### Build Configuration

Control what goes into each package via `build` namespace variables in a `build.rpy` or your `options.rpy`:

```renpy
init python:
    # Human-readable name used in package filenames
    build.name = "MyVisualNovel"

    # Files/directories to exclude from all packages
    build.classify("**.rpy", None)         # exclude source scripts
    build.classify("**.rpyc", "archive")   # include compiled scripts
    build.classify("game/**.png", "archive")
    build.classify("game/**.ogg", "archive")

    # Exclude dev-only files
    build.classify("game/dev/**", None)
    build.classify("README.md", None)

    # Documentation included in packages
    build.documentation("LICENSE.txt")
```

### Archives

Ren'Py can pack game files into `.rpa` archive files to reduce clutter and mildly deter casual file browsing (not true DRM):

```renpy
init python:
    # Create named archives
    build.archive("scripts", "all")
    build.archive("images", "all")
    build.archive("audio", "all")

    build.classify("game/**.rpyc", "scripts")
    build.classify("game/images/**.png", "images")
    build.classify("game/audio/**.ogg", "audio")
```

### Android Builds (RAPT)

1. From the Launcher, select **Android** and follow prompts to download RAPT.
2. Configure `android.json` (generated on first run) — set package name, version, permissions.
3. Key settings in script:

```renpy
init python:
    build.google_play_key = "MIIBIjANBg..."  # license key for Google Play

    # Android-specific metadata
    build.android_permissions = ["INTERNET"]
    build.android_min_sdk = 21
    build.android_target_sdk = 33
```

4. Build with **Build Android** in the Launcher. Output: `.apk` for sideloading or `.aab` for Google Play.

### iOS Builds (Renios)

1. Download Renios from the Launcher.
2. Ren'Py generates an Xcode project; open it on macOS.
3. Set signing identity, bundle ID, and target device in Xcode.
4. Build and archive from Xcode for TestFlight / App Store.

### Web Builds (Renpyweb)

1. Download Renpyweb from the Launcher.
2. Build produces an HTML + WASM bundle.
3. Upload to itch.io or any static host.

**Limitations:** Web builds have restricted filesystem access, no persistent saves across sessions by default (use `renpy.savelocation` workarounds), and larger download sizes. As of Ren'Py 8.5.0, Live2D is supported in web builds.

## Localization (Translation)

Ren'Py has a built-in translation framework that handles dialogue text, string literals, UI text, style changes, and font substitution per language.

### Generating Translation Files

From the Launcher, select **Generate Translations** and enter a language identifier (e.g., `japanese`, `french`, `spanish`). Ren'Py creates `game/tl/<language>/` with template files containing every translatable string.

### Translating Dialogue

Generated translation blocks mirror the original script structure:

```renpy
# game/tl/french/script.rpy

translate french start_abcd1234:
    e "Bienvenue dans la foret."

translate french start_efgh5678:
    e "Il fait sombre ici."
```

Each block is keyed by a unique identifier derived from the dialogue's file and line position. When the game runs in French, Ren'Py substitutes these translated strings.

### Translating UI Strings

String translations (for menus, buttons, and UI text defined with `_()`) are collected in `game/tl/<language>/common.rpy`:

```renpy
translate french strings:
    old "Start Game"
    new "Commencer"

    old "Load Game"
    new "Charger"

    old "Preferences"
    new "Preferences"

    old "Quit"
    new "Quitter"
```

### Translate Python Strings

Mark translatable Python strings with `_()`:

```python
init python:
    achievement_name = _("First Victory")
```

These appear in the generated translation files alongside other strings.

### Font and Style Overrides

Some languages (CJK, Arabic, etc.) require different fonts or text sizes:

```renpy
translate japanese style default:
    font "fonts/NotoSansJP-Regular.otf"
    size 28

translate japanese style say_dialogue:
    font "fonts/NotoSansJP-Regular.otf"

translate arabic style default:
    font "fonts/NotoNaskhArabic-Regular.ttf"
    language "rtl"  # right-to-left
```

### Language Switching

Let players switch languages at runtime via the `Language` action:

```renpy
screen language_picker():
    hbox:
        textbutton "English" action Language(None)  # None = default language
        textbutton "Francais" action Language("french")
        textbutton "Japanese" action Language("japanese")
```

### Auto-Detection

Ren'Py can auto-detect the player's OS language on first launch:

```renpy
define config.enable_language_autodetect = True

init python:
    config.locale_to_language_map = {
        "fr": "french",
        "ja": "japanese",
        "es": "spanish",
        "de": "german",
    }
```

### Translation Workflow Tips

**Keeping translations in sync.** Re-running **Generate Translations** after script changes adds new blocks without overwriting existing translations. Changed original text is flagged with a comment.

**Testing translations.** Set the language in the Launcher's preferences or launch with `--language french` to test without changing game code.

**Community translation tools.** The [renpy-translator](https://github.com/anonymousException/renpy-translator) tool can auto-translate via machine translation APIs (Google, DeepL, OpenAI) as a starting point for human translators. Translator++ also supports Ren'Py projects with translation memory.

**Multiple scripts.** Translations are generated per-file. For large projects with many `.rpy` files, the `tl/` directory mirrors the source structure, making it easy to assign files to different translators.

## Save / Load and Persistent Data

While covered in depth by Ren'Py's architecture, distribution concerns include:

### Save Compatibility

When updating a released game, Ren'Py tries to maintain save compatibility. Key rules:

- **Don't rename or remove labels** that players may have saved at.
- Use `define` for values that shouldn't be saved (constants); use `default` for values that should persist in save files.
- Adding new content after existing labels is safe; reorganizing label structure can break saves.

### Persistent Data Across Versions

`persistent` data survives game updates and is stored separately from save files:

```renpy
default persistent.endings_seen = set()

label good_ending:
    $ persistent.endings_seen.add("good")
    $ renpy.save_persistent()
```

Use persistent data for unlock tracking, achievement flags, and player preferences that should survive reinstalls or updates.

### Save Location

By default, saves go to:

| Platform | Location |
|----------|----------|
| Windows | `%APPDATA%/RenPy/<game_name>/` |
| macOS | `~/Library/RenPy/<game_name>/` |
| Linux | `~/.renpy/<game_name>/` |
| Android | App-internal storage |

Override with `config.savedir` if needed, but the default is recommended for cross-platform consistency.

## Common Pitfalls

**Classifying files incorrectly.** If `.rpyc` files aren't classified into a package, the game won't run. Test every build target before shipping.

**Forgetting `_()` on Python strings.** Only strings wrapped in `_()` appear in translation files. Bare strings in Python blocks are invisible to the translation generator.

**CJK line-breaking.** Ren'Py's default text layout may not break CJK text correctly. Set `style.default.language` to `"japanese-strict"`, `"korean-with-spaces"`, or `"chinese"` as appropriate.

**Web build save persistence.** Browser storage can be cleared by the user. For web builds, consider warning players that saves may not persist, or implement cloud save via JavaScript interop.

**Android permissions.** Requesting unnecessary permissions triggers Google Play review flags. Only add permissions your game actually needs.
