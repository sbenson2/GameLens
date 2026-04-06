import { DocStore, Doc } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import { ModuleMetadata } from "../core/modules.js";

export interface MigrationGuideArgs {
  from: string;
  to: string;
  topic?: string;
  maxDocs?: number;
}

/**
 * Known concept mappings between engines.
 * Each entry maps a concept area to engine-specific terminology and patterns.
 */
interface ConceptMapping {
  concept: string;
  description: string;
  mappings: Record<string, string>;
  searchTerms: Record<string, string[]>;
  gotchas?: string[];
}

const CONCEPT_MAPPINGS: ConceptMapping[] = [
  {
    concept: "Architecture",
    description: "How the engine structures game objects and logic",
    mappings: {
      godot: "Node tree + Scenes — composition via child nodes, PackedScene instancing",
      monogame: "ECS (Entity-Component-System) — entities with data components, systems process them",
      unity: "GameObject + Components — MonoBehaviour scripts attached to GameObjects in a hierarchy",
      bevy: "ECS with Rust — entities are IDs, components are structs, systems are functions with queries",
      unreal: "Actor + Components — Actors in a World, UActorComponent for composition, Blueprints for visual scripting",
    },
    searchTerms: {
      godot: ["architecture", "scene composition", "node tree"],
      monogame: ["architecture", "ecs", "entity component"],
      unity: ["architecture", "gameobject", "monobehaviour"],
      bevy: ["architecture", "ecs", "entity component system"],
      unreal: ["architecture", "actor", "blueprint"],
    },
  },
  {
    concept: "Event System",
    description: "How components communicate without tight coupling",
    mappings: {
      godot: "Signals — `signal` declarations, `connect()`, signal bus via Autoload",
      monogame: "C# events/delegates or custom event bus — no built-in system",
      unity: "UnityEvent, C# events/delegates, or message passing (SendMessage)",
      bevy: "Events<T> — typed event channels, EventWriter/EventReader in systems",
      unreal: "Delegates + Event Dispatchers — BlueprintAssignable, multicast delegates",
    },
    searchTerms: {
      godot: ["signals", "signal bus", "events"],
      monogame: ["events", "observer pattern", "event system"],
      unity: ["events", "unity event", "delegates"],
      bevy: ["events", "event system"],
      unreal: ["delegates", "event dispatcher"],
    },
  },
  {
    concept: "Physics",
    description: "Physics bodies, collision detection, and response",
    mappings: {
      godot: "Built-in Godot Physics — StaticBody2D, CharacterBody2D, RigidBody2D, Area2D with collision layers/masks",
      monogame: "No built-in physics — use Aether.Physics2D or custom AABB/SAT. Manual collision layers via categories",
      unity: "Built-in PhysX (3D) / Box2D (2D) — Rigidbody, Collider, trigger/collision callbacks, layer matrix",
      bevy: "Rapier plugin (bevy_rapier) — RigidBody, Collider components, collision events via EventReader",
      unreal: "Built-in PhysX/Chaos — collision channels, physics materials, overlap/hit events",
    },
    searchTerms: {
      godot: ["physics", "collision", "characterbody2d", "rigidbody2d"],
      monogame: ["physics", "collision", "aether", "aabb"],
      unity: ["physics", "rigidbody", "collider"],
      bevy: ["physics", "rapier", "collision"],
      unreal: ["physics", "collision channel"],
    },
  },
  {
    concept: "Input Handling",
    description: "How player input is captured and processed",
    mappings: {
      godot: "InputMap actions — `Input.is_action_pressed()`, `_input()` / `_unhandled_input()` callbacks",
      monogame: "Direct polling — `Keyboard.GetState()`, `GamePad.GetState()`. No built-in action mapping",
      unity: "New Input System — InputAction assets, PlayerInput component, action maps. Legacy: `Input.GetKey()`",
      bevy: "Input resources — `Res<ButtonInput<KeyCode>>`, `Res<ButtonInput<GamepadButton>>`. Action mapping via plugins",
      unreal: "Enhanced Input — Input Actions + Input Mapping Contexts, bound to functions. Legacy: AxisMappings",
    },
    searchTerms: {
      godot: ["input", "input handling", "inputmap", "gamepad"],
      monogame: ["input", "keyboard", "gamepad", "input handling"],
      unity: ["input", "input system", "input action"],
      bevy: ["input", "keyboard", "gamepad"],
      unreal: ["input", "enhanced input"],
    },
  },
  {
    concept: "Scene / Level Management",
    description: "How game levels and scenes are organized and transitioned",
    mappings: {
      godot: "Scenes are .tscn files — `get_tree().change_scene_to_packed()`, additive loading via `add_child()`",
      monogame: "Manual scene/screen manager — custom GameScreen stack, no built-in scene system",
      unity: "Scene Manager — `SceneManager.LoadScene()`, additive loading, DontDestroyOnLoad for persistent objects",
      bevy: "States + SystemSet — `NextState<T>`, enter/exit/update system sets per state. Scenes via DynamicScene",
      unreal: "Levels — `OpenLevel()`, Level Streaming for seamless loading, World Partition for large worlds",
    },
    searchTerms: {
      godot: ["scene management", "scene tree", "change scene"],
      monogame: ["scene management", "screen manager", "game state"],
      unity: ["scene management", "scene loading"],
      bevy: ["state", "scene management"],
      unreal: ["level", "level streaming"],
    },
  },
  {
    concept: "Animation",
    description: "Sprite and skeletal animation systems",
    mappings: {
      godot: "AnimationPlayer (keyframe anything) + AnimationTree (state machines, blend trees) + Tweens",
      monogame: "Manual sprite sheets — custom AnimationController, SpriteSheet class. No built-in system",
      unity: "Animator + Animation Clips — Mecanim state machine, blend trees, animation events, DOTween for tweening",
      bevy: "AnimationPlayer component + AnimationGraph — transition-based, skeletal + sprite sheet support",
      unreal: "Animation Blueprints — state machines, blend spaces, montages, notifies, IK. Most advanced built-in system",
    },
    searchTerms: {
      godot: ["animation", "animationplayer", "animationtree", "tween"],
      monogame: ["animation", "sprite sheet", "sprite animation"],
      unity: ["animation", "animator", "mecanim"],
      bevy: ["animation", "sprite animation"],
      unreal: ["animation", "animation blueprint", "montage"],
    },
  },
  {
    concept: "UI System",
    description: "User interface creation and management",
    mappings: {
      godot: "Control nodes — Container layout, Theme resources, anchors/margins. Scene-based UI composition",
      monogame: "No built-in UI — use Gum (recommended), ImGui, or custom. Manual layout and input handling",
      unity: "UI Toolkit (recommended) or uGUI (Canvas + RectTransform). CSS-like styling with USS",
      bevy: "bevy_ui — Node/Style ECS components, Flexbox layout. Third-party: egui, kayak_ui. Still maturing",
      unreal: "UMG (Unreal Motion Graphics) — visual widget editor, data binding, Blueprint/C++ widgets",
    },
    searchTerms: {
      godot: ["ui", "control", "container", "theme"],
      monogame: ["ui", "gum", "user interface"],
      unity: ["ui", "ui toolkit", "canvas", "ugui"],
      bevy: ["ui", "bevy_ui", "user interface"],
      unreal: ["ui", "umg", "widget"],
    },
  },
  {
    concept: "Camera",
    description: "Camera control and effects",
    mappings: {
      godot: "Camera2D/Camera3D nodes — built-in smoothing, limits, zoom, drag margins. One active per viewport",
      monogame: "Manual camera matrix — custom Camera2D class with Matrix transformation, no built-in",
      unity: "Cinemachine (recommended) — Virtual Cameras with priority, blending, follow modes. Or manual Camera component",
      bevy: "Camera component + Transform — manual follow logic or third-party camera crates",
      unreal: "Camera Manager + Spring Arm — CameraComponent, PlayerCameraManager, camera shakes via Matinee",
    },
    searchTerms: {
      godot: ["camera", "camera2d", "camera system"],
      monogame: ["camera", "camera system", "viewport"],
      unity: ["camera", "cinemachine"],
      bevy: ["camera", "camera system"],
      unreal: ["camera", "spring arm", "camera manager"],
    },
  },
  {
    concept: "State Machine",
    description: "Managing game object states and transitions",
    mappings: {
      godot: "Node-based FSM (State nodes as children) or enum FSM. HSM via parent state nodes",
      monogame: "Custom FSM classes — enum-based or State pattern with IGameState interface",
      unity: "Animator state machine (animation-driven) or custom C# FSM. Third-party: Stateless, Unity HFSM",
      bevy: "States enum — `States` derive macro, `NextState<T>`, enter/exit/update system sets",
      unreal: "Gameplay Ability System or custom. Animation: state machines in AnimBP. AI: Behavior Trees",
    },
    searchTerms: {
      godot: ["state machine", "fsm", "game state"],
      monogame: ["state machine", "fsm", "game state"],
      unity: ["state machine", "fsm", "animator"],
      bevy: ["state", "fsm", "state machine"],
      unreal: ["state machine", "gameplay ability"],
    },
  },
  {
    concept: "TileMap / Level Building",
    description: "Grid-based level construction and terrain",
    mappings: {
      godot: "TileMapLayer nodes (Godot 4.3+) — TileSet resource, terrain auto-tiling, physics/nav layers, custom data",
      monogame: "Manual tilemap — custom TileMap class with 2D arrays, Tiled (.tmx) import via TiledCS/MonoGame.Extended",
      unity: "Tilemap component — TilePalette editor, RuleTile for auto-tiling, TilemapCollider2D",
      bevy: "bevy_ecs_tilemap or bevy_ecs_ldtk — third-party crates, LDtk/Tiled import support",
      unreal: "Paper2D TileMap (2D) or Landscape (3D terrain). PCG framework for procedural placement",
    },
    searchTerms: {
      godot: ["tilemap", "tilemaplayer", "tileset", "terrain"],
      monogame: ["tilemap", "tile map", "tiled"],
      unity: ["tilemap", "tile palette", "rule tile"],
      bevy: ["tilemap", "ecs_tilemap", "ldtk"],
      unreal: ["tilemap", "landscape", "terrain"],
    },
  },
  {
    concept: "Audio",
    description: "Sound playback and music management",
    mappings: {
      godot: "AudioStreamPlayer / AudioStreamPlayer2D/3D — AudioBus with effects, AudioServer",
      monogame: "SoundEffect / Song — basic API, positional via SoundEffectInstance. FMOD/Wwise for advanced",
      unity: "AudioSource + AudioClip — AudioMixer groups, spatial audio, built-in effects",
      bevy: "AudioBundle + AudioSink — basic built-in. bevy_kira_audio for advanced (FMOD-like features)",
      unreal: "Sound Cue / MetaSounds — most advanced built-in audio. Sound classes, attenuation, concurrency",
    },
    searchTerms: {
      godot: ["audio", "sound", "music", "audiostream"],
      monogame: ["audio", "sound", "soundeffect", "music"],
      unity: ["audio", "audiosource", "audiomixer"],
      bevy: ["audio", "sound", "music"],
      unreal: ["audio", "sound cue", "metasounds"],
    },
  },
  {
    concept: "Save / Load",
    description: "Game state persistence and serialization",
    mappings: {
      godot: "FileAccess + JSON/ConfigFile — `var_to_str()` for Godot types, Resource save/load, no built-in save system",
      monogame: "Manual serialization — JSON (System.Text.Json), binary, XML. Custom save manager",
      unity: "PlayerPrefs (simple) or JSON/binary serialization. No built-in save system. Third-party: Easy Save",
      bevy: "DynamicScene + serde — Reflect-based serialization, RON format. Third-party: bevy_pkv, bevy_save",
      unreal: "SaveGame class — `UGameplayStatics::SaveGameToSlot()`, built-in UObject serialization",
    },
    searchTerms: {
      godot: ["save", "load", "serialization", "fileaccess"],
      monogame: ["save", "load", "serialization"],
      unity: ["save", "playerprefs", "serialization"],
      bevy: ["save", "serialization", "scene"],
      unreal: ["save game", "serialization"],
    },
  },
];

/**
 * Common migration gotchas between specific engine pairs.
 */
const MIGRATION_GOTCHAS: Record<string, string[]> = {
  "unity→godot": [
    "**Scene structure**: Unity's flat GameObject hierarchy → Godot's tree-based composition. Rethink with 'scenes as components'",
    "**No `Update()`**: Use `_process(delta)` (every frame) or `_physics_process(delta)` (fixed step). No `FixedUpdate` naming",
    "**`CharacterBody2D` not `Rigidbody`**: For player-controlled characters, use CharacterBody2D + `move_and_slide()` — NOT RigidBody2D",
    "**Signals replace events**: Godot signals are the equivalent of C# events/UnityEvent. Learn the signal bus pattern",
    "**GDScript optional**: You can use C# in Godot, but: no web export, smaller ecosystem, some API differences. See E2 doc",
    "**`@export` not `[SerializeField]`**: Inspector-exposed variables use `@export` annotation",
    "**`await` not `yield`**: Coroutines use `await` (Godot 4.x). `yield` was Godot 3 and is removed",
    "**Autoloads = Singletons**: Godot's Project → Autoload is equivalent to Unity's DontDestroyOnLoad singletons",
    "**No prefabs — use scenes**: PackedScene + `.instantiate()` replaces Unity's prefab workflow",
    "**TileMapLayer not TileMap**: As of Godot 4.3, use individual TileMapLayer nodes (old TileMap with layer param is deprecated)",
  ],
  "unity→monogame": [
    "**No editor**: MonoGame is code-only. Visual editing requires third-party tools (e.g., LDtk, Tiled for levels)",
    "**Manual game loop**: You manage Update/Draw explicitly. No implicit component lifecycle (Awake/Start/OnEnable)",
    "**No built-in physics**: Use Aether.Physics2D or implement your own collision detection",
    "**Content Pipeline**: Assets are processed via MGCB (MonoGame Content Builder). Different from Unity's asset import",
    "**ECS is optional**: MonoGame doesn't force any architecture. ECS (via Arch, DefaultEcs) is recommended but not required",
    "**`SpriteBatch` for rendering**: All 2D rendering goes through SpriteBatch. No SpriteRenderer component — you draw manually",
    "**NuGet for packages**: MonoGame uses NuGet instead of Unity Asset Store / Package Manager",
  ],
  "monogame→godot": [
    "**Node tree replaces ECS**: Godot uses node composition instead of entities + components. Think 'scenes as reusable prefabs'",
    "**Built-in physics**: No need for Aether.Physics2D — Godot has CharacterBody2D, RigidBody2D, Area2D built in",
    "**Visual editor**: Godot has a full scene editor, inspector, animation editor. Less code-only workflow",
    "**GDScript vs C#**: GDScript is the primary language (Python-like). C# is supported but smaller ecosystem",
    "**Signals vs C# events**: Use Godot signals for decoupled communication instead of C# event/delegate patterns",
    "**No manual Draw()**: Godot handles rendering. You configure node properties (Sprite2D, AnimationPlayer) instead of `SpriteBatch.Draw()`",
    "**TileMap built in**: No need for Tiled import — Godot has native TileMapLayer with auto-tiling, physics, navigation",
  ],
  "monogame→unity": [
    "**Component-based**: Attach MonoBehaviours to GameObjects instead of managing entity-component relationships manually",
    "**Visual editor**: Unity's Scene view replaces code-only level building. Use the Inspector for property tweaking",
    "**Built-in everything**: Physics (PhysX/Box2D), UI (UI Toolkit), audio (AudioMixer), animation (Mecanim) — all built in",
    "**Asset Store**: Third-party packages via Package Manager and Asset Store. Replaces NuGet workflow",
    "**No manual game loop**: Unity manages Update/FixedUpdate/LateUpdate lifecycle automatically",
    "**C# differences**: Unity uses an older C# version (incrementally upgrading). Some modern C# features may not be available",
    "**Garbage collection**: Unity's GC is generational (Incremental GC). Be mindful of allocations in Update loops",
  ],
  "godot→unity": [
    "**GameObjects not nodes**: Unity's hierarchy is flatter. Components are attached, not child nodes",
    "**C# required**: No equivalent to GDScript. Unity C# has some API quirks (coroutines, special null handling)",
    "**No signals**: Use C# events, UnityEvent, or a custom event bus. `SendMessage()` exists but is reflection-based (slow)",
    "**Prefabs not scenes**: Unity prefabs are similar to Godot's PackedScene but with override/variant workflow",
    "**`[SerializeField]` not `@export`**: Inspector exposure uses attributes",
    "**Coroutines not `await`**: Unity coroutines use `yield return` (IEnumerator). Async/await support is limited",
    "**Two render pipelines**: Choose URP (recommended) or HDRP. Built-in (BIRP) is deprecated in 6.5+",
    "**ECS is separate**: Unity DOTS/Entities is opt-in and has a steep learning curve. Most projects use GameObjects",
  ],
  "godot→monogame": [
    "**Code-only**: No visual editor. Level design via code or external tools (Tiled, LDtk)",
    "**Manual rendering**: You call `SpriteBatch.Draw()` explicitly. No automatic node rendering",
    "**No built-in physics**: Implement collision yourself or use Aether.Physics2D",
    "**C# everywhere**: No GDScript equivalent. Full .NET ecosystem available via NuGet",
    "**Manual architecture**: Choose your own pattern (ECS, component, inheritance). Nothing prescribed",
    "**Content Pipeline**: Assets processed at build time via MGCB. Different from Godot's resource import",
    "**No signals**: Use C# events/delegates or implement an event bus pattern",
  ],
};

/**
 * Extract preview text from doc content.
 */
function extractPreview(content: string, maxLen: number = 200): string {
  const lines = content.split("\n");
  let pastTitle = false;
  const paraLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# ")) { pastTitle = true; continue; }
    if (!pastTitle) continue;
    const trimmed = line.trim();
    if (trimmed === "" && paraLines.length > 0) break;
    if (trimmed === "" || trimmed.startsWith("![") || trimmed.startsWith("---") || trimmed.startsWith("```")) continue;
    if (trimmed.startsWith("## ") && paraLines.length > 0) break;
    const clean = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`]/g, "")
      .replace(/^>\s*/, "");
    paraLines.push(clean);
  }

  const preview = paraLines.join(" ");
  if (preview.length > maxLen) {
    const trunc = preview.slice(0, maxLen);
    const lastSpace = trunc.lastIndexOf(" ");
    return (lastSpace > maxLen * 0.5 ? trunc.slice(0, lastSpace) : trunc) + "…";
  }
  return preview || "(No preview available)";
}

/**
 * Resolve an engine name to its canonical lowercase form.
 */
function resolveEngine(
  input: string,
  modulesMeta: ModuleMetadata[]
): { engine: string; moduleId: string | null } | null {
  const lower = input.toLowerCase();

  for (const mod of modulesMeta) {
    const eng = mod.engine.toLowerCase();
    if (eng === lower || mod.id.toLowerCase() === lower) {
      return { engine: mod.engine.toLowerCase(), moduleId: mod.id };
    }
    // Partial match
    if (eng.includes(lower) || lower.includes(eng)) {
      return { engine: mod.engine.toLowerCase(), moduleId: mod.id };
    }
  }

  // Check known engines even without modules present
  const knownEngines = ["godot", "monogame", "unity", "bevy", "unreal"];
  const match = knownEngines.find((e) => e.includes(lower) || lower.includes(e));
  if (match) return { engine: match, moduleId: null };

  return null;
}

/**
 * Handle migration_guide tool — generates migration guidance between two engines.
 */
export function handleMigrationGuide(
  args: MigrationGuideArgs,
  docStore: DocStore,
  searchEngine: SearchEngine,
  modulesMeta: ModuleMetadata[]
): { content: Array<{ type: "text"; text: string }> } {
  const maxDocs = args.maxDocs ?? 3;

  // Resolve engines
  const fromResolved = resolveEngine(args.from, modulesMeta);
  const toResolved = resolveEngine(args.to, modulesMeta);

  if (!fromResolved) {
    const available = [
      ...new Set([
        ...modulesMeta.map((m) => m.engine),
        "Unity", "Bevy", "Unreal",
      ]),
    ];
    return {
      content: [{
        type: "text",
        text: `Unknown source engine: "${args.from}".\n\nKnown engines: ${available.join(", ")}\n\nTip: Use \`list_modules\` to see engines with available documentation.`,
      }],
    };
  }

  if (!toResolved) {
    const available = [
      ...new Set([
        ...modulesMeta.map((m) => m.engine),
        "Unity", "Bevy", "Unreal",
      ]),
    ];
    return {
      content: [{
        type: "text",
        text: `Unknown target engine: "${args.to}".\n\nKnown engines: ${available.join(", ")}\n\nTip: Use \`list_modules\` to see engines with available documentation.`,
      }],
    };
  }

  if (fromResolved.engine === toResolved.engine) {
    return {
      content: [{
        type: "text",
        text: `Source and target engine are the same ("${args.from}"). Specify two different engines to get migration guidance.`,
      }],
    };
  }

  const fromLabel = fromResolved.engine.charAt(0).toUpperCase() + fromResolved.engine.slice(1);
  const toLabel = toResolved.engine.charAt(0).toUpperCase() + toResolved.engine.slice(1);
  const fromEngine = fromResolved.engine;
  const toEngine = toResolved.engine;

  const lines: string[] = [];
  lines.push(`# Migration Guide: ${fromLabel} → ${toLabel}\n`);

  // Filter concept mappings by topic if provided
  let concepts = CONCEPT_MAPPINGS;
  if (args.topic) {
    const topicLower = args.topic.toLowerCase();
    const filtered = concepts.filter((c) =>
      c.concept.toLowerCase().includes(topicLower) ||
      c.description.toLowerCase().includes(topicLower) ||
      (c.mappings[fromEngine] ?? "").toLowerCase().includes(topicLower) ||
      (c.mappings[toEngine] ?? "").toLowerCase().includes(topicLower)
    );
    if (filtered.length > 0) {
      concepts = filtered;
    }
    // If no concept matches the topic, still show all concepts but note the filter
  }

  // Section 1: Concept mapping table
  lines.push(`## 🔄 Concept Mapping\n`);
  lines.push(`| Concept | ${fromLabel} | ${toLabel} |`);
  lines.push(`|---------|${"-".repeat(Math.max(fromLabel.length, 5))}|${"-".repeat(Math.max(toLabel.length, 5))}|`);

  for (const concept of concepts) {
    const fromMapping = concept.mappings[fromEngine] ?? "_No equivalent_";
    const toMapping = concept.mappings[toEngine] ?? "_No equivalent_";
    lines.push(`| **${concept.concept}** | ${fromMapping} | ${toMapping} |`);
  }
  lines.push("");

  // Section 2: Migration gotchas
  const gotchaKey = `${fromEngine}→${toEngine}`;
  const gotchas = MIGRATION_GOTCHAS[gotchaKey];
  if (gotchas) {
    lines.push(`## ⚠️ Key Differences & Gotchas\n`);
    for (const gotcha of gotchas) {
      lines.push(`- ${gotcha}`);
    }
    lines.push("");
  }

  // Section 3: Relevant docs from both engines
  const topicQuery = args.topic ?? "architecture patterns tutorial";

  // Search source engine docs
  if (fromResolved.moduleId) {
    const fromDocs = docStore.getAllDocs().filter((d) => d.module === fromResolved.moduleId);
    if (fromDocs.length > 0) {
      const searchTerms = args.topic ?? "getting started architecture";
      const fromResults = searchEngine.search(searchTerms, fromDocs, maxDocs * 2)
        .filter((r) => r.score > 0.3)
        .slice(0, maxDocs);

      if (fromResults.length > 0) {
        lines.push(`## 📖 ${fromLabel} Reference Docs\n`);
        lines.push(`_Review these to understand ${fromLabel} patterns before migrating:_\n`);
        for (const r of fromResults) {
          lines.push(`- **${r.doc.id}** — ${r.doc.title} _(${r.doc.category})_`);
          lines.push(`  → \`get_doc("${r.doc.id}")\``);
        }
        lines.push("");
      }
    }
  }

  // Search target engine docs
  if (toResolved.moduleId) {
    const toDocs = docStore.getAllDocs().filter((d) => d.module === toResolved.moduleId);
    if (toDocs.length > 0) {
      const searchTerms = args.topic ?? "getting started architecture";
      const toResults = searchEngine.search(searchTerms, toDocs, maxDocs * 2)
        .filter((r) => r.score > 0.3)
        .slice(0, maxDocs);

      if (toResults.length > 0) {
        lines.push(`## 📖 ${toLabel} Docs to Learn\n`);
        lines.push(`_Start with these to learn ${toLabel}'s approach:_\n`);
        for (const r of toResults) {
          lines.push(`- **${r.doc.id}** — ${r.doc.title} _(${r.doc.category})_`);
          lines.push(`  → \`get_doc("${r.doc.id}")\``);
        }
        lines.push("");
      }
    }
  }

  // Search topic-specific docs from both engines if topic is provided
  if (args.topic && (fromResolved.moduleId || toResolved.moduleId)) {
    const topicConcepts = concepts.filter((c) =>
      c.concept.toLowerCase().includes(args.topic!.toLowerCase())
    );

    for (const concept of topicConcepts) {
      // Find docs using concept-specific search terms
      for (const [eng, resolved] of [[fromEngine, fromResolved], [toEngine, toResolved]] as const) {
        if (!resolved.moduleId) continue;
        const terms = concept.searchTerms[eng];
        if (!terms || terms.length === 0) continue;

        const engDocs = docStore.getAllDocs().filter((d) => d.module === resolved.moduleId);
        const results = searchEngine.search(terms.join(" "), engDocs, 2)
          .filter((r) => r.score > 0.5);

        if (results.length > 0) {
          const engLabel = eng.charAt(0).toUpperCase() + eng.slice(1);
          lines.push(`### ${concept.concept} in ${engLabel}\n`);
          for (const r of results) {
            lines.push(`- **${r.doc.id}** — ${r.doc.title}`);
            lines.push(`  ${extractPreview(r.doc.content, 150)}`);
            lines.push(`  → \`get_doc("${r.doc.id}")\``);
          }
          lines.push("");
        }
      }
    }
  }

  // Search core theory docs relevant to the topic
  const coreDocs = docStore.getAllDocs().filter((d) => d.module === "core");
  if (coreDocs.length > 0) {
    const coreQuery = args.topic ?? "architecture game development patterns";
    const coreResults = searchEngine.search(coreQuery, coreDocs, 3)
      .filter((r) => r.score > 0.8)
      .slice(0, 2);

    if (coreResults.length > 0) {
      lines.push(`## 🧩 Engine-Agnostic Theory\n`);
      lines.push(`_These core docs apply regardless of engine:_\n`);
      for (const r of coreResults) {
        lines.push(`- **${r.doc.id}** — ${r.doc.title} → \`get_doc("${r.doc.id}")\``);
      }
      lines.push("");
    }
  }

  // Section 4: Migration strategy
  lines.push(`## 🗺️ Migration Strategy\n`);
  lines.push(`1. **Learn the paradigm** — Don't try to replicate ${fromLabel} patterns in ${toLabel}. Embrace ${toLabel}'s native architecture`);
  lines.push(`2. **Start small** — Build a tiny prototype (one screen, one mechanic) in ${toLabel} before migrating your full project`);
  lines.push(`3. **Port logic, not code** — Game logic (rules, formulas, balance) transfers; engine-specific code doesn't`);
  lines.push(`4. **Use the theory docs** — Our engine-agnostic concepts (${coreDocs.length > 0 ? "`core` module" : "coming soon"}) provide patterns that work in any engine`);

  if (toResolved.moduleId) {
    const toMod = modulesMeta.find((m) => m.id === toResolved.moduleId);
    if (toMod?.hasRules) {
      lines.push(`5. **Read the AI rules** — \`get_doc("${toMod.id.replace("-arch", "")}-rules")\` has ${toLabel}-specific patterns and anti-patterns for AI-assisted development`);
    }
  }

  lines.push("");

  // Docs coverage note
  const fromHasDocs = fromResolved.moduleId !== null;
  const toHasDocs = toResolved.moduleId !== null;
  if (!fromHasDocs && !toHasDocs) {
    lines.push(`---\n\n_⚠️ Neither ${fromLabel} nor ${toLabel} have dedicated doc modules yet. The concept mappings above are based on general engine knowledge. Use \`list_modules\` to see available engines with full documentation._\n`);
  } else if (!fromHasDocs) {
    lines.push(`---\n\n_ℹ️ ${fromLabel} doesn't have a dedicated doc module yet. ${toLabel} docs are available — use \`search_docs\` with engine="${toLabel}" to explore._\n`);
  } else if (!toHasDocs) {
    lines.push(`---\n\n_ℹ️ ${toLabel} doesn't have a dedicated doc module yet. ${fromLabel} docs are available — the concept mapping above should help you translate patterns._\n`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
