/** Tier definitions and permission checks */

export type Tier = "free" | "pro";

/** Tool access level — replaces the old boolean | "limited" union */
export type ToolAccess = "full" | "limited" | "denied";

export const UPGRADE_URL = "https://gamecodex.dev/pro";
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
    // Phase 1 tools
    explain_concept: "limited", // core docs only
    scaffold_project: "full",   // scaffolding is free (drives adoption)
    generate_gdd: "full",       // GDD is free (drives adoption)
    review_architecture: "denied", // pro only
    project_context: "full",    // context is free (becomes essential)
    // Phase 2 tools
    teach: "limited",           // free gets core paths, Pro gets engine-specific + all paths
    // MooBot-inspired tools
    memory: "full",             // memory is free (becomes essential, drives retention)
    diagnostics: "full",        // diagnostics always available
    // Phase 3 tools
    debug_guide: "full",        // high value daily pain point (drives adoption)
    generate_starter: "full",   // starter code drives adoption like scaffold_project
    phase_checklist: "full",    // prevents scope creep (drives retention)
    asset_guide: "full",        // serves underserved art/audio devs (drives adoption)
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
    // Phase 1 tools
    explain_concept: "full",
    scaffold_project: "full",
    generate_gdd: "full",
    review_architecture: "full",
    project_context: "full",
    // Phase 2 tools
    teach: "full",
    // MooBot-inspired tools
    memory: "full",
    diagnostics: "full",
    // Phase 3 tools
    debug_guide: "full",
    generate_starter: "full",
    phase_checklist: "full",
    asset_guide: "full",
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
        search_docs: "All modules",
        get_doc: "All modules, section extraction",
        session: "Full session co-pilot",
        genre_lookup: "Full system mappings + recommended docs",
        license_info: "Available",
        random_doc: "All modules",
        compare_engines: "Cross-engine topic comparison with theory docs",
        migration_guide: "Engine migration guidance with concept mappings and gotchas",
        explain_concept: "Adaptive explanations at any skill level, all modules",
        scaffold_project: "Project scaffolding for all engines",
        generate_gdd: "Game design document generation",
        review_architecture: "Project structure review with engine-specific checks",
        project_context: "Per-project context tracking",
        memory: "Persistent project memory across sessions",
        diagnostics: "Server health, session stats, analytics",
        debug_guide: "Debug helper with ranked causes and engine-specific tips",
        generate_starter: "Feature-specific starter code with educational comments",
        phase_checklist: "Project phase tracker with engine/genre-aware checklists",
        asset_guide: "Asset pipeline guide for sprites, audio, tilemaps, fonts, particles",
      },
      modules: ["core", "monogame-arch", "godot-arch", "future premium modules"],
      description: "Pro ($5/mo) — all tools and modules fully unlocked",
    };
  }

  return {
    tools: {
      list_docs: "Full access",
      list_modules: "Full access (discover available engines)",
      search_docs: "Core module only",
      get_doc: "Core module only",
      session: "Locked (Pro)",
      genre_lookup: "Generic info only (Pro for full mappings)",
      license_info: "Available",
      random_doc: "Core module only",
      compare_engines: "Locked (Pro)",
      migration_guide: "Locked (Pro)",
      explain_concept: "Core docs only (Pro for all modules)",
      scaffold_project: "Full access",
      generate_gdd: "Full access",
      review_architecture: "Locked (Pro)",
      project_context: "Full access",
      memory: "Full access",
      diagnostics: "Full access",
      debug_guide: "Full access",
      generate_starter: "Full access",
      phase_checklist: "Full access",
      asset_guide: "Full access",
    },
    modules: ["core"],
    description: "Free tier — core docs only",
  };
}
