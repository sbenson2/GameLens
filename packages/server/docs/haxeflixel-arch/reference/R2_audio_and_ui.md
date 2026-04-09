# R2 — Audio and UI Systems

> **Category:** reference · **Engine:** HaxeFlixel · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Cross-Compilation](R1_cross_compilation.md) · [Animation & Sprites](../guides/G4_animation_and_sprites.md)

HaxeFlixel provides a built-in audio system through `FlxG.sound` and multiple approaches to UI — from core `FlxText`/`FlxButton` widgets to the `flixel-ui` addon library for XML-driven interfaces. This reference covers both systems in detail.

---

## Audio System Overview

All audio in HaxeFlixel flows through `FlxG.sound`, a frontend that manages sound effects, music, volume, and sound groups. Individual sounds are represented by `FlxSound` objects.

### Architecture

```
FlxG.sound (SoundFrontEnd)
├── music : FlxSound              ← single music track (one at a time)
├── defaultMusicGroup : FlxSoundGroup
├── defaultSoundGroup : FlxSoundGroup
└── list : FlxTypedGroup<FlxSound> ← all active sound instances
```

---

## Playing Sound Effects

### Quick Play (Fire-and-Forget)

```haxe
// Play a sound effect — returns the FlxSound instance
FlxG.sound.play(AssetPaths.jump__wav);

// With volume (0.0 to 1.0)
FlxG.sound.play(AssetPaths.explosion__wav, 0.7);

// With looping
FlxG.sound.play(AssetPaths.ambient__ogg, 0.5, true);
```

`FlxG.sound.play()` creates or recycles a `FlxSound` from the internal pool. For short sound effects that don't need further control, this is the simplest approach.

### Managed Sounds (Keep a Reference)

For sounds you need to pause, fade, or stop later, load them explicitly:

```haxe
var hitSound = FlxG.sound.load(AssetPaths.hit__wav);
hitSound.volume = 0.8;
hitSound.play();

// Later...
hitSound.pause();
hitSound.resume();
hitSound.stop();
```

### Preloading

`FlxG.sound.cache()` loads a sound into memory without playing it, avoiding a hitch on first play:

```haxe
// In your state's create() method
FlxG.sound.cache(AssetPaths.boss_theme__ogg);
FlxG.sound.cache(AssetPaths.laser__wav);
```

---

## Music

HaxeFlixel treats music as a special single-track channel. Only one music track plays at a time — calling `playMusic()` stops the current track.

```haxe
// Play background music (loops by default)
FlxG.sound.playMusic(AssetPaths.overworld__ogg, 0.6);

// Access the current music track
FlxG.sound.music.fadeOut(2.0);  // 2-second fade out

// Switch tracks with a crossfade
FlxG.sound.music.fadeOut(1.0, 0, function() {
    FlxG.sound.playMusic(AssetPaths.boss__ogg, 0.8);
    FlxG.sound.music.fadeIn(1.0);
});
```

### Music Properties

| Property | Type | Description |
|----------|------|-------------|
| `FlxG.sound.music` | `FlxSound` | The currently playing music track (null if none) |
| `FlxG.sound.music.volume` | `Float` | Current music volume (0.0–1.0) |
| `FlxG.sound.music.looped` | `Bool` | Whether the music loops (default: true for `playMusic`) |
| `FlxG.sound.music.time` | `Float` | Current playback position in milliseconds |
| `FlxG.sound.music.length` | `Float` | Total duration in milliseconds |

---

## Volume Control

### Global Volume

```haxe
// Master volume (affects everything)
FlxG.sound.volume = 0.8;  // 0.0 to 1.0

// Mute/unmute all audio
FlxG.sound.muted = true;
FlxG.sound.muted = false;
```

### Sound Groups

Sound groups let you control categories of audio independently (e.g., separate SFX and music sliders):

```haxe
// Create groups
var sfxGroup = new FlxSoundGroup();
var voiceGroup = new FlxSoundGroup();

// Set group volumes
sfxGroup.volume = 0.9;
voiceGroup.volume = 0.7;

// Assign sounds to groups
var explosion = FlxG.sound.load(AssetPaths.explosion__wav);
explosion.group = sfxGroup;

var dialogue = FlxG.sound.load(AssetPaths.npc_hello__ogg);
dialogue.group = voiceGroup;
```

The effective volume of a sound is: `globalVolume * groupVolume * soundVolume`.

---

## FlxSound Properties and Methods

| Property/Method | Description |
|----------------|-------------|
| `.play()` | Start or restart playback |
| `.pause()` | Pause at current position |
| `.resume()` | Resume from paused position |
| `.stop()` | Stop and reset to beginning |
| `.fadeIn(duration, from, to)` | Fade volume up over time |
| `.fadeOut(duration, to, onComplete)` | Fade volume down over time |
| `.volume` | Per-sound volume (0.0–1.0) |
| `.looped` | Loop playback |
| `.pan` | Stereo panning (-1.0 left to 1.0 right) |
| `.proximity(x, y, target, radius)` | Positional audio relative to a target object |
| `.time` | Current playback position (ms) |
| `.length` | Total duration (ms) |
| `.onComplete` | Callback fired when playback ends |
| `.playing` | Whether the sound is currently playing |

### Proximity / Positional Audio

```haxe
// Sound gets louder as the player approaches the source
var waterfall = FlxG.sound.load(AssetPaths.waterfall__ogg, true);
waterfall.proximity(waterfallX, waterfallY, player, 200);  // 200px radius
waterfall.play();
```

The sound's volume and panning automatically adjust each frame based on the distance and direction between the source position and the target object (typically the player).

---

## Cross-Platform Audio Formats

| Format | Desktop (C++) | HTML5 | Mobile | Recommendation |
|--------|--------------|-------|--------|----------------|
| WAV | Yes | Yes | Yes | SFX — zero decode latency, larger files |
| OGG | Yes | Yes | Yes | Music/long audio — good compression |
| MP3 | Varies | Yes | Yes | Avoid — licensing concerns, OGG is preferred |

Best practice: use WAV for short sound effects and OGG for music. Configure `Project.xml` to include the right format per target:

```xml
<assets path="assets/sounds" rename="sounds" include="*.ogg" if="html5" />
<assets path="assets/sounds" rename="sounds" include="*.wav" unless="html5" />
```

---

## UI with Core HaxeFlixel

HaxeFlixel provides basic UI primitives without any addons.

### FlxText

```haxe
// Create a text display
var scoreText = new FlxText(10, 10, 200, "Score: 0", 16);
scoreText.setFormat(AssetPaths.pixel_font__ttf, 16, FlxColor.WHITE, CENTER);
scoreText.setBorderStyle(SHADOW, FlxColor.BLACK, 1, 1);
scoreText.scrollFactor.set(0, 0);  // fixed to camera (HUD)
add(scoreText);

// Update text
scoreText.text = "Score: " + score;
```

### FlxButton

```haxe
var playButton = new FlxButton(300, 200, "Play", function() {
    FlxG.switchState(new PlayState());
});
playButton.makeGraphic(120, 40, FlxColor.BLUE);
playButton.label.setFormat(null, 14, FlxColor.WHITE, CENTER);
add(playButton);
```

`FlxButton` has three visual states (normal, highlight, pressed) and supports custom graphics:

```haxe
var btn = new FlxButton(0, 0, "", onClickCallback);
btn.loadGraphic(AssetPaths.button_sheet__png, true, 100, 40);
// Frame 0 = normal, frame 1 = highlight, frame 2 = pressed
```

### HUD Pattern with FlxGroup

The standard HUD pattern uses a `FlxGroup` with `scrollFactor` set to zero so elements stay fixed on screen:

```haxe
class HUD extends FlxTypedGroup<FlxSprite> {
    var healthBar:FlxBar;
    var scoreText:FlxText;
    var livesIcon:FlxSprite;

    public function new() {
        super();

        // Health bar
        healthBar = new FlxBar(10, 10, LEFT_TO_RIGHT, 100, 10);
        healthBar.createFilledBar(FlxColor.RED, FlxColor.GREEN);
        healthBar.scrollFactor.set(0, 0);
        add(healthBar);

        // Score display
        scoreText = new FlxText(10, 25, 200, "Score: 0", 12);
        scoreText.scrollFactor.set(0, 0);
        add(scoreText);
    }

    public function updateHUD(health:Float, score:Int) {
        healthBar.value = health;
        scoreText.text = "Score: " + score;
    }
}

// In your PlayState:
var hud = new HUD();
add(hud);
```

---

## UI with flixel-ui Addon

The `flixel-ui` library (install via `haxelib install flixel-ui`) provides a richer UI toolkit with XML layout support, nine-slice sprites, tabs, dropdowns, checkboxes, and more.

### Installation

```xml
<!-- In Project.xml -->
<haxelib name="flixel-ui" />
```

### XML-Driven Layouts

`flixel-ui` can load entire UI screens from XML definitions:

```xml
<!-- assets/ui/main_menu.xml -->
<layout width="800" height="600">
    <text x="250" y="50" text="My Game" size="32" color="0xFFFFFF" />

    <button x="300" y="200" width="200" height="50"
            text="New Game" name="btn_new" />

    <button x="300" y="270" width="200" height="50"
            text="Options" name="btn_options" />

    <checkbox x="300" y="350" name="chk_fullscreen"
              text="Fullscreen" checked="false" />

    <group name="options_panel" visible="false">
        <sprite x="250" y="150" width="300" height="300"
                color="0x333333" alpha="0.8" />
        <text x="260" y="160" text="Volume" />
    </group>
</layout>
```

### Loading XML UI in Code

```haxe
class MenuState extends FlxUIState {
    override function create() {
        // Automatically loads assets/ui/menu_state.xml
        // (matches class name by convention)
        super.create();
    }

    // Handle UI events
    override function getEvent(name:String, sender:Dynamic, data:Dynamic, ?params:Array<Dynamic>) {
        if (name == FlxUITypedButton.CLICK_EVENT) {
            var buttonName:String = cast(sender, FlxUIButton).name;
            switch (buttonName) {
                case "btn_new":
                    FlxG.switchState(new PlayState());
                case "btn_options":
                    // Toggle options panel
                    _xml_id("options_panel").visible = !_xml_id("options_panel").visible;
            }
        }
    }
}
```

### Code-Only flixel-ui (No XML)

```haxe
// Create widgets directly
var button = new FlxUIButton(100, 200, "Click Me", function() {
    trace("Button clicked!");
});
add(button);

var checkbox = new FlxUICheckBox(100, 260, null, null, "Enable Sound", 100);
checkbox.callback = function() {
    FlxG.sound.muted = !checkbox.checked;
};
add(checkbox);
```

### Key flixel-ui Widgets

| Widget | Class | Purpose |
|--------|-------|---------|
| Button | `FlxUIButton` | Clickable button with 9-slice background |
| Checkbox | `FlxUICheckBox` | Toggle with label |
| Radio group | `FlxUIRadioGroup` | Mutually exclusive selection |
| Dropdown | `FlxUIDropDownMenu` | Dropdown/select list |
| Tab menu | `FlxUITabMenu` | Tabbed panel container |
| Input text | `FlxUIInputText` | Text input field |
| Numeric stepper | `FlxUINumericStepper` | Number input with +/- buttons |

---

## Dialogue Systems

HaxeFlixel doesn't include a built-in dialogue system, but the `flixel-addons` library includes `FlxTypeText` for typewriter-style text:

```haxe
var dialogue = new FlxTypeText(50, 400, 700, "", 16);
dialogue.setFormat(null, 16, FlxColor.WHITE);
dialogue.scrollFactor.set(0, 0);
dialogue.start("Welcome, brave adventurer! The kingdom needs your help...", false, false, null, function() {
    trace("Dialogue finished typing");
});
add(dialogue);

// Skip to end on button press
if (FlxG.keys.justPressed.SPACE) {
    dialogue.skip();
}
```

---

## Common Patterns

### Settings Screen with Volume Sliders

```haxe
class SettingsState extends FlxUIState {
    var sfxGroup:FlxSoundGroup;
    var musicGroup:FlxSoundGroup;

    override function create() {
        super.create();

        // Create audio groups (store these somewhere persistent, e.g., a Registry class)
        sfxGroup = new FlxSoundGroup();
        musicGroup = new FlxSoundGroup();

        // Master volume slider using FlxBar as a visual
        var masterBar = new FlxBar(200, 100, LEFT_TO_RIGHT, 200, 20);
        masterBar.createFilledBar(FlxColor.GRAY, FlxColor.GREEN);
        masterBar.setRange(0, 1);
        masterBar.value = FlxG.sound.volume;
        masterBar.scrollFactor.set(0, 0);
        add(masterBar);

        // Mute toggle
        var muteBtn = new FlxButton(200, 140, FlxG.sound.muted ? "Unmute" : "Mute", function() {
            FlxG.sound.muted = !FlxG.sound.muted;
        });
        add(muteBtn);
    }
}
```

### Fade Between Music Tracks

```haxe
function switchMusic(newTrack:String, fadeDuration:Float = 1.0) {
    if (FlxG.sound.music != null && FlxG.sound.music.playing) {
        FlxG.sound.music.fadeOut(fadeDuration, 0, function() {
            FlxG.sound.playMusic(newTrack, 0);
            FlxG.sound.music.fadeIn(fadeDuration, 0, 0.6);
        });
    } else {
        FlxG.sound.playMusic(newTrack, 0);
        FlxG.sound.music.fadeIn(fadeDuration, 0, 0.6);
    }
}
```
