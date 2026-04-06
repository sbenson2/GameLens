/**
 * Persistent memory system — ported from MooBot's memory architecture.
 *
 * SOURCE: MooBot archive (bridge.sh, data/memory.md)
 * - Persistent file at /Users/s/moobot/data/memory.md
 * - Injected into system prompt on EVERY message (between markers)
 * - Claude can read and write via Edit tool
 * - Changes persist automatically across sessions
 * - Section-based organization: User, Preferences, Ongoing, Notes
 * - GameDev bot had: Project, Owner, Preferences, Ongoing, Decisions, Notes
 *
 * SOURCE: Claude Code source analysis
 * - Memory types: user, feedback, project, reference
 * - Frontmatter-based memory files
 * - MEMORY.md index with pointers
 *
 * ADAPTATION for MCP:
 * - Per-project memory files at ~/.gamecodex/memory/{project}.md
 * - Section-based: Project, Decisions, Architecture, Preferences, Notes
 * - Read/write/append/clear operations exposed as MCP tool
 * - Memory content returned as tool result (not injected into system prompt,
 *   since MCP server doesn't control the system prompt)
 */

import * as fs from "fs";
import * as path from "path";

const CONFIG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".gamecodex"
);
const MEMORY_DIR = path.join(CONFIG_DIR, "memory");

// ---- Types ----

export interface MemorySection {
  heading: string;
  content: string;
}

// ---- Default template (adapted from MooBot's memory.md) ----

function defaultMemoryTemplate(project: string): string {
  return `# ${project} — Project Memory

## Project
- Name: ${project}
- Engine: (not set)
- Genre: (not set)

## Architecture Decisions
(Log important architecture and design decisions here)

## Preferences
- (Add development preferences, coding style notes, etc.)

## Ongoing
(Track ongoing tasks, priorities, and current focus)

## Notes
(Important context, reminders, and reference info)
`;
}

// ---- Memory Store ----

export class MemoryStore {
  constructor() {
    this.ensureDir();
  }

  /** Read full memory for a project */
  read(project: string): string {
    const filePath = this.memoryPath(project);
    if (!fs.existsSync(filePath)) {
      return defaultMemoryTemplate(project);
    }
    return fs.readFileSync(filePath, "utf-8");
  }

  /** Write full memory content (replaces everything) */
  write(project: string, content: string): void {
    fs.writeFileSync(this.memoryPath(project), content, { mode: 0o600 });
  }

  /** Read a specific section by heading */
  readSection(project: string, heading: string): string | null {
    const content = this.read(project);
    const sections = this.parseSections(content);
    const match = sections.find(
      (s) => s.heading.toLowerCase().includes(heading.toLowerCase())
    );
    return match?.content ?? null;
  }

  /** Append text to a specific section */
  appendToSection(project: string, heading: string, text: string): boolean {
    const content = this.read(project);
    const sections = this.parseSections(content);
    const idx = sections.findIndex(
      (s) => s.heading.toLowerCase().includes(heading.toLowerCase())
    );

    if (idx === -1) return false;

    // Remove placeholder text if section is default
    const placeholders = [
      "(Log important architecture and design decisions here)",
      "(Add development preferences, coding style notes, etc.)",
      "(Track ongoing tasks, priorities, and current focus)",
      "(Important context, reminders, and reference info)",
    ];
    let sectionContent = sections[idx].content;
    for (const ph of placeholders) {
      sectionContent = sectionContent.replace(ph, "");
    }
    sectionContent = sectionContent.trimEnd();

    sections[idx].content = sectionContent
      ? `${sectionContent}\n${text}`
      : text;

    this.write(project, this.serializeSections(sections));
    return true;
  }

  /** Update a section's content entirely */
  updateSection(project: string, heading: string, content: string): boolean {
    const fullContent = this.read(project);
    const sections = this.parseSections(fullContent);
    const idx = sections.findIndex(
      (s) => s.heading.toLowerCase().includes(heading.toLowerCase())
    );

    if (idx === -1) return false;

    sections[idx].content = content;
    this.write(project, this.serializeSections(sections));
    return true;
  }

  /** Clear memory (reset to template) */
  clear(project: string): void {
    this.write(project, defaultMemoryTemplate(project));
  }

  /** List all projects with memory files */
  listProjects(): string[] {
    if (!fs.existsSync(MEMORY_DIR)) return [];
    return fs.readdirSync(MEMORY_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(".md", ""));
  }

  /** Get memory file size in bytes */
  getSize(project: string): number {
    const filePath = this.memoryPath(project);
    if (!fs.existsSync(filePath)) return 0;
    return fs.statSync(filePath).size;
  }

  // ---- Section parsing (MooBot used raw markdown sections) ----

  private parseSections(content: string): MemorySection[] {
    const sections: MemorySection[] = [];
    const lines = content.split("\n");
    let currentHeading = "";
    let currentContent: string[] = [];

    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (currentHeading) {
          sections.push({
            heading: currentHeading,
            content: currentContent.join("\n").trim(),
          });
        }
        currentHeading = line.substring(3).trim();
        currentContent = [];
      } else if (line.startsWith("# ") && !currentHeading) {
        // Skip the top-level heading (title)
        continue;
      } else {
        currentContent.push(line);
      }
    }

    // Push last section
    if (currentHeading) {
      sections.push({
        heading: currentHeading,
        content: currentContent.join("\n").trim(),
      });
    }

    return sections;
  }

  private serializeSections(sections: MemorySection[]): string {
    // Reconstruct with the first section's project name
    const projectName = sections.length > 0
      ? sections[0].heading.split("—")[0]?.trim() ?? "Project"
      : "Project";

    let output = `# ${projectName} — Project Memory\n\n`;

    for (const section of sections) {
      output += `## ${section.heading}\n`;
      output += section.content ? `${section.content}\n` : "";
      output += "\n";
    }

    return output;
  }

  // ---- Persistence helpers ----

  private ensureDir(): void {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true, mode: 0o700 });
    }
  }

  private memoryPath(project: string): string {
    const safe = project.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    return path.join(MEMORY_DIR, `${safe}.md`);
  }
}

// ---- Singleton ----

let _instance: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (!_instance) {
    _instance = new MemoryStore();
  }
  return _instance;
}
