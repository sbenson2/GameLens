/** Tier definitions and permission checks */

export type Tier = "free" | "pro";

export const UPGRADE_URL = "https://gamedev-mcp.lemonsqueezy.com";
export const PRO_GATE_MESSAGE = `This feature requires a Pro license. Get one at ${UPGRADE_URL}`;

/** Which tools are available per tier */
const TOOL_ACCESS: Record<Tier, Record<string, boolean | "limited">> = {
  free: {
    list_docs: true,
    search_docs: "limited", // core module only
    get_doc: "limited",     // core module only
    session: false,
    genre_lookup: "limited", // generic info only
    license_info: true,
  },
  pro: {
    list_docs: true,
    search_docs: true,
    get_doc: true,
    session: true,
    genre_lookup: true,
    license_info: true,
  },
};

/** Modules accessible per tier */
const MODULE_ACCESS: Record<Tier, string[]> = {
  free: ["core"],
  pro: [], // empty = all modules
};

export function isToolAllowed(tier: Tier, tool: string): boolean | "limited" {
  const access = TOOL_ACCESS[tier]?.[tool];
  if (access === undefined) return tier === "pro"; // new tools default to pro-only
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
        search_docs: "All modules",
        get_doc: "All modules",
        session: "Full session co-pilot",
        genre_lookup: "Full system mappings + recommended docs",
        license_info: "Available",
      },
      modules: ["core", "monogame-arch", "future premium modules"],
      description: "Pro — all tools and modules fully unlocked",
    };
  }

  return {
    tools: {
      list_docs: "Full access",
      search_docs: "Core module only",
      get_doc: "Core module only",
      session: "Locked (Pro)",
      genre_lookup: "Generic info only (Pro for full mappings)",
      license_info: "Available",
    },
    modules: ["core"],
    description: "Free tier — core docs and limited tools",
  };
}
