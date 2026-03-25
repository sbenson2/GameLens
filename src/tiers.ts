/** Tier definitions and permission checks */

export type Tier = "free" | "pro";

/** Tool access level — replaces the old boolean | "limited" union */
export type ToolAccess = "full" | "limited" | "denied";

export const UPGRADE_URL = "https://gamedev-mcp.lemonsqueezy.com";
export const PRO_GATE_MESSAGE = `This feature requires a Pro license. Get one at ${UPGRADE_URL}`;

/** Which tools are available per tier */
const TOOL_ACCESS: Record<Tier, Record<string, ToolAccess>> = {
  free: {
    list_docs: "full",
    list_modules: "full",       // discovery — shows what Pro unlocks (conversion driver)
    search_docs: "limited",     // core module only
    get_doc: "limited",         // core module only
    session: "denied",
    genre_lookup: "limited",    // generic info only
    license_info: "full",
    random_doc: "limited",      // core module only
    compare_engines: "denied",  // pro only — cross-engine access
    migration_guide: "denied",  // pro only — cross-engine access
  },
  pro: {
    list_docs: "full",
    list_modules: "full",
    search_docs: "full",
    get_doc: "full",
    session: "full",
    genre_lookup: "full",
    license_info: "full",
    random_doc: "full",
    compare_engines: "full",
    migration_guide: "full",
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
        list_docs: "Full access",
        list_modules: "Full access",
        search_docs: "All modules, unlimited",
        get_doc: "All modules, unlimited, section extraction",
        session: "Full session co-pilot",
        genre_lookup: "Full system mappings + recommended docs",
        license_info: "Available",
        random_doc: "All modules",
        compare_engines: "Cross-engine topic comparison with theory docs",
        migration_guide: "Engine migration guidance with concept mappings and gotchas",
      },
      modules: ["core", "monogame-arch", "godot-arch", "future premium modules"],
      description: "Pro ($9/mo) — all tools and modules fully unlocked",
    };
  }

  return {
    tools: {
      list_docs: "Full access",
      list_modules: "Full access (discover available engines)",
      search_docs: "Core module only (50/day)",
      get_doc: "Core module only (30/day)",
      session: "Locked (Pro)",
      genre_lookup: "Generic info only (Pro for full mappings)",
      license_info: "Available",
      random_doc: "Core module only",
      compare_engines: "Locked (Pro)",
      migration_guide: "Locked (Pro)",
    },
    modules: ["core"],
    description: "Free tier — core docs with daily limits",
  };
}
