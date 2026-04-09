# Verse Programming Language

> **Category:** guide · **Engine:** Unreal Engine · **Related:** [G15 Blueprint & C++ Workflow](G15_blueprint_cpp_workflow.md), [G1 Gameplay Framework](G1_gameplay_framework.md), [G13 Gameplay Ability System](G13_gameplay_ability_system.md)

Verse is a new programming language developed by Epic Games for use in Unreal Editor for Fortnite (UEFN) and, eventually, as a first-class scripting language in Unreal Engine itself. Designed by a team including Simon Peyton Jones (co-creator of Haskell) and Tim Sweeney, Verse is a **functional-logic** language with built-in concurrency, transactional memory, and a strong type system. It represents Epic's vision for a safer, more expressive alternative to C++ and Blueprints for gameplay programming.

---

## Why Verse?

Verse addresses several long-standing pain points in game scripting:

- **Memory safety** — No raw pointers, null dereference panics, or buffer overflows
- **Determinism** — Given the same code and data, results are always identical (critical for networking and replays)
- **Concurrency** — Language-level async/concurrent constructs instead of callback hell or manual thread management
- **Transactional rollback** — Failed operations undo their effects automatically, preventing partial state corruption
- **Gradual typing** — Start with dynamic flexibility, add type annotations for performance and safety as code matures

## Language Fundamentals

### Variables and Types

Verse uses `var` for mutable bindings and plain identifiers for immutable ones. Data is **immutable by default**.

```verse
# Immutable binding
PlayerName : string = "Hero"

# Mutable variable
var Health : int = 100
set Health = Health - 10

# Option type (Verse's answer to null safety)
MaybeTarget : ?player = FindClosestPlayer()
if (Target := MaybeTarget):
    # Target is unwrapped and available here
    DamagePlayer(Target, 25)
```

### Core Types

| Type | Description | Example |
|------|-------------|---------|
| `int` | 64-bit integer | `42` |
| `float` | 64-bit floating point | `3.14` |
| `string` | Text | `"Hello"` |
| `logic` | Boolean (true/false) | `true` |
| `?T` | Option type (T or empty) | `?player` |
| `[]T` | Array | `[]int` |
| `[key]value` | Map | `[string]int` |
| `tuple(T1, T2)` | Tuple | `tuple(int, string)` |

### Functions and Effects

Functions in Verse declare their **effects** — what side effects they may produce. This is central to the language's safety model.

```verse
# Pure function (no effects)
Add(X : int, Y : int) : int =
    X + Y

# Function that can fail (failable context)
FindPlayer(Name : string)<decides><transacts> : player =
    for (P : AllPlayers):
        if (P.Name = Name):
            return P
    # If no match, the function fails and its transaction rolls back

# Async function (can suspend)
PatrolRoute(Guard : npc)<suspends> : void =
    loop:
        Guard.MoveTo(WaypointA)
        Sleep(2.0)
        Guard.MoveTo(WaypointB)
        Sleep(2.0)
```

### Effect Specifiers

| Effect | Meaning |
|--------|---------|
| `<decides>` | Function may fail (failable context); failure rolls back the transaction |
| `<transacts>` | Function participates in a transaction; mutations are undone on failure |
| `<suspends>` | Function can pause execution and resume later (async/coroutine) |
| `<no_rollback>` | Function has irreversible side effects (e.g., I/O, logging) |
| `<converges>` | Function is guaranteed to terminate |
| `<varies>` | Function may return different results for same inputs (non-deterministic) |

## Concurrency Model

Verse provides structured concurrency at the language level — no threads, no locks, no data races.

### `sync` — Wait for All

Runs multiple async expressions concurrently and waits for **all** to complete:

```verse
# Both animations play simultaneously; execution continues when both finish
sync:
    PlayAnimation(Character, "Wave")
    PlaySound(WaveSound)
```

### `race` — Wait for First

Runs multiple async expressions and completes when the **first** one finishes. Others are cancelled and their effects rolled back:

```verse
# Player must reach the goal OR time runs out
Winner := race:
    block:
        Player.ReachGoal(GoalLocation)
        "player"
    block:
        Sleep(30.0)
        "timer"

if (Winner = "timer"):
    ShowMessage("Time's up!")
```

### `branch` — Fire and Forget

Starts async expressions without waiting for them:

```verse
# Start background music, continue immediately
branch:
    PlayBackgroundMusic(AmbientTrack)
# This line runs immediately, doesn't wait for music
SpawnEnemies()
```

### `rush` — Wait for First, Let Others Finish

Like `race`, but non-winning expressions continue running in the background instead of being cancelled.

## Transactional Memory

All Verse code runs within a transaction. If a `<decides>` function fails, its transaction aborts and all mutations within it are rolled back:

```verse
# Try to spend currency — if insufficient, nothing happens
TryPurchase(Player : player, Cost : int)<decides><transacts> : void =
    if (Player.Gold >= Cost):
        set Player.Gold = Player.Gold - Cost
    else:
        # Failure here rolls back ANY changes made in this transaction
        false  # explicit failure
```

This eliminates an entire class of bugs where partial state changes leave the game in an inconsistent state.

## Classes and Interfaces

```verse
# Class definition
player_character := class:
    Name : string
    var Health : int = 100
    var Inventory : []item = array{}
    
    # Method
    TakeDamage(Amount : int) : void =
        set Health = Max(Health - Amount, 0)
        if (Health = 0):
            OnDeath()
    
    OnDeath() : void =
        Print("Game Over")

# Interface
damageable := interface:
    TakeDamage(Amount : int) : void

# Implementation
player_character := class(damageable):
    # ... TakeDamage satisfies the interface
```

## UEFN Integration

Verse is currently the primary programming language for UEFN (Unreal Editor for Fortnite). Key integration points:

### Devices

UEFN gameplay is built around **Devices** — Verse classes that act as level-placed actors:

```verse
using { /Fortnite.com/Devices }
using { /Verse.org/Simulation }

my_game_device := class(creative_device):
    @editable  # Exposed to the UEFN editor
    ScoreToWin : int = 10
    
    @editable
    SpawnPoint : player_spawner_device = player_spawner_device{}
    
    OnBegin<override>()<suspends> : void =
        # Game logic starts here
        Print("Game started! First to {ScoreToWin} wins.")
```

### UEFN API Modules

| Module | Purpose |
|--------|---------|
| `/Fortnite.com/Devices` | Device base classes, spawners, triggers |
| `/Fortnite.com/Characters` | Player character access, movement |
| `/Fortnite.com/UI` | HUD elements, messages, menus |
| `/Fortnite.com/Game` | Game state, rounds, scoring |
| `/Verse.org/Simulation` | Core simulation (Sleep, events, time) |
| `/Verse.org/Random` | Deterministic random number generation |

### 2026 Updates (UEFN v39.50+)

- **Physics APIs** in Verse for manipulating physics objects and creating dynamic puzzles
- **In-Island Transactions** for publishing and selling in-game items
- **Mobile Preview** for testing islands on Android/iOS
- **Expanded monetization tools** for creators

## Verse vs. C++ vs. Blueprints

| Feature | C++ | Blueprints | Verse |
|---------|-----|------------|-------|
| Performance | Highest | Lower (VM overhead) | Good (compiled, JIT planned) |
| Memory safety | Manual | Automatic (GC) | Automatic (ownership + GC) |
| Concurrency | Manual threads | Latent actions | Language-level (`sync`, `race`) |
| Null safety | Weak (`nullptr`) | Moderate | Strong (option types) |
| Learning curve | Steep | Visual, approachable | Moderate (new paradigm) |
| Hot reload | Limited | Full | Full in UEFN |
| Engine integration | Full | Full | UEFN only (currently) |

## Roadmap: Verse in Unreal Engine

Epic has stated that Verse will eventually be available in mainline Unreal Engine (not just UEFN). The convergence plan includes:

1. **Current** — Verse is UEFN-only with a curated API surface
2. **Near-term** — Verse gains access to more engine subsystems (physics, AI, rendering hooks)
3. **Long-term (UE6)** — Verse as a first-class language alongside C++ and Blueprints, with full engine API access

Epic has also been working on bringing **Verse's transactional memory semantics to C++**, suggesting deep language-level integration between the two.

## Best Practices

1. **Prefer immutability** — Use `var` only when mutation is necessary; immutable data is automatically thread-safe
2. **Use effect specifiers honestly** — Don't suppress `<decides>` to avoid dealing with failure; embrace the rollback model
3. **Structure concurrency** — Use `sync`/`race` over manual state tracking; they're safer and more readable
4. **Keep transactions small** — Large transactions that touch many objects are expensive to roll back
5. **Type early** — Adding type annotations helps the compiler generate better code and catch bugs
6. **Use `@editable` liberally** — Expose tuning parameters to the UEFN editor for rapid iteration

## Common Pitfalls

- **Forgetting `<suspends>`** — Calling `Sleep()` or `MoveTo()` without the suspends effect on your function signature causes a compile error
- **Infinite loops without suspension** — A `loop:` without any `Sleep()` or awaitable call will freeze the game; always include a suspension point
- **Option type confusion** — `?T` requires explicit unwrapping; you cannot use an optional value directly
- **Transaction scope** — Mutations inside a `<transacts>` function are rolled back on failure, which is usually what you want, but be aware when mixing with `<no_rollback>` effects

## Further Reading

- [Epic Official: Programming with Verse in UEFN](https://dev.epicgames.com/documentation/en-us/fortnite/programming-with-verse-in-unreal-editor-for-fortnite)
- [Epic Tech Blog: Bringing Verse Transactional Memory Semantics to C++](https://www.unrealengine.com/en-US/tech-blog/bringing-verse-transactional-memory-semantics-to-c)
- [Wikipedia: Verse Programming Language](https://en.wikipedia.org/wiki/Verse_(programming_language))
- [GitHub: UnrealVerse — Community Resources](https://github.com/VerseMetaVerse/UnrealVerse)
