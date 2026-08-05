import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";

export interface Doc {
  id: string;
  title: string;
  description: string;
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

/** Derive doc ID from filename: E6_game_design_fundamentals.md → E6 */
function deriveId(filename: string): string {
  const base = filename.replace(/\.md$/, "");
  // Match patterns like E6, C1, R4, etc.
  const prefixMatch = base.match(/^([A-Z]\d+)/);
  if (prefixMatch) return prefixMatch[1];
  return base;
}

/** Recursively load all .md files from a directory */
async function loadDocsFromDir(dirPath: string): Promise<Doc[]> {
  if (!fs.existsSync(dirPath)) return [];

  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const tasks = entries.map(async (entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return loadDocsFromDir(fullPath);
    } else if (entry.name.endsWith(".md")) {
      const content = await fsp.readFile(fullPath, "utf-8");
      const doc: Doc = {
        id: deriveId(entry.name),
        title: extractTitle(content, entry.name),
        description: extractDescription(content),
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
  async load(): Promise<void> {
    this.docs.clear();
    this.allDocs = [];

    for (const doc of await loadDocsFromDir(this.docsRoot)) {
      this.docs.set(doc.id, doc);
      this.allDocs.push(doc);
    }
  }

  getDoc(id: string): Doc | undefined {
    return this.docs.get(id);
  }

  getAllDocs(): Doc[] {
    return this.allDocs;
  }
}
