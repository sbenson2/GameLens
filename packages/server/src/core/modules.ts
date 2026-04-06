import * as fs from "fs";
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
const ENGINE_MAP: Record<string, { engine: string; labelFallback: string }> = {
  "godot": { engine: "Godot", labelFallback: "Godot" },
  "monogame": { engine: "MonoGame", labelFallback: "MonoGame" },
  "unity": { engine: "Unity", labelFallback: "Unity" },
  "bevy": { engine: "Bevy", labelFallback: "Bevy" },
  "unreal": { engine: "Unreal Engine", labelFallback: "Unreal Engine" },
  "defold": { engine: "Defold", labelFallback: "Defold" },
  "stride": { engine: "Stride", labelFallback: "Stride" },
  "flax": { engine: "Flax Engine", labelFallback: "Flax Engine" },
};

/** Extract the engine name from a module directory name */
function detectEngine(moduleId: string): { engine: string; labelFallback: string } {
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
function countMarkdownFiles(dirPath: string): number {
  let count = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += countMarkdownFiles(full);
    } else if (entry.name.endsWith(".md")) {
      count++;
    }
  }
  return count;
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
export function discoverModules(docsRoot: string): ModuleMetadata[] {
  const modules: ModuleMetadata[] = [];

  if (!fs.existsSync(docsRoot)) return modules;

  const entries = fs.readdirSync(docsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "core") continue; // core is always loaded, not a "module"
    if (entry.name.startsWith(".")) continue; // hidden dirs

    const modulePath = path.join(docsRoot, entry.name);
    const docCount = countMarkdownFiles(modulePath);

    // Skip empty directories
    if (docCount === 0) continue;

    const moduleId = entry.name;
    const { engine, labelFallback } = detectEngine(moduleId);

    // Find rules file: try <id>-rules.md, then *-rules.md, then any *rules*.md
    let rulesPath: string | undefined;
    let rulesContent: string | undefined;

    const exactRules = path.join(modulePath, `${moduleId}-rules.md`);
    if (fs.existsSync(exactRules)) {
      rulesPath = exactRules;
    } else {
      // Look for any *-rules.md or *rules*.md in the module root
      const rootFiles = fs.readdirSync(modulePath);
      const rulesFile = rootFiles.find(
        (f) => f.endsWith("-rules.md") || f.match(/rules/i)?.length
      );
      if (rulesFile) {
        rulesPath = path.join(modulePath, rulesFile);
      }
    }

    if (rulesPath && fs.existsSync(rulesPath)) {
      rulesContent = fs.readFileSync(rulesPath, "utf-8");
    }

    const label = rulesContent
      ? extractLabelFromRules(rulesContent) ?? labelFallback
      : labelFallback;

    const description = rulesContent
      ? extractDescriptionFromRules(rulesContent)
      : `${engine} engine module`;

    modules.push({
      id: moduleId,
      label,
      engine,
      description,
      hasRules: !!rulesPath,
      rulesPath,
      sections: listSections(modulePath),
      docCount,
    });
  }

  // Sort: most docs first (more complete modules first)
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
