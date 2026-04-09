# R4 — Custom Scenes and Windows Reference

> **Category:** reference · **Engine:** RPG Maker · **Related:** [G3 Scene and Window System](../guides/G3_scene_and_window_system.md) · [G1 Plugin Development](../guides/G1_plugin_development.md) · [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

---

## Overview

Every screen in RPG Maker MZ — title, menu, battle, game over — is a **Scene** class. Each scene contains **Windows** that display text, handle selections, and process input. Building custom scenes and windows is the foundation of UI plugin development in MZ.

This reference covers the class hierarchy, lifecycle methods, and patterns for creating your own scenes and windows from scratch.

---

## Class Hierarchy

```
Stage (PIXI.Container)
 └─ Scene_Base
     ├─ Scene_Boot
     ├─ Scene_Title
     ├─ Scene_Map
     ├─ Scene_MenuBase
     │   ├─ Scene_Menu
     │   ├─ Scene_Item
     │   ├─ Scene_Skill
     │   ├─ Scene_Equip
     │   ├─ Scene_Status
     │   ├─ Scene_Options
     │   ├─ Scene_Save / Scene_Load
     │   ├─ Scene_GameEnd
     │   └─ (Your custom menu scenes)
     ├─ Scene_Battle
     ├─ Scene_Shop
     └─ Scene_Gameover
```

**Choose your base class:**

| Base Class | Use When |
|-----------|----------|
| `Scene_Base` | Standalone scenes (splash screens, cutscenes, custom title) |
| `Scene_MenuBase` | Scenes accessed from the menu (has back button, help window support, actor background) |
| `Scene_Message` | Scenes that need the message window (dialog over gameplay) |

---

## Scene Lifecycle

Every scene follows this lifecycle, managed by `SceneManager`:

```
┌──────────────────────────────────────┐
│  SceneManager.push(Scene_MyCustom)   │
└──────────┬───────────────────────────┘
           ▼
    1. initialize()     ← Constructor logic, set instance vars
           ▼
    2. create()         ← Create windows, sprites, child objects
           ▼
    3. start()          ← Called once after first update; final setup
           ▼
    4. update()         ← Called every frame (process input, animate)
           ▼
    5. stop()           ← Called when leaving (before terminate)
           ▼
    6. terminate()      ← Cleanup (destroy windows, free resources)
```

### Key Methods to Override

```javascript
class Scene_MyCustom extends Scene_MenuBase {
    // Called by the constructor — initialize instance variables
    initialize() {
        super.initialize();
        this._data = [];
    }

    // Create all windows and sprites
    create() {
        super.create();          // Creates background + help window (MenuBase)
        this.createMyWindow();
    }

    // Final setup after first frame
    start() {
        super.start();
        this._myWindow.refresh();
    }

    // Called every frame — handle input and logic
    update() {
        super.update();          // Always call super — updates children
        if (Input.isTriggered("cancel")) {
            this.popScene();     // Go back to previous scene
        }
    }

    // Cleanup when scene ends
    terminate() {
        super.terminate();
    }
}
```

---

## Scene Navigation

```javascript
// Push a scene onto the stack (can go back with popScene)
SceneManager.push(Scene_MyCustom);

// Replace current scene (no going back)
SceneManager.goto(Scene_Title);

// Go back to the previous scene
SceneManager.pop();
// or from within a scene:
this.popScene();

// Check what scene is active
SceneManager._scene instanceof Scene_Map;  // true if on map

// Check previous scene
SceneManager.isPreviousScene(Scene_Menu);
```

---

## Window Class Hierarchy

```
Window (PIXI.Container)
 └─ Window_Base
     ├─ Window_Scrollable
     │   └─ Window_Selectable
     │       ├─ Window_Command
     │       │   ├─ Window_MenuCommand
     │       │   ├─ Window_Options
     │       │   ├─ Window_TitleCommand
     │       │   └─ (Your custom command windows)
     │       ├─ Window_ItemList
     │       ├─ Window_SkillList
     │       ├─ Window_StatusBase
     │       └─ (Your custom list windows)
     ├─ Window_Help
     ├─ Window_Gold
     └─ Window_Message
```

**Choose your window base:**

| Base Class | Use When |
|-----------|----------|
| `Window_Base` | Static display (text, stats, images — no interaction) |
| `Window_Selectable` | Scrollable list with cursor (inventory, party list) |
| `Window_Command` | Menu with named commands (main menu, dialog choices) |

---

## Creating a Custom Window (Display Only)

A window that shows information but has no cursor or interaction.

```javascript
class Window_PlayerStats extends Window_Base {
    initialize(rect) {
        super.initialize(rect);
        this.refresh();
    }

    // Draw the window contents
    refresh() {
        this.contents.clear();  // Clear previous drawing

        const actor = $gameParty.leader();
        if (!actor) return;

        // Draw actor face (faceImage, faceIndex, x, y, width, height)
        this.drawActorFace(actor, 0, 0, 144, 144);

        // Draw text
        const x = 160;
        this.drawText(actor.name(), x, 0, 200);
        this.drawText("Lv " + actor.level, x, this.lineHeight(), 100);

        // Draw gauges
        this.drawActorHp(actor, x, this.lineHeight() * 2, 180);
        this.drawActorMp(actor, x, this.lineHeight() * 3, 180);
    }
}
```

### Window_Base Drawing Methods

| Method | Purpose |
|--------|---------|
| `this.drawText(text, x, y, maxWidth, align)` | Draw text ("left", "center", "right") |
| `this.drawTextEx(text, x, y, width)` | Draw text with escape codes (`\C[n]`, `\I[n]`) |
| `this.drawIcon(iconIndex, x, y)` | Draw an icon from the IconSet |
| `this.drawActorFace(actor, x, y, w, h)` | Draw the actor's face graphic |
| `this.drawActorHp(actor, x, y, width)` | Draw HP gauge |
| `this.drawActorMp(actor, x, y, width)` | Draw MP gauge |
| `this.drawActorTp(actor, x, y, width)` | Draw TP gauge |
| `this.drawItemName(item, x, y, width)` | Draw item icon + name |
| `this.drawCurrencyValue(value, unit, x, y, width)` | Draw gold display |
| `this.changeTextColor(color)` | Set text color for subsequent draws |
| `this.resetTextColor()` | Reset to default text color |
| `this.lineHeight()` | Height of one text line (default 36) |
| `this.contents.clear()` | Erase all drawn content |

---

## Creating a Command Window

A window with a list of selectable commands.

```javascript
class Window_CraftMenu extends Window_Command {
    // Define the window size via the rect parameter
    initialize(rect) {
        super.initialize(rect);
    }

    // Define available commands
    makeCommandList() {
        this.addCommand("Forge Weapon",   "forge",   true);   // name, symbol, enabled
        this.addCommand("Brew Potion",    "brew",    true);
        this.addCommand("Enchant Item",   "enchant", this.canEnchant());
        this.addCommand("Disassemble",    "disassemble", true);
        this.addCommand("Cancel",         "cancel",  true);
    }

    // Optional: can a command be selected?
    canEnchant() {
        return $gameParty.hasItem($dataItems[10]);  // Requires enchanting reagent
    }
}
```

### Wiring Commands in the Scene

```javascript
class Scene_Crafting extends Scene_MenuBase {
    create() {
        super.create();
        this.createCommandWindow();
    }

    createCommandWindow() {
        const rect = new Rectangle(0, 0, 300, this.calcWindowHeight(5, true));
        this._commandWindow = new Window_CraftMenu(rect);

        // Bind handlers to command symbols
        this._commandWindow.setHandler("forge",       this.onForge.bind(this));
        this._commandWindow.setHandler("brew",        this.onBrew.bind(this));
        this._commandWindow.setHandler("enchant",     this.onEnchant.bind(this));
        this._commandWindow.setHandler("disassemble", this.onDisassemble.bind(this));
        this._commandWindow.setHandler("cancel",      this.popScene.bind(this));

        this.addWindow(this._commandWindow);
    }

    onForge() {
        // Handle forge action
        // After processing, reactivate the window:
        this._commandWindow.activate();
    }

    onBrew() {
        // ...
        this._commandWindow.activate();
    }

    onEnchant() {
        // ...
        this._commandWindow.activate();
    }

    onDisassemble() {
        // ...
        this._commandWindow.activate();
    }

    // Helper for standard window height
    calcWindowHeight(numLines, selectable) {
        if (selectable) {
            return Window_Selectable.prototype.fittingHeight(numLines);
        }
        return Window_Base.prototype.fittingHeight(numLines);
    }
}
```

---

## Creating a Selectable List Window

For scrollable lists with custom data (inventory, bestiary, achievements).

```javascript
class Window_BestiaryList extends Window_Selectable {
    initialize(rect) {
        super.initialize(rect);
        this._data = [];
        this.refresh();
    }

    // Set the data array and redraw
    setData(data) {
        this._data = data;
        this.refresh();
    }

    // Required: total number of items
    maxItems() {
        return this._data ? this._data.length : 0;
    }

    // Required: draw one item at the given index
    drawItem(index) {
        const entry = this._data[index];
        if (!entry) return;

        const rect = this.itemLineRect(index);

        // Draw enemy icon + name
        if (entry.discovered) {
            this.drawIcon(entry.iconIndex, rect.x, rect.y);
            this.drawText(entry.name, rect.x + 36, rect.y, rect.width - 36);
        } else {
            this.drawText("???", rect.x + 36, rect.y, rect.width - 36);
        }
    }

    // Optional: called when selection changes
    select(index) {
        super.select(index);
        // Notify a detail window to refresh
        if (this._detailWindow) {
            this._detailWindow.setEntry(this._data[index]);
        }
    }

    // Link a detail window
    setDetailWindow(window) {
        this._detailWindow = window;
    }
}
```

---

## Window Sizing and Layout

```javascript
// Create a rectangle for window positioning
const rect = new Rectangle(x, y, width, height);

// Standard sizing helpers (available in scenes)
const screenWidth  = Graphics.boxWidth;    // 816 default
const screenHeight = Graphics.boxHeight;   // 624 default

// Calculate height for N lines of selectable items
const height = Window_Selectable.prototype.fittingHeight(numLines);

// Calculate height for N lines of non-selectable text
const height = Window_Base.prototype.fittingHeight(numLines);

// Common layout patterns
const fullWidth    = new Rectangle(0, 0, screenWidth, height);
const leftHalf     = new Rectangle(0, y, screenWidth / 2, height);
const rightHalf    = new Rectangle(screenWidth / 2, y, screenWidth / 2, height);
const bottomStrip  = new Rectangle(0, screenHeight - height, screenWidth, height);
```

---

## Adding to the Main Menu

To add a command that opens your custom scene from the default menu:

```javascript
// Plugin that adds "Crafting" to the main menu
(() => {
    // Add the command to the menu
    const _Window_MenuCommand_addOriginalCommands =
        Window_MenuCommand.prototype.addOriginalCommands;

    Window_MenuCommand.prototype.addOriginalCommands = function() {
        _Window_MenuCommand_addOriginalCommands.call(this);
        this.addCommand("Crafting", "crafting", true);
    };

    // Handle the command in Scene_Menu
    const _Scene_Menu_createCommandWindow =
        Scene_Menu.prototype.createCommandWindow;

    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler("crafting", () => {
            SceneManager.push(Scene_Crafting);
        });
    };
})();
```

---

## Input Handling in Scenes

RPG Maker MZ uses the `Input` and `TouchInput` modules. Windows handle most input automatically, but you can add custom handling in your scene's `update()`.

```javascript
update() {
    super.update();

    // Keyboard / gamepad
    if (Input.isTriggered("ok"))      { /* confirm */ }
    if (Input.isTriggered("cancel"))  { this.popScene(); }
    if (Input.isTriggered("shift"))   { /* secondary action */ }
    if (Input.isRepeated("down"))     { /* held down, repeats */ }
    if (Input.isPressed("left"))      { /* true every frame while held */ }

    // Touch / mouse
    if (TouchInput.isTriggered())     { /* tap or click */ }
    if (TouchInput.isCancelled())     { /* right-click or two-finger tap */ }
}
```

### Default Input Mappings

| Input Name | Keyboard | Gamepad |
|-----------|----------|---------|
| `"ok"` | Enter, Space, Z | A button |
| `"cancel"` | Escape, X, Numpad 0 | B button |
| `"shift"` | Shift | X button |
| `"menu"` | Escape | Y button |
| `"pageup"` | Q, PageUp | LB |
| `"pagedown"` | W, PageDown | RB |
| `"up/down/left/right"` | Arrow keys | D-pad / Left stick |

---

## Plugin Registration Pattern

Wrap your custom scene in a proper MZ plugin:

```javascript
/*:
 * @target MZ
 * @plugindesc Custom Crafting System v1.0
 * @author YourName
 *
 * @command openCrafting
 * @text Open Crafting Menu
 * @desc Opens the crafting scene.
 *
 * @param menuEnabled
 * @text Show in Main Menu
 * @type boolean
 * @default true
 * @desc Whether to add a "Crafting" command to the main menu.
 */

(() => {
    const pluginName = "CustomCrafting";
    const params = PluginManager.parameters(pluginName);
    const menuEnabled = params.menuEnabled === "true";

    // Register plugin command (callable from event system)
    PluginManager.registerCommand(pluginName, "openCrafting", () => {
        SceneManager.push(Scene_Crafting);
    });

    // Conditionally add to main menu
    if (menuEnabled) {
        const _addOriginal = Window_MenuCommand.prototype.addOriginalCommands;
        Window_MenuCommand.prototype.addOriginalCommands = function() {
            _addOriginal.call(this);
            this.addCommand("Crafting", "crafting", true);
        };

        const _createCmd = Scene_Menu.prototype.createCommandWindow;
        Scene_Menu.prototype.createCommandWindow = function() {
            _createCmd.call(this);
            this._commandWindow.setHandler("crafting", () => {
                SceneManager.push(Scene_Crafting);
            });
        };
    }

    // --- Scene_Crafting and Window classes defined here ---
})();
```

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Window not appearing | Make sure you call `this.addWindow(window)` in the scene's `create()` |
| Cursor not responding | Call `window.activate()` — windows start deactivated by default |
| `super.update()` missing | Always call `super.update()` or child windows won't process input |
| Drawing off-screen | Check `this.contents.width` — drawing coords are relative to the window's content area, not the screen |
| Font/color changes persist | Call `this.resetTextColor()` and `this.resetFontSettings()` after custom drawing |
| Scene doesn't close | `this.popScene()` returns to the previous scene; make sure `"cancel"` handler is set |
