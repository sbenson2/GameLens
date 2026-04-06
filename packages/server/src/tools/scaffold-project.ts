type ToolResult = { content: Array<{ type: "text"; text: string }> };

type Engine = "monogame" | "godot" | "phaser";

interface ScaffoldTemplate {
  engine: Engine;
  label: string;
  description: string;
  structure: string;
  setupCommands: string[];
  starterFiles: Record<string, string>;
  notes: string[];
}

const TEMPLATES: Record<Engine, ScaffoldTemplate> = {
  monogame: {
    engine: "monogame",
    label: "MonoGame + Arch ECS",
    description: "C# game with MonoGame framework, Arch ECS, and composed library stack",
    structure: `{project}/
├── {project}.sln
├── {project}/
│   ├── {project}.csproj
│   ├── Program.cs
│   ├── Game1.cs
│   ├── Systems/
│   │   └── RenderSystem.cs
│   ├── Components/
│   │   └── Position.cs
│   ├── Scenes/
│   │   └── GameplayScene.cs
│   ├── Core/
│   │   ├── SceneManager.cs
│   │   └── ServiceLocator.cs
│   └── Content/
│       └── Content.mgcb
└── {project}.Tests/
    └── {project}.Tests.csproj`,
    setupCommands: [
      "dotnet new sln -n {project}",
      "dotnet new mgdesktopgl -n {project}",
      "dotnet sln add {project}/{project}.csproj",
      "cd {project} && dotnet add package Arch --version 2.1.0",
      "cd {project} && dotnet add package Arch.System",
      "cd {project} && dotnet add package Arch.System.SourceGenerator",
      "cd {project} && dotnet add package MonoGame.Extended --version 5.3.1",
      "cd {project} && dotnet add package Apos.Input --version 2.5.0",
      "cd {project} && dotnet add package FontStashSharp.MonoGame --version 1.3.7",
    ],
    starterFiles: {
      "Components/Position.cs": `using System.Numerics;

namespace {project}.Components;

/// <summary>
/// Basic transform component. Every visible entity needs this.
/// Uses System.Numerics.Vector2 for SIMD-friendly math.
/// </summary>
public struct Position
{
    public Vector2 Value;
    public float Rotation;
    public Vector2 Scale;

    public Position(float x, float y)
    {
        Value = new Vector2(x, y);
        Rotation = 0f;
        Scale = Vector2.One;
    }
}`,
      "Components/Sprite.cs": `using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework;

namespace {project}.Components;

/// <summary>
/// Sprite rendering data. Paired with Position for rendering.
/// </summary>
public struct Sprite
{
    public Texture2D Texture;
    public Rectangle? SourceRect;
    public Color Tint;
    public float LayerDepth;

    public Sprite(Texture2D texture)
    {
        Texture = texture;
        SourceRect = null;
        Tint = Color.White;
        LayerDepth = 0f;
    }
}`,
    },
    notes: [
      "Requires .NET 10 SDK and MonoGame templates: dotnet new install MonoGame.Templates.CSharp",
      "See docs R1 (Library Stack) for the full package list",
      "See docs R3 (Project Structure) for detailed folder organization",
      "See docs G1 (Custom Code Recipes) for SceneManager, SpatialHash, and other glue code",
    ],
  },
  godot: {
    engine: "godot",
    label: "Godot 4.4",
    description: "GDScript project with recommended folder structure",
    structure: `{project}/
├── project.godot
├── scenes/
│   ├── main.tscn
│   ├── player/
│   │   ├── player.tscn
│   │   └── player.gd
│   └── ui/
│       └── hud.tscn
├── scripts/
│   ├── autoload/
│   │   ├── game_manager.gd
│   │   └── signal_bus.gd
│   └── resources/
│       └── player_stats.gd
├── assets/
│   ├── sprites/
│   ├── audio/
│   └── fonts/
└── addons/`,
    setupCommands: [
      "# Create via Godot Editor: Project > New Project > {project}",
      "# Or copy from a Godot template repository",
    ],
    starterFiles: {
      "scripts/autoload/signal_bus.gd": `extends Node
## Global signal bus — decouple systems via signals instead of direct references.
## Register this as an Autoload in Project Settings.

## Emitted when player takes damage. UI and camera shake can listen.
signal player_damaged(amount: float, source: Node)

## Emitted when a game state transition occurs.
signal state_changed(old_state: String, new_state: String)

## Emitted when an item is picked up.
signal item_collected(item_id: String, quantity: int)
`,
      "scripts/autoload/game_manager.gd": `extends Node
## Central game state manager. Autoload singleton.

enum GameState { MENU, PLAYING, PAUSED, GAME_OVER }

var current_state: GameState = GameState.MENU

func change_state(new_state: GameState) -> void:
    var old = current_state
    current_state = new_state
    SignalBus.state_changed.emit(GameState.keys()[old], GameState.keys()[new_state])
`,
    },
    notes: [
      "Requires Godot 4.4+ installed",
      "Autoloads must be registered in Project > Project Settings > Autoload",
      "Use signal bus pattern to keep scenes decoupled (see signal_bus.gd)",
    ],
  },
  phaser: {
    engine: "phaser",
    label: "Phaser 3 (HTML5)",
    description: "TypeScript browser game with Phaser 3, Vite bundler",
    structure: `{project}/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.ts
│   ├── scenes/
│   │   ├── BootScene.ts
│   │   ├── GameScene.ts
│   │   └── UIScene.ts
│   ├── entities/
│   │   └── Player.ts
│   └── utils/
│       └── constants.ts
├── public/
│   └── assets/
│       ├── sprites/
│       └── audio/
└── tests/`,
    setupCommands: [
      "npm create vite@latest {project} -- --template vanilla-ts",
      "cd {project} && npm install phaser@3",
      "# Replace src/main.ts with the Phaser game config below",
    ],
    starterFiles: {
      "src/main.ts": `import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";

/**
 * Phaser game config — the entry point for everything.
 * Physics: arcade (simple, fast, good for most 2D games).
 * Scale: FIT mode auto-scales to browser window.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 300 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene, UIScene],
};

new Phaser.Game(config);
`,
      "src/scenes/GameScene.ts": `import Phaser from "phaser";

/**
 * Main gameplay scene. Handles entities, physics, and game logic.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
  }

  preload(): void {
    // Load assets here
  }

  create(): void {
    // Set up entities, physics, input
    this.add.text(400, 300, "Hello Phaser!", {
      fontSize: "32px",
      color: "#fff",
    }).setOrigin(0.5);
  }

  update(time: number, delta: number): void {
    // Game loop — runs every frame
  }
}
`,
    },
    notes: [
      "Requires Node.js 18+ and npm",
      "Run with: npm run dev (Vite dev server with hot reload)",
      "Build with: npm run build (outputs to dist/)",
      "Phaser 3 docs: https://phaser.io/docs/3.80.0",
    ],
  },
};

const SUPPORTED_ENGINES = Object.keys(TEMPLATES) as Engine[];

/**
 * scaffold_project — Generate directory structure + starter files for any supported engine.
 */
export function handleScaffoldProject(args: {
  engine: string;
  name: string;
  genre?: string;
}): ToolResult {
  const engineKey = args.engine.toLowerCase().replace(/\s+/g, "") as Engine;

  // Normalize engine aliases
  const engineMap: Record<string, Engine> = {
    monogame: "monogame",
    "monogame+arch": "monogame",
    "arch": "monogame",
    godot: "godot",
    "godot4": "godot",
    phaser: "phaser",
    "phaser3": "phaser",
    html5: "phaser",
  };

  const resolved = engineMap[engineKey];
  if (!resolved) {
    return {
      content: [{
        type: "text",
        text: `Unknown engine "${args.engine}".\n\nSupported engines: ${SUPPORTED_ENGINES.join(", ")}\n\nAliases: monogame, godot, godot4, phaser, phaser3, html5`,
      }],
    };
  }

  const projectName = args.name.trim().replace(/\s+/g, "-");
  if (!projectName) {
    return { content: [{ type: "text", text: "Please provide a project name." }] };
  }

  const template = TEMPLATES[resolved];
  const structure = template.structure.replace(/\{project\}/g, projectName);
  const commands = template.setupCommands.map((c) => c.replace(/\{project\}/g, projectName));

  let output = `# Scaffold: ${projectName}\n\n`;
  output += `**Engine:** ${template.label}\n`;
  output += `**Description:** ${template.description}\n`;
  if (args.genre) {
    output += `**Genre:** ${args.genre} — use \`genre_lookup\` for genre-specific system recommendations\n`;
  }

  output += `\n## Directory Structure\n\n\`\`\`\n${structure}\n\`\`\`\n`;

  output += `\n## Setup Commands\n\n\`\`\`bash\n${commands.join("\n")}\n\`\`\`\n`;

  output += `\n## Starter Files\n\n`;
  for (const [path, content] of Object.entries(template.starterFiles)) {
    const filePath = path.replace(/\{project\}/g, projectName);
    const fileContent = content.replace(/\{project\}/g, projectName);
    output += `### \`${filePath}\`\n\n\`\`\`${getLanguage(filePath)}\n${fileContent}\n\`\`\`\n\n`;
  }

  output += `## Notes\n\n`;
  for (const note of template.notes) {
    output += `- ${note}\n`;
  }

  return { content: [{ type: "text", text: output }] };
}

function getLanguage(filePath: string): string {
  if (filePath.endsWith(".cs")) return "csharp";
  if (filePath.endsWith(".gd")) return "gdscript";
  if (filePath.endsWith(".ts")) return "typescript";
  if (filePath.endsWith(".js")) return "javascript";
  return "";
}
