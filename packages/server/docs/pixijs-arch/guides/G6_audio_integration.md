# Audio Integration with @pixi/sound

> **Category:** guide · **Engine:** PixiJS · **Related:** [Asset Loading](G1_asset_loading.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

PixiJS does not include audio in its core rendering library. The official `@pixi/sound` package provides a WebAudio-based playback system with volume control, looping, sound sprites, and a rich filter pipeline. This guide covers installation, loading and playing sounds, filters, sound sprites, browser autoplay, and common game audio patterns.

---

## Installation

Install the `@pixi/sound` package alongside PixiJS:

```bash
npm install @pixi/sound
```

Import the singleton `sound` library and optionally the `Sound` class and `filters`:

```typescript
import { sound, Sound, filters } from "@pixi/sound";
```

If using a CDN bundle, `@pixi/sound` registers itself as `PIXI.sound` automatically.

---

## Loading and Adding Sounds

### Via the `sound` Singleton

The `sound` object acts as a global sound library (a `SoundLibrary` instance). Add sounds by alias:

```typescript
import { sound } from "@pixi/sound";

// Add a single sound
sound.add("jump", "./audio/jump.mp3");

// Add multiple sounds at once
sound.add({
  bgm: "./audio/music.ogg",
  coin: "./audio/coin.mp3",
  explosion: "./audio/explosion.ogg",
});
```

### Via `Sound.from()` for More Control

Create a `Sound` instance directly when you need fine-grained options:

```typescript
import { Sound } from "@pixi/sound";

const bgMusic = Sound.from({
  url: "./audio/music.ogg",
  preload: true,
  autoPlay: false,
  volume: 0.5,
  loop: true,
  speed: 1.0,
  singleInstance: true,  // only one instance plays at a time
  complete: () => {
    console.log("Music finished");
  },
});
```

### Via PixiJS Assets Loader

If you are using PixiJS v7+ Assets system, `@pixi/sound` registers itself as an asset loader automatically:

```typescript
import { Assets } from "pixi.js";
import "@pixi/sound"; // registers the loader extension

await Assets.load("./audio/jump.mp3");
// Now playable via the sound library
sound.play("jump");
```

---

## Playing Sounds

### Fire-and-Forget

```typescript
// Play by alias
sound.play("jump");

// Play with options
sound.play("coin", {
  volume: 0.7,
  speed: 1.2,
  loop: false,
});
```

### Getting a Playback Instance

`sound.play()` returns an `IMediaInstance` (or a `Promise<IMediaInstance>`) that provides runtime control:

```typescript
const instance = sound.play("bgm", { loop: true, volume: 0.4 });

// If the sound is not yet loaded, it returns a Promise
if (instance instanceof Promise) {
  const resolved = await instance;
  resolved.volume = 0.6;
}
```

### Playback Instance Controls

```typescript
const inst = await sound.play("bgm", { loop: true });

// Volume (0 = silent, 1 = full)
inst.volume = 0.5;

// Playback speed (1 = normal, 2 = double)
inst.speed = 1.0;

// Pause and resume
inst.paused = true;   // pause
inst.paused = false;  // resume

// Stop — releases the instance
inst.stop();

// Progress (0 to 1)
console.log(inst.progress);

// Events
inst.on("end", () => console.log("Playback finished"));
inst.on("pause", () => console.log("Paused"));
inst.on("resume", () => console.log("Resumed"));
inst.on("progress", (progress: number) => {
  console.log(`${(progress * 100).toFixed(0)}% played`);
});
```

---

## Sound-Level Controls

Control a `Sound` object (all its instances) rather than a single playback instance:

```typescript
const jumpSound = sound.find("jump");

// Volume for all instances of this sound
jumpSound.volume = 0.8;

// Playback speed for all instances
jumpSound.speed = 1.0;

// Loop setting
jumpSound.loop = false;

// Single-instance mode — new play() stops the previous one
jumpSound.singleInstance = true;

// Stop all instances
jumpSound.stop();

// Pause all instances
jumpSound.pause();

// Resume all instances
jumpSound.resume();

// Check state
console.log(jumpSound.isPlaying);  // boolean
console.log(jumpSound.isLoaded);   // boolean
console.log(jumpSound.duration);   // total seconds
```

---

## Global Controls

The `sound` singleton provides global controls over all registered sounds:

```typescript
// Master volume
sound.volumeAll = 0.5;

// Mute/unmute everything
sound.muteAll();
sound.unmuteAll();
sound.toggleMuteAll();

// Pause/resume everything
sound.pauseAll();
sound.resumeAll();
sound.togglePauseAll();

// Stop everything
sound.stopAll();

// Remove a sound and free memory
sound.remove("explosion");

// Remove all sounds
sound.removeAll();

// Check if a sound exists
sound.exists("jump"); // boolean
```

---

## Sound Sprites

Sound sprites pack multiple short sounds into a single audio file, reducing HTTP requests. Define named time regions with `start` and `end` in seconds:

```typescript
sound.add("sfx", {
  url: "./audio/sfx-sheet.ogg",
  sprites: {
    laser:   { start: 0,    end: 0.5 },
    powerup: { start: 0.5,  end: 1.2 },
    hit:     { start: 1.2,  end: 1.8 },
    pickup:  { start: 1.8,  end: 2.3 },
  },
});

// Play a specific sprite
sound.play("sfx", { sprite: "laser" });
sound.play("sfx", { sprite: "powerup", volume: 0.6 });
```

Use tools like [audiosprite](https://github.com/tonistiigi/audiosprite) or [assetpack-plugin-audiosprite](https://github.com/reececomo/assetpack-plugin-audiosprite) to generate sprite sheets from individual files.

---

## Audio Filters (WebAudio Only)

`@pixi/sound` includes a filter pipeline for real-time audio effects. Filters only work with the WebAudio backend.

### Available Filters

| Filter | Description |
|---|---|
| `StereoFilter` | Pan audio left/right (-1 to +1) |
| `ReverbFilter` | Add reverb/echo effect |
| `DistortionFilter` | Overdrive / distortion |
| `EqualizerFilter` | Multi-band EQ (10 bands) |
| `TelephoneFilter` | Low-fi telephone voice effect |

### Applying Filters to a Sound

```typescript
import { sound, filters } from "@pixi/sound";

const radio = sound.find("voice-line");
radio.filters = [
  new filters.TelephoneFilter(),
];

// Chain multiple filters
const underwater = sound.find("bgm");
underwater.filters = [
  new filters.ReverbFilter(3, 10),      // seconds, decay
  new filters.EqualizerFilter(0, 0, -10, -20, -10, 0, 0, 0, 0, 0),
];
```

### Applying Filters Globally

Apply filters to all output at once:

```typescript
sound.filtersAll = [
  new filters.StereoFilter(0),  // centered
];
```

### Stereo Panning Example

```typescript
function playSpatial(name: string, screenX: number, screenWidth: number): void {
  const pan = ((screenX / screenWidth) * 2) - 1; // -1 to +1
  const snd = sound.find(name);
  snd.filters = [new filters.StereoFilter(pan)];
  snd.play();
}
```

---

## Browser Autoplay Policy

Modern browsers block audio until a user gesture. `@pixi/sound` uses WebAudio by default, which creates a suspended `AudioContext`. The context is resumed automatically after the first click or tap.

Handle the locked state explicitly if needed:

```typescript
import { sound, webaudio } from "@pixi/sound";

const ctx = webaudio.WebAudioContext;
if (ctx && ctx.audioContext.state === "suspended") {
  document.addEventListener("click", () => {
    ctx.audioContext.resume();
  }, { once: true });
}
```

**Best practice:** Show a "Click to Start" screen before playing background music.

---

## Common Patterns

### Separate Music and SFX Volume

```typescript
class AudioManager {
  private _musicVol = 0.5;
  private _sfxVol = 0.8;
  private musicAlias: string | null = null;

  playMusic(alias: string): void {
    if (this.musicAlias) sound.stop(this.musicAlias);
    this.musicAlias = alias;
    const snd = sound.find(alias);
    snd.volume = this._musicVol;
    snd.singleInstance = true;
    snd.play({ loop: true });
  }

  playSfx(alias: string, vol = 1): void {
    sound.play(alias, { volume: vol * this._sfxVol });
  }

  set musicVolume(v: number) {
    this._musicVol = Math.max(0, Math.min(1, v));
    if (this.musicAlias) {
      sound.find(this.musicAlias).volume = this._musicVol;
    }
  }

  set sfxVolume(v: number) {
    this._sfxVol = Math.max(0, Math.min(1, v));
  }

  get musicVolume(): number { return this._musicVol; }
  get sfxVolume(): number { return this._sfxVol; }
}
```

### Pause Audio on Tab Hidden

```typescript
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    sound.pauseAll();
  } else {
    sound.resumeAll();
  }
});
```

### Integrating with a PixiJS Game Loop

Play sounds in response to game events — keep audio logic outside the render loop:

```typescript
import { Application, Sprite } from "pixi.js";
import { sound } from "@pixi/sound";

const app = new Application();
await app.init({ width: 800, height: 600 });

// Load sounds
sound.add("shoot", "./audio/shoot.mp3");
sound.add("bgm", "./audio/bgm.ogg");

// Start music after user clicks
app.canvas.addEventListener("click", () => {
  if (!sound.find("bgm").isPlaying) {
    sound.play("bgm", { loop: true, volume: 0.3 });
  }
}, { once: true });

// Play SFX on game events (not in ticker)
function onPlayerShoot(): void {
  sound.play("shoot", { volume: 0.7 });
}
```

---

## Performance and Mobile Notes

- **Use sound sprites** for games with many short SFX — one HTTP request instead of dozens.
- **`singleInstance: true`** for music tracks prevents accidentally layering multiple copies.
- **Prefer OGG + MP3** — provide both formats when possible. OGG gives better compression; MP3 is the Safari fallback.
- **Mobile latency:** Web Audio on iOS/Android can have 50–100ms latency. Pre-load sounds and avoid loading on demand during gameplay.
- **iOS Safari:** Requires a user gesture to unlock the AudioContext. A "Tap to Play" splash screen is standard practice.
- **Memory:** `@pixi/sound` decodes audio into memory by default. For very long tracks (> 2 min), consider chunked loading or keep file sizes manageable.
- **Filters are WebAudio-only** — they silently do nothing with the HTML5 Audio fallback. For broadest compatibility, treat filters as progressive enhancement.

---

## Cross-Framework Comparison

| Concept | PixiJS (@pixi/sound) | Phaser | Kaplay | Excalibur |
|---|---|---|---|---|
| Audio module | Separate `@pixi/sound` package | Built-in Sound Manager | Built-in `play()` | Built-in `Sound` class |
| Add sound | `sound.add('key', url)` | `this.load.audio('key', url)` | `k.loadSound('key', url)` | `new Sound(url)` |
| Play sound | `sound.play('key')` | `this.sound.play('key')` | `k.play('key')` | `sound.play()` |
| Sound sprites | Built-in `sprites` option | `audioSprite` + JSON map | Not built-in | Not built-in |
| Filters | 5 built-in filters | Web Audio AnalyserNode | Raw `audioCtx` access | Not built-in |
| Global volume | `sound.volumeAll` | `this.sound.volume` | `k.volume()` | Manual wrapper |
| Pause all | `sound.pauseAll()` | `this.sound.pauseAll()` | Not built-in (manual) | Manual wrapper |
| Spatial audio | `StereoFilter` for pan | Built-in positional source | `pan` property on handle | Not built-in |
