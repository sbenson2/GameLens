/**
 * Health tracker — scope creep detection, pace analysis, and project
 * health assessments. Pure functions operating on ProjectData.
 */

import { ProjectData, Phase } from "./project-store.js";

// ---- Types ----

export interface HealthReport {
  overall: "healthy" | "caution" | "warning";
  scope: ScopeAssessment;
  phase: PhaseAssessment;
  suggestions: string[];
}

export interface ScopeAssessment {
  status: "lean" | "moderate" | "bloated";
  featureCount: number;
  activeGoals: number;
  completedGoals: number;
  message: string;
}

export interface PhaseAssessment {
  phase: Phase;
  decisionsInPhase: number;
  milestonesHit: number;
  message: string;
}

// ---- Phase expectations ----

const PHASE_FEATURE_LIMITS: Record<Phase, { warn: number; danger: number }> = {
  planning: { warn: 8, danger: 12 },
  prototype: { warn: 5, danger: 10 },
  production: { warn: 15, danger: 25 },
  polish: { warn: 3, danger: 5 },   // should be zero new features
  release: { warn: 1, danger: 3 },   // definitely zero new features
};

// ---- Health Tracker ----

export class HealthTracker {
  /** Full health check */
  check(data: ProjectData): HealthReport {
    const scope = this.assessScope(data);
    const phase = this.assessPhase(data);
    const suggestions = this.getSuggestions(data, scope, phase);

    let overall: HealthReport["overall"] = "healthy";
    if (scope.status === "bloated" || (data.phase === "polish" && data.featureCount > PHASE_FEATURE_LIMITS.polish.danger)) {
      overall = "warning";
    } else if (scope.status === "moderate" || suggestions.length > 2) {
      overall = "caution";
    }

    return { overall, scope, phase, suggestions };
  }

  /** Assess scope health */
  assessScope(data: ProjectData): ScopeAssessment {
    const activeGoals = data.goals.filter((g) => !g.completed).length;
    const completedGoals = data.goals.filter((g) => g.completed).length;
    const limits = PHASE_FEATURE_LIMITS[data.phase];

    let status: ScopeAssessment["status"] = "lean";
    let message = "Scope looks good. Stay focused.";

    if (data.featureCount >= limits.danger) {
      status = "bloated";
      message = `${data.featureCount} features is a lot for ${data.phase} phase. Seriously consider cutting.`;
    } else if (data.featureCount >= limits.warn) {
      status = "moderate";
      message = `${data.featureCount} features — getting heavy. Review what's truly essential.`;
    }

    if (activeGoals > 5) {
      status = status === "lean" ? "moderate" : status;
      message += ` ${activeGoals} active goals — consider finishing some before adding more.`;
    }

    return { status, featureCount: data.featureCount, activeGoals, completedGoals, message };
  }

  /** Assess phase health */
  assessPhase(data: ProjectData): PhaseAssessment {
    const decisionsInPhase = data.decisions.length;
    const milestonesHit = data.milestones.length;

    let message = "";

    switch (data.phase) {
      case "planning":
        if (decisionsInPhase === 0) {
          message = "No decisions logged yet. Use `project` to log key decisions as you make them.";
        } else {
          message = `${decisionsInPhase} decisions logged. Good foundation.`;
        }
        break;
      case "prototype":
        if (milestonesHit === 0) {
          message = "No milestones yet. Set small targets: core loop working, first playtest.";
        } else {
          message = `${milestonesHit} milestone${milestonesHit === 1 ? "" : "s"} hit. Keep the momentum.`;
        }
        break;
      case "production":
        message = `Building phase: ${data.featureCount} features, ${milestonesHit} milestones. Stay systematic.`;
        break;
      case "polish":
        if (data.featureCount > PHASE_FEATURE_LIMITS.polish.warn) {
          message = "You're adding features in polish phase. That's production work — go back or accept the scope.";
        } else {
          message = "Polish phase: bugs, juice, performance. No new features.";
        }
        break;
      case "release":
        message = "Ship it. The game exists when players can play it.";
        break;
    }

    return { phase: data.phase, decisionsInPhase, milestonesHit, message };
  }

  /** Evaluate whether adding a feature is wise right now */
  evaluateFeature(data: ProjectData, featureDescription: string): string {
    const limits = PHASE_FEATURE_LIMITS[data.phase];
    const current = data.featureCount;

    let output = `## Scope Check: "${featureDescription}"\n\n`;
    output += `**Current phase:** ${data.phase} | **Features:** ${current}\n\n`;

    if (data.phase === "polish" || data.phase === "release") {
      output += `**Verdict: No.** You're in ${data.phase} phase. Adding features now is scope creep.\n\n`;
      output += `If this feature is essential, go back to production phase deliberately.\n`;
      return output;
    }

    if (current >= limits.danger) {
      output += `**Verdict: Cut something first.** You have ${current} features — that's already over the recommended limit for ${data.phase} phase (${limits.danger}).\n\n`;
      output += `Before adding "${featureDescription}", remove or defer a lower-priority feature.\n`;
    } else if (current >= limits.warn) {
      output += `**Verdict: Proceed with caution.** You're at ${current} features (warning threshold: ${limits.warn}).\n\n`;
      output += `Ask yourself: Does this feature support the core loop? If not, defer it.\n`;
    } else {
      output += `**Verdict: Go for it.** Scope is healthy (${current} features, limit: ${limits.warn}).\n\n`;
      output += `Log this decision with \`project\` tool so you can track it.\n`;
    }

    return output;
  }

  /** Format a full health report */
  format(report: HealthReport): string {
    const icon = report.overall === "healthy" ? "OK" : report.overall === "caution" ? "!!" : "XX";

    let output = `# Project Health [${icon}]\n\n`;

    // Scope
    output += `## Scope: ${report.scope.status}\n\n`;
    output += `${report.scope.message}\n\n`;
    output += `- Features: ${report.scope.featureCount}\n`;
    output += `- Active goals: ${report.scope.activeGoals}\n`;
    output += `- Completed goals: ${report.scope.completedGoals}\n\n`;

    // Phase
    output += `## Phase: ${report.phase.phase}\n\n`;
    output += `${report.phase.message}\n\n`;

    // Suggestions
    if (report.suggestions.length > 0) {
      output += `## Suggestions\n\n`;
      for (const s of report.suggestions) {
        output += `- ${s}\n`;
      }
    }

    return output;
  }

  // ---- Internal ----

  private getSuggestions(data: ProjectData, scope: ScopeAssessment, phase: PhaseAssessment): string[] {
    const suggestions: string[] = [];

    // Scope suggestions
    if (scope.status === "bloated") {
      suggestions.push("Review your feature list and cut the bottom 20%. Ship what matters.");
    }
    if (scope.activeGoals > 5) {
      suggestions.push(`${scope.activeGoals} active goals is too many to focus on. Pick your top 3.`);
    }
    if (scope.activeGoals === 0 && data.phase !== "release") {
      suggestions.push("No active goals set. Use `project` to add goals for this phase.");
    }

    // Phase suggestions
    if (data.phase === "prototype" && data.featureCount > 5) {
      suggestions.push("Prototype phase should prove ONE mechanic. You're building too many features.");
    }
    if (data.phase === "production" && data.milestones.length === 0) {
      suggestions.push("Set milestones to track production progress. Even small ones help.");
    }
    if (data.phase === "polish" && data.featureCount > PHASE_FEATURE_LIMITS.polish.warn) {
      suggestions.push("You're adding features during polish. That's scope creep. Decide: go back to production or cut.");
    }

    // Decision log
    if (data.decisions.length === 0) {
      suggestions.push("Start logging decisions. Future-you will thank present-you.");
    }

    return suggestions;
  }
}

// ---- Singleton ----

let _instance: HealthTracker | null = null;

export function getHealthTracker(): HealthTracker {
  if (!_instance) {
    _instance = new HealthTracker();
  }
  return _instance;
}
