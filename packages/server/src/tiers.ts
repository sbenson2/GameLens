/** Tier definitions and permission checks */

export type Tier = "free" | "pro";

/** Tool access level — replaces the old boolean | "limited" union */
export type ToolAccess = "full" | "limited" | "denied";

export const UPGRADE_URL = "https://gamecodex.dev/pro";
export const PRO_GATE_MESSAGE = `This feature requires a Pro license. Get one at ${UPGRADE_URL}`;

/** Which tools are available per tier (5 tools) */
const TOOL_ACCESS: Record<Tier, Record<string, ToolAccess>> = {
  free: {
    project: "full",       // co-pilot drives adoption + retention
    design: "full",        // planning + shipping drives adoption
    docs: "limited",       // core module only (Pro for engine-specific)
    build: "limited",      // scaffold+code+assets+debug free, review pro-only
    meta: "full",          // always available
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
  free: ["core"],
  pro: [], // empty = all modules
};

export function isToolAllowed(tier: Tier, tool: string): ToolAccess {
  const access = TOOL_ACCESS[tier]?.[tool];
  if (access === undefined) return tier === "pro" ? "full" : "denied"; // new tools default to pro-only
  return access;
}

export function isModuleAllowed(tier: Tier, module: string): boolean {
  if (tier === "pro") return true;
  return MODULE_ACCESS[tier].includes(module);
}

export function getTierFeatures(tier: Tier): {
  tools: Record<string, string>;
  modules: string[];
  description: string;
} {
  if (tier === "pro") {
    return {
      tools: {
        project: "Co-pilot — onboarding, goals, decisions, scope health, personality",
        design: "GDD, phase checklists, scope analysis, marketing, launch, patterns",
        docs: "All modules — search, get, browse 150+ docs",
        build: "Scaffold, starter code, asset pipeline, debug, architecture review",
        meta: "Server health, analytics, license info",
      },
      modules: ["core", "monogame-arch", "godot-arch", "future premium modules"],
      description: "Pro ($5/mo) — all tools and modules fully unlocked",
    };
  }

  return {
    tools: {
      project: "Full access",
      design: "Full access",
      docs: "Core module only (Pro for engine-specific)",
      build: "Scaffold + code + assets + debug free; review requires Pro",
      meta: "Full access",
    },
    modules: ["core"],
    description: "Free tier — core docs only",
  };
}
