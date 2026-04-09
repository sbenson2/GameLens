import { resolveEngineKey, getEngineLabel } from "../core/modules.js";

type ToolResult = { content: Array<{ type: "text"; text: string }> };

interface AssetGuideEntry {
  naming: string;
  exportSettings: string;
  importSteps: string[];
  gotchas: string[];
}

interface SourceToolTips {
  exportTips: string[];
  bestFormat: string;
}

// Asset guides per engine
const ASSET_GUIDES: Record<string, Record<string, AssetGuideEntry>> = {
  sprite: {
    monogame: {
      naming: "PascalCase: `Player.png`, `EnemySlime.png`. Store in `Content/sprites/`.",
      exportSettings: "PNG, 32-bit RGBA. Transparent background. No premultiplied alpha (MonoGame handles it).",
      importSteps: [
        "Add to Content.mgcb via MGCB Editor: right-click → Add Existing Item",
        "Set Importer: Texture Importer, Processor: Texture Processor",
        "Set PremultiplyAlpha: true (default, matches SpriteBatch default blend)",
        "Load: Content.Load<Texture2D>(\"sprites/Player\")",
      ],
      gotchas: [
        "No file extension in Content.Load path — MonoGame strips it",
        "Power-of-2 sizes not required but improve GPU batching",
        "If sprite looks wrong, check premultiplied alpha setting matches SpriteBatch blend state",
      ],
    },
    godot: {
      naming: "snake_case: `player.png`, `enemy_slime.png`. Store in `assets/sprites/`.",
      exportSettings: "PNG, 32-bit RGBA. Transparent background.",
      importSteps: [
        "Drop PNG into assets/sprites/ — Godot auto-imports",
        "Check Import dock: Filter = Nearest (for pixel art) or Linear (for smooth art)",
        "Set Compress Mode: Lossless for pixel art, VRAM Compressed for large textures",
        "Use in Sprite2D node: drag texture to Texture property in Inspector",
      ],
      gotchas: [
        "Reimport after changing import settings — right-click → Reimport",
        "Nearest filter is critical for pixel art — Linear makes it blurry",
        "Don't put assets in res://addons/ — that's for plugins only",
      ],
    },
    phaser: {
      naming: "kebab-case: `player.png`, `enemy-slime.png`. Store in `public/assets/sprites/`.",
      exportSettings: "PNG, 32-bit RGBA. Transparent background.",
      importSteps: [
        "Place file in public/assets/sprites/ (Vite serves from public/)",
        "Load in preload(): this.load.image('player', '/assets/sprites/player.png')",
        "Use: this.add.sprite(x, y, 'player') or this.physics.add.sprite(x, y, 'player')",
      ],
      gotchas: [
        "Path is relative to index.html, not the JS file",
        "Key must be unique across all loaded assets",
        "Vite: assets in public/ are served as-is; assets in src/ get hashed in build",
      ],
    },
  },
  spritesheet: {
    monogame: {
      naming: "PascalCase: `PlayerWalk.png`, `EnemyAttack.png`. Uniform grid layout.",
      exportSettings: "PNG spritesheet with uniform frame size. No padding (or consistent padding). All frames same dimensions.",
      importSteps: [
        "Add to Content.mgcb as regular texture (same as sprite)",
        "In code, define frame rectangles: new Rectangle(col * frameW, row * frameH, frameW, frameH)",
        "Or use MonoGame.Extended SpriteSheet for automatic frame slicing",
        "Animate by cycling source rectangles over time",
      ],
      gotchas: [
        "Frame size must be consistent across the entire sheet",
        "Bleeding between frames: add 1-2px padding between frames if using texture filtering",
        "MonoGame.Extended AnimatedSprite simplifies this significantly (see R1)",
      ],
    },
    godot: {
      naming: "snake_case: `player_walk.png`, `enemy_attack.png`. Grid or packed layout.",
      exportSettings: "PNG spritesheet. Grid layout recommended (uniform frame sizes). Can also use packed atlases with a .json descriptor.",
      importSteps: [
        "For grid sheets: use AnimatedSprite2D → SpriteFrames → Add from Spritesheet",
        "Set H/V frames in SpriteFrames editor to slice the grid",
        "For packed atlases: use Sprite2D with AtlasTexture (set region manually)",
        "Animation: configure frame rate and loop in SpriteFrames editor",
      ],
      gotchas: [
        "AnimatedSprite2D uses SpriteFrames resource — create one in Inspector",
        "Don't confuse AnimatedSprite2D (frame-based) with AnimationPlayer (keyframe-based)",
        "Aseprite plugin (aseprite-wizard) auto-imports .ase files with tags as animations",
      ],
    },
    phaser: {
      naming: "kebab-case: `player-walk.png`. Uniform grid layout.",
      exportSettings: "PNG spritesheet with uniform frame size. Or use TexturePacker JSON Hash format.",
      importSteps: [
        "Grid: this.load.spritesheet('player-walk', '/assets/sprites/player-walk.png', { frameWidth: 32, frameHeight: 32 })",
        "Atlas: this.load.atlas('player', '/assets/sprites/player.png', '/assets/sprites/player.json')",
        "Create animation: this.anims.create({ key: 'walk', frames: this.anims.generateFrameNumbers('player-walk', { start: 0, end: 3 }), frameRate: 10, repeat: -1 })",
        "Play: sprite.play('walk')",
      ],
      gotchas: [
        "frameWidth/frameHeight must exactly match your sprite grid — off by 1px breaks everything",
        "TexturePacker JSON Hash format is preferred for complex sheets (packed, trimmed)",
        "Animations are global — define once, play on any sprite with that texture",
      ],
    },
  },
  audio: {
    monogame: {
      naming: "PascalCase: `JumpSFX.wav`, `BattleTheme.ogg`. Store in `Content/audio/`.",
      exportSettings: "SFX: WAV 44.1kHz 16-bit (no compression, low latency). Music: OGG Vorbis (smaller file, streaming).",
      importSteps: [
        "Add to Content.mgcb via MGCB Editor",
        "WAV: Importer = WAV, Processor = Sound Effect",
        "OGG: Importer = OGG, Processor = Song (for streaming music)",
        "SFX: Content.Load<SoundEffect>(\"audio/JumpSFX\").Play()",
        "Music: MediaPlayer.Play(Content.Load<Song>(\"audio/BattleTheme\"))",
      ],
      gotchas: [
        "SoundEffect vs Song: SoundEffect loads entirely into memory (for SFX), Song streams (for music)",
        "MediaPlayer is global — only one Song plays at a time",
        "OGG support varies by platform — WAV is safest for SFX",
        "Volume: SoundEffect.Play(volume, pitch, pan) — volume is 0.0 to 1.0",
      ],
    },
    godot: {
      naming: "snake_case: `jump.wav`, `battle_theme.ogg`. Store in `assets/audio/`.",
      exportSettings: "SFX: WAV 44.1kHz 16-bit (Godot keeps in memory). Music: OGG Vorbis (Godot streams).",
      importSteps: [
        "Drop audio files into assets/audio/ — Godot auto-imports",
        "WAV import settings: Loop = false (for SFX), Force Mono = true if not spatial",
        "OGG import settings: Loop = true (for music), set loop offset if needed",
        "Play via AudioStreamPlayer (2D or 3D): $AudioPlayer.play()",
      ],
      gotchas: [
        "WAV files are imported uncompressed — keep SFX short to save memory",
        "OGG loop: set loop flag in the Import dock, not in code",
        "Use AudioBus for volume groups (Master, SFX, Music) — configure in Audio tab",
        "Positional audio: use AudioStreamPlayer2D, not AudioStreamPlayer",
      ],
    },
    phaser: {
      naming: "kebab-case: `jump.wav`, `battle-theme.ogg`. Store in `public/assets/audio/`.",
      exportSettings: "OGG Vorbis preferred (web-native). MP3 as fallback. WAV for very short SFX only.",
      importSteps: [
        "Load: this.load.audio('jump', '/assets/audio/jump.ogg')",
        "Provide fallbacks: this.load.audio('jump', ['/assets/audio/jump.ogg', '/assets/audio/jump.mp3'])",
        "Play SFX: this.sound.play('jump')",
        "Music: const music = this.sound.add('battle-theme', { loop: true }); music.play()",
      ],
      gotchas: [
        "Browsers block audio until user interaction — use this.sound.unlock() or start on click",
        "OGG not supported in Safari — always provide MP3 fallback",
        "Keep total audio under 10MB for web games — compress aggressively",
        "Volume: this.sound.play('jump', { volume: 0.5 })",
      ],
    },
  },
  tilemap: {
    monogame: {
      naming: "PascalCase: `WorldTileset.png`, `Level01.tmx`. Store in `Content/maps/`.",
      exportSettings: "Tileset: PNG with consistent tile size, no margin (or consistent margin). Map: Tiled JSON format (.tmj) or TMX.",
      importSteps: [
        "Create tileset and map in Tiled (mapeditor.org)",
        "Export map as JSON (.tmj) — easier to parse than TMX",
        "Add tileset PNG to Content.mgcb as texture",
        "Add .tmj as Copy (not Build) in Content.mgcb — parse at runtime",
        "Parse JSON with System.Text.Json, render tiles with source rectangles",
      ],
      gotchas: [
        "Tile IDs in Tiled are 1-based (0 = empty) — subtract 1 for source rect calculation",
        "MonoGame.Extended has TiledMapLoader but it's heavy — consider manual JSON parsing for simple maps",
        "Tileset padding: if you see lines between tiles, add 1px extrude in Tiled tileset settings",
      ],
    },
    godot: {
      naming: "snake_case: `world_tileset.png`, `level_01.tscn`. Store in `assets/tilesets/`.",
      exportSettings: "Tileset: PNG with consistent tile size. Godot's TileSet editor handles slicing.",
      importSteps: [
        "Create TileMap node in scene, create new TileSet in Inspector",
        "In TileSet editor: add source texture, set tile size",
        "Paint tiles directly in the 2D editor with the TileMap selected",
        "For collision: add Physics Layer in TileSet, paint collision shapes per tile",
        "For navigation: add Navigation Layer in TileSet, paint nav polygons",
      ],
      gotchas: [
        "Tile size in TileSet must match your sprite sheet grid exactly",
        "Use Terrain Sets for auto-tiling (huge time saver)",
        "Y-Sort on TileMap: enable for correct depth sorting with characters",
        "Tiled import: use Tiled plugin (tiled-importer) if you prefer Tiled's editor",
      ],
    },
    phaser: {
      naming: "kebab-case: `world-tileset.png`, `level-01.json`. Store in `public/assets/maps/`.",
      exportSettings: "Tileset: PNG. Map: Tiled JSON format (.json). Embed tilesets or use separate image.",
      importSteps: [
        "Create map in Tiled, export as JSON",
        "Load: this.load.tilemapTiledJSON('level1', '/assets/maps/level-01.json')",
        "Load tileset image: this.load.image('tiles', '/assets/tilesets/world-tileset.png')",
        "Create: const map = this.make.tilemap({ key: 'level1' }); const tileset = map.addTilesetImage('tilesetName', 'tiles')",
        "Create layers: const ground = map.createLayer('Ground', tileset)",
        "Collision: ground.setCollisionByProperty({ collides: true })",
      ],
      gotchas: [
        "Tileset name in addTilesetImage must match the name in Tiled (not the filename)",
        "Set collision before adding physics collider: this.physics.add.collider(player, ground)",
        "Layer names are case-sensitive — must match Tiled layer names exactly",
      ],
    },
  },
  font: {
    monogame: {
      naming: "PascalCase: `MainFont.spritefont` or `MainFont.ttf`. Store in `Content/fonts/`.",
      exportSettings: "Option A: .spritefont XML for Content Pipeline (bitmap font). Option B: .ttf for FontStashSharp (runtime).",
      importSteps: [
        "SpriteFont: create .spritefont XML, add to Content.mgcb, set Processor: SpriteFont",
        "Load: Content.Load<SpriteFont>(\"fonts/MainFont\")",
        "Draw: spriteBatch.DrawString(font, \"Hello\", position, Color.White)",
        "FontStashSharp (recommended): add NuGet package, load .ttf at runtime",
        "FontStashSharp: var fontSystem = new FontSystem(); fontSystem.AddFont(File.ReadAllBytes(\"font.ttf\"))",
      ],
      gotchas: [
        "SpriteFont only supports pre-defined character ranges — missing chars render as ?",
        "FontStashSharp is more flexible: runtime size, effects, Unicode support",
        "Font size in .spritefont is baked at build time — need different .spritefont per size",
      ],
    },
    godot: {
      naming: "snake_case: `main_font.ttf`. Store in `assets/fonts/`.",
      exportSettings: "TTF or OTF. Godot handles rasterization at runtime.",
      importSteps: [
        "Drop .ttf/.otf into assets/fonts/ — Godot auto-imports",
        "Use in Label: drag font to Label's Theme Overrides > Fonts > Font",
        "Or create a Theme resource with font settings for consistent styling",
        "Dynamic sizing: set font size in Inspector or via code: label.add_theme_font_size_override(\"font_size\", 24)",
      ],
      gotchas: [
        "Default font is small — always set font_size in theme or per-label",
        "Pixel art font: set antialiasing to None in import settings",
        "SystemFont fallback: Godot can use system fonts but they're not portable",
      ],
    },
    phaser: {
      naming: "kebab-case: `main-font.ttf` or `main-font.png` (bitmap). Store in `public/assets/fonts/`.",
      exportSettings: "Web font: WOFF2 preferred. Bitmap font: use BMFont format (XML + PNG).",
      importSteps: [
        "CSS Web Font: load via CSS @font-face, then use in Phaser text objects",
        "Bitmap Font: this.load.bitmapFont('pixelfont', '/assets/fonts/pixelfont.png', '/assets/fonts/pixelfont.xml')",
        "Web Font text: this.add.text(x, y, 'Hello', { fontFamily: 'MyFont', fontSize: '24px' })",
        "Bitmap text: this.add.bitmapText(x, y, 'pixelfont', 'Hello', 16)",
      ],
      gotchas: [
        "Web fonts may not be loaded when create() runs — use WebFontLoader or delay",
        "Bitmap fonts are faster than web fonts for many text updates (score counters)",
        "Text objects are expensive — cache and reuse, don't create new ones each frame",
      ],
    },
  },
  particle: {
    monogame: {
      naming: "PascalCase: `SparkParticle.png`. Store in `Content/particles/`. Usually a small white circle or square.",
      exportSettings: "Small PNG (4x4 to 16x16). White on transparent — tint with color at runtime.",
      importSteps: [
        "Add particle texture to Content.mgcb as regular texture",
        "Use MonoGame.Extended ParticleEffect for full-featured particles",
        "Or implement simple particle system: array of structs with position, velocity, lifetime, color",
        "Draw particles with additive blending for glow effects: SpriteBatch.Begin(blendState: BlendState.Additive)",
      ],
      gotchas: [
        "Object pool particles — never allocate/GC in update loop",
        "Additive blending makes particles glow but invisible on white backgrounds",
        "Keep particle count under 1000 for mobile targets",
      ],
    },
    godot: {
      naming: "snake_case: `spark.png`. Store in `assets/particles/`.",
      exportSettings: "Small PNG (4x4 to 16x16). White on transparent (tint in ParticleProcessMaterial).",
      importSteps: [
        "Create GPUParticles2D node (GPU-accelerated) or CPUParticles2D (simpler, CPU-based)",
        "Set Process Material to new ParticleProcessMaterial",
        "Configure in Inspector: emission shape, velocity, gravity, color gradient, lifetime",
        "Set texture in Draw section of GPUParticles2D",
      ],
      gotchas: [
        "GPUParticles2D needs GLES3 — use CPUParticles2D for compatibility target",
        "One-shot particles: set OneShot = true, Emitting = false, then trigger with emitting = true",
        "Particles don't emit in editor by default — check Emitting checkbox to preview",
      ],
    },
    phaser: {
      naming: "kebab-case: `spark.png`. Store in `public/assets/particles/`.",
      exportSettings: "Small PNG (4x4 to 16x16). White on transparent.",
      importSteps: [
        "Load: this.load.image('spark', '/assets/particles/spark.png')",
        "Create emitter: const particles = this.add.particles(x, y, 'spark', { speed: 100, lifespan: 500, quantity: 5 })",
        "Configure: scale, alpha, tint, gravity, angle, frequency",
        "One-shot: particles.explode(20) — emits 20 particles once",
      ],
      gotchas: [
        "Phaser 3.60+ changed particle API — use this.add.particles(x, y, key, config)",
        "Set blendMode: 'ADD' for glow effects",
        "Particle count: keep under 500 for mobile web targets",
      ],
    },
  },
};

// Source tool tips
const SOURCE_TOOLS: Record<string, SourceToolTips> = {
  aseprite: {
    exportTips: [
      "Export Spritesheet: File > Export Sprite Sheet > JSON Array + PNG",
      "Set Sheet Type: Packed or By Rows",
      "Enable Trim Cels for smaller file size (use with caution for grid-based engines)",
      "Tags become animation names — name your frame tags carefully",
      "Export scale: 100% for pixel art (never scale up in Aseprite)",
    ],
    bestFormat: "PNG spritesheet + JSON descriptor",
  },
  photoshop: {
    exportTips: [
      "Export As: PNG-24 with transparency",
      "Use Export > Layers to Files for batch export",
      "Spritesheet: arrange frames in grid manually or use PS spritesheet scripts",
      "Color profile: sRGB for game assets (not CMYK or Adobe RGB)",
    ],
    bestFormat: "PNG-24 with transparency",
  },
  gimp: {
    exportTips: [
      "Export As: PNG with alpha channel",
      "Flatten visible layers before export (or use File > Export Layers)",
      "For spritesheets: use GIMP spritesheet plugin or arrange frames manually",
      "Color mode: RGB (Image > Mode > RGB)",
    ],
    bestFormat: "PNG with alpha channel",
  },
  audacity: {
    exportTips: [
      "SFX: Export as WAV (44100 Hz, 16-bit PCM) for maximum compatibility",
      "Music: Export as OGG Vorbis (quality 5-7) for good compression",
      "Normalize audio: Effect > Normalize > -1.0 dB (prevents clipping)",
      "Trim silence: select empty region > Edit > Delete",
      "Mono for SFX: Tracks > Mix > Mix Stereo Down to Mono",
    ],
    bestFormat: "WAV for SFX, OGG for music",
  },
  tiled: {
    exportTips: [
      "Export as JSON (.tmj or .json) — easiest to parse in all engines",
      "Embed tilesets in map OR export separately (depends on engine loader)",
      "Set tile size in Map Properties before starting — changing later is painful",
      "Use Object Layers for spawn points, triggers, and metadata",
      "Add custom properties to tiles (collides: true) for collision setup",
    ],
    bestFormat: "Tiled JSON format",
  },
  blender: {
    exportTips: [
      "For 2D sprites: render orthographic camera, export PNG sequence",
      "For 3D assets: export as glTF 2.0 (.glb) — most game engines support it",
      "Apply transforms before export: Ctrl+A > All Transforms",
      "Scale: set unit scale to match your engine (MonoGame: 1 unit = 1 pixel, Godot: 1 unit = 1 meter)",
    ],
    bestFormat: "glTF 2.0 (.glb) for 3D, PNG for rendered 2D sprites",
  },
};

const ASSET_TYPES = Object.keys(ASSET_GUIDES);
const CURATED_ENGINES = ["monogame", "godot", "phaser"];

/**
 * asset_guide — Asset pipeline helper for game developers.
 * Returns naming conventions, export settings, engine import steps, and gotchas.
 */
export function handleAssetGuide(args: {
  assetType: string;
  engine: string;
  sourceTool?: string;
}): ToolResult {
  const assetType = args.assetType.toLowerCase().trim().replace(/s$/, ""); // strip trailing 's'
  const resolvedEngine = resolveEngineKey(args.engine);

  // Normalize asset type aliases
  const typeAliases: Record<string, string> = {
    sprite: "sprite",
    image: "sprite",
    texture: "sprite",
    spritesheet: "spritesheet",
    "sprite sheet": "spritesheet",
    animation: "spritesheet",
    audio: "audio",
    sound: "audio",
    music: "audio",
    sfx: "audio",
    tilemap: "tilemap",
    "tile map": "tilemap",
    tileset: "tilemap",
    map: "tilemap",
    font: "font",
    text: "font",
    typeface: "font",
    particle: "particle",
    effect: "particle",
    vfx: "particle",
    fx: "particle",
  };

  const resolvedType = typeAliases[assetType] || assetType;

  // Check if asset type is valid
  if (!ASSET_GUIDES[resolvedType]) {
    return {
      content: [{
        type: "text",
        text: `No guide for asset type "${args.assetType}".\n\nSupported types: ${ASSET_TYPES.join(", ")}\n\nAliases: image/texture → sprite, sound/music/sfx → audio, map/tileset → tilemap, effect/vfx → particle`,
      }],
    };
  }

  // Resolve engine — graceful fallback for non-curated engines
  const engineForGuide = resolvedEngine && CURATED_ENGINES.includes(resolvedEngine) ? resolvedEngine : null;
  const guide = engineForGuide ? ASSET_GUIDES[resolvedType]?.[engineForGuide] : null;
  const engineLabel = resolvedEngine ? getEngineLabel(resolvedEngine) : args.engine;

  if (!guide) {
    return {
      content: [{
        type: "text",
        text: `# Asset Guide: ${resolvedType} → ${engineLabel}\n\n` +
          `No engine-specific asset guide for ${engineLabel} yet.\n\n` +
          `**Detailed guides available for:** MonoGame, Godot, Phaser\n\n` +
          `## General ${resolvedType} Tips\n\n` +
          `- **Sprites/textures:** PNG, 32-bit RGBA, transparent background\n` +
          `- **Audio SFX:** WAV 44.1kHz 16-bit for low latency\n` +
          `- **Audio music:** OGG Vorbis for streaming/compression\n` +
          `- **Tilemaps:** Use Tiled editor, export as JSON\n` +
          `- **Fonts:** TTF/OTF for runtime rendering, bitmap fonts for performance\n` +
          `- Name assets consistently using your engine's convention\n` +
          `- Keep textures power-of-2 for GPU efficiency\n\n` +
          `_Use \`docs(action: "search", query: "${resolvedType} asset pipeline", engine: "${args.engine}")\` to find engine-specific docs._`,
      }],
    };
  }

  let output = `# Asset Guide: ${resolvedType} → ${engineLabel}\n\n`;

  // Naming
  output += `## Naming Convention\n\n${guide.naming}\n\n`;

  // Export settings
  output += `## Export Settings\n\n${guide.exportSettings}\n\n`;

  // Source tool tips
  if (args.sourceTool) {
    const toolKey = args.sourceTool.toLowerCase().trim();
    const toolTips = SOURCE_TOOLS[toolKey];
    if (toolTips) {
      output += `## ${args.sourceTool} Tips\n\n`;
      output += `**Best format:** ${toolTips.bestFormat}\n\n`;
      for (const tip of toolTips.exportTips) {
        output += `- ${tip}\n`;
      }
      output += `\n`;
    } else {
      output += `_No specific tips for "${args.sourceTool}". Supported tools: ${Object.keys(SOURCE_TOOLS).join(", ")}_\n\n`;
    }
  }

  // Import steps
  output += `## Import Steps (${engineLabel})\n\n`;
  for (let i = 0; i < guide.importSteps.length; i++) {
    output += `${i + 1}. ${guide.importSteps[i]}\n`;
  }

  // Gotchas
  output += `\n## Gotchas\n\n`;
  for (const gotcha of guide.gotchas) {
    output += `- ${gotcha}\n`;
  }

  // Available source tools
  if (!args.sourceTool) {
    output += `\n---\n_Add \`sourceTool\` parameter for tool-specific export tips. Supported: ${Object.keys(SOURCE_TOOLS).join(", ")}_\n`;
  }

  return { content: [{ type: "text", text: output }] };
}
