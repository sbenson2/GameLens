# UI and HUD Patterns

> **Category:** guide · **Engine:** GDevelop · **Related:** [G1_events_and_behaviors](G1_events_and_behaviors.md), [R2_variables_and_data_management](../reference/R2_variables_and_data_management.md), [E1_architecture_overview](../architecture/E1_architecture_overview.md)

GDevelop has no dedicated UI framework — instead, you compose HUDs and menus from general-purpose objects (Text, Bitmap Text, Shape Painter, Panel Sprite, Sprite) placed on a dedicated layer. This guide covers how to set up a UI layer, build common HUD elements, create interactive menus, and handle responsive layout.

---

## The UI Layer

All HUD and menu elements should live on their own layer so they render above game objects and are unaffected by the game camera.

### Setup

1. Open the **Scene editor** and click the **Layers** panel.
2. Add a new layer named `UI` (or `HUD`).
3. Drag it to the **top** of the layer list (topmost = drawn last = on top).
4. On the `UI` layer properties, **uncheck** "Follow the base layer camera" if present, or ensure the UI camera is not moved by your game logic.

Place all HUD objects (health bars, score counters, buttons) on this layer. They will stay fixed on screen even as the game camera pans.

---

## Keeping Objects Pinned to the Screen

### Anchor Behavior

The **Anchor** behavior pins an object's edges to the window edges, keeping it positioned correctly when the window is resized.

1. Select the UI object.
2. Open **Behaviors** → **Add a behavior** → **Anchor**.
3. Configure which edges to pin:

| Setting | Effect |
|---------|--------|
| Left edge → Window left | Object stays N pixels from the left |
| Right edge → Window right | Object stays N pixels from the right |
| Top edge → Window top | Object stays N pixels from the top |
| Bottom edge → Window bottom | Object stays N pixels from the bottom |

The Anchor behavior works relative to the object's position in the editor. Place the object where you want it on screen, then add the behavior — it records the current distance to each edge.

### Manual Positioning (Alternative)

If you need more control, you can position UI objects each frame using events:

```
Condition: Every frame (no condition)
Action: Set position of ScoreText to X = 20, Y = 20
```

This approach is useful when UI elements need to move (e.g., a notification sliding in from the top).

---

## Text Display Objects

GDevelop offers three text object types:

| Object | Rendering | Best For |
|--------|-----------|----------|
| **Text** | System fonts or custom web fonts | Simple labels, debug text, any text that needs word wrapping |
| **Bitmap Text** | Pre-rendered font atlas (BMFont format) | Pixel-art games, styled scores, performance-critical text |
| **BBText** | Rich text with inline formatting tags | Dialogue with colored words, bold/italic mid-sentence |

### Text Object — Displaying Variables

The most common HUD task is showing a variable value (score, health, lives):

```
Condition: Every frame
Action: Set text of ScoreText to "Score: " + ToString(Variable(Score))
```

For scene variables, use `Variable(Score)`. For global variables, use `GlobalVariable(Score)`. For object variables, use `ObjectVariable.VariableName` on a specific object.

### Bitmap Text — Pixel-Art Scores

Bitmap Text uses a `.fnt` file and a companion `.png` atlas. Tools like **BMFont**, **Hiero**, or **Littera** generate these.

1. Add a **Bitmap Text** object to the `UI` layer.
2. In its properties, set the **Bitmap font** resource to your `.fnt` file.
3. Update the text via events, same as a regular Text object.

Bitmap Text renders at exactly the pixel size defined in the font atlas — it will not blur when the game scales, making it ideal for pixel-art aesthetics.

---

## Health Bars and Resource Bars

### Resource Bar Object

GDevelop provides a built-in **Resource Bar** object designed for health, mana, stamina, or any bounded value.

1. Insert a **Resource Bar** object on the `UI` layer.
2. Configure its properties:

| Property | Description |
|----------|-------------|
| **Value** | Current value (e.g., player health) |
| **Max value** | Upper bound of the bar |
| **Bar color** | Fill color for the current value |
| **Background color** | Color behind the bar (shows when not full) |
| **Width / Height** | Dimensions of the bar |

3. Update its value each frame:

```
Condition: Every frame
Action: Set value of HealthBar to Player.Health
```

### Shape Painter — Custom Health Bar

For full visual control, use a **Shape Painter** to draw a custom bar:

```
Condition: Beginning of the scene
Action: Shape Painter → Set relative to the scene (uncheck)

Condition: Every frame
Actions:
  Shape Painter → Clear
  Shape Painter → Set fill color to (50, 50, 50)
  Shape Painter → Draw rectangle from (10, 10) to (210, 30)
  Shape Painter → Set fill color to (220, 50, 50)
  Shape Painter → Draw rectangle from (10, 10) to (10 + 200 * (Variable(PlayerHP) / Variable(MaxHP)), 30)
```

This draws a grey background bar and a red foreground bar that scales with the player's HP ratio. Place the Shape Painter on the `UI` layer.

### Panel Sprite Health Frame

For a polished look, use a **Panel Sprite (9-patch)** as a decorative frame around a Resource Bar or Shape Painter bar:

1. Create a 9-patch border image (corners stay fixed, edges stretch).
2. Add a Panel Sprite object on the `UI` layer.
3. Size it to wrap around the health bar.

The Panel Sprite scales cleanly at any size because its corners are never stretched.

---

## Score and Combo Counters

### Simple Score Display

```
Condition: Every frame
Action: Set text of ScoreText to "Score: " + ToString(GlobalVariable(Score))
```

### Animated Score (Counting Up)

For a score that counts up smoothly instead of jumping:

```
Scene variable: DisplayedScore (number, initial value 0)

Condition: Variable(DisplayedScore) < GlobalVariable(Score)
Action: Set Variable(DisplayedScore) to min(Variable(DisplayedScore) + 50 * TimeDelta(), GlobalVariable(Score))

Condition: Every frame
Action: Set text of ScoreText to ToString(Round(Variable(DisplayedScore)))
```

The `50 * TimeDelta()` controls counting speed (50 points per second). Adjust to taste.

### Combo Pop-Up

Show a temporary "x3 Combo!" text when the player chains hits:

```
Condition: Variable(ComboCount) >= 3
Sub-condition: Trigger once
Actions:
  Create object ComboText at position (ScreenWidth()/2, ScreenHeight()/2) on layer "UI"
  Set text of ComboText to "x" + ToString(Variable(ComboCount)) + " Combo!"
  Apply Tween "fadeout" to ComboText: opacity from 255 to 0 over 0.8 seconds
  Wait 1 second → Delete ComboText
```

---

## Interactive Buttons

### Button Object

GDevelop has a built-in **Button** object and a **Panel Sprite Button** extension.

**Button object setup:**
1. Insert a **Button** object on the `UI` layer.
2. Set its label text, idle/hover/pressed colors, and font in the properties.
3. Use the condition `Button is clicked` (or `Button is hovered`) to respond:

```
Condition: StartButton is clicked
Action: Change scene to "Level1"
```

### Custom Sprite Buttons

For fully custom button art, use a Sprite with multiple animations and cursor detection:

```
Condition: Cursor is on SpriteButton
Sub-condition: Mouse button pressed (left)
Action: Set animation of SpriteButton to "pressed"

Condition: Cursor is on SpriteButton
Sub-condition: Mouse button released (left)
Actions:
  [Trigger the button action]
  Set animation of SpriteButton to "hover"

Condition: Cursor is on SpriteButton
(no sub-condition for press)
Action: Set animation of SpriteButton to "hover"

Condition: Cursor is NOT on SpriteButton
Action: Set animation of SpriteButton to "idle"
```

Order these events from most specific (pressed) to least specific (idle) to avoid flickering.

---

## Dialogue and Text Boxes

### Basic Dialogue Box

Combine a Panel Sprite (background) with a Text or BBText (content):

1. **DialogueBox** — Panel Sprite, sized to the bottom third of the screen, on `UI` layer.
2. **DialogueText** — BBText object placed inside the Panel Sprite bounds.
3. **SpeakerName** — Text object positioned above the dialogue box.

### Typewriter Effect

Reveal text character by character:

```
Scene variable: FullText (string)
Scene variable: CharIndex (number, initial 0)

Condition: Timer "typewriter" > 0.03
Actions:
  Set Variable(CharIndex) to Variable(CharIndex) + 1
  Set text of DialogueText to SubStr(Variable(FullText), 0, Variable(CharIndex))
  Reset timer "typewriter"

Condition: Variable(CharIndex) >= StrLength(Variable(FullText))
Action: [Dialogue fully revealed — enable "next" prompt]
```

Adjust the timer threshold (0.03 seconds = ~33 characters/second) to control speed.

---

## Minimap with Shape Painter

A simple minimap that shows the player and enemies as colored dots:

```
Condition: Every frame
Actions:
  MinimapPainter → Clear

  // Draw background
  MinimapPainter → Set fill color to (30, 30, 30)
  MinimapPainter → Set fill opacity to 180
  MinimapPainter → Draw rectangle from (0, 0) to (150, 150)

  // Draw player dot (center of minimap = player position)
  MinimapPainter → Set fill color to (0, 200, 0)
  MinimapPainter → Draw circle at (75, 75) radius 4

  // For each enemy, draw a red dot offset from center
  For each Enemy:
    Set Variable(DotX) to 75 + (Enemy.X - Player.X) * 0.05
    Set Variable(DotY) to 75 + (Enemy.Y - Player.Y) * 0.05
    MinimapPainter → Set fill color to (200, 0, 0)
    MinimapPainter → Draw circle at (Variable(DotX), Variable(DotY)) radius 3
```

Place the MinimapPainter on the `UI` layer and anchor it to the top-right corner.

---

## Responsive Layout Tips

| Technique | When to Use |
|-----------|-------------|
| **Anchor behavior** | UI elements that should maintain distance from screen edges |
| **Percentage-based positioning** | `Set X to ScreenWidth() * 0.5` for centered elements |
| **Multiple resolutions** | Set project to "Letterbox scale" for consistent aspect ratio, or "Crop" for full-screen fill |
| **Scale mode awareness** | If using "Crop", anchor critical UI to edges so nothing is cut off |

For mobile, increase touch target sizes (minimum 48×48 pixels) and consider a separate UI layout for portrait vs. landscape if you support both.

---

## Performance Considerations

| Tip | Why |
|-----|-----|
| Use Bitmap Text over Text for static labels | Bitmap Text renders faster and avoids font loading issues |
| Limit Shape Painter draw calls | Redrawing complex shapes every frame is expensive; cache static elements |
| Avoid creating/deleting UI objects every frame | Create them once at scene start, show/hide with visibility |
| Use layers to batch-hide UI | Hiding the entire `UI` layer is cheaper than hiding each object individually |

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| HUD moves with the camera | Objects are on the base layer, not a UI layer | Move objects to a dedicated `UI` layer |
| Text shows "0" instead of variable value | Wrong variable scope or missing `ToString()` | Verify scope (scene vs. global vs. object) and wrap numbers in `ToString()` |
| Health bar overflows or underflows | Value exceeds max or goes below 0 | Clamp: `max(0, min(Variable(HP), Variable(MaxHP)))` |
| Button clicks register through UI to game | Game layer receives the same click | Add a condition: "If cursor is NOT on any UI button" before processing game clicks |
| Bitmap Text appears blurry | Game scaling is smoothing the pixel font | Set the Bitmap Text to "Nearest" sampling in project properties |
