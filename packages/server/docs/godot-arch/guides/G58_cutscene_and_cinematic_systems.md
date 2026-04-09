# G58 — Cutscene & Cinematic Systems

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G8 Animation Systems](./G8_animation_systems.md) · [G6 Camera Systems](./G6_camera_systems.md) · [G26 Dialogue & Narrative Systems](./G26_dialogue_narrative_systems.md) · [G37 Scene Management & Transitions](./G37_scene_management_and_transitions.md) · [G3 Signal Architecture](./G3_signal_architecture.md)

---

## What This Guide Covers

Cutscenes are scripted sequences that take temporary control away from the player to advance the story — camera movements, character animations, dialogue, and environmental changes all orchestrated in a precise timeline. Godot doesn't ship a dedicated cutscene editor, but its `AnimationPlayer`, signal system, and `await` keyword combine into a powerful cinematic toolkit.

This guide covers two complementary approaches: timeline-driven cutscenes using `AnimationPlayer` with call-method tracks (good for tightly choreographed sequences), and script-driven cutscenes using an async `CutsceneDirector` pattern (good for branching logic, reusable actions, and sequences that depend on runtime state). It also covers camera rigs for cinematic shots, letterboxing, skippable cutscenes, and blending between gameplay and cinematic cameras.

**Use this guide when:** your game has story beats, boss intros, tutorial sequences, environmental reveals, or any moment where you need to take camera and character control away from the player temporarily.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Timeline-Driven Cutscenes with AnimationPlayer](#2-timeline-driven-cutscenes-with-animationplayer)
3. [Call-Method Tracks for Side Effects](#3-call-method-tracks-for-side-effects)
4. [Script-Driven Cutscenes: The CutsceneDirector Pattern](#4-script-driven-cutscenes-the-cutscenedirector-pattern)
5. [Cutscene Actions Library](#5-cutscene-actions-library)
6. [Cinematic Camera Rig](#6-cinematic-camera-rig)
7. [Letterboxing and Screen Effects](#7-letterboxing-and-screen-effects)
8. [Skippable Cutscenes](#8-skippable-cutscenes)
9. [Blending Gameplay ↔ Cinematic Cameras](#9-blending-gameplay--cinematic-cameras)
10. [Trigger Zones and Sequencing](#10-trigger-zones-and-sequencing)
11. [C# Examples](#11-c-examples)
12. [Common Pitfalls](#12-common-pitfalls)

---

## 1. Architecture Overview

A clean cutscene system separates orchestration from individual actions:

```
CutsceneManager (AutoLoad)
├── Manages cutscene state (playing, skipping, idle)
├── Disables/re-enables player input
├── Owns the cinematic camera rig
│
CutsceneDirector (per-cutscene script)
├── Defines sequence of actions via await chains
├── References: CinematicCamera, DialogueManager, actors
│
CutsceneAction (reusable building blocks)
├── move_actor_to()
├── play_animation()
├── move_camera_to()
├── fade_in() / fade_out()
├── show_dialogue()
├── wait()
└── play_sound()
```

The key insight: **AnimationPlayer excels at synchronizing visual properties** (positions, rotations, colors) across a timeline, while **GDScript `await` excels at sequential logic** (wait for dialogue to finish, then move camera, then spawn enemy). Most real cutscenes need both.

---

## 2. Timeline-Driven Cutscenes with AnimationPlayer

For tightly choreographed sequences where every keyframe matters (a camera sweeping across a landscape while characters walk into position), `AnimationPlayer` is the right tool.

### Setup

Create a dedicated scene for the cutscene:

```
CutsceneIntro (Node3D)
├── AnimationPlayer
├── CinematicCamera3D (Camera3D)
├── ActorSpawnPoints (Marker3D nodes)
└── CutsceneUI (CanvasLayer)
    └── LetterboxBars
```

### Animating Multiple Nodes

`AnimationPlayer` can animate any property on any node in the scene tree via property tracks. Use relative paths from the `AnimationPlayer`'s parent:

```gdscript
# No code needed for basic property animation —
# set keyframes in the Animation panel for:
#   CinematicCamera3D:position
#   CinematicCamera3D:rotation
#   ActorKnight:position
#   CutsceneUI/LetterboxBars:size
```

### Triggering the Cutscene

```gdscript
class_name TimelineCutscene
extends Node3D

@onready var anim_player: AnimationPlayer = $AnimationPlayer
@onready var cinematic_cam: Camera3D = $CinematicCamera3D

func play_cutscene() -> void:
    # Disable player input
    CutsceneManager.begin_cutscene()
    
    # Switch to cinematic camera
    cinematic_cam.make_current()
    
    # Play the timeline
    anim_player.play("intro_sequence")
    await anim_player.animation_finished
    
    # Return control
    CutsceneManager.end_cutscene()
```

---

## 3. Call-Method Tracks for Side Effects

`AnimationPlayer` supports **Call Method tracks** — keyframes that invoke functions at specific times in the animation. This bridges timeline animation with game logic.

### Adding a Call Method Track

1. In the Animation panel, add a new track → **Call Method Track**
2. Select the target node (e.g., the cutscene script itself)
3. Add keyframes at the desired times, choosing the method to call

### Practical Uses

```gdscript
# These methods are called by AnimationPlayer's call-method track keyframes

func spawn_enemy_wave() -> void:
    var enemy = preload("res://enemies/boss.tscn").instantiate()
    get_tree().current_scene.add_child(enemy)
    enemy.global_position = $SpawnPoint.global_position

func shake_camera(intensity: float, duration: float) -> void:
    CinematicCameraRig.shake(intensity, duration)

func play_dialogue_line(line_key: String) -> void:
    DialogueManager.show_line(line_key)

func trigger_explosion_vfx() -> void:
    $ExplosionParticles.emitting = true
    $ExplosionAudio.play()
```

### Limitation

Call-method tracks fire and forget — they cannot pause the animation to wait for a result (e.g., wait for dialogue to close). For that, use the script-driven approach below.

---

## 4. Script-Driven Cutscenes: The CutsceneDirector Pattern

For cutscenes with branching logic, variable timing, or dependencies on runtime state, a script-driven approach using `await` chains is more maintainable than cramming everything into AnimationPlayer.

### Core Director

```gdscript
class_name CutsceneDirector
extends Node

## Emitted when any single action completes.
signal action_completed
## Emitted when the full cutscene finishes (or is skipped).
signal cutscene_finished

var _is_skipping: bool = false

func execute(actions: Array[Callable]) -> void:
    CutsceneManager.begin_cutscene()
    
    for action in actions:
        if _is_skipping:
            break
        await action.call()
    
    CutsceneManager.end_cutscene()
    cutscene_finished.emit()

func skip() -> void:
    _is_skipping = true
```

### Writing a Cutscene Script

```gdscript
extends CutsceneDirector

@onready var camera_rig: CinematicCameraRig = $CinematicCameraRig
@onready var knight: CharacterBody3D = $Knight
@onready var boss: CharacterBody3D = $Boss

func _ready() -> void:
    execute([
        fade_out.bind(0.5),
        move_camera.bind($CamPos_Wide.global_position, 0.0),
        fade_in.bind(1.0),
        move_actor.bind(knight, $KnightMark.global_position, 2.0),
        wait.bind(0.5),
        show_dialogue.bind("boss_intro_01"),
        move_camera.bind($CamPos_CloseUp.global_position, 1.5),
        show_dialogue.bind("boss_intro_02"),
        play_anim.bind(boss, "roar"),
        shake_screen.bind(0.8, 0.5),
        fade_out.bind(1.0),
    ])

# --- Reusable action methods (each returns when done) ---

func fade_out(duration: float) -> void:
    var tween := create_tween()
    tween.tween_property($FadeRect, "modulate:a", 1.0, duration)
    await tween.finished

func fade_in(duration: float) -> void:
    var tween := create_tween()
    tween.tween_property($FadeRect, "modulate:a", 0.0, duration)
    await tween.finished

func move_camera(target_pos: Vector3, duration: float) -> void:
    if duration <= 0.0:
        camera_rig.global_position = target_pos
        return
    var tween := create_tween().set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_CUBIC)
    tween.tween_property(camera_rig, "global_position", target_pos, duration)
    await tween.finished

func move_actor(actor: Node3D, target: Vector3, duration: float) -> void:
    var tween := create_tween().set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
    tween.tween_property(actor, "global_position", target, duration)
    await tween.finished

func show_dialogue(line_key: String) -> void:
    DialogueManager.show_line(line_key)
    await DialogueManager.line_finished

func play_anim(actor: Node3D, anim_name: String) -> void:
    var anim_player: AnimationPlayer = actor.get_node("AnimationPlayer")
    anim_player.play(anim_name)
    await anim_player.animation_finished

func shake_screen(intensity: float, duration: float) -> void:
    camera_rig.start_shake(intensity)
    await get_tree().create_timer(duration).timeout
    camera_rig.stop_shake()

func wait(duration: float) -> void:
    await get_tree().create_timer(duration).timeout
```

This reads like a screenplay — each line is an action that completes before the next begins. Adding branching is trivial:

```gdscript
# Branch based on player choice or game state
func conditional_scene() -> void:
    show_dialogue.call("do_you_trust_me")
    var choice: String = await DialogueManager.choice_made
    if choice == "yes":
        await play_anim.call(knight, "handshake")
    else:
        await play_anim.call(boss, "angry_turn")
```

---

## 5. Cutscene Actions Library

Build a library of reusable actions as a singleton. This keeps individual cutscene scripts focused on choreography:

```gdscript
# cutscene_actions.gd (AutoLoad)
class_name CutsceneActions

static func tween_property_async(
    node: Node, property: String, target: Variant, duration: float
) -> void:
    var tween := node.create_tween().set_ease(Tween.EASE_IN_OUT)
    tween.tween_property(node, property, target, duration)
    await tween.finished

static func parallel(actions: Array[Callable]) -> void:
    ## Run multiple actions at the same time, wait for all to finish.
    var remaining := actions.size()
    if remaining == 0:
        return
    
    var all_done_signal := Signal()  # Use a manual signal pattern
    for action in actions:
        # Launch each action concurrently
        action.call().connect(func(): 
            remaining -= 1)
    
    # Simpler approach — launch all and track via a counter
    # In practice, use a dedicated "parallel runner" node:
    pass

static func parallel_await(node: Node, actions: Array[Callable]) -> void:
    ## Practical parallel: run all actions, await the longest.
    var max_duration := 0.0
    for action in actions:
        action.call()  # Fire without await
    # Caller should await a known duration or the last signal
```

> **Tip:** For truly parallel actions (camera moves while actor walks), don't `await` the first — just call it, then `await` only the last or longest action.

```gdscript
# Camera moves and actor walks simultaneously
func cinematic_entrance() -> void:
    # Fire camera move (don't await)
    var cam_tween := create_tween()
    cam_tween.tween_property(camera_rig, "global_position", cam_target, 3.0)
    
    # Fire actor walk (don't await)
    var actor_tween := create_tween()
    actor_tween.tween_property(knight, "global_position", walk_target, 3.0)
    
    # Await only the longest
    await cam_tween.finished
```

---

## 6. Cinematic Camera Rig

A reusable camera rig for cutscenes provides smooth movement, look-at tracking, and screen shake:

```gdscript
class_name CinematicCameraRig
extends Node3D

@onready var camera: Camera3D = $Camera3D
@onready var shake_offset: Node3D = $ShakeOffset

var _shake_intensity: float = 0.0

func move_to(target: Vector3, duration: float, look_target: Node3D = null) -> void:
    var tween := create_tween().set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_CUBIC)
    tween.tween_property(self, "global_position", target, duration)
    
    if look_target:
        tween.parallel().tween_method(
            func(t: float):
                var look_pos: Vector3 = look_target.global_position
                camera.look_at(look_pos, Vector3.UP),
            0.0, 1.0, duration
        )
    
    await tween.finished

func dolly_zoom(target_fov: float, duration: float) -> void:
    var tween := create_tween().set_trans(Tween.TRANS_SINE)
    tween.tween_property(camera, "fov", target_fov, duration)
    await tween.finished

func start_shake(intensity: float) -> void:
    _shake_intensity = intensity

func stop_shake() -> void:
    _shake_intensity = 0.0
    shake_offset.position = Vector3.ZERO

func _process(delta: float) -> void:
    if _shake_intensity > 0.0:
        shake_offset.position = Vector3(
            randf_range(-1, 1) * _shake_intensity,
            randf_range(-1, 1) * _shake_intensity,
            0.0
        )
```

### Scene Tree for the Rig

```
CinematicCameraRig (Node3D) — moves to positions
└── ShakeOffset (Node3D) — random offset for shake
    └── Camera3D — the actual camera
```

---

## 7. Letterboxing and Screen Effects

Cinematic bars sell the "cutscene feel." Use a `CanvasLayer` with two `ColorRect` bars:

```gdscript
class_name LetterboxOverlay
extends CanvasLayer

@onready var top_bar: ColorRect = $TopBar
@onready var bottom_bar: ColorRect = $BottomBar

const BAR_HEIGHT := 80.0

func _ready() -> void:
    top_bar.size.y = 0.0
    bottom_bar.size.y = 0.0
    top_bar.anchor_top = 0.0
    top_bar.anchor_bottom = 0.0
    bottom_bar.anchor_top = 1.0
    bottom_bar.anchor_bottom = 1.0
    bottom_bar.grow_vertical = Control.GROW_DIRECTION_BEGIN

func show_bars(duration: float = 0.5) -> void:
    var tween := create_tween().set_parallel(true)
    tween.tween_property(top_bar, "size:y", BAR_HEIGHT, duration)
    tween.tween_property(bottom_bar, "size:y", BAR_HEIGHT, duration)
    await tween.finished

func hide_bars(duration: float = 0.5) -> void:
    var tween := create_tween().set_parallel(true)
    tween.tween_property(top_bar, "size:y", 0.0, duration)
    tween.tween_property(bottom_bar, "size:y", 0.0, duration)
    await tween.finished
```

---

## 8. Skippable Cutscenes

Players expect to skip cutscenes on replay. The pattern:

```gdscript
# In CutsceneManager (AutoLoad)
extends Node

signal cutscene_skip_requested

var is_in_cutscene: bool = false
var _skip_hold_time: float = 0.0
const SKIP_HOLD_DURATION := 1.5  # Hold to skip (prevents accidental skips)

func begin_cutscene() -> void:
    is_in_cutscene = true
    _skip_hold_time = 0.0
    # Disable player movement
    get_tree().call_group("player", "set_input_enabled", false)

func end_cutscene() -> void:
    is_in_cutscene = false
    get_tree().call_group("player", "set_input_enabled", true)

func _process(delta: float) -> void:
    if not is_in_cutscene:
        return
    
    if Input.is_action_pressed("ui_cancel"):
        _skip_hold_time += delta
        # Show "Hold to skip" UI progress
        SkipIndicator.set_progress(_skip_hold_time / SKIP_HOLD_DURATION)
        
        if _skip_hold_time >= SKIP_HOLD_DURATION:
            cutscene_skip_requested.emit()
            _skip_hold_time = 0.0
    else:
        _skip_hold_time = 0.0
        SkipIndicator.set_progress(0.0)
```

In the `CutsceneDirector`, listen for skip:

```gdscript
func execute(actions: Array[Callable]) -> void:
    CutsceneManager.begin_cutscene()
    CutsceneManager.cutscene_skip_requested.connect(_on_skip, CONNECT_ONE_SHOT)
    
    for action in actions:
        if _is_skipping:
            break
        await action.call()
    
    # Apply end-state regardless of skip
    _apply_final_state()
    CutsceneManager.end_cutscene()

func _on_skip() -> void:
    _is_skipping = true
    # Kill all active tweens
    get_tree().call_group("cutscene_tweens", "kill")

func _apply_final_state() -> void:
    # Snap actors/camera to their final positions
    # so the game world is consistent after skip
    pass  # Override per cutscene
```

> **Critical:** Always define `_apply_final_state()`. If a player skips mid-cutscene, actors and cameras must be in the correct post-cutscene positions or the game breaks.

---

## 9. Blending Gameplay ↔ Cinematic Cameras

Switching cameras abruptly is jarring. Blend between them:

```gdscript
func transition_to_cinematic(cinematic_cam: Camera3D, duration: float) -> void:
    # Store gameplay camera state
    var gameplay_cam := get_viewport().get_camera_3d()
    var start_pos := gameplay_cam.global_position
    var start_rot := gameplay_cam.global_rotation
    
    # Make cinematic camera current
    cinematic_cam.global_position = start_pos
    cinematic_cam.global_rotation = start_rot
    cinematic_cam.make_current()
    
    # Tween to target position
    var tween := create_tween().set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_CUBIC)
    tween.tween_property(cinematic_cam, "global_position", cinematic_cam.get_meta("target_pos"), duration)
    tween.parallel().tween_property(cinematic_cam, "global_rotation", cinematic_cam.get_meta("target_rot"), duration)
    await tween.finished
```

---

## 10. Trigger Zones and Sequencing

Use `Area3D` (or `Area2D`) trigger zones to start cutscenes when the player enters:

```gdscript
class_name CutsceneTrigger
extends Area3D

@export var cutscene_scene: PackedScene
@export var one_shot: bool = true

var _triggered: bool = false

func _ready() -> void:
    body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node3D) -> void:
    if _triggered and one_shot:
        return
    if not body.is_in_group("player"):
        return
    
    _triggered = true
    var cutscene := cutscene_scene.instantiate()
    add_child(cutscene)
    
    if cutscene.has_signal("cutscene_finished"):
        await cutscene.cutscene_finished
        cutscene.queue_free()
```

### Chaining Multiple Cutscenes

```gdscript
# Level script — play cutscenes in sequence based on game state
func _ready() -> void:
    if not SaveManager.has_seen("act2_intro"):
        var intro := preload("res://cutscenes/act2_intro.tscn").instantiate()
        add_child(intro)
        await intro.cutscene_finished
        intro.queue_free()
        SaveManager.mark_seen("act2_intro")
```

---

## 11. C# Examples

### CutsceneDirector in C#

```csharp
using Godot;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

public partial class CutsceneDirector : Node
{
    [Signal] public delegate void CutsceneFinishedEventHandler();
    
    private bool _isSkipping = false;
    
    public async Task Execute(List<Func<Task>> actions)
    {
        CutsceneManager.Instance.BeginCutscene();
        
        foreach (var action in actions)
        {
            if (_isSkipping) break;
            await action();
        }
        
        ApplyFinalState();
        CutsceneManager.Instance.EndCutscene();
        EmitSignal(SignalName.CutsceneFinished);
    }
    
    public void Skip() => _isSkipping = true;
    
    protected virtual void ApplyFinalState() { }
}
```

### Using the Director

```csharp
public partial class BossIntroCutscene : CutsceneDirector
{
    [Export] private Camera3D _cinematicCam;
    [Export] private CharacterBody3D _boss;
    
    public override async void _Ready()
    {
        await Execute(new List<Func<Task>>
        {
            () => FadeOut(0.5f),
            () => MoveCamera(_cinematicCam, _bossArenaPos, 2.0f),
            () => FadeIn(1.0f),
            () => PlayAnimation(_boss, "roar"),
            () => Wait(0.5f),
            () => FadeOut(0.5f),
        });
    }
    
    private async Task FadeOut(float duration)
    {
        var tween = CreateTween().SetEase(Tween.EaseType.InOut);
        tween.TweenProperty(_fadeRect, "modulate:a", 1.0f, duration);
        await ToSignal(tween, Tween.SignalName.Finished);
    }
    
    private async Task MoveCamera(Camera3D cam, Vector3 target, float dur)
    {
        var tween = CreateTween().SetEase(Tween.EaseType.InOut)
            .SetTrans(Tween.TransitionType.Cubic);
        tween.TweenProperty(cam, "global_position", target, dur);
        await ToSignal(tween, Tween.SignalName.Finished);
    }
    
    private async Task PlayAnimation(Node3D actor, string animName)
    {
        var player = actor.GetNode<AnimationPlayer>("AnimationPlayer");
        player.Play(animName);
        await ToSignal(player, AnimationPlayer.SignalName.AnimationFinished);
    }
    
    private async Task Wait(float seconds)
    {
        await ToSignal(GetTree().CreateTimer(seconds), SceneTreeTimer.SignalName.Timeout);
    }
}
```

---

## 12. Common Pitfalls

**Forgetting final state on skip.** If a cutscene is skipped mid-way, actors may be in intermediate positions. Always implement `_apply_final_state()` that teleports everything to the post-cutscene configuration.

**AnimationPlayer length mismatch.** If your animation is 5 seconds but you `await` a 3-second timer, the cutscene continues while the animation is still playing. Always `await anim_player.animation_finished` instead of hardcoding durations.

**Not disabling player input.** The player character will respond to input during a cutscene unless you explicitly disable it. Use a centralized `CutsceneManager.begin_cutscene()` that disables input at the start.

**Orphaned tweens on skip.** When skipping, active tweens keep running. Call `tween.kill()` on all active tweens during skip, or add cutscene tweens to a group so you can kill them in batch.

**Camera not restored.** After a cutscene ends, the gameplay camera must be made current again. Store a reference before the cutscene starts and restore it in `end_cutscene()`.

**Cutscene replays after reload.** Use save data flags (`SaveManager.mark_seen()`) to track which cutscenes have played. Check before triggering.

---

*Next steps:* [G26 Dialogue & Narrative Systems](./G26_dialogue_narrative_systems.md) for integrating dialogue into cutscenes · [G6 Camera Systems](./G6_camera_systems.md) for gameplay camera patterns · [G38 Game Feel & Juice](./G38_game_feel_and_juice.md) for screen shake and impact effects
