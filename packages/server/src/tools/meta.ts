/**
 * meta — Server diagnostics, license info, and onboarding help.
 *
 * Internal-facing tool for server health and setup.
 */

import { z } from "zod";
import { GameCodexToolDef, ToolResult, ToolDependencies } from "../tool-definition.js";
import { unknownAction } from "../core/error-helpers.js";
import { getToolHelp } from "../core/help-generator.js";
import { handleDiagnostics, DiagnosticsContext } from "./diagnostics.js";
import { getTierFeatures, UPGRADE_URL } from "../tiers.js";

// DiagnosticsContext is injected via closure in server.ts
let _diagnosticsCtx: DiagnosticsContext | null = null;

export function setDiagnosticsContext(ctx: DiagnosticsContext): void {
  _diagnosticsCtx = ctx;
}

export const metaToolDef: GameCodexToolDef = {
  name: "meta",
  description: "Use when: checking server health, viewing usage stats, managing license, listing engines/modules, or explaining what GameCodex is. Actions: status, analytics, license, modules, health, about.",
  inputSchema: {
    action: z.enum(["help", "status", "analytics", "license", "modules", "health", "about"]).describe(
      "status: server overview and uptime | analytics: usage statistics | license: tier info and access details | modules: list available engines | health: quick server health check | about: what is GameCodex (use when user asks 'what is this' or 'help')"
    ),
    project: z.string().optional().describe("Project name for session queries"),
  },
  handler: async (args: Record<string, unknown>, deps: ToolDependencies): Promise<ToolResult> => {
    const action = args.action as string;
    const validActions = ["help", "status", "analytics", "license", "modules", "health", "about"];
    if (!validActions.includes(action)) {
      return unknownAction(action, validActions, "meta");
    }

    if (action === "help") return getToolHelp("meta");

    if (action === "about") {
      let output = `# GameCodex v${deps.serverVersion}\n\n`;
      output += `**AI game dev co-pilot** for game developers.\n\n`;
      output += `## 5 Tools\n\n`;
      output += `| Tool | What it does |\n`;
      output += `|------|--------------|\n`;
      output += `| \`project\` | Interactive co-pilot — onboarding, goals, decisions, health |\n`;
      output += `| \`design\` | GDD, phase checklists, scope analysis, marketing, launch |\n`;
      output += `| \`docs\` | Search/browse 150+ game dev knowledge docs |\n`;
      output += `| \`build\` | Scaffold, starter code, asset pipeline, debug, review |\n`;
      output += `| \`meta\` | Server health, analytics, license (you're here) |\n\n`;
      output += `**Engines:** MonoGame, Godot, Phaser\n`;
      output += `**Knowledge base:** ${deps.allDocs.length} docs\n`;
      return { content: [{ type: "text", text: output }] };
    }

    if (action === "license") {
      const features = getTierFeatures(deps.tier);
      let output = `# License Info\n\n`;
      output += `**Tier:** ${deps.tier === "pro" ? "Pro" : "Free"}\n`;
      output += `**Description:** ${features.description}\n\n`;
      output += `## Tool Access\n\n`;
      for (const [tool, status] of Object.entries(features.tools)) {
        output += `- **${tool}**: ${status}\n`;
      }
      output += `\n## Modules\n\n`;
      for (const mod of features.modules) {
        output += `- ${mod}\n`;
      }
      if (deps.tier === "free") {
        output += `\n---\n**Upgrade:** ${UPGRADE_URL}\n`;
      }
      return { content: [{ type: "text", text: output }] };
    }

    // Delegate to existing diagnostics handler
    if (!_diagnosticsCtx) {
      return { content: [{ type: "text", text: "Diagnostics context not initialized." }] };
    }

    return handleDiagnostics(
      { action: action as any, project: args.project as string | undefined },
      deps.sessionManager,
      deps.memory,
      deps.analytics,
      _diagnosticsCtx,
    );
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  category: "system",
  activityDescription: "Server info",
};
