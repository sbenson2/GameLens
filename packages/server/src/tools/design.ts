/**
 * design — Plan + Ship. Everything about designing and launching your game.
 *
 * Consolidates: GDD generation, phase checklists, scope analysis,
 * marketing/launch guidance, and architecture pattern advice.
 */

import { z } from "zod";
import { GameCodexToolDef, ToolResult, ToolDependencies } from "../tool-definition.js";
import { miss, unknownAction } from "../core/error-helpers.js";
import { getToolHelp } from "../core/help-generator.js";
import { handleGenerateGDD } from "./generate-gdd.js";
import { handlePhaseChecklist } from "./phase-checklist.js";
import { ProjectStore } from "../core/project-store.js";
import { HealthTracker } from "../core/health-tracker.js";
import { PersonalityEngine, ProjectSnapshot } from "../core/personality.js";

function toSnapshot(data: any): ProjectSnapshot {
  return {
    name: data.name, engine: data.engine, genre: data.genre,
    skillLevel: data.skillLevel, phase: data.phase,
    goalCount: data.goals.filter((g: any) => !g.completed).length,
    decisionCount: data.decisions.length, featureCount: data.featureCount,
  };
}

export const designToolDef: GameCodexToolDef = {
  name: "design",
  description: "Use when: creating a GDD, planning phases, evaluating scope, preparing to launch or market a game, choosing architecture patterns. Plan and ship your game. Actions: gdd, phase, scope_check, launch, store_page, pricing, marketing, trailer, patterns.",
  inputSchema: {
    action: z.enum([
      "help", "gdd", "phase", "scope_check",
      "launch", "store_page", "pricing", "marketing", "trailer",
      "patterns",
    ]).describe(
      "gdd: create a Game Design Document (use when user describes their game idea) | phase: get checklist for current dev phase | scope_check: evaluate if a feature fits | launch: pre-launch checklist | store_page: store page writing guide | pricing: pricing strategy | marketing: marketing timeline | trailer: trailer creation guide | patterns: architecture pattern advice (ECS, state machines, etc.)"
    ),
    project: z.string().optional().describe("Project name"),
    // GDD
    description: z.string().optional().describe("Game description (for gdd)"),
    genre: z.string().optional().describe("Game genre"),
    engine: z.string().optional().describe("Target engine"),
    scope: z.enum(["jam", "demo", "small", "full"]).optional().describe("Project scope"),
    // Phase
    phase: z.string().optional().describe("Phase: planning/prototype/production/polish/release"),
    completedItems: z.array(z.string()).optional().describe("Completed checklist items"),
    // Scope check
    feature: z.string().optional().describe("Feature to evaluate"),
    // Launch
    platform: z.string().optional().describe("Platform: steam, itch, google-play, app-store"),
    gameDescription: z.string().optional().describe("Brief game description (for store_page)"),
    // Patterns
    topic: z.string().optional().describe("Architecture topic: ECS, state machine, save system, etc."),
  },
  handler: async (args: Record<string, unknown>, deps: ToolDependencies): Promise<ToolResult> => {
    const store = deps.projectStore as ProjectStore;
    const healthTracker = deps.healthTracker as HealthTracker;
    const personality = deps.personality as PersonalityEngine;
    const action = args.action as string;
    const projectName = (args.project as string)?.trim() || "default";

    switch (action) {
      case "help":
        return getToolHelp("design");

      // ---- Planning ----

      case "gdd": {
        if (!args.description) return miss("description", "design", "gdd");
        const gddResult = handleGenerateGDD({
          description: args.description as string,
          genre: args.genre as string | undefined,
          engine: args.engine as string | undefined,
          scope: args.scope as string | undefined,
        });

        // Save to project
        const gddText = gddResult.content[0].text;
        store.writeMemory(projectName, "GDD", gddText);
        const updates: any = {};
        if (args.engine) updates.engine = args.engine;
        if (args.genre) updates.genre = args.genre;
        if (Object.keys(updates).length > 0) store.set(projectName, updates);
        store.addDecision(projectName, `Created GDD: "${args.description}"`);

        const data = store.get(projectName);
        const flavor = personality.getFlavor(data.genre);
        return { content: [{ type: "text", text: `> _${flavor}_\n\n${gddText}\n\n---\n_GDD saved to project "${projectName}"._` }] };
      }

      case "phase": {
        const data = store.get(projectName);
        const result = handlePhaseChecklist({
          phase: (args.phase as string) || data.phase,
          engine: (args.engine as string) || (data.engine !== "not set" ? data.engine : undefined),
          genre: (args.genre as string) || (data.genre !== "not set" ? data.genre : undefined),
          completedItems: args.completedItems as string[] | undefined,
        });
        const snapshot = toSnapshot(data);
        return { content: [{ type: "text", text: `${result.content[0].text}\n\n---\n${personality.getSuggestion(snapshot)}` }] };
      }

      case "scope_check": {
        if (!args.feature) return miss("feature", "design", "scope_check");
        const data = store.get(projectName);
        return { content: [{ type: "text", text: healthTracker.evaluateFeature(data, args.feature as string) }] };
      }

      // ---- Launch / Marketing ----

      case "launch": {
        const platform = ((args.platform as string) ?? "itch").toLowerCase();
        return { content: [{ type: "text", text: buildChecklist(platform, args.engine as string | undefined) }] };
      }

      case "store_page": {
        const platform = ((args.platform as string) ?? "itch").toLowerCase();
        return { content: [{ type: "text", text: buildStorePageGuide(platform, args.genre as string | undefined, args.gameDescription as string | undefined) }] };
      }

      case "pricing": {
        const platform = ((args.platform as string) ?? "itch").toLowerCase();
        return { content: [{ type: "text", text: buildPricingGuide(platform) }] };
      }

      case "marketing": {
        const platform = ((args.platform as string) ?? "itch").toLowerCase();
        return { content: [{ type: "text", text: buildMarketingTimeline(platform) }] };
      }

      case "trailer": {
        return { content: [{ type: "text", text: buildTrailerGuide(args.genre as string | undefined) }] };
      }

      // ---- Architecture patterns ----

      case "patterns": {
        if (!args.topic) return miss("topic", "design", "patterns");
        const topic = args.topic as string;

        const searchResults = deps.searchEngine.search(topic, deps.docStore.getAllDocs(), 10);
        let relevantDocs = searchResults;
        if (args.engine) {
          const el = (args.engine as string).toLowerCase();
          relevantDocs = searchResults.filter((r: any) =>
            r.doc.module === "core" || r.doc.module.toLowerCase().includes(el) || r.doc.content.toLowerCase().includes(el)
          );
        }

        let output = `# Architecture Patterns: ${topic}\n\n`;
        if (args.engine) output += `**Engine:** ${args.engine}\n\n`;

        if (relevantDocs.length === 0) {
          output += getGeneralPatternAdvice(topic);
        } else {
          output += `## Relevant Docs\n\n`;
          for (const result of relevantDocs.slice(0, 5)) {
            output += `### ${result.doc.title} (\`${result.doc.id}\`)\n\n`;
            const preview = result.doc.content.split("\n").filter((l: string) => l.trim() && !l.startsWith("#") && !l.startsWith("---")).slice(0, 3).join("\n");
            output += `${preview}\n\n`;
          }
          output += `_Use \`docs\` with action \`get\` for full content._\n`;
        }
        return { content: [{ type: "text", text: output }] };
      }

      default:
        return unknownAction(action, [
          "help", "gdd", "phase", "scope_check", "launch", "store_page",
          "pricing", "marketing", "trailer", "patterns",
        ], "design");
    }
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  category: "generation",
  activityDescription: "Designing",
};


// ---- Launch helpers (from launch.ts) ----

function buildChecklist(platform: string, engine?: string): string {
  let o = `# Pre-Launch Checklist (${platform})\n\n`;
  o += `## Build\n\n- [ ] Final build exported\n- [ ] Tested on clean machine\n- [ ] No debug features left\n- [ ] Version number set\n`;
  if (engine) {
    const e = engine.toLowerCase();
    if (e.includes("monogame")) o += `- [ ] dotnet publish Release\n- [ ] Self-contained tested\n`;
    else if (e.includes("godot")) o += `- [ ] Export templates installed\n- [ ] PCK verified\n`;
    else if (e.includes("phaser")) o += `- [ ] Production build\n- [ ] Bundle size checked\n- [ ] Browser tested\n`;
  }
  o += `\n## Store\n\n- [ ] Store page live\n- [ ] Description finalized\n- [ ] 4+ screenshots\n- [ ] Trailer uploaded\n- [ ] Tags set\n`;
  if (platform === "steam") o += `- [ ] Store review submitted (2-5 days)\n- [ ] Wishlist campaign 2+ weeks\n`;
  else if (platform === "itch") o += `- [ ] Cover image (630x500)\n- [ ] Files tagged by platform\n`;
  o += `\n## Legal\n\n- [ ] Credits with attributions\n- [ ] Asset licenses checked\n- [ ] Price decided\n`;
  o += `\n## Marketing\n\n- [ ] Launch announcement drafted\n- [ ] Social posts scheduled\n- [ ] Devlog planned\n- [ ] Press kit ready\n`;
  return o;
}

function buildStorePageGuide(platform: string, genre?: string, description?: string): string {
  let o = `# Store Page Guide (${platform})\n\n`;
  o += `## The Formula\n\nAnswer in 5 seconds:\n1. **What is this?** (genre + hook)\n2. **What do I do?** (core mechanic)\n3. **Why care?** (emotional hook)\n\n`;
  o += `## Short Description (< 300 chars)\n\n**Formula:** [Emotion] + [Genre] + [Unique mechanic]\n\n`;
  o += `**Examples:**\n- "A hand-drawn metroidvania where every death reshapes the world"\n- "Build, manage, and defend your colony — one turn at a time"\n\n`;
  if (description) o += `**Your game:** "${description}"\n\n`;
  o += `## Long Description\n\n1. **Hook** (2-3 sentences)\n2. **What you do** (3-4 sentences)\n3. **Features** (5-7 bullets, strong verbs)\n4. **Call to action**\n\n`;
  o += `## Screenshots\n\n- Minimum 4, aim for 6-8\n- Show gameplay, not menus\n- First screenshot = most compelling moment\n`;
  return o;
}

function buildPricingGuide(platform: string): string {
  let o = `# Pricing Strategy\n\n`;
  o += `- **Free:** Jams, portfolio\n- **$1-5:** Short games, itch.io\n- **$5-15:** Polished indie (1-5 hrs)\n- **$15-25:** Full-featured (5-20 hrs)\n\n`;
  if (platform === "steam") o += `Steam takes 30%. Launch discount 10-20%. $9.99 indie sweet spot.\n\n`;
  else if (platform === "itch") o += `itch takes 0% default. "Pay what you want" works well.\n\n`;
  o += `**Reality:** Most indie games make <$5k. Your first game is a learning experience.\n`;
  return o;
}

function buildMarketingTimeline(platform: string): string {
  let o = `# Marketing Timeline\n\nMost solo devs start **way too late**.\n\n`;
  o += `## 6+ Months Before\n- [ ] Social media accounts\n- [ ] Weekly devlogs\n- [ ] Share GIFs\n\n`;
  o += `## 3-6 Months\n`;
  if (platform === "steam") o += `- [ ] **Create Steam store page** (wishlists start NOW)\n- [ ] Target 2,000+ wishlists\n`;
  o += `- [ ] First trailer\n- [ ] Submit to festivals\n- [ ] Post in subreddits\n\n`;
  o += `## 1-3 Months\n- [ ] Final trailer\n- [ ] Press kit\n- [ ] Press emails\n- [ ] Discord community\n\n`;
  o += `## Launch Week\n- [ ] Launch announcement\n- [ ] Respond to ALL comments 48hrs\n- [ ] Post devlog/postmortem\n- [ ] 10 reviews = Steam "Recent Reviews"\n\n`;
  o += `## #1 Rule\n**Ship it.** A released game > a perfect unreleased one.\n`;
  return o;
}

function buildTrailerGuide(genre?: string): string {
  let o = `# Trailer Guide (60-90 seconds)\n\n`;
  o += `## Structure\n\n`;
  o += `- **0-5s:** Hook (most impressive moment)\n- **5-20s:** Core gameplay\n- **20-50s:** Variety + depth\n- **50-70s:** Climax\n- **70-90s:** Title + CTA\n\n`;
  o += `## Tips\n\n- OBS Studio for recording\n- 60fps, 1080p minimum\n- No narration needed\n- Don't start with logo\n- 90s max (60 better)\n\n`;
  if (genre) {
    const l = genre.toLowerCase();
    o += `## ${genre} Note\n\n`;
    if (l.includes("platformer") || l.includes("action")) o += `Lead with fluid movement.\n`;
    else if (l.includes("rpg")) o += `Lead with atmosphere and story.\n`;
    else if (l.includes("horror")) o += `Atmosphere first. Don't show the monster.\n`;
    else if (l.includes("roguelike")) o += `Show variety — different runs, items, outcomes.\n`;
    else o += `Lead with what makes your game unique.\n`;
  }
  o += `\n## Tools\n- OBS Studio (recording)\n- DaVinci Resolve (editing, free)\n- Incompetech (royalty-free music)\n`;
  return o;
}

function getGeneralPatternAdvice(topic: string): string {
  const l = topic.toLowerCase();
  if (l.includes("ecs") || l.includes("entity component")) {
    return "**ECS** separates data (components) from logic (systems).\n\n**When to use:** Many similar entities, complex interactions.\n**When NOT:** <50 entities — use OOP.\n\n**Principle:** Components = pure data. Systems iterate. Entities = IDs.\n";
  }
  if (l.includes("state machine") || l.includes("fsm")) {
    return "**State machines** manage distinct states with clear transitions.\n\n**When to use:** Player controllers, AI, game flow.\nStart with switch statement, upgrade to classes at >5 states.\n";
  }
  if (l.includes("save") || l.includes("load")) {
    return "**Save systems** serialize game state to disk.\n\n**Key rule:** Separate save format from runtime objects (use DTOs).\n**Always** include version number in save files.\n";
  }
  return `No specific patterns for "${topic}". Try \`docs\` with action \`search\`.\n`;
}
