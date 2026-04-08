# Dialogue & Narrative Systems — Theory & Concepts

This document covers engine-agnostic dialogue and narrative system design theory. For engine-specific implementations, see [G9 UI & Control Systems § Dialogue (Godot)](../../godot-arch/guides/G9_ui_control_systems.md) or the relevant engine module.

---

## Table of Contents

1. [Dialogue Architecture Overview](#dialogue-architecture-overview)
2. [Data Formats & Authoring](#data-formats--authoring)
3. [Linear Dialogue](#linear-dialogue)
4. [Branching Dialogue Trees](#branching-dialogue-trees)
5. [Graph-Based Dialogue](#graph-based-dialogue)
6. [Ink, Yarn & Domain-Specific Languages](#ink-yarn--domain-specific-languages)
7. [Conditional Logic & World State](#conditional-logic--world-state)
8. [Character & Speaker Systems](#character--speaker-systems)
9. [Typewriter & Text Presentation](#typewriter--text-presentation)
10. [Rich Text & Inline Effects](#rich-text--inline-effects)
11. [Voice Acting & Audio Integration](#voice-acting--audio-integration)
12. [Choice Systems & Consequence Tracking](#choice-systems--consequence-tracking)
13. [Relationship & Affinity Systems](#relationship--affinity-systems)
14. [Journal, Quest Log & Narrative State](#journal-quest-log--narrative-state)
15. [Barks, Ambient Dialogue & Context Lines](#barks-ambient-dialogue--context-lines)
16. [Cutscenes & Scripted Sequences](#cutscenes--scripted-sequences)
17. [Localization Considerations](#localization-considerations)
18. [Performance & Memory](#performance--memory)
19. [Anti-Patterns](#anti-patterns)
20. [Architecture Decision Framework](#architecture-decision-framework)

---

## Dialogue Architecture Overview

Dialogue systems sit at the intersection of **UI**, **game state**, **audio**, and **narrative design**. A well-architected dialogue system separates these concerns so writers can author content without touching code, and programmers can change presentation without breaking stories.

### The Three-Layer Model

```
┌─────────────────────────────┐
│    Presentation Layer       │  ← UI: typewriter, portraits, choice buttons
├─────────────────────────────┤
│    Runtime Layer            │  ← Logic: node traversal, condition eval, state mutation
├─────────────────────────────┤
│    Data Layer               │  ← Content: dialogue text, trees, metadata, localization keys
└─────────────────────────────┘
```

**Data Layer** stores raw content — dialogue lines, speaker IDs, branching conditions, localization keys. It knows nothing about how dialogue is displayed or which engine runs it.

**Runtime Layer** manages traversal. It reads the current node, evaluates conditions, advances to the next node, fires events (quest triggers, relationship changes, item grants), and exposes the current state to the presentation layer.

**Presentation Layer** handles rendering — typewriter text reveal, character portraits, name labels, choice buttons, voice playback, camera cuts. It reads from the runtime but never mutates narrative state directly.

### Why Separation Matters

| Concern | Bad (coupled) | Good (layered) |
|---------|---------------|-----------------|
| Adding a new line | Edit code, recompile | Edit data file, hot-reload |
| Changing typewriter speed | Modify dialogue logic | Tweak presentation config |
| Localizing to Japanese | Find hardcoded strings | Swap localization table |
| Testing a branch | Play through entire game | Unit test the runtime |
| Adding voice acting | Refactor dialogue system | Add audio IDs to data |

---

## Data Formats & Authoring

### Choosing a Format

| Format | Strengths | Weaknesses | Best For |
|--------|-----------|------------|----------|
| **JSON** | Universal, parsable everywhere | Verbose, hard for writers to edit | Programmatic generation, simple games |
| **YAML** | Human-readable, less noise | Indentation-sensitive, slow parsing | Small/mid projects with dev-writers |
| **CSV/TSV** | Spreadsheet-friendly, batch editing | No nesting, limited metadata | Linear dialogue, localization pipelines |
| **Custom DSL** | Writer-friendly, compact | Needs a parser, learning curve | Large narrative games |
| **Ink/Yarn** | Purpose-built, proven, visual editors | Runtime dependency, format lock-in | Story-heavy games |
| **Database (SQLite)** | Queryable, handles 10K+ lines | Overkill for small games, tooling needed | Massive RPGs, MMOs |

### Data Node Structure

A minimal dialogue node contains:

```
DialogueNode:
    id: string              // Unique identifier
    speaker: string         // Character ID (not display name — resolved at runtime)
    text: string            // Localization key or raw text
    next: string | null     // Next node ID (null = end of conversation)
    choices: Choice[]       // Empty for non-branching lines
    conditions: Condition[] // Prerequisites to reach this node
    effects: Effect[]       // State changes when this node is visited

Choice:
    text: string            // What the player sees
    next: string            // Target node ID
    conditions: Condition[] // When this choice is available
    effects: Effect[]       // State changes when chosen

Condition:
    type: string            // "has_item", "flag_set", "reputation_gte", etc.
    params: any             // Condition-specific parameters

Effect:
    type: string            // "set_flag", "add_item", "change_reputation", etc.
    params: any             // Effect-specific parameters
```

### Authoring Workflow

```
Writer (narrative design)
    → Writes in Ink / Yarn / spreadsheet / custom editor
    → Exports to intermediate format (JSON/binary)

Programmer (runtime)
    → Loads intermediate format
    → Builds runtime graph
    → Connects to game systems (inventory, quests, reputation)

Artist (presentation)
    → Creates portraits, expressions, UI themes
    → Tags match speaker IDs + emotion metadata

Audio (voice)
    → Records lines keyed by node ID
    → Audio IDs mapped in data layer
```

The key principle: **writers should never need to open the game engine or IDE**. Their authoring tool produces data that the runtime consumes.

---

## Linear Dialogue

The simplest dialogue form — a sequence of lines with no branches. Common in tutorials, NPC barks, item descriptions, and story beats that don't need player input.

### Structure

```
LinearDialogue:
    lines: DialogueLine[]
    currentIndex: int = 0

DialogueLine:
    speaker: string
    text: string
    emotion: string         // "happy", "angry", "neutral" — drives portrait selection
    duration: float | null  // Auto-advance after N seconds (null = wait for input)
    audio: string | null    // Voice clip ID
```

### Advancement Logic

```
function advance():
    currentIndex += 1
    if currentIndex >= lines.length:
        emit signal "dialogue_finished"
        return null
    return lines[currentIndex]
```

### Skip and Fast-Forward

Players expect two interaction levels:
1. **Tap once** → complete the current typewriter reveal instantly
2. **Tap again** → advance to next line

```
function on_input():
    if typewriter_is_revealing:
        complete_typewriter()          // Show full text immediately
    else:
        advance()                      // Move to next line
```

**Auto-advance** (for voiced dialogue): start a timer equal to `voice_clip_duration + 0.5s` padding. Cancel the timer if the player taps. Never auto-advance unvoiced text unless explicitly designed (cutscenes).

---

## Branching Dialogue Trees

Trees add player agency through choices. Each node can have zero or more choices, each leading to a different node.

### Tree Structure

```
         [Greeting]
         /        \
    [Friendly]  [Hostile]
       |            |
   [Quest]      [Fight]
       |            |
    [Accept]     [Flee]
      /   \         |
  [Yes]  [No]   [End]
```

### Choice Filtering

Not all choices should always be visible. Filter by:

```
function get_available_choices(node, game_state):
    available = []
    for choice in node.choices:
        if all_conditions_met(choice.conditions, game_state):
            available.append(choice)
    return available
```

**Design decision — hidden vs. grayed-out choices:**

| Approach | Pros | Cons |
|----------|------|------|
| **Hide unavailable** | Cleaner UI, no spoilers | Player doesn't know choices exist |
| **Gray out** | Player sees what they're missing, motivates replay | Spoils content, clutters UI |
| **Show with requirement** | "[Requires: Lockpick 5]" — clear progression | Breaks immersion for some genres |

RPGs typically gray out or show requirements. Visual novels typically hide. Horror games always hide (tension depends on not knowing what you missed).

### Tree Depth and Combinatorial Explosion

A tree with 3 choices per node and 5 levels deep has 3⁵ = 243 leaf nodes. Real games manage this with:

1. **Funneling** — branches reconverge at key story beats (hub nodes)
2. **Shared subtrees** — multiple branches lead to the same node (graph, not tree)
3. **Flag-based variation** — same node, different text based on prior choices
4. **Procedural responses** — template-based text that incorporates state ("You have {item_count} potions")

The practical limit for hand-authored content is typically 2-3 meaningful choices per exchange, with reconvergence every 3-5 nodes.

---

## Graph-Based Dialogue

Real dialogue systems are **directed graphs**, not trees. Nodes can be revisited, branches can merge, and cycles are intentional (e.g., a shopkeeper you return to).

### Graph Properties

```
DialogueGraph:
    nodes: Map<string, DialogueNode>
    entry_points: Map<string, string>  // "greet_first_time", "greet_returning", etc.
    
function get_entry_point(npc_id, game_state):
    if game_state.has_flag("quest_complete_" + npc_id):
        return entry_points["post_quest"]
    elif game_state.get("times_talked_" + npc_id) > 0:
        return entry_points["returning"]
    else:
        return entry_points["first_meeting"]
```

### Hub-and-Spoke Pattern

The most common dialogue graph pattern — a central hub node with topic spokes:

```
           ┌── [About the quest] ──┐
           │                        │
[Hub] ─────┼── [Buy / Sell]     ───┤
           │                        │
           ├── [Rumors]         ───┤
           │                        │
           └── [Goodbye]        ───┘
```

After completing a spoke, the player returns to the hub. Spokes can be conditionally available:
- "About the quest" only appears if the quest is active
- "Rumors" disappears after all rumors are exhausted
- New spokes unlock based on game progression

### Visited-Node Tracking

Track which nodes the player has seen to:
- Show "new" indicators on unvisited topics
- Change NPC greetings ("As I was saying..." vs. first-time intro)
- Exhaust dialogue (mark topic as "read" to remove from hub)
- Prevent repeated rewards (only grant item on first visit)

```
DialogueState:
    visited_nodes: Set<string>
    
function visit_node(node_id):
    visited_nodes.add(node_id)
    // Effects only fire on FIRST visit unless flagged as repeatable
    if node_id not in visited_nodes:
        execute_effects(node.effects)
```

---

## Ink, Yarn & Domain-Specific Languages

Purpose-built dialogue languages solve the writer-programmer divide by providing syntax that reads like a script but compiles to executable dialogue logic.

### Ink (Inkle)

Ink is the most battle-tested dialogue DSL (used in 80 Days, Heaven's Vault, Sable). It handles branching, state, conditional text, and dynamic content in a markup that writers can learn in an afternoon.

```ink
=== greet_merchant ===
The merchant looks up from her wares.

* [Browse weapons]
    She gestures to the rack. "Fine steel, friend."
    -> browse_weapons
* [Ask about the road ahead]
    "Dangerous," she says, shaking her head. "Bandits near the pass."
    ~ heard_about_bandits = true
    -> hub
* {has_quest_item} [Show the amulet]
    Her eyes widen. "Where did you find that?"
    -> amulet_reaction
* [Leave]
    -> END
```

**Key Ink features:**
- `*` = one-time choice (disappears after selection)
- `+` = sticky choice (always available)
- `{ condition }` = conditional content
- `~ variable = value` = state mutation
- `-> label` = divert (goto)
- **Tunnels** (`->->`) for reusable sub-conversations
- **Threads** for parallel narrative tracking

**Runtime integration:** Ink compiles to JSON. The `ink-runtime` library (C#, JavaScript, C++) evaluates it. Your game provides external functions for game-specific logic:

```
// Game registers external functions
story.BindExternalFunction("has_item", (string itemId) => 
    inventory.Contains(itemId));
story.BindExternalFunction("give_item", (string itemId) =>
    inventory.Add(itemId));
```

### Yarn Spinner

Yarn Spinner is Ink's main competitor, designed specifically for Unity but now engine-agnostic. Used in Night in the Woods, A Short Hike, Dredge.

```yarn
title: MerchantGreet
---
Merchant: Welcome, traveler!
-> BrowseWeapons
-> AskAboutRoad
-> Leave

<<if $has_quest_item>>
-> ShowAmulet
<<endif>>
===

title: AskAboutRoad
---
Merchant: Dangerous out there. Bandits near the pass.
<<set $heard_about_bandits to true>>
-> MerchantGreet
===
```

**Key differences from Ink:**
- Node-based (each `title:` block is a node) vs. Ink's weave-based flow
- `<<commands>>` for logic vs. Ink's `~ statements`
- Better visual editor support (Yarn Spinner Editor)
- Markup for inline styling `[wave]scary text[/wave]`

### Choosing Between Them

| Factor | Ink | Yarn Spinner |
|--------|-----|-------------|
| Writer complexity | Lower (reads like prose) | Moderate (node-based) |
| State management | Built-in variables, robust | Built-in, slightly simpler |
| Visual editor | Inky (basic) | Yarn Editor (node graph) |
| Engine support | C#, JS, C++, Rust, Go | Unity-first, C# runtime available |
| Game scale | Small → massive (proven at scale) | Small → large |
| Localization | Built-in string table support | Built-in localization system |
| Community | Mature, large | Active, Unity-focused |

### Custom DSL Justification

Build your own only if:
1. You need features neither Ink nor Yarn support (rare)
2. Your game has unique narrative mechanics (time loops, parallel realities)
3. You need byte-level control over the binary format (console memory constraints)
4. Your team has the engineering bandwidth to maintain a parser + editor

For 90%+ of games, Ink or Yarn Spinner is the correct choice. The engineering cost of a custom DSL is 2-6 months of work that doesn't ship gameplay.

---

## Conditional Logic & World State

Dialogue becomes interesting when it responds to what the player has done. A condition system evaluates game state to determine which nodes, choices, and text variations are available.

### Condition Types

| Type | Example | Checks |
|------|---------|--------|
| **Flag** | "rescued_princess" | Boolean true/false |
| **Counter** | "times_visited >= 3" | Integer comparison |
| **Item** | "has_item(key_of_shadows)" | Inventory check |
| **Stat** | "charisma >= 15" | Character attribute |
| **Reputation** | "faction_trust(merchants) > 50" | Relationship value |
| **Quest** | "quest_state(dragon_slayer) == active" | Quest progress |
| **Time** | "hour >= 18" | In-game clock |
| **Random** | "random(0.0, 1.0) < 0.3" | Probability |
| **Composite** | "has_item(key) AND reputation >= 50" | Combined conditions |

### State Store Architecture

```
NarrativeState:
    flags: Map<string, bool>
    counters: Map<string, int>
    variables: Map<string, any>
    
function evaluate(condition):
    match condition.type:
        "flag":     return flags.get(condition.key, false) == condition.value
        "counter":  return compare(counters.get(condition.key, 0), condition.op, condition.value)
        "item":     return inventory_system.has(condition.item_id, condition.quantity)
        "stat":     return compare(character.get_stat(condition.stat), condition.op, condition.value)
        "and":      return all(evaluate(c) for c in condition.children)
        "or":       return any(evaluate(c) for c in condition.children)
        "not":      return not evaluate(condition.child)
```

### Priority-Based Node Selection

When multiple entry points or text variations match, use priority ordering:

```
// Higher priority = more specific = preferred
NodeVariant:
    conditions: Condition[]
    priority: int           // 0 = default fallback, higher = more specific
    text: string

function select_variant(variants, game_state):
    matching = [v for v in variants if evaluate_all(v.conditions, game_state)]
    matching.sort(by: priority, descending)
    return matching[0] if matching else default_variant
```

This pattern is used in Bethesda games — NPCs have dozens of greeting variants, and the one with the most specific matching conditions wins.

---

## Character & Speaker Systems

### Character Definition

```
CharacterProfile:
    id: string              // "merchant_elena" — unique, stable
    display_name: string    // Localization key → "Elena" / "エレナ"
    portraits: Map<string, Image>  // emotion → portrait ("happy", "angry", "neutral")
    voice_id: string        // TTS voice or voice actor ID
    text_color: Color       // Per-character dialogue text tint (optional)
    text_speed: float       // Character-specific typewriter speed (fast-talker, slow sage)
    name_color: Color       // Name label color
    sound_effect: string    // Per-character "blip" sound for unvoiced text
```

### Expression System

Expressions (emotions) drive portrait selection and can affect text presentation:

```
DialogueLine:
    speaker: "merchant_elena"
    emotion: "worried"         // → selects worried portrait
    text: "The bandits are getting bolder."
    
// Runtime resolves:
portrait = characters[line.speaker].portraits[line.emotion]
// Fallback chain: exact emotion → "neutral" → first available → no portrait
```

**Expression count guidelines:**
- Minor NPCs: 1-2 (neutral, talking)
- Important NPCs: 4-6 (neutral, happy, sad, angry, surprised, thinking)
- Main characters: 8-12+ (add subtle variants — smirk vs. smile, annoyed vs. angry)

### Name Display Patterns

| Pattern | Example | Use Case |
|---------|---------|----------|
| **Always shown** | "Elena: Hello!" | RPGs, visual novels |
| **Hidden until learned** | "???: Hello!" → "Elena: Hello!" | Mystery, reveal moments |
| **Title-based** | "The Merchant: Hello!" → "Elena: Hello!" | Progressive familiarity |
| **No names** | Just text + portrait | Atmospheric, horror |
| **Color-coded** | Different text colors per speaker | Fast-paced scenes, group conversations |

---

## Typewriter & Text Presentation

The typewriter effect reveals text character-by-character. It's the single most impactful presentation technique for dialogue — it controls pacing, builds tension, and gives dialogue a sense of being "spoken."

### Core Implementation

```
TypewriterState:
    full_text: string
    visible_count: int = 0
    chars_per_second: float = 30.0
    accumulator: float = 0.0
    is_complete: bool = false
    paused: bool = false

function update(delta):
    if is_complete or paused:
        return
    
    accumulator += delta * chars_per_second
    while accumulator >= 1.0:
        accumulator -= 1.0
        visible_count += 1
        
        if visible_count >= full_text.length:
            is_complete = true
            emit "typewriter_finished"
            return
        
        char = full_text[visible_count - 1]
        process_character(char)

function process_character(char):
    // Punctuation pausing — critical for natural rhythm
    match char:
        '.', '!', '?':  pause(0.25)    // End of sentence
        ',', ';':        pause(0.10)    // Clause break
        ':':             pause(0.15)    // Introduction pause
        '—':             pause(0.20)    // Em-dash dramatic pause
        '…':             pause(0.35)    // Ellipsis (longer = more suspense)
    
    // Optional: play character sound ("blip")
    if char != ' ' and char is not punctuation:
        play_blip_sound()
```

### Punctuation Pausing

The most underrated dialogue technique. Without it, typewriter text reads at a constant speed that feels robotic. With it, text breathes:

```
Without pausing:  "Wait... is that... a dragon?!"   (constant speed, no drama)
With pausing:     "Wait[0.35]... is that[0.35]... a dragon[0.25]?!"  (dramatic reveal)
```

**Tuning table:**

| Punctuation | Pause (seconds) | Reasoning |
|-------------|-----------------|-----------|
| `,` `;` | 0.08–0.12 | Clause break, brief |
| `.` | 0.20–0.30 | Sentence end, moderate |
| `!` `?` | 0.20–0.25 | Slightly shorter than `.` (urgency) |
| `—` | 0.15–0.25 | Dramatic mid-sentence |
| `…` | 0.30–0.50 | Maximum suspense |
| `\n` | 0.15–0.20 | New paragraph, visual + temporal break |

### Speed Control

```
// Inline speed tags in dialogue text
"This is normal speed. {speed=60}This is fast!{/speed} Back to normal."

// Parse and apply:
function process_tag(tag):
    if tag.starts_with("speed="):
        chars_per_second = parse_float(tag.split("=")[1])
    if tag == "/speed":
        chars_per_second = default_speed
```

### Character-Specific Speeds

Different characters "speak" at different rates:

| Character Type | Speed (chars/sec) | Feel |
|----------------|-------------------|------|
| Excited child | 40–50 | Rapid, breathless |
| Normal NPC | 25–35 | Conversational |
| Wise elder | 15–20 | Deliberate, thoughtful |
| Villain monologue | 20–25 | Measured, menacing |
| System text | 45–60 | Efficient, not dramatic |
| Inner monologue | 20–30 | Reflective |

---

## Rich Text & Inline Effects

### Common Inline Tags

```
// Formatting
"This is [b]bold[/b] and [i]italic[/i]."
"[color=red]Danger![/color]"
"The [item=health_potion]Health Potion[/item] restored 50 HP."

// Effects
"[shake]The ground trembles![/shake]"
"[wave]Magical energy flows...[/wave]"
"[rainbow]Legendary item obtained![/rainbow]"

// Control
"[pause=0.5]"                    // Explicit pause
"[speed=60]Fast![/speed]"        // Speed change
"[event=quest_start_dragon]"     // Fire game event mid-text
"[sfx=door_creak]"              // Play sound effect mid-text
```

### Tag Processing Pipeline

```
function preprocess_text(raw_text):
    segments = []
    current_pos = 0
    
    for match in find_all_tags(raw_text):
        // Add text before this tag
        if match.start > current_pos:
            segments.append(TextSegment(raw_text[current_pos:match.start]))
        
        // Add the tag as a command
        segments.append(CommandSegment(parse_tag(match)))
        current_pos = match.end
    
    // Add remaining text
    if current_pos < raw_text.length:
        segments.append(TextSegment(raw_text[current_pos:]))
    
    return segments
```

### Text Effects Implementation

**Wave effect** — sinusoidal vertical offset per character:

```
function apply_wave(char_index, time):
    offset_y = sin(time * frequency + char_index * wave_spread) * amplitude
    return Vector2(0, offset_y)
    
// Typical values: frequency=4.0, wave_spread=0.5, amplitude=3.0 pixels
```

**Shake effect** — random offset per character, changing each frame:

```
function apply_shake(char_index, time):
    offset_x = random_range(-intensity, intensity)
    offset_y = random_range(-intensity, intensity)
    return Vector2(offset_x, offset_y)
    
// Typical: intensity=2.0 pixels
```

**Rainbow effect** — hue rotation per character:

```
function apply_rainbow(char_index, time):
    hue = (time * speed + char_index * spread) % 1.0
    return Color.from_hsv(hue, 0.8, 1.0)
    
// Typical: speed=0.5, spread=0.05
```

---

## Voice Acting & Audio Integration

### Architecture

```
VoiceManager:
    clips: Map<string, AudioClip>     // node_id → audio clip
    current_clip: AudioPlayer
    
function play_line(node_id):
    if node_id in clips:
        current_clip.play(clips[node_id])
        return clips[node_id].duration
    return null  // No voice for this line → text-only
    
function stop():
    current_clip.stop()
```

### Voice + Typewriter Sync

Two approaches:

**1. Voice drives timing** (AAA games):
```
// Typewriter speed = text_length / voice_duration
chars_per_second = full_text.length / voice_clip_duration
// Auto-advance when voice clip finishes + padding
```

**2. Independent (most game projects):**
```
// Typewriter runs at fixed speed
// Voice clip plays simultaneously
// Player can skip both independently
// Auto-advance uses max(typewriter_finish, voice_finish) + padding
```

### Unvoiced "Blip" Sounds

For unvoiced dialogue, per-character blip sounds add personality without full voice acting. Classic technique from Animal Crossing, Undertale, Celeste.

```
BlipConfig:
    sound: AudioClip          // Short blip (~50-100ms)
    pitch_base: float         // 1.0 = normal
    pitch_variance: float     // ±0.1 = slight variation
    interval: int             // Play every N characters (2-3 feels natural)
    
function on_character_revealed(char, char_index):
    if char == ' ' or is_punctuation(char):
        return
    if char_index % blip_config.interval != 0:
        return
    pitch = blip_config.pitch_base + random(-pitch_variance, pitch_variance)
    play_sound(blip_config.sound, pitch)
```

**Character voice differentiation via blips:**
- High pitch (1.3–1.5) → children, fairies, small creatures
- Normal pitch (0.9–1.1) → average NPCs
- Low pitch (0.6–0.8) → large creatures, deep voices
- Fast interval (every 1 char) → excited, nervous
- Slow interval (every 3-4 chars) → calm, wise

---

## Choice Systems & Consequence Tracking

### Choice Presentation Patterns

| Pattern | Description | Used In |
|---------|-------------|---------|
| **Explicit text** | Player sees exactly what they'll say | Most RPGs (Baldur's Gate 3) |
| **Paraphrased** | Short summary of a longer response | Mass Effect, Firewatch |
| **Tone-based** | Icon or color indicates tone, not exact words | Mass Effect wheel |
| **Timed** | Choices disappear after a countdown | Telltale, FireWatch |
| **Silent** | No choice UI — actions in the world ARE the choices | Dark Souls, Journey |
| **Hidden consequence** | Choice seems minor but matters later | Witcher 3, Disco Elysium |

### Consequence Tracking

```
ConsequenceTracker:
    choices_made: Map<string, string>       // choice_point_id → chosen_option_id
    flags: Map<string, bool>
    counters: Map<string, int>
    faction_reputation: Map<string, int>
    
function record_choice(choice_point_id, option_id, effects):
    choices_made[choice_point_id] = option_id
    for effect in effects:
        apply_effect(effect)

function apply_effect(effect):
    match effect.type:
        "set_flag":        flags[effect.key] = effect.value
        "increment":       counters[effect.key] = counters.get(effect.key, 0) + effect.amount
        "reputation":      faction_reputation[effect.faction] += effect.delta
        "give_item":       inventory.add(effect.item_id, effect.quantity)
        "remove_item":     inventory.remove(effect.item_id, effect.quantity)
        "start_quest":     quest_system.start(effect.quest_id)
        "complete_quest":  quest_system.complete(effect.quest_id)
        "play_animation":  animation_system.play(effect.target, effect.anim)
```

### The Butterfly Effect Problem

Early choices that affect late-game content create exponential authoring burden. Manage this with:

1. **Delayed consequences** — choices set flags; consequences are checked much later
2. **Cosmetic variation** — different dialogue text, same gameplay outcome
3. **Parallel paths that converge** — different routes to the same major beat
4. **Variable-driven templates** — "The {rescued_person} thanks you" where the variable was set 10 hours ago
5. **Reactive acknowledgment** — NPCs briefly reference past choices without changing the plot ("I heard you helped the merchants")

---

## Relationship & Affinity Systems

### Simple Affinity

```
Relationship:
    npc_id: string
    affinity: int = 0       // -100 to +100
    
function modify(delta):
    affinity = clamp(affinity + delta, -100, 100)
    
function get_tier():
    if affinity >= 75:  return "beloved"    // Unique quests, romance, gifts
    if affinity >= 25:  return "friendly"   // Better prices, new dialogue
    if affinity >= -25: return "neutral"    // Default behavior
    if affinity >= -75: return "hostile"    // Refuses services, warns guards
    return "enemy"                          // Attacks on sight, blocks content
```

### Multi-Axis Relationships

Simple affinity misses nuance. A character might respect you but not trust you:

```
RelationshipAxes:
    trust: int          // Will they share secrets?
    respect: int        // Do they take you seriously?
    fear: int           // Are they intimidated?
    romantic: int       // Attraction/romance meter
    
// Different dialogue checks different axes:
// "Tell me the truth" → requires trust >= 50
// "I need your help in battle" → requires respect >= 30
// "Hand over the key" → requires fear >= 60 OR trust >= 80
```

### Gift and Interaction Systems

```
GiftResponse:
    item_id: string
    npc_id: string
    affinity_delta: int
    dialogue_node: string   // Special reaction dialogue
    
GiftTable:
    responses: Map<(item_id, npc_id), GiftResponse>
    defaults: Map<string, GiftResponse>     // Per-NPC default response
    universal_default: GiftResponse         // "Thanks, I guess."
    
function give_gift(item_id, npc_id):
    response = responses.get((item_id, npc_id))
              ?? defaults.get(npc_id)
              ?? universal_default
    relationship.modify(npc_id, response.affinity_delta)
    play_dialogue(response.dialogue_node)
```

### Diminishing Returns

Prevent affinity grinding by reducing the impact of repeated actions:

```
function modified_delta(base_delta, action_type, npc_id):
    times = action_count[npc_id][action_type]
    // First 3 times: full value. Then 50%, then 25%, then 10%.
    multiplier = [1.0, 1.0, 1.0, 0.5, 0.25, 0.1][min(times, 5)]
    return floor(base_delta * multiplier)
```

---

## Journal, Quest Log & Narrative State

### Quest Data Model

```
QuestDefinition:
    id: string
    title: string               // Localization key
    description: string         // Localization key
    stages: QuestStage[]
    
QuestStage:
    id: string
    description: string         // "Find the merchant's lost cargo"
    objectives: Objective[]
    on_complete: Effect[]       // Effects when all objectives are met
    next_stage: string | null   // null = quest complete

Objective:
    id: string
    description: string         // "Collect 3 crates (0/3)"
    type: string                // "collect", "kill", "talk_to", "reach", "escort"
    target: string              // Item/NPC/location ID
    required_count: int
    current_count: int = 0
    optional: bool = false      // Optional bonus objectives
```

### Quest State Machine

```
QuestState enum:
    UNKNOWN         // Player hasn't discovered this quest
    AVAILABLE       // Prerequisites met, can be started
    ACTIVE          // In progress
    STAGE_COMPLETE  // Current stage done, advancing
    COMPLETE        // Successfully finished
    FAILED          // Failed permanently
    ABANDONED       // Player chose to drop it

Valid transitions:
    UNKNOWN → AVAILABLE (prerequisites met)
    AVAILABLE → ACTIVE (accepted by player or auto-started)
    ACTIVE → STAGE_COMPLETE → ACTIVE (stage advancement)
    ACTIVE → COMPLETE (final stage done)
    ACTIVE → FAILED (failure condition met)
    ACTIVE → ABANDONED (player choice, if allowed)
```

### Journal Entries

Separate from quests — journal entries record lore, discoveries, and world-building that isn't tied to objectives:

```
JournalEntry:
    id: string
    category: string        // "lore", "characters", "locations", "bestiary"
    title: string
    content: string         // Can be multi-page
    unlock_condition: string // How the player discovers this
    discovered: bool = false
    timestamp: int          // In-game time of discovery
```

---

## Barks, Ambient Dialogue & Context Lines

"Barks" are short, non-interactive dialogue lines that NPCs say in response to world events. They create a living world without requiring the player to initiate conversation.

### Bark Types

| Type | Trigger | Example |
|------|---------|---------|
| **Idle** | Timer, random chance | "Nice weather today." |
| **Combat** | Enter/leave combat, low health | "I'll cut you down!" |
| **React** | Player action nearby | "Watch where you're going!" |
| **Environmental** | Weather, time, location | "Brr, it's cold up here." |
| **Context** | Game state, quest progress | "The dragon has been spotted again." |
| **Group** | NPC-to-NPC interaction | "Did you hear about the merchant?" |

### Bark System Architecture

```
BarkSystem:
    bark_database: Map<string, BarkSet>
    cooldowns: Map<string, float>       // Prevent bark spam
    global_cooldown: float = 5.0        // Minimum seconds between any bark
    last_bark_time: float = 0.0
    
BarkSet:
    barks: Bark[]
    cooldown: float         // Per-set cooldown
    priority: int           // Higher = interrupts lower
    max_distance: float     // Player must be within range to hear

Bark:
    text: string
    conditions: Condition[]
    weight: float = 1.0     // Selection probability weight
    once: bool = false      // Only play once ever

function try_bark(npc, trigger_type, game_state):
    if time - last_bark_time < global_cooldown:
        return
    
    bark_set = bark_database[npc.bark_set_id]
    candidates = bark_set.barks.filter(b => 
        b.trigger == trigger_type
        and all_conditions_met(b.conditions, game_state)
        and not (b.once and b.played)
    )
    
    if candidates.empty():
        return
    
    selected = weighted_random(candidates)
    display_bark(npc, selected)
    selected.played = true
    last_bark_time = time
```

### Ambient Conversation

Two or more NPCs talking to each other without player involvement:

```
AmbientConversation:
    participants: string[]          // NPC IDs
    lines: AmbientLine[]
    trigger_area: Area              // Starts when player enters
    interruptible: bool = true      // Player can interrupt to talk to an NPC
    repeat: bool = false            // Play again if player returns

AmbientLine:
    speaker_index: int              // Index into participants array
    text: string
    delay_before: float = 0.5      // Pause before this line
    animation: string | null        // Gesture animation
```

---

## Cutscenes & Scripted Sequences

### Cutscene Architecture

Cutscenes are choreographed sequences that combine dialogue, camera work, animations, audio, and world manipulation. Two main approaches:

**1. Timeline-based** — events placed on a time axis:
```
CutsceneTimeline:
    duration: float
    tracks: Track[]
    
Track:
    target: string      // Entity ID, camera, audio bus
    keyframes: Keyframe[]
    
Keyframe:
    time: float
    action: Action      // move, rotate, play_anim, say_line, play_sfx, fade, etc.
```

**2. Sequential command list** — events fire one after another:
```
CutsceneScript:
    commands: Command[]
    
Command types:
    SAY(speaker, text)              // Show dialogue, wait for advance
    MOVE(entity, position, speed)    // Move entity, wait for arrival
    WAIT(seconds)                    // Pause
    CAMERA_PAN(target, duration)     // Move camera, wait for completion
    ANIM(entity, animation)          // Play animation
    FADE(color, duration)            // Screen fade
    SFX(sound)                       // Play sound
    MUSIC(track, fade_duration)      // Change music
    PARALLEL(commands[])             // Run multiple commands simultaneously
    BRANCH(condition, if_true, if_false)  // Conditional execution
```

### Skipping Cutscenes

Players expect cutscene skip. Implementation considerations:

```
function skip_cutscene():
    // 1. Apply all state changes that would have occurred
    for command in remaining_commands:
        if command has state_effect:
            apply_state_effect(command)
    
    // 2. Teleport entities to final positions
    for entity in cutscene_entities:
        entity.position = entity.final_cutscene_position
    
    // 3. Stop audio, reset camera
    stop_all_cutscene_audio()
    camera.reset_to_gameplay()
    
    // 4. Return control to player
    emit "cutscene_finished"
```

**Critical:** skipping must still apply all flag/state changes. If a cutscene grants an item and sets a quest flag, skipping must do both or the game breaks.

---

## Localization Considerations

### String Externalization

Never hardcode dialogue text. Every visible string should be a localization key:

```
// Bad
line.text = "Hello, traveler!"

// Good
line.text_key = "merchant_greet_001"
// At runtime: line.text = localization.get(line.text_key, current_language)
```

### Dialogue-Specific Localization Challenges

| Challenge | Problem | Solution |
|-----------|---------|----------|
| **Text length** | German is 30% longer than English | UI must handle overflow (scroll, shrink, multi-page) |
| **Name insertion** | "{player_name} saved the village" | Different languages put names in different positions |
| **Gendered text** | "He/She/They saved..." | Per-language gender agreement rules |
| **Honorifics** | Japanese uses -san, -sama, etc. | Per-language honorific system, not just name replacement |
| **Counting** | "1 item" vs "2 items" | Pluralization rules vary by language (some have 3+ plural forms) |
| **Right-to-left** | Arabic, Hebrew | Text rendering + UI layout must flip |
| **Line breaks** | Chinese/Japanese have no spaces | Word-wrap algorithm must handle CJK |
| **Voice acting** | Different recordings per language | Audio file structure mirrors localization tables |

### Localization-Friendly Data Format

```json
{
    "merchant_greet_001": {
        "en": "Welcome to my shop, {player_name}!",
        "ja": "{player_name}さん、いらっしゃいませ！",
        "de": "Willkommen in meinem Laden, {player_name}!",
        "ar": "!{player_name} أهلاً بك في متجري يا"
    }
}
```

### Translation Pipeline for Dialogue

```
1. Writers author in primary language (English)
2. Export dialogue to spreadsheet / localization platform (Crowdin, Lokalise, POEditor)
3. Translators work in context (seeing speaker, emotion, preceding line)
4. QA plays through in each language
5. Pseudolocalization testing catches layout issues before real translation
```

**Pseudolocalization** generates fake translated text that's still readable but tests edge cases:
- "Hello!" → "[Ħëľľö!!]" (accented characters, 30% longer, bracketed)
- Catches: truncated text, hardcoded strings, broken layouts, missing translations

---

## Performance & Memory

### Lazy Loading

Don't load all dialogue into memory at startup. Load by zone, chapter, or NPC:

```
DialogueManager:
    loaded_graphs: Map<string, DialogueGraph>
    
function get_graph(npc_id):
    if npc_id not in loaded_graphs:
        loaded_graphs[npc_id] = load_from_disk("dialogue/" + npc_id + ".json")
    return loaded_graphs[npc_id]

function on_zone_exit(zone_id):
    // Unload NPCs that are only in the previous zone
    for npc in zone_exclusive_npcs[zone_id]:
        loaded_graphs.remove(npc.id)
```

### String Memory

For large games (10,000+ dialogue lines):
- **Intern strings** — deduplicate identical speaker IDs, emotion tags, effect types
- **Load text on demand** — store only node structure in memory, load text when displayed
- **Stream voice audio** — never preload full voice clips, stream from disk

### Condition Evaluation Cost

Complex condition trees can be expensive if evaluated every frame. Cache results:

```
ConditionCache:
    results: Map<string, (bool, int)>   // condition_hash → (result, frame_evaluated)
    
function evaluate_cached(condition, game_state, current_frame):
    hash = condition.hash()
    if hash in results:
        cached_result, cached_frame = results[hash]
        if current_frame - cached_frame < CACHE_TTL_FRAMES:
            return cached_result
    
    result = evaluate(condition, game_state)
    results[hash] = (result, current_frame)
    return result
```

---

## Anti-Patterns

### 1. Hardcoded Dialogue in Code

```
// Wrong — impossible to localize, edit, or maintain
func talk_to_npc():
    show_text("Hello traveler!")
    show_text("Would you like to buy something?")

// Right — data-driven
func talk_to_npc(npc_id):
    graph = dialogue_manager.get_graph(npc_id)
    dialogue_runner.start(graph)
```

### 2. Monolithic Dialogue File

```
// Wrong — one massive JSON with ALL game dialogue
all_dialogue.json (50MB)

// Right — per-NPC or per-zone files
dialogue/town_square/merchant.json
dialogue/town_square/guard.json  
dialogue/forest/hermit.json
```

### 3. Presentation Logic in Data

```
// Wrong — data file contains rendering instructions
{
    "text": "Hello!",
    "font_size": 24,
    "position_x": 100,
    "animation": "slide_in"
}

// Right — data contains content, presentation reads theme/config
{
    "text": "greet_hello",
    "speaker": "merchant",
    "emotion": "happy"
}
// Presentation layer: look up font_size from theme, position from layout, animation from config
```

### 4. No Fallback for Missing Data

```
// Wrong — crash or silent failure
text = localization[key]    // KeyError if translation missing

// Right — graceful fallback chain
text = localization.get(key, current_language)
    ?? localization.get(key, "en")      // Fallback to English
    ?? "[MISSING: " + key + "]"          // Visible error for QA
```

### 5. Untestable Narrative Logic

```
// Wrong — conditions embedded in presentation code
if player.has_item("key") and npc.talked_before:
    show_dialogue("secret_entrance")

// Right — conditions in data, testable without running the game
// Unit test: evaluate(condition, mock_state) == expected_result
```

---

## Architecture Decision Framework

```
How much dialogue does your game have?
│
├─ < 50 lines (tutorial, barks only)
│   → Linear dialogue + hardcoded data (JSON/YAML)
│   → No branching system needed
│
├─ 50-500 lines (short RPG, adventure)
│   → Branching trees + JSON data
│   → Simple flag-based conditions
│   → Consider Yarn Spinner for visual editing
│
├─ 500-5,000 lines (mid-size RPG, visual novel)
│   → Graph-based dialogue (hub-and-spoke)
│   → Ink or Yarn Spinner (don't build custom)
│   → Relationship system (simple affinity)
│   → Quest log integration
│   → Localization pipeline
│
└─ 5,000+ lines (large RPG, narrative-heavy)
    → Ink or custom DSL
    → Multi-axis relationships
    → Full consequence tracking
    → Database-backed storage (SQLite)
    → Professional localization workflow
    → Voice acting pipeline
    → Cutscene system
    → Bark system for world-building

What's the player's role?
│
├─ Observer (visual novel, walking sim)
│   → Linear + branching, text-heavy
│   → Rich text effects, portraits
│   → Choice consequence = story branches
│
├─ Participant (RPG, adventure)
│   → Hub-and-spoke, quest integration
│   → Relationship system
│   → Choice consequence = gameplay + story
│
└─ Passive (action, platformer)
    → Barks + linear only
    → Minimal UI (speech bubbles)
    → No choice system needed

Voice acted?
│
├─ Full voice → Voice drives typewriter timing, skip must handle audio
├─ Partial voice → Blip sounds for unvoiced, voice clip for key scenes
└─ No voice → Typewriter + blips, fastest iteration speed
```

---

## Related Engine Guides

- [G9 UI & Control Systems § Dialogue (Godot)](../../godot-arch/guides/G9_ui_control_systems.md) — Godot dialogue display, typewriter, BBCode
- [G62 Dialogue System (MonoGame)](../../monogame-arch/guides/G62_dialogue_system.md) — MonoGame dialogue implementation
- [UI Theory](./ui-theory.md) — Screen management, data binding, input navigation
- [Audio Theory](./audio-theory.md) — Voice playback, blip sounds, spatial audio
- [Input Handling Theory](./input-handling-theory.md) — Input buffering for dialogue skip/advance
- [Scene Management Theory](./scene-management-theory.md) — Cutscene transitions, screen stacking
- [AI Theory](./ai-theory.md) — NPC behavior driving bark triggers
