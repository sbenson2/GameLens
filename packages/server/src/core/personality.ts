/**
 * Personality engine — guidance-first tone system for GameCodex.
 *
 * Maps genre, phase, and skill level to actionable guidance with
 * genre-flavored personality on top. Guidance leads, flavor follows.
 *
 * The MCP server can't control the AI's system prompt, but it CAN return
 * guidance-rich text that the AI weaves into its responses.
 */

// ---- Types ----

export interface ToneProfile {
  style: "encouraging" | "efficient" | "mentor" | "peer";
  flavor: string;       // genre-themed one-liner
  emphasis: string;      // phase-specific focus
  verbosity: "detailed" | "concise";
}

export interface ProjectSnapshot {
  name: string;
  engine: string;
  genre: string;
  skillLevel: "beginner" | "intermediate" | "advanced";
  phase: "planning" | "prototype" | "production" | "polish" | "release";
  goalCount: number;
  decisionCount: number;
  featureCount: number;
}

// ---- Genre tone map ----

const GENRE_TONES: Record<string, { style: ToneProfile["style"]; flavors: string[] }> = {
  horror: {
    style: "efficient",
    flavors: [
      "Some things should stay dead — like that null reference.",
      "The scariest bug is the one that only happens in production.",
      "Every good horror game knows: less is more. Same goes for your code.",
    ],
  },
  survival: {
    style: "efficient",
    flavors: [
      "Survive the code. Ship the game.",
      "Resource management applies to your dev time too.",
      "Every system you add is another thing that can break in the wild.",
    ],
  },
  platformer: {
    style: "encouraging",
    flavors: [
      "One jump at a time. You've got this.",
      "The best platformers are built on tight loops — code and gameplay.",
      "Coyote time isn't just for players. Give yourself grace too.",
    ],
  },
  roguelike: {
    style: "peer",
    flavors: [
      "Every failed run teaches something. Same with failed builds.",
      "Procedural generation: where the bugs are also randomly generated.",
      "The RNG gods favor those who ship.",
    ],
  },
  rpg: {
    style: "mentor",
    flavors: [
      "Chapter 1: The Architecture. Every hero needs a foundation.",
      "Your quest log is long. Let's prioritize the main storyline.",
      "Even the best RPGs start with a single NPC that says hello.",
    ],
  },
  puzzle: {
    style: "efficient",
    flavors: [
      "Clean logic, clean code. The puzzle solves itself.",
      "State spaces are finite. So is your dev time.",
      "The elegance is in what you leave out.",
    ],
  },
  "tower defense": {
    style: "peer",
    flavors: [
      "Build your defenses — against scope creep.",
      "Wave 1: Get it running. Wave 2: Get it right.",
      "Place your systems carefully. Refactoring is expensive.",
    ],
  },
  farming: {
    style: "encouraging",
    flavors: [
      "Plant the seed. Water it daily. The game will grow.",
      "Your save system is coming along beautifully!",
      "Seasons change. So do requirements. That's OK.",
    ],
  },
  "visual novel": {
    style: "mentor",
    flavors: [
      "Every branch is a promise to the player. Ship the ones that matter.",
      "The best stories are told one scene at a time.",
      "Dialogue trees: where your if/else statements become art.",
    ],
  },
  action: {
    style: "peer",
    flavors: [
      "Lock and load — let's optimize that collision broadphase.",
      "Frame-perfect code for frame-perfect gameplay.",
      "Ship fast, hit hard, iterate.",
    ],
  },
  shooter: {
    style: "peer",
    flavors: [
      "Aim for 60fps. Everything else is secondary.",
      "Bullet hell? More like bug hell if you skip the object pool.",
      "Fire rate matters — in your game and your commit frequency.",
    ],
  },
  strategy: {
    style: "mentor",
    flavors: [
      "Think three moves ahead. What does your architecture look like at 100 units?",
      "The best strategy is the one you can actually implement.",
      "Turn-based dev: plan, code, test. Repeat.",
    ],
  },
  "deck-builder": {
    style: "peer",
    flavors: [
      "Shuffle the deck. Draw a feature. Play it.",
      "Card balance is just math with vibes.",
      "Every card game is a state machine in disguise.",
    ],
  },
};

const DEFAULT_TONE = {
  style: "mentor" as const,
  flavors: [
    "Let's build something great.",
    "Good games are built one system at a time.",
    "Ship it. Then make it better.",
  ],
};

// ---- Phase emphasis ----

const PHASE_EMPHASIS: Record<string, string> = {
  planning: "Focus on clarity. What are you building and why? Keep scope tight.",
  prototype: "Speed over polish. Get the core loop running. Ugly is fine.",
  production: "Build systematically. Connect systems. Replace placeholders.",
  polish: "Details matter now. Juice, bugs, performance. Make it feel good.",
  release: "Ship it. The game exists when players can play it.",
};

// ---- Personality Engine ----

export class PersonalityEngine {
  /** Get a genre-flavored one-liner */
  getFlavor(genre: string): string {
    const normalized = genre.toLowerCase().replace(/[-_]/g, " ");
    const tone = GENRE_TONES[normalized] ?? DEFAULT_TONE;
    return tone.flavors[Math.floor(Math.random() * tone.flavors.length)];
  }

  /** Get full tone profile for a project */
  getTone(snapshot: ProjectSnapshot): ToneProfile {
    const normalized = snapshot.genre.toLowerCase().replace(/[-_]/g, " ");
    const genreTone = GENRE_TONES[normalized] ?? DEFAULT_TONE;

    return {
      style: genreTone.style,
      flavor: genreTone.flavors[Math.floor(Math.random() * genreTone.flavors.length)],
      emphasis: PHASE_EMPHASIS[snapshot.phase] ?? PHASE_EMPHASIS.planning,
      verbosity: snapshot.skillLevel === "beginner" ? "detailed" : "concise",
    };
  }

  /** Get a greeting for returning users — leads with guidance */
  getGreeting(snapshot: ProjectSnapshot): string {
    const tone = this.getTone(snapshot);
    const phase = snapshot.phase.charAt(0).toUpperCase() + snapshot.phase.slice(1);

    let greeting = `Welcome back to **${snapshot.name}**.\n\n`;
    greeting += `**Phase:** ${phase} | **Engine:** ${snapshot.engine} | **Genre:** ${snapshot.genre}\n\n`;

    // Lead with actionable guidance
    greeting += `**${tone.emphasis}**\n\n`;

    if (snapshot.goalCount > 0) {
      greeting += `You have **${snapshot.goalCount} active goal${snapshot.goalCount === 1 ? "" : "s"}**. Tell me what you want to work on, or ask me what to tackle next.\n\n`;
    } else {
      greeting += `No active goals yet. Tell me what you're working on and I'll help you get started.\n\n`;
    }

    if (snapshot.decisionCount === 0 && snapshot.phase !== "planning") {
      greeting += `_Tip: As you make design decisions, tell me and I'll log them for future reference._\n\n`;
    }

    // Flavor as a closer, not the opener
    greeting += `> _${tone.flavor}_\n`;

    return greeting;
  }

  /** Get a first-time greeting */
  getOnboarding(): string {
    return [
      "# Welcome to GameCodex\n",
      "I'm your game dev co-pilot. Just tell me about your game and what you need help with — I'll take it from there.\n",
      "Some things I can help with:",
      "- **Plan** — scope, GDD, design pillars, what to build next",
      "- **Build** — code generation, architecture patterns, asset pipelines",
      "- **Debug** — error diagnosis with knowledge-base-backed solutions",
      "- **Ship** — launch checklists, store pages, marketing, pricing",
      "- **Learn** — 150+ game dev guides across engines and topics\n",
      "To get started, just describe your game — engine, genre, and what phase you're in. Or jump straight to what you need.\n",
      "_Optional shortcuts: your AI tool may offer `/start-project`, `/debug-error`, `/ship-game`, or `/session` as workflow starters._",
    ].join("\n");
  }

  /** Wrap a tool response with personality context */
  wrapResponse(content: string, snapshot: ProjectSnapshot | null): string {
    if (!snapshot || snapshot.genre === "not set") {
      return content;
    }

    const tone = this.getTone(snapshot);
    // Prepend phase emphasis as a subtle context note
    return `_[${snapshot.name} — ${snapshot.phase}]_\n\n${content}`;
  }

  /** Get a scope warning if features are growing */
  getScopeWarning(snapshot: ProjectSnapshot): string | null {
    if (snapshot.phase === "planning" || snapshot.phase === "release") return null;

    if (snapshot.featureCount > 15) {
      return `**Scope warning:** ${snapshot.featureCount} features tracked. That's a heavy scope. Consider cutting the lowest-priority items before adding more.`;
    }
    if (snapshot.featureCount > 10 && snapshot.phase === "prototype") {
      return `**Scope check:** ${snapshot.featureCount} features in prototype phase. The prototype should prove ONE core mechanic. Are all of these essential?`;
    }
    return null;
  }

  /** Get a milestone celebration message with forward-looking guidance */
  getMilestoneMessage(milestone: string, snapshot: ProjectSnapshot): string {
    const tone = this.getTone(snapshot);
    const celebrations: Record<ToneProfile["style"], string[]> = {
      encouraging: ["Amazing work!", "You should be proud of this.", "This is real progress."],
      efficient: ["Done. Next.", "Milestone hit. Moving on.", "Checked off. What's next?"],
      mentor: ["Well done. This is a significant step.", "Excellent progress. Let's build on this.", "You've earned this."],
      peer: ["Nice! Ship it.", "Solid. What's next on the list?", "That's a W. Keep going."],
    };

    const msgs = celebrations[tone.style];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];

    let output = `## Milestone: ${milestone}\n\n${msg}\n\n`;

    // Forward-looking guidance based on phase
    if (snapshot.goalCount > 1) {
      output += `**${snapshot.goalCount - 1} goals remaining.** Use \`project suggest\` to pick the next one.\n`;
    } else if (snapshot.goalCount <= 1) {
      output += `**Consider:** Is this a good time to check \`project health\` or set new goals for the next push?\n`;
    }

    return output;
  }

  /** Suggest what to work on next based on phase and project state */
  getSuggestion(snapshot: ProjectSnapshot): string {
    // Context-aware suggestions based on actual project state
    const contextual: string[] = [];

    if (snapshot.goalCount === 0 && snapshot.phase !== "release") {
      contextual.push("Set goals for this phase — even 2-3 small ones give you direction. Use `project goal`.");
    }
    if (snapshot.decisionCount === 0 && snapshot.phase !== "planning") {
      contextual.push("Start logging design decisions with `project decide`. It makes future trade-offs easier.");
    }
    if (snapshot.featureCount > 10 && snapshot.phase === "prototype") {
      contextual.push("Your feature count is high for prototype. Run `project health` to check scope.");
    }

    const suggestions: Record<string, string[]> = {
      planning: [
        "Write your elevator pitch — one sentence that sells the game.",
        "Identify your core mechanic. What's the ONE thing that must be fun?",
        "Set your scope: jam, demo, small, or full release?",
        "Use `design gdd` to create your Game Design Document.",
        "Define 3-5 design pillars — every feature decision filters through these.",
        "Use `project session` with 'plan' to run a structured planning workflow.",
      ],
      prototype: [
        "Get the core loop playable with placeholder art.",
        "Test with someone else — even 30 seconds of feedback helps.",
        "Don't build features that aren't the core mechanic yet.",
        "Use `build debug` if you're stuck on a technical problem.",
        "Set a time limit: if the core loop isn't fun in 2 weeks, rethink the mechanic.",
        "Use `docs search` to find patterns for what you're building.",
      ],
      production: [
        "Replace placeholder art with real assets.",
        "Connect your systems: UI, save/load, menus.",
        "Playtest weekly — don't save it for the end.",
        "Use `build review` to check your architecture for anti-patterns.",
        "Log every design decision — production is where trade-offs compound.",
        "Use `design phase` to check your production checklist progress.",
      ],
      polish: [
        "Add juice: screen shake, particles, sound effects.",
        "Profile performance on your lowest-spec target.",
        "Get 3+ external testers to play through the whole game.",
        "Fix bugs, but triage — not every bug needs fixing before launch.",
        "Check accessibility: colorblind modes, rebindable controls, subtitle options.",
        "Run `project health` — adding features now is scope creep, not polish.",
      ],
      release: [
        "Create your store page / landing page.",
        "Capture screenshots and record a trailer.",
        "Use `design launch` for marketing and store page guidance.",
        "Ship it. Perfect is the enemy of done.",
        "Draft your launch announcement and post-launch devlog.",
        "Plan your first-week response strategy — reply to every comment.",
      ],
    };

    const phaseSuggestions = suggestions[snapshot.phase] ?? suggestions.planning;

    // Pick from contextual first (most relevant), then phase suggestions
    const pool = contextual.length > 0 ? contextual : phaseSuggestions;
    const suggestion = pool[Math.floor(Math.random() * pool.length)];
    return `**Next up:** ${suggestion}`;
  }
}

// ---- Singleton ----

let _instance: PersonalityEngine | null = null;

export function getPersonalityEngine(): PersonalityEngine {
  if (!_instance) {
    _instance = new PersonalityEngine();
  }
  return _instance;
}
