# G54 — Quest & Objective Systems

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G3 Signal Architecture](./G3_signal_architecture.md) · [G11 Save/Load Systems](./G11_save_load_systems.md) · [G26 Dialogue & Narrative Systems](./G26_dialogue_narrative_systems.md) · [G53 Data-Driven Design](./G53_data_driven_design.md) · [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md)

---

## What This Guide Covers

Quest systems give players purpose — structured goals with clear objectives, progress tracking, and rewards. Under the hood, a quest system is a state machine: quests move from unavailable → available → active → completed (or failed), and objectives within them track progress via signals from gameplay events.

This guide covers modeling quests and objectives as custom Resources, building a signal-driven QuestManager AutoLoad, objective types (kill, collect, reach, talk, custom), quest chains and prerequisites, branching and optional objectives, integrating with save/load, UI notification patterns, and reward distribution.

**Use this guide when:** your game has missions, tasks, bounties, achievements, or any structured objectives that the player tracks and completes over time. The patterns here scale from a 5-quest indie game to an RPG with hundreds of quests.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Quest Data Model](#2-quest-data-model)
3. [Objective Data Model](#3-objective-data-model)
4. [QuestManager AutoLoad](#4-questmanager-autoload)
5. [Signal-Driven Progress Tracking](#5-signal-driven-progress-tracking)
6. [Quest Chains and Prerequisites](#6-quest-chains-and-prerequisites)
7. [Branching and Optional Objectives](#7-branching-and-optional-objectives)
8. [Reward Distribution](#8-reward-distribution)
9. [Save/Load Integration](#9-saveload-integration)
10. [Quest UI Patterns](#10-quest-ui-patterns)
11. [C# Examples](#11-c-examples)
12. [Common Pitfalls](#12-common-pitfalls)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  DATA LAYER (Resources — .tres files)                       │
│  ├── QuestData          ← id, name, objectives, rewards     │
│  ├── ObjectiveData      ← type, target, required count      │
│  └── RewardData         ← items, xp, currency               │
├─────────────────────────────────────────────────────────────┤
│  RUNTIME LAYER                                               │
│  ├── QuestManager (AutoLoad)                                 │
│  │   ├── Tracks active / completed / failed quests           │
│  │   ├── Routes gameplay signals to quest objectives         │
│  │   └── Emits quest_started, quest_completed, etc.          │
│  ├── QuestInstance       ← runtime state for one active quest│
│  └── ObjectiveInstance   ← runtime progress for one objective│
├─────────────────────────────────────────────────────────────┤
│  GAMEPLAY LAYER (signal sources)                             │
│  ├── Enemies emit "enemy_killed(type, position)"             │
│  ├── Inventory emits "item_collected(item_id, count)"        │
│  ├── Triggers emit "area_reached(area_id)"                   │
│  └── Dialogue emits "npc_talked(npc_id)"                     │
└─────────────────────────────────────────────────────────────┘
```

**Key principle:** Quests never poll. Gameplay systems emit signals, and the QuestManager routes those signals to the relevant objectives. This keeps quests decoupled from gameplay code — enemies don't know quests exist.

---

## 2. Quest Data Model

```gdscript
# quest_data.gd
class_name QuestData
extends Resource

enum QuestType { MAIN, SIDE, BOUNTY, DAILY }

## Unique identifier for this quest.
@export var id: StringName = &""

## Display name shown to the player.
@export var title: String = ""

## Description shown in the quest log.
@export_multiline var description: String = ""

## Quest category.
@export var quest_type: QuestType = QuestType.SIDE

## Recommended player level (for UI display).
@export var recommended_level: int = 1

## Objectives that must be completed to finish this quest.
@export var objectives: Array[ObjectiveData] = []

## Optional objectives (tracked but not required for completion).
@export var optional_objectives: Array[ObjectiveData] = []

## Rewards given on completion.
@export var rewards: Array[RewardData] = []

## Bonus rewards for completing optional objectives.
@export var bonus_rewards: Array[RewardData] = []

## Quest IDs that must be completed before this quest becomes available.
@export var prerequisites: Array[StringName] = []

## If true, this quest can be accepted again after completion.
@export var is_repeatable: bool = false

## Time limit in seconds (0 = no limit).
@export var time_limit: float = 0.0

## NPC who gives this quest (for UI / dialogue integration).
@export var quest_giver_id: StringName = &""

func is_available(completed_quests: Array[StringName]) -> bool:
	for prereq: StringName in prerequisites:
		if prereq not in completed_quests:
			return false
	return true
```

---

## 3. Objective Data Model

```gdscript
# objective_data.gd
class_name ObjectiveData
extends Resource

enum ObjectiveType {
	KILL,       ## Kill N enemies of a type.
	COLLECT,    ## Collect N items.
	REACH,      ## Enter a specific area.
	TALK,       ## Talk to an NPC.
	INTERACT,   ## Interact with an object.
	CUSTOM,     ## Arbitrary signal-based check.
}

## Unique ID within the quest.
@export var id: StringName = &""

## Human-readable description ("Kill 5 slimes").
@export var description: String = ""

## What type of objective this is.
@export var type: ObjectiveType = ObjectiveType.KILL

## Target identifier (enemy type, item id, area id, npc id).
@export var target_id: StringName = &""

## How many are required (1 for REACH/TALK).
@export var required_count: int = 1

## Whether this objective is optional (bonus).
@export var is_optional: bool = false

## Objectives that must be complete before this one activates.
## (For sequential objective ordering within a quest.)
@export var depends_on: Array[StringName] = []
```

---

## 4. QuestManager AutoLoad

The central runtime manager that owns all quest state:

```gdscript
# quest_manager.gd — register as AutoLoad
extends Node

## Signals for UI and other systems to react to.
signal quest_available(quest_data: QuestData)
signal quest_started(quest_data: QuestData)
signal quest_completed(quest_data: QuestData)
signal quest_failed(quest_data: QuestData)
signal objective_updated(quest_id: StringName, objective_id: StringName, current: int, required: int)
signal objective_completed(quest_id: StringName, objective_id: StringName)

## All quest definitions, loaded from data files.
var _quest_defs: Dictionary = {}  # StringName → QuestData

## Runtime state.
var _active_quests: Dictionary = {}     # StringName → QuestInstance
var _completed_quests: Array[StringName] = []
var _failed_quests: Array[StringName] = []

const QUEST_DATA_PATH := "res://data/quests/"

func _ready() -> void:
	_load_quest_definitions()

func _load_quest_definitions() -> void:
	var dir := DirAccess.open(QUEST_DATA_PATH)
	if dir == null:
		push_warning("QuestManager: No quest data directory at %s" % QUEST_DATA_PATH)
		return
	
	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		if file_name.ends_with(".tres"):
			var quest: QuestData = load(QUEST_DATA_PATH + file_name)
			if quest and quest.id != &"":
				_quest_defs[quest.id] = quest
		file_name = dir.get_next()
	print("QuestManager: Loaded %d quest definitions" % _quest_defs.size())

# ── Quest Lifecycle ──────────────────────────────────────────

func start_quest(quest_id: StringName) -> bool:
	if _active_quests.has(quest_id):
		push_warning("QuestManager: Quest '%s' already active" % quest_id)
		return false
	
	if quest_id in _completed_quests:
		var quest_data: QuestData = _quest_defs.get(quest_id)
		if quest_data and not quest_data.is_repeatable:
			return false
	
	var quest_data: QuestData = _quest_defs.get(quest_id)
	if quest_data == null:
		push_error("QuestManager: Unknown quest '%s'" % quest_id)
		return false
	
	if not quest_data.is_available(_completed_quests):
		push_warning("QuestManager: Prerequisites not met for '%s'" % quest_id)
		return false
	
	var instance := QuestInstance.new(quest_data)
	_active_quests[quest_id] = instance
	quest_started.emit(quest_data)
	return true

func _check_quest_completion(quest_id: StringName) -> void:
	var instance: QuestInstance = _active_quests.get(quest_id)
	if instance == null:
		return
	
	if instance.is_complete():
		_active_quests.erase(quest_id)
		_completed_quests.append(quest_id)
		quest_completed.emit(instance.quest_data)

func fail_quest(quest_id: StringName) -> void:
	if not _active_quests.has(quest_id):
		return
	var instance: QuestInstance = _active_quests[quest_id]
	_active_quests.erase(quest_id)
	_failed_quests.append(quest_id)
	quest_failed.emit(instance.quest_data)

func is_quest_active(quest_id: StringName) -> bool:
	return _active_quests.has(quest_id)

func is_quest_completed(quest_id: StringName) -> bool:
	return quest_id in _completed_quests

func get_available_quests() -> Array[QuestData]:
	var available: Array[QuestData] = []
	for quest_data: QuestData in _quest_defs.values():
		if quest_data.is_available(_completed_quests) \
			and not _active_quests.has(quest_data.id) \
			and quest_data.id not in _completed_quests:
			available.append(quest_data)
	return available

# ── Progress Reporting (called by gameplay systems) ──────────

func report_kill(enemy_type: StringName) -> void:
	_update_objectives(ObjectiveData.ObjectiveType.KILL, enemy_type)

func report_collect(item_id: StringName, count: int = 1) -> void:
	_update_objectives(ObjectiveData.ObjectiveType.COLLECT, item_id, count)

func report_area_reached(area_id: StringName) -> void:
	_update_objectives(ObjectiveData.ObjectiveType.REACH, area_id)

func report_npc_talked(npc_id: StringName) -> void:
	_update_objectives(ObjectiveData.ObjectiveType.TALK, npc_id)

func report_interaction(object_id: StringName) -> void:
	_update_objectives(ObjectiveData.ObjectiveType.INTERACT, object_id)

func report_custom(event_id: StringName) -> void:
	_update_objectives(ObjectiveData.ObjectiveType.CUSTOM, event_id)

func _update_objectives(type: ObjectiveData.ObjectiveType, target: StringName, count: int = 1) -> void:
	for quest_id: StringName in _active_quests:
		var instance: QuestInstance = _active_quests[quest_id]
		var updated := instance.update_objective(type, target, count)
		
		for obj_id: StringName in updated:
			var obj: ObjectiveInstance = instance.get_objective(obj_id)
			objective_updated.emit(quest_id, obj_id, obj.current_count, obj.data.required_count)
			
			if obj.is_complete():
				objective_completed.emit(quest_id, obj_id)
		
		_check_quest_completion(quest_id)
```

---

## 5. Signal-Driven Progress Tracking

### Runtime State Classes

```gdscript
# quest_instance.gd
class_name QuestInstance
extends RefCounted

var quest_data: QuestData
var objectives: Dictionary = {}  # StringName → ObjectiveInstance
var start_time: float

func _init(data: QuestData) -> void:
	quest_data = data
	start_time = Time.get_unix_time_from_system()
	
	# Create instances for all objectives.
	for obj_data: ObjectiveData in data.objectives:
		objectives[obj_data.id] = ObjectiveInstance.new(obj_data)
	for obj_data: ObjectiveData in data.optional_objectives:
		objectives[obj_data.id] = ObjectiveInstance.new(obj_data)

func update_objective(type: ObjectiveData.ObjectiveType, target: StringName, count: int = 1) -> Array[StringName]:
	var updated: Array[StringName] = []
	
	for obj_id: StringName in objectives:
		var obj: ObjectiveInstance = objectives[obj_id]
		if obj.is_complete():
			continue
		if not _are_dependencies_met(obj):
			continue
		if obj.data.type == type and obj.data.target_id == target:
			obj.increment(count)
			updated.append(obj_id)
	
	return updated

func is_complete() -> bool:
	# All required (non-optional) objectives must be done.
	for obj_id: StringName in objectives:
		var obj: ObjectiveInstance = objectives[obj_id]
		if not obj.data.is_optional and not obj.is_complete():
			return false
	return true

func get_objective(obj_id: StringName) -> ObjectiveInstance:
	return objectives.get(obj_id)

func _are_dependencies_met(obj: ObjectiveInstance) -> bool:
	for dep_id: StringName in obj.data.depends_on:
		var dep: ObjectiveInstance = objectives.get(dep_id)
		if dep and not dep.is_complete():
			return false
	return true
```

```gdscript
# objective_instance.gd
class_name ObjectiveInstance
extends RefCounted

var data: ObjectiveData
var current_count: int = 0

func _init(obj_data: ObjectiveData) -> void:
	data = obj_data

func increment(amount: int = 1) -> void:
	if is_complete():
		return
	current_count = mini(current_count + amount, data.required_count)

func is_complete() -> bool:
	return current_count >= data.required_count

func get_progress_ratio() -> float:
	if data.required_count <= 0:
		return 1.0
	return float(current_count) / float(data.required_count)
```

### Connecting Gameplay Events

Gameplay systems call the QuestManager's `report_*` methods. They don't need to know about quests:

```gdscript
# enemy.gd — on death
func die() -> void:
	QuestManager.report_kill(enemy_type)  # e.g., &"slime"
	# ... drop loot, play animation, etc.

# pickup.gd — when collected
func _on_collected_by(player: Node) -> void:
	QuestManager.report_collect(item_id)  # e.g., &"herb"

# quest_trigger_area.gd — Area2D the player walks into
func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		QuestManager.report_area_reached(area_id)  # e.g., &"ancient_ruins"

# npc.gd — when dialogue finishes
func _on_dialogue_finished() -> void:
	QuestManager.report_npc_talked(npc_id)  # e.g., &"elder"
```

---

## 6. Quest Chains and Prerequisites

The `prerequisites` array in `QuestData` creates chains:

```
Quest: "The Missing Herbs"  (id: &"missing_herbs", prerequisites: [])
  → Quest: "The Antidote"   (id: &"antidote", prerequisites: [&"missing_herbs"])
    → Quest: "The Plague"   (id: &"plague", prerequisites: [&"antidote"])
```

The QuestManager checks `quest_data.is_available(completed_quests)` before allowing a quest to start. NPCs can query available quests to show or hide dialogue options:

```gdscript
# npc_quest_giver.gd
func get_offered_quests() -> Array[QuestData]:
	var available := QuestManager.get_available_quests()
	var my_quests: Array[QuestData] = []
	for quest: QuestData in available:
		if quest.quest_giver_id == npc_id:
			my_quests.append(quest)
	return my_quests

func has_quest_to_offer() -> bool:
	return not get_offered_quests().is_empty()
```

Display a quest marker (!) above NPCs with available quests:

```gdscript
func _process(_delta: float) -> void:
	quest_marker.visible = has_quest_to_offer()
	turn_in_marker.visible = _has_completable_quest()

func _has_completable_quest() -> bool:
	# Check if this NPC is the giver of any active quest that's done.
	for quest_id: StringName in QuestManager._active_quests:
		var instance: QuestInstance = QuestManager._active_quests[quest_id]
		if instance.quest_data.quest_giver_id == npc_id and instance.is_complete():
			return true
	return false
```

---

## 7. Branching and Optional Objectives

### Sequential Objectives (within a quest)

Use `depends_on` to create ordering:

```
Quest: "Investigate the Ruins"
  Objective A: "Talk to the Elder"          (depends_on: [])
  Objective B: "Reach the Ancient Ruins"    (depends_on: [&"talk_elder"])
  Objective C: "Find the Artifact"          (depends_on: [&"reach_ruins"])
```

Objective B won't track progress until A is complete.

### Optional Bonus Objectives

```
Quest: "Clear the Bandit Camp"
  Required: "Kill 10 bandits"
  Required: "Defeat the Bandit Leader"
  Optional: "Free all prisoners"        (is_optional: true)
  Optional: "Don't trigger any alarms"  (is_optional: true)
```

Completing optional objectives earns bonus rewards. The quest completes when all required objectives are done, regardless of optional objectives.

### Branching Quests

For quests where player choices lead to different outcomes, use multiple quest definitions with a shared prerequisite:

```
Quest A: "The Merchant's Dilemma" → completes
  Branch 1: "Side with the Merchant"  (prereq: &"merchants_dilemma", choice flag)
  Branch 2: "Side with the Thieves"   (prereq: &"merchants_dilemma", choice flag)
```

Track the player's choice as a game state flag and start the appropriate branch quest:

```gdscript
# After dialogue choice:
func _on_choice_made(choice: String) -> void:
	QuestManager.report_custom(&"dilemma_resolved")
	match choice:
		"merchant":
			QuestManager.start_quest(&"side_with_merchant")
		"thieves":
			QuestManager.start_quest(&"side_with_thieves")
```

---

## 8. Reward Distribution

```gdscript
# reward_data.gd
class_name RewardData
extends Resource

@export var xp: int = 0
@export var currency: int = 0
@export var items: Array[RewardItem] = []

# reward_item.gd
class_name RewardItem
extends Resource

@export var item_id: StringName = &""
@export var count: int = 1
```

```gdscript
# In QuestManager or a dedicated RewardSystem:
func _distribute_rewards(quest_data: QuestData) -> void:
	for reward: RewardData in quest_data.rewards:
		_apply_reward(reward)
	
	# Check optional objective bonuses.
	var instance: QuestInstance = _active_quests.get(quest_data.id)
	if instance:
		var all_optional_done := true
		for obj_id: StringName in instance.objectives:
			var obj: ObjectiveInstance = instance.objectives[obj_id]
			if obj.data.is_optional and not obj.is_complete():
				all_optional_done = false
				break
		if all_optional_done and not quest_data.bonus_rewards.is_empty():
			for reward: RewardData in quest_data.bonus_rewards:
				_apply_reward(reward)

func _apply_reward(reward: RewardData) -> void:
	if reward.xp > 0:
		PlayerStats.add_xp(reward.xp)
	if reward.currency > 0:
		PlayerStats.add_currency(reward.currency)
	for item: RewardItem in reward.items:
		Inventory.add_item(item.item_id, item.count)
```

---

## 9. Save/Load Integration

Quest state must persist. Save the runtime state, not the data definitions:

```gdscript
# In QuestManager:
func get_save_data() -> Dictionary:
	var active_data: Dictionary = {}
	for quest_id: StringName in _active_quests:
		var instance: QuestInstance = _active_quests[quest_id]
		var obj_progress: Dictionary = {}
		for obj_id: StringName in instance.objectives:
			obj_progress[obj_id] = instance.objectives[obj_id].current_count
		active_data[quest_id] = {
			"objectives": obj_progress,
			"start_time": instance.start_time,
		}
	
	return {
		"active_quests": active_data,
		"completed_quests": _completed_quests.duplicate(),
		"failed_quests": _failed_quests.duplicate(),
	}

func load_save_data(data: Dictionary) -> void:
	_active_quests.clear()
	_completed_quests.clear()
	_failed_quests.clear()
	
	# Restore completed and failed lists.
	_completed_quests = data.get("completed_quests", [])
	_failed_quests = data.get("failed_quests", [])
	
	# Rebuild active quest instances from definitions + saved progress.
	var active_data: Dictionary = data.get("active_quests", {})
	for quest_id: StringName in active_data:
		var quest_data: QuestData = _quest_defs.get(quest_id)
		if quest_data == null:
			push_warning("QuestManager: Saved quest '%s' not found in definitions (removed?)" % quest_id)
			continue
		
		var instance := QuestInstance.new(quest_data)
		var saved: Dictionary = active_data[quest_id]
		instance.start_time = saved.get("start_time", 0.0)
		
		var obj_progress: Dictionary = saved.get("objectives", {})
		for obj_id: StringName in obj_progress:
			var obj: ObjectiveInstance = instance.objectives.get(obj_id)
			if obj:
				obj.current_count = obj_progress[obj_id]
		
		_active_quests[quest_id] = instance
```

---

## 10. Quest UI Patterns

### Quest Log Panel

```gdscript
# quest_log_ui.gd
extends Control

@onready var quest_list: VBoxContainer = $QuestList
@onready var quest_detail: RichTextLabel = $QuestDetail

var quest_entry_scene: PackedScene = preload("res://ui/quest_entry.tscn")

func _ready() -> void:
	QuestManager.quest_started.connect(_refresh)
	QuestManager.quest_completed.connect(_refresh)
	QuestManager.objective_updated.connect(func(_a, _b, _c, _d): _refresh(null))
	_refresh(null)

func _refresh(_quest_data: QuestData) -> void:
	# Clear and rebuild the list.
	for child in quest_list.get_children():
		child.queue_free()
	
	for quest_id: StringName in QuestManager._active_quests:
		var instance: QuestInstance = QuestManager._active_quests[quest_id]
		var entry: Button = quest_entry_scene.instantiate()
		entry.text = instance.quest_data.title
		entry.pressed.connect(_show_detail.bind(quest_id))
		quest_list.add_child(entry)

func _show_detail(quest_id: StringName) -> void:
	var instance: QuestInstance = QuestManager._active_quests.get(quest_id)
	if instance == null:
		return
	
	var text := "[b]%s[/b]\n\n%s\n\n[u]Objectives:[/u]\n" % [
		instance.quest_data.title,
		instance.quest_data.description
	]
	
	for obj_id: StringName in instance.objectives:
		var obj: ObjectiveInstance = instance.objectives[obj_id]
		var check := "[color=green]✓[/color]" if obj.is_complete() else "○"
		var optional_tag := " [i](optional)[/i]" if obj.data.is_optional else ""
		text += "%s %s (%d/%d)%s\n" % [
			check, obj.data.description,
			obj.current_count, obj.data.required_count,
			optional_tag
		]
	
	quest_detail.text = text
```

### HUD Objective Tracker

A minimal tracker showing the currently tracked quest's objectives:

```gdscript
# objective_tracker_ui.gd
extends VBoxContainer

var tracked_quest_id: StringName = &""

func _ready() -> void:
	QuestManager.objective_updated.connect(_on_objective_updated)
	QuestManager.quest_completed.connect(_on_quest_completed)

func track_quest(quest_id: StringName) -> void:
	tracked_quest_id = quest_id
	_rebuild()

func _on_objective_updated(quest_id: StringName, _obj_id: StringName, _current: int, _required: int) -> void:
	if quest_id == tracked_quest_id:
		_rebuild()

func _on_quest_completed(quest_data: QuestData) -> void:
	if quest_data.id == tracked_quest_id:
		tracked_quest_id = &""
		_rebuild()

func _rebuild() -> void:
	for child in get_children():
		child.queue_free()
	
	if tracked_quest_id == &"":
		return
	
	var instance: QuestInstance = QuestManager._active_quests.get(tracked_quest_id)
	if instance == null:
		return
	
	# Title label.
	var title := Label.new()
	title.text = instance.quest_data.title
	title.add_theme_font_size_override("font_size", 14)
	add_child(title)
	
	# Objective labels.
	for obj_id: StringName in instance.objectives:
		var obj: ObjectiveInstance = instance.objectives[obj_id]
		if obj.data.is_optional:
			continue  # Only show required objectives in tracker.
		var label := Label.new()
		var prefix := "✓ " if obj.is_complete() else "• "
		label.text = "%s%s (%d/%d)" % [prefix, obj.data.description, obj.current_count, obj.data.required_count]
		label.add_theme_font_size_override("font_size", 12)
		if obj.is_complete():
			label.modulate = Color(0.6, 0.6, 0.6)
		add_child(label)
```

---

## 11. C# Examples

### QuestData

```csharp
using Godot;
using Godot.Collections;

[GlobalClass]
public partial class QuestData : Resource
{
    public enum QuestType { Main, Side, Bounty, Daily }

    [Export] public StringName Id { get; set; }
    [Export] public string Title { get; set; } = "";
    [Export(PropertyHint.MultilineText)] public string Description { get; set; } = "";
    [Export] public QuestType Type { get; set; } = QuestType.Side;
    [Export] public int RecommendedLevel { get; set; } = 1;
    [Export] public Array<ObjectiveData> Objectives { get; set; } = new();
    [Export] public Array<RewardData> Rewards { get; set; } = new();
    [Export] public Array<StringName> Prerequisites { get; set; } = new();
    [Export] public bool IsRepeatable { get; set; } = false;

    public bool IsAvailable(Array<StringName> completedQuests)
    {
        foreach (var prereq in Prerequisites)
        {
            if (!completedQuests.Contains(prereq))
                return false;
        }
        return true;
    }
}
```

### QuestManager (partial)

```csharp
using Godot;
using Godot.Collections;

public partial class QuestManager : Node
{
    [Signal] public delegate void QuestStartedEventHandler(QuestData questData);
    [Signal] public delegate void QuestCompletedEventHandler(QuestData questData);
    [Signal] public delegate void ObjectiveUpdatedEventHandler(
        StringName questId, StringName objectiveId, int current, int required);

    private Dictionary<StringName, QuestData> _questDefs = new();
    private Dictionary<StringName, QuestInstance> _activeQuests = new();
    private Array<StringName> _completedQuests = new();

    public bool StartQuest(StringName questId)
    {
        if (_activeQuests.ContainsKey(questId)) return false;
        if (!_questDefs.TryGetValue(questId, out var questData)) return false;
        if (!questData.IsAvailable(_completedQuests)) return false;

        var instance = new QuestInstance(questData);
        _activeQuests[questId] = instance;
        EmitSignal(SignalName.QuestStarted, questData);
        return true;
    }

    public void ReportKill(StringName enemyType)
    {
        UpdateObjectives(ObjectiveData.ObjectiveType.Kill, enemyType);
    }

    // ... other report methods follow the same pattern
}
```

---

## 12. Common Pitfalls

### Quest progress lost on scene change

**Problem:** Active quests reset when changing scenes.
**Solution:** The QuestManager is an AutoLoad — it persists across scenes. Never store quest state in scene-local nodes.

### Objectives track progress before they're active

**Problem:** A "Kill 5 slimes" objective counts slimes killed before the quest starts.
**Solution:** Only active quests receive progress updates. The `_update_objectives` method only iterates `_active_quests`. Kills before the quest starts don't count — this is intentional and expected by players.

### Objective progress exceeds required count

**Problem:** Collecting 10 herbs when only 5 are needed shows "10/5" in the UI.
**Solution:** Clamp in `ObjectiveInstance.increment()`:

```gdscript
current_count = mini(current_count + amount, data.required_count)
```

### Removing quests from data breaks saves

**Problem:** A quest ID referenced in a save file no longer exists in the data definitions.
**Solution:** Handle missing definitions gracefully in `load_save_data()` — log a warning and skip the quest rather than crashing.

### NPC dialogue doesn't reflect quest state

**Problem:** An NPC keeps offering a quest the player already completed.
**Solution:** Always check `QuestManager.is_quest_completed(quest_id)` and `QuestManager.is_quest_active(quest_id)` in dialogue scripts before showing quest-related dialogue options.

### Timed quests don't fail when time runs out

**Problem:** Quests with `time_limit > 0` run forever.
**Solution:** Check elapsed time in the QuestManager's `_process`:

```gdscript
func _process(_delta: float) -> void:
	var current_time := Time.get_unix_time_from_system()
	for quest_id: StringName in _active_quests.keys():
		var instance: QuestInstance = _active_quests[quest_id]
		if instance.quest_data.time_limit > 0.0:
			var elapsed := current_time - instance.start_time
			if elapsed >= instance.quest_data.time_limit:
				fail_quest(quest_id)
```
