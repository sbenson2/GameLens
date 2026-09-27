---
tags: [trigger, should-fire]
max_turns: 4
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

Add coyote time and jump buffering to my Godot 4 player controller:

```gdscript
extends CharacterBody2D
const SPEED = 300.0
const JUMP_VELOCITY = -420.0
var gravity = 900.0
func _physics_process(delta):
    if not is_on_floor():
        velocity.y += gravity * delta
    if Input.is_action_just_pressed("jump") and is_on_floor():
        velocity.y = JUMP_VELOCITY
    velocity.x = Input.get_axis("left", "right") * SPEED
    move_and_slide()
```
