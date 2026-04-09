# R3 — Feather Linter & Debugging Tools

> **Category:** reference · **Engine:** GameMaker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 GML Data Structures](R1_gml_data_structures.md) · [G1 Object Events](../guides/G1_object_events.md)

---

## Feather: Static Analysis for GML

Feather is GameMaker's built-in static analysis engine (introduced in 2022.1). It provides real-time type checking, intelligent code completion, refactoring tools, and lint rules — all inside the Code Editor. Think of it as an IDE-integrated linter purpose-built for GML.

### Enabling Feather

1. Open **File → Preferences → Feather**
2. Set **Enable Feather** to `On`
3. Optionally enable **Strict Type Mode** for stricter type enforcement

> Feather runs continuously in the background. It does **not** affect your compiled game — it only provides IDE warnings and completions.

---

### Feather Rule Categories

Feather organizes its diagnostics into two rule ranges:

| Range | Purpose | Examples |
|-------|---------|---------|
| **GM1000–GM1999** | Fatal syntax and logic errors | `GM1000` — `break` outside a loop · `GM1001` — `continue` outside a loop · `GM1010` — unreachable code |
| **GM2000–GM2999** | Best-practice warnings (prevent bugs) | `GM2000` — unused variable · `GM2017` — comparison always true · `GM2040` — missing return value |

### Controlling Rule Severity

Each rule can be set to one of four severities:

| Severity | Icon | Behavior |
|----------|------|----------|
| **Error** | Red circle | Blocks compilation (in strict mode) |
| **Warning** | Yellow triangle | Highlighted in editor, does not block |
| **Information** | Blue icon | Subtle hint, does not block |
| **Disabled** | None | Rule is silenced entirely |

Change severity globally in **Preferences → Feather → Rule Severities**, or per-line with directives.

---

### Feather Directives

Directives are special comments that override Feather behavior on a per-line or per-block basis:

```gml
// Disable a specific rule for the next line
// @feather ignore GM2000
var _temp = 42;  // Feather won't warn about _temp being unused

// Disable Feather entirely for a block
// @feather disable
some_legacy_code();
// @feather enable

// Force strict type checking for a specific script
// @feather use strict
```

> **Tip:** Place your cursor on a warning line and press **Ctrl+Q** (Cmd+Q on Mac) to open the **Quick Fixes** menu. This lets you suppress the rule, change its severity, or apply an auto-fix.

---

### Strict Type Mode

When enabled, Feather enforces stricter type safety:

```gml
// Without strict mode — Feather may accept this
var _hp = "100";
_hp -= 10;  // Implicit string-to-number — no warning

// With strict mode — Feather flags the type mismatch
var _hp = "100";
_hp -= 10;  // ⚠ GM1056: Cannot apply '-' to type 'String'
```

Enable it in **Preferences → Feather → Enable Strict Type Mode**, or per-script with the `// @feather use strict` directive.

---

### Hover Information and Find References

Feather tracks types through your entire project:

- **Hover** over any variable to see its inferred type, origin, and documentation
- **F3** (Find All References) on a variable searches by semantic scope — not just text matches
- **F2** (Rename Symbol) renames a variable everywhere it's used in its scope

---

## The Debugger

GameMaker's debugger lets you pause your running game, inspect state, and step through code line by line.

### Starting a Debug Session

| Method | Shortcut | What It Does |
|--------|----------|-------------|
| **Debug** (play button with bug icon) | **F6** | Compiles and runs with debugger attached |
| **Clean & Debug** | **Ctrl+F6** | Full clean build, then debug |

### Core Debugger Features

| Feature | Description |
|---------|-------------|
| **Breakpoints** | Click the gutter (left margin) in the Code Editor to toggle a breakpoint. Execution pauses when that line is reached. |
| **Step Over** (F10) | Execute the current line, then pause on the next line in the same scope |
| **Step Into** (F11) | If the current line calls a function, enter that function and pause on its first line |
| **Step Out** (Shift+F11) | Run until the current function returns, then pause in the calling scope |
| **Watch window** | Add variables to watch their values update in real time as execution proceeds |
| **Locals window** | Automatically shows all local variables in the current scope |
| **Globals window** | Shows all global variables and their current values |
| **Instance window** | Inspect any instance's variables by selecting it |

### Conditional Breakpoints

Right-click a breakpoint to add a condition. The breakpoint only triggers when the expression evaluates to `true`:

```gml
// Only break when this specific enemy is at low health
// Condition: hp < 10 && object_index == obj_enemy_boss
```

---

## The Profiler

The Profiler measures how long each piece of your game takes to execute, helping you find performance bottlenecks.

### Accessing the Profiler

1. Start a **Debug** session (F6)
2. In the Debugger window, switch to the **Profile** tab
3. The profiler begins recording immediately

### Reading Profiler Output

| Column | Meaning |
|--------|---------|
| **Name** | The event, script, or function being measured |
| **Time** | Total time spent in this function during the sample period (milliseconds) |
| **Calls** | Number of times this function was called |
| **Step %** | Percentage of the total frame time consumed by this function |

### Common Performance Patterns

```gml
// ❌ Expensive — runs a full instance loop every frame
// Profiler shows: obj_enemy Step Event — high Time, high Calls
with (obj_bullet) {
    if (point_distance(x, y, other.x, other.y) < 32) {
        instance_destroy();
    }
}

// ✅ Better — use collision events or spatial partitioning
// Profiler shows: much lower Step Event time
// Use the built-in collision system:
//   obj_bullet → Collision Event with obj_enemy
```

---

### Real-Time Instance Inspector

During a debug session you can click on any instance in the running game window. The debugger highlights it and shows all its variables — built-in (`x`, `y`, `speed`, `direction`) and custom. This is invaluable for tracking down why a specific enemy is behaving incorrectly.

---

## Debug Workflow Cheat Sheet

| Problem | Tool | What To Do |
|---------|------|-----------|
| Game crashes with an error | **Debugger** | Error message points to the line. Set a breakpoint before it and inspect variable state. |
| Game runs but something looks wrong | **Instance Inspector** | Click the misbehaving instance during debug to see its variable values. |
| Game is slow / frame drops | **Profiler** | Look for functions with high Step % — those are your bottlenecks. |
| Variable has wrong value but you don't know where it changed | **Watch + Breakpoints** | Set a breakpoint in the suspect script and add the variable to Watch. Step through to find the mutation. |
| Code compiles but logic seems off | **Feather** | Check for GM2000-range warnings — unused variables, unreachable code, or type mismatches often point to logic bugs. |

---

## Related Resources

- [E1 Architecture Overview](../architecture/E1_architecture_overview.md) — GameMaker project structure and runtime model
- [G1 Object Events](../guides/G1_object_events.md) — Event execution order (relevant for understanding where to place breakpoints)
- [R1 GML Data Structures](R1_gml_data_structures.md) — Data types that Feather tracks
