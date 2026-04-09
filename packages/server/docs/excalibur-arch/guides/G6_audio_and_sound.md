# Audio and Sound

> **Category:** guide · **Engine:** Excalibur · **Related:** [Actors and Entities](G1_actors_and_entities.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Excalibur provides a `Sound` resource class for loading and playing audio — from one-shot sound effects to looping background music. Sounds are loaded through the resource `Loader` alongside images and other assets. The API wraps the Web Audio API, providing volume control, looping, playback rate adjustment, seeking, and multi-instance playback. This guide covers loading audio, playback control, managing music vs. effects, browser autoplay policies, and common patterns.

---

## Loading Audio

Create `Sound` resources with one or more file paths. The order specifies codec preference — the browser plays the first format it supports:

```typescript
import { Sound, Loader, Engine } from 'excalibur';

// Provide MP3 + WAV fallback for broad browser coverage
const bgMusic = new Sound('./audio/music.mp3', './audio/music.wav');
const jumpSfx = new Sound('./audio/jump.mp3', './audio/jump.wav');
const coinSfx = new Sound('./audio/coin.mp3', './audio/coin.wav');

const game = new Engine({ width: 800, height: 600 });
const loader = new Loader([bgMusic, jumpSfx, coinSfx]);

await game.start(loader);
```

**Supported formats:** `.mp3`, `.wav`, `.ogg` — browser support varies. Provide at least MP3 + WAV for maximum compatibility. OGG Vorbis offers better compression but is not supported in Safari.

### Checking Load State

```typescript
if (bgMusic.isLoaded()) {
  bgMusic.play();
}
```

---

## Playback Control

### Play

```typescript
// Play at full volume
jumpSfx.play();

// Play at 50% volume
jumpSfx.play(0.5);

// Play with options object
bgMusic.play({
  volume: 0.7,
  loop: true,
});
```

`play()` returns a `Promise<boolean>` — useful for detecting autoplay blocks.

### Pause, Stop, and Resume

```typescript
// Pause — remembers playback position
bgMusic.pause();

// Resume from paused position
bgMusic.play();

// Stop — rewinds to the beginning
bgMusic.stop();
```

### State Checks

```typescript
bgMusic.isPlaying();  // true if actively playing
bgMusic.isPaused();   // true if paused mid-playback
bgMusic.isStopped();  // true if stopped or never started
```

---

## Volume and Playback Rate

### Volume

Volume is a number between 0 (silent) and 1 (full):

```typescript
// Set via property
bgMusic.volume = 0.4;

// Read current volume
console.log(bgMusic.volume); // 0.4
```

### Playback Rate

Control speed/pitch. `1.0` is normal, `2.0` is double speed, `0.5` is half:

```typescript
bgMusic.playbackRate = 0.8;  // slightly slower
```

### Seeking

Jump to a specific position in seconds:

```typescript
bgMusic.seek(30);  // jump to 30 seconds

// Get current position
const pos = bgMusic.getPlaybackPosition();
const total = bgMusic.getTotalPlaybackDuration();
console.log(`${pos.toFixed(1)}s / ${total.toFixed(1)}s`);
```

---

## Looping

Enable looping for background music or ambient sounds:

```typescript
// Set before or after play
bgMusic.loop = true;
bgMusic.play();

// Or pass in play options
bgMusic.play({ loop: true, volume: 0.5 });

// Disable looping later
bgMusic.loop = false;  // will stop after current playback finishes
```

---

## Multi-Instance Playback

Each call to `play()` creates a new audio instance. This is useful for overlapping sound effects (e.g., rapid-fire shooting):

```typescript
// Each click plays a new overlapping instance
player.on('pointerdown', () => {
  shootSfx.play(0.8);
});

// Check how many instances are currently active
console.log(shootSfx.instanceCount());
```

Stop all instances at once:

```typescript
shootSfx.stop();  // stops every active instance
```

---

## Browser Autoplay Policies

Modern browsers block audio playback until the user interacts with the page (click, tap, or key press). Excalibur's `Loader` screen includes a "Play" button that satisfies this requirement — once the user clicks it, audio is unlocked for the session.

If you start audio outside the loader flow, handle the autoplay restriction:

```typescript
async function startMusic(): Promise<void> {
  try {
    await bgMusic.play({ loop: true, volume: 0.5 });
  } catch {
    // Autoplay was blocked — wait for user interaction
    document.addEventListener('click', () => {
      bgMusic.play({ loop: true, volume: 0.5 });
    }, { once: true });
  }
}
```

---

## Common Patterns

### Separate Music and SFX Volume

Until a first-party SoundManager ships, manage volume groups manually:

```typescript
class AudioManager {
  private musicTracks: Sound[] = [];
  private sfxTracks: Sound[] = [];
  private _musicVolume = 0.5;
  private _sfxVolume = 0.8;

  registerMusic(...sounds: Sound[]): void {
    this.musicTracks.push(...sounds);
  }

  registerSfx(...sounds: Sound[]): void {
    this.sfxTracks.push(...sounds);
  }

  set musicVolume(v: number) {
    this._musicVolume = Math.max(0, Math.min(1, v));
    for (const s of this.musicTracks) s.volume = this._musicVolume;
  }

  set sfxVolume(v: number) {
    this._sfxVolume = Math.max(0, Math.min(1, v));
    for (const s of this.sfxTracks) s.volume = this._sfxVolume;
  }

  get musicVolume(): number { return this._musicVolume; }
  get sfxVolume(): number { return this._sfxVolume; }

  muteAll(): void {
    for (const s of [...this.musicTracks, ...this.sfxTracks]) s.volume = 0;
  }

  restoreAll(): void {
    this.musicVolume = this._musicVolume;
    this.sfxVolume = this._sfxVolume;
  }
}

// Usage
const audio = new AudioManager();
audio.registerMusic(bgMusic);
audio.registerSfx(jumpSfx, coinSfx);
audio.musicVolume = 0.4;
```

### Playing Sound Effects on Actor Events

```typescript
import { Actor, Engine, Sound, Loader, CollisionStartEvent } from 'excalibur';

class Player extends Actor {
  private jumpSound: Sound;

  constructor(jumpSound: Sound) {
    super({ x: 100, y: 300, width: 32, height: 32 });
    this.jumpSound = jumpSound;
  }

  onInitialize(engine: Engine): void {
    // Play sound on jump
    engine.input.keyboard.on('press', (evt) => {
      if (evt.key === 'Space' && this.vel.y === 0) {
        this.jumpSound.play(0.6);
      }
    });

    // Play sound on collision
    this.on('collisionstart', (evt: CollisionStartEvent) => {
      if (evt.other.hasTag('coin')) {
        coinSfx.play(0.8);
        evt.other.kill();
      }
    });
  }
}
```

### Scene-Based Music Transitions

Switch background music when transitioning between scenes:

```typescript
import { Scene, Engine, Sound } from 'excalibur';

class MenuScene extends Scene {
  private menuMusic: Sound;

  constructor(menuMusic: Sound) {
    super();
    this.menuMusic = menuMusic;
  }

  onActivate(): void {
    this.menuMusic.loop = true;
    this.menuMusic.play(0.5);
  }

  onDeactivate(): void {
    this.menuMusic.stop();
  }
}

class GameScene extends Scene {
  private gameMusic: Sound;

  constructor(gameMusic: Sound) {
    super();
    this.gameMusic = gameMusic;
  }

  onActivate(): void {
    this.gameMusic.loop = true;
    this.gameMusic.play(0.6);
  }

  onDeactivate(): void {
    this.gameMusic.stop();
  }
}
```

### Pause/Resume with Game Visibility

Mute audio when the browser tab is hidden:

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    bgMusic.pause();
  } else {
    bgMusic.play();
  }
});
```

---

## Performance and Mobile Notes

- **File sizes:** Use MP3 at 128–192 kbps for music, lower bitrates for short SFX. WAV is large — use only as a fallback codec, not as the primary format.
- **Preload strategically:** Load all sounds needed for a scene in the `Loader`. Streaming is not built-in — large music files increase initial load time.
- **Mobile latency:** Web Audio on mobile can have ~100ms latency. For rhythm games or frame-precise effects, preload and keep sounds ready rather than loading on demand.
- **iOS Safari:** Requires a user gesture to unlock the AudioContext. Excalibur's Loader button handles this. If you bypass the Loader, explicitly resume the AudioContext on first touch.
- **Instance limits:** Browsers limit concurrent audio instances. Avoid firing dozens of overlapping sounds per frame — pool or debounce rapid effects.

---

## Cross-Framework Comparison

| Concept              | Excalibur                | Phaser                          | Kaplay                     | PixiJS                      |
|----------------------|--------------------------|---------------------------------|----------------------------|-----------------------------|
| Sound class          | `new Sound(...paths)`    | `this.load.audio()` + manager   | `k.loadSound()`            | `@pixi/sound` plugin        |
| Play sound           | `sound.play(vol)`        | `this.sound.play('key')`        | `k.play('name')`           | `sound.play('name')`        |
| Loop                 | `sound.loop = true`      | `{ loop: true }` in config      | `k.play('name', { loop })` | `sound.play({ loop: true })` |
| Volume control       | `sound.volume = 0.5`     | `sound.setVolume(0.5)`          | `k.volume(0.5)`            | `sound.volume = 0.5`        |
| Pause/resume         | `pause()` / `play()`     | `pause()` / `resume()`          | Not built-in               | `pause()` / `resume()`      |
| Loader integration   | `Loader` resource system | Scene `preload` method           | `loadSound()` auto-loads   | `Assets.load()`             |
