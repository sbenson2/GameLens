# Addon SDK Development

> **Category:** reference · **Engine:** Construct · **Related:** [G3_scripting_api_and_modules](../guides/G3_scripting_api_and_modules.md), [R1_behaviors_and_effects](R1_behaviors_and_effects.md)

Construct 3's Addon SDK lets developers extend the editor and runtime with custom plugins, behaviors, effects, and themes. As of r391 (May 2024), SDK v2 is the current standard — all new addons should target v2.

---

## Addon Types

| Type | Purpose | Editor File | Runtime Base Class |
|------|---------|-------------|--------------------|
| **Plugin** | New object type with custom properties, ACEs, and rendering | `plugin.js` | `ISDKInstanceBase` |
| **Behavior** | Attachable logic module for any object type | `behavior.js` | `ISDKBehaviorInstanceBase` |
| **Effect** | WebGL shader applied to objects or layers | `effect.js` | N/A (shader-only) |
| **Theme** | UI color/styling override for the editor | `theme.js` | N/A |

---

## Project Structure

A minimal plugin addon looks like this:

```
my-plugin/
├── addon.json           # Manifest — type, ID, version, file list
├── aces.json            # Actions, Conditions, Expressions definitions
├── plugin.js            # Editor-side plugin class
├── icon.svg             # 64×64 icon shown in the editor
├── lang/
│   └── en-US.json       # UI strings (property names, ACE descriptions)
└── c3runtime/
    └── main.js          # Runtime code — Instance and Type classes
```

### addon.json

The manifest declares the addon type, editor scripts, and every file in the package:

```json
{
    "type": "plugin",
    "id": "MyCompany_MyPlugin",
    "version": "1.0.0",
    "name": "My Plugin",
    "author": "Your Name",
    "website": "https://example.com",
    "documentation": "https://example.com/docs",
    "description": "A custom plugin for Construct 3.",
    "editor-scripts": ["plugin.js"],
    "file-list": [
        "addon.json",
        "aces.json",
        "plugin.js",
        "icon.svg",
        "lang/en-US.json",
        "c3runtime/main.js"
    ]
}
```

### plugin.js (Editor-side)

```js
const PLUGIN_ID = "MyCompany_MyPlugin";

const PLUGIN_CLASS = SDK.Plugins.MyCompany_MyPlugin = class MyPlugin extends SDK.IPluginBase {
    constructor() {
        super(PLUGIN_ID);

        SDK.Lang.PushContext("plugins." + PLUGIN_ID.toLowerCase());

        this._info.SetName(self.lang(".name"));
        this._info.SetDescription(self.lang(".description"));
        this._info.SetCategory("general");    // "general", "form", "media", etc.
        this._info.SetAuthor("Your Name");
        this._info.SetHelpUrl(self.lang(".help-url"));
        this._info.SetIcon("icon.svg", "image/svg+xml");

        // Set to true if only one instance should exist per project
        this._info.SetIsSingleGlobal(false);

        // Declare editable properties
        this._info.SetProperties([
            new SDK.PluginProperty("integer", "count", 0),
            new SDK.PluginProperty("text", "label", "Hello"),
            new SDK.PluginProperty("check", "enabled", true)
        ]);

        SDK.Lang.PopContext();
    }
};

PLUGIN_CLASS.Register(PLUGIN_ID, PLUGIN_CLASS);
```

### c3runtime/main.js (SDK v2)

In SDK v2, both the Type and Instance classes live in a single `main.js` file inside `c3runtime/`:

```js
"use strict";

// Type class — one per object type in the project
class MyPluginType extends globalThis.ISDKPluginTypeBase {
    constructor() {
        super();
    }

    OnCreate() {
        // Called when the type is first created at runtime
    }
}

// Instance class — one per instance placed in a layout
class MyPluginInstance extends globalThis.ISDKInstanceBase {
    constructor() {
        super();

        // Read properties set in the editor
        this._count = this._getInitProperty("count");
        this._label = this._getInitProperty("label");
        this._enabled = this._getInitProperty("enabled");
    }

    OnCreate() {
        // Called after constructor; instance is fully initialised
    }

    Tick() {
        // Called every tick if _setTicking(true) is enabled
        if (!this._enabled) return;
        // Per-frame logic here
    }

    Release() {
        // Called when the instance is destroyed — clean up references
        super.Release();
    }
}

// Register classes with Construct
globalThis.C3.Plugins["MyCompany_MyPlugin"] = class {
    static Type = MyPluginType;
    static Instance = MyPluginInstance;
};
```

---

## ACEs — Actions, Conditions, Expressions

The `aces.json` file defines the interface between event sheets and your runtime code. Each ACE category groups related operations.

```json
{
    "my-category": {
        "conditions": [
            {
                "id": "is-enabled",
                "scriptName": "IsEnabled",
                "highlight": false,
                "params": []
            }
        ],
        "actions": [
            {
                "id": "set-count",
                "scriptName": "SetCount",
                "highlight": false,
                "params": [
                    {
                        "id": "value",
                        "type": "number"
                    }
                ]
            }
        ],
        "expressions": [
            {
                "id": "count",
                "scriptName": "Count",
                "returnType": "number",
                "params": []
            }
        ]
    }
}
```

Then implement the corresponding methods in your Instance class:

```js
class MyPluginInstance extends globalThis.ISDKInstanceBase {
    // ... constructor, etc.

    // Condition
    IsEnabled() {
        return this._enabled;
    }

    // Action
    SetCount(value) {
        this._count = value;
    }

    // Expression
    Count() {
        return this._count;
    }
}
```

---

## Language File

The `lang/en-US.json` provides human-readable names for everything:

```json
{
    "languageTag": "en-US",
    "fileDescription": "My Plugin language file.",
    "text": {
        "plugins": {
            "mycompany_myplugin": {
                "name": "My Plugin",
                "description": "A custom plugin example.",
                "help-url": "https://example.com/docs",
                "properties": {
                    "count": {
                        "name": "Count",
                        "desc": "An integer counter value."
                    },
                    "label": {
                        "name": "Label",
                        "desc": "A text label."
                    },
                    "enabled": {
                        "name": "Enabled",
                        "desc": "Whether the plugin is active."
                    }
                },
                "aceCategories": {
                    "my-category": "My Plugin"
                },
                "conditions": {
                    "is-enabled": {
                        "list-name": "Is enabled",
                        "display-text": "{my 0} is enabled",
                        "description": "True if the plugin is enabled."
                    }
                },
                "actions": {
                    "set-count": {
                        "list-name": "Set count",
                        "display-text": "Set count to {0}",
                        "description": "Set the counter value.",
                        "params": {
                            "value": {
                                "name": "Value",
                                "desc": "The new count."
                            }
                        }
                    }
                },
                "expressions": {
                    "count": {
                        "description": "Get the current count.",
                        "translated-name": "Count"
                    }
                }
            }
        }
    }
}
```

---

## Drawable Plugins

If your plugin needs to render, the instance class should also implement `Draw()` and optionally `DrawGL()`:

```js
class MyDrawableInstance extends globalThis.ISDKWorldInstanceBase {
    constructor() {
        super();
    }

    Draw(renderer) {
        // renderer is an IWebGLRenderer or ICanvas2dRenderer
        const wi = this.GetWorldInfo();
        const quad = wi.GetBoundingQuad();
        // Draw using renderer methods
        renderer.SetColor(this._color);
        renderer.Quad(quad);
    }
}
```

For drawable plugins, extend `ISDKWorldInstanceBase` instead of `ISDKInstanceBase`, and set `this._info.SetIsWorldType(true)` in the editor-side plugin class.

---

## Testing & Installation

### Local development

1. Open Construct 3 (browser or desktop).
2. Open the **Menu → View → Addon Manager**.
3. Click **Install developer addon** and point to your addon folder.
4. The addon reloads on each editor restart — no re-install needed during development.

### Packaging for distribution

Package your addon folder as a `.c3addon` file (a renamed `.zip`):

```bash
cd my-plugin/
zip -r ../my-plugin.c3addon .
```

Users install `.c3addon` files via the Addon Manager's drag-and-drop or file picker.

---

## SDK v1 → v2 Migration

SDK v2 (introduced in r391) consolidates runtime scripts into a single `c3runtime/main.js` file using standard ES class syntax. Key differences:

| Feature | v1 | v2 |
|---------|----|----|
| Runtime files | Separate `instance.js`, `type.js`, `plugin.js` per runtime | Single `main.js` |
| Base class | `C3.SDKInstanceBase` | `globalThis.ISDKInstanceBase` |
| Registration | `C3.Plugins[id].Instance = ...` | `globalThis.C3.Plugins[id] = { static Instance, static Type }` |
| Module syntax | IIFE wrappers | Standard ES classes |

The Construct docs provide a [Porting to Addon SDK v2](https://www.construct.net/en/make-games/manuals/addon-sdk/guide/porting-addon-sdk-v2) guide for migrating existing addons.
