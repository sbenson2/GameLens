/** Genre → required systems mapping for quick lookups */

export interface GenreInfo {
  genre: string;
  description: string;
  requiredSystems: string[];
  recommendedDocs: string[];
  starterChecklist: string[];
}

const GENRE_DATABASE: Record<string, GenreInfo> = {
  platformer: {
    genre: "Platformer",
    description: "Side-scrolling or vertical movement with jumping, gravity, and obstacle navigation",
    requiredSystems: [
      "Character controller with gravity & jumping",
      "Collision detection (AABB or tilemap)",
      "Camera follow (horizontal scrolling)",
      "Input handling (jump buffering, coyote time)",
      "Tilemap or level geometry",
      "Animation state machine (idle, run, jump, fall)",
      "Game feel: screen shake, hitstop, particles",
    ],
    recommendedDocs: [
      "G52", "G56", "G3", "G20", "G37", "G31", "G30", "C2",
      "character-controller-theory", "physics-theory", "camera-theory", "animation-theory",
    ],
    starterChecklist: [
      "Player movement with acceleration/deceleration",
      "Gravity and variable jump height",
      "Ground detection and coyote time",
      "Basic tilemap collision",
      "Camera following player",
      "Idle/run/jump/fall animations",
      "One hazard or enemy type",
      "Win/lose condition",
    ],
  },
  roguelike: {
    genre: "Roguelike / Roguelite",
    description: "Procedurally generated runs with permadeath or meta-progression",
    requiredSystems: [
      "Procedural generation (rooms, corridors, encounters)",
      "Turn-based or real-time combat",
      "Inventory system",
      "Item/loot generation",
      "Permadeath or meta-progression",
      "Fog of war or limited visibility",
      "Pathfinding for AI enemies",
      "Save system (run state, meta progress)",
    ],
    recommendedDocs: [
      "G53", "G40", "G54", "G10", "G4", "G38",
      "procedural-generation-theory", "pathfinding-theory", "fog-of-war-theory", "ai-theory",
    ],
    starterChecklist: [
      "Dungeon/level generator (BSP or random walk)",
      "Player movement on grid or free-move",
      "One weapon/attack type",
      "3-5 enemy types with basic AI",
      "Item pickup system",
      "Health/damage system",
      "Death → restart loop",
      "Fog of war or room reveal",
    ],
  },
  metroidvania: {
    genre: "Metroidvania",
    description: "Non-linear exploration with ability-gated progression in an interconnected world",
    requiredSystems: [
      "Character controller (platformer base)",
      "Ability system with unlockable movement abilities",
      "Interconnected world map",
      "Gate/lock system tied to abilities",
      "Save stations and checkpoints",
      "Minimap or world map",
      "Enemy AI with varied behaviors",
      "Boss encounters",
      "Camera with room transitions",
    ],
    recommendedDocs: [
      "G52", "G56", "G38", "G58", "G10", "G4", "G42", "G20",
      "character-controller-theory", "scene-management-theory", "ai-theory", "camera-theory",
    ],
    starterChecklist: [
      "Player movement + one starting ability",
      "Room/scene transition system",
      "One locked gate + the ability that opens it",
      "3 interconnected rooms",
      "Save/load at checkpoints",
      "Map screen showing explored areas",
      "2-3 enemy types",
      "One boss fight",
    ],
  },
  "top-down-rpg": {
    genre: "Top-Down RPG",
    description: "Overhead perspective with story, combat, and character progression",
    requiredSystems: [
      "Top-down character movement",
      "Dialogue system",
      "Inventory/equipment",
      "Combat system (turn-based or action)",
      "NPC system",
      "Quest/objective tracking",
      "Save/load system",
      "Tilemap for world and dungeons",
      "Camera follow",
      "UI framework (menus, HUD)",
    ],
    recommendedDocs: [
      "G28", "G62", "G10", "G5", "G37", "G20", "G4",
      "tilemap-theory", "camera-theory", "ai-theory", "ui-theory",
    ],
    starterChecklist: [
      "Player 4/8-directional movement",
      "NPC with dialogue",
      "One combat encounter",
      "Inventory with 3 item types",
      "One quest with completion",
      "Town + dungeon areas",
      "Save and load",
      "Basic HUD (health, items)",
    ],
  },
  "tower-defense": {
    genre: "Tower Defense",
    description: "Strategic placement of defensive structures along enemy paths",
    requiredSystems: [
      "Pathfinding for enemy waves",
      "Tower placement on grid",
      "Projectile/attack system",
      "Wave spawning system",
      "Economy (currency for towers)",
      "Tower upgrade system",
      "Enemy variety with different properties",
      "UI for tower selection and info",
    ],
    recommendedDocs: [
      "G40", "G37", "G23", "G5", "G4",
      "pathfinding-theory", "tilemap-theory", "particles-theory", "ai-theory", "ui-theory",
    ],
    starterChecklist: [
      "Grid-based map with defined path",
      "One tower type that shoots",
      "Enemies that follow path",
      "Wave spawning",
      "Currency earned from kills",
      "Tower placement with valid/invalid feedback",
      "Win/lose conditions",
      "Basic HUD (money, wave number, lives)",
    ],
  },
  "bullet-hell": {
    genre: "Bullet Hell / Shoot 'em up",
    description: "Fast-paced scrolling shooter with dense projectile patterns",
    requiredSystems: [
      "Player movement (precise, responsive)",
      "Bullet spawning with patterns",
      "Collision detection (circle or pixel-perfect)",
      "Object pooling for projectiles",
      "Scrolling background/parallax",
      "Enemy wave/formation system",
      "Score system",
      "Screen shake and effects",
      "Particle effects (explosions, trails)",
    ],
    recommendedDocs: [
      "G23", "G3", "G22", "G13", "G30", "G60",
      "particles-theory", "physics-theory", "camera-theory",
    ],
    starterChecklist: [
      "Player ship with movement",
      "Player shooting",
      "One enemy type",
      "Basic bullet pattern",
      "Collision and health",
      "Object pooling for bullets",
      "Scrolling background",
      "Score display",
    ],
  },
  "puzzle": {
    genre: "Puzzle",
    description: "Logic and spatial reasoning challenges",
    requiredSystems: [
      "Puzzle state management",
      "Undo/redo system",
      "Level loading/progression",
      "Win condition detection",
      "Input handling (click/drag/keyboard)",
      "Visual feedback for valid/invalid moves",
      "Tutorial/hint system",
      "Level select screen",
    ],
    recommendedDocs: [
      "E7", "G38", "G5", "G42", "G61",
      "scene-management-theory", "ui-theory", "tweening-theory",
    ],
    starterChecklist: [
      "Core puzzle mechanic implemented",
      "5 hand-crafted levels",
      "Win detection",
      "Undo support",
      "Level select menu",
      "Transition between levels",
      "Visual/audio feedback on solve",
      "Basic tutorial for mechanic",
    ],
  },
  "survival": {
    genre: "Survival",
    description: "Resource gathering, crafting, and threat management in a hostile environment",
    requiredSystems: [
      "Resource gathering",
      "Crafting system",
      "Inventory management",
      "Hunger/thirst/health meters",
      "Day/night cycle",
      "Enemy AI (ambient threats)",
      "Building/placement system",
      "Save/load system",
      "Procedural or hand-crafted world",
    ],
    recommendedDocs: [
      "G10", "G53", "G4", "G39", "G57",
      "procedural-generation-theory", "ai-theory", "lighting-2d-theory",
    ],
    starterChecklist: [
      "Player movement and basic actions",
      "3 gatherable resources",
      "2-3 craftable items",
      "Inventory UI",
      "One survival meter (health or hunger)",
      "Day/night cycle with visual change",
      "One threat/enemy type",
      "Save and load progress",
    ],
  },
  "strategy": {
    genre: "Strategy (RTS/TBS)",
    description: "Resource management, unit control, and tactical decision-making",
    requiredSystems: [
      "Unit selection and commands",
      "Pathfinding (A* or flow fields)",
      "Resource system",
      "Building/construction",
      "Fog of war",
      "Minimap",
      "AI opponent",
      "Camera pan/zoom",
      "UI for unit info and commands",
    ],
    recommendedDocs: [
      "G40", "G54", "G58", "G4", "G5", "G20",
      "pathfinding-theory", "fog-of-war-theory", "ai-theory", "camera-theory", "ui-theory",
    ],
    starterChecklist: [
      "Camera pan and zoom",
      "Unit selection (click and box select)",
      "Move command with pathfinding",
      "One resource type",
      "One building that produces units",
      "One combat unit type",
      "Fog of war",
      "Minimap",
    ],
  },
  "visual-novel": {
    genre: "Visual Novel",
    description: "Story-driven with branching dialogue, character portraits, and choices",
    requiredSystems: [
      "Dialogue/script system",
      "Branching narrative with choices",
      "Character portrait display",
      "Background scene management",
      "Save/load with story state",
      "Text display with typewriter effect",
      "Music and sound effects",
      "UI for choices and text box",
    ],
    recommendedDocs: [
      "G62", "G5", "G6", "G42", "G10",
      "ui-theory", "audio-theory", "scene-management-theory",
    ],
    starterChecklist: [
      "Text display with typewriter effect",
      "Character name and portrait",
      "Background scene switching",
      "2-3 choice branches",
      "Save/load story progress",
      "Music playback",
      "Sound effects on key events",
      "Title screen and story start",
    ],
  },
  "fighting": {
    genre: "Fighting Game",
    description: "1v1 combat with precise input timing, combos, and special moves",
    requiredSystems: [
      "Frame-based combat system",
      "Hitbox/hurtbox system",
      "Input buffer and command parsing",
      "Combo system",
      "Character state machine",
      "Health/round system",
      "Animation with frame data",
      "Screen shake and hitstop",
    ],
    recommendedDocs: [
      "G31", "G3", "G7", "G30", "C2",
      "animation-theory", "physics-theory", "input-handling-theory", "character-controller-theory",
    ],
    starterChecklist: [
      "Two characters facing each other",
      "Basic attacks (light, heavy)",
      "Block mechanic",
      "Hitbox/hurtbox collision",
      "Health bars",
      "Win/lose round detection",
      "One special move per character",
      "Hitstop and hit effects",
    ],
  },
};

// Aliases
const GENRE_ALIASES: Record<string, string> = {
  "shmup": "bullet-hell",
  "shoot em up": "bullet-hell",
  "shooter": "bullet-hell",
  "rpg": "top-down-rpg",
  "jrpg": "top-down-rpg",
  "action rpg": "top-down-rpg",
  "arpg": "top-down-rpg",
  "rogue": "roguelike",
  "roguelite": "roguelike",
  "rogue-like": "roguelike",
  "rogue-lite": "roguelike",
  "rts": "strategy",
  "tbs": "strategy",
  "turn-based": "strategy",
  "real-time strategy": "strategy",
  "td": "tower-defense",
  "vn": "visual-novel",
  "crafting": "survival",
  "sandbox": "survival",
  "beat em up": "fighting",
  "brawler": "fighting",
};

export function lookupGenre(query: string): GenreInfo | null {
  const lower = query.toLowerCase().trim();

  // Direct match
  if (GENRE_DATABASE[lower]) return GENRE_DATABASE[lower];

  // Alias match
  if (GENRE_ALIASES[lower]) return GENRE_DATABASE[GENRE_ALIASES[lower]];

  // Partial match
  for (const [key, info] of Object.entries(GENRE_DATABASE)) {
    if (key.includes(lower) || info.genre.toLowerCase().includes(lower)) {
      return info;
    }
  }

  // Alias partial match
  for (const [alias, key] of Object.entries(GENRE_ALIASES)) {
    if (alias.includes(lower) || lower.includes(alias)) {
      return GENRE_DATABASE[key];
    }
  }

  return null;
}

export function listGenres(): string[] {
  return Object.values(GENRE_DATABASE).map((g) => g.genre);
}
