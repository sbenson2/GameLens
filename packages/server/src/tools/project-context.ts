type ToolResult = { content: Array<{ type: "text"; text: string }> };

/**
 * Project context — per-project state that persists across sessions.
 *
 * Stores engine, genre, skill level, current phase, and key decisions.
 * The AI client (Claude Code, Cursor, etc.) is responsible for persisting
 * the returned context to a file like .gamedev-context.json in the project root.
 */

interface ProjectContext {
  projectName: string;
  engine: string;
  genre: string;
  skillLevel: "beginner" | "intermediate" | "advanced";
  phase: "planning" | "prototype" | "production" | "polish" | "release";
  decisions: string[];
  currentGoals: string[];
  lastUpdated: string;
}

// In-memory context store, keyed by project name
const contextStore = new Map<string, ProjectContext>();

/**
 * project_context — Read or update per-project context.
 *
 * Actions:
 * - "get" — Return current context (or empty template)
 * - "set" — Update context fields
 * - "add_decision" — Append a decision to the log
 * - "add_goal" — Append a current goal
 * - "clear_goals" — Clear current goals list
 */
export function handleProjectContext(args: {
  action: string;
  project?: string;
  engine?: string;
  genre?: string;
  skillLevel?: string;
  phase?: string;
  decision?: string;
  goal?: string;
  context?: string; // Full JSON context to restore from file
}): ToolResult {
  const action = args.action.toLowerCase();
  const projectName = args.project?.trim() ?? "default";

  // Restore from serialized context if provided
  if (args.context) {
    try {
      const parsed = JSON.parse(args.context) as ProjectContext;
      contextStore.set(parsed.projectName ?? projectName, parsed);
    } catch {
      return {
        content: [{ type: "text", text: "Invalid context JSON. Please provide valid JSON from a .gamedev-context.json file." }],
      };
    }
  }

  // Get or create context
  let ctx = contextStore.get(projectName) ?? createDefault(projectName);

  switch (action) {
    case "get":
      return { content: [{ type: "text", text: formatContext(ctx) }] };

    case "set":
      if (args.engine) ctx.engine = args.engine;
      if (args.genre) ctx.genre = args.genre;
      if (args.skillLevel) {
        const level = args.skillLevel.toLowerCase();
        if (level === "beginner" || level === "intermediate" || level === "advanced") {
          ctx.skillLevel = level;
        }
      }
      if (args.phase) {
        const phase = args.phase.toLowerCase();
        if (["planning", "prototype", "production", "polish", "release"].includes(phase)) {
          ctx.phase = phase as ProjectContext["phase"];
        }
      }
      ctx.lastUpdated = new Date().toISOString();
      contextStore.set(projectName, ctx);
      return { content: [{ type: "text", text: `Context updated.\n\n${formatContext(ctx)}` }] };

    case "add_decision":
      if (!args.decision) {
        return { content: [{ type: "text", text: "Please provide a decision to log." }] };
      }
      ctx.decisions.push(`[${new Date().toISOString().split("T")[0]}] ${args.decision}`);
      ctx.lastUpdated = new Date().toISOString();
      contextStore.set(projectName, ctx);
      return {
        content: [{ type: "text", text: `Decision logged: "${args.decision}"\n\n${formatContext(ctx)}` }],
      };

    case "add_goal":
      if (!args.goal) {
        return { content: [{ type: "text", text: "Please provide a goal to add." }] };
      }
      ctx.currentGoals.push(args.goal);
      ctx.lastUpdated = new Date().toISOString();
      contextStore.set(projectName, ctx);
      return {
        content: [{ type: "text", text: `Goal added: "${args.goal}"\n\n${formatContext(ctx)}` }],
      };

    case "clear_goals":
      ctx.currentGoals = [];
      ctx.lastUpdated = new Date().toISOString();
      contextStore.set(projectName, ctx);
      return { content: [{ type: "text", text: `Goals cleared.\n\n${formatContext(ctx)}` }] };

    default:
      return {
        content: [{
          type: "text",
          text: `Unknown action "${action}". Available: get, set, add_decision, add_goal, clear_goals`,
        }],
      };
  }
}

function createDefault(projectName: string): ProjectContext {
  return {
    projectName,
    engine: "not set",
    genre: "not set",
    skillLevel: "intermediate",
    phase: "planning",
    decisions: [],
    currentGoals: [],
    lastUpdated: new Date().toISOString(),
  };
}

function formatContext(ctx: ProjectContext): string {
  let output = `# Project Context: ${ctx.projectName}\n\n`;
  output += `| Field | Value |\n`;
  output += `|-------|-------|\n`;
  output += `| Engine | ${ctx.engine} |\n`;
  output += `| Genre | ${ctx.genre} |\n`;
  output += `| Skill Level | ${ctx.skillLevel} |\n`;
  output += `| Phase | ${ctx.phase} |\n`;
  output += `| Last Updated | ${ctx.lastUpdated} |\n\n`;

  if (ctx.currentGoals.length > 0) {
    output += `## Current Goals\n\n`;
    for (const goal of ctx.currentGoals) {
      output += `- [ ] ${goal}\n`;
    }
    output += `\n`;
  }

  if (ctx.decisions.length > 0) {
    output += `## Decision Log\n\n`;
    for (const d of ctx.decisions) {
      output += `- ${d}\n`;
    }
    output += `\n`;
  }

  // Serialized JSON for file persistence
  output += `---\n\n`;
  output += `_Save this to \`.gamedev-context.json\` in your project root:_\n\n`;
  output += `\`\`\`json\n${JSON.stringify(ctx, null, 2)}\n\`\`\`\n`;

  return output;
}
