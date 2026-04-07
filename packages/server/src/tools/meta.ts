/**
 * meta — Server diagnostics, license info, and onboarding help.
 *
 * Internal-facing tool for server health and setup.
 */

import { z } from "zod";
import { GameCodexToolDef, ToolResult, ToolDependencies } from "../tool-definition.js";
import { handleDiagnostics, DiagnosticsContext } from "./diagnostics.js";
import { getTierFeatures, UPGRADE_URL } from "../tiers.js";

// DiagnosticsContext is injected via closure in server.ts
let _diagnosticsCtx: DiagnosticsContext | null = null;

export function setDiagnosticsContext(ctx: DiagnosticsContext): void {
  _diagnosticsCtx = ctx;
}

export const metaToolDef: GameCodexToolDef = {
  name: "meta",
  description: "Server info — health status, usage analytics, license tier, available modules, and GameCodex overview. Actions: status, analytics, license, modules, health, about.",
  inputSchema: {
    action: z.enum(["status", "analytics", "license", "modules", "health", "about"]).describe(
      "status: overview | analytics: usage stats | license: tier + access | modules: engines | health: quick check | about: what is GameCodex"
    ),
    project: z.string().optional().describe("Project name for session queries"),
  },
  handler: async (args: Record<string, unknown>, deps: ToolDependencies): Promise<ToolResult> => {
    const action = args.action as string;

    if (action === "about") {
      let output = `# GameCodex v${deps.serverVersion}\n\n`;
      output += `**AI game dev co-pilot** for solo and indie developers.\n\n`;
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
