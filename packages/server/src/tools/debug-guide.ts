import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import { HybridSearchEngine } from "../core/hybrid-search.js";
import { resolveEngineKey, getEngineLabel } from "../core/modules.js";

type ToolResult = { content: Array<{ type: "text"; text: string }> };

interface DebugEntry {
  pattern: RegExp;
  title: string;
  causes: string[];
  steps: string[];
  tips: string[];
  relatedDocs: string[];
}

// Curated common issues for engines with detailed debug entries
const CURATED_ENGINES = ["monogame", "godot", "phaser"] as const;
const COMMON_ISSUES: Record<string, DebugEntry[]> = {
  monogame: [
    {
      pattern: /null\s*ref|nullreference|object reference/i,
      title: "NullReferenceException",
      causes: [
        "Content not loaded yet — accessing Texture2D before LoadContent() runs",
        "Entity queried before being spawned in Arch ECS World",
        "SpriteBatch.Draw called with null texture",
        "Missing Content.mgcb entry — asset not processed by pipeline",
      ],
      steps: [
        "Check stack trace for the exact line and variable that's null",
        "Verify asset exists in Content.mgcb and Build Action is set correctly",
        "Ensure LoadContent() completes before any Draw/Update references the asset",
        "For ECS: confirm entity was created with all required components before querying",
      ],
      tips: [
        "Use conditional breakpoints on the null variable",
        "Add Content Pipeline verbose logging: set ContentManager.RootDirectory and check output",
        "For Arch ECS: use world.Has<T>(entity) checks before accessing components",
      ],
      relatedDocs: ["G1", "G52", "R1"],
    },
    {
      pattern: /content|pipeline|mgcb|asset.*not found|could not load/i,
      title: "Content Pipeline Error",
      causes: [
        "Asset not added to Content.mgcb file",
        "Wrong Build Action (should be 'Build' for most assets, 'Copy' for raw files)",
        "Processor mismatch — wrong importer/processor for file type",
        "File path mismatch — Content.Load<T> path doesn't match .mgcb entry",
      ],
      steps: [
        "Open Content.mgcb in MGCB Editor and verify the asset appears",
        "Check Build Action is 'Build' (not 'Copy') for textures, fonts, effects",
        "Verify the Load path matches: Content.Load<Texture2D>(\"sprites/player\") → Content/sprites/player.png",
        "Clean and rebuild: delete bin/Content/ and rebuild",
      ],
      tips: [
        "Path separators: use forward slashes in Content.Load, no file extension",
        "SpriteFont: needs a .spritefont XML file processed by the pipeline",
        "Consider FontStashSharp for runtime font loading without pipeline",
      ],
      relatedDocs: ["G1", "R1", "G52"],
    },
    {
      pattern: /jitter|stutter|frame.*drop|lag|performance|slow/i,
      title: "Frame Rate Issues / Visual Jitter",
      causes: [
        "GC pressure from allocations every frame (new objects, LINQ, string concat)",
        "Not using fixed timestep — physics and movement tied to variable delta",
        "SpriteBatch.Begin() called with wrong sort mode causing extra draw calls",
        "Too many entities being iterated without spatial partitioning",
      ],
      steps: [
        "Enable IsFixedTimeStep = true in Game1 constructor",
        "Profile with dotnet-counters or Visual Studio Profiler — check GC collections",
        "Count draw calls: use GraphicsDevice.Metrics after each Draw()",
        "Check Update() for allocations: search for 'new', '.ToList()', string concatenation",
      ],
      tips: [
        "Use Span<T> and stackalloc for temporary buffers",
        "Cache query results in Arch ECS — don't recreate QueryDescription each frame",
        "Use SpriteBatch.Begin(sortMode: SpriteSortMode.Deferred) for batching",
        "Implement spatial hashing for collision checks (see G15)",
      ],
      relatedDocs: ["G13", "G33", "G15", "game-loop-theory"],
    },
    {
      pattern: /collision|overlap|physics|body|trigger/i,
      title: "Collision / Physics Issues",
      causes: [
        "AABB bounds not updated after position change",
        "Collision layers/masks not configured — everything collides or nothing does",
        "Tunneling: fast objects pass through thin walls (CCD not enabled)",
        "Using pixel-perfect collision when AABB would suffice (performance)",
      ],
      steps: [
        "Draw collision bounds in debug mode (use SpriteBatch to draw rectangles)",
        "Verify collision response runs AFTER position update, not before",
        "Check entity velocity — if > wall thickness per frame, add swept collision",
        "Log collision events to confirm they fire at all",
      ],
      tips: [
        "MonoGame.Extended has Circle and RectangleF collision helpers",
        "For platformers: separate X and Y collision resolution (see character-controller-theory)",
        "Use spatial hash grid for broadphase when entity count > 50",
      ],
      relatedDocs: ["physics-theory", "character-controller-theory", "G60"],
    },
    {
      pattern: /input|keyboard|mouse|gamepad|controller/i,
      title: "Input Handling Issues",
      causes: [
        "Reading input in Draw() instead of Update() — input state is stale",
        "Not tracking previous state — can't detect press vs hold",
        "Multiple systems consuming the same input without priority",
        "Gamepad not detected — index mismatch or not connected at startup",
      ],
      steps: [
        "Ensure input is read in Update(), stored in a state snapshot",
        "Compare current vs previous frame: IsKeyDown vs WasKeyUp",
        "Check if Apos.Input is configured (simplifies input handling significantly)",
        "For gamepad: verify GamePad.GetState(PlayerIndex.One).IsConnected",
      ],
      tips: [
        "Use Apos.Input library for clean press/hold/release detection",
        "Implement an input buffer for fighting games or tight platformers (3-5 frame window)",
        "Rebindable controls: map actions to keys, not keys to actions",
      ],
      relatedDocs: ["input-handling-theory", "G56"],
    },
  ],
  godot: [
    {
      pattern: /null|invalid.*instance|freed|deleted|dangling/i,
      title: "Invalid Instance / Freed Object",
      causes: [
        "Accessing a node after queue_free() — reference is dangling",
        "Signal connected to a freed node — callback fires on dead object",
        "get_node() path is wrong — returns null, then you call a method on it",
        "Autoload not registered in Project Settings",
      ],
      steps: [
        "Check if the node exists: if is_instance_valid(node)",
        "Use print_tree_pretty() to see the actual scene tree at runtime",
        "Verify node path: $NodeName requires the node to be a direct child",
        "Check Project > Project Settings > Autoload for missing singletons",
      ],
      tips: [
        "Disconnect signals before queue_free(): node.signal.disconnect(callable)",
        "Use weak references or check is_instance_valid() in deferred callbacks",
        "get_node_or_null() is safer than get_node() — returns null instead of error",
      ],
      relatedDocs: ["G2", "G3", "G1"],
    },
    {
      pattern: /signal|emit|connect|callable/i,
      title: "Signal Connection Issues",
      causes: [
        "Signal not defined — typo in signal name",
        "Wrong number of arguments in emit vs connected function",
        "Connecting in _ready() but target node doesn't exist yet (load order)",
        "Lambda/Callable disconnection — can't disconnect anonymous callables",
      ],
      steps: [
        "Check signal is declared: signal my_signal(arg1: Type)",
        "Verify emit argument count matches connected function parameters",
        "Use call_deferred() or await owner.ready if connecting to sibling nodes",
        "Check Debugger > Signals tab to see active connections",
      ],
      tips: [
        "Use a SignalBus autoload for cross-scene communication",
        "Typed signals in Godot 4.4: signal damaged(amount: float) for better editor support",
        "One-shot signals: connect with CONNECT_ONE_SHOT flag",
      ],
      relatedDocs: ["G3", "G1"],
    },
    {
      pattern: /jitter|stutter|frame|lag|performance|slow|fps/i,
      title: "Frame Rate / Performance Issues",
      causes: [
        "Heavy logic in _process() that should be in _physics_process()",
        "Too many nodes in scene tree — Godot has per-node overhead",
        "GDScript bottleneck in hot loop — consider C# or GDExtension for critical paths",
        "Unoptimized shaders or too many draw calls (check overdraw)",
      ],
      steps: [
        "Open Debugger > Monitors to see FPS, physics ticks, and node count",
        "Use Debugger > Profiler to find the slowest functions",
        "Check Scene tree node count — if >10K nodes, consider object pooling",
        "Enable Debug > Visible Collision Shapes to spot unnecessary collision shapes",
      ],
      tips: [
        "Use _physics_process() for movement/physics, _process() for visuals only",
        "Object pool with hide()/show() instead of queue_free()/instantiate()",
        "Disable processing on off-screen nodes: set_process(false) when not visible",
      ],
      relatedDocs: ["game-loop-theory", "G5", "G8"],
    },
    {
      pattern: /physics|collision|body|area|raycast|overlap/i,
      title: "Physics / Collision Issues",
      causes: [
        "Wrong body type — CharacterBody2D vs RigidBody2D vs StaticBody2D",
        "Collision layers/masks not set — bodies are on wrong layers",
        "move_and_slide() not called in _physics_process()",
        "Scale on CollisionShape2D — Godot doesn't support negative scale on shapes",
      ],
      steps: [
        "Enable Debug > Visible Collision Shapes to see all collision shapes",
        "Check collision layer/mask in Inspector — layer = what I am, mask = what I detect",
        "Verify move_and_slide() is in _physics_process(), not _process()",
        "For areas: connect area_entered/body_entered signals and verify they fire",
      ],
      tips: [
        "Use CharacterBody2D for player/enemies (built-in slide, snap, platform detection)",
        "RigidBody2D for throwable objects, projectiles with bounce",
        "Raycasts update once per physics frame — use force_raycast_update() for immediate results",
      ],
      relatedDocs: ["G5", "physics-theory", "character-controller-theory"],
    },
    {
      pattern: /tilemap|tile|terrain|atlas/i,
      title: "TileMap Issues",
      causes: [
        "Tile atlas misconfigured — wrong tile size or margin",
        "Physics layer not set on tiles — no collision on tilemap",
        "TileMap layer order wrong — player renders behind tiles",
        "Navigation layer not configured for pathfinding on tilemap",
      ],
      steps: [
        "In TileSet editor: verify tile size matches your sprite sheet grid",
        "Add Physics Layer in TileSet, then paint collision shapes onto tiles",
        "Check TileMap z-index and CanvasLayer order for rendering",
        "For pathfinding: add Navigation Layer in TileSet and paint navigation polygons",
      ],
      tips: [
        "Use terrain sets for auto-tiling (Godot 4.x feature)",
        "Separate TileMap layers for ground, walls, decorations",
        "Y-sort: enable on TileMap and entities parent for correct depth sorting",
      ],
      relatedDocs: ["G7", "tilemap-theory"],
    },
    {
      pattern: /input|key|mouse|action|event/i,
      title: "Input Handling Issues",
      causes: [
        "Input action not defined in Project > Project Settings > Input Map",
        "Using _input() when _unhandled_input() is more appropriate",
        "Input consumed by UI — Control nodes eat input events before game nodes",
        "is_action_just_pressed() doesn't work in _process() on high FPS (rare)",
      ],
      steps: [
        "Verify action exists in Project Settings > Input Map",
        "Check if a Control node (UI) is intercepting input: set mouse_filter = IGNORE",
        "Use _unhandled_input() for gameplay input (respects UI consumption)",
        "Test with Input.is_action_pressed() first, then switch to just_pressed",
      ],
      tips: [
        "UI panels: set mouse_filter to MOUSE_FILTER_IGNORE on non-interactive elements",
        "Use Input.get_vector() for 2D movement — handles diagonal normalization",
        "Rebindable controls: use InputMap.action_add_event() / action_erase_events()",
      ],
      relatedDocs: ["G4", "input-handling-theory"],
    },
  ],
  phaser: [
    {
      pattern: /null|undefined|cannot read|not a function/i,
      title: "Null / Undefined Reference",
      causes: [
        "Accessing this.player before create() — scene lifecycle not respected",
        "Asset key typo — this.load.image('player') vs this.add.sprite(0, 0, 'playr')",
        "Accessing scene properties from another scene without scene manager",
        "Plugin or physics body not enabled — using arcade methods on non-physics sprite",
      ],
      steps: [
        "Check browser console for the exact error line and property name",
        "Verify all asset keys in preload() match usage in create()/update()",
        "Ensure physics is enabled: this.physics.add.sprite() not this.add.sprite()",
        "Check scene lifecycle: preload → create → update (no create code in preload)",
      ],
      tips: [
        "Use TypeScript for compile-time key checking",
        "Scene data passing: this.scene.start('GameScene', { level: 1 }) → this.data in init()",
        "Registry for cross-scene data: this.registry.set('score', 0)",
      ],
      relatedDocs: ["scene-management-theory"],
    },
    {
      pattern: /load|asset|image|sprite|404|not found|audio/i,
      title: "Asset Loading Issues",
      causes: [
        "Wrong path — Phaser loads relative to index.html, not the JS file",
        "Asset not in public/ directory (Vite) — not served by dev server",
        "Key collision — two assets with same key, second silently fails",
        "Audio not loading — browser requires user interaction before audio plays",
      ],
      steps: [
        "Open browser Network tab — check for 404s on asset URLs",
        "Verify file is in public/assets/ (Vite) or the correct static directory",
        "Check key uniqueness: each this.load.image() key must be unique",
        "For audio: use this.sound.unlock() or wait for user click event",
      ],
      tips: [
        "Vite: put assets in public/ folder, reference as '/assets/sprite.png'",
        "Use this.load.on('loaderror', ...) to catch loading failures",
        "Preload in a dedicated BootScene, then start GameScene",
      ],
      relatedDocs: ["scene-management-theory", "audio-theory"],
    },
    {
      pattern: /physics|collision|overlap|body|velocity|arcade/i,
      title: "Physics / Collision Issues",
      causes: [
        "Sprite not added to physics — use this.physics.add.sprite() not this.add.sprite()",
        "Collider not set up — need this.physics.add.collider(player, walls)",
        "Overlap vs collide confusion — overlap doesn't stop movement, collide does",
        "Immovable not set — both objects push each other (set immovable: true on walls)",
      ],
      steps: [
        "Enable debug: arcade: { debug: true } in game config to see all bodies",
        "Verify both objects are physics-enabled (have body property)",
        "Check collider setup: this.physics.add.collider(a, b, callback)",
        "For platforms: set body.immovable = true and body.allowGravity = false",
      ],
      tips: [
        "Use physics groups: this.physics.add.group() for enemies, bullets, etc.",
        "Overlap for triggers (pickups, damage zones), collide for solid objects",
        "Tile collision: this.physics.add.collider(player, tileLayer)",
      ],
      relatedDocs: ["physics-theory", "character-controller-theory"],
    },
    {
      pattern: /jitter|stutter|performance|slow|fps|frame/i,
      title: "Performance Issues",
      causes: [
        "Creating objects every frame instead of pooling",
        "Too many active physics bodies (>500 without groups)",
        "Large textures not power-of-2 — GPU can't batch efficiently",
        "Update() doing heavy work — move to time events or workers",
      ],
      steps: [
        "Check FPS: this.game.loop.actualFps in update()",
        "Open browser Performance tab — look for long frames",
        "Count active game objects: this.children.length",
        "Check for object creation in update() — use object pools instead",
      ],
      tips: [
        "Object pooling: this.physics.add.group({ maxSize: 50, ... })",
        "Use texture atlases (spritesheet) instead of individual images",
        "Culling: objects off-camera don't need update — check bounds",
      ],
      relatedDocs: ["game-loop-theory"],
    },
    {
      pattern: /input|key|mouse|pointer|touch|gamepad/i,
      title: "Input Issues",
      causes: [
        "Input not enabled on the scene — scene might be paused or sleeping",
        "Cursor keys vs WASD — need to set up both for accessibility",
        "Touch events not working — Phaser input needs pointer configuration",
        "Multiple scenes capturing input — only active scene should handle it",
      ],
      steps: [
        "Verify scene is active: check scene.input.enabled",
        "Set up cursors: this.cursors = this.input.keyboard.createCursorKeys()",
        "For touch: this.input.on('pointerdown', callback)",
        "Check scene order: launched scenes stack, only top processes input by default",
      ],
      tips: [
        "Use this.input.keyboard.addKeys('W,A,S,D') for WASD + cursors",
        "Gamepad: this.input.gamepad.on('connected', pad => ...)",
        "Input priority: set scene.input.topOnly = false to let input pass through",
      ],
      relatedDocs: ["input-handling-theory"],
    },
  ],
};

// Engine alias resolution now uses shared resolveEngineKey() from modules.ts

const GENERAL_DEBUG_TIPS = [
  "**Isolate the problem:** Comment out systems until the bug disappears, then narrow down",
  "**Reproduce reliably:** Find the exact steps to trigger the bug every time",
  "**Check the simple things:** Typos, wrong variable, off-by-one, wrong coordinate space",
  "**Read the error message carefully:** The line number and variable name are usually correct",
  "**Binary search:** If unsure where the bug is, disable half the code and check which half has the bug",
];

/**
 * debug_guide — Takes an error/symptom + engine context, returns ranked causes,
 * diagnostic checklist, and engine-specific debugging tips.
 */
export async function handleDebugGuide(
  args: { error: string; engine?: string; context?: string },
  docStore: DocStore,
  searchEngine: SearchEngine,
  hybridSearch?: HybridSearchEngine,
): Promise<ToolResult> {
  const errorText = args.error.trim();
  if (!errorText) {
    return { content: [{ type: "text", text: "Please describe the error or symptom you're seeing." }] };
  }

  const resolvedEngine = args.engine ? resolveEngineKey(args.engine) : null;

  let output = `# Debug Guide\n\n`;
  output += `**Error/Symptom:** ${errorText}\n`;
  if (resolvedEngine) output += `**Engine:** ${getEngineLabel(resolvedEngine)}\n`;
  if (args.context) output += `**Context:** ${args.context}\n`;
  output += `\n`;

  // Try to match against curated known issues
  const hasCurated = resolvedEngine && (CURATED_ENGINES as readonly string[]).includes(resolvedEngine);
  const engines: string[] = resolvedEngine
    ? (hasCurated ? [resolvedEngine] : [])
    : [...CURATED_ENGINES];
  const matches: Array<{ engine: string; entry: DebugEntry; priority: number }> = [];

  for (const eng of engines) {
    const issues = COMMON_ISSUES[eng] || [];
    for (const entry of issues) {
      if (entry.pattern.test(errorText) || (args.context && entry.pattern.test(args.context))) {
        // Higher priority if both error and context match
        const priority = entry.pattern.test(errorText) && args.context && entry.pattern.test(args.context) ? 2 : 1;
        matches.push({ engine: eng, entry, priority });
      }
    }
  }

  // Sort by priority (highest first)
  matches.sort((a, b) => b.priority - a.priority);

  if (matches.length > 0) {
    // Show top matches (up to 3)
    const shown = matches.slice(0, 3);

    for (const match of shown) {
      const { engine: eng, entry } = match;
      const engineLabel = getEngineLabel(eng);

      output += `## ${entry.title} (${engineLabel})\n\n`;

      output += `### Likely Causes\n\n`;
      for (let i = 0; i < entry.causes.length; i++) {
        output += `${i + 1}. ${entry.causes[i]}\n`;
      }

      output += `\n### Diagnostic Steps\n\n`;
      for (let i = 0; i < entry.steps.length; i++) {
        output += `${i + 1}. ${entry.steps[i]}\n`;
      }

      output += `\n### Tips\n\n`;
      for (const tip of entry.tips) {
        output += `- ${tip}\n`;
      }

      if (entry.relatedDocs.length > 0) {
        output += `\n### Related Docs\n\n`;
        for (const docId of entry.relatedDocs) {
          output += `- \`${docId}\` — use \`get_doc\` for full details\n`;
        }
      }
      output += `\n`;
    }
  } else {
    output += `## No Exact Match Found\n\n`;
    output += `The error doesn't match a known pattern. Searching the knowledge base...\n\n`;
  }

  // Always search knowledge base for additional context
  const searchQuery = `${errorText} ${args.context || ""}`.trim();
  const allDocs = docStore.getAllDocs();
  const results = hybridSearch
    ? await hybridSearch.search(searchQuery, allDocs, 5)
    : searchEngine.search(searchQuery, allDocs, 5).map((r) => ({
        doc: r.doc,
        score: r.score,
        snippet: r.snippet,
        tfidfScore: r.score,
        vectorScore: 0,
      }));

  // Filter by engine if specified
  const filtered = resolvedEngine
    ? results.filter(
        (r) =>
          r.doc.module === "core" ||
          r.doc.module.toLowerCase().includes(resolvedEngine),
      )
    : results;

  if (filtered.length > 0) {
    output += `## Knowledge Base Results\n\n`;
    for (const r of filtered.slice(0, 5)) {
      output += `- \`${r.doc.id}\` — ${r.doc.title} (score: ${r.score.toFixed(2)})\n`;
    }
    output += `\n_Use \`get_doc\` with section parameter to find specific troubleshooting info._\n\n`;
  }

  // General debugging tips
  output += `## General Debugging Approach\n\n`;
  for (const tip of GENERAL_DEBUG_TIPS) {
    output += `${tip}\n`;
  }

  return { content: [{ type: "text", text: output }] };
}
