# Engine integration

Read this when writing or reviewing code inside a specific engine: identifying the engine and its version, finding authoritative API behavior, avoiding lifecycle and timing mistakes, working through a connected editor tool, and judging what a check actually proved. A design question that does not depend on the engine can stay engine-free; architecture choices are in [architecture.md](architecture.md).

## Identify the engine and version before writing code

Read project files first. Do not upgrade the engine, add a second engine, or switch frameworks unless the user asks for that.

| Project evidence | Likely engine | Where to confirm the version |
| --- | --- | --- |
| `project.godot` | Godot | The editor or export executable the project actually uses, and any version notes in the repository |
| `ProjectSettings/ProjectVersion.txt` with `Assets/` | Unity | `ProjectVersion.txt`, which Unity Build Automation's auto-detect option reads to pick the editor version [@unity2026-build-automation-version] |
| `*.uproject` | Unreal Engine | Its `EngineAssociation` field, which identifies the editor that opens the project: a version number for launcher installs, a unique identifier for other builds [@epic2026-installed-build] |
| `package.json` and a lockfile | Phaser or another web framework | The resolved version in the lockfile, not the range in `package.json` |
| `Cargo.toml` and `Cargo.lock` | Bevy or another Rust engine | The locked crate version |
| `*.csproj` with MonoGame packages | MonoGame | The package reference version |
| `main.lua` and `conf.lua` | LÖVE | `conf.lua` and the version notes in the engine's wiki |

When the evidence conflicts (a lockfile disagrees with the build scripts, or two engine versions are installed), ask or report the conflict rather than guessing.

## Where API facts come from

API behavior comes from the official documentation for the installed version, the project's own code and plugins, and, for open-source engines, the engine source. It does not come from memory, from a design reference such as this skill, or from documentation for a different major version. Most engines publish versioned documentation. The Godot, Unity, Unreal and Bevy pages cited below are pinned to Godot 4.7, Unity 6.3, Unreal Engine 5.8 and Bevy 0.19; the Phaser pages are the current edition, which documented Phaser 4.1 when read, and the MonoGame page is unversioned. Check the same page for the project's version before relying on a detail. When the documentation and observed behavior disagree, trust the observation and say so.

With an engine, the engine owns the main loop and calls your code [@nystrom2014-patterns]. The integration mistakes below follow from that: calling the right function in the wrong phase, with the wrong clock, or on shared data.

## Movement and the physics step

- **Godot.** `move_and_slide()` moves a CharacterBody using its `velocity` property (pixels per second in 2D) and belongs in `_physics_process()`; the class reference calls setting `velocity` to a speed multiplied by `delta` a common mistake [@godot2026-characterbody2d]. `move_and_collide()` takes this step's motion, typically velocity multiplied by `delta` [@godot2026-character-body-tutorial]. Integrating acceleration into velocity still needs `delta`; only the final move differs.
- **Fixed physics ticks are not frames.** Godot runs physics processing at a fixed rate, 60 per second by default, independent of frame rate [@godot2026-idle-physics]. Unity's `FixedUpdate` runs at the `Time.fixedDeltaTime` interval, 0.02 seconds by default, and may run zero, one or several times per rendered frame [@unity2026-fixedupdate]. Bevy's fixed clock defaults to 64 Hz; its documentation explains that 60 Hz can interact with the monitor refresh rate so that frames alternate between two fixed steps and zero [@bevy2026-fixed]. MonoGame defaults to a fixed step and, when an update runs long, calls `Update` again without drawing in between [@monogame2026-game-loop].
- **Red flag:** input polled only inside the fixed tick. Fixed steps do not line up with frames, so a press and release that both land between two ticks can be missed by polling (this skill's reasoning); read input per frame or from input events and buffer it for the next tick.
- **Red flag:** gameplay code in the per-frame callback that moves physics bodies directly, or a per-frame speed that is not scaled by that frame's delta.

## Shared data assets

- **Godot resources.** A resource loaded from disk is loaded once, and loading it again returns the same in-memory copy; images, meshes and similar resources are shared between scene instances [@godot2026-resources]. Enabling `resource_local_to_scene` gives each scene instance its own copy, and `duplicate()` is shallow by default, so nested resources, arrays and dictionaries stay shared. Even `duplicate(true)` copies only nested resources that are local to the file; `duplicate_deep()` with `DEEP_DUPLICATE_ALL` also copies resources saved separately [@godot2026-resource-class]. The typical symptom: changing one enemy's stats at run time changes every enemy.
- **Unity ScriptableObjects** hold data shared by reference, with one copy in memory. In the Editor, data can be saved to them in both Edit and Play mode, while a built player can only read saved data [@unity2026-scriptableobject]. Runtime writes therefore behave differently in the Editor and in a build; keep per-instance runtime state out of shared assets.
- Policy to state in code review: which assets are read-only definitions, where per-instance copies are made, and whether a copy is shallow or deep.

## Initialization order

- **Godot.** A parent's `_enter_tree()` runs before its children's, while `_ready()` runs children first and the parent last; `_ready()` runs once per node unless `request_ready()` is called before the node re-enters the tree [@godot2026-node]. A parent's `_ready()` can rely on its children being ready; a child's `_ready()` that reaches up to its parent cannot.
- **Unity.** You cannot rely on the order in which the same event function runs on different GameObjects unless that order is documented or set explicitly [@unity2026-execution-order].
- **Unreal Engine.** Component initialization finishes before `BeginPlay`, which runs when the level starts; spawned actors also run their construction step first [@epic2026-actor-lifecycle]. Each tick group finishes before the next starts, and actors can declare tick dependencies on each other [@epic2026-actor-ticking].
- **Phaser.** A scene's `preload()` queues assets and `create()` builds objects from them; `update(time, delta)` runs each step [@phaser2026-scenes].
- **Bevy.** The scheduler runs systems in parallel as far as their data access allows; to control the order between systems, declare explicit dependencies [@bevy2026-ecs].
- Checks: remove, re-add and re-instance the object; load the scene directly instead of through the usual menu path; test with several instances whose order in the tree differs.

## Pause, time scale and physics are separate controls

- **Godot.** Pausing the scene tree stops 2D and 3D physics for all nodes and stops or continues each node according to its process mode; stopped nodes receive no process, physics or input callbacks, though signals still fire [@godot2026-pausing]. `Engine.time_scale` scales timers and the delta passed to process and physics callbacks, but not audio playback and not the physics tick rate [@godot2026-engine-class].
- **Unity.** At a `timeScale` of zero, `FixedUpdate` and coroutines waiting on `WaitForSeconds` are not called. Unless `fixedDeltaTime` is also changed, the physics rate stays constant relative to game time, not real time [@unity2026-timescale].
- **Unreal Engine.** Actors can be set to tick while the game is paused, and each actor has its own time dilation [@epic2026-aactor].
- **Phaser.** Arcade physics' world `timeScale` has inverse meaning (2.0 is half speed) and is disabled when the world does not use a fixed step [@phaser2026-arcade-world], while a scene clock's `timeScale` speeds up or slows its own timer events independently of the rest of the game [@phaser2026-clock].
- **Bevy.** The virtual clock can be paused and run faster or slower than real time [@bevy2026-virtual].

Hitstop, slow motion, pause menus and cutscenes all touch these controls. Give each one an owner, decide which clock every system reads (scaled game time, unscaled real time, fixed physics time), and do not blindly reset a global time scale to 1.0 when one effect ends while another is still active. Test transitions: pausing during hitstop, unpausing mid-tween, and a scene change while slowed down.

## Symptoms and likely causes

This table is diagnostic reasoning that builds on the documented behavior above; confirm each cause in the project before changing code.

| Symptom | Likely cause | Quick check |
| --- | --- | --- |
| Movement speed changes with frame rate or refresh rate | Per-frame movement not scaled by delta, or delta applied twice before a method that already applies it | Cap the frame rate at two values and log distance covered per second |
| A jump or dash press is sometimes ignored | Input sampled only in the fixed physics step | Log the frame of each press and the tick that consumed it |
| Changing one instance changes all of them | A shared definition asset is mutated at run time | Compare object identity of the asset across two instances |
| Null reference only when a scene is loaded directly | Initialization depends on an order the engine does not guarantee | Load the scene directly and with several instances |
| Slow motion ends early, or the game stays at the wrong speed | Several effects write one global time scale | List every writer of the time scale and who restores it |
| Timers, tweens, audio and physics drift apart during pause or slow motion | Each runs on a different clock | Write down which clock each system reads |
| Works in the editor, fails in an exported build | Editor-only behavior, such as data saved during Play mode, or assets missing from the export | Test the exported build, not only the editor |

## Editor tools and automation

An agent may have an editor integration available: a plugin, remote API, or MCP server connected to a running editor.

- Before changing anything, confirm which project and scene the tool is attached to and compare that with the project path of the task. Do not assume the active editor is the requested project.
- Discover the tool's current commands from its own help or schema instead of assuming names from earlier sessions.
- Editors that keep scenes open in memory may write their copy back over edits made to the files on disk. Check whether yours does before editing a file the editor has open; prefer the editor's own operations for scenes it holds open, and for imports that generate metadata.
- Preserve resource paths, identifiers and generated metadata. After imports and scene changes, read the editor's error output.
- If no editor is available, continue with file-based work and report exactly which runtime checks were not performed.

## What a check proves

| Check | Shows | Does not show |
| --- | --- | --- |
| Headless parse or import (for example Godot's `--headless` with `--import`, or `--check-only` on one script given with `--script`) [@godot2026-command-line] | Script and resource errors the parser or importer finds | Input handling, rendering, audio, timing, or whether anything is fun |
| Automated tests in batch mode (for example Unity's `-batchmode -runTests`) [@unity2026-test-cli] | The behavior those tests assert | Anything outside their assertions, including feel |
| Running the scene and reading the log | Startup errors and warnings on that path | Other paths, other hardware, long sessions |
| Screenshot | Layout and visuals at one moment | Responsiveness, animation timing, audio |
| Playing it | Feel and flow as one person experienced them | Other players, other skill levels |

Use the project's documented build and test commands. Report what was run and what it covered; never describe a headless run as having exercised an interaction it could not observe. Evaluation methods beyond these checks are in evaluation.md.

## Sources

- `unity2026-build-automation-version` Unity Technologies (2026). Configure a build. Unity Build Automation documentation. https://docs.unity.com/en-us/build-automation/basic-build-configuration/overview (official documentation)
- `epic2026-installed-build` Epic Games (2026). Installed Build Reference Guide for Unreal Engine. Unreal Engine 5.8 documentation. https://dev.epicgames.com/documentation/en-us/unreal-engine/installed-build-reference-guide-for-unreal-engine?application_version=5.8 (official documentation)
- `nystrom2014-patterns` Robert Nystrom (2014). Game Programming Patterns. Genever Benning. https://gameprogrammingpatterns.com/ (book)
- `godot2026-characterbody2d` Godot Engine contributors (2026). CharacterBody2D. Godot Engine 4.7 documentation. https://docs.godotengine.org/en/4.7/classes/class_characterbody2d.html (official documentation)
- `godot2026-character-body-tutorial` Godot Engine contributors (2026). Using CharacterBody2D/3D. Godot Engine 4.7 documentation. https://docs.godotengine.org/en/4.7/tutorials/physics/using_character_body_2d.html (official documentation)
- `godot2026-idle-physics` Godot Engine contributors (2026). Idle and Physics Processing. Godot Engine 4.7 documentation. https://docs.godotengine.org/en/4.7/tutorials/scripting/idle_and_physics_processing.html (official documentation)
- `unity2026-fixedupdate` Unity Technologies (2026). MonoBehaviour.FixedUpdate. Unity 6.3 (6000.3) documentation. https://docs.unity3d.com/6000.3/Documentation/ScriptReference/MonoBehaviour.FixedUpdate.html (official documentation)
- `bevy2026-fixed` Bevy contributors (2026). Fixed. Bevy 0.19.1 API documentation. https://docs.rs/bevy/0.19.1/bevy/time/struct.Fixed.html (official documentation)
- `monogame2026-game-loop` MonoGame Foundation (2026). What is the Game Loop. MonoGame documentation. https://docs.monogame.net/articles/getting_to_know/whatis/game_loop/index.html (official documentation)
- `godot2026-resources` Godot Engine contributors (2026). Resources. Godot Engine 4.7 documentation. https://docs.godotengine.org/en/4.7/tutorials/scripting/resources.html (official documentation)
- `godot2026-resource-class` Godot Engine contributors (2026). Resource. Godot Engine 4.7 documentation. https://docs.godotengine.org/en/4.7/classes/class_resource.html (official documentation)
- `unity2026-scriptableobject` Unity Technologies (2026). ScriptableObject. Unity 6.3 (6000.3) documentation. https://docs.unity3d.com/6000.3/Documentation/Manual/class-ScriptableObject.html (official documentation)
- `godot2026-node` Godot Engine contributors (2026). Node. Godot Engine 4.7 documentation. https://docs.godotengine.org/en/4.7/classes/class_node.html (official documentation)
- `unity2026-execution-order` Unity Technologies (2026). Event function execution order. Unity 6.3 (6000.3) documentation. https://docs.unity3d.com/6000.3/Documentation/Manual/execution-order.html (official documentation)
- `epic2026-actor-lifecycle` Epic Games (2026). Unreal Engine Actor Lifecycle. Unreal Engine 5.8 documentation. https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-actor-lifecycle?application_version=5.8 (official documentation)
- `epic2026-actor-ticking` Epic Games (2026). Actor Ticking in Unreal Engine. Unreal Engine 5.8 documentation. https://dev.epicgames.com/documentation/en-us/unreal-engine/actor-ticking-in-unreal-engine?application_version=5.8 (official documentation)
- `phaser2026-scenes` Phaser Studio (2026). Scenes. Phaser documentation (unversioned concept page). https://docs.phaser.io/phaser/concepts/scenes (official documentation)
- `bevy2026-ecs` Bevy contributors (2026). Module bevy::ecs. Bevy 0.19.1 API documentation. https://docs.rs/bevy/0.19.1/bevy/ecs/index.html (official documentation)
- `godot2026-pausing` Godot Engine contributors (2026). Pausing games and process mode. Godot Engine 4.7 documentation. https://docs.godotengine.org/en/4.7/tutorials/scripting/pausing_games.html (official documentation)
- `godot2026-engine-class` Godot Engine contributors (2026). Engine. Godot Engine 4.7 documentation. https://docs.godotengine.org/en/4.7/classes/class_engine.html (official documentation)
- `unity2026-timescale` Unity Technologies (2026). Time.timeScale. Unity 6.3 (6000.3) documentation. https://docs.unity3d.com/6000.3/Documentation/ScriptReference/Time-timeScale.html (official documentation)
- `epic2026-aactor` Epic Games (2026). AActor. Unreal Engine 5.8 API reference. https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/AActor?application_version=5.8 (official documentation)
- `phaser2026-arcade-world` Phaser Studio (2026). Phaser.Physics.Arcade.World. Phaser 4.1 documentation. https://docs.phaser.io/api-documentation/class/physics-arcade-world (official documentation)
- `phaser2026-clock` Phaser Studio (2026). Phaser.Time.Clock. Phaser 4.1 documentation. https://docs.phaser.io/api-documentation/class/time-clock (official documentation)
- `bevy2026-virtual` Bevy contributors (2026). Virtual. Bevy 0.19.1 API documentation. https://docs.rs/bevy/0.19.1/bevy/time/struct.Virtual.html (official documentation)
- `godot2026-command-line` Godot Engine contributors (2026). Command line tutorial. Godot Engine 4.7 documentation. https://docs.godotengine.org/en/4.7/tutorials/editor/command_line_tutorial.html (official documentation)
- `unity2026-test-cli` Unity Technologies (2026). Run tests from the command line. Unity 6.3 (6000.3) documentation. https://docs.unity3d.com/6000.3/Documentation/Manual/test-framework/run-tests-from-command-line.html (official documentation)
