# G106 — Game Telemetry & Analytics

> **Category:** guide · **Engine:** MonoGame · **Related:** [G69 Save/Load Serialization](./G69_save_load_serialization.md) · [G51 Crash Reporting](./G51_crash_reporting.md) · [G33 Profiling & Optimization](./G33_profiling_optimization.md) · [G55 Settings Menu](./G55_settings_menu.md) · [G47 Achievements](./G47_achievements.md) · [G12 Design Patterns](./G12_design_patterns.md)

How to instrument a MonoGame game with **telemetry and analytics**: tracking player behavior, performance metrics, and gameplay events for balancing, debugging, and understanding your audience. Covers a lightweight local-first architecture, privacy-aware design, common event schemas, and optional backend integration.

---

## Why Telemetry Matters for Game Dev

Telemetry answers questions you can't answer by playtesting alone:

- **Balance:** Where do players die most? Which weapons are never picked? Which level takes 3× longer than designed?
- **Performance:** What hardware hits <30fps? Which scenes spike memory?
- **Retention:** How many players finish the tutorial? Where do they quit?
- **Bugs:** What state combinations produce crashes that never happen in QA?

Without data, you're guessing. With data, you're iterating.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                    Game Runtime                    │
│                                                    │
│  ┌──────────┐   ┌──────────────┐   ┌───────────┐ │
│  │ Event     │──▶│ Telemetry    │──▶│ Transport │ │
│  │ Sources   │   │ Collector    │   │ Layer     │ │
│  │           │   │              │   │           │ │
│  │ • Combat  │   │ • Buffering  │   │ • Local   │ │
│  │ • Scene   │   │ • Sampling   │   │   (JSON)  │ │
│  │ • Perf    │   │ • Session    │   │ • HTTP    │ │
│  │ • Input   │   │   context    │   │ • Custom  │ │
│  └──────────┘   └──────────────┘   └───────────┘ │
│                                          │         │
└──────────────────────────────────────────│─────────┘
                                           ▼
                                   ┌──────────────┐
                                   │ Storage      │
                                   │ • Local file │
                                   │ • REST API   │
                                   │ • SQLite     │
                                   └──────────────┘
```

### Design Principles

1. **Local-first.** Always write to a local file. Network sends are optional and async.
2. **Non-blocking.** Telemetry must never cause frame drops. Buffer events, flush on a background thread.
3. **Privacy-aware.** No PII by default. Use anonymous session IDs. Let players opt out.
4. **Lightweight.** The system should add <0.1ms per frame overhead.

---

## Core Implementation

### Event Model

```csharp
/// <summary>
/// A single telemetry event. All events share this envelope.
/// The Data dictionary carries event-specific payload.
/// </summary>
public readonly struct TelemetryEvent
{
    public string EventName { get; init; }
    public DateTime Timestamp { get; init; }
    public string SessionId { get; init; }
    public Dictionary<string, object> Data { get; init; }
}
```

### Telemetry Collector

The collector is the central hub. Game systems fire events into it; it handles buffering, session context, and flushing.

```csharp
public class TelemetryCollector : IDisposable
{
    private readonly ConcurrentQueue<TelemetryEvent> _buffer = new();
    private readonly List<ITelemetryTransport> _transports = new();
    private readonly string _sessionId;
    private readonly Timer _flushTimer;
    private readonly int _flushIntervalMs;
    private bool _enabled = true;

    public TelemetryCollector(int flushIntervalMs = 30_000)
    {
        _sessionId = Guid.NewGuid().ToString("N")[..12]; // Short anonymous ID
        _flushIntervalMs = flushIntervalMs;

        // Flush on a timer to avoid frame-time spikes
        _flushTimer = new Timer(_ => Flush(), null, flushIntervalMs, flushIntervalMs);
    }

    /// <summary>
    /// Register a transport (local file, HTTP endpoint, etc.).
    /// </summary>
    public void AddTransport(ITelemetryTransport transport)
        => _transports.Add(transport);

    /// <summary>
    /// Record an event. This is lock-free and allocation-light.
    /// Call from any thread (game loop, physics, AI).
    /// </summary>
    public void Track(string eventName, Dictionary<string, object>? data = null)
    {
        if (!_enabled) return;

        _buffer.Enqueue(new TelemetryEvent
        {
            EventName = eventName,
            Timestamp = DateTime.UtcNow,
            SessionId = _sessionId,
            Data = data ?? new Dictionary<string, object>()
        });
    }

    /// <summary>
    /// Convenience overload for simple key-value events.
    /// </summary>
    public void Track(string eventName, string key, object value)
        => Track(eventName, new Dictionary<string, object> { [key] = value });

    /// <summary>
    /// Drain the buffer and send to all transports. Called on the timer thread.
    /// </summary>
    public void Flush()
    {
        var batch = new List<TelemetryEvent>();
        while (_buffer.TryDequeue(out var evt))
        {
            batch.Add(evt);
        }

        if (batch.Count == 0) return;

        foreach (var transport in _transports)
        {
            try
            {
                transport.Send(batch);
            }
            catch (Exception ex)
            {
                // Telemetry must never crash the game
                System.Diagnostics.Debug.WriteLine(
                    $"[Telemetry] Transport error: {ex.Message}");
            }
        }
    }

    public void SetEnabled(bool enabled) => _enabled = enabled;

    public void Dispose()
    {
        _flushTimer.Dispose();
        Flush(); // Final drain
        foreach (var t in _transports)
            (t as IDisposable)?.Dispose();
    }
}
```

### Transport Interface

```csharp
public interface ITelemetryTransport
{
    void Send(IReadOnlyList<TelemetryEvent> batch);
}
```

---

## Transports

### Local JSON File Transport

The simplest transport. Writes newline-delimited JSON (NDJSON) to a file in the game's data directory. Easy to analyze with any tool.

```csharp
public class LocalFileTransport : ITelemetryTransport, IDisposable
{
    private readonly StreamWriter _writer;
    private readonly object _lock = new();

    public LocalFileTransport(string directory)
    {
        Directory.CreateDirectory(directory);
        var filename = $"telemetry_{DateTime.UtcNow:yyyyMMdd_HHmmss}.ndjson";
        var path = Path.Combine(directory, filename);
        _writer = new StreamWriter(path, append: true) { AutoFlush = false };
    }

    public void Send(IReadOnlyList<TelemetryEvent> batch)
    {
        lock (_lock)
        {
            foreach (var evt in batch)
            {
                _writer.WriteLine(JsonSerializer.Serialize(evt));
            }
            _writer.Flush();
        }
    }

    public void Dispose() => _writer.Dispose();
}
```

Output example (one line per event):

```json
{"EventName":"player_death","Timestamp":"2026-04-08T14:32:01Z","SessionId":"a3f2b1c9e8d7","Data":{"scene":"dungeon_3","enemy":"skeleton_archer","player_hp":0,"time_in_scene":42.5}}
{"EventName":"scene_loaded","Timestamp":"2026-04-08T14:32:05Z","SessionId":"a3f2b1c9e8d7","Data":{"scene":"dungeon_3","load_time_ms":245}}
```

### HTTP Transport (Optional)

For games that send telemetry to a backend. Uses fire-and-forget HTTP to avoid blocking.

```csharp
public class HttpTransport : ITelemetryTransport
{
    private readonly HttpClient _client;
    private readonly string _endpoint;

    public HttpTransport(string endpoint)
    {
        _endpoint = endpoint;
        _client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
    }

    public void Send(IReadOnlyList<TelemetryEvent> batch)
    {
        var json = JsonSerializer.Serialize(batch);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        // Fire and forget — don't await in the telemetry path
        _ = _client.PostAsync(_endpoint, content).ConfigureAwait(false);
    }
}
```

> **Note:** For indie/solo projects, local file transport is usually sufficient. Analyze the NDJSON files with Python, Excel, or a tool like DuckDB. HTTP transport adds complexity (auth, rate limiting, server costs) that's only worth it for live-service games.

---

## Common Event Schemas

Standardize your event names and data fields so analysis queries are consistent.

### Session Events

```csharp
// Session start — track hardware, settings, and game version
telemetry.Track("session_start", new Dictionary<string, object>
{
    ["game_version"] = "1.2.0",
    ["os"] = Environment.OSVersion.ToString(),
    ["gpu"] = GraphicsDevice.Adapter.Description,
    ["resolution"] = $"{graphics.PreferredBackBufferWidth}x{graphics.PreferredBackBufferHeight}",
    ["fullscreen"] = graphics.IsFullScreen
});

// Session end
telemetry.Track("session_end", new Dictionary<string, object>
{
    ["duration_seconds"] = sessionTimer.Elapsed.TotalSeconds,
    ["scenes_visited"] = scenesVisited.Count
});
```

### Gameplay Events

```csharp
// Player death — where, why, when
telemetry.Track("player_death", new Dictionary<string, object>
{
    ["scene"] = currentScene.Name,
    ["position_x"] = player.Position.X,
    ["position_y"] = player.Position.Y,
    ["cause"] = damageSource.Name,
    ["player_hp"] = player.Health,
    ["time_in_scene"] = sceneTimer.Elapsed.TotalSeconds,
    ["attempt"] = deathCount
});

// Level completed
telemetry.Track("level_complete", new Dictionary<string, object>
{
    ["scene"] = currentScene.Name,
    ["time_seconds"] = sceneTimer.Elapsed.TotalSeconds,
    ["deaths"] = deathsThisLevel,
    ["secrets_found"] = secretsFound,
    ["score"] = score
});

// Item pickup / weapon use
telemetry.Track("item_acquired", new Dictionary<string, object>
{
    ["item_id"] = item.Id,
    ["item_name"] = item.Name,
    ["scene"] = currentScene.Name
});
```

### Performance Events

```csharp
// Periodic performance snapshot (every 60 seconds)
telemetry.Track("perf_snapshot", new Dictionary<string, object>
{
    ["scene"] = currentScene.Name,
    ["fps_avg"] = fpsCounter.Average,
    ["fps_min"] = fpsCounter.Minimum,
    ["frame_time_p95_ms"] = frameTimeTracker.Percentile95,
    ["gc_collections_gen0"] = GC.CollectionCount(0),
    ["gc_collections_gen1"] = GC.CollectionCount(1),
    ["managed_memory_mb"] = GC.GetTotalMemory(false) / (1024.0 * 1024.0)
});
```

---

## Performance Sampling

Not every event needs to be recorded. For high-frequency events (enemy AI decisions, physics contacts), use sampling to keep overhead negligible.

```csharp
public class SampledTracker
{
    private readonly TelemetryCollector _collector;
    private readonly Random _rng = new();
    private readonly double _sampleRate;

    /// <param name="sampleRate">0.0 to 1.0 — fraction of events to keep</param>
    public SampledTracker(TelemetryCollector collector, double sampleRate = 0.1)
    {
        _collector = collector;
        _sampleRate = sampleRate;
    }

    public void Track(string eventName, Dictionary<string, object>? data = null)
    {
        if (_rng.NextDouble() > _sampleRate) return;

        data ??= new Dictionary<string, object>();
        data["_sample_rate"] = _sampleRate; // Store rate for statistical correction
        _collector.Track(eventName, data);
    }
}

// Usage: only record 10% of AI decision events
var aiTracker = new SampledTracker(telemetry, sampleRate: 0.1);
aiTracker.Track("ai_decision", new Dictionary<string, object>
{
    ["entity_id"] = entity.Id,
    ["state_from"] = previousState,
    ["state_to"] = newState,
    ["reason"] = decisionReason
});
```

When analyzing sampled data, multiply counts by `1 / _sample_rate` to estimate true totals.

---

## Integration with MonoGame

### Registering the Collector

```csharp
public class MyGame : Game
{
    private TelemetryCollector _telemetry;

    protected override void Initialize()
    {
        base.Initialize();

        _telemetry = new TelemetryCollector(flushIntervalMs: 30_000);
        _telemetry.AddTransport(new LocalFileTransport(
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MyGame", "telemetry")));

        // Make available to all systems via Services
        Services.AddService(_telemetry);

        _telemetry.Track("session_start", new Dictionary<string, object>
        {
            ["game_version"] = "1.0.0"
        });
    }

    protected override void OnExiting(object sender, EventArgs args)
    {
        _telemetry.Track("session_end");
        _telemetry.Dispose(); // Flushes remaining events
        base.OnExiting(sender, args);
    }
}
```

### ECS Integration (Arch)

If using Arch ECS (see [G77 ECS Event Messaging](./G77_ecs_event_messaging.md)), create a telemetry system that listens for game events:

```csharp
public partial class TelemetrySystem : BaseSystem<World, GameTime>
{
    private readonly TelemetryCollector _telemetry;

    public TelemetrySystem(World world, TelemetryCollector telemetry) : base(world)
    {
        _telemetry = telemetry;
    }

    // Query for entities that just died this frame
    [Query]
    [All<DeathEvent, Position, Health>]
    public void TrackDeaths(ref DeathEvent death, ref Position pos, ref Health hp)
    {
        _telemetry.Track("player_death", new Dictionary<string, object>
        {
            ["position_x"] = pos.X,
            ["position_y"] = pos.Y,
            ["cause"] = death.Source,
            ["scene"] = death.Scene
        });
    }
}
```

---

## Privacy & Opt-Out

### Principles

- **No PII.** Session IDs are random, not tied to accounts or hardware fingerprints.
- **Opt-out.** Provide a settings toggle (see [G55 Settings Menu](./G55_settings_menu.md)). Respect it immediately.
- **Transparency.** If you ship with telemetry enabled by default, disclose it in your privacy policy and settings screen.
- **Local by default.** Local file transport has no privacy implications — the data stays on the player's machine.

### Settings Integration

```csharp
// In your settings system
if (!settings.TelemetryEnabled)
{
    telemetry.SetEnabled(false);
}

// React to setting changes at runtime
settings.OnChanged += (key, value) =>
{
    if (key == "telemetry_enabled")
        telemetry.SetEnabled((bool)value);
};
```

### Platform Considerations

- **Steam:** Steamworks doesn't restrict telemetry, but Steam's privacy guidelines recommend disclosure.
- **Mobile (Google Play / App Store):** Both require privacy policy disclosure if you collect any data, even anonymous analytics.
- **GDPR/CCPA:** If your HTTP transport sends data to a server, you're subject to data protection regulations. Local-only telemetry avoids this entirely.

---

## Analysis Patterns

### Quick Analysis with Python

```python
import json
import pandas as pd

# Load NDJSON telemetry file
events = []
with open("telemetry_20260408_143201.ndjson") as f:
    for line in f:
        events.append(json.loads(line))

df = pd.DataFrame(events)

# Death heatmap data
deaths = df[df.EventName == "player_death"]
death_positions = pd.json_normalize(deaths.Data)
print(death_positions.groupby("scene")["cause"].value_counts())

# Average level completion time
completions = df[df.EventName == "level_complete"]
comp_data = pd.json_normalize(completions.Data)
print(comp_data.groupby("scene")["time_seconds"].mean())
```

### DuckDB for Larger Datasets

```sql
-- Load NDJSON directly
SELECT
    Data->>'scene' AS scene,
    Data->>'cause' AS cause,
    COUNT(*) AS deaths
FROM read_ndjson_auto('telemetry_*.ndjson')
WHERE EventName = 'player_death'
GROUP BY scene, cause
ORDER BY deaths DESC;
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Frame drops during flush | Flushing on game thread | Ensure flush runs on Timer thread, not Update() |
| File not created | Directory doesn't exist | `Directory.CreateDirectory()` in transport constructor |
| Events missing after crash | Buffer not flushed | Reduce `flushIntervalMs` or flush on scene transitions |
| JSON parsing errors | Event Data contains non-serializable types | Only put primitives and strings in Data dictionary |
| Large telemetry files | Too many high-frequency events | Use `SampledTracker` for AI/physics events |

---

## Further Reading

- [G51 Crash Reporting](./G51_crash_reporting.md) — complementary system for error capture
- [G33 Profiling & Optimization](./G33_profiling_optimization.md) — runtime performance analysis
- [G47 Achievements](./G47_achievements.md) — often driven by the same gameplay events
- [G69 Save/Load Serialization](./G69_save_load_serialization.md) — session state persistence patterns
