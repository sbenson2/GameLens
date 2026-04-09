# G7 — Animation and Sprite Customization in RPG Maker MZ

> **Category:** guide · **Engine:** RPG Maker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Plugin Development](G1_plugin_development.md) · [R3 Rendering Pipeline](../reference/R3_rendering_pipeline.md)

---

RPG Maker MZ renders everything through a sprite class hierarchy built on top of **PIXI.js**. Understanding how sprites, animations, and spritesheets work — both from the editor and the JavaScript layer — unlocks deep visual customization for your game. This guide covers the spritesheet format, the Sprite class hierarchy, the animation database, battle animations, and how plugins can extend the system.

---

## Spritesheet Format Conventions

RPG Maker MZ expects character and battler sprites in specific sheet layouts. Getting these right is the first step to custom graphics.

### Character Spritesheets (Map Characters)

Character sheets are used for the player, NPCs, and events on the map.

**Standard sheet (8 characters):**
```
┌──────┬──────┬──────┬──────┐
│ Char1│ Char2│ Char3│ Char4│
├──────┼──────┼──────┼──────┤
│ Char5│ Char6│ Char7│ Char8│
└──────┴──────┴──────┴──────┘
```

Each character occupies a **3 columns × 4 rows** grid of frames:

```
┌─────┬─────┬─────┐
│Down1│Down2│Down3│  ← Facing down (toward camera)
├─────┼─────┼─────┤
│Left1│Left2│Left3│  ← Facing left
├─────┼─────┼─────┤
│Rght1│Rght2│Rght3│  ← Facing right
├─────┼─────┼─────┤
│ Up1 │ Up2 │ Up3 │  ← Facing up (away from camera)
└─────┴─────┴─────┘
```

- **Standard tile size:** 48×48 pixels per frame.
- A standard 8-character sheet is **576×384** pixels (12 columns × 8 rows of 48px frames).
- The middle column (frame 2) is the standing/idle pose. Frames 1 and 3 are walk cycle frames.

### Filename Prefixes

| Prefix | Effect |
|--------|--------|
| `$` | Single-character sheet (3×4 frames, one character only) |
| `!` | Cancels the automatic 6-pixel vertical offset (used for doors, objects) |
| `!$` | Both: single character, no offset |

**Example:** `$Actor1.png` is a single-character sheet. `!Door1.png` is an object sheet with no vertical offset.

### Side-View Battler Spritesheets

For side-view battles, battlers use a **9 columns × 6 rows** grid:

```
Row 0: Walk (3 frames) × 3 motion types
Row 1: Wait/Idle (3 frames) × 3 motion types
Row 2: Chant (3 frames) × 3 motion types
Row 3: Guard/Damage/Evade motions
Row 4: Thrust/Swing/Missile motions
Row 5: Skill/Spell/Item motions
```

Each frame is **64×64 pixels** by default, making the full sheet **576×384** pixels.

The motions are indexed 0–17:

| Index | Motion | Index | Motion |
|-------|--------|-------|--------|
| 0 | Walk | 9 | Thrust |
| 1 | Wait | 10 | Swing |
| 2 | Chant | 11 | Missile |
| 3 | Guard | 12 | Skill |
| 4 | Damage | 13 | Spell |
| 5 | Evade | 14 | Item |
| 6 | Thrust | 15 | Escape |
| 7 | Swing | 16 | Victory |
| 8 | Missile | 17 | Dying |

---

## Sprite Class Hierarchy

RPG Maker MZ's sprite system is a chain of classes extending PIXI.Sprite:

```
PIXI.Sprite
  └── Sprite (rmmz core)
        ├── Sprite_Clickable
        │     └── Sprite_Battler
        │           ├── Sprite_Actor
        │           └── Sprite_Enemy
        ├── Sprite_Character
        ├── Sprite_Animation
        ├── Sprite_AnimationMV
        ├── Sprite_Damage
        ├── Sprite_StateOverlay
        ├── Sprite_Weapon
        ├── Sprite_Balloon
        ├── Sprite_Picture
        ├── Sprite_Timer
        └── Sprite_Destination
```

### Core Sprite Class

The base `Sprite` class (defined in `rmmz_core.js`) extends PIXI.Sprite with RPG Maker-specific features:

| Property | Type | Description |
|----------|------|-------------|
| `bitmap` | Bitmap | The image rendered by this sprite |
| `opacity` | Number | Transparency (0 = invisible, 255 = fully opaque) |
| `blendMode` | Number | PIXI blend mode (0 = Normal, 1 = Additive, 2 = Multiply) |
| `_frame` | Rectangle | Which portion of the bitmap to display (source rectangle) |
| `_hue` | Number | Hue rotation in degrees (0–360) |
| `_blendColor` | Array | RGBA blend color overlay |
| `_colorTone` | Array | RGBA color tone adjustment |

**Key methods:**

```javascript
// Set which part of the bitmap to show
sprite.setFrame(x, y, width, height);

// Update runs every frame — override in subclasses for animation
sprite.update();

// Destroy and clean up
sprite.destroy();
```

### Sprite_Character

`Sprite_Character` renders map characters (player, NPCs, events). It reads from a `Game_CharacterBase` data object to determine which frame to display.

**How it selects the current frame:**

```javascript
// Called each frame in update()
Sprite_Character.prototype.updateCharacterFrame = function() {
    const pw = this.patternWidth();   // single frame width
    const ph = this.patternHeight();  // single frame height
    const sx = (this.characterBlockX() + this.characterPatternX()) * pw;
    const sy = (this.characterBlockY() + this.characterPatternY()) * ph;
    this.setFrame(sx, sy, pw, ph);
};
```

- `characterBlockX/Y` — which character in the sheet (0–3 for X, 0–1 for Y on standard sheets)
- `characterPatternX` — walk frame (0, 1, or 2)
- `characterPatternY` — direction (0=down, 1=left, 2=right, 3=up)

### Sprite_Battler / Sprite_Actor / Sprite_Enemy

`Sprite_Battler` is the base for all battle sprites. `Sprite_Actor` handles side-view actors, `Sprite_Enemy` handles front-view/side-view enemies.

**Sprite_Actor motion system:**

```javascript
// Start a motion by name
Sprite_Actor.prototype.startMotion = function(motionType) {
    const newMotion = Sprite_Actor.MOTIONS[motionType];
    // Sets _motionType, resets _motionCount and _pattern
};

// MOTIONS lookup table
Sprite_Actor.MOTIONS = {
    walk:    { index: 0, loop: true },
    wait:    { index: 1, loop: true },
    chant:   { index: 2, loop: true },
    guard:   { index: 3, loop: true },
    damage:  { index: 4, loop: false },
    evade:   { index: 5, loop: false },
    thrust:  { index: 6, loop: false },
    swing:   { index: 7, loop: false },
    missile: { index: 8, loop: false },
    skill:   { index: 9, loop: false },
    spell:   { index: 10, loop: false },
    item:    { index: 11, loop: false },
    escape:  { index: 12, loop: true },
    victory: { index: 13, loop: true },
    dying:   { index: 14, loop: true },
    // ... etc.
};
```

---

## Database Animations

RPG Maker MZ uses **Effekseer** for battle animations (replacing the older MV cell-based system). Effekseer animations are particle-based 3D effects rendered in 2D.

### Animation Database Structure

Each animation entry in the database has:

| Field | Description |
|-------|-------------|
| Name | Display name |
| Effect file | `.efkefc` file from the `effects/` folder |
| Offset X/Y | Positional adjustment |
| Scale | Size multiplier |
| Speed | Playback speed multiplier |
| Flash timings | Screen/target flash at specific frames |
| Sound timings | Sound effects at specific frames |

### Playing Animations from Events

```
Event Command: Show Animation
  Target: This Event / Player / Event ID
  Animation: [select from database]
  Wait for Completion: Yes/No
```

### Playing Animations from Plugins

```javascript
// Show animation on a character
$gamePlayer.requestAnimation(animationId);

// Show animation on a battler in battle
battler.startAnimation(animationId, mirror, delay);
```

### MV-Compatible Animations

RPG Maker MZ also supports legacy MV-style cell animations via `Sprite_AnimationMV`. These use traditional spritesheet-based frame-by-frame animation with the older cell grid system. MV animations are automatically detected and rendered with the MV renderer.

---

## Plugin Customization Patterns

### Adding Custom Motions to Battlers

```javascript
// Plugin: Add a "cast" motion to actors
const _Sprite_Actor_MOTIONS = Sprite_Actor.MOTIONS;
Sprite_Actor.MOTIONS.cast = { index: 15, loop: false };

// You'll need a battler spritesheet with a 15th motion row
```

### Changing Character Walk Speed Animation

```javascript
// Override the animation speed calculation
const _original_animationWait = Game_CharacterBase.prototype.animationWait;
Game_CharacterBase.prototype.animationWait = function() {
    // Faster animation at higher speeds
    return Math.max(4, 12 - this.realMoveSpeed() * 2);
};
```

### Adding PIXI Filters to Sprites

RPG Maker MZ's sprites are PIXI sprites, so PIXI filters work directly:

```javascript
// Add a glow effect to the player sprite on the map
const playerSprite = SceneManager._scene._spriteset._characterSprites
    .find(s => s._character === $gamePlayer);

if (playerSprite) {
    // Requires PIXI filter import (e.g., @pixi/filter-glow)
    const glowFilter = new PIXI.filters.GlowFilter({
        distance: 15,
        outerStrength: 2,
        color: 0x00ff88
    });
    playerSprite.filters = [glowFilter];
}
```

**Note:** PIXI filter availability depends on the PIXI version bundled with MZ. Always test filter compatibility. Community plugins like "CGMZ Pixi Filters" provide pre-packaged filter integrations.

### Custom Sprite Class Example

```javascript
// Create a custom floating damage number sprite
function Sprite_FloatingText() {
    this.initialize(...arguments);
}

Sprite_FloatingText.prototype = Object.create(Sprite.prototype);
Sprite_FloatingText.prototype.constructor = Sprite_FloatingText;

Sprite_FloatingText.prototype.initialize = function(text, x, y) {
    Sprite.prototype.initialize.call(this);
    this.bitmap = new Bitmap(200, 48);
    this.bitmap.fontSize = 28;
    this.bitmap.textColor = "#ffdd44";
    this.bitmap.drawText(text, 0, 0, 200, 48, "center");
    this.x = x;
    this.y = y;
    this._floatSpeed = 2;
    this._duration = 60; // frames
};

Sprite_FloatingText.prototype.update = function() {
    Sprite.prototype.update.call(this);
    this.y -= this._floatSpeed;
    this.opacity -= 255 / this._duration;
    this._duration--;
    if (this._duration <= 0) {
        this.parent.removeChild(this);
        this.destroy();
    }
};
```

---

## Spritesheet Creation Tips

### Dimensions and Grid

| Asset Type | Frame Size | Sheet Grid | Total Size |
|-----------|------------|------------|------------|
| Character (standard) | 48×48 | 12×8 | 576×384 |
| Character (single `$`) | 48×48 | 3×4 | 144×192 |
| SV Battler | 64×64 | 9×6 | 576×384 |
| Tileset | 48×48 | Varies | Varies |

### Custom Frame Sizes

RPG Maker auto-calculates frame size from the sheet dimensions:

- **Standard sheets:** Frame width = sheet width / 12, frame height = sheet height / 8
- **Single `$` sheets:** Frame width = sheet width / 3, frame height = sheet height / 4

This means you can use larger sprites by making proportionally larger sheets. A 96×96 single-character sheet would be **288×384** pixels.

### Character Vertical Offset

Characters are drawn 6 pixels higher than their actual position (to overlap with tiles below them, creating depth). The `!` prefix disables this offset — use it for objects like doors, treasure chests, and signs that should sit flat on the ground.

---

## Common Pitfalls

| Problem | Cause | Solution |
|---------|-------|----------|
| Character sprite shows wrong frame | Sheet layout doesn't match the 3×4 grid per character | Verify the sheet follows the exact column/row layout |
| Single-character sheet shows tiled | Missing `$` prefix in filename | Rename to `$CharacterName.png` |
| Object sprite floats above ground | Default 6px vertical offset | Add `!` prefix to filename |
| SV Battler has wrong motion | Motion index doesn't match spritesheet row | Cross-reference the motion index table |
| Effekseer animation doesn't play | Missing `.efkefc` file or wrong path | Place effects in `effects/` directory |
| PIXI filter crashes | Incompatible filter version for bundled PIXI | Use filters compatible with PIXI.js v5 (MZ's bundled version) |
| Plugin sprite not rendering | Not added to the correct scene container | Add to `_spriteset` or appropriate scene child |

---

## Next Steps

- **[G1 Plugin Development](G1_plugin_development.md)** — Write plugins that extend sprite behavior
- **[R3 Rendering Pipeline](../reference/R3_rendering_pipeline.md)** — How PIXI.js renders scenes in MZ
- **[G3 Scene and Window System](G3_scene_and_window_system.md)** — The scene hierarchy that hosts sprites
- **[R2 Battle System Customization](../reference/R2_battle_system_customization.md)** — Customize battle visuals and battler behavior
