# G26 — Dialogue & Narrative Systems

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#  
> **Related:** [G9 UI & Control Systems](./G9_ui_control_systems.md) · [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G11 Save/Load Systems](./G11_save_load_systems.md) · [G10 Audio Systems](./G10_audio_systems.md)

---

## What This Guide Covers

Dialogue systems connect your game's story to its mechanics. Whether you're building a visual novel, an RPG with branching quests, or an action game with brief NPC interactions, you need a way to display text, handle branching choices, track conversation state, and trigger game events from dialogue.

This guide covers building custom dialogue systems from scratch, integrating the Dialogue Manager addon (the most popular Godot dialogue tool), structuring dialogue data with custom Resources, implementing typewriter text effects, branching and conditional dialogue, localization, and connecting dialogue to game state through signals.

**Use a dialogue system when:** your game has NPC conversations, quest dialogues, tutorial messages, story sequences, or any text-based player interaction beyond simple HUD labels.

**Use an addon when:** you have more than ~20 dialogue nodes or need a visual editor. Rolling your own is fine for small games.

---

## Table of Contents

1. [Architecture Decisions](#1-architecture-decisions)
2. [Data-Driven Dialogue with Custom Resources](#2-data-driven-dialogue-with-custom-resources)
3. [Building a Minimal Dialogue System](#3-building-a-minimal-dialogue-system)
4. [Typewriter Text Effect](#4-typewriter-text-effect)
5. [Branching & Conditional Dialogue](#5-branching--conditional-dialogue)
6. [Dialogue Manager Addon](#6-dialogue-manager-addon)
7. [Connecting Dialogue to Game State](#7-connecting-dialogue-to-game-state)
8. [Portrait & Expression Systems](#8-portrait--expression-systems)
9. [Voice Acting & Audio Integration](#9-voice-acting--audio-integration)
10. [Localization](#10-localization)
11. [Quest & Journal Integration](#11-quest--journal-integration)
12. [Save/Load for Dialogue State](#12-saveload-for-dialogue-state)
13. [Performance & Best Practices](#13-performance--best-practices)
14. [Common Mistakes & Fixes](#14-common-mistakes--fixes)

---

## 1. Architecture Decisions

### Approaches Compared

| Approach | Pros | Cons | Best For |
|---|---|---|---|
| **Hardcoded** (GDScript strings) | Simple, fast to prototype | Unmaintainable at scale, no localization | Game jams, <10 lines of dialogue |
| **JSON/CSV files** | Easy to edit externally, translatable | No editor integration, error-prone | Small-medium games with external writers |
| **Custom Resources** | Type-safe, editor-inspectable, serializable | Requires upfront design | Medium games, custom tooling |
| **Dialogue Manager addon** | Visual editor, branching, conditions, built-in | Addon dependency | Any game with significant dialogue |
| **Ink/Yarn integration** | Industry-standard narrative scripting | Extra toolchain, less Godot-native | Narrative-heavy games, existing Ink/Yarn writers |

### Key Design Questions

Before building, decide:

1. **Linear or branching?** Linear is simpler. Branching needs a graph structure.
2. **Who writes dialogue?** If non-programmers, you need an editor or external format.
3. **Does dialogue affect gameplay?** If yes, you need a signal/event system.
4. **How much dialogue?** < 50 nodes → custom. > 50 → addon or visual editor.
5. **Localization needed?** Design for it early — retrofitting is painful.

---

## 2. Data-Driven Dialogue with Custom Resources

Custom Resources (G19) are ideal for dialogue data — they're type-safe, serializable, and editable in the Godot inspector.

### Dialogue Line Resource

```gdscript
# dialogue_line.gd
class_name DialogueLine
extends Resource

@export var speaker: String = ""
@export var text: String = ""
@export_multiline var text_long: String = ""  # For longer text
@export var portrait: Texture2D
@export var mood: String = "neutral"  # maps to portrait variant
@export var audio: AudioStream  # voice line or bark
@export var speed: float = 1.0  # typewriter speed multiplier
@export var choices: Array[DialogueChoice] = []
@export var next: Resource  # next DialogueLine, or null = end

func get_display_text() -> String:
    return text_long if text_long != "" else text

func has_choices() -> bool:
    return choices.size() > 0
```

### Dialogue Choice Resource

```gdscript
# dialogue_choice.gd
class_name DialogueChoice
extends Resource

@export var text: String = ""
@export var next: DialogueLine  # where this choice leads
@export var condition: String = ""  # evaluated at runtime, e.g. "has_key"
@export var set_flag: String = ""  # flag to set when chosen
@export var visible_when_locked: bool = false  # show greyed-out if condition fails
```

### Conversation Resource

```gdscript
# conversation.gd
class_name Conversation
extends Resource

@export var id: StringName = &""
@export var first_line: DialogueLine
@export var characters: Array[String] = []
@export var tags: Array[String] = []  # "main_quest", "tutorial", etc.
```

---

## 3. Building a Minimal Dialogue System

### Dialogue Box UI

```gdscript
# dialogue_box.gd
class_name DialogueBox
extends CanvasLayer

signal dialogue_finished
signal choice_made(index: int)

@onready var panel: PanelContainer = %Panel
@onready var speaker_label: Label = %SpeakerLabel
@onready var text_label: RichTextLabel = %TextLabel
@onready var choice_container: VBoxContainer = %ChoiceContainer
@onready var continue_indicator: TextureRect = %ContinueIndicator
@onready var portrait_rect: TextureRect = %PortraitRect

var _current_line: DialogueLine
var _typewriter_tween: Tween
var _text_fully_visible: bool = false

func _ready() -> void:
    panel.visible = false
    process_mode = Node.PROCESS_MODE_ALWAYS  # works during pause

func show_line(line: DialogueLine) -> void:
    _current_line = line
    panel.visible = true
    
    # Set speaker
    speaker_label.text = line.speaker
    speaker_label.visible = line.speaker != ""
    
    # Set portrait
    if line.portrait:
        portrait_rect.texture = line.portrait
        portrait_rect.visible = true
    else:
        portrait_rect.visible = false
    
    # Clear choices
    _clear_choices()
    continue_indicator.visible = false
    
    # Typewriter effect
    _start_typewriter(line.get_display_text(), line.speed)

func _start_typewriter(text: String, speed_mult: float) -> void:
    text_label.text = text
    text_label.visible_ratio = 0.0
    _text_fully_visible = false
    
    if _typewriter_tween and _typewriter_tween.is_valid():
        _typewriter_tween.kill()
    
    var char_count := text.length()
    var duration := char_count * 0.03 / speed_mult  # 0.03s per character
    
    _typewriter_tween = create_tween()
    _typewriter_tween.tween_property(text_label, "visible_ratio", 1.0, duration)
    _typewriter_tween.tween_callback(_on_typewriter_complete)

func _on_typewriter_complete() -> void:
    _text_fully_visible = true
    if _current_line.has_choices():
        _show_choices(_current_line.choices)
    else:
        continue_indicator.visible = true

func _show_choices(choices: Array[DialogueChoice]) -> void:
    for i in range(choices.size()):
        var choice := choices[i]
        var button := Button.new()
        button.text = choice.text
        button.pressed.connect(_on_choice_pressed.bind(i))
        
        # Check condition
        if choice.condition != "":
            var condition_met := _evaluate_condition(choice.condition)
            if not condition_met:
                if choice.visible_when_locked:
                    button.disabled = true
                    button.modulate = Color(1, 1, 1, 0.5)
                else:
                    continue  # hide this choice entirely
        
        choice_container.add_child(button)
    
    # Focus first enabled button
    for child in choice_container.get_children():
        if child is Button and not child.disabled:
            child.grab_focus()
            break

func _on_choice_pressed(index: int) -> void:
    choice_made.emit(index)

func _clear_choices() -> void:
    for child in choice_container.get_children():
        child.queue_free()

func _unhandled_input(event: InputEvent) -> void:
    if not panel.visible:
        return
    
    if event.is_action_pressed("ui_accept"):
        get_viewport().set_input_as_handled()
        if not _text_fully_visible:
            # Skip typewriter — show full text immediately
            if _typewriter_tween and _typewriter_tween.is_valid():
                _typewriter_tween.kill()
            text_label.visible_ratio = 1.0
            _on_typewriter_complete()
        elif not _current_line.has_choices():
            # Advance to next line
            _advance()

func _advance() -> void:
    if _current_line.next:
        show_line(_current_line.next)
    else:
        close()

func close() -> void:
    panel.visible = false
    dialogue_finished.emit()

func _evaluate_condition(condition: String) -> bool:
    # Hook into your game's flag/state system
    # Example: check a global GameState autoload
    return GameState.has_flag(condition)
```

### Dialogue Trigger (Area-based)

```gdscript
# dialogue_trigger.gd
class_name DialogueTrigger
extends Area2D

@export var conversation: Conversation
@export var one_shot: bool = false
@export var interact_prompt: String = "Talk"

var _has_triggered: bool = false
var _player_in_range: bool = false

func _ready() -> void:
    body_entered.connect(_on_body_entered)
    body_exited.connect(_on_body_exited)

func _on_body_entered(body: Node2D) -> void:
    if body.is_in_group("player"):
        _player_in_range = true
        # Show interact prompt
        InteractPrompt.show(interact_prompt)

func _on_body_exited(body: Node2D) -> void:
    if body.is_in_group("player"):
        _player_in_range = false
        InteractPrompt.hide()

func _unhandled_input(event: InputEvent) -> void:
    if _player_in_range and event.is_action_pressed("interact"):
        if one_shot and _has_triggered:
            return
        _has_triggered = true
        get_viewport().set_input_as_handled()
        start_dialogue()

func start_dialogue() -> void:
    var dialogue_box: DialogueBox = get_tree().get_first_node_in_group("dialogue_box")
    if dialogue_box and conversation:
        dialogue_box.show_line(conversation.first_line)
```

---

## 4. Typewriter Text Effect

### Advanced Typewriter with BBCode

```gdscript
# Supports [wave], [shake], [color] and other BBCode tags
# RichTextLabel handles these natively — just animate visible_characters

func _start_typewriter_advanced(text: String, speed: float) -> void:
    text_label.text = text  # BBCode parsed automatically
    text_label.visible_characters = 0
    _text_fully_visible = false
    
    var total_chars := text_label.get_total_character_count()
    _typewriter_tween = create_tween()
    _typewriter_tween.tween_method(
        _set_visible_chars, 0, total_chars,
        total_chars * 0.03 / speed
    )
    _typewriter_tween.tween_callback(_on_typewriter_complete)

func _set_visible_chars(count: int) -> void:
    text_label.visible_characters = count
```

### Inline Speed Tags

Support `[speed=0.5]slow text[/speed]` and `[pause=1.0]` with a custom parser:

```gdscript
# Parse custom tags before displaying
class_name DialogueParser

static func parse(raw_text: String) -> Array[Dictionary]:
    var segments: Array[Dictionary] = []
    var regex := RegEx.new()
    regex.compile("\\[pause=(\\d+\\.?\\d*)\\]")
    
    var last_end := 0
    for result in regex.search_all(raw_text):
        # Text before the pause
        if result.get_start() > last_end:
            segments.append({
                "type": "text",
                "content": raw_text.substr(last_end, result.get_start() - last_end)
            })
        # The pause itself
        segments.append({
            "type": "pause",
            "duration": result.get_string(1).to_float()
        })
        last_end = result.get_end()
    
    # Remaining text
    if last_end < raw_text.length():
        segments.append({
            "type": "text",
            "content": raw_text.substr(last_end)
        })
    
    return segments
```

---

## 5. Branching & Conditional Dialogue

### Graph-Based Dialogue Structure

For complex branching, model dialogue as a graph with nodes and edges:

```gdscript
# dialogue_graph.gd
class_name DialogueGraph
extends Resource

@export var nodes: Dictionary = {}  # id → DialogueNode
@export var start_node: StringName = &""

func get_node(id: StringName) -> DialogueNode:
    return nodes.get(id)

func get_start() -> DialogueNode:
    return nodes.get(start_node)
```

```gdscript
# dialogue_node.gd
class_name DialogueNode
extends Resource

enum Type { LINE, CHOICE, CONDITION, EVENT, END }

@export var id: StringName = &""
@export var type: Type = Type.LINE
@export var speaker: String = ""
@export var text: String = ""
@export var choices: Array[Dictionary] = []  # {text, next_id, condition}
@export var condition: String = ""  # for Type.CONDITION
@export var true_next: StringName = &""
@export var false_next: StringName = &""
@export var next: StringName = &""
@export var event: String = ""  # signal/method to call
```

### Condition Evaluation

```gdscript
# dialogue_evaluator.gd
class_name DialogueEvaluator

## Evaluate simple conditions against game state
## Supports: "has_key", "!has_key", "gold >= 50", "quest_stage == 3"
static func evaluate(condition: String, game_state: Dictionary) -> bool:
    if condition.is_empty():
        return true
    
    # Negation
    if condition.begins_with("!"):
        return not evaluate(condition.substr(1), game_state)
    
    # Comparison operators
    for op in [">=", "<=", "==", "!=", ">", "<"]:
        if condition.contains(op):
            var parts := condition.split(op)
            var key := parts[0].strip_edges()
            var value := parts[1].strip_edges()
            var state_value = game_state.get(key, 0)
            match op:
                ">=": return float(state_value) >= float(value)
                "<=": return float(state_value) <= float(value)
                "==": return str(state_value) == value
                "!=": return str(state_value) != value
                ">": return float(state_value) > float(value)
                "<": return float(state_value) < float(value)
    
    # Simple flag check
    return game_state.get(condition, false) == true
```

---

## 6. Dialogue Manager Addon

[Dialogue Manager](https://github.com/nathanhoad/godot_dialogue_manager) is the most popular dialogue addon for Godot 4. It provides a script-like language for writing dialogue directly in the Godot editor.

### Installation

Install via the Asset Library (search "Dialogue Manager") or download from GitHub. Enable the plugin in Project → Project Settings → Plugins.

### Dialogue File Syntax (.dialogue)

```
~ start

Nathan: Hello! Welcome to the shop.
Nathan: What can I help you with today?

- I'd like to buy something.
    Nathan: Great! Take a look around.
    => shop_menu
- Just looking.
    Nathan: No problem, let me know if you need anything.
    => end
- [if has_key] I found this key...
    Nathan: Amazing! That opens the back room.
    do set_flag("back_room_open")
    => back_room_dialogue

~ shop_menu

Nathan: Here's what I've got in stock.
do show_shop_ui()

~ back_room_dialogue

Nathan: Follow me, I'll show you what's back here.
do trigger_cutscene("back_room")

~ end

Nathan: See you later!
```

### Calling from GDScript

```gdscript
# Start a conversation
func _on_interact() -> void:
    var dialogue_resource := preload("res://dialogue/shopkeeper.dialogue")
    var dialogue_line := await DialogueManager.get_next_dialogue_line(
        dialogue_resource, "start"
    )
    _show_dialogue(dialogue_line)

# Show a dialogue line and handle advancement
func _show_dialogue(line: DialogueLine) -> void:
    if line == null:
        _close_dialogue()
        return
    
    speaker_label.text = line.character
    text_label.text = line.text
    
    # Show responses if any
    if line.responses.size() > 0:
        for i in range(line.responses.size()):
            _add_choice_button(line.responses[i].text, i)
    
    # Wait for input
    var next_line: DialogueLine
    if line.responses.size() > 0:
        var chosen_index: int = await _choice_selected
        next_line = await DialogueManager.get_next_dialogue_line(
            dialogue_resource, line.responses[chosen_index].next_id
        )
    else:
        await _advance_pressed
        next_line = await DialogueManager.get_next_dialogue_line(
            dialogue_resource, line.next_id
        )
    
    _show_dialogue(next_line)
```

### Mutations (Dialogue → Game)

Dialogue Manager supports `do` and `set` statements that call methods on registered game objects:

```
# In .dialogue file:
do GameState.add_item("health_potion", 3)
set GameState.gold += 50
do QuestManager.advance_quest("main", 2)
```

Register globals that dialogue can access:
```gdscript
# In an autoload or _ready:
DialogueManager.game_states = [GameState, QuestManager, Inventory]
```

---

## 7. Connecting Dialogue to Game State

### Signal-Based Event System

```gdscript
# dialogue_events.gd (Autoload)
class_name DialogueEventsClass
extends Node

signal flag_set(flag_name: String)
signal item_given(item_id: String, amount: int)
signal quest_updated(quest_id: String, stage: int)
signal npc_relationship_changed(npc_id: String, delta: int)

var flags: Dictionary = {}

func set_flag(flag_name: String) -> void:
    flags[flag_name] = true
    flag_set.emit(flag_name)

func has_flag(flag_name: String) -> bool:
    return flags.get(flag_name, false)

func give_item(item_id: String, amount: int = 1) -> void:
    item_given.emit(item_id, amount)

func update_quest(quest_id: String, stage: int) -> void:
    quest_updated.emit(quest_id, stage)
```

### Dialogue Triggering Game Events

```gdscript
# When a dialogue node has an "event" field:
func _process_dialogue_event(event_string: String) -> void:
    var parts := event_string.split(":", true, 1)
    var event_type := parts[0]
    var event_data := parts[1] if parts.size() > 1 else ""
    
    match event_type:
        "give_item":
            var item_parts := event_data.split(",")
            DialogueEvents.give_item(item_parts[0], int(item_parts[1]))
        "set_flag":
            DialogueEvents.set_flag(event_data)
        "start_quest":
            DialogueEvents.update_quest(event_data, 0)
        "play_sound":
            AudioManager.play_sfx(event_data)
        "camera_shake":
            CameraManager.shake(float(event_data))
```

---

## 8. Portrait & Expression Systems

### Portrait Resource

```gdscript
# character_portrait_set.gd
class_name CharacterPortraitSet
extends Resource

@export var character_name: String = ""
@export var portraits: Dictionary = {}  # mood → Texture2D

func get_portrait(mood: String = "neutral") -> Texture2D:
    if portraits.has(mood):
        return portraits[mood]
    return portraits.get("neutral", null)
```

### Expression Switching in Dialogue

```gdscript
# In dialogue data, mood is per-line:
# { speaker: "Elena", text: "What?!", mood: "surprised" }

func _update_portrait(speaker: String, mood: String) -> void:
    var portrait_set: CharacterPortraitSet = _character_portraits.get(speaker)
    if portrait_set:
        var tex := portrait_set.get_portrait(mood)
        if tex:
            portrait_rect.texture = tex
            # Animate the portrait change
            var tween := create_tween()
            portrait_rect.modulate.a = 0.0
            tween.tween_property(portrait_rect, "modulate:a", 1.0, 0.15)
```

---

## 9. Voice Acting & Audio Integration

### Per-Line Voice Clips

```gdscript
# dialogue_line.gd additions:
@export var voice_clip: AudioStream
@export var voice_locale: Dictionary = {}  # "en" → AudioStream, "ja" → AudioStream

func get_voice(locale: String = "en") -> AudioStream:
    return voice_locale.get(locale, voice_clip)
```

### Syncing Typewriter to Voice

```gdscript
func _play_voice_and_text(line: DialogueLine) -> void:
    var voice := line.get_voice(TranslationServer.get_locale())
    if voice:
        voice_player.stream = voice
        voice_player.play()
        # Match typewriter duration to voice length
        var voice_duration := voice.get_length()
        _start_typewriter(line.get_display_text(), 
            line.get_display_text().length() * 0.03 / voice_duration)
    else:
        _start_typewriter(line.get_display_text(), line.speed)
```

### Text Barks (No Full Voice Acting)

Many games use short sound clips ("barks") per character instead of full voice acting:

```gdscript
# Play a short bark sound per character reveal
var _bark_sounds: Dictionary = {
    "Elena": preload("res://audio/barks/elena_bark.wav"),
    "Guard": preload("res://audio/barks/guard_bark.wav"),
}

func _on_character_revealed(speaker: String) -> void:
    if _bark_sounds.has(speaker):
        bark_player.stream = _bark_sounds[speaker]
        bark_player.pitch_scale = randf_range(0.9, 1.1)  # slight variation
        bark_player.play()
```

---

## 10. Localization

### Using Godot's Built-In TranslationServer

Godot supports CSV and PO file translation. For dialogue, generate translation keys:

```gdscript
# Generate a stable translation key from dialogue ID
func get_translated_text(dialogue_id: String, line_id: String) -> String:
    var key := "DIALOGUE_%s_%s" % [dialogue_id, line_id]
    return tr(key)
```

### CSV Translation File

```csv
keys,en,es,ja
DIALOGUE_SHOP_001,"Hello! Welcome to the shop.","¡Hola! Bienvenido a la tienda.","いらっしゃいませ！"
DIALOGUE_SHOP_002,"What can I help you with?","¿En qué puedo ayudarte?","何をお求めですか？"
DIALOGUE_SHOP_CHOICE_BUY,"I'd like to buy something.","Quisiera comprar algo.","何か買いたいのですが。"
```

### Dialogue Manager Localization

Dialogue Manager supports localization natively. Export translations as CSV and import them via Project Settings → Localization:

```
# In .dialogue file, text is auto-keyed:
Nathan: Hello!
# Key generated: SHOPKEEPER/start/0
```

---

## 11. Quest & Journal Integration

### Quest Resource

```gdscript
# quest.gd
class_name Quest
extends Resource

@export var id: StringName = &""
@export var title: String = ""
@export var description: String = ""
@export var stages: Array[QuestStage] = []
@export var rewards: Array[Dictionary] = []

var current_stage: int = 0
var completed: bool = false

func advance() -> void:
    current_stage += 1
    if current_stage >= stages.size():
        completed = true
```

### Dialogue-Driven Quest Progression

```gdscript
# In dialogue event processing:
func _on_dialogue_event(event: String) -> void:
    if event.begins_with("quest:"):
        var parts := event.split(":")
        var quest_id := parts[1]
        var action := parts[2] if parts.size() > 2 else "advance"
        match action:
            "start":
                QuestManager.start_quest(quest_id)
            "advance":
                QuestManager.advance_quest(quest_id)
            "complete":
                QuestManager.complete_quest(quest_id)
```

---

## 12. Save/Load for Dialogue State

Dialogue state that needs persistence includes conversation flags, quest stages, NPC relationship values, and which dialogue nodes have been visited.

```gdscript
# Serializable dialogue state
func save_dialogue_state() -> Dictionary:
    return {
        "flags": DialogueEvents.flags.duplicate(),
        "visited_nodes": _visited_dialogue_nodes.duplicate(),
        "npc_relationships": _npc_relationships.duplicate(),
        "quest_states": QuestManager.serialize(),
    }

func load_dialogue_state(data: Dictionary) -> void:
    DialogueEvents.flags = data.get("flags", {})
    _visited_dialogue_nodes = data.get("visited_nodes", {})
    _npc_relationships = data.get("npc_relationships", {})
    QuestManager.deserialize(data.get("quest_states", {}))
```

### Tracking Visited Dialogue

```gdscript
var _visited: Dictionary = {}  # "conversation_id:node_id" → true

func mark_visited(conversation_id: String, node_id: String) -> void:
    _visited["%s:%s" % [conversation_id, node_id]] = true

func has_visited(conversation_id: String, node_id: String) -> bool:
    return _visited.has("%s:%s" % [conversation_id, node_id])

# Use in dialogue to show different text:
# if has_visited("shopkeeper", "intro"):
#     show "Back again? What do you need?"
# else:
#     show "Hello! Welcome to my shop!"
```

---

## 13. Performance & Best Practices

| Practice | Why |
|---|---|
| Preload dialogue resources, don't load per-interaction | Avoid frame hitches when player initiates conversation |
| Use `StringName` for dialogue IDs and flag names | Faster dictionary lookups than String |
| Pool choice buttons, don't create/free each time | Reduces GC pressure in long conversations |
| Keep dialogue box in a CanvasLayer | Unaffected by camera movement or world transforms |
| Set `process_mode = PROCESS_MODE_ALWAYS` | Dialogue works even when game tree is paused |
| Use signals, not direct references | Dialogue system stays decoupled from game systems |
| Test dialogue trees exhaustively | Branching creates exponential paths — missed branches = softlocks |

### Dialogue Tree Testing

```gdscript
# Automated test that walks all dialogue paths
func test_all_paths(graph: DialogueGraph) -> Array[String]:
    var errors: Array[String] = []
    var visited: Dictionary = {}
    _walk_node(graph, graph.start_node, visited, errors, [])
    return errors

func _walk_node(graph: DialogueGraph, id: StringName, 
        visited: Dictionary, errors: Array[String], path: Array) -> void:
    if id == &"" or id == &"end":
        return
    if visited.has(id):
        return  # already tested
    visited[id] = true
    
    var node := graph.get_node(id)
    if node == null:
        errors.append("Broken link: %s → %s" % [path, id])
        return
    
    path.append(id)
    
    match node.type:
        DialogueNode.Type.LINE:
            _walk_node(graph, node.next, visited, errors, path)
        DialogueNode.Type.CHOICE:
            for choice in node.choices:
                _walk_node(graph, choice.next_id, visited, errors, path)
        DialogueNode.Type.CONDITION:
            _walk_node(graph, node.true_next, visited, errors, path)
            _walk_node(graph, node.false_next, visited, errors, path)
```

---

## 14. Common Mistakes & Fixes

| Mistake | Problem | Fix |
|---|---|---|
| Not pausing the game during dialogue | Player moves while reading, enemies attack | Pause tree or disable player input during dialogue |
| Hardcoding dialogue in scripts | Unmaintainable, unlocalizable | Use Resources or an addon |
| No skip/fast-forward | Players replay content they've seen | Support click-to-reveal and hold-to-skip |
| Forgetting to handle dialogue end | Box stays visible after last line | Always emit `dialogue_finished`, hide the box |
| Not saving dialogue flags | Player re-does conversations after loading | Include flags in your save system (G11) |
| Choice buttons not keyboard-navigable | Controller/keyboard players can't select | Call `grab_focus()` on first choice button |
| BBCode tags in translation keys | Translators see `[color=red]` in CSV | Strip tags for translation, re-apply at display time |
| No null checks on `next` references | Crash when dialogue chain is incomplete | Always check `if line.next != null` before advancing |

---

## C# Equivalents

### Dialogue Line Resource in C#

```csharp
using Godot;

[GlobalClass]
public partial class DialogueLine : Resource
{
    [Export] public string Speaker { get; set; } = "";
    [Export] public string Text { get; set; } = "";
    [Export] public Texture2D Portrait { get; set; }
    [Export] public string Mood { get; set; } = "neutral";
    [Export] public AudioStream Audio { get; set; }
    [Export] public float Speed { get; set; } = 1.0f;
    [Export] public DialogueChoice[] Choices { get; set; } = [];
    [Export] public DialogueLine Next { get; set; }
    
    public bool HasChoices() => Choices.Length > 0;
}

[GlobalClass]
public partial class DialogueChoice : Resource
{
    [Export] public string Text { get; set; } = "";
    [Export] public DialogueLine Next { get; set; }
    [Export] public string Condition { get; set; } = "";
    [Export] public string SetFlag { get; set; } = "";
}
```

### Minimal Dialogue Box in C#

```csharp
using Godot;

public partial class DialogueBox : CanvasLayer
{
    [Signal] public delegate void DialogueFinishedEventHandler();
    [Signal] public delegate void ChoiceMadeEventHandler(int index);
    
    private PanelContainer _panel;
    private Label _speakerLabel;
    private RichTextLabel _textLabel;
    private VBoxContainer _choiceContainer;
    private Tween _typewriterTween;
    private DialogueLine _currentLine;
    private bool _textFullyVisible;
    
    public override void _Ready()
    {
        _panel = GetNode<PanelContainer>("%Panel");
        _speakerLabel = GetNode<Label>("%SpeakerLabel");
        _textLabel = GetNode<RichTextLabel>("%TextLabel");
        _choiceContainer = GetNode<VBoxContainer>("%ChoiceContainer");
        _panel.Visible = false;
        ProcessMode = ProcessModeEnum.Always;
    }
    
    public void ShowLine(DialogueLine line)
    {
        _currentLine = line;
        _panel.Visible = true;
        _speakerLabel.Text = line.Speaker;
        StartTypewriter(line.Text, line.Speed);
    }
    
    private void StartTypewriter(string text, float speedMult)
    {
        _textLabel.Text = text;
        _textLabel.VisibleRatio = 0f;
        _textFullyVisible = false;
        
        _typewriterTween?.Kill();
        float duration = text.Length * 0.03f / speedMult;
        _typewriterTween = CreateTween();
        _typewriterTween.TweenProperty(_textLabel, "visible_ratio", 1.0f, duration);
        _typewriterTween.TweenCallback(Callable.From(OnTypewriterComplete));
    }
    
    private void OnTypewriterComplete()
    {
        _textFullyVisible = true;
        // Show choices or continue indicator
    }
}
```
