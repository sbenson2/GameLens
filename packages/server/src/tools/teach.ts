import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { DocStore, Doc } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import { HybridSearchEngine } from "../core/hybrid-search.js";

type ToolResult = { content: Array<{ type: "text"; text: string }> };

// ---------------------------------------------------------------------------
// Learning Path Definitions
// ---------------------------------------------------------------------------

interface Lesson {
  /** Short lesson title */
  title: string;
  /** One-sentence description of what the learner will know after this lesson */
  outcome: string;
  /** Doc IDs to read (in order) */
  docs: string[];
  /** Concept keywords — used for hybrid search fallback when docs aren't found */
  keywords: string[];
  /** Hands-on exercise description */
  exercise: string;
  /** Estimated minutes */
  estimatedMinutes: number;
}

interface LearningPath {
  id: string;
  title: string;
  description: string;
  /** Target audience */
  level: "beginner" | "intermediate" | "advanced";
  /** Engine focus (null = engine-agnostic) */
  engine: string | null;
  lessons: Lesson[];
}

/**
 * Curated learning paths mapped to real knowledge base docs.
 *
 * Each path is a ordered sequence of lessons. Each lesson references
 * specific doc IDs plus fallback keywords for hybrid search.
 */
const LEARNING_PATHS: LearningPath[] = [
  // ── Beginner: First Game ──────────────────────────────────────────
  {
    id: "first-game",
    title: "Your First Game",
    description:
      "Go from zero to a playable prototype. Covers game loops, input, sprites, and basic physics.",
    level: "beginner",
    engine: null,
    lessons: [
      {
        title: "The Game Loop",
        outcome: "Understand the update/draw cycle that powers every game.",
        docs: ["game-loop-theory", "G18"],
        keywords: ["game loop", "update", "draw", "fixed timestep"],
        exercise:
          "Create a blank project and add a counter that increments every frame. Print the frame count to the console or screen.",
        estimatedMinutes: 20,
      },
      {
        title: "Input Handling",
        outcome: "Read keyboard, mouse, and gamepad input to control game objects.",
        docs: ["input-handling-theory", "G11"],
        keywords: ["input", "keyboard", "mouse", "gamepad", "controller"],
        exercise:
          "Add a colored rectangle that moves with WASD or arrow keys. Bonus: add gamepad support.",
        estimatedMinutes: 25,
      },
      {
        title: "Sprites & Animation",
        outcome: "Load images, display sprites, and play frame-based animations.",
        docs: ["animation-theory"],
        keywords: ["sprite", "spritesheet", "animation", "texture", "rendering"],
        exercise:
          "Replace your rectangle with a spritesheet character. Implement a walk animation that plays when moving.",
        estimatedMinutes: 30,
      },
      {
        title: "Basic Physics & Collision",
        outcome: "Add gravity, velocity, and simple collision detection.",
        docs: ["physics-theory"],
        keywords: ["physics", "collision", "AABB", "gravity", "velocity"],
        exercise:
          "Add gravity to your character. Implement a ground plane they can stand on. Add jump with a key press.",
        estimatedMinutes: 30,
      },
      {
        title: "Camera Systems",
        outcome: "Make the camera follow the player smoothly.",
        docs: ["camera-theory"],
        keywords: ["camera", "follow", "deadzone", "lerp", "viewport"],
        exercise:
          "Create a world larger than the screen. Add a camera that smoothly follows the player with lerp.",
        estimatedMinutes: 20,
      },
      {
        title: "Scene Management",
        outcome: "Organize your game into scenes (title, gameplay, pause, game over).",
        docs: ["scene-management-theory"],
        keywords: ["scene", "state machine", "screen", "transition", "menu"],
        exercise:
          "Add a title screen and a game over screen. Wire up transitions between them.",
        estimatedMinutes: 25,
      },
    ],
  },

  // ── Intermediate: Game Architecture ───────────────────────────────
  {
    id: "game-architecture",
    title: "Game Architecture Patterns",
    description:
      "Level up from 'it works' to 'it scales'. ECS, design patterns, and project structure.",
    level: "intermediate",
    engine: null,
    lessons: [
      {
        title: "Programming Principles for Games",
        outcome: "Apply SOLID, DRY, and composition over inheritance to game code.",
        docs: ["G11"],
        keywords: ["SOLID", "DRY", "composition", "inheritance", "principles"],
        exercise:
          "Refactor a monolithic Player class into composed behaviors (movement, health, combat).",
        estimatedMinutes: 30,
      },
      {
        title: "Design Patterns in Games",
        outcome: "Know when to use Observer, Command, State, and Object Pool patterns.",
        docs: ["G12", "G18"],
        keywords: ["design patterns", "observer", "command", "state", "object pool"],
        exercise:
          "Implement an event bus (Observer pattern) that game systems use to communicate without direct references.",
        estimatedMinutes: 35,
      },
      {
        title: "Entity Component System (ECS)",
        outcome: "Separate data from behavior using entities, components, and systems.",
        docs: ["G18"],
        keywords: ["ECS", "entity", "component", "system", "archetype"],
        exercise:
          "Convert a traditional OOP enemy hierarchy into ECS: create Health, Transform, and AI components with matching systems.",
        estimatedMinutes: 40,
      },
      {
        title: "Data Structures for Games",
        outcome: "Choose the right data structure for spatial queries, inventories, and AI.",
        docs: ["G14"],
        keywords: ["data structures", "spatial hash", "quadtree", "grid", "pool"],
        exercise:
          "Implement a spatial hash grid. Use it to optimize collision checks for 100+ entities.",
        estimatedMinutes: 35,
      },
      {
        title: "Project Structure & Scaling",
        outcome: "Organize folders, namespaces, and modules for a growing game.",
        docs: ["E4", "P1"],
        keywords: ["project structure", "folders", "modules", "organization", "pre-production"],
        exercise:
          "Restructure your project into clearly separated layers: Core, Gameplay, UI, Assets. Document the conventions in a README.",
        estimatedMinutes: 25,
      },
    ],
  },

  // ── Beginner: Game Design Fundamentals ────────────────────────────
  {
    id: "game-design",
    title: "Game Design Fundamentals",
    description:
      "Learn to design fun, balanced games. Covers mechanics, game feel, scope, and playtesting.",
    level: "beginner",
    engine: null,
    lessons: [
      {
        title: "Core Mechanics & Loops",
        outcome: "Define your game's core loop and moment-to-moment mechanics.",
        docs: ["E6"],
        keywords: ["game design", "core loop", "mechanics", "gameplay"],
        exercise:
          "Write a one-page design for a game with exactly 3 mechanics. Define the core loop (action → feedback → reward).",
        estimatedMinutes: 25,
      },
      {
        title: "Game Feel & Juice",
        outcome: "Make actions feel satisfying through feedback, timing, and polish.",
        docs: ["C2"],
        keywords: ["game feel", "juice", "polish", "feedback", "screenshake"],
        exercise:
          "Take a basic platformer and add 5 types of juice: screenshake, particles, squash/stretch, sound, and hitstop.",
        estimatedMinutes: 30,
      },
      {
        title: "Genre Conventions",
        outcome: "Understand what players expect from your chosen genre.",
        docs: ["C1"],
        keywords: ["genre", "platformer", "roguelike", "rpg", "conventions"],
        exercise:
          "Pick a genre. List 10 games in it. Identify the 5 systems they ALL share. Those are your must-haves.",
        estimatedMinutes: 20,
      },
      {
        title: "Scope Management",
        outcome: "Ship a game by ruthlessly cutting scope.",
        docs: ["P8", "E9"],
        keywords: ["scope", "scope creep", "game dev", "MVP", "cut features"],
        exercise:
          "Take your game idea and create 3 scope tiers: Jam (3 days), Demo (2 weeks), Full (3 months). Identify what to cut at each tier.",
        estimatedMinutes: 20,
      },
      {
        title: "Playtesting",
        outcome: "Get useful feedback before it's too late to change things.",
        docs: ["P4"],
        keywords: ["playtesting", "feedback", "iteration", "usability"],
        exercise:
          "Write a 5-question playtesting script. Have someone play your prototype for 10 minutes while you observe silently.",
        estimatedMinutes: 25,
      },
    ],
  },

  // ── Intermediate: Combat Systems ──────────────────────────────────
  {
    id: "combat-systems",
    title: "Combat Systems Deep Dive",
    description:
      "Design and implement melee, ranged, and AI combat from scratch.",
    level: "intermediate",
    engine: null,
    lessons: [
      {
        title: "Combat Design Foundations",
        outcome: "Design a combat system with risk/reward, pacing, and balance.",
        docs: ["combat-theory", "E6"],
        keywords: ["combat", "damage", "hitbox", "balance", "risk reward"],
        exercise:
          "Design a combat system on paper: list all attack types, their damage, range, startup frames, and recovery frames.",
        estimatedMinutes: 25,
      },
      {
        title: "Hitboxes & Hurtboxes",
        outcome: "Implement frame-accurate hit detection with hitbox/hurtbox separation.",
        docs: ["physics-theory", "combat-theory"],
        keywords: ["hitbox", "hurtbox", "collision", "attack frames", "iframes"],
        exercise:
          "Implement hitbox/hurtbox separation. Visualize them with debug overlays. Add invincibility frames on hit.",
        estimatedMinutes: 35,
      },
      {
        title: "Enemy AI & Behavior",
        outcome: "Create enemies that patrol, detect, chase, and attack.",
        docs: ["pathfinding-theory", "ai-theory"],
        keywords: ["AI", "enemy", "state machine", "pathfinding", "behavior tree"],
        exercise:
          "Build an enemy with 4 states: Idle → Patrol → Chase → Attack. Use a state machine with clear transitions.",
        estimatedMinutes: 40,
      },
      {
        title: "Health, Damage & Death",
        outcome: "Implement a damage pipeline: attack → hit check → damage calc → effects → death.",
        docs: ["combat-theory"],
        keywords: ["health", "damage", "death", "respawn", "knockback"],
        exercise:
          "Create a damage pipeline component. Add knockback on hit, a death animation, and a respawn timer.",
        estimatedMinutes: 30,
      },
    ],
  },

  // ── Advanced: Performance & Polish ────────────────────────────────
  {
    id: "performance-polish",
    title: "Performance & Polish",
    description:
      "Ship a professional game. Profiling, optimization, polish, and release.",
    level: "advanced",
    engine: null,
    lessons: [
      {
        title: "Profiling & Bottlenecks",
        outcome: "Find and measure the actual performance bottlenecks in your game.",
        docs: ["P12"],
        keywords: ["profiling", "performance", "FPS", "bottleneck", "budget"],
        exercise:
          "Profile your game for 60 seconds. Identify the top 3 CPU consumers. Document them with frame times.",
        estimatedMinutes: 30,
      },
      {
        title: "Object Pooling & Memory",
        outcome: "Eliminate GC spikes by pooling bullets, particles, and effects.",
        docs: ["G14", "G18"],
        keywords: ["object pool", "memory", "garbage collection", "allocation", "pooling"],
        exercise:
          "Implement a generic object pool. Convert your bullet/projectile system to use it. Measure GC before and after.",
        estimatedMinutes: 35,
      },
      {
        title: "Polish Checklist",
        outcome: "Systematically add the 20% of polish that makes 80% of the difference.",
        docs: ["P11", "C2"],
        keywords: ["polish", "juice", "screenshake", "particles", "sound"],
        exercise:
          "Go through the polish checklist on your game. Check off at least 10 items. Record before/after gameplay footage.",
        estimatedMinutes: 40,
      },
      {
        title: "Release Pipeline",
        outcome: "Build, test, and ship your game to players.",
        docs: ["P13", "P7"],
        keywords: ["release", "build", "deploy", "launch", "distribution"],
        exercise:
          "Create a release build of your game. Test it on a clean machine. Write release notes.",
        estimatedMinutes: 30,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Progress Tracking
// ---------------------------------------------------------------------------

interface LessonProgress {
  completed: boolean;
  completedAt?: string;
  notes?: string;
}

interface PathProgress {
  pathId: string;
  startedAt: string;
  lessons: Record<number, LessonProgress>;
}

interface TeachProgress {
  version: number;
  paths: Record<string, PathProgress>;
}

const PROGRESS_DIR = path.join(os.homedir(), ".gamecodex");
const PROGRESS_PATH = path.join(PROGRESS_DIR, "learning-progress.json");

function loadProgress(): TeachProgress {
  try {
    if (fs.existsSync(PROGRESS_PATH)) {
      return JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8"));
    }
  } catch {
    // Corrupted file — start fresh
  }
  return { version: 1, paths: {} };
}

function saveProgress(progress: TeachProgress): void {
  try {
    if (!fs.existsSync(PROGRESS_DIR)) {
      fs.mkdirSync(PROGRESS_DIR, { recursive: true });
    }
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
  } catch {
    // Non-fatal — progress just won't persist
  }
}

// ---------------------------------------------------------------------------
// Tool Actions
// ---------------------------------------------------------------------------

type TeachAction = "list_paths" | "start_path" | "next_lesson" | "complete_lesson" | "progress" | "lesson";

interface TeachArgs {
  action: string;
  pathId?: string;
  lessonIndex?: number;
  notes?: string;
  level?: string;
  engine?: string;
}

/**
 * teach — Interactive learning tool with curated paths, exercises, and progress.
 */
export async function handleTeach(
  args: TeachArgs,
  docStore: DocStore,
  searchEngine: SearchEngine,
  hybridSearch?: HybridSearchEngine,
): Promise<ToolResult> {
  const action = args.action as TeachAction;

  switch (action) {
    case "list_paths":
      return listPaths(args);
    case "start_path":
      return startPath(args);
    case "next_lesson":
      return nextLesson(args, docStore, searchEngine, hybridSearch);
    case "lesson":
      return getLesson(args, docStore, searchEngine, hybridSearch);
    case "complete_lesson":
      return completeLesson(args);
    case "progress":
      return showProgress(args);
    default:
      return {
        content: [{
          type: "text",
          text: `Unknown action "${args.action}". Available actions: list_paths, start_path, next_lesson, lesson, complete_lesson, progress`,
        }],
      };
  }
}

/** List all available learning paths, optionally filtered */
function listPaths(args: TeachArgs): ToolResult {
  let paths = LEARNING_PATHS;

  if (args.level) {
    paths = paths.filter((p) => p.level === args.level);
  }
  if (args.engine) {
    const lower = args.engine.toLowerCase();
    paths = paths.filter(
      (p) => p.engine === null || p.engine.toLowerCase().includes(lower)
    );
  }

  const progress = loadProgress();

  let output = `# Learning Paths (${paths.length})\n\n`;

  for (const p of paths) {
    const pathProgress = progress.paths[p.id];
    const completedCount = pathProgress
      ? Object.values(pathProgress.lessons).filter((l) => l.completed).length
      : 0;
    const totalLessons = p.lessons.length;
    const totalMinutes = p.lessons.reduce((sum, l) => sum + l.estimatedMinutes, 0);

    const statusIcon = completedCount === 0
      ? "⬜"
      : completedCount === totalLessons
        ? "✅"
        : "🔶";

    output += `## ${statusIcon} ${p.title}\n\n`;
    output += `- **ID:** \`${p.id}\`\n`;
    output += `- **Level:** ${p.level}\n`;
    output += `- **Engine:** ${p.engine ?? "Any"}\n`;
    output += `- **Lessons:** ${totalLessons} (~${totalMinutes} min total)\n`;
    output += `- **Progress:** ${completedCount}/${totalLessons}\n`;
    output += `- ${p.description}\n\n`;
  }

  output += `---\n\n`;
  output += `Use \`teach(action: "start_path", pathId: "<id>")\` to begin a path.\n`;

  return { content: [{ type: "text", text: output }] };
}

/** Start (or resume) a learning path */
function startPath(args: TeachArgs): ToolResult {
  if (!args.pathId) {
    return { content: [{ type: "text", text: "Please provide a `pathId`. Use `list_paths` to see available paths." }] };
  }

  const pathDef = LEARNING_PATHS.find((p) => p.id === args.pathId);
  if (!pathDef) {
    const available = LEARNING_PATHS.map((p) => p.id).join(", ");
    return { content: [{ type: "text", text: `Path "${args.pathId}" not found. Available: ${available}` }] };
  }

  const progress = loadProgress();
  if (!progress.paths[pathDef.id]) {
    progress.paths[pathDef.id] = {
      pathId: pathDef.id,
      startedAt: new Date().toISOString(),
      lessons: {},
    };
    saveProgress(progress);
  }

  // Find the next uncompleted lesson
  const pathProgress = progress.paths[pathDef.id];
  let nextIndex = 0;
  for (let i = 0; i < pathDef.lessons.length; i++) {
    if (!pathProgress.lessons[i]?.completed) {
      nextIndex = i;
      break;
    }
    if (i === pathDef.lessons.length - 1) {
      nextIndex = -1; // all done
    }
  }

  let output = `# 📚 ${pathDef.title}\n\n`;
  output += `${pathDef.description}\n\n`;
  output += `**Level:** ${pathDef.level} | **Lessons:** ${pathDef.lessons.length}\n\n`;

  // Show lesson overview with progress
  output += `## Lesson Overview\n\n`;
  for (let i = 0; i < pathDef.lessons.length; i++) {
    const lesson = pathDef.lessons[i];
    const done = pathProgress.lessons[i]?.completed;
    const icon = done ? "✅" : i === nextIndex ? "👉" : "⬜";
    output += `${icon} **${i + 1}. ${lesson.title}** (~${lesson.estimatedMinutes} min)\n`;
    output += `   ${lesson.outcome}\n\n`;
  }

  if (nextIndex === -1) {
    output += `\n🎉 **You've completed this entire path!** Use \`progress\` to see your overall stats.\n`;
  } else {
    output += `---\n\n`;
    output += `Use \`teach(action: "next_lesson", pathId: "${pathDef.id}")\` to start lesson ${nextIndex + 1}.\n`;
  }

  return { content: [{ type: "text", text: output }] };
}

/** Deliver the next uncompleted lesson in a path */
async function nextLesson(
  args: TeachArgs,
  docStore: DocStore,
  searchEngine: SearchEngine,
  hybridSearch?: HybridSearchEngine,
): Promise<ToolResult> {
  if (!args.pathId) {
    return { content: [{ type: "text", text: "Please provide a `pathId`." }] };
  }

  const pathDef = LEARNING_PATHS.find((p) => p.id === args.pathId);
  if (!pathDef) {
    return { content: [{ type: "text", text: `Path "${args.pathId}" not found.` }] };
  }

  const progress = loadProgress();
  const pathProgress = progress.paths[pathDef.id];

  // Find next uncompleted
  let nextIndex = -1;
  for (let i = 0; i < pathDef.lessons.length; i++) {
    if (!pathProgress?.lessons[i]?.completed) {
      nextIndex = i;
      break;
    }
  }

  if (nextIndex === -1) {
    return { content: [{ type: "text", text: `🎉 You've completed all lessons in "${pathDef.title}"! Use \`progress\` to see your stats.` }] };
  }

  return deliverLesson(pathDef, nextIndex, docStore, searchEngine, hybridSearch);
}

/** Deliver a specific lesson by index */
async function getLesson(
  args: TeachArgs,
  docStore: DocStore,
  searchEngine: SearchEngine,
  hybridSearch?: HybridSearchEngine,
): Promise<ToolResult> {
  if (!args.pathId) {
    return { content: [{ type: "text", text: "Please provide a `pathId`." }] };
  }
  if (args.lessonIndex === undefined) {
    return { content: [{ type: "text", text: "Please provide a `lessonIndex` (1-based)." }] };
  }

  const pathDef = LEARNING_PATHS.find((p) => p.id === args.pathId);
  if (!pathDef) {
    return { content: [{ type: "text", text: `Path "${args.pathId}" not found.` }] };
  }

  const idx = args.lessonIndex - 1; // convert 1-based to 0-based
  if (idx < 0 || idx >= pathDef.lessons.length) {
    return { content: [{ type: "text", text: `Lesson ${args.lessonIndex} is out of range. This path has ${pathDef.lessons.length} lessons.` }] };
  }

  return deliverLesson(pathDef, idx, docStore, searchEngine, hybridSearch);
}

/** Core lesson delivery — renders a lesson with docs, exercise, and navigation */
async function deliverLesson(
  pathDef: LearningPath,
  lessonIndex: number,
  docStore: DocStore,
  searchEngine: SearchEngine,
  hybridSearch?: HybridSearchEngine,
): Promise<ToolResult> {
  const lesson = pathDef.lessons[lessonIndex];
  const progress = loadProgress();
  const isCompleted = progress.paths[pathDef.id]?.lessons[lessonIndex]?.completed;

  let output = `# Lesson ${lessonIndex + 1}/${pathDef.lessons.length}: ${lesson.title}\n\n`;
  output += `**Path:** ${pathDef.title} | **Level:** ${pathDef.level} | **~${lesson.estimatedMinutes} min**\n\n`;

  if (isCompleted) {
    output += `✅ _You've already completed this lesson._\n\n`;
  }

  // Learning outcome
  output += `## 🎯 Outcome\n\n`;
  output += `${lesson.outcome}\n\n`;

  // Find and present docs
  output += `## 📖 Reading\n\n`;
  const foundDocs: Doc[] = [];

  for (const docId of lesson.docs) {
    const doc = docStore.getDoc(docId) ??
      docStore.getAllDocs().find((d) => d.id.toLowerCase() === docId.toLowerCase());
    if (doc) {
      foundDocs.push(doc);
      output += `- **\`${doc.id}\`** — ${doc.title} (${doc.category})\n`;
      if (doc.description) {
        output += `  _${doc.description}_\n`;
      }
    }
  }

  // Supplement with hybrid search if we found fewer docs than expected
  if (foundDocs.length < 2 && lesson.keywords.length > 0) {
    const query = lesson.keywords.join(" ");
    const allDocs = docStore.getAllDocs();
    const supplemental = hybridSearch
      ? await hybridSearch.search(query, allDocs, 3)
      : searchEngine.search(query, allDocs, 3).map((r) => ({
          doc: r.doc,
          score: r.score,
          snippet: r.snippet,
          tfidfScore: r.score,
          vectorScore: 0,
        }));

    const extraDocs = supplemental
      .filter((r) => !foundDocs.some((d) => d.id === r.doc.id))
      .slice(0, 2);

    if (extraDocs.length > 0) {
      output += `\n**Also relevant:**\n`;
      for (const r of extraDocs) {
        output += `- **\`${r.doc.id}\`** — ${r.doc.title} (score: ${r.score.toFixed(1)})\n`;
      }
    }
  }

  output += `\n_Use \`get_doc("<id>")\` to read any doc in full. Use \`get_doc("<id>", section: "...")\` to extract a specific section._\n`;

  // Exercise
  output += `\n## 🛠️ Exercise\n\n`;
  output += `${lesson.exercise}\n`;

  // Navigation
  output += `\n---\n\n`;

  if (!isCompleted) {
    output += `When you've finished the reading and exercise:\n`;
    output += `\`teach(action: "complete_lesson", pathId: "${pathDef.id}", lessonIndex: ${lessonIndex + 1})\`\n\n`;
  }

  if (lessonIndex < pathDef.lessons.length - 1) {
    output += `**Next:** ${pathDef.lessons[lessonIndex + 1].title}\n`;
  } else {
    output += `**This is the final lesson!** Complete it to finish the path.\n`;
  }

  return { content: [{ type: "text", text: output }] };
}

/** Mark a lesson as complete */
function completeLesson(args: TeachArgs): ToolResult {
  if (!args.pathId) {
    return { content: [{ type: "text", text: "Please provide a `pathId`." }] };
  }
  if (args.lessonIndex === undefined) {
    return { content: [{ type: "text", text: "Please provide a `lessonIndex` (1-based)." }] };
  }

  const pathDef = LEARNING_PATHS.find((p) => p.id === args.pathId);
  if (!pathDef) {
    return { content: [{ type: "text", text: `Path "${args.pathId}" not found.` }] };
  }

  const idx = args.lessonIndex - 1;
  if (idx < 0 || idx >= pathDef.lessons.length) {
    return { content: [{ type: "text", text: `Lesson ${args.lessonIndex} out of range.` }] };
  }

  const progress = loadProgress();
  if (!progress.paths[pathDef.id]) {
    progress.paths[pathDef.id] = {
      pathId: pathDef.id,
      startedAt: new Date().toISOString(),
      lessons: {},
    };
  }

  progress.paths[pathDef.id].lessons[idx] = {
    completed: true,
    completedAt: new Date().toISOString(),
    notes: args.notes,
  };

  saveProgress(progress);

  const lesson = pathDef.lessons[idx];
  const totalCompleted = Object.values(progress.paths[pathDef.id].lessons).filter((l) => l.completed).length;
  const totalLessons = pathDef.lessons.length;

  let output = `✅ **Lesson ${args.lessonIndex} complete:** ${lesson.title}\n\n`;
  output += `**Progress:** ${totalCompleted}/${totalLessons} lessons in "${pathDef.title}"\n`;

  if (args.notes) {
    output += `**Your notes:** ${args.notes}\n`;
  }

  // Progress bar
  const filled = Math.round((totalCompleted / totalLessons) * 20);
  const empty = 20 - filled;
  output += `\n${"█".repeat(filled)}${"░".repeat(empty)} ${Math.round((totalCompleted / totalLessons) * 100)}%\n`;

  if (totalCompleted === totalLessons) {
    output += `\n🎉 **Path complete!** You've finished "${pathDef.title}"!\n`;
  } else if (idx + 1 < totalLessons) {
    output += `\n**Up next:** Lesson ${idx + 2} — ${pathDef.lessons[idx + 1].title}\n`;
    output += `Use \`teach(action: "next_lesson", pathId: "${pathDef.id}")\` to continue.\n`;
  }

  return { content: [{ type: "text", text: output }] };
}

/** Show overall learning progress */
function showProgress(args: TeachArgs): ToolResult {
  const progress = loadProgress();

  // If a specific path is requested
  if (args.pathId) {
    const pathDef = LEARNING_PATHS.find((p) => p.id === args.pathId);
    if (!pathDef) {
      return { content: [{ type: "text", text: `Path "${args.pathId}" not found.` }] };
    }

    const pathProgress = progress.paths[pathDef.id];
    let output = `# Progress: ${pathDef.title}\n\n`;

    for (let i = 0; i < pathDef.lessons.length; i++) {
      const lesson = pathDef.lessons[i];
      const lp = pathProgress?.lessons[i];
      const icon = lp?.completed ? "✅" : "⬜";
      output += `${icon} **${i + 1}. ${lesson.title}**`;
      if (lp?.completedAt) {
        output += ` (completed ${new Date(lp.completedAt).toLocaleDateString()})`;
      }
      output += `\n`;
      if (lp?.notes) {
        output += `   _Notes: ${lp.notes}_\n`;
      }
    }

    return { content: [{ type: "text", text: output }] };
  }

  // Overall progress
  let output = `# Learning Progress\n\n`;

  let totalCompleted = 0;
  let totalLessons = 0;
  let totalMinutes = 0;

  for (const pathDef of LEARNING_PATHS) {
    const pp = progress.paths[pathDef.id];
    const completed = pp
      ? Object.values(pp.lessons).filter((l) => l.completed).length
      : 0;
    const total = pathDef.lessons.length;
    const minutes = pathDef.lessons
      .filter((_, i) => pp?.lessons[i]?.completed)
      .reduce((sum, l) => sum + l.estimatedMinutes, 0);

    totalCompleted += completed;
    totalLessons += total;
    totalMinutes += minutes;

    if (completed > 0 || pp) {
      const pct = Math.round((completed / total) * 100);
      const filled = Math.round((completed / total) * 10);
      const empty = 10 - filled;
      const bar = "█".repeat(filled) + "░".repeat(empty);
      output += `**${pathDef.title}** ${bar} ${completed}/${total} (${pct}%)\n`;
    }
  }

  if (totalCompleted === 0) {
    output += `_No lessons completed yet. Use \`list_paths\` to see available learning paths._\n`;
  } else {
    output += `\n---\n\n`;
    output += `**Total:** ${totalCompleted}/${totalLessons} lessons | ~${totalMinutes} minutes of learning\n`;
  }

  return { content: [{ type: "text", text: output }] };
}
