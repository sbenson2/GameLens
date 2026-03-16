import * as fs from "fs";
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
function loadDocsFromDir(dirPath: string, module: string): Doc[] {
  const docs: Doc[] = [];
  if (!fs.existsSync(dirPath)) return docs;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      docs.push(...loadDocsFromDir(fullPath, module));
    } else if (entry.name.endsWith(".md")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const id = deriveId(entry.name);
      const category = dirToCategory(fullPath);
      docs.push({
        id,
        title: extractTitle(content, entry.name),
        description: extractDescription(content),
        category,
        module,
        content,
        filePath: fullPath,
      });
    }
  }
  return docs;
}

export class DocStore {
  private docs: Map<string, Doc> = new Map();
  private allDocs: Doc[] = [];

  constructor(private docsRoot: string) {}

  /** Load all docs from filesystem */
  load(activeModules: string[]): void {
    this.docs.clear();
    this.allDocs = [];

    // Load core docs
    const corePath = path.join(this.docsRoot, "core");
    const coreDocs = loadDocsFromDir(corePath, "core");
    for (const doc of coreDocs) {
      this.docs.set(doc.id, doc);
      this.allDocs.push(doc);
    }

    // Load module docs
    for (const mod of activeModules) {
      const modPath = path.join(this.docsRoot, mod);
      const modDocs = loadDocsFromDir(modPath, mod);
      for (const doc of modDocs) {
        // If ID already exists (e.g. G11 in both core and module), prefix with module
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
