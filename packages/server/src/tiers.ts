/** Tier definitions and permission checks */

export type Tier = "free" | "pro";

/** Tool access level — replaces the old boolean | "limited" union */
export type ToolAccess = "full" | "limited" | "denied";

export const UPGRADE_URL = "https://gamecodex.dev/pro";
export const PRO_GATE_MESSAGE =
  `This feature requires GameCodex Pro ($7/mo). ` +
  `Get a license at ${UPGRADE_URL}, then run \`gamecodex setup\` to activate.`;

/** Which tools are available per tier (5 tools) */
const TOOL_ACCESS: Record<Tier, Record<string, ToolAccess>> = {
  free: {
    project: "denied",     // Pro — AI assistant, goals, decisions, scope
    design: "denied",      // Pro — GDD, phases, marketing, launch
    docs: "full",          // Free — full knowledge base drives adoption
    build: "denied",       // Pro — scaffold, code, assets, debug, review
    meta: "full",          // always available (license management, diagnostics)
  },
  pro: {
    project: "full",
    design: "full",
    docs: "full",
    build: "full",
    meta: "full",
  },
};

/** Modules accessible per tier */
const MODULE_ACCESS: Record<Tier, string[]> = {
  free: [], // empty = all modules (docs is fully free)
  pro: [], // empty = all modules
};

// Prevent runtime mutation of access tables
Object.freeze(TOOL_ACCESS);
Object.freeze(TOOL_ACCESS.free);
Object.freeze(TOOL_ACCESS.pro);
Object.freeze(MODULE_ACCESS);
Object.freeze(MODULE_ACCESS.free);
Object.freeze(MODULE_ACCESS.pro);

export function isToolAllowed(tier: Tier, tool: string): ToolAccess {
  const access = TOOL_ACCESS[tier]?.[tool];
  if (access === undefined) return tier === "pro" ? "full" : "denied"; // new tools default to pro-only
  return access;
}

export function isModuleAllowed(tier: Tier, module: string): boolean {
  const allowed = MODULE_ACCESS[tier];
  if (allowed.length === 0) return true; // empty = all modules
  return allowed.includes(module);
}

export function getTierFeatures(tier: Tier): {
  tools: Record<string, string>;
  modules: string[];
  description: string;
} {
  if (tier === "pro") {
    return {
      tools: {
        project: "AI assistant — onboarding, goals, decisions, scope health, personality",
        design: "GDD, phase checklists, scope analysis, marketing, launch, patterns",
        docs: "All modules — search, get, browse 950+ docs",
        build: "Scaffold, starter code, asset pipeline, debug, architecture review",
        meta: "Server health, analytics, license info",
      },
      modules: ["core", "all engine modules (MonoGame, Godot, Unity, Unreal, Bevy, and 24 more)"],
      description: "Pro ($7/mo) — all tools and modules fully unlocked",
    };
  }

  return {
    tools: {
      project: "Pro only",
      design: "Pro only",
      docs: "Full access — all 950+ docs across 29 engines",
      build: "Pro only",
      meta: "Full access",
    },
    modules: ["core", "all engine modules"],
    description: "Free tier — full docs access, Pro unlocks project/design/build tools",
  };
}
