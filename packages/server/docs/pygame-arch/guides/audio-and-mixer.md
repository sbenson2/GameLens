# Audio & Mixer System

> **Category:** guide · **Engine:** Pygame · **Related:** [game-loop-and-state](../architecture/game-loop-and-state.md), [sprites-and-collision](sprites-and-collision.md)

Pygame's audio system is split into two subsystems: `pygame.mixer` for sound effects (short clips loaded fully into memory) and `pygame.mixer.music` for streaming background music from disk. Both run in background threads so playback never blocks your game loop.

---

## Initialization

Always call `pre_init()` before `pygame.init()` to control audio quality and latency:

```python
import pygame

# Configure mixer BEFORE pygame.init()
pygame.mixer.pre_init(
    frequency=44100,   # Sample rate (CD quality)
    size=-16,          # 16-bit signed audio
    channels=2,        # Stereo
    buffer=512         # Lower = less latency, risk of dropout
)
pygame.init()
```

### Parameter guidance

| Parameter   | Default | Notes |
|------------|---------|-------|
| `frequency` | 44100   | 22050 is fine for retro games; 48000 for high-fidelity |
| `size`      | -16     | Negative = signed samples. -16 is standard |
| `channels`  | 2       | 1=mono, 2=stereo, 4/6 for surround (pygame 2.0+) |
| `buffer`    | 512     | Power of 2. 256 for low latency, 1024+ for stability |

Check current settings with `pygame.mixer.get_init()` — returns `(frequency, format, channels)` or `None`.

---

## Sound Effects (pygame.mixer.Sound)

Use `Sound` for short audio clips (SFX, UI feedback, impacts). The entire file is decoded into memory on load.

### Loading sounds

```python
# Preferred formats: WAV (uncompressed, fast load) or OGG (compressed, smaller)
jump_sfx = pygame.mixer.Sound("assets/sounds/jump.wav")
hit_sfx = pygame.mixer.Sound("assets/sounds/hit.ogg")

# From a bytes buffer (useful for procedural audio)
import struct
raw = struct.pack('h' * 44100, *[int(32767 * math.sin(2 * math.pi * 440 * t / 44100)) for t in range(44100)])
tone = pygame.mixer.Sound(buffer=raw)
```

### Playback

```python
# Basic play — returns the Channel object used
channel = jump_sfx.play()

# Loop 3 times (plays 4 total), with 500ms fade-in
jump_sfx.play(loops=3, fade_ms=500)

# Play for max 2 seconds
jump_sfx.play(maxtime=2000)

# Stop all instances of this sound
jump_sfx.stop()

# Fade out over 1 second
jump_sfx.fadeout(1000)
```

### Volume

```python
# Per-sound volume (0.0 to 1.0)
jump_sfx.set_volume(0.6)
current_vol = jump_sfx.get_volume()

# Useful info
duration = jump_sfx.get_length()           # Duration in seconds
active_count = jump_sfx.get_num_channels() # How many channels playing this sound
```

---

## Background Music (pygame.mixer.music)

Use `mixer.music` for long tracks. Audio streams from disk — only one music track plays at a time.

```python
# Load and play (loops=-1 means loop forever)
pygame.mixer.music.load("assets/music/overworld.ogg")
pygame.mixer.music.set_volume(0.5)
pygame.mixer.music.play(loops=-1)

# Crossfade to a new track
pygame.mixer.music.fadeout(1000)  # Fade current track
# After fadeout completes, load + play the next:
pygame.mixer.music.load("assets/music/battle.ogg")
pygame.mixer.music.play(loops=-1, fade_ms=1000)

# Queue a follow-up track (plays after current finishes)
pygame.mixer.music.queue("assets/music/victory.ogg")

# Pause / resume / rewind
pygame.mixer.music.pause()
pygame.mixer.music.unpause()
pygame.mixer.music.rewind()

# Check state
is_playing = pygame.mixer.music.get_busy()  # True if actively playing
position = pygame.mixer.music.get_pos()      # Milliseconds since play() called
```

### End-of-track events

```python
# Get notified when a music track finishes
MUSIC_END = pygame.USEREVENT + 1
pygame.mixer.music.set_endevent(MUSIC_END)

# In your event loop:
for event in pygame.event.get():
    if event.type == MUSIC_END:
        play_next_track()
```

---

## Channels

Pygame defaults to 8 mixer channels. Each channel can play one Sound at a time. Music uses a separate, dedicated channel.

```python
# Increase available channels for busy soundscapes
pygame.mixer.set_num_channels(16)

# Reserve channels 0-1 for important sounds (UI, player)
pygame.mixer.set_reserved(2)
ui_channel = pygame.mixer.Channel(0)
player_channel = pygame.mixer.Channel(1)

# Play on a specific channel
ui_channel.play(click_sfx)

# Stereo panning (left=1.0, right=0.0 → full left)
player_channel.set_volume(0.8, 0.2)  # mostly left speaker

# Find a free channel automatically
free = pygame.mixer.find_channel()       # Returns None if all busy
forced = pygame.mixer.find_channel(True) # Force: steals longest-playing channel

# Queue a sound to play after current one on this channel
player_channel.queue(land_sfx)

# Per-channel end event
player_channel.set_endevent(pygame.USEREVENT + 2)
```

---

## Audio Manager Pattern

A centralized audio manager prevents scattered `Sound` objects and gives you global volume control:

```python
class AudioManager:
    """Centralized audio management with volume categories."""

    def __init__(self):
        self.sounds: dict[str, pygame.mixer.Sound] = {}
        self.volumes = {"master": 1.0, "sfx": 0.8, "music": 0.5}

    def load_sound(self, name: str, path: str) -> None:
        self.sounds[name] = pygame.mixer.Sound(path)

    def play_sfx(self, name: str, loops: int = 0) -> pygame.mixer.Channel | None:
        sound = self.sounds.get(name)
        if sound is None:
            return None
        # Effective volume = master * category
        sound.set_volume(self.volumes["master"] * self.volumes["sfx"])
        return sound.play(loops=loops)

    def play_music(self, path: str, loops: int = -1, fade_ms: int = 0) -> None:
        pygame.mixer.music.load(path)
        pygame.mixer.music.set_volume(self.volumes["master"] * self.volumes["music"])
        pygame.mixer.music.play(loops=loops, fade_ms=fade_ms)

    def set_volume(self, category: str, value: float) -> None:
        self.volumes[category] = max(0.0, min(1.0, value))
        # Re-apply music volume immediately
        if category in ("master", "music"):
            pygame.mixer.music.set_volume(
                self.volumes["master"] * self.volumes["music"]
            )

    def stop_all(self) -> None:
        pygame.mixer.stop()
        pygame.mixer.music.stop()
```

---

## pygame-ce Differences

| Feature | pygame | pygame-ce |
|---------|--------|-----------|
| `mixer.init()` defaults | buffer=512 | buffer=512 (same) |
| MP3 support | Via SDL_mixer | Improved MP3 decoding |
| `Sound.play()` return | Channel or None | Channel or None (same) |

pygame-ce does not add new mixer APIs — the audio subsystem is largely identical. The main difference is improved underlying SDL_mixer version with better codec support.

---

## Format Recommendations

| Use case | Format | Why |
|----------|--------|-----|
| Short SFX (<5s) | WAV | Zero decode overhead, instant playback |
| Longer SFX (5-30s) | OGG Vorbis | Good compression, low CPU decode |
| Background music | OGG Vorbis | Streams from disk, small file size |
| Voice lines | OGG Vorbis | Balance of quality and size |

Avoid MP3 for distribution — OGG Vorbis is patent-free and equally supported. WAV files should be 16-bit, same sample rate as your mixer init.

---

## Common Pitfalls

1. **Loading music as Sound** — `Sound("long_track.ogg")` loads the entire file into RAM. Use `mixer.music.load()` for anything over ~10 seconds.
2. **Not calling `pre_init()`** — if you call `pygame.init()` first, the mixer uses defaults that may not match your audio files, causing distortion or high latency.
3. **Running out of channels** — with 8 default channels, rapid SFX (bullets, particles) can silently fail. Increase with `set_num_channels()`.
4. **Volume stacking** — Sound volume × Channel volume = effective volume. If both are 1.0, you're fine. But setting both to 0.5 gives 0.25 effective volume.
5. **Forgetting to handle `MUSIC_END`** — without an end event, you won't know when to queue the next track in a playlist.
6. **Playing sounds before init** — calling `Sound.play()` before mixer is initialized raises an error. Always verify with `pygame.mixer.get_init()`.
