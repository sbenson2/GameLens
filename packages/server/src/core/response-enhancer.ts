/**
 * Response enhancer — adds breadcrumb context and next-step suggestions to every tool response.
 *
 * Wired as post-processing middleware in tool-registry.ts so all 5 tools
 * benefit without per-tool changes.
 */

import { ToolResult, ToolDependencies } from "../tool-definition.js";
import { PATH_STEPS, getStepToolRecommendations } from "./session.js";
import { UPGRADE_URL } from "../tiers.js";
import { CONFIG } from "../config.js";

// Track docs responses per session for upgrade nudge cadence
let docsResponseCount = 0;
let nudgeShownThisSession = false;

// ---- Types ----

interface NextStep {
  tool: string;
  action: string;
  description: string;
}

interface ProjectSnapshot {
  name: string;
  engine: string;
  genre: string;
  phase: string;
  goalCount: number;
  featureCount: number;
  sessionPath?: string;
  sessionStep?: number;
  sessionTotalSteps?: number;
}

// ---- Breadcrumb ----

function getSnapshot(deps: ToolDependencies, projectName: string): ProjectSnapshot | null {
  try {
    const data = deps.projectStore.get(projectName);
    if (!data || data.engine === "not set") return null;

    const snapshot: ProjectSnapshot = {
      name: data.name,
      engine: data.engine,
      genre: data.genre,
      phase: data.phase,
      goalCount: data.goals?.filter((g: any) => !g.completed).length ?? 0,
      featureCount: data.featureCount ?? 0,
    };

    // Add session context if active
    try {
      const session = deps.sessionManager.getActiveSession(projectName);
      if (session?.workflowState) {
        const ws = JSON.parse(session.workflowState);
        if (ws.path !== "none" && ws.phase === "working") {
          snapshot.sessionPath = ws.path;
          snapshot.sessionStep = ws.step;
          snapshot.sessionTotalSteps = ws.totalSteps;
        }
      }
    } catch { /* non-critical */ }

    return snapshot;
  } catch {
    return null;
  }
}

export function getBreadcrumb(snapshot: ProjectSnapshot | null): string {
  if (!snapshot) return "";
  const parts = [
    snapshot.name,
    snapshot.engine,
    snapshot.phase,
    `${snapshot.goalCount} goal${snapshot.goalCount !== 1 ? "s" : ""}`,
  ];

  if (snapshot.sessionPath) {
    parts.push(`${snapshot.sessionPath} ${snapshot.sessionStep}/${snapshot.sessionTotalSteps}`);
  }

  return `\`[${parts.join(" · ")}]\``;
}

// ---- Next Steps ----

const NEXT_STEPS: Record<string, Record<string, NextStep[]>> = {
  project: {
    hello: [
      { tool: "project", action: "set", description: "Describe your game to set up the project" },
      { tool: "project", action: "session", description: "Start a structured workflow" },
    ],
    set: [
      { tool: "design", action: "gdd", description: "Create a Game Design Document" },
      { tool: "project", action: "goal", description: "Set your first goal" },
      { tool: "build", action: "scaffold", description: "Generate project structure" },
    ],
    suggest: [],
    get: [
      { tool: "project", action: "suggest", description: "Get suggestion for what to work on" },
      { tool: "project", action: "health", description: "Check scope health" },
    ],
    decide: [
      { tool: "project", action: "suggest", description: "What to work on next" },
    ],
    goal: [
      { tool: "project", action: "suggest", description: "What to work on next" },
      { tool: "build", action: "code", description: "Start coding a feature" },
    ],
    complete_goal: [
      { tool: "project", action: "suggest", description: "What to work on next" },
    ],
    milestone: [
      { tool: "project", action: "suggest", description: "What to work on next" },
      { tool: "design", action: "phase", description: "Check phase progress" },
    ],
    health: [
      { tool: "project", action: "suggest", description: "What to work on next" },
      { tool: "design", action: "scope_check", description: "Evaluate a specific feature" },
    ],
    scope: [
      { tool: "project", action: "health", description: "Full health report" },
    ],
    add_feature: [
      { tool: "project", action: "health", description: "Check scope health" },
    ],
  },
  design: {
    gdd: [
      { tool: "design", action: "phase", description: "Get phase checklist" },
      { tool: "project", action: "goal", description: "Set goals from the GDD" },
      { tool: "build", action: "scaffold", description: "Scaffold the project" },
    ],
    phase: [
      { tool: "project", action: "goal", description: "Set goals for this phase" },
      { tool: "build", action: "code", description: "Start building" },
    ],
    scope_check: [
      { tool: "project", action: "health", description: "Full health report" },
    ],
    launch: [
      { tool: "design", action: "store_page", description: "Write your store page" },
      { tool: "design", action: "marketing", description: "Marketing timeline" },
    ],
    store_page: [
      { tool: "design", action: "pricing", description: "Pricing strategy" },
      { tool: "design", action: "trailer", description: "Trailer guide" },
    ],
    pricing: [
      { tool: "design", action: "launch", description: "Pre-launch checklist" },
    ],
    marketing: [
      { tool: "design", action: "trailer", description: "Trailer guide" },
      { tool: "design", action: "launch", description: "Pre-launch checklist" },
    ],
    trailer: [
      { tool: "design", action: "launch", description: "Pre-launch checklist" },
    ],
    patterns: [
      { tool: "docs", action: "search", description: "Search for related docs" },
      { tool: "build", action: "code", description: "Generate code for this pattern" },
    ],
  },
  build: {
    scaffold: [
      { tool: "build", action: "code", description: "Generate feature code" },
      { tool: "project", action: "goal", description: "Set your first goal" },
    ],
    code: [
      { tool: "project", action: "goal", description: "Track what you built" },
      { tool: "project", action: "health", description: "Check scope" },
    ],
    assets: [
      { tool: "build", action: "code", description: "Generate code to load assets" },
    ],
    debug: [
      { tool: "docs", action: "search", description: "Search for related patterns" },
      { tool: "build", action: "review", description: "Review architecture" },
    ],
    review: [
      { tool: "design", action: "patterns", description: "Get architecture advice" },
      { tool: "docs", action: "search", description: "Search for best practices" },
    ],
  },
  docs: {
    search: [
      { tool: "docs", action: "get", description: "Read a full doc from the results" },
      { tool: "build", action: "code", description: "Generate code for what you found" },
    ],
    get: [
      { tool: "docs", action: "search", description: "Search for more" },
      { tool: "build", action: "code", description: "Generate code from this doc" },
    ],
    browse: [
      { tool: "docs", action: "search", description: "Search for a specific topic" },
      { tool: "docs", action: "get", description: "Read a specific doc" },
    ],
    modules: [
      { tool: "docs", action: "browse", description: "Browse docs in a module" },
    ],
  },
  meta: {
    about: [
      { tool: "project", action: "hello", description: "Start a project" },
      { tool: "docs", action: "browse", description: "Browse the knowledge base" },
    ],
    status: [],
    analytics: [],
    license: [],
    modules: [
      { tool: "docs", action: "browse", description: "Browse docs" },
    ],
    health: [],
  },
};

export function getNextSteps(toolName: string, action: string): NextStep[] {
  return NEXT_STEPS[toolName]?.[action] ?? [];
}

export function formatNextSteps(steps: NextStep[]): string {
  if (steps.length === 0) return "";
  let out = "\n---\n**Next steps:**\n";
  for (const s of steps) {
    out += `- \`${s.tool} ${s.action}\` — ${s.description}\n`;
  }
  return out;
}

// ---- Enhance ----

/**
 * Post-process a tool response: prepend breadcrumb, append next steps.
 * Called from tool-registry.ts after every handler execution.
 */
export function enhanceResponse(
  result: ToolResult,
  toolName: string,
  action: string,
  deps: ToolDependencies,
  projectName?: string,
): ToolResult {
  // Skip enhancement for help actions (they're reference, not contextual)
  if (action === "help") return result;

  const snapshot = getSnapshot(deps, projectName || "default");
  const breadcrumb = getBreadcrumb(snapshot);

  // Session-aware next steps: if a session workflow is active, use its tool recommendations
  let nextSteps: NextStep[];
  if (snapshot?.sessionPath && snapshot.sessionStep) {
    const stepTools = getStepToolRecommendations(snapshot.sessionPath, snapshot.sessionStep);
    if (stepTools.length > 0) {
      nextSteps = stepTools.map(t => ({
        tool: t.tool,
        action: t.action,
        description: t.description,
      }));
    } else {
      nextSteps = getNextSteps(toolName, action);
    }
  } else {
    nextSteps = getNextSteps(toolName, action);
  }

  const nextStepsText = formatNextSteps(nextSteps);

  // Subtle upgrade nudge for free-tier docs users (once per session, after N uses)
  let nudgeText = "";
  if (deps.tier === "free" && toolName === "docs" && !nudgeShownThisSession) {
    docsResponseCount++;
    if (docsResponseCount >= CONFIG.NUDGE_AFTER_N_RESPONSES) {
      nudgeText = `\n\n*Tip: GameCodex Pro ($7/mo) adds project management, code scaffolding, and debug tools. [Learn more](${UPGRADE_URL})*`;
      nudgeShownThisSession = true;
      try { deps.analytics.recordProGate("nudge"); } catch { /* non-critical */ }
    }
  }

  // Nothing to add
  if (!breadcrumb && !nextStepsText && !nudgeText) return result;

  // Clone result to avoid mutating the original
  const content = result.content.map((c) => ({ ...c }));
  const lastIdx = content.length - 1;

  if (lastIdx >= 0 && content[lastIdx].type === "text") {
    // Prepend breadcrumb, append next steps
    if (breadcrumb) {
      content[0] = { ...content[0], text: `${breadcrumb}\n\n${content[0].text}` };
    }
    if (nextStepsText || nudgeText) {
      content[lastIdx] = { ...content[lastIdx], text: content[lastIdx].text + nextStepsText + nudgeText };
    }
  }

  return { content };
}
