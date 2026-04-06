/**
 * Diagnostics MCP tool — server health, session stats, and system info.
 *
 * SOURCE: MooBot archive (bridge.sh)
 * - /status: Show tokens, context %, created, updated, message count, agents, crons
 * - /agents: Show active agents / max, model, context window, budget, deny list
 * - Stats footer: `_{duration}s · {messages} msgs · {context} · {%}_`
 * - Context warnings at 75% and 90%
 *
 * SOURCE: Claude Code source analysis
 * - Tool metadata: isReadOnly, isConcurrencySafe (both true for diagnostics)
 * - Analytics integration for usage patterns
 * - Module discovery info
 *
 * ADAPTATION:
 * - Combines MooBot's /status + /agents into one diagnostic tool
 * - Adds analytics summary, module info, search engine status
 * - Read-only and concurrent-safe (from CC patterns)
 */

import { ToolResult } from "../tool-definition.js";
import { SessionManager } from "../core/session-manager.js";
import { MemoryStore } from "../core/memory.js";
import { Analytics } from "../analytics.js";

export interface DiagnosticsContext {
  serverVersion: string;
  tier: "free" | "pro";
  activeModules: string[];
  totalDocs: number;
  discoveredModules: Array<{ id: string; label: string; docCount: number }>;
  hasVectorSearch: boolean;
  hasHybridProvider: boolean;
  startTime: number;
}

export function handleDiagnostics(
  args: {
    action: string;
    project?: string;
  },
  sessionManager: SessionManager,
  memory: MemoryStore,
  analytics: Analytics,
  ctx: DiagnosticsContext
): ToolResult {
  switch (args.action) {
    case "status":
      return handleStatus(args.project, sessionManager, analytics, ctx);

    case "session":
      return handleSessionInfo(args.project, sessionManager);

    case "modules":
      return handleModulesInfo(ctx);

    case "analytics":
      return handleAnalyticsSummary(analytics);

    case "health":
      return handleHealth(sessionManager, memory, analytics, ctx);

    default:
      return {
        content: [{
          type: "text",
          text: `Unknown diagnostics action "${args.action}". Valid: status, session, modules, analytics, health`,
        }],
      };
  }
}

/**
 * Server status — adapted from MooBot's /status command.
 *
 * MooBot format:
 *   tokens, context %, created, updated, message count, agents, crons
 *
 * GameCodex format:
 *   version, tier, uptime, modules, docs, search mode, session stats
 */
function handleStatus(
  project: string | undefined,
  sessionManager: SessionManager,
  analytics: Analytics,
  ctx: DiagnosticsContext
): ToolResult {
  const proj = project ?? "default";
  const session = sessionManager.getActiveSession(proj);
  const contextInfo = sessionManager.getContextInfo(proj);
  const summary = analytics.getSummary();
  const uptimeMs = Date.now() - ctx.startTime;
  const uptimeMin = Math.round(uptimeMs / 60_000);

  let output = `====================================================================
  GAMECODEX STATUS
====================================================================

  Version    ${ctx.serverVersion}
  Tier       ${ctx.tier === "pro" ? "Pro" : "Free"}
  Uptime     ${uptimeMin} min
  Modules    ${ctx.activeModules.length + 1} active (core + ${ctx.activeModules.join(", ") || "none"})
  Docs       ${ctx.totalDocs} loaded
  Search     ${ctx.hasVectorSearch ? "Hybrid (TF-IDF + vector)" : "Keyword (TF-IDF)"}
`;

  if (session) {
    output += `
  --- Active Session ---
  ID         ${session.sessionId.substring(0, 8)}...
  Project    ${session.project}
  Title      ${session.title}
  Phase      ${session.phase}
  Focus      ${session.currentFocus || "(none)"}
  Tool Calls ${session.toolCalls}
  Docs Used  ${session.docsConsulted.length}
  Decisions  ${session.decisionsLogged.length}
  Created    ${session.created.split("T")[0]}
  Updated    ${session.updated.split("T")[0]}
`;
    if (contextInfo.contextTokens > 0) {
      output += `  Context    ${contextInfo.contextPercent}%\n`;
    }
    if (contextInfo.warning) {
      output += `  Warning    ${contextInfo.warning}\n`;
    }
  } else {
    output += `\n  No active session for project "${proj}"\n`;
  }

  output += `
  --- Today's Usage ---
  Tool Calls ${Object.values(summary.tools).reduce((s, t) => s + t.calls, 0)}
  Searches   ${summary.search.totalQueries}
  Doc Fetches ${summary.docs.totalFetches}
====================================================================`;

  return { content: [{ type: "text", text: output }] };
}

/**
 * Session info — adapted from MooBot's /chats command.
 */
function handleSessionInfo(
  project: string | undefined,
  sessionManager: SessionManager
): ToolResult {
  const proj = project ?? "default";
  const sessions = sessionManager.listSessions(proj);
  const activeSession = sessionManager.getActiveSession(proj);

  if (sessions.length === 0) {
    return {
      content: [{
        type: "text",
        text: `No sessions found for project "${proj}". Sessions are created automatically when you use session-aware tools.`,
      }],
    };
  }

  let output = `# Sessions — ${proj}\n\n`;
  for (const s of sessions) {
    const isActive = s.sessionId === activeSession?.sessionId;
    const marker = isActive ? " **[ACTIVE]**" : "";
    output += `- **${s.title}**${marker} — ${s.sessionId.substring(0, 8)}...\n`;
    output += `  ${s.toolCalls} calls · ${s.docsConsulted.length} docs · ${s.phase} · ${s.updated.split("T")[0]}\n`;
  }

  return { content: [{ type: "text", text: output }] };
}

/**
 * Module info — adapted from MooBot's /agents command.
 * MooBot showed active agents; we show active modules.
 */
function handleModulesInfo(ctx: DiagnosticsContext): ToolResult {
  let output = `# Modules\n\n`;
  output += `| Module | Engine | Docs | Status |\n`;
  output += `|--------|--------|------|--------|\n`;
  output += `| core | (agnostic) | - | Active |\n`;

  for (const mod of ctx.discoveredModules) {
    const active = ctx.activeModules.includes(mod.id);
    output += `| ${mod.id} | ${mod.label} | ${mod.docCount} | ${active ? "Active" : "Inactive"} |\n`;
  }

  output += `\n**Total:** ${ctx.totalDocs} docs across ${ctx.activeModules.length + 1} modules\n`;
  output += `**Search:** ${ctx.hasVectorSearch ? "Hybrid (TF-IDF + vector)" : "Keyword only"}\n`;

  return { content: [{ type: "text", text: output }] };
}

/**
 * Analytics summary — privacy-respecting usage patterns.
 */
function handleAnalyticsSummary(analytics: Analytics): ToolResult {
  const summary = analytics.getSummary();
  const recent = analytics.getRecentSummaries(7);

  let output = `# Analytics Summary\n\n`;
  output += `## Today (${summary.date})\n\n`;

  // Tool usage
  const toolEntries = Object.entries(summary.tools);
  if (toolEntries.length > 0) {
    output += `### Tool Usage\n\n`;
    output += `| Tool | Calls | Errors | Avg ms |\n`;
    output += `|------|-------|--------|--------|\n`;
    for (const [name, usage] of toolEntries.sort((a, b) => b[1].calls - a[1].calls)) {
      output += `| ${name} | ${usage.calls} | ${usage.errors} | ${usage.avgDurationMs} |\n`;
    }
    output += "\n";
  }

  // Search stats
  if (summary.search.totalQueries > 0) {
    output += `### Search\n\n`;
    output += `- Queries: ${summary.search.totalQueries}\n`;
    output += `- Avg results: ${summary.search.avgResultCount}\n`;
    output += `- Zero results: ${summary.search.zeroResultQueries}\n`;
    if (Object.keys(summary.search.byModule).length > 0) {
      output += `- By module: ${Object.entries(summary.search.byModule).map(([m, c]) => `${m}(${c})`).join(", ")}\n`;
    }
    output += "\n";
  }

  // 7-day trend
  if (recent.length > 1) {
    output += `## 7-Day Trend\n\n`;
    output += `| Date | Tool Calls | Searches | Doc Fetches |\n`;
    output += `|------|-----------|----------|-------------|\n`;
    for (const day of recent) {
      const calls = Object.values(day.tools).reduce((s, t) => s + t.calls, 0);
      output += `| ${day.date} | ${calls} | ${day.search.totalQueries} | ${day.docs.totalFetches} |\n`;
    }
  }

  return { content: [{ type: "text", text: output }] };
}

/**
 * Health check — quick overview combining MooBot's /status
 * with CC's tool readiness checks.
 */
function handleHealth(
  sessionManager: SessionManager,
  memory: MemoryStore,
  analytics: Analytics,
  ctx: DiagnosticsContext
): ToolResult {
  const uptimeMs = Date.now() - ctx.startTime;
  const projects = memory.listProjects();

  let output = `# Server Health\n\n`;
  output += `- **Status:** Running\n`;
  output += `- **Version:** ${ctx.serverVersion}\n`;
  output += `- **Tier:** ${ctx.tier}\n`;
  output += `- **Uptime:** ${Math.round(uptimeMs / 60_000)} min\n`;
  output += `- **Docs loaded:** ${ctx.totalDocs}\n`;
  output += `- **Active modules:** ${ctx.activeModules.length + 1}\n`;
  output += `- **Vector search:** ${ctx.hasVectorSearch ? "Ready" : "Not available"}\n`;
  output += `- **Hybrid provider:** ${ctx.hasHybridProvider ? "Enabled" : "Local only"}\n`;
  output += `- **Memory projects:** ${projects.length}\n`;
  output += `- **Analytics:** ${analytics.getSummary().date === new Date().toISOString().slice(0, 10) ? "Active" : "Stale"}\n`;

  return { content: [{ type: "text", text: output }] };
}
