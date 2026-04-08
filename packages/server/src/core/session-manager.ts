/**
 * Persistent session manager — ported from MooBot's session architecture.
 *
 * SOURCE: MooBot archive (bridge.sh)
 * - UUID-based sessions via `uuidgen | tr '[:upper:]' '[:lower:]'`
 * - Active session tracking via `${chat_id}_active` file
 * - Session metadata: { session_id, title, created, updated, total_tokens, message_count }
 * - Context % tracking with warnings at 75% and 90%
 * - Stats footer: `_{duration}s · {messages} msgs · {context} · {%}_`
 * - Auto-recovery: if session locked/invalid, create new UUID and retry
 * - /new, /chats, /switch, /rename, /delete, /clear commands
 *
 * ADAPTATION for MCP:
 * - Sessions are per-project (not per-Telegram chat_id)
 * - No Telegram-specific features (typing indicator, message chunking)
 * - Context tracking is approximate (we don't know the client's context window)
 * - Persisted to ~/.gamecodex/sessions/ as JSON files
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const CONFIG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".gamecodex"
);
const SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");

// ---- Types ----

export interface SessionMetadata {
  sessionId: string;
  project: string;
  title: string;
  created: string;       // ISO 8601
  updated: string;       // ISO 8601
  toolCalls: number;
  docsConsulted: string[];
  decisionsLogged: string[];
  /** Approximate context tokens consumed (from analytics) */
  contextTokens: number;
  /** Phase of work */
  phase: "idle" | "planning" | "working" | "reviewing";
  /** Current focus area */
  currentFocus: string;
  /** Tags for categorization */
  tags: string[];
  /** Serialized workflow state from core/session.ts */
  workflowState?: string;
}

export interface SessionContextInfo {
  contextTokens: number;
  contextPercent: number;
  warning: string | null;
}

// MooBot's context limit was 1M — we use same as default
const DEFAULT_CONTEXT_LIMIT = 1_000_000;

// ---- Session Manager ----

export class SessionManager {
  private contextLimit: number;

  constructor(contextLimit?: number) {
    this.contextLimit = contextLimit ?? DEFAULT_CONTEXT_LIMIT;
    this.ensureDir();
  }

  // ---- Session lifecycle (MooBot's /new, /switch, /delete) ----

  /** Create a new session (MooBot's new_session pattern) */
  createSession(project: string, title?: string): SessionMetadata {
    // UUID generation — MooBot used `uuidgen | tr '[:upper:]' '[:lower:]'`
    const sessionId = crypto.randomUUID();

    const now = new Date().toISOString();
    const meta: SessionMetadata = {
      sessionId,
      project,
      title: title ?? `Session ${now.split("T")[0]}`,
      created: now,
      updated: now,
      toolCalls: 0,
      docsConsulted: [],
      decisionsLogged: [],
      contextTokens: 0,
      phase: "idle",
      currentFocus: "",
      tags: [],
    };

    this.saveSession(meta);
    this.setActiveSession(project, sessionId);
    return meta;
  }

  /** Get active session for a project, or null */
  getActiveSession(project: string): SessionMetadata | null {
    const activeId = this.getActiveSessionId(project);
    if (!activeId) return null;

    const meta = this.loadSession(project, activeId);
    if (!meta) {
      // Auto-recovery: if session file missing, clear active pointer
      // MooBot pattern: "if session locked/invalid, create new UUID and retry"
      this.clearActiveSession(project);
      return null;
    }
    return meta;
  }

  /** Get or create active session (convenience) */
  getOrCreateSession(project: string): SessionMetadata {
    return this.getActiveSession(project) ?? this.createSession(project);
  }

  /** List all sessions for a project (MooBot's /chats) */
  listSessions(project: string): SessionMetadata[] {
    const sessions: SessionMetadata[] = [];
    const dir = this.projectDir(project);

    if (!fs.existsSync(dir)) return sessions;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "active.json");
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
        sessions.push(data);
      } catch {
        // Skip corrupt files
      }
    }

    // Sort by updated (most recent first)
    sessions.sort((a, b) => b.updated.localeCompare(a.updated));
    return sessions;
  }

  /** Switch active session (MooBot's /switch) */
  switchSession(project: string, sessionId: string): SessionMetadata | null {
    const meta = this.loadSession(project, sessionId);
    if (!meta) return null;
    this.setActiveSession(project, sessionId);
    return meta;
  }

  /** Rename session (MooBot's /rename) */
  renameSession(project: string, sessionId: string, title: string): boolean {
    const meta = this.loadSession(project, sessionId);
    if (!meta) return false;
    meta.title = title;
    meta.updated = new Date().toISOString();
    this.saveSession(meta);
    return true;
  }

  /** Delete session (MooBot's /delete) */
  deleteSession(project: string, sessionId: string): boolean {
    const filePath = this.sessionPath(project, sessionId);
    if (!fs.existsSync(filePath)) return false;

    fs.unlinkSync(filePath);

    // Clear active pointer if this was the active session
    if (this.getActiveSessionId(project) === sessionId) {
      this.clearActiveSession(project);
    }
    return true;
  }

  // ---- Session updates (MooBot's save_session_meta pattern) ----

  /** Record a tool call in the session */
  recordToolCall(project: string): void {
    const meta = this.getActiveSession(project);
    if (!meta) return;

    meta.toolCalls++;
    meta.updated = new Date().toISOString();
    this.saveSession(meta);
  }

  /** Record a doc consultation */
  recordDocConsulted(project: string, docId: string): void {
    const meta = this.getActiveSession(project);
    if (!meta) return;

    if (!meta.docsConsulted.includes(docId)) {
      meta.docsConsulted.push(docId);
    }
    meta.updated = new Date().toISOString();
    this.saveSession(meta);
  }

  /** Log a decision */
  logDecision(project: string, decision: string): void {
    const meta = this.getActiveSession(project);
    if (!meta) return;

    meta.decisionsLogged.push(`[${new Date().toISOString().split("T")[0]}] ${decision}`);
    meta.updated = new Date().toISOString();
    this.saveSession(meta);
  }

  /** Update session phase and focus */
  updatePhase(
    project: string,
    phase: SessionMetadata["phase"],
    focus?: string
  ): void {
    const meta = this.getActiveSession(project);
    if (!meta) return;

    meta.phase = phase;
    if (focus !== undefined) meta.currentFocus = focus;
    meta.updated = new Date().toISOString();
    this.saveSession(meta);
  }

  /** Update context token estimate */
  updateContextTokens(project: string, tokens: number): void {
    const meta = this.getActiveSession(project);
    if (!meta) return;

    meta.contextTokens = tokens;
    meta.updated = new Date().toISOString();
    this.saveSession(meta);
  }

  /** Store serialized workflow state (from core/session.ts SessionState) */
  updateWorkflowState(project: string, workflowState: string): void {
    const meta = this.getActiveSession(project);
    if (!meta) return;

    meta.workflowState = workflowState;
    meta.updated = new Date().toISOString();
    this.saveSession(meta);
  }

  // ---- Context tracking (MooBot's context % with warnings) ----

  /**
   * Get context info with warnings.
   *
   * MooBot pattern:
   * - Context = input_tokens + cache_read + cache_creation
   * - Warning at 75%: "Context getting high — consider /new or /clear."
   * - Warning at 90%: "Context nearly full! Use /new or /clear soon."
   */
  getContextInfo(project: string): SessionContextInfo {
    const meta = this.getActiveSession(project);
    const tokens = meta?.contextTokens ?? 0;
    const percent = Math.round((tokens / this.contextLimit) * 1000) / 10; // 1 decimal

    let warning: string | null = null;
    if (percent >= 90) {
      warning = "Context nearly full! Consider starting a new session.";
    } else if (percent >= 75) {
      warning = "Context getting high — consider starting a new session soon.";
    }

    return { contextTokens: tokens, contextPercent: percent, warning };
  }

  /**
   * Format stats footer (MooBot's stats pattern).
   *
   * MooBot format: `_{duration}s · {messages} msgs · {context} · {%}_`
   * Adapted: `_{tool_calls} calls · {docs} docs · {context} · {%}_`
   */
  formatStatsFooter(project: string): string {
    const meta = this.getActiveSession(project);
    if (!meta) return "";

    const ctx = this.getContextInfo(project);
    const tokenStr = formatTokens(ctx.contextTokens);
    const parts = [
      `${meta.toolCalls} calls`,
      `${meta.docsConsulted.length} docs`,
      `${tokenStr} context`,
      `${ctx.contextPercent}%`,
    ];

    let footer = `\n_${parts.join(" · ")}_`;
    if (ctx.warning) {
      footer += `\n_${ctx.warning}_`;
    }
    return footer;
  }

  // ---- Persistence helpers ----

  private ensureDir(): void {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true, mode: 0o700 });
    }
  }

  private projectDir(project: string): string {
    // Sanitize project name for filesystem
    const safe = project.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    return path.join(SESSIONS_DIR, safe);
  }

  private sessionPath(project: string, sessionId: string): string {
    return path.join(this.projectDir(project), `${sessionId}.json`);
  }

  private activePath(project: string): string {
    return path.join(this.projectDir(project), "active.json");
  }

  private saveSession(meta: SessionMetadata): void {
    const dir = this.projectDir(meta.project);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(
      this.sessionPath(meta.project, meta.sessionId),
      JSON.stringify(meta, null, 2),
      { mode: 0o600 }
    );
  }

  private loadSession(project: string, sessionId: string): SessionMetadata | null {
    const filePath = this.sessionPath(project, sessionId);
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  }

  /** MooBot pattern: active session pointer stored as plain file */
  private getActiveSessionId(project: string): string | null {
    const filePath = this.activePath(project);
    try {
      if (!fs.existsSync(filePath)) return null;
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return data.sessionId ?? null;
    } catch {
      return null;
    }
  }

  private setActiveSession(project: string, sessionId: string): void {
    const dir = this.projectDir(project);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(
      this.activePath(project),
      JSON.stringify({ sessionId, updated: new Date().toISOString() }),
      { mode: 0o600 }
    );
  }

  private clearActiveSession(project: string): void {
    const filePath = this.activePath(project);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

// ---- Helpers ----

/** Format token count (MooBot's numfmt_tokens pattern: 102K, 1.2M) */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

// ---- Singleton ----

let _instance: SessionManager | null = null;

export function getSessionManager(contextLimit?: number): SessionManager {
  if (!_instance) {
    _instance = new SessionManager(contextLimit);
  }
  return _instance;
}
