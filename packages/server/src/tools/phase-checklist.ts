type ToolResult = { content: Array<{ type: "text"; text: string }> };

type Phase = "planning" | "prototype" | "production" | "polish" | "release";

interface ChecklistItem {
  task: string;
  engine?: string;   // if set, only show for this engine
  genre?: string;    // if set, only show for this genre
}

interface PhaseDefinition {
  description: string;
  prerequisites: string[];
  checklist: ChecklistItem[];
  advanceCriteria: string[];
  backtrackSignals: string[];
  tips: string[];
  relatedDocs: string[];
}

const PHASES: Record<Phase, PhaseDefinition> = {
  planning: {
    description: "Define what you're building. Scope it. Write it down.",
    prerequisites: [],
    checklist: [
      { task: "Game concept written in 1-2 sentences" },
      { task: "Core mechanic identified (the ONE thing that must be fun)" },
      { task: "Target platform(s) chosen" },
      { task: "Engine selected and installed" },
      { task: "Art style direction decided (even if placeholder)" },
      { task: "Scope defined: jam / demo / small / full" },
      { task: "GDD draft written (use generate_gdd tool)" },
      { task: "Genre systems identified (use genre_lookup tool)" },
      { task: "Development timeline set (milestones, not deadlines)" },
      // Engine-specific
      { task: "MonoGame templates installed: dotnet new install MonoGame.Templates.CSharp", engine: "monogame" },
      { task: "Godot 4.4+ downloaded from godotengine.org", engine: "godot" },
      { task: "Node.js 18+ installed, Vite configured", engine: "phaser" },
      // Genre-specific
      { task: "Tile size and grid dimensions decided", genre: "platformer" },
      { task: "Tile size and grid dimensions decided", genre: "roguelike" },
      { task: "Card/deck structure designed", genre: "deck-builder" },
      { task: "Level generation rules drafted", genre: "roguelike" },
      { task: "Wave/difficulty curve planned", genre: "tower defense" },
    ],
    advanceCriteria: [
      "You can explain the game in one sentence",
      "You know which engine and genre you're using",
      "You have a written GDD (even a short one)",
    ],
    backtrackSignals: [],
    tips: [
      "Scope down aggressively — cut features, not quality",
      "Don't pick your engine based on what's popular. Pick what you'll finish with.",
      "If you can't explain the core loop in one sentence, you don't have one yet",
    ],
    relatedDocs: ["P0", "P1", "E9", "E6"],
  },
  prototype: {
    description: "Get the core mechanic working. Ugly is fine. Speed matters.",
    prerequisites: ["planning phase complete", "engine installed", "GDD exists"],
    checklist: [
      { task: "Project scaffolded (use scaffold_project tool)" },
      { task: "Player can be controlled (move, jump, shoot, etc.)" },
      { task: "Core mechanic is playable (even with placeholder art)" },
      { task: "One complete game loop works (start → play → win/lose)" },
      { task: "Collision/physics works for core interactions" },
      { task: "Basic input handling functional" },
      { task: "Test with someone else (anyone — even 30 seconds)" },
      // Engine-specific
      { task: "Content Pipeline configured and first asset loads", engine: "monogame" },
      { task: "Arch ECS world set up with at least one system", engine: "monogame" },
      { task: "Main scene created with player node", engine: "godot" },
      { task: "Autoloads registered (SignalBus, GameManager)", engine: "godot" },
      { task: "Game config set up with correct physics mode", engine: "phaser" },
      { task: "At least one scene loads and runs", engine: "phaser" },
      // Genre-specific
      { task: "Character controller feels responsive (coyote time, input buffer)", genre: "platformer" },
      { task: "One procedurally generated room/floor works", genre: "roguelike" },
      { task: "Dialogue tree with at least 3 branches works", genre: "visual novel" },
      { task: "Tower placement + basic enemy pathing works", genre: "tower defense" },
      { task: "Card draw + play + discard cycle works", genre: "deck-builder" },
    ],
    advanceCriteria: [
      "The core mechanic is playable and you can evaluate if it's fun",
      "Someone else has tried it (even briefly)",
      "You haven't spent more than 1-2 weeks here",
    ],
    backtrackSignals: [
      "The core mechanic isn't fun and you've iterated 3+ times",
      "You're building features that aren't the core mechanic",
      "Scope has grown beyond original GDD",
    ],
    tips: [
      "Use colored rectangles instead of art — art makes you reluctant to change",
      "Kill your darlings early — if the core isn't fun now, more features won't fix it",
      "Version control from day 1. Commit early, commit often.",
      "If playtesting reveals the core isn't fun, go back to planning — don't push forward",
    ],
    relatedDocs: ["P2", "E9", "P3"],
  },
  production: {
    description: "Build all the features. Art goes in. Systems get connected.",
    prerequisites: ["prototype works", "core mechanic is validated as fun"],
    checklist: [
      { task: "All core systems implemented (from genre_lookup requirements)" },
      { task: "Real art assets replacing placeholders" },
      { task: "Audio: music and key sound effects in place" },
      { task: "UI/HUD functional (health, score, inventory, etc.)" },
      { task: "Save/load system working" },
      { task: "Menu flow: main menu → play → pause → game over" },
      { task: "Level/content pipeline producing consistently" },
      { task: "State machine for game states (menu, playing, paused, etc.)" },
      { task: "All planned levels/content created" },
      { task: "Camera system finalized (follow, bounds, transitions)" },
      // Engine-specific
      { task: "Content Pipeline builds all assets without errors", engine: "monogame" },
      { task: "SpriteFont or FontStashSharp configured for text", engine: "monogame" },
      { task: "All scenes connected via SceneTree or signal bus", engine: "godot" },
      { task: "Export presets configured for target platform(s)", engine: "godot" },
      { task: "Asset preloading in BootScene complete", engine: "phaser" },
      { task: "Build output tested in target browser(s)", engine: "phaser" },
      // Genre-specific
      { task: "Multiple levels with difficulty progression", genre: "platformer" },
      { task: "Item/loot system with variety", genre: "roguelike" },
      { task: "Full story script implemented", genre: "visual novel" },
      { task: "Multiple tower types with upgrades", genre: "tower defense" },
      { task: "Full card set balanced and testable", genre: "deck-builder" },
    ],
    advanceCriteria: [
      "All planned features are implemented",
      "The game is completable from start to finish",
      "Art and audio are final (or near-final)",
    ],
    backtrackSignals: [
      "You're adding features not in the GDD — that's scope creep",
      "A core system doesn't work and you're building on top of it",
      "Playtesting reveals fundamental design problems",
    ],
    tips: [
      "Playtest weekly — don't save it for the end",
      "Track bugs but don't fix all of them now — production is for features",
      "If you're bored of building, you're probably almost done. Push through.",
      "Don't optimize yet — make it work first, optimize in polish",
    ],
    relatedDocs: ["P3", "P5", "P6", "P10"],
  },
  polish: {
    description: "Fix bugs. Optimize. Add juice. Make it feel good.",
    prerequisites: ["all features implemented", "game completable start to finish"],
    checklist: [
      { task: "All known bugs fixed (or triaged as won't-fix)" },
      { task: "Performance profiled and optimized for target platform" },
      { task: "Screen shake, particles, and effects added for impact" },
      { task: "Audio balance pass (volumes, spatial audio)" },
      { task: "UI polish: transitions, hover states, accessibility" },
      { task: "Tutorial or onboarding for new players" },
      { task: "Edge cases handled: empty inventory, max health, boundary walls" },
      { task: "Save/load tested with real play sessions" },
      { task: "Controller/gamepad support (if planned)" },
      { task: "Final playtest with 3+ external testers" },
      // Engine-specific
      { task: "GC pressure minimized (check dotnet-counters)", engine: "monogame" },
      { task: "Draw calls optimized (SpriteBatch sorting)", engine: "monogame" },
      { task: "Remote debug on target device tested", engine: "godot" },
      { task: "Exported build tested on each target platform", engine: "godot" },
      { task: "Bundle size checked (Vite build analyzer)", engine: "phaser" },
      { task: "Mobile/touch input tested if targeting web", engine: "phaser" },
    ],
    advanceCriteria: [
      "No game-breaking bugs remain",
      "Performance meets target (60 FPS on target hardware)",
      "External testers can complete the game without getting stuck",
    ],
    backtrackSignals: [
      "You're adding new features — that's production, not polish",
      "Fundamental design problems emerge from playtesting",
    ],
    tips: [
      "Polish is NOT new features. If you're building new stuff, you're in production.",
      "Juice: screen shake, particles, sound effects, camera zoom — these transform feel",
      "Test on the lowest-spec hardware you're targeting",
      "Get feedback from people who DON'T play your genre — they'll find UX issues",
    ],
    relatedDocs: ["P11", "P12", "C2"],
  },
  release: {
    description: "Ship it. Get it into players' hands.",
    prerequisites: ["polish complete", "all blockers resolved"],
    checklist: [
      { task: "Store page / landing page created" },
      { task: "Screenshots and trailer captured" },
      { task: "Game description and tags written" },
      { task: "Build exported for all target platforms" },
      { task: "Build tested on a clean machine (fresh install)" },
      { task: "Credits page with all attributions" },
      { task: "License check: all assets properly licensed" },
      { task: "Privacy policy (if collecting any data)" },
      { task: "Distribution platform account set up (itch.io, Steam, etc.)" },
      { task: "Upload and publish" },
      { task: "Announcement posted (social media, forums, devlog)" },
      // Platform-specific
      { task: "Steam build uploaded via SteamPipe", engine: "monogame" },
      { task: "Godot export templates installed for each platform", engine: "godot" },
      { task: "Web build deployed to itch.io or hosting", engine: "phaser" },
    ],
    advanceCriteria: [
      "Game is publicly downloadable/playable",
      "At least one person has played the release build",
    ],
    backtrackSignals: [
      "Critical bug found in release build — go back to polish",
      "Platform-specific issues not caught in testing",
    ],
    tips: [
      "Ship it. Perfect is the enemy of done.",
      "itch.io is the lowest-friction way to release — start there",
      "Post a devlog on release day — the story of making the game IS marketing",
      "Plan a small post-launch window (1-2 weeks) for hotfixes, then move on",
    ],
    relatedDocs: ["P13", "P15", "P8"],
  },
};

const VALID_PHASES = Object.keys(PHASES) as Phase[];

/**
 * phase_checklist — Project phase tracker with engine/genre-aware checklists.
 * Helps devs know what phase they're in and what to do next.
 */
export function handlePhaseChecklist(args: {
  phase?: string;
  engine?: string;
  genre?: string;
  completedItems?: string[];
}): ToolResult {
  // Validate phase
  const phase = validatePhase(args.phase);
  if (!phase && args.phase) {
    return {
      content: [{
        type: "text",
        text: `Unknown phase "${args.phase}".\n\nValid phases: ${VALID_PHASES.join(", ")}\n\nOmit the phase parameter to get a guide for choosing your current phase.`,
      }],
    };
  }

  // If no phase specified, show phase overview
  if (!phase) {
    return { content: [{ type: "text", text: buildPhaseOverview() }] };
  }

  const def = PHASES[phase];
  const engineFilter = args.engine?.toLowerCase().replace(/\s+/g, "") || "";
  const genreFilter = args.genre?.toLowerCase().replace(/\s+/g, "") || "";
  const completed = new Set((args.completedItems || []).map((s) => s.toLowerCase().trim()));

  // Filter checklist items by engine/genre
  const items = def.checklist.filter((item) => {
    if (item.engine && engineFilter && !engineFilter.includes(item.engine)) return false;
    if (item.engine && !engineFilter) return false; // skip engine-specific if no engine set
    if (item.genre && genreFilter && !genreFilter.includes(item.genre)) return false;
    if (item.genre && !genreFilter) return false; // skip genre-specific if no genre set
    return true;
  });

  let output = `# Phase: ${phase.charAt(0).toUpperCase() + phase.slice(1)}\n\n`;
  output += `${def.description}\n\n`;

  if (args.engine) output += `**Engine:** ${args.engine}\n`;
  if (args.genre) output += `**Genre:** ${args.genre}\n`;
  output += `\n`;

  // Prerequisites
  if (def.prerequisites.length > 0) {
    output += `## Prerequisites\n\n`;
    for (const prereq of def.prerequisites) {
      output += `- ${prereq}\n`;
    }
    output += `\n`;
  }

  // Checklist
  output += `## Checklist\n\n`;
  let completedCount = 0;
  for (const item of items) {
    const isDone = completed.has(item.task.toLowerCase());
    if (isDone) completedCount++;
    output += `- [${isDone ? "x" : " "}] ${item.task}\n`;
  }

  const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
  output += `\n**Progress:** ${completedCount}/${items.length} (${progress}%)\n\n`;

  // Recommendation
  output += `## Recommendation\n\n`;
  if (progress >= 80) {
    const nextPhase = getNextPhase(phase);
    if (nextPhase) {
      output += `You're at ${progress}% — consider advancing to **${nextPhase}** phase.\n\n`;
      output += `### Advance When:\n\n`;
      for (const criteria of def.advanceCriteria) {
        output += `- ${criteria}\n`;
      }
    } else {
      output += `You're at ${progress}% of the final phase. Ship it!\n`;
    }
  } else if (progress >= 40) {
    output += `Good progress (${progress}%). Keep working through the checklist.\n`;
  } else {
    output += `Early in this phase (${progress}%). Focus on the unchecked items above.\n`;
  }

  // Backtrack signals
  if (def.backtrackSignals.length > 0) {
    output += `\n### Watch Out For (Backtrack Signals)\n\n`;
    for (const signal of def.backtrackSignals) {
      output += `- ${signal}\n`;
    }
  }

  // Tips
  output += `\n## Tips\n\n`;
  for (const tip of def.tips) {
    output += `- ${tip}\n`;
  }

  // Related docs
  if (def.relatedDocs.length > 0) {
    output += `\n## Related Docs\n\n`;
    for (const docId of def.relatedDocs) {
      output += `- \`${docId}\` — use \`get_doc\` for details\n`;
    }
  }

  return { content: [{ type: "text", text: output }] };
}

function validatePhase(phase?: string): Phase | null {
  if (!phase) return null;
  const normalized = phase.toLowerCase().trim();
  if (VALID_PHASES.includes(normalized as Phase)) return normalized as Phase;
  // Aliases
  const aliases: Record<string, Phase> = {
    plan: "planning",
    design: "planning",
    preproduction: "planning",
    "pre-production": "planning",
    proto: "prototype",
    prototyping: "prototype",
    prod: "production",
    building: "production",
    polishing: "polish",
    juice: "polish",
    ship: "release",
    launch: "release",
    shipping: "release",
  };
  return aliases[normalized] || null;
}

function getNextPhase(current: Phase): Phase | null {
  const order: Phase[] = ["planning", "prototype", "production", "polish", "release"];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

function buildPhaseOverview(): string {
  let output = `# Project Phases\n\n`;
  output += `Which phase are you in? Here's a quick guide:\n\n`;

  const order: Phase[] = ["planning", "prototype", "production", "polish", "release"];
  for (const phase of order) {
    const def = PHASES[phase];
    const label = phase.charAt(0).toUpperCase() + phase.slice(1);
    output += `## ${label}\n\n`;
    output += `${def.description}\n\n`;
    output += `**Advance when:** ${def.advanceCriteria[0]}\n\n`;
  }

  output += `---\n\n`;
  output += `Call \`phase_checklist\` with a specific phase to get the full checklist.\n`;
  output += `Example: \`phase_checklist(phase: "prototype", engine: "godot", genre: "platformer")\`\n`;

  return output;
}
