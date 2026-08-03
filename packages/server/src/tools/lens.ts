/**
 * lens — the game designer AI lens for programmers.
 *
 * One tool, one job: while a programmer builds, answer as the designer
 * looking over their shoulder. Given a described situation it returns the
 * matched industry-proven design philosophies — the questions a designer
 * would ask, red flags in code terms, and concrete prescriptions.
 *
 * Deliberately simple: two optional params, no action routing.
 *   { situation: "combat feels flat" }   → matched lenses, full content
 *   { lens: "game-feel" }                → one named lens, full content
 *   {}                                   → the lens catalog
 */

import { z } from "zod";
import { GameCodexToolDef, ToolResult } from "../tool-definition.js";
import { Lens, LENSES, findLens, matchLenses } from "../core/lenses.js";

function renderLens(lens: Lens): string {
  let out = `## ${lens.name}\n`;
  out += `*${lens.oneLiner}*\n\n`;
  out += `**Source:** ${lens.provenance}\n\n`;
  out += `${lens.philosophy}\n\n`;
  out += `**Ask yourself:**\n`;
  for (const q of lens.questions) out += `- ${q}\n`;
  out += `\n**Red flags:**\n`;
  for (const r of lens.redFlags) out += `- ${r}\n`;
  out += `\n**Do this:**\n`;
  for (const p of lens.prescriptions) out += `- ${p}\n`;
  out += `\n**Go deeper:**\n`;
  for (const f of lens.furtherReading) out += `- ${f}\n`;
  return out;
}

function renderCatalog(): string {
  let out = `# The Designer's Lenses\n\n`;
  out += `Industry-proven design philosophies, applied to whatever you're building. `;
  out += `Call \`lens\` with a \`situation\` ("my combat feels flat", "should I add crafting?") `;
  out += `to get the matching perspectives, or with \`lens: "<id>"\` for a specific one.\n\n`;
  out += `| Lens | One-liner | Best during |\n|------|-----------|-------------|\n`;
  for (const l of LENSES) {
    out += `| \`${l.id}\` | ${l.oneLiner} | ${l.phases.join(", ")} |\n`;
  }
  out += `\nWhen implementing any mechanic, feature, or system — or when something `;
  out += `"feels off" and you can't name why — describe it to this tool before writing more code.\n`;
  return out;
}

export const lensToolDef: GameCodexToolDef = {
  name: "lens",
  description:
    "The game designer looking over your shoulder. Use when: designing or implementing any game mechanic/feature/system, when gameplay \"feels off\" (floaty, flat, boring, confusing, too hard), when deciding what to build next or cut, or before a large build-out. Give `situation` (what you're building or struggling with, in plain words) to get the matching industry-proven design lenses — the questions to ask, red flags, and concrete fixes (MDA, Cerny Method, game feel, juice, flow/difficulty, onboarding, scope discipline, playtesting, and more). Give `lens` for a specific one by id. Give neither to list all lenses.",
  inputSchema: {
    situation: z.string().optional().describe(
      "What you're working on, deciding, or struggling with — plain language, e.g. \"jump feels floaty\", \"thinking of adding a crafting system\", \"players quit in level 2\""
    ),
    lens: z.string().optional().describe(
      "A specific lens id or name to apply, e.g. \"game-feel\", \"scope\", \"interesting-decisions\""
    ),
  },
  handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const situation = (args.situation as string | undefined)?.trim();
    const lensName = (args.lens as string | undefined)?.trim();

    // Named lens takes precedence; situation (if also given) adds related lenses
    if (lensName) {
      const named = findLens(lensName);
      if (!named) {
        const available = LENSES.map((l) => `\`${l.id}\``).join(", ");
        return {
          content: [{
            type: "text",
            text: `No lens named "${lensName}".\n\nAvailable lenses: ${available}\n\nTip: pass \`situation\` instead to let the matching pick lenses for you.`,
          }],
          isError: true,
        };
      }

      let text = renderLens(named);
      if (situation) {
        const related = matchLenses(situation, 3)
          .filter((m) => m.lens.id !== named.id)
          .slice(0, 2);
        if (related.length > 0) {
          text += `\n---\n\n**Also relevant to "${situation}":** `;
          text += related.map((m) => `\`${m.lens.id}\` (${m.lens.oneLiner})`).join(" · ");
          text += `\n`;
        }
      }
      return { content: [{ type: "text", text }] };
    }

    if (situation) {
      const matches = matchLenses(situation, 3);
      if (matches.length === 0) {
        return {
          content: [{
            type: "text",
            text:
              `No lens matched that description directly — try more concrete terms ` +
              `(what the player does, what feels wrong, what you're about to build).\n\n` +
              renderCatalog(),
          }],
        };
      }

      let text = `# Designer's view: "${situation}"\n\n`;
      text += matches.map((m) => renderLens(m.lens)).join("\n---\n\n");
      const rest = LENSES.filter((l) => !matches.some((m) => m.lens.id === l.id));
      text += `\n---\n\nOther lenses: ${rest.map((l) => `\`${l.id}\``).join(", ")}\n`;
      return { content: [{ type: "text", text }] };
    }

    return { content: [{ type: "text", text: renderCatalog() }] };
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  category: "learning",
  activityDescription: "Applying designer lenses",
};
