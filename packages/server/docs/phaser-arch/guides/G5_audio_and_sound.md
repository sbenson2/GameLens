# Audio and Sound Management

> **Category:** guide · **Engine:** Phaser · **Related:** [Scene Lifecycle](G1_scene_lifecycle.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Phaser's built-in Sound Manager provides a unified API across Web Audio and HTML5 Audio backends. The framework auto-detects browser capabilities, preferring Web Audio for lower latency and richer features, falling back to the Audio Tag when needed.

## Loading Audio Assets

Load audio in a scene's `preload` method. Provide multiple formats so Phaser serves the best match for the user's browser:

```typescript
class GameScene extends Phaser.Scene {
  preload(): void {
    // Provide MP3 + OGG for broad browser coverage
    this.load.audio('bgm', ['audio/music.ogg', 'audio/music.mp3']);
    this.load.audio('jump', ['audio/jump.ogg', 'audio/jump.mp3']);
    this.load.audio('coin', ['audio/coin.ogg', 'audio/coin.mp3']);
  }
}
```

**Recommended formats:** OGG Vorbis (best compression, broad support) and MP3 (universal fallback). Always provide at least MP3 for published games.

## Playing Sounds

### Fire-and-Forget

For one-shot effects that need no further control, call `play` directly on the sound manager. The sound instance is destroyed automatically after playback completes:

```typescript
// Simple playback
this.sound.play('jump');

// With config overrides
this.sound.play('coin', { volume: 0.6, rate: 1.2 });
```

### Persistent Sound Instances

For music or sounds you need to pause, loop, or adjust at runtime, create a persistent reference:

```typescript
class GameScene extends Phaser.Scene {
  private music!: Phaser.Sound.BaseSound;

  create(): void {
    this.music = this.sound.add('bgm', {
      volume: 0.4,
      loop: true
    });

    this.music.play();
  }
}
```

## Browser Autoplay Policy

Modern browsers block audio until a user gesture (click or tap) occurs. Phaser handles this automatically by suspending the AudioContext and resuming it after the first interaction.

Check and respond to the locked state:

```typescript
create(): void {
  if (this.sound.locked) {
    // Audio context is locked — wait for unlock
    this.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
      this.startBackgroundMusic();
    });
  } else {
    this.startBackgroundMusic();
  }
}

private startBackgroundMusic(): void {
  this.sound.play('bgm', { loop: true, volume: 0.3 });
}
```

**Best practice:** Never call `music.play()` unconditionally in `create`. Always check `this.sound.locked` or listen for `UNLOCKED` to avoid console warnings.

## Sound Instance Controls

Persistent sound instances expose rich runtime controls:

```typescript
const music = this.sound.add('bgm');
music.play();

// Volume: 0 (silent) to 1 (full)
music.setVolume(0.5);

// Mute without changing volume level
music.setMute(true);

// Playback speed: 0.5 = half, 2.0 = double
music.setRate(1.5);

// Seek to a specific time in seconds
music.setSeek(30);

// Loop toggle
music.setLoop(true);

// Detune in cents: -1200 to 1200 (one octave down/up)
music.setDetune(-200);

// Check state
console.log(music.isPlaying);  // boolean
console.log(music.duration);   // total duration in seconds
```

## Sound Events

Sound instances emit events you can hook into for game logic:

```typescript
const sfx = this.sound.add('explosion');

sfx.on('play', () => {
  console.log('Explosion started');
});

sfx.on('complete', () => {
  console.log('Explosion finished');
  this.cameras.main.shake(100, 0.01);
});

sfx.on('looped', () => {
  console.log('Sound looped');
});

// Available events: play, complete, looped, pause,
// resume, stop, mute, volume, detune, rate, seek, loop
```

## Audio Sprites

Audio sprites bundle multiple short sounds into a single file with a JSON marker map, reducing HTTP requests. Use the [audiosprite](https://github.com/tonistiigi/audiosprite) tool to generate them:

```typescript
preload(): void {
  this.load.audioSprite('sfx', 'audio/sfx.json', [
    'audio/sfx.ogg',
    'audio/sfx.mp3'
  ]);
}

create(): void {
  // Play a named marker from the sprite
  this.sound.playAudioSprite('sfx', 'laser');
  this.sound.playAudioSprite('sfx', 'powerup', { volume: 0.8 });
}
```

## Markers

Markers define named time regions within a single audio file. Useful for sectioning a long music track:

```typescript
const music = this.sound.add('bgm');

music.addMarker({
  name: 'intro',
  start: 0,
  duration: 8,
  config: { volume: 0.6 }
});

music.addMarker({
  name: 'battle',
  start: 8,
  duration: 32,
  config: { volume: 0.8, loop: true }
});

// Play a specific section
music.play('intro');

// Transition after intro ends
music.once('complete', () => {
  music.play('battle');
});
```

## Spatial Audio (Web Audio Only)

Phaser's Web Audio backend supports 3D positional sound. Attach a sound source to a game object so audio pans and attenuates based on distance:

```typescript
create(): void {
  const enemy = this.add.sprite(600, 300, 'enemy');

  const growl = this.sound.add('growl', {
    loop: true,
    source: {
      x: enemy.x,
      y: enemy.y,
      z: 0,
      panningModel: 'HRTF',        // or 'equalpower'
      distanceModel: 'inverse',     // 'linear' or 'exponential'
      refDistance: 50,
      maxDistance: 800,
      rolloffFactor: 1,
      follow: enemy                 // auto-tracks object position
    }
  });

  growl.play();

  // Set listener position (typically the player)
  this.sound.setListenerPosition(this.player.x, this.player.y);
}

update(): void {
  // Update listener each frame to match player movement
  this.sound.setListenerPosition(this.player.x, this.player.y);
}
```

**Panning models:** `equalpower` is lightweight and suitable for most games. `HRTF` provides more realistic head-related transfer function spatialization but uses more CPU.

## Global Sound Manager Controls

Control all audio at once through the scene's sound manager:

```typescript
// Master volume
this.sound.volume = 0.5;

// Mute everything
this.sound.mute = true;

// Stop all sounds
this.sound.stopAll();

// Remove all sounds and free memory
this.sound.removeAll();

// Query active sounds
const allSounds = this.sound.getAll('bgm');
const playing = this.sound.getAllPlaying();
```

## Audio Analysis and Visualization

The Web Audio API exposes an AnalyserNode for frequency/waveform data — useful for rhythm games or audio visualizers:

```typescript
create(): void {
  const analyser = this.sound.context.createAnalyser();
  analyser.fftSize = 2048;

  this.sound.masterVolumeNode.connect(analyser);
  analyser.connect(this.sound.context.destination);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  this.events.on('update', () => {
    analyser.getByteFrequencyData(dataArray);
    // Use dataArray values (0-255) for visualization
  });
}
```

## Disabling Audio

For testing or accessibility options:

```typescript
// In game config
const config: Phaser.Types.Core.GameConfig = {
  audio: {
    disableWebAudio: true,  // Force HTML5 Audio fallback
    // noAudio: true         // Disable audio entirely
  }
};
```

## Best Practices

1. **Always provide OGG + MP3** for maximum browser compatibility.
2. **Handle the locked state** — listen for `UNLOCKED` before playing music.
3. **Use audio sprites** for many short SFX to reduce HTTP requests and loading time.
4. **Pool one-shot sounds** — `this.sound.play()` auto-destroys, but calling it rapidly can stack instances. For rapid-fire effects, reuse a persistent instance.
5. **Pause audio on scene sleep** — stop or pause music in `shutdown` or `sleep` events to prevent orphaned playback.
6. **Compress wisely** — OGG at quality 3–5 (96–160 kbps) is a good balance for game SFX; use higher quality for music.
7. **Use spatial audio sparingly** — HRTF panning is CPU-intensive; prefer `equalpower` unless realism is critical.
8. **Preload everything** — streaming is not natively supported; load all audio in `preload` to avoid playback delays.
