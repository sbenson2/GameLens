# R1 — Scene2D UI System

> **Category:** reference · **Engine:** libGDX · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Kotlin Patterns](../guides/G2_kotlin_patterns.md) · [libGDX Rules](../libgdx-arch-rules.md)

Scene2D is libGDX's built-in scene graph and UI toolkit. It provides a retained-mode rendering system where **Actors** are organized in a tree, receive input events, and support layout via the **Table** class. Scene2D is split into two layers: the core scene graph (`com.badlogic.gdx.scenes.scene2d`) and the UI widget library built on top of it (`com.badlogic.gdx.scenes.scene2d.ui`).

---

## Core Concepts

### Stage

`Stage` is the root container that manages the actor tree, processes input events, and renders everything via a `SpriteBatch`. Every Scene2D UI starts with a Stage:

```java
// Create a stage with a viewport for resolution independence
Stage stage = new Stage(new ScreenViewport());

// Route input events to the stage
Gdx.input.setInputProcessor(stage);

// In your render loop:
stage.act(Gdx.graphics.getDeltaTime()); // Update all actors
stage.draw();                            // Render all actors
```

The Stage owns a `Viewport` that controls how the UI maps to screen coordinates. Common choices:

| Viewport | Behavior |
|----------|----------|
| `ScreenViewport` | 1:1 pixel mapping — UI scales with DPI, good for desktop |
| `FitViewport` | Fits a virtual resolution inside the window with letterboxing |
| `ExtendViewport` | Extends the virtual world to fill the screen — no black bars, some content shifts |

Always call `stage.getViewport().update(width, height, true)` in your `resize()` method to keep the UI correctly mapped after window size changes.

### Actor

`Actor` is the base class for everything in the scene graph. An Actor has position (`x`, `y`), size (`width`, `height`), origin, scale, rotation, color (with alpha), and visibility. Actors receive input events (touch, key) via `EventListener` instances added with `addListener()`.

Key Actor subclasses:

- **Group** — An Actor that contains child Actors. Transforms are applied hierarchically (moving a Group moves all children).
- **WidgetGroup** — A Group that participates in the layout system (has min/pref/max size).
- **Table** — A WidgetGroup that lays out children in rows and columns (the primary layout mechanism).

### Event System

Scene2D uses a capture-then-bubble event model similar to the DOM:

1. **Capture phase** — Events travel down from the Stage to the target Actor. Listeners registered with `addCaptureListener()` can intercept.
2. **Bubble phase** — Events travel back up from the target Actor to the Stage. Listeners registered with `addListener()` handle events here.

Calling `event.stop()` halts propagation. Calling `event.cancel()` prevents the default action.

```java
button.addListener(new ChangeListener() {
    @Override
    public void changed(ChangeEvent event, Actor actor) {
        // Fired when a button/checkbox/slider value changes
        System.out.println("Button clicked!");
    }
});
```

---

## Table Layout

`Table` is the primary layout tool. It works like HTML tables — you add widgets to cells, configure cell properties (padding, alignment, spanning), and the Table computes positions and sizes automatically. This is far more robust than absolute positioning and adapts to different screen sizes.

### Basic Table Usage

```java
Table table = new Table();
table.setFillParent(true); // Fill the entire stage
stage.addActor(table);

// Add widgets — each add() creates a new cell in the current row
table.add(titleLabel).colspan(2).padBottom(20f);
table.row(); // Start a new row
table.add(usernameField).width(300f).padRight(10f);
table.add(loginButton).width(120f).height(50f);
table.row();
table.add(statusLabel).colspan(2).padTop(10f);
```

### Cell Properties

Each `add()` call returns a `Cell` object with chainable layout methods:

| Method | Effect |
|--------|--------|
| `.width(float)` / `.height(float)` | Fixed size |
| `.minWidth(float)` / `.prefWidth(float)` / `.maxWidth(float)` | Size hints (min, preferred, maximum) |
| `.pad(float)` / `.padTop/Bottom/Left/Right(float)` | Padding outside the widget |
| `.space(float)` / `.spaceTop/Bottom/Left/Right(float)` | Spacing between cells |
| `.colspan(int)` | Span multiple columns |
| `.expand()` / `.expandX()` / `.expandY()` | Cell claims extra available space |
| `.fill()` / `.fillX()` / `.fillY()` | Widget stretches to fill cell |
| `.center()` / `.left()` / `.right()` / `.top()` / `.bottom()` | Alignment within cell |
| `.uniform()` / `.uniformX()` / `.uniformY()` | All uniform cells share the same size |
| `.grow()` | Shorthand for `.expand().fill()` |

**Key distinction:** `expand()` makes the *cell* larger. `fill()` makes the *widget* fill the cell. You usually need both to make a widget stretch.

### Layout Debugging

Enable Table's debug lines to visualize cell boundaries during development:

```java
table.setDebug(true); // Draws red lines around cells, green around tables
```

Or set `Table.debugAll = true` to enable for all tables globally.

---

## Skin System

A **Skin** bundles all the visual resources (textures, fonts, colors) that UI widgets need. Instead of passing individual textures to every widget constructor, you load a Skin once and reference named styles.

### Skin Files

A typical Skin consists of:

- **atlas file** (`uiskin.atlas`) — A `TextureAtlas` containing all UI images (button backgrounds, checkboxes, sliders, etc.)
- **JSON file** (`uiskin.json`) — Maps style names to resources and configuration
- **font files** (`.fnt`) — BitmapFont files referenced by the JSON

```java
// Load a skin (also loads the atlas and fonts referenced in the JSON)
Skin skin = new Skin(Gdx.files.internal("ui/uiskin.json"));

// Create widgets using named styles from the skin
TextButton playBtn = new TextButton("Play", skin);           // Uses "default" style
TextButton quitBtn = new TextButton("Quit", skin, "danger"); // Uses "danger" style
Label title = new Label("My Game", skin, "title");            // Uses "title" style
```

### Skin JSON Structure

```json
{
  "com.badlogic.gdx.graphics.Color": {
    "white": { "r": 1, "g": 1, "b": 1, "a": 1 },
    "gray": { "r": 0.5, "g": 0.5, "b": 0.5, "a": 1 }
  },
  "com.badlogic.gdx.graphics.g2d.BitmapFont": {
    "default-font": { "file": "default.fnt" },
    "title-font": { "file": "title.fnt" }
  },
  "com.badlogic.gdx.scenes.scene2d.ui.Label$LabelStyle": {
    "default": { "font": "default-font", "fontColor": "white" },
    "title": { "font": "title-font", "fontColor": "white" }
  },
  "com.badlogic.gdx.scenes.scene2d.ui.TextButton$TextButtonStyle": {
    "default": {
      "font": "default-font",
      "fontColor": "white",
      "up": "button-up",
      "down": "button-down",
      "over": "button-over"
    }
  }
}
```

The keys under each style class (e.g., `"up"`, `"down"`, `"over"`) correspond to fields in the Java style class. Drawable names like `"button-up"` reference regions in the atlas.

### Skin Composer Tool

For visual Skin editing, use **Skin Composer** (github.com/raeleus/skin-composer) — a free, open-source WYSIWYG editor that generates the atlas, JSON, and font files. The community also maintains free skin packs at github.com/czyzby/gdx-skins.

---

## Common Widgets

Scene2D UI provides a library of ready-to-use widgets. All are subclasses of `Actor` and can be placed in Tables.

### Display Widgets

| Widget | Description |
|--------|-------------|
| `Label` | Text display with font, color, wrapping, alignment, and ellipsis support |
| `Image` | Displays a `Drawable` (texture region, nine-patch, tinted) |
| `ProgressBar` | Horizontal or vertical bar showing a value within a range |

### Input Widgets

| Widget | Description |
|--------|-------------|
| `TextButton` | Button with a text label — fires `ChangeEvent` on click |
| `ImageButton` | Button with an image (icon) |
| `ImageTextButton` | Button with both an image and text |
| `CheckBox` | Toggle button with a checked/unchecked state |
| `Slider` | Draggable bar for numeric value selection |
| `TextField` | Single-line text input |
| `TextArea` | Multi-line text input (extends TextField) |
| `SelectBox` | Drop-down list |

### Container Widgets

| Widget | Description |
|--------|-------------|
| `Table` | Row/column layout (the workhorse) |
| `ScrollPane` | Scrollable region around any widget |
| `SplitPane` | Two widgets separated by a draggable divider |
| `Window` | Draggable, titled container (dialog-like) |
| `Tree` | Hierarchical tree with expandable/collapsible nodes |
| `HorizontalGroup` / `VerticalGroup` | Linear layout (simpler than Table for single-row/column) |
| `Stack` | Overlays widgets on top of each other (all same size) |
| `Container` | Wraps a single widget with alignment and sizing control |

### Dialog

`Dialog` is a Window subclass designed for modal popups:

```java
Dialog dialog = new Dialog("Confirm Quit", skin) {
    @Override
    protected void result(Object obj) {
        if ((boolean) obj) {
            Gdx.app.exit();
        }
    }
};
dialog.text("Are you sure you want to quit?");
dialog.button("Yes", true);   // Second arg is the value passed to result()
dialog.button("No", false);
dialog.show(stage);
```

---

## Viewport and Multi-Resolution Strategy

For UIs that scale correctly across screen sizes:

1. **Use a FitViewport or ExtendViewport** with a design resolution (e.g., 1280×720).
2. **Use Table layouts** (not absolute positions) so widgets reflow as the viewport changes.
3. **Use nine-patch drawables** for buttons and panels so they stretch without pixelation.
4. **Handle resize** by updating the stage's viewport:

```java
@Override
public void resize(int width, int height) {
    stage.getViewport().update(width, height, true);
}
```

For pixel-art games that need crisp HUD elements at native resolution, use a separate `ScreenViewport` for the UI stage and a `FitViewport` for the game world.

---

## Kotlin KTX Scene2D DSL

When using Kotlin, the `ktx-scene2d` module provides a type-safe DSL that significantly reduces boilerplate:

```kotlin
import ktx.scene2d.*

stage.actors {
    table {
        setFillParent(true)
        defaults().pad(10f)

        label("Score: 0", style = "title") {
            it.colspan(2).expandX().fillX()
        }
        row()
        textButton("New Game") {
            it.width(200f).height(50f)
            onChange { startNewGame() }
        }
        textButton("Quit") {
            it.width(200f).height(50f)
            onChange { Gdx.app.exit() }
        }
    }
}
```

See [Kotlin Patterns](../guides/G2_kotlin_patterns.md) for more KTX Scene2D examples.

---

## Lifecycle and Disposal

- Call `stage.act(delta)` and `stage.draw()` every frame in your render method.
- Call `stage.dispose()` when done (it disposes its internal SpriteBatch).
- Dispose the `Skin` separately — `stage.dispose()` does not dispose Skins.
- Set `Gdx.input.setInputProcessor(stage)` so the Stage receives touch/key events. For multiple input processors (e.g., game input + UI), use `InputMultiplexer`:

```java
InputMultiplexer mux = new InputMultiplexer();
mux.addProcessor(stage);        // UI gets first crack at events
mux.addProcessor(gameInput);    // Game input handles the rest
Gdx.input.setInputProcessor(mux);
```

---

## Common Mistakes

- **Forgetting `stage.act(delta)`** — Widgets won't animate, transitions won't play, and Actions won't execute.
- **Not calling `setFillParent(true)`** on the root Table — The Table stays at 0×0 size and nothing is visible.
- **Using absolute positions instead of Table cells** — Breaks on different screen sizes.
- **Not disposing the Skin** — Native texture memory leaks.
- **Adding widgets to the Stage directly instead of to a Table** — Works but loses layout management. Always use Tables.
- **Forgetting `InputMultiplexer`** — If your game has its own input handling, UI clicks won't register unless the Stage is in the input chain.
