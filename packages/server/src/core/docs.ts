import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";

export interface Doc {
  id: string;
  title: string;
  description: string;
  category: string;
  module: string;
  content: string;
  filePath: string;
}

/** Extract title from markdown — first # heading or filename */
function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)/m);
  if (match) {
    // Strip markdown links and formatting
    return match[1].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "").trim();
  }
  return filename.replace(/\.md$/, "").replace(/[_-]/g, " ");
}

/** Extract a short description from the first paragraph after the title */
function extractDescription(content: string): string {
  const lines = content.split("\n");
  let pastTitle = false;
  for (const line of lines) {
    if (line.startsWith("# ")) {
      pastTitle = true;
      continue;
    }
    if (!pastTitle) continue;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("!") || trimmed.startsWith(">")) continue;
    if (trimmed.startsWith("#")) break;
    if (trimmed.startsWith("---")) continue;
    // Return first real paragraph line, truncated
    const clean = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "");
    return clean.length > 120 ? clean.slice(0, 117) + "..." : clean;
  }
  return "";
}

/** Derive doc ID from filename: G20_camera_systems.md → G20, P0_master_playbook.md → P0 */
function deriveId(filename: string): string {
  const base = filename.replace(/\.md$/, "");
  // Match patterns like G20, E1, R4, C1, P0, etc.
  const prefixMatch = base.match(/^([A-Z]\d+)/);
  if (prefixMatch) return prefixMatch[1];
  // For concept files like camera-theory.md
  return base;
}

/** Map directory path to category */
function dirToCategory(dirPath: string): string {
  const parts = dirPath.split(path.sep);
  // Look for known category dirs
  for (const part of parts) {
    switch (part) {
      case "reference": return "reference";
      case "architecture": return "architecture";
      case "guides": return "guide";
      case "game-design": return "catalog";
      case "project-management": return "playbook";
      case "programming": return "guide";
      case "ai-workflow": return "explanation";
      case "concepts": return "concept";
      case "session": return "explanation";
    }
  }
  return "reference";
}

/** Recursively load all .md files from a directory */
async function loadDocsFromDir(dirPath: string, module: string): Promise<Doc[]> {
  if (!fs.existsSync(dirPath)) return [];

  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const tasks = entries.map(async (entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return loadDocsFromDir(fullPath, module);
    } else if (entry.name.endsWith(".md")) {
      const content = await fsp.readFile(fullPath, "utf-8");
      const id = deriveId(entry.name);
      const category = dirToCategory(fullPath);
      const doc: Doc = {
        id,
        title: extractTitle(content, entry.name),
        description: extractDescription(content),
        category,
        module,
        content,
        filePath: fullPath,
      };
      return [doc];
    }
    return [];
  });

  const results = await Promise.all(tasks);
  return results.flat();
}

export class DocStore {
  private docs: Map<string, Doc> = new Map();
  private allDocs: Doc[] = [];

  constructor(private docsRoot: string) {}

  /** Load all docs from filesystem */
  async load(activeModules: string[]): Promise<void> {
    this.docs.clear();
    this.allDocs = [];

    // Load core + all module docs in parallel
    const loadTasks = [
      loadDocsFromDir(path.join(this.docsRoot, "core"), "core"),
      ...activeModules.map((mod) =>
        loadDocsFromDir(path.join(this.docsRoot, mod), mod)
      ),
    ];
    const results = await Promise.all(loadTasks);

    // First result is core docs
    const coreDocs = results[0];
    for (const doc of coreDocs) {
      this.docs.set(doc.id, doc);
      this.allDocs.push(doc);
    }

    // Remaining results are module docs
    for (let i = 1; i < results.length; i++) {
      const mod = activeModules[i - 1];
      for (const doc of results[i]) {
        const key = this.docs.has(doc.id) ? `${mod}/${doc.id}` : doc.id;
        doc.id = key;
        this.docs.set(key, doc);
        this.allDocs.push(doc);
      }
    }
  }

  getDoc(id: string): Doc | undefined {
    return this.docs.get(id);
  }

  getAllDocs(): Doc[] {
    return this.allDocs;
  }

  listDocs(category?: string, module?: string): Doc[] {
    return this.allDocs.filter((d) => {
      if (category && d.category !== category) return false;
      if (module && d.module !== module) return false;
      return true;
    });
  }
}
