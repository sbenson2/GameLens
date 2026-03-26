/** Session co-pilot state and logic */

export interface SessionState {
  phase: "briefing" | "working";
  path: "plan" | "decide" | "feature" | "debug" | "scope" | "none";
  step: number;
  totalSteps: number;
  milestone: string;
  currentFocus: string;
  decisions: string[];
  tasks: { text: string; done: boolean }[];
  openItems: string[];
  docsConsulted: string[];
  lastUpdated: string;
}

const PATH_STEPS: Record<string, { name: string; steps: string[] }> = {
  plan: {
    name: "Plan",
    steps: ["Pillars", "Milestone", "Progress", "Priorities", "Scope Check", "Open Decisions"],
  },
  decide: {
    name: "Decide",
    steps: ["Frame", "Options", "Pillar Check", "Recommend", "Document"],
  },
  feature: {
    name: "Feature",
    steps: ["Read Docs", "Minimum Playable", "Vertical Slice", "Decisions", "Risk"],
  },
  debug: {
    name: "Debug",
    steps: ["Reproduce", "Isolate", "Hypothesize", "Fix", "Verify"],
  },
  scope: {
    name: "Scope",
    steps: ["Inventory", "Polaris Triage", "Pillar Alignment", "MoSCoW", "AI Check"],
  },
};

const TOPIC_DOC_MAP: Record<string, string[]> = {
  architecture: ["E1"],
  rendering: ["G2"],
  shaders: ["G27"],
  physics: ["G3", "physics-theory"],
  collision: ["G3", "physics-theory"],
  ai: ["G4", "ai-theory"],
  "behavior tree": ["G4", "ai-theory"],
  fsm: ["G4", "ai-theory"],
  ui: ["G5", "ui-theory"],
  "ui architecture": ["ui-theory", "G5"],
  "hud": ["ui-theory", "G5"],
  "heads up display": ["ui-theory"],
  "health bar": ["ui-theory", "G5", "G64"],
  "inventory ui": ["ui-theory", "G10"],
  "tooltip": ["ui-theory"],
  "drag and drop": ["ui-theory", "G10"],
  "typewriter effect": ["ui-theory", "G62"],
  "dialogue tree": ["ui-theory", "G62", "narrative-theory"],
  "screen manager": ["ui-theory", "scene-management-theory"],
  "data binding": ["ui-theory"],
  "focus system": ["ui-theory", "input-handling-theory"],
  "gamepad navigation": ["ui-theory", "input-handling-theory"],
  "ui accessibility": ["ui-theory", "G35"],
  "9-slice": ["ui-theory"],
  "nine slice": ["ui-theory"],
  "retained mode": ["ui-theory"],
  "immediate mode": ["ui-theory"],
  audio: ["G6", "audio-theory"],
  input: ["G7", "input-handling-theory"],
  content: ["G8"],
  "game systems": ["G10"],
  inventory: ["G10"],
  dialogue: ["G10", "narrative-theory"],
  "save/load": ["G10"],
  camera: ["G20", "camera-theory"],
  particles: ["godot-arch/G15", "G23", "particles-theory"],
  pathfinding: ["G40", "pathfinding-theory"],
  "scene management": ["G38", "scene-management-theory"],
  animation: ["G31", "animation-theory"],
  tilemap: ["G37", "tilemap-theory"],
  lighting: ["G39", "lighting-2d-theory"],
  procedural: ["G53", "procedural-generation-theory"],
  "game loop": ["G15", "game-loop-theory"],
  tweening: ["G41", "tweening-theory"],
  "fog of war": ["G54", "fog-of-war-theory"],
  character: ["G52", "character-controller-theory"],
  platformer: ["G52", "G56", "character-controller-theory"],
  display: ["G19"],
  resolution: ["G19"],
  coordinates: ["G21"],
  parallax: ["G22"],
  patterns: ["G12", "G18"],
  performance: ["G13", "G33"],
  "game feel": ["C1", "C2"],
  "game design": ["E6"],
  scope: ["E9", "E4"],
  "solo dev": ["E9", "E4"],
  "solo developer": ["E9", "E4"],
  "ai workflow": ["E9", "E5"],
  "ai coding": ["E9", "E5"],
  "vibe coding": ["E9"],
  burnout: ["E9", "E4"],
  "scope creep": ["E9", "E4"],
  "version control": ["E9"],
  "git workflow": ["E9"],
  kanban: ["E9", "E4"],
  "project management": ["E4", "E9", "P0"],
  "decision record": ["E9"],
  adr: ["E9"],
  "game launch": ["E9", "P7", "P14"],
  wishlist: ["E9", "P14"],
  "community building": ["E9", "P14"],
  "indie dev": ["E9", "E4"],
  "playbook": ["E9", "P0"],
  debugging: ["G16"],
  testing: ["G17"],
  networking: ["G9"],
  deployment: ["G32"],
  localization: ["G34"],
  accessibility: ["G35"],
  combat: ["G64", "combat-theory", "character-controller-theory"],
  "combat theory": ["combat-theory"],
  "damage system": ["G64", "combat-theory"],
  "damage pipeline": ["combat-theory", "G64"],
  "hitbox": ["G64", "combat-theory"],
  "hurtbox": ["G64", "combat-theory"],
  "knockback": ["G64", "combat-theory"],
  "invincibility": ["combat-theory", "G64"],
  "i-frames": ["combat-theory", "G64"],
  "hit stop": ["combat-theory", "G64"],
  "critical hit": ["combat-theory", "G64"],
  "armor": ["combat-theory", "G64"],
  "status effect": ["combat-theory"],
  "turn-based": ["combat-theory"],
  "melee": ["combat-theory", "G64"],
  "projectile": ["combat-theory", "G64"],
  "raycasting": ["G3", "godot-arch/G5"],
  "spatial hash": ["G3"],
  "broad phase": ["G3"],
  "quadtree": ["G3"],
  "verlet": ["G3"],
  "rope": ["G3"],
  "cloth": ["G3"],
  "soft body": ["G3"],
  "swept aabb": ["G3"],
  "continuous collision": ["G3"],
  "ccd": ["G3"],
  "tunneling": ["G3"],
  "fixed point": ["G3"],
  "deterministic physics": ["G3", "networking-theory"],
  "rollback": ["G3", "networking-theory"],
  "trigger zone": ["G3", "godot-arch/G5"],
  "sensor": ["G3", "godot-arch/G5"],
  "aether": ["G3"],
  "aether physics": ["G3"],
  "joint": ["G3"],
  "top-down movement": ["G3"],
  "wall sliding": ["G3"],
  "dash": ["G3"],
  "slope": ["G3", "G52"],
  "interpolation": ["G3"],
  economy: ["G65"],
  shop: ["G65"],
  currency: ["G65"],
  "loot": ["G65"],
  building: ["G66"],
  placement: ["G66"],
  construction: ["G66"],
  "tower placement": ["G66"],
  // Godot docs
  "godot": ["godot-arch/E1", "godot-arch/G1"],
  "gdscript": ["godot-arch/E1", "godot-arch/E2"],
  "gdscript vs csharp": ["godot-arch/E2"],
  "godot csharp": ["godot-arch/E2"],
  "godot c#": ["godot-arch/E2"],
  "language choice": ["godot-arch/E2"],
  "unity migration": ["godot-arch/E2"],
  "godot dotnet": ["godot-arch/E2"],
  "scene composition": ["godot-arch/G1"],
  "node tree": ["godot-arch/E1", "godot-arch/G1"],
  "signals": ["godot-arch/E1", "godot-arch/G3"],
  "godot state machine": ["godot-arch/G2"],
  "godot signals": ["godot-arch/G3"],
  "godot physics": ["godot-arch/G5", "physics-theory"],
  "characterbody2d": ["godot-arch/G5"],
  "rigidbody2d": ["godot-arch/G5"],
  "area2d": ["godot-arch/G5", "godot-arch/G3"],
  "collision layers": ["godot-arch/G5"],
  "collision mask": ["godot-arch/G5"],
  "one-way platform": ["godot-arch/G5"],
  "moving platform": ["godot-arch/G5"],
  "raycast": ["G3", "godot-arch/G5"],
  "godot raycast": ["godot-arch/G5"],
  "godot collision": ["godot-arch/G5"],
  "godot camera": ["godot-arch/G6", "camera-theory"],
  "camera2d": ["godot-arch/G6"],
  "screen shake": ["godot-arch/G6", "G20"],
  "camera shake": ["godot-arch/G6", "G20"],
  "camera zoom": ["godot-arch/G6", "G20"],
  "camera deadzone": ["godot-arch/G6", "G20"],
  "look ahead": ["godot-arch/G6", "G20"],
  "look-ahead": ["godot-arch/G6", "G20"],
  "multi-target camera": ["godot-arch/G6", "G20"],
  "split screen": ["godot-arch/G6", "G20"],
  "camera zone": ["godot-arch/G6"],
  "pixel perfect": ["godot-arch/G6"],
  "cinematic camera": ["godot-arch/G6", "G20"],
  "godot input": ["godot-arch/G4"],
  "input handling": ["G7", "godot-arch/G4"],
  "input buffer": ["godot-arch/G4"],
  "rebind": ["godot-arch/G4"],
  "gamepad": ["godot-arch/G4"],
  "combo": ["godot-arch/G4"],
  "controller": ["godot-arch/G4"],
  "stitch": ["G_stitch_ui_workflow"],
  "stitch ui": ["G_stitch_ui_workflow"],
  "vibe design": ["G_stitch_ui_workflow"],
  "ui prototyping": ["G_stitch_ui_workflow", "G5"],
  "ui design": ["G_stitch_ui_workflow", "G5"],
  "game ui": ["G_stitch_ui_workflow", "G5"],
  "voice canvas": ["G_stitch_ui_workflow"],
  "design.md": ["G_stitch_ui_workflow"],
  "godot tilemap": ["godot-arch/G7", "tilemap-theory"],
  "tilemaplayer": ["godot-arch/G7"],
  "tileset": ["godot-arch/G7"],
  "terrain auto-tile": ["godot-arch/G7"],
  "auto-tile": ["godot-arch/G7", "G37"],
  "terrain painting": ["godot-arch/G7"],
  "godot terrain": ["godot-arch/G7"],
  "bsp dungeon": ["godot-arch/G7", "G53"],
  "cellular automata": ["godot-arch/G7", "G53"],
  "wave function collapse": ["godot-arch/G7", "G53"],
  "wfc": ["godot-arch/G7", "G53"],
  "chunk": ["godot-arch/G7"],
  "infinite world": ["godot-arch/G7"],
  "procedural dungeon": ["godot-arch/G7", "G53"],
  "isometric": ["godot-arch/G7", "G37"],
  "hex": ["godot-arch/G7", "G37"],
  "hexagonal": ["godot-arch/G7", "G37"],
  "destructible terrain": ["godot-arch/G7"],
  "fog of war godot": ["godot-arch/G7", "fog-of-war-theory"],
  "y-sort": ["godot-arch/G7"],
  "tile pathfinding": ["godot-arch/G7", "pathfinding-theory"],
  "astar grid": ["godot-arch/G7", "G40"],
  "godot animation": ["godot-arch/G8", "animation-theory"],
  "animationplayer": ["godot-arch/G8"],
  "animationtree": ["godot-arch/G8"],
  "blend tree": ["godot-arch/G8"],
  "blend space": ["godot-arch/G8"],
  "sprite sheet": ["godot-arch/G8", "G31"],
  "tween": ["godot-arch/G8", "G41", "tweening-theory"],
  "godot tween": ["godot-arch/G8"],
  "squash and stretch": ["godot-arch/G8"],
  "hit flash": ["godot-arch/G8", "combat-theory"],
  "hit freeze": ["godot-arch/G8", "combat-theory"],
  "cutscene": ["godot-arch/G8"],
  "typewriter": ["godot-arch/G8", "ui-theory"],
  "animation state machine": ["godot-arch/G8", "godot-arch/G2"],
  "aseprite": ["godot-arch/G8"],
  "godot ui": ["godot-arch/G9", "ui-theory"],
  "godot hud": ["godot-arch/G9", "ui-theory"],
  "godot menu": ["godot-arch/G9"],
  "godot inventory": ["godot-arch/G9", "ui-theory"],
  "godot dialogue": ["godot-arch/G9"],
  "godot shop": ["godot-arch/G9"],
  "godot tooltip": ["godot-arch/G9", "ui-theory"],
  "godot theme": ["godot-arch/G9"],
  "control node": ["godot-arch/G9"],
  "godot settings": ["godot-arch/G9"],
  "pause menu": ["godot-arch/G9"],
  "screen transition": ["godot-arch/G9"],
  "damage number": ["godot-arch/G9", "combat-theory"],
  "godot focus": ["godot-arch/G9", "godot-arch/G4"],
  "cooldown ui": ["godot-arch/G9"],
  "notification toast": ["godot-arch/G9"],
  "stylebox": ["godot-arch/G9"],
  "anchor preset": ["godot-arch/G9"],
  "safe area": ["godot-arch/G9"],
  "godot audio": ["godot-arch/G10", "audio-theory"],
  "audio bus": ["godot-arch/G10", "audio-theory"],
  "audiostreamplayer": ["godot-arch/G10"],
  "sound effect": ["godot-arch/G10", "G6"],
  "music crossfade": ["godot-arch/G10", "audio-theory"],
  "spatial audio": ["godot-arch/G10", "audio-theory"],
  "sound pool": ["godot-arch/G10", "audio-theory"],
  "adaptive music": ["godot-arch/G10", "audio-theory"],
  "layered music": ["godot-arch/G10", "audio-theory"],
  "footstep sound": ["godot-arch/G10"],
  "audio effect": ["godot-arch/G10"],
  "music ducking": ["godot-arch/G10", "audio-theory"],
  "ambient sound": ["godot-arch/G10"],
  "audiostreamrandomizer": ["godot-arch/G10"],
  "godot volume": ["godot-arch/G10", "godot-arch/G9"],
  "audio listener": ["godot-arch/G10"],
  "godot save": ["godot-arch/G11"],
  "godot load": ["godot-arch/G11"],
  "save system": ["godot-arch/G11", "G69"],
  "save game": ["godot-arch/G11", "G69"],
  "load game": ["godot-arch/G11", "G69"],
  "serialization": ["godot-arch/G11", "G69"],
  "json save": ["godot-arch/G11"],
  "save slot": ["godot-arch/G11", "G69"],
  "autosave": ["godot-arch/G11", "G69"],
  "save migration": ["godot-arch/G11", "G69"],
  "save version": ["godot-arch/G11", "G69"],
  "configfile": ["godot-arch/G11", "godot-arch/G9"],
  "fileaccess": ["godot-arch/G11"],
  "world state": ["godot-arch/G11", "godot-arch/G7"],
  "persistent data": ["godot-arch/G11"],
  "encrypted save": ["godot-arch/G11"],
  "settings persistence": ["godot-arch/G11", "godot-arch/G9"],
  "godot shader": ["godot-arch/G12"],
  "gdshader": ["godot-arch/G12"],
  "canvas_item shader": ["godot-arch/G12"],
  "shader material": ["godot-arch/G12"],
  "visual shader": ["godot-arch/G12"],
  "dissolve effect": ["godot-arch/G12", "combat-theory"],
  "outline shader": ["godot-arch/G12"],
  "palette swap": ["godot-arch/G12"],
  "water shader": ["godot-arch/G12"],
  "post processing": ["godot-arch/G12"],
  "vignette": ["godot-arch/G12"],
  "crt effect": ["godot-arch/G12"],
  "scanline": ["godot-arch/G12"],
  "chromatic aberration": ["godot-arch/G12"],
  "heat haze": ["godot-arch/G12"],
  "shockwave": ["godot-arch/G12"],
  "godot particles": ["godot-arch/G15", "godot-arch/G12", "particles-theory"],
  "gpuparticles2d": ["godot-arch/G15"],
  "cpuparticles2d": ["godot-arch/G15"],
  "particle system": ["godot-arch/G15", "G23", "particles-theory"],
  "particle trail": ["godot-arch/G15"],
  "sub-emitter": ["godot-arch/G15"],
  "particle shader": ["godot-arch/G15", "godot-arch/G12"],
  "vfx": ["godot-arch/G15", "godot-arch/G12"],
  "visual effects": ["godot-arch/G15", "godot-arch/G12"],
  "explosion effect": ["godot-arch/G15", "combat-theory"],
  "rain effect": ["godot-arch/G15"],
  "fire effect": ["godot-arch/G15"],
  "smoke effect": ["godot-arch/G15"],
  "particle material": ["godot-arch/G15"],
  "particleprocessmaterial": ["godot-arch/G15"],
  "ribbon trail": ["godot-arch/G15"],
  "emission shape": ["godot-arch/G15"],
  "godot lighting": ["godot-arch/G12", "lighting-2d-theory"],
  "pointlight2d": ["godot-arch/G12"],
  "light occluder": ["godot-arch/G12"],
  "day night cycle": ["godot-arch/G12"],
  "normal map 2d": ["godot-arch/G12"],
  "gdshaderinc": ["godot-arch/G12"],
  "shader include": ["godot-arch/G12"],
  "greyscale shader": ["godot-arch/G12"],
  "desaturation": ["godot-arch/G12"],
  "screen texture": ["godot-arch/G12"],
  "backbuffercopy": ["godot-arch/G12"],
  "particle pool": ["godot-arch/G15", "godot-arch/G12", "G67"],
  "trail effect": ["godot-arch/G15", "godot-arch/G12"],
  "dust particles": ["godot-arch/G15", "godot-arch/G12"],
  "godot multiplayer": ["godot-arch/G13", "networking-theory"],
  "godot networking": ["godot-arch/G13", "networking-theory"],
  "enet": ["godot-arch/G13", "networking-theory"],
  "rpc": ["godot-arch/G13", "networking-theory"],
  "remote procedure call": ["godot-arch/G13"],
  "multiplayerspawner": ["godot-arch/G13"],
  "multiplayersynchronizer": ["godot-arch/G13"],
  "client prediction": ["godot-arch/G13", "networking-theory"],
  "reconciliation": ["godot-arch/G13", "networking-theory"],
  "lag compensation": ["godot-arch/G13", "networking-theory"],
  "server rewind": ["godot-arch/G13", "networking-theory"],
  "lobby system": ["godot-arch/G13"],
  "godot lobby": ["godot-arch/G13"],
  "authoritative server": ["godot-arch/G13", "networking-theory"],
  "websocket multiplayer": ["godot-arch/G13"],
  "webrtc": ["godot-arch/G13", "networking-theory"],
  "multiplayer spawner": ["godot-arch/G13"],
  "multiplayer synchronizer": ["godot-arch/G13"],
  "peer id": ["godot-arch/G13"],
  "multiplayer authority": ["godot-arch/G13"],
  "interest management": ["godot-arch/G13", "networking-theory"],
  "delta compression": ["godot-arch/G13", "networking-theory"],
  "network interpolation": ["godot-arch/G13", "networking-theory"],
  "godot navigation": ["godot-arch/G14", "pathfinding-theory"],
  "godot pathfinding": ["godot-arch/G14", "pathfinding-theory"],
  "navigationagent2d": ["godot-arch/G14"],
  "navigationregion2d": ["godot-arch/G14"],
  "navigationserver2d": ["godot-arch/G14"],
  "navigationobstacle2d": ["godot-arch/G14"],
  "navigationlink2d": ["godot-arch/G14"],
  "godot navmesh": ["godot-arch/G14", "pathfinding-theory"],
  "godot astar": ["godot-arch/G14", "pathfinding-theory"],
  "astargrid2d": ["godot-arch/G14", "godot-arch/G7"],
  "astar2d": ["godot-arch/G14"],
  "godot steering": ["godot-arch/G14", "ai-theory"],
  "rvo avoidance": ["godot-arch/G14"],
  "flow field": ["godot-arch/G14", "G40", "pathfinding-theory"],
  "formation movement": ["godot-arch/G14"],
  "chase player": ["godot-arch/G14", "ai-theory"],
  "enemy pathfinding": ["godot-arch/G14", "G40"],
  "enemy follow": ["godot-arch/G14", "ai-theory"],
  "context steering": ["godot-arch/G14"],
  "path smoothing": ["godot-arch/G14", "G40"],
  "navigation layers": ["godot-arch/G14"],
  "travel cost": ["godot-arch/G14"],
};

export function createDefaultState(): SessionState {
  return {
    phase: "briefing",
    path: "none",
    step: 0,
    totalSteps: 0,
    milestone: "Unknown",
    currentFocus: "",
    decisions: [],
    tasks: [],
    openItems: [],
    docsConsulted: [],
    lastUpdated: new Date().toISOString().split("T")[0],
  };
}

export function getRelevantDocs(topic: string): string[] {
  const lower = topic.toLowerCase();
  const docs: Set<string> = new Set();
  for (const [key, ids] of Object.entries(TOPIC_DOC_MAP)) {
    if (lower.includes(key)) {
      for (const id of ids) docs.add(id);
    }
  }
  return [...docs];
}

export function handleSessionAction(
  action: string,
  state: SessionState
): { output: string; state: SessionState } {
  switch (action) {
    case "start":
    case "menu":
      return handleStart(state);
    case "plan":
      return startPath(state, "plan");
    case "decide":
      return startPath(state, "decide");
    case "feature":
      return startPath(state, "feature");
    case "debug":
      return startPath(state, "debug");
    case "scope":
      return startPath(state, "scope");
    case "status":
      return handleStatus(state);
    default:
      return handleStart(state);
  }
}

function handleStart(state: SessionState): { output: string; state: SessionState } {
  const date = new Date().toISOString().split("T")[0];
  const isResume = state.phase === "working" && state.path !== "none";

  let output = "";

  if (isResume) {
    output += `  !! RESUMING SESSION — ${state.lastUpdated} !!\n`;
    output += `  Last focus: ${state.currentFocus || "none"}\n`;
    output += `  Last step: ${state.path} ${state.step}/${state.totalSteps}\n\n`;
  }

  output += `====================================================================
  SESSION BRIEFING                                    ${date}
====================================================================

  Status     ${state.milestone}
  Path       ${state.path === "none" ? "Ready" : PATH_STEPS[state.path]?.name ?? state.path}

  Open Items
  ---------------------------------------------------------------
`;

  if (state.openItems.length === 0) {
    output += "  (none)\n";
  } else {
    for (const item of state.openItems) {
      output += `  - ${item}\n`;
    }
  }

  output += `
====================================================================
  WHAT WOULD YOU LIKE TO DO?
--------------------------------------------------------------------
  1  Plan       Review priorities, progress, scope
  2  Decide     Work through a design/architecture choice
  3  Feature    Design and break down a new feature
  4  Debug      Troubleshoot something broken
  5  Scope      Triage and cut scope
  6  Resume     Pick up from last session's open items
--------------------------------------------------------------------

Type a number, or describe what you're thinking about.`;

  state.phase = "briefing";
  state.lastUpdated = date;

  return { output, state };
}

function startPath(
  state: SessionState,
  pathName: "plan" | "decide" | "feature" | "debug" | "scope"
): { output: string; state: SessionState } {
  const pathDef = PATH_STEPS[pathName];
  state.phase = "working";
  state.path = pathName;
  state.step = 1;
  state.totalSteps = pathDef.steps.length;

  let output = `--- ${pathDef.name.toUpperCase()}  Step 1/${pathDef.steps.length}  ${pathDef.steps[0]} ---\n\n`;

  // Add step-specific guidance
  switch (pathName) {
    case "plan":
      output += "Are design pillars defined for your game? Everything filters through these.\n";
      output += "If not defined yet, let's establish 3-5 statements about what makes your game unique.\n";
      output += "\nRelevant docs: E6 (Game Design Fundamentals), E9 (Solo Dev Playbook)";
      break;
    case "decide":
      output += "State the decision in one sentence.\n";
      output += "Make sure it's actually a decision (not a task or question).\n";
      output += "\nWhat decision do you need to work through?";
      break;
    case "feature":
      output += "What feature are you designing? I'll look up relevant docs for the domain.\n";
      output += "\nDescribe the feature and I'll find the right reference material.";
      break;
    case "debug":
      output += "What exactly happens? When did it start? Can it be reproduced consistently?\n";
      output += "\nDescribe the symptoms.";
      break;
    case "scope":
      output += "Let's inventory everything currently in scope.\n";
      output += "Pull from your design doc, recent work, and backlog.\n";
      output += "\nWhat's the current scope?";
      break;
  }

  return { output, state };
}

function handleStatus(state: SessionState): { output: string; state: SessionState } {
  const date = new Date().toISOString().split("T")[0];
  let output = `====================================================================
  SESSION STATUS                                      ${date}
====================================================================

  Phase      ${state.phase}
  Path       ${state.path === "none" ? "None" : PATH_STEPS[state.path]?.name ?? state.path}
  Step       ${state.step}/${state.totalSteps}
  Milestone  ${state.milestone}
  Focus      ${state.currentFocus || "(none)"}

  Decisions
  ---------------------------------------------------------------
`;
  if (state.decisions.length === 0) {
    output += "  (none this session)\n";
  } else {
    for (const d of state.decisions) {
      output += `  ${d}\n`;
    }
  }

  output += `
  Tasks
  ---------------------------------------------------------------
`;
  if (state.tasks.length === 0) {
    output += "  (none)\n";
  } else {
    for (const t of state.tasks) {
      output += `  [${t.done ? "x" : " "}] ${t.text}\n`;
    }
  }

  output += `
  Open Items
  ---------------------------------------------------------------
`;
  if (state.openItems.length === 0) {
    output += "  (none)\n";
  } else {
    for (const item of state.openItems) {
      output += `  - ${item}\n`;
    }
  }

  output += `
  Docs Consulted: ${state.docsConsulted.join(", ") || "(none)"}
====================================================================`;

  return { output, state };
}

export function serializeState(state: SessionState): string {
  const date = state.lastUpdated;
  let md = `# Session — ${date}\n\n`;
  md += `## Status\n`;
  md += `- Phase: ${state.phase === "briefing" ? "Briefing" : "Working"}\n`;
  md += `- Path: ${state.path === "none" ? "none" : PATH_STEPS[state.path]?.name ?? state.path}\n`;
  md += `- Milestone: ${state.milestone}\n\n`;
  md += `## Current Focus\n${state.currentFocus || "(none)"}\n\n`;
  md += `## Decisions Made\n`;
  if (state.decisions.length === 0) {
    md += "(none)\n";
  } else {
    for (const d of state.decisions) md += `- ${d}\n`;
  }
  md += `\n## Tasks\n`;
  for (const t of state.tasks) {
    md += `- [${t.done ? "x" : " "}] ${t.text}\n`;
  }
  if (state.tasks.length === 0) md += "(none)\n";
  md += `\n## Open Items\n`;
  for (const item of state.openItems) md += `- ${item}\n`;
  if (state.openItems.length === 0) md += "(none)\n";
  md += `\n## Context\n`;
  md += `- Last step: ${state.path !== "none" ? `${PATH_STEPS[state.path]?.name} ${state.step}/${state.totalSteps}` : "none"}\n`;
  md += `- Docs consulted: ${state.docsConsulted.join(", ") || "(none)"}\n`;

  return md;
}
