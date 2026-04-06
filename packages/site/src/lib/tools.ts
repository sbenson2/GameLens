import { tool } from "ai";
import { z } from "zod";
import { GENRE_DATA } from "@/data/genres";
import { KNOWLEDGE_INDEX, getKnowledgeContent } from "@/data/knowledge";

export const gamedevTools = {
  genre_lookup: tool({
    description:
      "Look up what systems, mechanics, and architecture a specific game genre requires. Use this when a user describes the type of game they want to build.",
    inputSchema: z.object({
      genre: z
        .string()
        .describe(
          "The game genre: platformer, roguelike, metroidvania, top-down-rpg, tower-defense, visual-novel, fighting, puzzle, survival, racing, rhythm"
        ),
    }),
    execute: async ({ genre }: { genre: string }) => {
      const key = genre.toLowerCase().replace(/\s+/g, "-");
      const data = GENRE_DATA[key];
      if (!data) {
        const available = Object.keys(GENRE_DATA).join(", ");
        return `Genre "${genre}" not found. Available genres: ${available}`;
      }
      return JSON.stringify(data, null, 2);
    },
  }),

  search_knowledge: tool({
    description:
      "Search the curated game development knowledge base for implementation guidance, design patterns, and best practices. Use this to find detailed information about specific game dev topics.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "What to search for, e.g. 'camera follow system', 'ECS architecture', 'save game serialization'"
        ),
    }),
    execute: async ({ query }: { query: string }) => {
      const terms = query.toLowerCase().split(/\s+/);
      const results = KNOWLEDGE_INDEX.filter((entry) =>
        terms.some(
          (term) =>
            entry.title.toLowerCase().includes(term) ||
            entry.tags.some((tag) => tag.includes(term))
        )
      )
        .slice(0, 5)
        .map((entry) => `## ${entry.title} [${entry.id}]\n${entry.summary}`)
        .join("\n\n---\n\n");

      return results || "No results found. Try different search terms.";
    },
  }),

  get_knowledge: tool({
    description:
      "Get the full content of a specific knowledge article by ID. Use after search_knowledge to dive deeper into a topic.",
    inputSchema: z.object({
      id: z.string().describe("The knowledge article ID from search results"),
    }),
    execute: async ({ id }: { id: string }) => {
      const content = getKnowledgeContent(id);
      return content || `Article "${id}" not found.`;
    },
  }),

  plan_architecture: tool({
    description:
      "Generate a project architecture plan for a game. Creates a file structure, system list, and implementation order tailored to the chosen engine and genre.",
    inputSchema: z.object({
      genre: z.string().describe("The game genre"),
      engine: z
        .string()
        .describe(
          "The game engine or framework: godot, monogame, unity, pygame, phaser, love2d, bevy"
        ),
      features: z
        .array(z.string())
        .describe(
          "Key features the user wants, e.g. ['procedural levels', 'boss fights', 'inventory']"
        ),
      scope: z
        .enum(["tiny", "small", "medium"])
        .describe(
          "Project scope: tiny (game jam), small (1-2 months), medium (3-6 months)"
        ),
    }),
    execute: async ({
      genre,
      engine,
      features,
      scope,
    }: {
      genre: string;
      engine: string;
      features: string[];
      scope: "tiny" | "small" | "medium";
    }) => {
      const eng = engine.toLowerCase();
      const fileExt = getFileExtension(eng);
      const sceneExt = getSceneExtension(eng);

      const maxSystems: Record<string, number> = {
        tiny: 4,
        small: 7,
        medium: 12,
      };
      const limit = maxSystems[scope] ?? 7;

      const genreData = GENRE_DATA[genre.toLowerCase().replace(/\s+/g, "-")];
      const systems = genreData
        ? genreData.requiredSystems.slice(0, limit)
        : features.slice(0, limit);

      const plan = {
        engine: eng,
        genre,
        scope,
        systems,
        fileStructure: generateFileStructure(eng, systems, fileExt, sceneExt),
        implementationOrder: systems.map((sys, i) => `${i + 1}. ${sys}`),
        estimatedFiles: systems.length * 2 + 3,
        notes: [
          scope === "tiny"
            ? "Game jam scope — cut ruthlessly, ship fast"
            : scope === "small"
              ? "Good solo project scope — focus on core loop first"
              : "Ambitious — prototype the core loop before building systems",
          `Using ${eng} conventions for file organization`,
          "Implement in order — each system builds on the previous",
        ],
      };

      return JSON.stringify(plan, null, 2);
    },
  }),
};

function getFileExtension(engine: string): string {
  const map: Record<string, string> = {
    godot: ".gd",
    monogame: ".cs",
    unity: ".cs",
    unreal: ".cpp",
    pygame: ".py",
    phaser: ".ts",
    love2d: ".lua",
    bevy: ".rs",
    defold: ".lua",
    gamemaker: ".gml",
  };
  return map[engine] || ".ts";
}

function getSceneExtension(engine: string): string {
  const map: Record<string, string> = {
    godot: ".tscn",
    unity: ".unity",
    monogame: "",
    pygame: "",
    phaser: "",
  };
  return map[engine] || "";
}

function generateFileStructure(
  engine: string,
  systems: string[],
  ext: string,
  sceneExt: string
): string[] {
  const files: string[] = [];

  if (engine === "godot") {
    files.push(
      "project.godot",
      `scenes/main${sceneExt}`,
      `scenes/game${sceneExt}`
    );
    for (const sys of systems) {
      const name = sys.toLowerCase().replace(/\s+/g, "_").replace(/[()]/g, "");
      files.push(`scripts/${name}${ext}`);
      if (sceneExt) files.push(`scenes/${name}${sceneExt}`);
    }
    files.push(
      "scripts/autoload/game_manager.gd",
      "scripts/autoload/events.gd"
    );
  } else if (engine === "monogame") {
    files.push("Game1.cs", "Program.cs", "Content/Content.mgcb");
    for (const sys of systems) {
      const name = toPascalCase(sys);
      files.push(`Systems/${name}System.cs`, `Components/${name}Component.cs`);
    }
    files.push("Core/GameState.cs", "Core/InputManager.cs");
  } else if (engine === "pygame") {
    files.push("main.py", "settings.py", "game.py");
    for (const sys of systems) {
      const name = sys.toLowerCase().replace(/\s+/g, "_").replace(/[()]/g, "");
      files.push(`systems/${name}.py`);
    }
    files.push("entities/player.py", "utils/helpers.py");
  } else if (engine === "phaser") {
    files.push("index.html", "src/main.ts", "src/config.ts");
    for (const sys of systems) {
      const name = toCamelCase(sys);
      files.push(`src/scenes/${name}Scene.ts`);
    }
    files.push("src/scenes/BootScene.ts", "src/scenes/GameScene.ts");
  } else {
    files.push(`main${ext}`, `game${ext}`);
    for (const sys of systems) {
      const name = sys.toLowerCase().replace(/\s+/g, "_").replace(/[()]/g, "");
      files.push(`${name}${ext}`);
    }
  }

  return files;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[()]/g, "")
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
