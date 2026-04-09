# Audio and Sound

> **Category:** guide · **Engine:** Kaplay · **Related:** [Scenes and Navigation](G2_scenes_and_navigation.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Kaplay provides a lightweight audio API built on the Web Audio API. Sounds are loaded with `loadSound()` or `loadMusic()`, played with `play()`, and controlled through the returned `AudioPlay` handle. This guide covers loading audio, playback control, music streaming, browser autoplay policies, and common game audio patterns.

---

## Loading Audio

### Sound Effects — `loadSound()`

Use `loadSound()` in your initialization block to load short audio files. The entire file is decoded into memory, giving low-latency playback suitable for sound effects:

```typescript
import kaplay from "kaplay";

const k = kaplay();

k.loadSound("jump", "/audio/jump.ogg");
k.loadSound("coin", "/audio/coin.mp3");
k.loadSound("explosion", "/audio/explosion.wav");
```

**Supported formats:** MP3, OGG Vorbis, and WAV. Browser support varies — OGG is not supported in Safari. Provide MP3 as a universal fallback when distributing games.

### Background Music — `loadMusic()`

Use `loadMusic()` for large audio files like background tracks. Unlike `loadSound()`, this streams the audio rather than decoding it all upfront, so it does not block the loading screen:

```typescript
k.loadMusic("bgm", "/audio/background_music.mp3");
k.loadMusic("boss-theme", "/audio/boss_battle.ogg");
```

**When to use which:**

| Function | Decoding | Best for | Latency |
|---|---|---|---|
| `loadSound()` | Full decode into memory | Short SFX (< 10s) | Very low |
| `loadMusic()` | Streamed on demand | Long tracks (music, ambience) | Slightly higher |

---

## Playing Sounds

The `play()` function accepts a sound name and an optional options object. It returns an `AudioPlay` control handle:

```typescript
// Simple fire-and-forget
k.play("jump");

// With options
const music = k.play("bgm", {
  volume: 0.5,   // 0 = silent, 1 = full
  speed: 1.0,    // 0.5 = half speed, 2.0 = double
  loop: true,    // restart when finished
  paused: false, // start paused if true
});
```

### The `AudioPlay` Handle

Every call to `play()` returns an `AudioPlay` object with properties and methods to control the playing sound:

```typescript
const sfx = k.play("explosion", { volume: 0.8 });

// --- Properties (read/write) ---
sfx.volume = 0.6;     // adjust volume (0–1)
sfx.speed = 1.5;      // playback rate
sfx.loop = true;      // enable looping
sfx.detune = -100;    // pitch shift in cents (-100 = one semitone down)
sfx.pan = -0.5;       // stereo pan (-1 left, 0 center, +1 right)

// --- Methods ---
sfx.pause();           // pause playback
sfx.play();            // resume from paused position
sfx.stop();            // stop and release
sfx.seek(10);          // jump to 10 seconds

// --- Read-only info ---
const elapsed = sfx.time();      // current position (seconds)
const total = sfx.duration();    // total duration (seconds)
```

### End-of-Playback Callback

Register a callback that fires when a sound finishes playing (does not fire for looping sounds until the loop is broken):

```typescript
const fanfare = k.play("level-clear", { volume: 0.8 });

fanfare.onEnd(() => {
  // Transition to next level after the sound completes
  k.go("next-level");
});
```

---

## Global Volume Control

Kaplay exposes `volume()` as a global getter/setter for master volume:

```typescript
// Set master volume to 60%
k.volume(0.6);

// Read current master volume
const currentVol = k.volume();
```

This scales all active and future sounds proportionally.

---

## Browser Autoplay Policy

Modern browsers block audio until a user gesture (click, tap, or key press) occurs. Kaplay handles this internally — the Web Audio `AudioContext` is created in a suspended state and resumed on the first user interaction.

If you need to respond to the unlock event explicitly, access the underlying `AudioContext`:

```typescript
const ctx = k.audioCtx;

if (ctx.state === "suspended") {
  // Audio is locked — will auto-resume on first interaction
  console.log("Waiting for user gesture to unlock audio...");
}
```

**Best practice:** Do not call `k.play()` for music in your initial scene setup without a user interaction. Instead, start music after a "Press Start" screen or title click.

---

## The `burp()` Helper

Kaplay includes a built-in `burp()` function — a fun default sound for quick prototyping and game jams when you do not have audio assets yet:

```typescript
// Play the built-in burp sound effect
k.burp();

// With options
k.burp({ volume: 0.3, speed: 0.8 });
```

---

## Common Patterns

### Separate Music and SFX Volume

Kaplay does not have built-in audio groups, but you can manage them with a simple wrapper:

```typescript
class AudioManager {
  private k: ReturnType<typeof kaplay>;
  private musicHandle: ReturnType<typeof k.play> | null = null;
  private _musicVol = 0.5;
  private _sfxVol = 0.8;

  constructor(k: ReturnType<typeof kaplay>) {
    this.k = k;
  }

  playMusic(name: string): void {
    // Stop previous track
    this.musicHandle?.stop();
    this.musicHandle = this.k.play(name, {
      volume: this._musicVol,
      loop: true,
    });
  }

  playSfx(name: string, opts?: { volume?: number }): void {
    this.k.play(name, {
      volume: (opts?.volume ?? 1) * this._sfxVol,
    });
  }

  set musicVolume(v: number) {
    this._musicVol = Math.max(0, Math.min(1, v));
    if (this.musicHandle) this.musicHandle.volume = this._musicVol;
  }

  set sfxVolume(v: number) {
    this._sfxVol = Math.max(0, Math.min(1, v));
  }

  get musicVolume(): number { return this._musicVol; }
  get sfxVolume(): number { return this._sfxVol; }
}

// Usage
const audio = new AudioManager(k);
audio.playMusic("bgm");
audio.playSfx("coin");
audio.musicVolume = 0.3;
```

### Scene-Based Music Transitions

Switch background music when navigating between scenes:

```typescript
k.scene("menu", () => {
  const music = k.play("menu-theme", { loop: true, volume: 0.4 });

  k.add([
    k.text("Press ENTER to start"),
    k.pos(k.center()),
    k.anchor("center"),
  ]);

  k.onKeyPress("enter", () => {
    music.stop();
    k.go("game");
  });
});

k.scene("game", () => {
  const music = k.play("game-theme", { loop: true, volume: 0.5 });

  // ... game logic ...

  // Stop music when leaving
  k.onSceneLeave(() => {
    music.stop();
  });
});

k.go("menu");
```

### Collision Sound Effects

Play sounds when game objects interact:

```typescript
const player = k.add([
  k.sprite("hero"),
  k.pos(100, 200),
  k.area(),
  k.body(),
]);

player.onCollide("coin", (coin) => {
  k.play("coin-collect", { volume: 0.7 });
  k.destroy(coin);
});

player.onCollide("enemy", () => {
  k.play("hit", { volume: 0.9, detune: k.rand(-100, 100) });
});
```

**Tip:** Adding slight random `detune` or `speed` variation to repeated SFX prevents the "machine gun effect" where identical sounds played rapidly sound artificial.

### Positional Audio (Manual Pan)

Kaplay does not have built-in spatial audio, but you can simulate stereo panning based on an object's screen position:

```typescript
function playSpatial(name: string, worldX: number): void {
  const cam = k.camPos();
  const screenWidth = k.width();
  // Map world position to -1 (left) to +1 (right) pan
  const pan = Math.max(-1, Math.min(1, (worldX - cam.x) / (screenWidth / 2)));
  k.play(name, { pan, volume: 0.8 });
}

// Usage: explosion at world x=800
playSpatial("explosion", 800);
```

---

## Performance and Mobile Notes

- **File sizes:** Use OGG at 96–128 kbps for SFX and MP3 at 128–192 kbps for music. WAV is uncompressed — avoid shipping it in production builds.
- **Use `loadMusic()` for long tracks** — decoding a 3-minute MP3 with `loadSound()` blocks the loader and consumes significant memory on mobile.
- **Mobile latency:** Web Audio on mobile can have ~50–100ms latency. For rhythm or timing-critical games, preload all sounds and keep them ready.
- **iOS Safari:** Requires a user gesture to unlock the AudioContext. Kaplay handles this, but verify with a "tap to start" screen.
- **Overlapping instances:** Each `play()` call creates a new audio instance. Rapid-fire effects (e.g., machine gun) can stack dozens of instances. Debounce or limit concurrent plays for performance.

---

## Cross-Framework Comparison

| Concept | Kaplay | Phaser | Excalibur | PixiJS |
|---|---|---|---|---|
| Load SFX | `k.loadSound()` | `this.load.audio()` | `new Sound(...paths)` | `sound.add()` |
| Load music | `k.loadMusic()` (streamed) | `this.load.audio()` | `new Sound()` (no streaming) | `Sound.from()` |
| Play sound | `k.play('name')` | `this.sound.play('key')` | `sound.play()` | `sound.play('name')` |
| Control handle | `AudioPlay` object | `BaseSound` instance | `Sound` instance | `IMediaInstance` |
| Loop | `{ loop: true }` | `{ loop: true }` | `sound.loop = true` | `{ loop: true }` |
| Volume | `handle.volume` / `k.volume()` | `sound.setVolume()` | `sound.volume` | `sound.volume` |
| Stereo pan | `handle.pan` | Spatial audio API | Not built-in | `StereoFilter` |
| Pause/resume | `handle.pause()` / `.play()` | `pause()` / `resume()` | `pause()` / `play()` | `pause()` / `resume()` |
