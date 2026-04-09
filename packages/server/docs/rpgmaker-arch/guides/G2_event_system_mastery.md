# G2 — Event System Mastery

> **Category:** guide · **Engine:** RPG Maker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Plugin Development](G1_plugin_development.md) · [R1 Database Configuration](../reference/R1_database_configuration.md)

---

## Overview

The event system is RPG Maker MZ's primary gameplay scripting tool. Nearly everything that isn't database-driven — NPC dialogue, cutscenes, puzzles, quest logic, map transitions — is built with events. Understanding event triggers, page conditions, command flow, and common events is essential for building anything beyond a basic battle-and-explore loop.

---

## Map Events

A map event is an entity placed on a specific tile in the map editor. Each event has one or more **pages**, evaluated right-to-left (highest page number first). The first page whose conditions are met becomes the active page.

### Page Conditions

Each page can require any combination of:

| Condition | What It Checks |
|-----------|---------------|
| **Switch** | A global switch is ON |
| **Variable** | A global variable meets a numeric comparison (≥, ≤, =, etc.) |
| **Self Switch** | A per-event switch (A, B, C, or D) is ON |
| **Item** | The party possesses a specific item |
| **Actor** | A specific actor is in the party |

> **Self switches** are scoped to the individual event on the individual map. They're ideal for one-time interactions: set Self Switch A to ON after the player opens a chest, and page 2 (with the "already opened" graphic) becomes active.

### Multi-Page Pattern: NPC Quest

```
Event: Old Man (3 pages, evaluated right-to-left)

Page 3 — Condition: Switch [Quest Complete] is ON
  → "Thank you for saving the village!"
  → Graphic: happy old man

Page 2 — Condition: Switch [Quest Accepted] is ON
  → "Have you defeated the wolves yet?"
  → Conditional Branch: Variable [Wolves Killed] ≥ 5
    → "Wonderful! Take this reward."
    → Change Items: +1 Magic Sword
    → Control Switches: [Quest Complete] = ON
  → Else
    → "Please hurry..."

Page 1 — No conditions (default/fallback)
  → "The wolves are terrorizing our village. Will you help?"
  → Show Choices: Yes / No
    → Yes: Control Switches: [Quest Accepted] = ON
    → No: "Please reconsider..."
```

---

## Trigger Types

The trigger determines **when** an event's active page executes:

| Trigger | Behavior | Use Case |
|---------|----------|----------|
| **Action Button** | Fires when the player presses the confirm key while facing the event | NPCs, signs, chests, doors |
| **Player Touch** | Fires when the player steps onto the event's tile | Traps, transfer zones, cutscene triggers |
| **Event Touch** | Fires when the event moves onto the player's tile | Chasing enemies, patrol guards |
| **Autorun** | Fires immediately and continuously; **freezes player input** | Cutscenes, forced dialogue, one-time map setup |
| **Parallel** | Fires continuously alongside normal gameplay; **player can still move** | Background timers, ambient systems, conditional checks |

### Autorun vs. Parallel — Critical Differences

**Autorun** blocks all player input and other events until it completes or the page becomes inactive (e.g., by flipping a switch that changes the active page). Always include a way for the autorun to "finish" — typically by changing a switch on its last line so the page condition no longer holds.

```
Page 1 — Trigger: Autorun, Condition: Switch [Intro Played] is OFF
  → Fade Out Screen
  → Show Text: "One year has passed..."
  → Fade In Screen
  → Control Switches: [Intro Played] = ON    ← disables this page
```

**Parallel** runs its commands every frame (~60 times per second) while the player retains full control. This makes it powerful for monitoring game state but dangerous for performance.

---

## Common Events

Common events are global events not tied to any map. They live in the Database → Common Events tab and can be called from anywhere.

### Three Start Modes

| Mode | Behavior | When to Use |
|------|----------|-------------|
| **None** | Must be called explicitly via "Common Event" command or item/skill usage | Reusable utility routines (heal party, open shop, show tutorial) |
| **Autorun** | Runs automatically when its switch is ON; blocks input | Global cutscenes that can trigger from any map |
| **Parallel** | Runs automatically when its switch is ON; player keeps control | Global monitoring: day/night cycles, quest trackers, HUD updates |

### Calling a Common Event

```
Event Command: Common Event → [Common Event name]
```

Common events with trigger "None" can also be invoked when a **skill** or **item** is used (set in the Database under the skill/item's "Common Event" field). This is how custom menu abilities work — a "Camping" skill that triggers a common event for rest/save/cook.

---

## Parallel Events: Performance and Safety

Parallel events repeat their entire command list every frame. A careless parallel event can cause severe lag.

### Performance Rules

1. **Use Wait commands.** A `Wait: 1 frame` at the end of a parallel event gives the engine a full frame to process everything else before re-running the event. For checks that don't need frame-perfect timing, `Wait: 10 frames` or `Wait: 30 frames` is better.

2. **Use Conditional Branches to skip work.** If a parallel event only needs to act when a condition is met, wrap the expensive actions inside a Conditional Branch so the engine only evaluates the cheap condition check each frame.

```
Parallel event — Quest Tracker:

◆ Conditional Branch: Variable [Wolves Killed] ≥ 5
  ◆ Control Switches: [Quest Complete] = ON
  ◆ Erase Event    ← or disable via self switch to stop the parallel
◆ End
◆ Wait: 15 frames  ← only check once every quarter-second
```

3. **Use Labels and Jump-to-Label for loops.** Instead of letting the entire command list restart from the top, use labels to create a tight inner loop that skips initialization logic on subsequent iterations.

4. **Limit active parallel events.** On any given map, avoid having more than 3–4 parallel events running simultaneously. Each one consumes interpreter cycles.

### Important Limitation

Autorun and Parallel common events only execute when the **Map Screen** is displayed. They do **not** run during battle, in menus, or during other scenes. If you need logic during battle, use troop event pages (in the Troops tab) or plugins.

---

## Useful Event Commands

### Variables and Switches

```
Control Switches: [Switch Name] = ON/OFF
Control Self Switch: A = ON
Control Variables: [Var] = value / += / -= / *= / random(min, max)
Control Variables: [Var] = Game Data (map ID, party size, gold, etc.)
```

### Flow Control

```
Conditional Branch: Switch / Variable / Self Switch / Timer / Actor / etc.
  → (true branch)
Else
  → (false branch)
End

Loop
  → (commands repeat until Break Loop)
Break Loop
```

### Movement and Timing

```
Set Movement Route: [target] → Move Down / Turn Left / Change Speed / etc.
  → Options: Wait for Completion, Skip if Can't Move, Repeat
Wait: N frames
```

### Screen Effects

```
Fade Out Screen / Fade In Screen
Tint Screen: (R, G, B, Gray) over N frames
Flash Screen: (R, G, B, Strength) over N frames
Shake Screen: Power, Speed, Duration
```

### Transfer and Map Control

```
Transfer Player: [Map], (X, Y), Direction, Fade Type
Scroll Map: Direction, Distance, Speed
```

---

## Advanced Patterns

### Self-Disabling Autorun (One-Time Cutscene)

The most important pattern in RPG Maker. Every autorun must disable itself, or the game freezes in an infinite loop.

```
Page 1 — Trigger: Autorun, Condition: Self Switch A is OFF
  ◆ (cutscene commands)
  ◆ Control Self Switch: A = ON       ← switches to Page 2

Page 2 — Condition: Self Switch A is ON
  ◆ (empty, or a different graphic/interaction)
```

### Proximity Detection Without Parallel Events

Instead of running a parallel event to check distance, use a transparent event with **Player Touch** trigger placed on tiles around the NPC. This costs zero processing until the player steps on the trigger tile.

```
Invisible event at (NPC_X - 3, NPC_Y) — Trigger: Player Touch
  ◆ Set Movement Route: NPC → Turn Toward Player
  ◆ Show Balloon: NPC → Exclamation
```

### Chained Common Events for Modular Dialogue

Break complex dialogue trees into small common events and call them from each other:

```
Common Event: "Shop Greeting"
  ◆ Show Choices: Buy / Sell / Talk / Leave
    → Buy:  Common Event → "Shop Buy Menu"
    → Sell: Common Event → "Shop Sell Menu"
    → Talk: Common Event → "Shop Chat"
    → Leave: (end)
```

### Variable-Driven Difficulty Scaling

Use a global variable to adjust encounters dynamically:

```
Parallel Common Event — Difficulty Scaler:
  ◆ Conditional Branch: Variable [Battles Won] ≥ 20
    ◆ Control Variables: [Enemy Boost] = 150   (percent)
  ◆ Else: Conditional Branch: Variable [Battles Won] ≥ 10
    ◆ Control Variables: [Enemy Boost] = 125
  ◆ Else
    ◆ Control Variables: [Enemy Boost] = 100
  ◆ End
  ◆ Wait: 300 frames   ← only recalculate every 5 seconds
```

(The `[Enemy Boost]` variable is read by plugin-modified enemy stats or troop event pages.)

---

## Common Pitfalls

1. **Autorun without self-disable** — the game locks up because the autorun restarts infinitely. Always flip a switch or self switch on the last line.
2. **Parallel events without Wait** — runs 60 times per second with full command processing. Even a `Wait: 1` helps. Longer waits are better when frame-precision isn't needed.
3. **Too many parallel events on one map** — each parallel event gets its own interpreter instance. More than 4–5 active parallels can cause noticeable lag, especially on mobile.
4. **Forgetting page evaluation order** — pages are checked highest-to-lowest. If page 3's conditions are met, pages 2 and 1 are ignored entirely. Plan your conditions so they're mutually exclusive or properly ordered.
5. **Using Autorun for background monitoring** — Autorun blocks the player. Use Parallel for anything that should run while the player is free to move.
6. **Common events expecting battle-time execution** — Autorun/Parallel common events only run on the Map scene. For battle logic, use Troop event pages or Battle Processing commands.
