/**
 * lens — the game designer AI lens for programmers.
 *
 * One tool, one door. Given a described situation it returns the matched
 * industry-proven design philosophies — the questions a designer would ask,
 * red flags in code terms, and concrete prescriptions — plus the matching
 * docs from the knowledge base. The KB is fetchable through the same tool
 * via `doc` (+ optional `section`).
 *
 *   { situation: "combat feels flat" }      → matched lenses + matching docs
 *   { lens: "game-feel" }                   → one named lens, full content
 *   { doc: "E6" }                           → a knowledge base doc (TOC-gated)
 *   { doc: "E6", section: "Pacing" }        → just that section
 *   {}                                      → the lens catalog
 */

import { z } from "zod";
import { GameLensToolDef, ToolDependencies, ToolResult } from "../tool-definition.js";
import { Lens, LENSES, findLens, matchLenses } from "../core/lenses.js";

/** Docs larger than this return a table of contents instead of full text
 *  unless a `section` is requested — the biggest guides exceed 100KB. */
const FULL_DOC_LIMIT = 25_000;
const DOC_RESULTS = 5;

// ---- Rendering ----

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
  out += `to get the matching perspectives plus matching knowledge-base docs, `;
  out += `\`lens: "<id>"\` for a specific lens, or \`doc: "<id>"\` to read a doc.\n\n`;
  out += `| Lens | One-liner | Best during |\n|------|-----------|-------------|\n`;
  for (const l of LENSES) {
    out += `| \`${l.id}\` | ${l.oneLiner} | ${l.phases.join(", ")} |\n`;
  }
  out += `\nWhen implementing any mechanic, feature, or system — or when something `;
  out += `"feels off" and you can't name why — describe it to this tool before writing more code.\n`;
  return out;
}

/** Compact "from the knowledge base" block appended to situation replies */
function renderDocMatches(situation: string, deps: ToolDependencies): string {
  if (!deps.searchEngine || !deps.allDocs?.length) return "";

  const results = deps.searchEngine.search(situation, deps.allDocs, DOC_RESULTS);
  deps.analytics?.recordSearch({ resultCount: results.length });
  if (results.length === 0) return "";

  let out = `\n---\n\n**From the knowledge base:**\n\n`;
  for (const r of results) {
    const snippet = r.snippet.split("\n")[0].trim();
    out += `- \`${r.doc.id}\` — ${r.doc.title}${snippet ? ` — ${snippet}` : ""}\n`;
  }
  out += `\nRead any of these with \`lens { doc: "<id>" }\` (add \`section\` for one part).\n`;
  return out;
}

// ---- Doc fetching ----

function extractSection(content: string, section: string): string | null {
  const lines = content.split("\n");
  const target = section.trim().toLowerCase();
  let start = -1;
  let startLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (m && m[2].toLowerCase().includes(target)) {
      start = i;
      startLevel = m[1].length;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= startLevel) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

function tableOfContents(content: string): string[] {
  return content
    .split("\n")
    .filter((l) => /^#{2,3}\s+/.test(l))
    .map((l) => l.replace(/^#+\s+/, "").trim());
}

function fetchDoc(docId: string, section: string | undefined, deps: ToolDependencies): ToolResult {
  const needle = docId.trim();
  const doc =
    deps.docStore?.getDoc(needle) ??
    deps.allDocs?.find((d) => d.id.toLowerCase() === needle.toLowerCase());

  if (!doc) {
    return {
      content: [{
        type: "text",
        text:
          `No doc with id "${docId}" in the knowledge base.\n\n` +
          `Tip: describe what you need as \`situation\` — replies include matching ` +
          `doc ids from the knowledge base.`,
      }],
      isError: true,
    };
  }

  deps.analytics?.recordDocAccess({
    docId: doc.id,
    usedSection: !!section,
  });

  const header = `# ${doc.title} (\`${doc.id}\`)\n\n`;

  if (section) {
    const extracted = extractSection(doc.content, section);
    if (extracted === null) {
      const toc = tableOfContents(doc.content);
      return {
        content: [{
          type: "text",
          text:
            `No section matching "${section}" in ${doc.id}.\n\nSections:\n` +
            toc.map((t) => `- ${t}`).join("\n"),
        }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: header + extracted }] };
  }

  if (doc.content.length > FULL_DOC_LIMIT) {
    const toc = tableOfContents(doc.content);
    const lead = doc.content.slice(0, 2000);
    return {
      content: [{
        type: "text",
        text:
          header +
          `*This doc is ${Math.round(doc.content.length / 1024)}KB — showing its ` +
          `table of contents. Pass \`section: "<heading>"\` for the part you need.*\n\n` +
          `**Sections:**\n` +
          toc.map((t) => `- ${t}`).join("\n") +
          `\n\n---\n\n${lead}\n\n*…truncated — request a section.*`,
      }],
    };
  }

  return { content: [{ type: "text", text: header + doc.content }] };
}

// ---- The tool ----

export const lensToolDef: GameLensToolDef = {
  name: "lens",
  description:
    "The game designer looking over your shoulder. Use when: designing or implementing any game mechanic/feature/system, when gameplay \"feels off\" (floaty, flat, boring, confusing, too hard), or when deciding what to build next or cut. Give `situation` (what you're building or struggling with, in plain words) to get the matching industry-proven design lenses — designer questions, red flags, concrete fixes (MDA, Cerny Method, game feel, juice, flow/difficulty, onboarding, scope discipline, and more) — plus matching docs from the design knowledge base. Give `lens` for a specific lens by id. Give `doc` (+ optional `section`) to read a knowledge-base doc. Give nothing to list all lenses.",
  inputSchema: {
    situation: z.string().optional().describe(
      "What you're working on, deciding, or struggling with — plain language, e.g. \"jump feels floaty\", \"thinking of adding a crafting system\", \"players quit at the first boss\""
    ),
    lens: z.string().optional().describe(
      "A specific lens id or name to apply, e.g. \"game-feel\", \"scope\", \"interesting-decisions\""
    ),
    doc: z.string().optional().describe(
      "A knowledge-base doc id to read, e.g. \"E6\" — ids appear in situation replies. Large docs return a table of contents unless `section` is given"
    ),
    section: z.string().optional().describe(
      "With `doc`: extract one section by (partial) heading text, e.g. \"Knockback\""
    ),
  },
  handler: async (args: Record<string, unknown>, deps: ToolDependencies): Promise<ToolResult> => {
    const situation = (args.situation as string | undefined)?.trim();
    const lensName = (args.lens as string | undefined)?.trim();
    const docId = (args.doc as string | undefined)?.trim();
    const section = (args.section as string | undefined)?.trim();

    // Doc fetch is the most specific request — it wins
    if (docId) {
      return fetchDoc(docId, section, deps);
    }

    // Named lens next; situation (if also given) adds related lenses + docs
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
        text += renderDocMatches(situation, deps);
      }
      return { content: [{ type: "text", text }] };
    }

    if (situation) {
      const matches = matchLenses(situation, 3);
      const docsBlock = renderDocMatches(situation, deps);

      if (matches.length === 0 && !docsBlock) {
        return {
          content: [{
            type: "text",
            text:
              `No lens or doc matched that description directly — try more concrete terms ` +
              `(what the player does, what feels wrong, what you're about to build).\n\n` +
              renderCatalog(),
          }],
        };
      }

      let text = `# Designer's view: "${situation}"\n\n`;
      if (matches.length > 0) {
        text += matches.map((m) => renderLens(m.lens)).join("\n---\n\n");
        const rest = LENSES.filter((l) => !matches.some((m) => m.lens.id === l.id));
        text += `\n---\n\nOther lenses: ${rest.map((l) => `\`${l.id}\``).join(", ")}\n`;
      } else {
        text += `No design lens matched directly — but the knowledge base did:\n`;
      }
      text += docsBlock;
      return { content: [{ type: "text", text }] };
    }

    return { content: [{ type: "text", text: renderCatalog() }] };
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  category: "learning",
  activityDescription: "Applying designer lenses",
};
