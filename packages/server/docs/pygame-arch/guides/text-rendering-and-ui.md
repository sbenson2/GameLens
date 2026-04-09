# Text Rendering and UI

> **Category:** guide · **Engine:** Pygame · **Related:** [Surfaces and Drawing](../reference/surfaces-and-drawing.md), [Game Loop and State](../architecture/game-loop-and-state.md), [Input and Events](input-and-events.md)

Pygame treats text as bitmap surfaces — you render a string into a `Surface` through a font object, then blit that surface like any other image. There's no built-in widget system, so menus, buttons, and HUDs are assembled from these text surfaces plus rects and images. This guide covers both font modules, practical UI patterns, and word-wrapping.

## Two Font Modules

Pygame ships two font APIs. Both are available in pygame-ce as well.

### `pygame.font` (SDL_ttf wrapper)

The classic module. Simple, fast for basic use.

```python
import pygame
pygame.font.init()

# System font (may vary across OSes)
font = pygame.font.SysFont("Arial", 24)

# Custom font file (ships with your game — predictable)
font = pygame.font.Font("assets/fonts/PressStart2P.ttf", 16)

# Render returns a new Surface
text_surf = font.render("Score: 1200", True, (255, 255, 255))
# Args: text, antialias (True/False), color, [background_color]

screen.blit(text_surf, (10, 10))
```

> **Tip:** Always ship your own `.ttf` or `.otf` files. `SysFont` relies on whatever the player has installed and may pick a fallback font that looks wrong.

### `pygame.freetype` (FreeType2 wrapper)

More powerful: supports rotation, vertical layout, kerning control, and direct render-to-surface.

```python
import pygame.freetype
pygame.freetype.init()

ft_font = pygame.freetype.Font("assets/fonts/PressStart2P.ttf", 16)

# render() returns (surface, rect)
text_surf, text_rect = ft_font.render("HP: 100", fgcolor=(0, 255, 0))
screen.blit(text_surf, (10, 40))

# render_to() draws directly — no intermediate surface
ft_font.render_to(screen, (10, 70), "Direct draw", fgcolor=(200, 200, 200))
```

### Which to Use

| Feature | `pygame.font` | `pygame.freetype` |
|---------|--------------|-------------------|
| Basic rendering | Yes | Yes |
| Antialias control | Per-call bool | Per-call or font-level |
| Rotation | No | Yes (`font.rotation`) |
| Kerning control | No | Yes (`font.kerning`) |
| Render-to-surface | No (render + blit) | Yes (`render_to`) |
| Vertical layout | No | Yes (`font.vertical`) |
| Bold/italic | Style flags | Style flags + strong |
| Speed for simple text | Slightly faster | Slightly slower |

Use `pygame.font` for simple HUDs and menus. Use `pygame.freetype` when you need rotation, render-to, or precise typographic control.

> **pygame-ce note:** Both modules behave identically in pygame-ce v2.5+. The `pygame.freetype` API has no divergences.

## Caching Rendered Text

`font.render()` creates a new surface every call. Re-rendering static text every frame wastes CPU. Cache surfaces for text that doesn't change often:

```python
class TextCache:
    def __init__(self, font):
        self.font = font
        self._cache = {}

    def get(self, text, color=(255, 255, 255)):
        key = (text, color)
        if key not in self._cache:
            self._cache[key] = self.font.render(text, True, color)
        return self._cache[key]

    def invalidate(self, text=None):
        if text is None:
            self._cache.clear()
        else:
            self._cache = {k: v for k, v in self._cache.items()
                           if k[0] != text}
```

For dynamic text (score counters, timers), only re-render when the value changes:

```python
class ScoreDisplay:
    def __init__(self, font, pos):
        self.font = font
        self.pos = pos
        self._last_score = None
        self._surf = None

    def draw(self, screen, score):
        if score != self._last_score:
            self._last_score = score
            self._surf = self.font.render(f"Score: {score}", True, (255, 255, 255))
        screen.blit(self._surf, self.pos)
```

## Word Wrapping

Neither font module wraps text automatically. Here's a reliable word-wrap function:

```python
def render_wrapped(font, text, color, max_width):
    """Return a list of Surfaces, one per wrapped line."""
    words = text.split(' ')
    lines = []
    current_line = []

    for word in words:
        # Test if adding this word exceeds max width
        test_line = ' '.join(current_line + [word])
        if font.size(test_line)[0] <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(' '.join(current_line))
            current_line = [word]

    if current_line:
        lines.append(' '.join(current_line))

    return [font.render(line, True, color) for line in lines]


def blit_wrapped(screen, surfaces, x, y, line_spacing=4):
    """Draw a list of text surfaces vertically."""
    for surf in surfaces:
        screen.blit(surf, (x, y))
        y += surf.get_height() + line_spacing
```

## Building a Button

Pygame buttons are rect + text + hover detection, drawn manually:

```python
class Button:
    def __init__(self, text, pos, font, 
                 color=(220, 220, 220), hover_color=(255, 255, 100),
                 bg_color=(50, 50, 50), padding=(16, 8)):
        self.text = text
        self.font = font
        self.color = color
        self.hover_color = hover_color
        self.bg_color = bg_color
        self.padding = padding

        # Pre-render both states
        self._normal_surf = font.render(text, True, color)
        self._hover_surf = font.render(text, True, hover_color)

        w = self._normal_surf.get_width() + padding[0] * 2
        h = self._normal_surf.get_height() + padding[1] * 2
        self.rect = pygame.Rect(pos[0], pos[1], w, h)

    def draw(self, screen, mouse_pos):
        hovered = self.rect.collidepoint(mouse_pos)
        pygame.draw.rect(screen, self.bg_color, self.rect, border_radius=4)

        text_surf = self._hover_surf if hovered else self._normal_surf
        text_x = self.rect.x + self.padding[0]
        text_y = self.rect.y + self.padding[1]
        screen.blit(text_surf, (text_x, text_y))

    def is_clicked(self, event):
        """Call with MOUSEBUTTONDOWN events."""
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            return self.rect.collidepoint(event.pos)
        return False
```

Usage:

```python
start_btn = Button("Start Game", (300, 200), font)
quit_btn = Button("Quit", (300, 260), font)

# In event loop:
for event in pygame.event.get():
    if start_btn.is_clicked(event):
        change_state(STATE_PLAYING)
    elif quit_btn.is_clicked(event):
        running = False

# In draw loop:
mouse = pygame.mouse.get_pos()
start_btn.draw(screen, mouse)
quit_btn.draw(screen, mouse)
```

## Simple Menu System

Stack buttons vertically with automatic layout:

```python
class Menu:
    def __init__(self, items, font, start_pos, spacing=10):
        """items: list of (label, callback) tuples."""
        self.buttons = []
        x, y = start_pos
        for label, callback in items:
            btn = Button(label, (x, y), font)
            self.buttons.append((btn, callback))
            y += btn.rect.height + spacing

    def handle_event(self, event):
        for btn, callback in self.buttons:
            if btn.is_clicked(event):
                callback()

    def draw(self, screen):
        mouse = pygame.mouse.get_pos()
        for btn, _ in self.buttons:
            btn.draw(screen, mouse)

# Usage:
main_menu = Menu([
    ("New Game", lambda: change_state(STATE_PLAYING)),
    ("Options", lambda: change_state(STATE_OPTIONS)),
    ("Quit", lambda: sys.exit()),
], font, start_pos=(300, 200))
```

## HUD / Overlay Pattern

For in-game HUD elements, draw them last (on top of everything) with no camera offset:

```python
def draw_hud(screen, font, player):
    # Health bar background
    pygame.draw.rect(screen, (60, 60, 60), (10, 10, 204, 24))
    # Health bar fill
    bar_width = int(200 * (player.hp / player.max_hp))
    color = (0, 200, 0) if player.hp > 30 else (200, 0, 0)
    pygame.draw.rect(screen, color, (12, 12, bar_width, 20))
    # Health text
    hp_text = font.render(f"{player.hp}/{player.max_hp}", True, (255, 255, 255))
    screen.blit(hp_text, (16, 13))

# In game loop (after all world drawing):
draw_hud(screen, hud_font, player)
```

## Third-Party UI Libraries

For complex UIs, consider these community libraries instead of building from scratch:

- **pygame-menu** — Full menu system with themes, widgets (buttons, selectors, text input, sliders), and layout. Install: `pip install pygame-menu`.
- **pygame_gui** — HTML/CSS-inspired UI toolkit with panels, buttons, text entry, drop-downs, and theming via JSON. Install: `pip install pygame_gui`.
- **thorpy** — Declarative UI elements with built-in styling.

These are appropriate for settings screens, level editors, and any UI-heavy screens. For simple HUDs, rolling your own is often simpler.

## Performance Tips

**Render text once, blit many times.** Never call `font.render()` inside the draw loop for text that hasn't changed.

**Use `pygame.freetype.Font.render_to()`** for many small text draws (debug overlays, particle labels) — it skips creating an intermediate surface.

**Limit font objects.** Each `Font()` call loads the font file. Create fonts once at startup and reuse them.

**Prefer antialiased text** (`True` in `render()`) for readability, except in pixel-art games where aliased text matches the aesthetic.
