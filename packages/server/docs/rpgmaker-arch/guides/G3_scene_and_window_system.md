# G3 — Scene and Window System in RPG Maker MZ

> **Category:** guide · **Engine:** RPG Maker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Plugin Development](G1_plugin_development.md) · [R1 Database Configuration](../reference/R1_database_configuration.md)

---

## Architecture Overview

RPG Maker MZ renders everything through a **scene → window → sprite** hierarchy built on top of PIXI.js. Understanding this hierarchy is essential for creating custom menus, HUDs, or any UI beyond what the editor provides.

```
SceneManager
  └── Scene_Map (or Scene_Battle, Scene_Menu, etc.)   ← extends Scene_Base
        ├── Spriteset_Map                               ← map tiles, characters, weather
        ├── Window_MapName                              ← auto-fading map name display
        ├── Window_Message                              ← dialogue box
        └── (your custom windows and sprites)
```

The **SceneManager** controls which scene is active. Only one scene runs at a time. When you go from the map to the menu, `SceneManager.push(Scene_Menu)` stacks the menu scene on top; backing out pops it and returns to Scene_Map.

---

## The Scene Class Hierarchy

All scenes inherit from `Scene_Base`, which itself extends `Stage` (a PIXI.Container):

```
PIXI.Container
  └── Stage
        └── Scene_Base           ← lifecycle methods, window management, fade
              ├── Scene_Boot     ← initial loading
              ├── Scene_Title    ← title screen
              ├── Scene_Map      ← overworld gameplay
              ├── Scene_Battle   ← combat
              ├── Scene_Menu     ← main menu
              ├── Scene_Shop     ← shop interface
              ├── Scene_Name     ← name input
              ├── Scene_Save     ← save/load
              └── Scene_GameEnd  ← return to title
```

### Scene Lifecycle Methods

Every scene follows a predictable lifecycle. Override these methods in your custom scenes:

| Method | When It Runs | What To Do Here |
|--------|-------------|-----------------|
| `initialize()` | Construction time | Set instance variables, call `super.initialize()` |
| `create()` | After initialization | Create windows, sprites, set up the scene's visual layout |
| `start()` | After create, once scene is ready | Start animations, open the first window, play music |
| `update()` | Every frame (60 FPS) | Handle input, update logic, call `super.update()` |
| `stop()` | When scene is about to leave | Stop animations, close windows |
| `terminate()` | Final cleanup | Destroy sprites, free resources |

**Critical rule:** Always call the `super` version of lifecycle methods. Skipping `super.update()` will freeze all windows and sprites because the base class drives their frame updates.

---

## Creating a Custom Scene

Here's a complete example: a "Trophy Room" scene that displays achievement data.

```javascript
//=============================================================================
// Scene_TrophyRoom
//=============================================================================

class Scene_TrophyRoom extends Scene_MenuBase {
    
    // create() builds the visual layout
    create() {
        super.create();           // creates the menu background
        this.createTitleWindow();
        this.createListWindow();
    }
    
    createTitleWindow() {
        const rect = this.titleWindowRect();
        this._titleWindow = new Window_TrophyTitle(rect);
        this.addWindow(this._titleWindow);
    }
    
    titleWindowRect() {
        const wx = 0;
        const wy = this.mainAreaTop();
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(1, true);  // 1 line, with standard padding
        return new Rectangle(wx, wy, ww, wh);
    }
    
    createListWindow() {
        const rect = this.listWindowRect();
        this._listWindow = new Window_TrophyList(rect);
        this._listWindow.setHandler("cancel", this.popScene.bind(this));
        this.addWindow(this._listWindow);
        this._listWindow.activate();
        this._listWindow.select(0);
    }
    
    listWindowRect() {
        const titleRect = this.titleWindowRect();
        const wx = 0;
        const wy = titleRect.y + titleRect.height;
        const ww = Graphics.boxWidth;
        const wh = Graphics.boxHeight - wy;
        return new Rectangle(wx, wy, ww, wh);
    }
}
```

### Navigating to a Custom Scene

```javascript
// From an event's Script command or another scene:
SceneManager.push(Scene_TrophyRoom);

// To go back to the previous scene (from within your custom scene):
this.popScene();

// To replace the current scene entirely (no back stack):
SceneManager.goto(Scene_TrophyRoom);
```

---

## The Window Class Hierarchy

Windows are the UI containers in RPG Maker MZ. They draw a framed box with text, icons, and gauges inside.

```
PIXI.Container
  └── Window                    ← raw PIXI window with skin rendering
        └── Window_Base         ← text drawing, content area, padding
              ├── Window_Scrollable   ← scroll support for long content
              │     └── Window_Selectable  ← cursor, selection, input handling
              │           ├── Window_Command     ← vertical command list
              │           ├── Window_ItemList    ← inventory display
              │           ├── Window_SkillList   ← skill display
              │           └── Window_MenuStatus  ← party status
              ├── Window_Help        ← description text at top/bottom
              ├── Window_Gold        ← gold display
              └── Window_Message     ← dialogue with text codes
```

### Window_Base — The Foundation

`Window_Base` provides:

- **Text drawing:** `drawText(text, x, y, maxWidth, align)` — renders text in the content area.
- **Icon drawing:** `drawIcon(iconIndex, x, y)` — draws from the IconSet spritesheet.
- **Face drawing:** `drawFace(faceName, faceIndex, x, y, width, height)` — character portraits.
- **Gauge drawing:** `drawGauge(x, y, width, rate, color1, color2)` — HP/MP bars.
- **Text colors:** `changeTextColor(color)`, `resetTextColor()`.
- **Content dimensions:** `this.contentsWidth()`, `this.contentsHeight()`.

### Window_Selectable — Interactive Lists

`Window_Selectable` adds cursor navigation and selection. Override these methods:

| Method | Purpose |
|--------|---------|
| `maxItems()` | Return the total number of items in the list |
| `itemHeight()` | Height of each row in pixels |
| `drawItem(index)` | Draw the content for one row |
| `isCurrentItemEnabled()` | Return false to grey out the selected item |
| `processOk()` | Called when player confirms selection |

### Window_Command — Menu Commands

`Window_Command` builds on `Window_Selectable` for named command lists:

```javascript
class Window_TrophyCommands extends Window_Command {
    
    makeCommandList() {
        this.addCommand("View All",     "viewAll");
        this.addCommand("Favorites",    "favorites");
        this.addCommand("Statistics",   "stats");
        this.addCommand("Back",         "cancel");
    }
}
```

In the scene, bind handlers to command symbols:

```javascript
this._commandWindow.setHandler("viewAll",   this.onViewAll.bind(this));
this._commandWindow.setHandler("favorites", this.onFavorites.bind(this));
this._commandWindow.setHandler("stats",     this.onStats.bind(this));
this._commandWindow.setHandler("cancel",    this.popScene.bind(this));
```

---

## Creating a Custom Window

A non-interactive info window that displays custom text:

```javascript
class Window_TrophyTitle extends Window_Base {
    
    initialize(rect) {
        super.initialize(rect);
        this.refresh();
    }
    
    refresh() {
        this.contents.clear();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText("Trophy Room", 0, 0, this.contentsWidth(), "center");
        this.resetTextColor();
    }
}
```

A selectable list window:

```javascript
class Window_TrophyList extends Window_Selectable {
    
    initialize(rect) {
        super.initialize(rect);
        this._data = [];
        this.refresh();
    }
    
    // Data source — call this from the scene to set trophy data
    setData(trophies) {
        this._data = trophies;
        this.refresh();
    }
    
    maxItems() {
        return this._data ? this._data.length : 0;
    }
    
    // Draw one trophy entry
    drawItem(index) {
        const trophy = this._data[index];
        if (!trophy) return;
        
        const rect = this.itemLineRect(index);
        
        // Draw trophy icon
        this.drawIcon(trophy.iconIndex, rect.x, rect.y);
        
        // Draw trophy name (offset past the icon)
        const textX = rect.x + ImageManager.iconWidth + 4;
        this.drawText(trophy.name, textX, rect.y, rect.width - textX);
        
        // Draw unlock date on the right
        if (trophy.unlocked) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(trophy.date, rect.x, rect.y, rect.width, "right");
            this.resetTextColor();
        } else {
            this.changeTextColor(ColorManager.deathColor());
            this.drawText("Locked", rect.x, rect.y, rect.width, "right");
            this.resetTextColor();
        }
    }
    
    // Grey out locked trophies
    isCurrentItemEnabled() {
        const trophy = this._data[this.index()];
        return trophy ? trophy.unlocked : false;
    }
    
    refresh() {
        this.makeItemList();
        super.refresh();
    }
    
    makeItemList() {
        // In a real plugin, pull from $gameSystem or a custom data store
        this._data = $gameSystem._trophies || [];
    }
}
```

---

## The Rendering Layer: PIXI.js Under the Hood

All visual output in RPG Maker MZ goes through PIXI.js. The core rendering classes live in `rmmz_core.js`:

### Key PIXI Wrapper Classes

| MZ Class | Extends | Purpose |
|----------|---------|---------|
| `Bitmap` | — | Wraps a canvas/texture. Used by windows and sprites for drawing operations. |
| `Sprite` | `PIXI.Sprite` | Base display element. Every character, animation, and tile is a Sprite. |
| `Window` | `PIXI.Container` | The windowed UI frame. Contains a background sprite, frame sprites, and a contents Bitmap. |
| `Graphics` | — | Screen management, renderer initialization, FPS, resolution. |
| `Tilemap` | `PIXI.Container` | Renders the map tile layers using WebGL shaders for performance. |

### Creating Custom PIXI-Level Visuals

For HUD elements or effects that don't need the window frame (no border, no background), use `Sprite` directly:

```javascript
// In your scene's create() method:
createHudSprite() {
    this._hudBitmap = new Bitmap(200, 50);
    this._hudSprite = new Sprite(this._hudBitmap);
    this._hudSprite.x = 10;
    this._hudSprite.y = 10;
    this.addChild(this._hudSprite);  // addChild, not addWindow
}

// Update it every frame in update():
updateHud() {
    this._hudBitmap.clear();
    this._hudBitmap.fontSize = 20;
    this._hudBitmap.drawText(
        `HP: ${$gameParty.leader().hp}`,
        0, 0, 200, 50, "left"
    );
}
```

### PIXI.js Version Compatibility

RPG Maker MZ ships with **PIXI.js 5.x** by default. The community has confirmed that **PIXI 6.0.4** works as a drop-in replacement (copy to `js/libs/`), but versions beyond 6.x require significant changes to the rendering pipeline. Do not upgrade PIXI beyond 6.0.4 unless you're prepared to rewrite core rendering functions.

For PIXI filters (blur, glow, color matrix, etc.), community plugins like CGMZ Pixi Filters provide safe wrappers that work with MZ's rendering loop.

---

## Scene/Window Communication Patterns

### Pattern: Window → Scene via Handlers

The standard MZ pattern for user input flowing from windows to scenes:

```javascript
// Scene sets up the handler
this._commandWindow.setHandler("buy", this.commandBuy.bind(this));

// Window triggers it when player presses OK on the "Buy" command
// (handled internally by Window_Command — no custom code needed)

// Scene responds
commandBuy() {
    this._commandWindow.deactivate();
    this._buyWindow.activate();
    this._buyWindow.select(0);
}
```

### Pattern: Scene → Window via Direct Calls

Scenes push data into windows:

```javascript
// When the player selects an item, update the help window
this._itemWindow.setHelpWindow(this._helpWindow);
// Window_Selectable automatically calls helpWindow.setText() when cursor moves
```

### Pattern: Multi-Window Focus

Only one window should be `active` (accepting input) at a time. The scene manages focus:

```javascript
onCategoryOk() {
    this._categoryWindow.deactivate();
    this._listWindow.activate();
    this._listWindow.select(0);
}

onListCancel() {
    this._listWindow.deactivate();
    this._categoryWindow.activate();
}
```

---

## Quick Reference

| Task | Code |
|------|------|
| Push a new scene | `SceneManager.push(Scene_YourScene);` |
| Pop back to previous scene | `this.popScene();` |
| Replace current scene | `SceneManager.goto(Scene_YourScene);` |
| Create a window | `new Window_YourWindow(new Rectangle(x, y, w, h));` |
| Add window to scene | `this.addWindow(windowInstance);` |
| Add sprite to scene | `this.addChild(spriteInstance);` |
| Bind command handler | `window.setHandler("symbol", callback);` |
| Activate a window for input | `window.activate();` |
| Deactivate a window | `window.deactivate();` |
| Draw text in window | `this.drawText(text, x, y, maxWidth, align);` |
| Draw icon in window | `this.drawIcon(iconIndex, x, y);` |
| Calculate window height | `this.calcWindowHeight(lines, isSelectable);` |
| Get system color | `ColorManager.systemColor()` |
| Get screen width | `Graphics.boxWidth` |
