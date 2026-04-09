# G3 — JavaScript Scripting API & Modules

> **Category:** guide · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Event Sheet Patterns](G1_event_sheet_patterns.md) · [R2 Multiplayer and Scripting](../reference/R2_multiplayer_and_scripting.md)

---

## When to Use Scripting vs Event Sheets

Construct 3 lets you mix visual event sheets with JavaScript (or TypeScript). You don't have to choose one — they interoperate:

| Approach | Best For | Trade-offs |
|----------|----------|-----------|
| **Event sheets only** | Simple game logic, rapid prototyping, beginners | Visual, fast to iterate; harder to express complex algorithms |
| **Scripting only** | Algorithm-heavy logic, external library integration, experienced JS devs | Full language power; lose visual overview of game flow |
| **Hybrid** (recommended for complex projects) | Game flow in event sheets, complex systems in scripts | Best of both; requires understanding the bridge between them |

---

## Setting Up Script Modules

Since Construct r226+, projects use **JavaScript modules** by default. Modules give you proper `import`/`export`, scoped variables, and modern JS features.

### Enabling Modules

New projects use modules automatically. For older projects:

1. Open **Project Properties** → **Advanced** section
2. Set **Script type** to **"Module"** (instead of "Classic")
3. Existing scripts may need minor adjustments (see migration section below)

### Project Script Structure

```
Project/
├── Scripts/
│   ├── main.js          ← entry point, runs on startup
│   ├── player.js        ← player systems
│   ├── combat.js        ← damage calculations
│   └── utils/
│       └── math.js      ← shared utilities
└── Event sheets/
    └── Level1.events    ← visual logic, calls into scripts
```

---

## The IRuntime Interface

The `IRuntime` object is your gateway from JavaScript into Construct's engine. You receive it in event handlers registered during project startup.

### Connecting to the Runtime

In your main script file (typically `main.js`), register for the runtime events:

```javascript
// main.js — entry point for scripting

// "beforeprojectstart" fires after all objects are created
// but before the first tick. Use it for initialization.
runOnStartup(async runtime => {
    // Store runtime reference for other modules
    globalThis.runtime = runtime;

    runtime.addEventListener("beforeprojectstart", () => {
        onBeforeProjectStart(runtime);
    });

    runtime.addEventListener("tick", () => {
        onTick(runtime);
    });
});

function onBeforeProjectStart(runtime) {
    // Initialize game systems here
    console.log("Game starting!");
}

function onTick(runtime) {
    // Called every frame — use runtime.dt for delta time
    const dt = runtime.dt;
    // Update custom systems...
}
```

### Key IRuntime Methods

| Method / Property | Description |
|-------------------|-------------|
| `runtime.objects.ObjectName` | Access an object type by its Construct name (returns `IObjectClass`) |
| `runtime.objects.ObjectName.getFirstInstance()` | Get the first (or only) instance of an object type |
| `runtime.objects.ObjectName.getAllInstances()` | Get an array of all instances of that type |
| `runtime.dt` | Delta time in seconds since the last frame |
| `runtime.gameTime` | Total elapsed game time in seconds |
| `runtime.layout` | The current `ILayout` object |
| `runtime.goToLayout(name)` | Switch to another layout by name |
| `runtime.callFunction("name", ...)` | Call a Construct function (defined in event sheets) from script |
| `runtime.globalVars.VarName` | Read/write global variables defined in Construct |

---

## Working with Instances from Script

Every Construct object instance is accessible through the scripting API. Instance properties mirror what you'd set in the Properties bar or read in event sheets.

```javascript
// Get all enemies and apply damage
const enemies = runtime.objects.Enemy.getAllInstances();
for (const enemy of enemies) {
    // Access instance variables (defined in Construct editor)
    if (enemy.instVars.isVulnerable) {
        enemy.instVars.hp -= 25;

        // Access built-in properties
        console.log(`Enemy at (${enemy.x}, ${enemy.y}) — HP: ${enemy.instVars.hp}`);

        // Destroy if dead
        if (enemy.instVars.hp <= 0) {
            enemy.destroy();
        }
    }
}
```

### Common Instance Properties

| Property | Type | Description |
|----------|------|-------------|
| `inst.x`, `inst.y` | Number | Position (read/write) |
| `inst.width`, `inst.height` | Number | Size (read/write) |
| `inst.angle` | Number | Rotation in radians |
| `inst.opacity` | Number | 0 (invisible) to 1 (fully opaque) |
| `inst.isVisible` | Boolean | Show/hide the instance |
| `inst.instVars.name` | Varies | Read/write instance variables by name |
| `inst.behaviors.BehaviorName` | Object | Access a behavior's scripting interface |
| `inst.destroy()` | Method | Remove the instance |

---

## Bridging Event Sheets and Scripts

### Calling Script Functions from Event Sheets

1. In your script, export the function:
   ```javascript
   // combat.js
   export function calculateDamage(baseDamage, armor, critMultiplier) {
       const reduction = armor / (armor + 100);
       const effective = baseDamage * (1 - reduction);
       return critMultiplier > 1 ? effective * critMultiplier : effective;
   }
   ```

2. In an event sheet, use the **"Run script"** action or reference the function in a script action block.

### Calling Event Sheet Functions from Script

If you define a **Function** in an event sheet (using the Functions feature), call it from JavaScript:

```javascript
// Call an event sheet function named "SpawnExplosion"
// with parameters x, y, and size
runtime.callFunction("SpawnExplosion", enemy.x, enemy.y, 64);
```

> **Important:** `callFunction` uses the **function name** as a string. Rename carefully — the compiler won't catch mismatches between script calls and event sheet function names.

---

## Using Behaviors from Script

Behaviors attached to objects in the Construct editor are accessible via the scripting API:

```javascript
const player = runtime.objects.Player.getFirstInstance();

// Access the Platform behavior
const platformBehavior = player.behaviors.Platform;
platformBehavior.maxSpeed = 400;
platformBehavior.jumpStrength = 900;
platformBehavior.simulateControl("jump");  // trigger a jump

// Access the Fade behavior
const fadeBehavior = player.behaviors.Fade;
fadeBehavior.startFade();
```

Each behavior type exposes its own scripting interface. Check the Construct documentation for behavior-specific methods and properties.

---

## Migrating Classic Scripts to Modules

If your project uses "Classic" script mode, here's what changes when switching to modules:

| Classic Mode | Module Mode |
|-------------|-------------|
| All scripts share one global scope | Each file is its own scope — use `import`/`export` |
| `runOnStartup()` available globally | Still available — it's the module entry point |
| Variables declared in one file are visible everywhere | Must `export` from source file and `import` in consumer |
| Script execution order matters | Module imports handle dependency order automatically |

### Migration Steps

1. Change **Script type** to "Module" in Project Properties
2. Add `export` to any function or variable other files need
3. Add `import { ... } from "./filename.js"` where those values are consumed
4. Test — most logic works identically; only scope visibility changes

---

## Addon SDK (For Plugin Authors)

Construct's Addon SDK v2 (required since r450+) lets you create custom **plugins**, **behaviors**, **effects**, and **themes** using JavaScript or TypeScript.

### SDK Structure Overview

```
my-addon/
├── addon.json         ← metadata (name, version, type, category)
├── lang/
│   └── en-US.json     ← display names and descriptions
├── instance.js        ← runtime behavior per instance
├── type.js            ← shared type-level logic
├── plugin.js          ← plugin-level setup
└── aces.json          ← Actions, Conditions, Expressions definitions
```

### Key SDK Concepts

| Concept | File | Purpose |
|---------|------|---------|
| **ACEs** | `aces.json` | Define the Actions, Conditions, and Expressions your addon adds to event sheets |
| **Instance class** | `instance.js` | Per-instance runtime logic (called every tick if needed) |
| **Type class** | `type.js` | Shared logic across all instances of this object type |
| **Properties** | `addon.json` | Define configurable properties that appear in the Construct editor |

> The Addon SDK GitHub repository (`Scirra/Construct-Addon-SDK`) includes example plugins, behaviors, and effects to use as templates.

---

## Related Resources

- [E1 Architecture Overview](../architecture/E1_architecture_overview.md) — Construct project structure and runtime model
- [G1 Event Sheet Patterns](G1_event_sheet_patterns.md) — Visual logic patterns that scripts can complement
- [R2 Multiplayer and Scripting](../reference/R2_multiplayer_and_scripting.md) — Networking with the scripting API
