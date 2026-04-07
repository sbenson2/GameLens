/**
 * project — The Brain. Interactive co-pilot with personality.
 *
 * Consolidates: guide (onboarding, suggestions) + project (state, decisions, goals)
 * + health (scope, burnout). Personality applied to all responses.
 */

import { z } from "zod";
import { GameCodexToolDef, ToolResult, ToolDependencies } from "../tool-definition.js";
import { ProjectStore } from "../core/project-store.js";
import { PersonalityEngine, ProjectSnapshot } from "../core/personality.js";
import { HealthTracker } from "../core/health-tracker.js";

function toSnapshot(data: any): ProjectSnapshot {
  return {
    name: data.name,
    engine: data.engine,
    genre: data.genre,
    skillLevel: data.skillLevel,
    phase: data.phase,
    goalCount: data.goals.filter((g: any) => !g.completed).length,
    decisionCount: data.decisions.length,
    featureCount: data.featureCount,
  };
}

export const projectToolDef: GameCodexToolDef = {
  name: "project",
  description: "Your game dev co-pilot — manages project state, tracks decisions/goals/milestones, monitors scope health, and adapts to your genre and phase. Actions: hello (onboarding), get, set, suggest, decide, goal, complete_goal, clear_goals, milestone, note, recall, health, scope, list.",
  inputSchema: {
    action: z.enum([
      "hello", "get", "set", "suggest",
      "decide", "goal", "complete_goal", "clear_goals",
      "milestone", "note", "recall", "clear_notes",
      "health", "scope", "add_feature", "list",
    ]).describe(
      "hello: onboarding/welcome | get: full state | set: update fields | suggest: what to do next | decide: log decision | goal: add goal | health: scope check | scope: evaluate feature | list: all projects"
    ),
    project: z.string().optional().describe("Project name (default: 'default')"),
    // set fields
    engine: z.string().optional().describe("Set engine"),
    genre: z.string().optional().describe("Set genre"),
    skillLevel: z.enum(["beginner", "intermediate", "advanced"]).optional().describe("Set skill level"),
    phase: z.enum(["planning", "prototype", "production", "polish", "release"]).optional().describe("Set phase"),
    // content
    content: z.string().optional().describe("Text for decide/goal/milestone/note"),
    section: z.string().optional().describe("Memory section name (for note/recall)"),
    // scope
    feature: z.string().optional().describe("Feature description (for scope/add_feature)"),
  },
  handler: async (args: Record<string, unknown>, deps: ToolDependencies): Promise<ToolResult> => {
    const store = deps.projectStore as ProjectStore;
    const personality = deps.personality as PersonalityEngine;
    const healthTracker = deps.healthTracker as HealthTracker;
    const action = args.action as string;
    const projectName = (args.project as string)?.trim() || "default";

    switch (action) {
      // ---- Guide actions ----

      case "hello": {
        const data = store.get(projectName);

        // New project — onboarding
        if (data.engine === "not set" && data.genre === "not set") {
          return { content: [{ type: "text", text: personality.getOnboarding() }] };
        }

        // Returning — personalized welcome
        const snapshot = toSnapshot(data);
        let greeting = personality.getGreeting(snapshot);

        const scopeWarning = personality.getScopeWarning(snapshot);
        if (scopeWarning) greeting += `\n\n${scopeWarning}`;

        greeting += `\n\n${personality.getSuggestion(snapshot)}`;
        greeting += `\n\n---\n**Tools:** \`project\` \`design\` \`docs\` \`build\` \`meta\``;

        return { content: [{ type: "text", text: greeting }] };
      }

      case "suggest": {
        const data = store.get(projectName);
        if (data.engine === "not set") {
          return { content: [{ type: "text", text: "Set up your project first! Use `project` with action `set` to configure engine, genre, and phase." }] };
        }

        const snapshot = toSnapshot(data);
        let output = `## What to work on next\n\n`;
        output += `_[${data.name} — ${data.phase} phase]_\n\n`;
        output += personality.getSuggestion(snapshot) + "\n\n";

        const activeGoals = data.goals.filter((g: any) => !g.completed);
        if (activeGoals.length > 0) {
          output += `### Active Goals\n\n`;
          for (const g of activeGoals.slice(0, 3)) output += `- [ ] ${g.text}\n`;
          if (activeGoals.length > 3) output += `_...and ${activeGoals.length - 3} more_\n`;
          output += "\n";
        }

        const report = healthTracker.check(data);
        if (report.overall !== "healthy") {
          output += `### Health: ${report.overall}\n\n`;
          for (const s of report.suggestions.slice(0, 2)) output += `- ${s}\n`;
        }

        return { content: [{ type: "text", text: output }] };
      }

      // ---- Project state actions ----

      case "get": {
        const data = store.get(projectName);
        const snapshot = toSnapshot(data);
        const prefix = personality.wrapResponse("", snapshot);
        return { content: [{ type: "text", text: prefix + store.format(data) }] };
      }

      case "set": {
        const data = store.set(projectName, {
          engine: args.engine as string | undefined,
          genre: args.genre as string | undefined,
          skillLevel: args.skillLevel as any,
          phase: args.phase as any,
        });
        return { content: [{ type: "text", text: `Project updated.\n\n${store.format(data)}` }] };
      }

      case "decide": {
        if (!args.content) return miss("content");
        const data = store.addDecision(projectName, args.content as string);
        return { content: [{ type: "text", text: `Decision logged: "${args.content}"\n\n${store.format(data)}` }] };
      }

      case "goal": {
        if (!args.content) return miss("content");
        const data = store.addGoal(projectName, args.content as string);
        return { content: [{ type: "text", text: `Goal added: "${args.content}"\n\n${store.format(data)}` }] };
      }

      case "complete_goal": {
        if (!args.content) return miss("content");
        const data = store.completeGoal(projectName, args.content as string);
        const snapshot = toSnapshot(data);
        const msg = personality.getMilestoneMessage(`Goal completed: ${args.content}`, snapshot);
        return { content: [{ type: "text", text: `${msg}\n\n${store.format(data)}` }] };
      }

      case "clear_goals": {
        const data = store.clearGoals(projectName);
        return { content: [{ type: "text", text: `Goals cleared.\n\n${store.format(data)}` }] };
      }

      case "milestone": {
        if (!args.content) return miss("content");
        const data = store.addMilestone(projectName, args.content as string);
        const snapshot = toSnapshot(data);
        const msg = personality.getMilestoneMessage(args.content as string, snapshot);
        return { content: [{ type: "text", text: `${msg}\n\n${store.format(data)}` }] };
      }

      // ---- Memory actions ----

      case "note": {
        if (!args.section || !args.content) {
          return { content: [{ type: "text", text: "Please provide both `section` and `content`." }] };
        }
        store.appendMemory(projectName, args.section as string, args.content as string);
        return { content: [{ type: "text", text: `Note added to "${args.section}".` }] };
      }

      case "recall": {
        if (!args.section) {
          const data = store.get(projectName);
          const sections = Object.keys(data.memory);
          if (sections.length === 0) return { content: [{ type: "text", text: "No notes yet. Use `note` action to add some." }] };
          let output = `## Notes for ${projectName}\n\n`;
          for (const s of sections) output += `- **${s}** (${data.memory[s].length} chars)\n`;
          return { content: [{ type: "text", text: output }] };
        }
        const content = store.readMemory(projectName, args.section as string);
        if (content === null) return { content: [{ type: "text", text: `No notes found for "${args.section}".` }] };
        return { content: [{ type: "text", text: `## ${args.section}\n\n${content}` }] };
      }

      case "clear_notes": {
        store.clearMemory(projectName, args.section as string | undefined);
        return { content: [{ type: "text", text: args.section ? `Cleared "${args.section}".` : "All notes cleared." }] };
      }

      // ---- Health actions ----

      case "health": {
        const data = store.get(projectName);
        const report = healthTracker.check(data);
        const snapshot = toSnapshot(data);
        const tone = personality.getTone(snapshot);
        let output = healthTracker.format(report);
        output += `\n---\n_${tone.flavor}_\n`;
        return { content: [{ type: "text", text: output }] };
      }

      case "scope": {
        if (!args.feature) return miss("feature");
        const data = store.get(projectName);
        return { content: [{ type: "text", text: healthTracker.evaluateFeature(data, args.feature as string) }] };
      }

      case "add_feature": {
        if (!args.feature) return miss("feature");
        const data = store.addFeature(projectName);
        store.addDecision(projectName, `Added feature: ${args.feature}`);
        const snapshot = toSnapshot(data);
        const scopeWarning = personality.getScopeWarning(snapshot);
        let output = `Feature logged: "${args.feature}" (total: ${data.featureCount})\n`;
        if (scopeWarning) output += `\n${scopeWarning}\n`;
        return { content: [{ type: "text", text: output }] };
      }

      case "list": {
        const projects = store.listProjects();
        if (projects.length === 0) return { content: [{ type: "text", text: "No projects yet. Use `set` to create one." }] };
        let output = `## Projects (${projects.length})\n\n`;
        for (const p of projects) {
          const data = store.get(p);
          output += `- **${data.name}** — ${data.engine}, ${data.genre}, ${data.phase}\n`;
        }
        return { content: [{ type: "text", text: output }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown action "${action}".` }] };
    }
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  category: "session",
  activityDescription: "Managing project",
};

function miss(param: string): ToolResult {
  return { content: [{ type: "text", text: `Please provide \`${param}\`.` }] };
}
