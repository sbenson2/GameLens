# G66 — Analytics and Player Telemetry

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G11 Save & Load Systems](./G11_save_load_systems.md) · [G22 Mobile & Web Export](./G22_mobile_and_web_export.md) · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) · [G42 Platform Integration & Steamworks](./G42_platform_integration_and_steamworks.md)

---

## What This Guide Covers

Understanding how players actually play your game is as important as building it. Analytics and telemetry let you answer questions like "where do players quit?", "which levels are too hard?", "what items do players never use?", and "is my tutorial effective?" — with data instead of guesswork.

This guide covers designing a telemetry system for Godot games, implementing it as an autoload singleton, batching and sending events to a backend, integrating with third-party analytics services, respecting player privacy, and the specific events every indie game should track.

**Use analytics when:** you're playtesting, running a beta, soft-launching, or operating a live game and need data to make design decisions.

**Be cautious about:** tracking too much (noise drowns signal), tracking without consent (legal and ethical issues), and letting analytics delay your frame budget.

---

## Table of Contents

1. [Core Architecture — The Event Singleton](#1-core-architecture--the-event-singleton)
2. [Event Design — What to Track](#2-event-design--what-to-track)
3. [Batching and Network Transport](#3-batching-and-network-transport)
4. [Third-Party Integrations](#4-third-party-integrations)
5. [Custom Backend with HTTPRequest](#5-custom-backend-with-httprequest)
6. [Privacy and Consent](#6-privacy-and-consent)
7. [Offline Queuing and Retry](#7-offline-queuing-and-retry)
8. [Performance Considerations](#8-performance-considerations)
9. [Playtesting-Specific Telemetry](#9-playtesting-specific-telemetry)
10. [C# Equivalents](#10-c-equivalents)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. Core Architecture — The Event Singleton

The standard pattern is an **Autoload singleton** that any node can call to record events. Events are queued in memory, batched, and sent to a backend on a timer or at key moments (scene transitions, quit).

```gdscript
# analytics.gd — register as Autoload "Analytics"
extends Node

## Configuration
@export var endpoint_url: String = "https://your-backend.com/api/events"
@export var batch_interval: float = 30.0  # Seconds between batch sends
@export var max_batch_size: int = 50
@export var enabled: bool = true

var _event_queue: Array[Dictionary] = []
var _session_id: String = ""
var _user_id: String = ""  # Anonymous persistent ID
var _session_start: int = 0
var _http: HTTPRequest

func _ready() -> void:
    _session_id = _generate_uuid()
    _session_start = Time.get_unix_time_from_system() as int
    _user_id = _get_or_create_user_id()
    
    _http = HTTPRequest.new()
    _http.timeout = 10.0
    add_child(_http)
    
    # Periodic batch flush
    var timer := Timer.new()
    timer.wait_time = batch_interval
    timer.timeout.connect(_flush_batch)
    timer.autostart = true
    add_child(timer)
    
    # Track session start
    track("session_start", {
        "platform": OS.get_name(),
        "locale": OS.get_locale(),
        "version": ProjectSettings.get_setting("application/config/version", "unknown"),
    })

func _notification(what: int) -> void:
    if what == NOTIFICATION_WM_CLOSE_REQUEST:
        track("session_end", {
            "duration_seconds": Time.get_unix_time_from_system() as int - _session_start,
            "events_recorded": _event_queue.size(),
        })
        _flush_batch_sync()  # Blocking send before quit


## ─── Public API ───────────────────────────────────────────────

func track(event_name: String, properties: Dictionary = {}) -> void:
    """Record an analytics event. Call from anywhere: Analytics.track('level_complete', {'level': 3})"""
    if not enabled:
        return
    
    var event := {
        "event": event_name,
        "timestamp": Time.get_unix_time_from_system(),
        "session_id": _session_id,
        "user_id": _user_id,
        "properties": properties,
    }
    _event_queue.append(event)
    
    # Auto-flush if batch is full
    if _event_queue.size() >= max_batch_size:
        _flush_batch()

func track_timed_start(event_name: String) -> void:
    """Start a timer for a named event. Call track_timed_end() to record duration."""
    set_meta("_timer_" + event_name, Time.get_ticks_msec())

func track_timed_end(event_name: String, extra_properties: Dictionary = {}) -> void:
    """End a timed event and record it with automatic duration."""
    var key := "_timer_" + event_name
    if not has_meta(key):
        push_warning("Analytics: No timer started for '%s'" % event_name)
        return
    var start_ms: int = get_meta(key)
    var duration_ms := Time.get_ticks_msec() - start_ms
    remove_meta(key)
    
    var props := extra_properties.duplicate()
    props["duration_ms"] = duration_ms
    track(event_name, props)


## ─── Internals ────────────────────────────────────────────────

func _flush_batch() -> void:
    if _event_queue.is_empty() or _http.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
        return
    
    var batch := _event_queue.duplicate()
    _event_queue.clear()
    
    var json := JSON.stringify({"events": batch})
    var headers := ["Content-Type: application/json"]
    _http.request(endpoint_url, headers, HTTPClient.METHOD_POST, json)

func _flush_batch_sync() -> void:
    """Blocking flush for shutdown — uses a raw HTTPClient."""
    if _event_queue.is_empty():
        return
    var json := JSON.stringify({"events": _event_queue})
    var client := HTTPClient.new()
    # Simple blocking POST — acceptable only during quit
    var url_parts := endpoint_url.split("/", false, 3)
    client.connect_to_host(url_parts[1].trim_prefix("//"), 443)
    # In production, use a more robust sync send or accept event loss on quit

func _get_or_create_user_id() -> String:
    var config := ConfigFile.new()
    var path := "user://analytics_id.cfg"
    if config.load(path) == OK:
        return config.get_value("analytics", "user_id", "")
    var uid := _generate_uuid()
    config.set_value("analytics", "user_id", uid)
    config.save(path)
    return uid

func _generate_uuid() -> String:
    var bytes := PackedByteArray()
    for i in 16:
        bytes.append(randi() % 256)
    return bytes.hex_encode().insert(8, "-").insert(13, "-").insert(18, "-").insert(23, "-")
```

### Usage From Any Node

```gdscript
# In your level script:
func _on_level_complete() -> void:
    Analytics.track("level_complete", {
        "level_id": level_id,
        "time_seconds": elapsed_time,
        "deaths": death_count,
        "score": score,
    })

# In your shop:
func _on_item_purchased(item_id: String, cost: int) -> void:
    Analytics.track("purchase", {
        "item_id": item_id,
        "cost": cost,
        "balance_after": player_gold,
    })

# Timed events:
func _on_boss_fight_started() -> void:
    Analytics.track_timed_start("boss_fight")

func _on_boss_defeated() -> void:
    Analytics.track_timed_end("boss_fight", {"boss_id": boss_id, "attempts": attempt_count})
```

---

## 2. Event Design — What to Track

### The Essential 10 Events

Every game, regardless of genre, benefits from tracking these events:

| Event | Properties | Answers |
|-------|-----------|---------|
| `session_start` | platform, version, locale | Who plays, on what, how often? |
| `session_end` | duration_seconds | How long do sessions last? |
| `level_start` | level_id | What levels do players attempt? |
| `level_complete` | level_id, time, deaths, score | How hard is each level? |
| `level_fail` | level_id, cause, time_played | Where and why do players fail? |
| `tutorial_step` | step_name, step_index | Where do players drop off in the tutorial? |
| `tutorial_complete` | total_time | Does the tutorial work? |
| `death` | cause, position, level_id | Where do players die most? (heatmap data) |
| `purchase` | item_id, currency, cost | What do players buy? |
| `error` | type, message, scene | What's crashing in the wild? |

### Funnel Events

Track conversion funnels for critical flows:

```gdscript
# Main menu → Start game → Complete tutorial → Reach level 5 → First purchase
Analytics.track("funnel_main_menu")
Analytics.track("funnel_game_started")
Analytics.track("funnel_tutorial_complete")
Analytics.track("funnel_reached_level_5")
Analytics.track("funnel_first_purchase")
```

### Position Heatmaps

For death or interaction heatmaps, include position data:

```gdscript
Analytics.track("death", {
    "position_x": global_position.x,
    "position_y": global_position.y,
    "level_id": current_level,
    "cause": death_cause,
})
```

---

## 3. Batching and Network Transport

### Why Batch?

Sending one HTTP request per event would create hundreds of requests per session, hurting performance and flooding your server. Batching sends events in groups on a timer.

### Batch Strategy

```
Event occurs → Queue in memory → Timer fires (every 30s) → Send batch POST
                                  OR batch is full (50 events)
                                  OR scene transition
                                  OR app quitting
```

### Flush on Scene Change

```gdscript
# In your scene manager or transition logic:
func change_scene(path: String) -> void:
    Analytics.track("scene_exit", {"scene": get_tree().current_scene.name})
    Analytics._flush_batch()
    get_tree().change_scene_to_file(path)
```

---

## 4. Third-Party Integrations

### Talo (Game-Specific Analytics)

[Talo](https://trytalo.com) is purpose-built for indie games with a Godot plugin.

```gdscript
# After installing the Talo plugin from AssetLib:
# Configure in Project Settings > Talo
# Then use their API:
Talo.events.track("level_complete", {level = 3, time = 45.2})
Talo.stats.track("enemies_killed", 1)  # Increment stat
```

### Google Analytics 4 (via HTTP)

Use the GA4 Measurement Protocol directly — no SDK needed.

```gdscript
const GA4_ENDPOINT := "https://www.google-analytics.com/mp/collect"
const MEASUREMENT_ID := "G-XXXXXXXXXX"
const API_SECRET := "your_api_secret"

func _send_to_ga4(events: Array) -> void:
    var payload := {
        "client_id": _user_id,
        "events": events.map(func(e: Dictionary) -> Dictionary:
            return {"name": e.event, "params": e.properties}
        ),
    }
    var url := "%s?measurement_id=%s&api_secret=%s" % [GA4_ENDPOINT, MEASUREMENT_ID, API_SECRET]
    _http.request(url, ["Content-Type: application/json"], HTTPClient.METHOD_POST, JSON.stringify(payload))
```

### Firebase (Android/iOS)

For mobile games, use the [Godot Firebase plugin](https://github.com/nicemicro/godot-firebase) or GDExtension-based wrappers. Firebase gives you Analytics, Crashlytics, and Remote Config in one SDK.

### Self-Hosted Options

- **PostHog** (open source) — full analytics suite with feature flags
- **Plausible/Umami** — lightweight, privacy-focused
- **Custom server** — receive JSON POST, store in SQLite/PostgreSQL, build your own dashboards

---

## 5. Custom Backend with HTTPRequest

If you want full control, a minimal backend needs only one endpoint:

### Server (Node.js Example)

```javascript
// server.js — minimal analytics collector
const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());

app.post('/api/events', (req, res) => {
    const { events } = req.body;
    const line = events.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFileSync('events.jsonl', line);  // JSONL for easy processing
    res.status(200).json({ received: events.length });
});

app.listen(3000);
```

### Query with SQLite

For analysis, import the JSONL into SQLite:

```sql
-- Find levels where >30% of players die
SELECT 
    json_extract(data, '$.properties.level_id') AS level_id,
    COUNT(*) FILTER (WHERE json_extract(data, '$.event') = 'level_fail') AS fails,
    COUNT(*) FILTER (WHERE json_extract(data, '$.event') = 'level_start') AS starts,
    ROUND(100.0 * COUNT(*) FILTER (WHERE json_extract(data, '$.event') = 'level_fail') 
        / NULLIF(COUNT(*) FILTER (WHERE json_extract(data, '$.event') = 'level_start'), 0), 1) AS fail_rate
FROM events
GROUP BY level_id
HAVING fail_rate > 30
ORDER BY fail_rate DESC;
```

---

## 6. Privacy and Consent

### Legal Requirements

- **GDPR** (EU) and **CCPA** (California) require informed consent before collecting personal data.
- Even "anonymous" telemetry with persistent user IDs may qualify as personal data under GDPR.
- **COPPA** (US) applies if your game targets children under 13.

### Implementation

```gdscript
# Show consent dialog on first launch
func _check_consent() -> void:
    var config := ConfigFile.new()
    if config.load("user://consent.cfg") != OK:
        _show_consent_dialog()
        return
    Analytics.enabled = config.get_value("privacy", "analytics_consent", false)

func _on_consent_accepted() -> void:
    var config := ConfigFile.new()
    config.set_value("privacy", "analytics_consent", true)
    config.save("user://consent.cfg")
    Analytics.enabled = true

func _on_consent_declined() -> void:
    var config := ConfigFile.new()
    config.set_value("privacy", "analytics_consent", false)
    config.save("user://consent.cfg")
    Analytics.enabled = false
```

### Best Practices

- **Don't collect what you don't need.** If you don't plan to analyze it, don't track it.
- **No PII in events.** Never send player names, emails, or IP addresses in event properties.
- **Let players opt out.** Provide a toggle in Settings. Respect it immediately.
- **Document what you collect.** Your privacy policy should list the event types you track.
- **Steam requires disclosure.** If your game ships on Steam, declare your data collection in the store page privacy section.

---

## 7. Offline Queuing and Retry

Players may lose internet mid-session. Queue events to disk and retry later.

```gdscript
const QUEUE_PATH := "user://analytics_queue.json"

func _save_queue_to_disk() -> void:
    if _event_queue.is_empty():
        return
    var file := FileAccess.open(QUEUE_PATH, FileAccess.WRITE)
    file.store_string(JSON.stringify(_event_queue))

func _load_queue_from_disk() -> void:
    if not FileAccess.file_exists(QUEUE_PATH):
        return
    var file := FileAccess.open(QUEUE_PATH, FileAccess.READ)
    var json := JSON.new()
    if json.parse(file.get_as_text()) == OK and json.data is Array:
        _event_queue.append_array(json.data)
    DirAccess.remove_absolute(QUEUE_PATH)

func _ready() -> void:
    _load_queue_from_disk()  # Recover events from last session
    # ... rest of setup

func _notification(what: int) -> void:
    if what == NOTIFICATION_WM_CLOSE_REQUEST:
        _save_queue_to_disk()  # Persist unsent events
```

---

## 8. Performance Considerations

**Never block the main thread.** `HTTPRequest` is already asynchronous. For the synchronous flush on quit, keep it short — accept that some events may be lost on crash.

**Limit event frequency.** Don't track per-frame data (position every frame). Instead, sample:

```gdscript
# Track position every 5 seconds for heatmaps, not every frame
var _position_timer: float = 0.0

func _physics_process(delta: float) -> void:
    _position_timer += delta
    if _position_timer >= 5.0:
        _position_timer = 0.0
        Analytics.track("position_sample", {
            "x": snapped(global_position.x, 1.0),
            "y": snapped(global_position.y, 1.0),
            "level": current_level,
        })
```

**Keep event payloads small.** Avoid serializing large objects. Stick to primitive types (strings, numbers, bools).

**Batch size tradeoffs.** Small batches = more requests but less data loss on crash. Large batches = fewer requests but more risk. A batch size of 20–50 events with a 30-second timer is a good default.

---

## 9. Playtesting-Specific Telemetry

During playtesting, you may want richer data than in production.

```gdscript
# Playtest mode — enabled via command line: --playtest
var playtest_mode: bool = false

func _ready() -> void:
    playtest_mode = "--playtest" in OS.get_cmdline_args()
    if playtest_mode:
        batch_interval = 10.0  # Send faster during playtests
        _enable_input_recording()

func _enable_input_recording() -> void:
    """Record raw input events for session replay during playtests."""
    # Track every action press/release with timestamps
    set_process_input(true)

func _input(event: InputEvent) -> void:
    if not playtest_mode:
        return
    if event is InputEventAction:
        track("input", {
            "action": event.action,
            "pressed": event.pressed,
            "time": Time.get_ticks_msec(),
        })
```

### In-Game Feedback Button

Let playtesters annotate moments with text feedback:

```gdscript
func _on_feedback_submitted(text: String) -> void:
    Analytics.track("playtest_feedback", {
        "text": text,
        "scene": get_tree().current_scene.name,
        "position_x": player.global_position.x,
        "position_y": player.global_position.y,
        "session_time": Time.get_ticks_msec(),
    })
```

---

## 10. C# Equivalents

```csharp
using Godot;
using System.Collections.Generic;

public partial class Analytics : Node
{
    public static Analytics Instance { get; private set; }
    
    [Export] public string EndpointUrl { get; set; } = "https://your-backend.com/api/events";
    [Export] public bool Enabled { get; set; } = true;

    private readonly List<Godot.Collections.Dictionary> _eventQueue = new();
    private string _sessionId;
    private HttpRequest _http;

    public override void _Ready()
    {
        Instance = this;
        _sessionId = System.Guid.NewGuid().ToString();
        _http = new HttpRequest();
        AddChild(_http);

        Track("session_start", new Godot.Collections.Dictionary
        {
            { "platform", OS.GetName() },
            { "version", ProjectSettings.GetSetting("application/config/version", "unknown") },
        });
    }

    public void Track(string eventName, Godot.Collections.Dictionary properties = null)
    {
        if (!Enabled) return;
        
        _eventQueue.Add(new Godot.Collections.Dictionary
        {
            { "event", eventName },
            { "timestamp", Time.GetUnixTimeFromSystem() },
            { "session_id", _sessionId },
            { "properties", properties ?? new Godot.Collections.Dictionary() },
        });
    }
}
```

---

## 11. Common Mistakes

**Tracking everything.** More data is not better data. Every event you track is one you must maintain, store, and analyze. Start with the Essential 10 and add events only when you have a specific question to answer.

**No consent mechanism.** Shipping analytics without a consent dialog is a legal risk, especially for EU/UK players. Always ask first.

**Sending events synchronously.** Never use `HTTPClient` in `_process()` or `_physics_process()`. Always use `HTTPRequest` (async) or queue for batch sending.

**Hardcoded endpoints in production builds.** Use export presets or environment detection to switch between development and production URLs:

```gdscript
func _ready() -> void:
    if OS.is_debug_build():
        endpoint_url = "http://localhost:3000/api/events"
    else:
        endpoint_url = "https://prod.example.com/api/events"
```

**Ignoring event timestamps.** Always use `Time.get_unix_time_from_system()` for timestamps, not frame counts or ticks. Unix timestamps are comparable across sessions and time zones.

**Not testing with analytics disabled.** Your game must work perfectly with analytics turned off. Never put game logic behind an analytics call. Wrap everything in `if enabled` checks and handle network failures gracefully.
