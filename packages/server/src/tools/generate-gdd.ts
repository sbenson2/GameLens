type ToolResult = { content: Array<{ type: "text"; text: string }> };

/**
 * generate_gdd — Create a game design document from a description.
 *
 * Returns a structured GDD template populated with the user's input.
 * Sections follow the P9 GDD Template from the knowledge base.
 */
export function handleGenerateGDD(args: {
  description: string;
  genre?: string;
  engine?: string;
  scope?: string;
}): ToolResult {
  const desc = args.description.trim();
  if (!desc) {
    return { content: [{ type: "text", text: "Please provide a game description." }] };
  }

  const scope = validateScope(args.scope);

  let output = `# Game Design Document\n\n`;
  output += `> Generated from: "${desc}"\n\n`;
  output += `---\n\n`;

  // Section 1: Vision
  output += `## 1. Vision\n\n`;
  output += `**Concept:** ${desc}\n\n`;
  if (args.genre) {
    output += `**Genre:** ${args.genre}\n`;
  }
  if (args.engine) {
    output += `**Target Engine:** ${args.engine}\n`;
  }
  output += `**Scope:** ${scope}\n\n`;
  output += `**Elevator Pitch:** _[One sentence that sells the game. Fill this in.]_\n\n`;
  output += `**Core Fantasy:** _[What does the player get to BE or DO that they can't in real life?]_\n\n`;
  output += `**Design Pillars** (pick 3, they guide every decision):\n`;
  output += `1. _[Pillar 1 — e.g. "Tight, responsive combat"]_\n`;
  output += `2. _[Pillar 2 — e.g. "Meaningful exploration"]_\n`;
  output += `3. _[Pillar 3 — e.g. "Every run feels different"]_\n\n`;

  // Section 2: Core Mechanics
  output += `## 2. Core Mechanics\n\n`;
  output += `### Core Loop\n\n`;
  output += `_The 30-second loop the player repeats most:_\n\n`;
  output += `\`\`\`\n[Action] → [Reward/Feedback] → [Decision] → [Action]\n\`\`\`\n\n`;
  output += `### Player Verbs\n\n`;
  output += `_What can the player DO? List 5-8 core actions:_\n\n`;
  output += `1. _[e.g. Move, Jump, Attack, Dash, Interact]_\n\n`;
  output += `### Systems\n\n`;
  output += `| System | Description | Priority |\n`;
  output += `|--------|-------------|----------|\n`;
  output += `| Movement | _How the player moves_ | P0 |\n`;
  output += `| Combat/Interaction | _Core engagement mechanic_ | P0 |\n`;
  output += `| Progression | _How the player gets stronger/advances_ | P1 |\n`;
  output += `| UI/HUD | _What info is always visible_ | P1 |\n`;
  output += `| Audio | _Music and SFX approach_ | P2 |\n\n`;

  if (args.genre) {
    output += `_Use \`genre_lookup("${args.genre}")\` for genre-specific system recommendations._\n\n`;
  }

  // Section 3: Content
  output += `## 3. Content\n\n`;
  output += `### Scope Target (${scope})\n\n`;

  switch (scope) {
    case "jam":
      output += `- **Duration:** 1-3 days\n`;
      output += `- **Content:** 1 level/area, 1-2 mechanics, placeholder art OK\n`;
      output += `- **Goal:** Playable prototype that proves the core loop is fun\n`;
      break;
    case "demo":
      output += `- **Duration:** 2-4 weeks\n`;
      output += `- **Content:** 3-5 levels/areas, core mechanics polished, basic UI\n`;
      output += `- **Goal:** Vertical slice showing 15-30 minutes of polished gameplay\n`;
      break;
    case "small":
      output += `- **Duration:** 2-4 months\n`;
      output += `- **Content:** Full game, 1-2 hours of content, polished\n`;
      output += `- **Goal:** Shippable product on itch.io or similar\n`;
      break;
    case "full":
      output += `- **Duration:** 6-12+ months\n`;
      output += `- **Content:** Full game, 5+ hours, multiple systems, polished\n`;
      output += `- **Goal:** Steam release with store page, trailer, marketing\n`;
      break;
  }
  output += `\n`;

  output += `### Levels / Areas\n\n`;
  output += `| # | Name | Theme | Mechanics Introduced | Status |\n`;
  output += `|---|------|-------|---------------------|--------|\n`;
  output += `| 1 | _[Name]_ | _[Visual theme]_ | _[Core movement]_ | Not started |\n`;
  output += `| 2 | _[Name]_ | _[Theme]_ | _[New mechanic]_ | Not started |\n\n`;

  // Section 4: Art & Audio
  output += `## 4. Art & Audio\n\n`;
  output += `**Art Style:** _[Pixel art / hand-drawn / vector / 3D low-poly / etc.]_\n\n`;
  output += `**Resolution:** _[e.g. 320x180 scaled 4x, 1920x1080 native]_\n\n`;
  output += `**Color Palette:** _[Describe or link palette]_\n\n`;
  output += `**Audio Approach:** _[Chiptune / orchestral / ambient / silence-focused]_\n\n`;
  output += `_See docs P5 (Art Pipeline) and P6 (Audio Pipeline) for production workflow._\n\n`;

  // Section 5: Technical
  output += `## 5. Technical\n\n`;
  if (args.engine) {
    output += `**Engine:** ${args.engine}\n`;
  }
  output += `**Target Platform(s):** _[PC / Web / Mobile / Console]_\n\n`;
  output += `**Target FPS:** 60\n\n`;
  output += `**Key Technical Decisions:**\n\n`;
  output += `- _[e.g. "ECS for all entities" or "Scene-based architecture"]_\n`;
  output += `- _[e.g. "Tilemap for levels" or "Procedural generation"]_\n`;
  output += `- _[e.g. "No networking in v1"]_\n\n`;

  // Section 6: Milestones
  output += `## 6. Milestones\n\n`;
  output += `| Milestone | Definition of Done | Target Date |\n`;
  output += `|-----------|-------------------|-------------|\n`;
  output += `| Prototype | Core loop playable, programmer art | _[Date]_ |\n`;
  output += `| Vertical Slice | 1 level fully polished, final art | _[Date]_ |\n`;
  output += `| Alpha | All content in, all systems working | _[Date]_ |\n`;
  output += `| Beta | Feature-complete, bug fixing only | _[Date]_ |\n`;
  output += `| Release | Shipped! | _[Date]_ |\n\n`;
  output += `_See docs P2 (Production Milestones) for detailed milestone definitions._\n\n`;

  // Section 7: Risks
  output += `## 7. Risks & Scope Cuts\n\n`;
  output += `**If running behind, cut in this order:**\n\n`;
  output += `1. _[Lowest priority feature]_\n`;
  output += `2. _[Next lowest]_\n`;
  output += `3. _[Nice-to-have content]_\n\n`;
  output += `**Never cut:**\n\n`;
  output += `- _[Core loop must ship]_\n`;
  output += `- _[Must have basic UI/UX]_\n\n`;

  output += `---\n\n`;
  output += `_This GDD is a living document. Update it as decisions change. See docs P9 (GDD Template) for the full template with additional sections._\n`;

  return { content: [{ type: "text", text: output }] };
}

function validateScope(scope?: string): "jam" | "demo" | "small" | "full" {
  if (scope === "jam" || scope === "demo" || scope === "small" || scope === "full") {
    return scope;
  }
  return "small"; // default
}
