# Distribution and Packaging

> **Category:** reference · **Engine:** Pygame · **Related:** [Game Loop and State](../architecture/game-loop-and-state.md), [Pygame AI Rules](../pygame-arch-rules.md)

How to package a Pygame game into standalone executables for Windows, macOS, and Linux. Covers PyInstaller (default choice), Nuitka (compiled, faster runtime), and cx_Freeze, with Pygame-specific configuration for assets, hidden imports, and cross-platform builds.

---

## Tool Comparison

| Feature | PyInstaller 6.x | Nuitka 2.x | cx_Freeze 7.x |
|---------|-----------------|-------------|----------------|
| Approach | Bundles Python interpreter + deps | Compiles Python to C, then to native binary | Bundles interpreter (like PyInstaller) |
| Runtime speed | Same as CPython | 2-4x faster (compute-heavy code) | Same as CPython |
| Output size | Medium (~30-60 MB) | Smaller (no interpreter overhead) | Medium |
| Build speed | Fast (seconds) | Slow (minutes — C compilation) | Fast |
| Pygame support | Excellent — hooks included | Good — needs `--include-package=pygame` | Good |
| Platform | Build on target OS | Build on target OS | Build on target OS |
| Ease of use | Easiest — most docs/community | Moderate — C compiler required | Moderate |

**Recommendation:** Use PyInstaller for most projects. Switch to Nuitka if you need better runtime performance or smaller binaries. All three require building on each target platform (no cross-compilation).

---

## Project Structure for Packaging

Design your project so assets are locatable regardless of how the game is run:

```python
# utils/paths.py — resolve asset paths in both dev and frozen modes
import sys
import os

def resource_path(relative_path):
    """Get absolute path to resource, works for dev and PyInstaller."""
    if getattr(sys, 'frozen', False):
        # Running as compiled executable
        base_path = sys._MEIPASS  # PyInstaller temp folder
    else:
        # Running as script
        base_path = os.path.dirname(os.path.abspath(__file__))
        base_path = os.path.join(base_path, '..')  # up from utils/

    return os.path.join(base_path, relative_path)

# Usage throughout your game:
image = pygame.image.load(resource_path("assets/images/player.png")).convert_alpha()
font = pygame.font.Font(resource_path("assets/fonts/main.ttf"), 24)
```

For Nuitka, use a different detection:

```python
def resource_path(relative_path):
    """Works for dev, PyInstaller, and Nuitka."""
    if getattr(sys, 'frozen', False):
        # PyInstaller
        base_path = sys._MEIPASS
    elif "__compiled__" in dir():
        # Nuitka — binary is in the dist folder alongside assets
        base_path = os.path.dirname(os.path.abspath(sys.argv[0]))
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
        base_path = os.path.join(base_path, '..')

    return os.path.join(base_path, relative_path)
```

---

## PyInstaller

### Install

```bash
pip install pyinstaller
```

### Basic build

```bash
# One-folder build (recommended for games — faster startup, easier debugging)
pyinstaller --windowed --name "MyGame" src/main.py

# One-file build (single .exe — slower startup, extracts to temp dir)
pyinstaller --onefile --windowed --name "MyGame" src/main.py
```

- `--windowed` / `-w` — suppresses console window on Windows/macOS
- `--name` — output executable name
- `--icon=icon.ico` — set the application icon (`.ico` on Windows, `.icns` on macOS)

### Including assets

```bash
# Add entire asset directories
pyinstaller --windowed --name "MyGame" \
  --add-data "assets:assets" \
  src/main.py
```

The `--add-data` format is `source:destination` (use `;` instead of `:` on Windows).

### Spec file for complex builds

After the first run, PyInstaller generates a `.spec` file. Edit it for fine-grained control:

```python
# MyGame.spec
a = Analysis(
    ['src/main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('assets/images', 'assets/images'),
        ('assets/sounds', 'assets/sounds'),
        ('assets/fonts', 'assets/fonts'),
        ('assets/maps', 'assets/maps'),
    ],
    hiddenimports=[
        'pygame._view',       # sometimes missed by analysis
        'pygame.mixer_music', # if using mixer.music
    ],
    # ...
)

# Build from spec:
# pyinstaller MyGame.spec
```

### Pygame-specific hidden imports

PyInstaller's analysis may miss some Pygame submodules. Common hidden imports:

```python
hiddenimports=[
    'pygame._view',
    'pygame.mixer_music',
    'pygame.freetype',    # if using freetype fonts
    'pygame._sdl2',       # if using hardware-accelerated rendering
]
```

### pygame-gui integration

If using pygame-gui, its hook file handles data files automatically. Verify with:

```bash
pyinstaller --collect-data pygame_gui --windowed src/main.py
```

---

## Nuitka

### Install

```bash
pip install nuitka
# Also requires a C compiler:
# Windows: Visual Studio Build Tools or MinGW-w64
# macOS: Xcode command line tools (xcode-select --install)
# Linux: gcc (sudo apt install gcc)
```

### Basic build

```bash
# Standalone build (recommended)
python -m nuitka \
  --standalone \
  --enable-plugin=pygame \
  --include-package=pygame \
  --include-data-dir=assets=assets \
  --output-dir=dist \
  --windows-console-mode=disable \
  src/main.py
```

- `--standalone` — bundles everything into a self-contained folder
- `--onefile` — single executable (like PyInstaller's `--onefile`)
- `--enable-plugin=pygame` — activates Pygame-specific compilation hints
- `--include-data-dir=source=dest` — copy asset directories into the build
- `--windows-console-mode=disable` — hide console window

### Nuitka advantages for games

- **Faster game logic** — Python code compiled to C runs 2-4x faster. Noticeable in CPU-heavy systems like pathfinding, procedural generation, and particle updates.
- **Smaller output** — no bundled Python interpreter (compiled to native code).
- **Harder to reverse-engineer** — source code is compiled, not just bundled.

### Nuitka build times

Nuitka compiles your Python to C, then compiles the C. First builds take several minutes. Use `--ccache` to cache C compilation results:

```bash
pip install ccache
python -m nuitka --standalone --enable-plugin=pygame --ccache src/main.py
```

---

## cx_Freeze

### Install

```bash
pip install cx_Freeze
```

### Setup script

```python
# setup.py
from cx_Freeze import setup, Executable

build_options = {
    "packages": ["pygame"],
    "include_files": [
        ("assets/", "assets/"),
    ],
    "excludes": ["tkinter", "unittest"],  # trim unused stdlib
}

setup(
    name="MyGame",
    version="1.0",
    description="My Pygame Game",
    options={"build_exe": build_options},
    executables=[
        Executable(
            "src/main.py",
            target_name="MyGame",
            base="Win32GUI",  # suppress console on Windows (use None for console app)
            icon="icon.ico",
        )
    ],
)
```

### Build

```bash
python setup.py build
```

---

## Platform-Specific Notes

### Windows

- Use `.ico` for the application icon (256x256 recommended, multiple sizes embedded).
- PyInstaller and Nuitka both produce `.exe` files.
- Windows Defender and SmartScreen may flag unsigned executables. Consider code signing for distribution.
- Bundle the Visual C++ redistributable if targeting systems without it (`--collect-all msvc-runtime`).

### macOS

- Use `.icns` for the application icon.
- PyInstaller creates `.app` bundles with `--windowed`.
- Notarization required for distribution outside the Mac App Store (use `codesign` + `notarytool`).
- Universal2 builds (Intel + Apple Silicon): `pyinstaller --target-architecture universal2`.

### Linux

- No special icon format needed (use PNG).
- Bundle as a folder with a shell script launcher, or distribute via AppImage/Flatpak.
- Link against system SDL2 or bundle it (PyInstaller usually handles this).

---

## Distribution Checklist

1. **Test on a clean machine** — install the build on a system without Python to verify all dependencies are bundled.
2. **Check asset paths** — use `resource_path()` everywhere, never hardcode relative paths.
3. **Set the icon** — `--icon=icon.ico` (Windows) or `--icon=icon.icns` (macOS).
4. **Hide the console** — `--windowed` (PyInstaller) or `--windows-console-mode=disable` (Nuitka).
5. **Exclude unnecessary modules** — trim `tkinter`, `unittest`, `test` to reduce size.
6. **Version your builds** — embed version in the executable name or metadata.
7. **Create an installer** (optional) — use Inno Setup (Windows), DMG canvas (macOS), or AppImage (Linux).
8. **Consider itch.io** — butler CLI (`butler push dist/ user/game:platform`) handles upload + versioning for itch.io distribution.
