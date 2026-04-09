# G12 — PixiJS v8 Text & Typography

> **Category:** guide · **Engine:** PixiJS · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G8 UI & HUD](G8_ui_and_hud.md) · [G10 Performance Optimization](G10_performance_optimization.md)

---

## Overview

Text is everywhere in games — score counters, dialogue boxes, menus, damage numbers, tutorials. PixiJS v8 provides three text renderers, each with different trade-offs for quality, performance, and formatting flexibility. Choosing the right one is a real architectural decision that affects both how your game looks and how it performs.

This guide covers the three text types (`Text`, `BitmapText`, `HTMLText`), when to use each, styling, tagged text for inline formatting, `SplitText` for per-character animation, and performance patterns for text-heavy games.

---

## The Three Text Types

### Text (Canvas-based)

The default text renderer. Uses an offscreen `<canvas>` to rasterize system or web fonts, then uploads the result as a GPU texture.

```typescript
import { Text, TextStyle } from 'pixi.js';

const style = new TextStyle({
  fontFamily: 'Arial',
  fontSize: 24,
  fill: '#ffffff',
  stroke: { color: '#000000', width: 4 },
  dropShadow: {
    color: '#000000',
    blur: 4,
    angle: Math.PI / 6,
    distance: 6
  },
  wordWrap: true,
  wordWrapWidth: 300
});

const label = new Text({ text: 'Hello, World!', style });
app.stage.addChild(label);
```

**When to use:** General-purpose text, dialogue, menus — anywhere text changes infrequently and you need rich styling (gradients, shadows, strokes).

**Trade-off:** Changing the text string re-rasterizes the canvas texture and re-uploads to the GPU. Frequent changes (e.g., a score updating every frame) will hurt performance.

---

### BitmapText

Uses a pre-baked bitmap font atlas where each glyph is a sprite region. No canvas rasterization — the GPU renders glyphs directly from the texture.

```typescript
import { BitmapText, BitmapFont } from 'pixi.js';

// Install a bitmap font from a .fnt + atlas (loaded via Assets)
await Assets.load('fonts/gameFont.fnt');

const score = new BitmapText({
  text: 'Score: 0',
  style: {
    fontFamily: 'gameFont',
    fontSize: 32,
    tint: 0xffd700
  }
});
app.stage.addChild(score);

// Updating text is very cheap — no re-rasterization
score.text = `Score: ${currentScore}`;
```

**v8 enhancement:** BitmapFonts can now be generated on-the-fly from any installed system/web font. Glyphs are added dynamically as needed, so you don't have to pre-generate every character:

```typescript
// Auto-generate a bitmap font from a system font
BitmapFont.install({
  name: 'DynamicFont',
  style: {
    fontFamily: 'Arial',
    fontSize: 28,
    fill: 'white'
  }
});

const dynamicText = new BitmapText({
  text: 'Generated on the fly!',
  style: { fontFamily: 'DynamicFont', fontSize: 28 }
});
```

**When to use:** Score counters, HUDs, damage numbers, any text that updates frequently or appears in large quantities. Best performance of all three types.

**Trade-off:** Limited styling compared to `Text` — no gradients, no drop shadows, no stroke effects (unless baked into the font atlas).

---

### HTMLText

Renders actual HTML/CSS markup into your PixiJS scene by converting it to an SVG foreignObject, then rasterizing to a texture.

```typescript
import { HTMLText } from 'pixi.js';

const richText = new HTMLText({
  text: '<b>Bold</b>, <i>italic</i>, and <span style="color: red;">coloured</span> text.',
  style: {
    fontFamily: 'Arial',
    fontSize: 20,
    fill: '#ffffff',
    wordWrap: true,
    wordWrapWidth: 400
  }
});
app.stage.addChild(richText);
```

**When to use:** Rich formatted text with inline styling, links, or complex layouts that would be painful to build with multiple `Text` objects.

**Trade-off:** Slowest of the three — involves SVG serialization and rasterization. Not suitable for text that changes every frame.

---

## Quick Comparison

| Feature | Text | BitmapText | HTMLText |
|---------|------|-----------|----------|
| Update cost | High (re-rasterize) | Low (reposition glyphs) | Highest (SVG round-trip) |
| Styling | Rich (stroke, shadow, gradient) | Basic (tint, size) | Richest (full CSS) |
| Inline formatting | Via tagged text (v8.16+) | Coming soon | Native HTML tags |
| Best for | Labels, dialogue, menus | Scores, HUDs, counters | Rich descriptions, credits |
| Word wrap | Yes | Yes (v8 improved) | Yes |
| Dynamic fonts | System/web fonts | Auto-generate or pre-baked | System/web fonts |

**Rule of thumb:** Start with `BitmapText` for anything that changes. Use `Text` for static labels. Use `HTMLText` only when you need real CSS formatting.

---

## Text Styling in Depth

### TextStyle Properties

All three text types share a common `TextStyle` base, though not every property applies to every type:

```typescript
const style = new TextStyle({
  // Font
  fontFamily: 'Georgia, serif',
  fontSize: 24,
  fontStyle: 'italic',
  fontWeight: 'bold',

  // Colour
  fill: '#ff6600',                    // Solid colour
  // fill: ['#ff0000', '#00ff00'],    // Gradient (Text only)

  // Stroke
  stroke: { color: '#000000', width: 3 },

  // Shadow (Text only)
  dropShadow: {
    color: '#333333',
    blur: 2,
    angle: Math.PI / 4,
    distance: 4
  },

  // Layout
  align: 'center',                    // left | center | right | justify
  wordWrap: true,
  wordWrapWidth: 350,
  lineHeight: 30,
  letterSpacing: 2,

  // Whitespace handling (BitmapText v8+)
  whiteSpace: 'normal'               // normal | pre | nowrap | pre-line | pre-wrap
});
```

### Tinting BitmapText

Since BitmapText lacks full styling, use `tint` for colour and adjust `fontSize` to scale:

```typescript
const dmgNumber = new BitmapText({
  text: '-42',
  style: { fontFamily: 'gameFont', fontSize: 48 }
});
dmgNumber.tint = 0xff3333;    // Red damage
```

---

## Tagged Text — Inline Styles (v8.16+)

Tagged text lets you apply different styles to portions of a string using HTML-like tags, without creating multiple Text objects:

```typescript
import { Text, TextStyle } from 'pixi.js';

const style = new TextStyle({
  fontFamily: 'Arial',
  fontSize: 20,
  fill: '#ffffff',
  tagStyles: {
    dmg: { fill: '#ff4444', fontWeight: 'bold' },
    heal: { fill: '#44ff44', fontWeight: 'bold' },
    gold: { fill: '#ffd700' }
  }
});

const log = new Text({
  text: 'You dealt <dmg>25 damage</dmg> and received <heal>10 HP</heal>. Found <gold>50 gold</gold>!',
  style
});
app.stage.addChild(log);
```

**Supported text types:** `Text` and `HTMLText` (v8.16+). `BitmapText` support is planned.

This is ideal for combat logs, dialogue with speaker-coloured names, or any text where segments need distinct formatting.

---

## SplitText — Per-Character Animation (v8.11+)

`SplitText` breaks a string into individual character (or word/line) display objects while preserving layout. Each character is a separate `Text` — perfect for typewriter effects, wave animations, or letter-by-letter reveals:

```typescript
import { SplitText } from 'pixi.js';

const split = new SplitText({
  text: 'GAME OVER',
  style: {
    fontFamily: 'Impact',
    fontSize: 64,
    fill: '#ff0000'
  }
});
app.stage.addChild(split);

// Each character is accessible
split.chars.forEach((char, i) => {
  // Stagger a drop-in animation
  char.alpha = 0;
  char.y -= 30;

  // Use your preferred tween library
  gsap.to(char, {
    alpha: 1,
    y: char.y + 30,
    delay: i * 0.05,
    duration: 0.3,
    ease: 'bounce.out'
  });
});
```

### SplitText with Tag Styles (v8.17+)

SplitText respects `tagStyles`, so styled runs are split into per-character objects with individual styles preserved:

```typescript
const split = new SplitText({
  text: '<red>Fire</red> and <blue>Ice</blue>',
  style: {
    fontFamily: 'Arial',
    fontSize: 32,
    fill: '#ffffff',
    tagStyles: {
      red: { fill: '#ff4444' },
      blue: { fill: '#4488ff' }
    }
  }
});

// Each char of "Fire" is red, each char of "Ice" is blue
```

### Access Levels

```typescript
split.chars;     // Individual character Text objects
split.words;     // Word-level groups
split.lines;     // Line-level groups
```

**Performance note:** SplitText creates one display object per character. For long paragraphs this is expensive — use it for titles, short labels, and animated text only.

---

## Common Game Patterns

### Floating Damage Numbers

```typescript
function showDamage(x: number, y: number, amount: number, isCrit: boolean) {
  const dmg = new BitmapText({
    text: isCrit ? `${amount}!` : `${amount}`,
    style: {
      fontFamily: 'gameFont',
      fontSize: isCrit ? 40 : 28
    }
  });
  dmg.tint = isCrit ? 0xffdd00 : 0xff4444;
  dmg.anchor.set(0.5);
  dmg.position.set(x, y);
  app.stage.addChild(dmg);

  // Animate up and fade (using your tween library)
  gsap.to(dmg, { y: y - 60, alpha: 0, duration: 0.8, onComplete: () => dmg.destroy() });
}
```

### Typewriter Dialogue

```typescript
async function typewrite(container: Container, fullText: string, charDelay = 30) {
  const display = new Text({ text: '', style: dialogueStyle });
  container.addChild(display);

  for (let i = 0; i <= fullText.length; i++) {
    display.text = fullText.substring(0, i);
    await new Promise(r => setTimeout(r, charDelay));
  }
}
```

### Score Counter with Rolling Numbers

```typescript
class ScoreDisplay {
  private display: BitmapText;
  private current = 0;
  private target = 0;

  constructor(x: number, y: number) {
    this.display = new BitmapText({
      text: '0',
      style: { fontFamily: 'gameFont', fontSize: 36 }
    });
    this.display.position.set(x, y);
  }

  setScore(value: number) {
    this.target = value;
  }

  update(dt: number) {
    if (this.current !== this.target) {
      const diff = this.target - this.current;
      this.current += Math.sign(diff) * Math.min(Math.abs(diff), 100 * dt);
      this.current = Math.round(this.current);
      this.display.text = this.current.toLocaleString();
    }
  }
}
```

---

## Loading Custom Fonts

### Web Fonts (for Text / HTMLText)

Ensure the font is loaded *before* creating text, or the first render will use a fallback:

```typescript
// Load via CSS @font-face (in your HTML or a <style> tag)
// Then wait for it with the FontFace API:
await document.fonts.load('16px "MyGameFont"');

// Or use PixiJS Assets to load a font file:
await Assets.load({ alias: 'MyFont', src: 'fonts/MyFont.woff2' });

const label = new Text({
  text: 'Custom Font',
  style: { fontFamily: 'MyGameFont', fontSize: 24 }
});
```

### Bitmap Fonts (for BitmapText)

Load `.fnt` files (BMFont format) via Assets:

```typescript
await Assets.load('fonts/pixelFont.fnt');

const text = new BitmapText({
  text: 'Pixel Perfect',
  style: { fontFamily: 'pixelFont', fontSize: 16 }
});
```

Tools for generating `.fnt` files: **BMFont** (AngelCode), **Hiero** (libGDX), **msdf-bmfont-xml** (MSDF generation), **Littera** (web-based).

---

## Performance Tips

1. **Use BitmapText for anything that updates frequently.** Score, timer, FPS counter — always BitmapText.
2. **Batch bitmap text.** Multiple BitmapText objects using the same font atlas batch into a single draw call.
3. **Avoid changing Text style properties at runtime.** Each change triggers a full re-rasterization. If you need to toggle bold/colour, use tagged text or swap between pre-styled objects.
4. **Pool damage numbers.** Instead of creating and destroying BitmapText every hit, maintain a pool and recycle.
5. **Cache static Text.** For text that never changes (title screen, labels), set `cacheAsTexture(true)` to avoid repeated canvas renders.
6. **Limit HTMLText usage.** Reserve it for settings screens, credits, or other low-update contexts.
7. **SplitText sparingly.** One display object per character adds up fast. Keep it for short animated strings (≤20 characters is a good guideline).

---

## Framework Comparison

| Concept | PixiJS | Phaser | Kaplay | Excalibur |
|---------|--------|--------|--------|-----------|
| Text types | Text, BitmapText, HTMLText | `this.add.text()` (canvas-based), BitmapText, WebFont support | `text()` component (canvas) | `Label` actor (canvas) |
| Bitmap fonts | First-class with dynamic generation | Supported via `this.add.bitmapText()` | Not built-in | `FontSource` with SpriteFont |
| Inline styles | Tagged text (v8.16+) | Not built-in (use multiple Text objects) | Not built-in | Not built-in |
| Per-char animation | SplitText (v8.11+) | Manual (create individual text objects) | Manual | Manual |
| Rich HTML | HTMLText built-in | DOM overlay or custom | DOM overlay | DOM overlay |

---

## Next Steps

- [G8 UI & HUD](G8_ui_and_hud.md) — text in the context of game interfaces
- [G10 Performance Optimization](G10_performance_optimization.md) — draw call batching and texture management
- [G1 Asset Loading](G1_asset_loading.md) — loading font files with the Assets system
- [R1 API Cheatsheet](../reference/R1_api_cheatsheet.md) — quick text API reference
