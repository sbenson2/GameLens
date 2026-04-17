/**
 * Unified project store — merges MemoryStore + ProjectContext into one
 * persistent system. Each project gets a single JSON file at
 * ~/.gamecodex/projects/{name}.json containing structured context AND
 * freeform memory sections.
 *
 * Migrates legacy ~/.gamecodex/memory/{name}.md files on first access.
 */

import * as fs from "fs";
import * as path from "path";
import { CONFIG_DIR } from "../config.js";

const PROJECTS_DIR = path.join(CONFIG_DIR, "projects");
const LEGACY_MEMORY_DIR = path.join(CONFIG_DIR, "memory");

// ---- Types ----

export type Phase = "planning" | "prototype" | "production" | "polish" | "release";
export type SkillLevel = "beginner" | "intermediate" | "advanced";

export interface ProjectDecision {
  date: string;
  text: string;
}

export interface ProjectGoal {
  text: string;
  completed: boolean;
}

export interface ProjectMilestone {
  text: string;
  date: string;
}

export interface ProjectData {
  // Structured context
  name: string;
  engine: string;
  genre: string;
  skillLevel: SkillLevel;
  phase: Phase;
  decisions: ProjectDecision[];
  goals: ProjectGoal[];
  milestones: ProjectMilestone[];
  createdAt: string;
  lastUpdated: string;

  // Freeform memory sections (section name -> content)
  memory: Record<string, string>;

  // Health tracking
  featureCount: number;
  scopeWarnings: number;
}

// ---- Project Store ----

export class ProjectStore {
  private cache = new Map<string, ProjectData>();

  constructor() {
    this.ensureDir();
  }

  /** Get project data (creates default if not exists, migrates legacy if found) */
  get(projectName: string): ProjectData {
    const safe = this.safeName(projectName);

    // Check cache
    if (this.cache.has(safe)) {
      return this.cache.get(safe)!;
    }

    // Check file
    const filePath = this.projectPath(safe);
    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ProjectData;
        this.cache.set(safe, data);
        return data;
      } catch {
        // Corrupted file — create fresh
      }
    }

    // Check for legacy memory file to migrate
    const legacyPath = path.join(LEGACY_MEMORY_DIR, `${safe}.md`);
    if (fs.existsSync(legacyPath)) {
      const data = this.migrateLegacy(safe, legacyPath);
      this.cache.set(safe, data);
      this.save(safe, data);
      return data;
    }

    // Create default
    const data = this.createDefault(projectName);
    this.cache.set(safe, data);
    return data;
  }

  /** Update structured fields */
  set(projectName: string, updates: Partial<Pick<ProjectData, "engine" | "genre" | "skillLevel" | "phase">>): ProjectData {
    const data = this.get(projectName);

    if (updates.engine) data.engine = updates.engine;
    if (updates.genre) data.genre = updates.genre;
    if (updates.skillLevel) data.skillLevel = updates.skillLevel;
    if (updates.phase) data.phase = updates.phase;
    data.lastUpdated = new Date().toISOString();

    this.save(this.safeName(projectName), data);
    return data;
  }

  /** Add a decision to the log */
  addDecision(projectName: string, text: string): ProjectData {
    const data = this.get(projectName);
    data.decisions.push({
      date: new Date().toISOString().split("T")[0],
      text,
    });
    data.lastUpdated = new Date().toISOString();
    this.save(this.safeName(projectName), data);
    return data;
  }

  /** Add a goal */
  addGoal(projectName: string, text: string): ProjectData {
    const data = this.get(projectName);
    data.goals.push({ text, completed: false });
    data.lastUpdated = new Date().toISOString();
    this.save(this.safeName(projectName), data);
    return data;
  }

  /** Complete a goal */
  completeGoal(projectName: string, goalText: string): ProjectData {
    const data = this.get(projectName);
    const goal = data.goals.find(
      (g) => g.text.toLowerCase().includes(goalText.toLowerCase())
    );
    if (goal) {
      goal.completed = true;
      data.lastUpdated = new Date().toISOString();
      this.save(this.safeName(projectName), data);
    }
    return data;
  }

  /** Clear all goals */
  clearGoals(projectName: string): ProjectData {
    const data = this.get(projectName);
    data.goals = [];
    data.lastUpdated = new Date().toISOString();
    this.save(this.safeName(projectName), data);
    return data;
  }

  /** Add a milestone */
  addMilestone(projectName: string, text: string): ProjectData {
    const data = this.get(projectName);
    data.milestones.push({
      text,
      date: new Date().toISOString().split("T")[0],
    });
    data.lastUpdated = new Date().toISOString();
    this.save(this.safeName(projectName), data);
    return data;
  }

  /** Write to a memory section (replaces content) */
  writeMemory(projectName: string, section: string, content: string): ProjectData {
    const data = this.get(projectName);
    data.memory[section] = content;
    data.lastUpdated = new Date().toISOString();
    this.save(this.safeName(projectName), data);
    return data;
  }

  /** Append to a memory section */
  appendMemory(projectName: string, section: string, content: string): ProjectData {
    const data = this.get(projectName);
    const existing = data.memory[section] ?? "";
    data.memory[section] = existing ? `${existing}\n${content}` : content;
    data.lastUpdated = new Date().toISOString();
    this.save(this.safeName(projectName), data);
    return data;
  }

  /** Read a specific memory section */
  readMemory(projectName: string, section: string): string | null {
    const data = this.get(projectName);
    return data.memory[section] ?? null;
  }

  /** Clear a memory section */
  clearMemory(projectName: string, section?: string): ProjectData {
    const data = this.get(projectName);
    if (section) {
      delete data.memory[section];
    } else {
      data.memory = {};
    }
    data.lastUpdated = new Date().toISOString();
    this.save(this.safeName(projectName), data);
    return data;
  }

  /** Increment feature count (for scope tracking) */
  addFeature(projectName: string): ProjectData {
    const data = this.get(projectName);
    data.featureCount++;
    data.lastUpdated = new Date().toISOString();
    this.save(this.safeName(projectName), data);
    return data;
  }

  /** Record a scope warning */
  recordScopeWarning(projectName: string): ProjectData {
    const data = this.get(projectName);
    data.scopeWarnings++;
    data.lastUpdated = new Date().toISOString();
    this.save(this.safeName(projectName), data);
    return data;
  }

  /** List all projects */
  listProjects(): string[] {
    if (!fs.existsSync(PROJECTS_DIR)) return [];
    return fs
      .readdirSync(PROJECTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  }

  /** Delete a project */
  delete(projectName: string): void {
    const safe = this.safeName(projectName);
    const filePath = this.projectPath(safe);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this.cache.delete(safe);
  }

  /** Format project data as readable markdown */
  format(data: ProjectData): string {
    let output = `# ${data.name}\n\n`;

    output += `| Field | Value |\n`;
    output += `|-------|-------|\n`;
    output += `| Engine | ${data.engine} |\n`;
    output += `| Genre | ${data.genre} |\n`;
    output += `| Skill Level | ${data.skillLevel} |\n`;
    output += `| Phase | ${data.phase} |\n`;
    output += `| Features | ${data.featureCount} |\n`;
    output += `| Last Updated | ${data.lastUpdated.split("T")[0]} |\n\n`;

    // Goals
    const activeGoals = data.goals.filter((g) => !g.completed);
    const doneGoals = data.goals.filter((g) => g.completed);
    if (data.goals.length > 0) {
      output += `## Goals (${activeGoals.length} active, ${doneGoals.length} done)\n\n`;
      for (const goal of data.goals) {
        output += `- [${goal.completed ? "x" : " "}] ${goal.text}\n`;
      }
      output += "\n";
    }

    // Decisions
    if (data.decisions.length > 0) {
      output += `## Decision Log (${data.decisions.length})\n\n`;
      for (const d of data.decisions.slice(-10)) {
        output += `- [${d.date}] ${d.text}\n`;
      }
      if (data.decisions.length > 10) {
        output += `_...and ${data.decisions.length - 10} earlier decisions_\n`;
      }
      output += "\n";
    }

    // Milestones
    if (data.milestones.length > 0) {
      output += `## Milestones (${data.milestones.length})\n\n`;
      for (const m of data.milestones) {
        output += `- [${m.date}] ${m.text}\n`;
      }
      output += "\n";
    }

    // Memory sections
    const memSections = Object.keys(data.memory);
    if (memSections.length > 0) {
      output += `## Notes\n\n`;
      for (const section of memSections) {
        output += `### ${section}\n\n${data.memory[section]}\n\n`;
      }
    }

    return output;
  }

  // ---- Internal ----

  private createDefault(projectName: string): ProjectData {
    return {
      name: projectName,
      engine: "not set",
      genre: "not set",
      skillLevel: "intermediate",
      phase: "planning",
      decisions: [],
      goals: [],
      milestones: [],
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      memory: {},
      featureCount: 0,
      scopeWarnings: 0,
    };
  }

  private migrateLegacy(safeName: string, legacyPath: string): ProjectData {
    const content = fs.readFileSync(legacyPath, "utf-8");
    const data = this.createDefault(safeName);

    // Parse legacy markdown sections into memory
    const lines = content.split("\n");
    let currentSection = "";
    let currentContent: string[] = [];

    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (currentSection && currentContent.length > 0) {
          const text = currentContent.join("\n").trim();
          if (text && !text.startsWith("(")) {
            // Skip placeholder text
            data.memory[currentSection] = text;
          }
        }
        currentSection = line.substring(3).trim();
        currentContent = [];
      } else if (!line.startsWith("# ")) {
        currentContent.push(line);
      }
    }
    // Last section
    if (currentSection && currentContent.length > 0) {
      const text = currentContent.join("\n").trim();
      if (text && !text.startsWith("(")) {
        data.memory[currentSection] = text;
      }
    }

    // Extract engine/genre from Project section if present
    const projectSection = data.memory["Project"];
    if (projectSection) {
      const engineMatch = projectSection.match(/Engine:\s*(.+)/i);
      const genreMatch = projectSection.match(/Genre:\s*(.+)/i);
      if (engineMatch && engineMatch[1].trim() !== "(not set)") {
        data.engine = engineMatch[1].trim();
      }
      if (genreMatch && genreMatch[1].trim() !== "(not set)") {
        data.genre = genreMatch[1].trim();
      }
      // Remove Project section from memory (now in structured fields)
      delete data.memory["Project"];
    }

    // Rename legacy file to .backup
    try {
      fs.renameSync(legacyPath, `${legacyPath}.backup`);
    } catch {
      // Non-critical — keep going
    }

    return data;
  }

  private save(safeName: string, data: ProjectData): void {
    fs.writeFileSync(
      this.projectPath(safeName),
      JSON.stringify(data, null, 2),
      { mode: 0o600 }
    );
    this.cache.set(safeName, data);
  }

  private projectPath(safeName: string): string {
    return path.join(PROJECTS_DIR, `${safeName}.json`);
  }

  private safeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  }

  private ensureDir(): void {
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true, mode: 0o700 });
    }
  }
}

// ---- Singleton ----

let _instance: ProjectStore | null = null;

export function getProjectStore(): ProjectStore {
  if (!_instance) {
    _instance = new ProjectStore();
  }
  return _instance;
}
