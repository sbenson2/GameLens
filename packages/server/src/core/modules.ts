import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";

export interface ModuleMetadata {
  /** Directory name under docs/ (e.g. "godot-arch", "monogame-arch") */
  id: string;
  /** Human-readable label (e.g. "Godot 4.x", "MonoGame + Arch ECS") */
  label: string;
  /** Engine name extracted from module (e.g. "Godot", "MonoGame", "Bevy") */
  engine: string;
  /** Short description extracted from the rules file (first paragraph) */
  description: string;
  /** Whether a rules file exists for this module */
  hasRules: boolean;
  /** Path to the rules file, if it exists */
  rulesPath?: string;
  /** Subdirectories present (architecture, guides, reference) */
  sections: string[];
  /** Number of .md files in the module */
  docCount: number;
}

/** Known engine name mappings — maps directory name patterns to engine info */
export const ENGINE_MAP: Record<string, { engine: string; labelFallback: string }> = {
  "babylonjs": { engine: "Babylon.js", labelFallback: "Babylon.js" },
  "bevy": { engine: "Bevy", labelFallback: "Bevy" },
  "construct": { engine: "Construct", labelFallback: "Construct" },
  "defold": { engine: "Defold", labelFallback: "Defold" },
  "excalibur": { engine: "Excalibur.js", labelFallback: "Excalibur.js" },
  "flax": { engine: "Flax Engine", labelFallback: "Flax Engine" },
  "fna": { engine: "FNA", labelFallback: "FNA" },
  "gamemaker": { engine: "GameMaker", labelFallback: "GameMaker" },
  "gdevelop": { engine: "GDevelop", labelFallback: "GDevelop" },
  "godot": { engine: "Godot", labelFallback: "Godot" },
  "haxeflixel": { engine: "HaxeFlixel", labelFallback: "HaxeFlixel" },
  "heaps": { engine: "Heaps", labelFallback: "Heaps" },
  "kaplay": { engine: "Kaplay", labelFallback: "Kaplay" },
  "libgdx": { engine: "libGDX", labelFallback: "libGDX" },
  "love2d": { engine: "Love2D", labelFallback: "Love2D" },
  "macroquad": { engine: "Macroquad", labelFallback: "Macroquad" },
  "monogame": { engine: "MonoGame", labelFallback: "MonoGame" },
  "phaser": { engine: "Phaser", labelFallback: "Phaser" },
  "pixijs": { engine: "PixiJS", labelFallback: "PixiJS" },
  "playcanvas": { engine: "PlayCanvas", labelFallback: "PlayCanvas" },
  "pygame": { engine: "Pygame", labelFallback: "Pygame" },
  "raylib": { engine: "raylib", labelFallback: "raylib" },
  "renpy": { engine: "Ren'Py", labelFallback: "Ren'Py" },
  "rpgmaker": { engine: "RPG Maker", labelFallback: "RPG Maker" },
  "sdl3": { engine: "SDL3", labelFallback: "SDL3" },
  "sfml": { engine: "SFML", labelFallback: "SFML" },
  "stride": { engine: "Stride", labelFallback: "Stride" },
  "threejs": { engine: "Three.js", labelFallback: "Three.js" },
  "unity": { engine: "Unity", labelFallback: "Unity" },
  "unreal": { engine: "Unreal Engine", labelFallback: "Unreal Engine" },
};

/** Extract the engine name from a module directory name */
export function detectEngine(moduleId: string): { engine: string; labelFallback: string } {
  const lower = moduleId.toLowerCase();
  for (const [pattern, info] of Object.entries(ENGINE_MAP)) {
    if (lower.includes(pattern)) return info;
  }
  // Unknown engine — use the directory name, cleaned up
  const label = moduleId
    .replace(/-arch$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { engine: label, labelFallback: label };
}

/** Extract label from the first heading of a rules file */
function extractLabelFromRules(rulesContent: string): string | null {
  const match = rulesContent.match(/^#\s+(.+)/m);
  if (match) {
    // Clean up: "MonoGame + Arch ECS — AI Rules" → "MonoGame + Arch ECS"
    let label = match[1]
      .replace(/\s*[—–-]\s*AI\s*(Code\s*Generation\s*)?Rules.*$/i, "")
      .trim();
    return label || null;
  }
  return null;
}

/** Extract description from the first paragraph of a rules file */
function extractDescriptionFromRules(rulesContent: string): string {
  const lines = rulesContent.split("\n");
  let pastTitle = false;
  for (const line of lines) {
    if (line.startsWith("# ")) {
      pastTitle = true;
      continue;
    }
    if (!pastTitle) continue;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("---")) continue;
    if (trimmed.startsWith("#")) break;
    // First real paragraph line
    const clean = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`]/g, "");
    return clean.length > 200 ? clean.slice(0, 197) + "..." : clean;
  }
  return "";
}

/** Count .md files recursively in a directory */
async function countMarkdownFiles(dirPath: string): Promise<number> {
  if (!fs.existsSync(dirPath)) return 0;
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const counts = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) return countMarkdownFiles(full);
      return entry.name.endsWith(".md") ? 1 : 0;
    })
  );
  return counts.reduce((a, b) => a + b, 0);
}

/** List subdirectories that look like content sections */
function listSections(modulePath: string): string[] {
  const knownSections = ["architecture", "guides", "reference", "concepts", "tutorials"];
  const sections: string[] = [];
  if (!fs.existsSync(modulePath)) return sections;
  const entries = fs.readdirSync(modulePath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && knownSections.includes(entry.name)) {
      sections.push(entry.name);
    }
  }
  return sections;
}

/**
 * Auto-discover engine modules from the docs directory.
 * 
 * Convention:
 * - Each subdirectory of docsRoot (except "core") is a potential module
 * - A module is valid if it contains at least one .md file
 * - A rules file at `<module>/<module-name>-rules.md` or `<module>/*-rules.md` provides metadata
 * 
 * If GAMEDEV_MODULES env var is set, only those modules are activated.
 * If unset, ALL discovered modules are activated.
 */
export async function discoverModules(docsRoot: string): Promise<ModuleMetadata[]> {
  if (!fs.existsSync(docsRoot)) return [];

  const entries = await fsp.readdir(docsRoot, { withFileTypes: true });
  const dirEntries = entries.filter(
    (e) => e.isDirectory() && e.name !== "core" && !e.name.startsWith(".")
  );

  const moduleTasks = dirEntries.map(async (entry) => {
    const modulePath = path.join(docsRoot, entry.name);
    const docCount = await countMarkdownFiles(modulePath);

    if (docCount === 0) return null;

    const moduleId = entry.name;
    const { engine, labelFallback } = detectEngine(moduleId);

    let rulesPath: string | undefined;
    let rulesContent: string | undefined;

    const exactRules = path.join(modulePath, `${moduleId}-rules.md`);
    if (fs.existsSync(exactRules)) {
      rulesPath = exactRules;
    } else {
      const rootFiles = await fsp.readdir(modulePath);
      const rulesFile = rootFiles.find(
        (f) => f.endsWith("-rules.md") || f.match(/rules/i)?.length
      );
      if (rulesFile) {
        rulesPath = path.join(modulePath, rulesFile);
      }
    }

    if (rulesPath && fs.existsSync(rulesPath)) {
      rulesContent = await fsp.readFile(rulesPath, "utf-8");
    }

    const label = rulesContent
      ? extractLabelFromRules(rulesContent) ?? labelFallback
      : labelFallback;

    const description = rulesContent
      ? extractDescriptionFromRules(rulesContent)
      : `${engine} engine module`;

    const meta: ModuleMetadata = {
      id: moduleId,
      label,
      engine,
      description,
      hasRules: !!rulesPath,
      rulesPath,
      sections: listSections(modulePath),
      docCount,
    };
    return meta;
  });

  const results = await Promise.all(moduleTasks);
  const modules = results.filter((m): m is ModuleMetadata => m !== null);

  modules.sort((a, b) => b.docCount - a.docCount);
  return modules;
}

/**
 * Resolve which modules should be active.
 * If GAMEDEV_MODULES is set, use only those (intersection with discovered).
 * If unset, activate all discovered modules.
 */
export function resolveActiveModules(
  discovered: ModuleMetadata[],
  envModules?: string
): ModuleMetadata[] {
  if (!envModules) {
    // No env var → all discovered modules are active
    return discovered;
  }

  const requested = envModules
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);

  return discovered.filter((m) =>
    requested.includes(m.id.toLowerCase()) ||
    requested.includes(m.engine.toLowerCase())
  );
}

/** Get human-readable engine label from an engine key or module ID */
export function getEngineLabel(engineKeyOrModuleId: string): string {
  return detectEngine(engineKeyOrModuleId).engine;
}

/** Common engine aliases — maps user input to canonical engine keys */
const ENGINE_ALIASES: Record<string, string> = {
  // Curated engines with aliases
  monogame: "monogame", "monogame+arch": "monogame", arch: "monogame",
  godot: "godot", godot4: "godot",
  phaser: "phaser", phaser3: "phaser", html5: "phaser",
  // All engines (canonical key = self)
  babylonjs: "babylonjs", babylon: "babylonjs",
  bevy: "bevy",
  construct: "construct", construct3: "construct",
  defold: "defold",
  excalibur: "excalibur",
  fna: "fna",
  gamemaker: "gamemaker",
  gdevelop: "gdevelop",
  haxeflixel: "haxeflixel",
  heaps: "heaps",
  kaplay: "kaplay",
  libgdx: "libgdx",
  love2d: "love2d", love: "love2d",
  macroquad: "macroquad",
  pixijs: "pixijs", pixi: "pixijs",
  playcanvas: "playcanvas",
  pygame: "pygame",
  raylib: "raylib",
  renpy: "renpy",
  rpgmaker: "rpgmaker",
  sdl3: "sdl3", sdl: "sdl3",
  sfml: "sfml",
  stride: "stride",
  threejs: "threejs", three: "threejs",
  unity: "unity",
  unreal: "unreal", ue5: "unreal", ue4: "unreal",
};

/** Resolve user-provided engine string to canonical engine key */
export function resolveEngineKey(input: string): string | null {
  const key = input.toLowerCase().replace(/\s+/g, "");
  return ENGINE_ALIASES[key] ?? null;
}
