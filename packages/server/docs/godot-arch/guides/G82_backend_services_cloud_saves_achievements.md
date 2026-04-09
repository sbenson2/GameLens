# Backend Services: Cloud Saves, Achievements, and Leaderboards

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G11_save_load_systems](G11_save_load_systems.md), [G13_networking_and_multiplayer](G13_networking_and_multiplayer.md), [G42_platform_integration_and_steamworks](G42_platform_integration_and_steamworks.md), [G66_analytics_and_player_telemetry](G66_analytics_and_player_telemetry.md)

Integrate online backend services into Godot 4.x games — cloud save synchronization, achievement tracking, leaderboard submission, and authentication. Covers platform-native approaches (Steam, console) and platform-agnostic BaaS solutions.

---

## Architecture Overview

Backend integration in Godot follows a service-layer pattern: game logic talks to an abstract interface, and concrete adapters handle platform specifics (Steam, custom REST API, or BaaS SDK). This keeps gameplay code decoupled from any single provider.

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Game Logic  │ ──► │  Service Layer   │ ──► │  Platform Adapter│
│ (save, earn) │     │ (abstract API)   │     │ (Steam / REST)   │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

---

## 1. Authentication

Most backend services require user identity. Common approaches in Godot 4.x:

### GDScript — Platform Token Authentication

```gdscript
## auth_service.gd — Abstract authentication service
class_name AuthService
extends RefCounted

signal authenticated(user_id: String)
signal auth_failed(error: String)

## Override in platform-specific subclasses
func login() -> void:
    push_error("AuthService.login() not implemented")

func get_user_id() -> String:
    return ""

func is_authenticated() -> bool:
    return get_user_id() != ""
```

```gdscript
## steam_auth.gd — Steam authentication adapter (requires GodotSteam)
class_name SteamAuth
extends AuthService

func login() -> void:
    # GodotSteam initializes automatically via Steam.steamInit()
    # The Steam user is authenticated by the Steam client
    if Steam.isSteamRunning():
        var steam_id: int = Steam.getSteamID()
        authenticated.emit(str(steam_id))
    else:
        auth_failed.emit("Steam client not running")

func get_user_id() -> String:
    if Steam.isSteamRunning():
        return str(Steam.getSteamID())
    return ""
```

### C# — REST-Based Authentication

```csharp
using Godot;
using System;
using System.Text;
using System.Text.Json;

/// <summary>
/// Generic REST authentication service. Extend for specific BaaS providers.
/// </summary>
public partial class RestAuthService : Node
{
    [Signal] public delegate void AuthenticatedEventHandler(string userId);
    [Signal] public delegate void AuthFailedEventHandler(string error);

    private HttpRequest _http;
    private string _baseUrl;
    private string _sessionToken = "";

    public string UserId { get; private set; } = "";
    public bool IsAuthenticated => !string.IsNullOrEmpty(SessionToken);

    public string SessionToken
    {
        get => _sessionToken;
        private set => _sessionToken = value;
    }

    public override void _Ready()
    {
        _http = new HttpRequest();
        AddChild(_http);
        _http.RequestCompleted += OnLoginResponse;
    }

    /// <summary>
    /// Authenticate with email + password. Adapt the endpoint for your provider.
    /// </summary>
    public void Login(string email, string password)
    {
        var body = JsonSerializer.Serialize(new { email, password });
        string[] headers = { "Content-Type: application/json" };
        _http.Request($"{_baseUrl}/auth/login", headers,
            HttpClient.Method.Post, body);
    }

    private void OnLoginResponse(long result, long code,
        string[] headers, byte[] body)
    {
        if (code == 200)
        {
            var json = JsonSerializer.Deserialize<JsonElement>(
                Encoding.UTF8.GetString(body));
            UserId = json.GetProperty("user_id").GetString();
            SessionToken = json.GetProperty("token").GetString();
            EmitSignal(SignalName.Authenticated, UserId);
        }
        else
        {
            EmitSignal(SignalName.AuthFailed, $"HTTP {code}");
        }
    }
}
```

---

## 2. Cloud Saves

Cloud saves let players resume progress across devices. The core challenge is conflict resolution when local and remote data diverge.

### Conflict Resolution Strategies

| Strategy | When to use | Tradeoff |
|----------|-------------|----------|
| **Last-write-wins** | Simple games, single device typical | May lose data if clocks differ |
| **Timestamp comparison** | Most games | Requires reliable timestamps |
| **Version vector** | Complex multi-device scenarios | More implementation effort |
| **Manual merge** | Competitive/high-stakes saves | Requires player UI |

### GDScript — Cloud Save Manager

```gdscript
## cloud_save_manager.gd
class_name CloudSaveManager
extends Node

signal save_synced
signal sync_conflict(local_data: Dictionary, remote_data: Dictionary)
signal sync_failed(error: String)

## How long to wait (seconds) before retrying a failed sync
@export var retry_delay: float = 5.0
## Maximum retry attempts before giving up
@export var max_retries: int = 3

var _local_save_path: String = "user://cloud_save.json"
var _http: HTTPRequest
var _api_url: String = ""
var _auth: AuthService

func _ready() -> void:
    _http = HTTPRequest.new()
    add_child(_http)

## Save locally first, then push to cloud.
## Local-first ensures the player never loses progress to a network failure.
func save_to_cloud(data: Dictionary) -> void:
    # Always persist locally first — network may fail
    data["_timestamp"] = Time.get_unix_time_from_system()
    data["_version"] = data.get("_version", 0) + 1
    _write_local(data)
    _push_remote(data)

## Load from cloud, falling back to local if offline.
func load_from_cloud() -> Dictionary:
    var local_data: Dictionary = _read_local()
    var remote_data: Dictionary = await _fetch_remote()

    if remote_data.is_empty():
        # Offline — use local data
        return local_data

    if local_data.is_empty():
        _write_local(remote_data)
        return remote_data

    # Conflict resolution: compare timestamps
    var local_ts: float = local_data.get("_timestamp", 0.0)
    var remote_ts: float = remote_data.get("_timestamp", 0.0)

    if abs(local_ts - remote_ts) < 1.0:
        # Effectively the same save
        return remote_data

    if local_ts > remote_ts:
        # Local is newer — push it to cloud
        _push_remote(local_data)
        return local_data
    else:
        # Remote is newer — update local
        _write_local(remote_data)
        return remote_data

func _write_local(data: Dictionary) -> void:
    var file := FileAccess.open(_local_save_path, FileAccess.WRITE)
    if file:
        file.store_string(JSON.stringify(data, "\t"))

func _read_local() -> Dictionary:
    if not FileAccess.file_exists(_local_save_path):
        return {}
    var file := FileAccess.open(_local_save_path, FileAccess.READ)
    if not file:
        return {}
    var json := JSON.new()
    if json.parse(file.get_as_text()) == OK:
        return json.data
    return {}

func _push_remote(data: Dictionary) -> void:
    if _api_url.is_empty():
        return
    var body: String = JSON.stringify(data)
    var headers: PackedStringArray = [
        "Content-Type: application/json",
    ]
    _http.request(_api_url + "/saves", headers,
        HTTPClient.METHOD_PUT, body)

func _fetch_remote() -> Dictionary:
    if _api_url.is_empty():
        return {}
    # Use a separate HTTPRequest for fetch to avoid signal collisions
    var fetch_http := HTTPRequest.new()
    add_child(fetch_http)
    fetch_http.request(_api_url + "/saves")
    var response: Array = await fetch_http.request_completed
    fetch_http.queue_free()

    var code: int = response[1]
    var body: PackedByteArray = response[3]
    if code == 200:
        var json := JSON.new()
        if json.parse(body.get_string_from_utf8()) == OK:
            return json.data
    return {}
```

### Steam Cloud Saves (GodotSteam)

```gdscript
## steam_cloud_save.gd — Uses Steam Remote Storage API via GodotSteam
class_name SteamCloudSave
extends Node

const SAVE_FILE_NAME: String = "savegame.json"

## Write save data to Steam Cloud. Steam handles sync automatically.
func save(data: Dictionary) -> bool:
    var json_string: String = JSON.stringify(data)
    var bytes: PackedByteArray = json_string.to_utf8_buffer()
    # Steam.fileWrite returns bool indicating success
    return Steam.fileWrite(SAVE_FILE_NAME, bytes)

## Read save data from Steam Cloud.
func load() -> Dictionary:
    if not Steam.fileExists(SAVE_FILE_NAME):
        return {}
    var file_size: int = Steam.getFileSize(SAVE_FILE_NAME)
    var file_data: Dictionary = Steam.fileRead(SAVE_FILE_NAME, file_size)
    if file_data["ret"]:
        var json := JSON.new()
        var text: String = file_data["buf"].get_string_from_utf8()
        if json.parse(text) == OK:
            return json.data
    return {}

## Delete save data from Steam Cloud.
func delete_save() -> bool:
    if Steam.fileExists(SAVE_FILE_NAME):
        return Steam.fileDelete(SAVE_FILE_NAME)
    return true
```

---

## 3. Achievements

Achievement systems track player milestones and surface them through platform overlays or in-game UI.

### GDScript — Achievement Manager with Platform Abstraction

```gdscript
## achievement_manager.gd
class_name AchievementManager
extends Node

## Emitted when an achievement unlocks (for in-game UI)
signal achievement_unlocked(achievement_id: String, display_name: String)

## Internal tracking: achievement_id -> { unlocked: bool, progress: float }
var _achievements: Dictionary = {}

## Platform adapter reference — set during initialization
var _platform: AchievementPlatform

func _ready() -> void:
    # Load local achievement cache to avoid redundant unlock calls
    _load_cache()

## Register an achievement definition before use.
func register(id: String, display_name: String,
        description: String, max_progress: float = 1.0) -> void:
    if not _achievements.has(id):
        _achievements[id] = {
            "display_name": display_name,
            "description": description,
            "max_progress": max_progress,
            "progress": 0.0,
            "unlocked": false,
        }

## Unlock an achievement immediately.
func unlock(id: String) -> void:
    if not _achievements.has(id):
        push_warning("Unknown achievement: %s" % id)
        return
    var ach: Dictionary = _achievements[id]
    if ach["unlocked"]:
        return  # Already unlocked — skip redundant platform call
    ach["unlocked"] = true
    ach["progress"] = ach["max_progress"]
    _save_cache()

    if _platform:
        _platform.set_achievement(id)

    achievement_unlocked.emit(id, ach["display_name"])

## Increment progress toward an achievement.
## Automatically unlocks when progress >= max_progress.
func add_progress(id: String, amount: float = 1.0) -> void:
    if not _achievements.has(id):
        return
    var ach: Dictionary = _achievements[id]
    if ach["unlocked"]:
        return
    ach["progress"] = minf(ach["progress"] + amount, ach["max_progress"])

    if _platform:
        _platform.set_progress(id, ach["progress"], ach["max_progress"])

    if ach["progress"] >= ach["max_progress"]:
        unlock(id)
    else:
        _save_cache()

func _load_cache() -> void:
    var path: String = "user://achievements_cache.json"
    if not FileAccess.file_exists(path):
        return
    var file := FileAccess.open(path, FileAccess.READ)
    if not file:
        return
    var json := JSON.new()
    if json.parse(file.get_as_text()) == OK and json.data is Dictionary:
        for key: String in json.data:
            if _achievements.has(key):
                _achievements[key].merge(json.data[key], true)

func _save_cache() -> void:
    var path: String = "user://achievements_cache.json"
    var file := FileAccess.open(path, FileAccess.WRITE)
    if file:
        file.store_string(JSON.stringify(_achievements, "\t"))
```

### C# — Steam Achievements Adapter

```csharp
using Godot;

/// <summary>
/// Steam achievements adapter. Requires GodotSteam C# bindings.
/// Calls Steam.SetAchievement() and Steam.StoreStats() to sync with
/// the Steam overlay.
/// </summary>
public partial class SteamAchievementAdapter : Node
{
    /// <summary>
    /// Unlock a Steam achievement by API name.
    /// Steam requires StoreStats() after setting to actually persist.
    /// </summary>
    public bool SetAchievement(string achievementId)
    {
        if (!Steam.IsSteamRunning())
            return false;

        Steam.SetAchievement(achievementId);
        // StoreStats sends the unlock to Steam servers
        return Steam.StoreStats();
    }

    /// <summary>
    /// Update progress for a stat-based achievement.
    /// Steam uses stats (int/float) to drive progress achievements.
    /// </summary>
    public bool SetProgress(string statName, float current, float max)
    {
        if (!Steam.IsSteamRunning())
            return false;

        // Steam stat-based achievements auto-unlock when threshold is met
        Steam.SetStatFloat(statName, current);
        return Steam.StoreStats();
    }

    /// <summary>
    /// Reset an achievement (useful during development only).
    /// </summary>
    public bool ClearAchievement(string achievementId)
    {
        if (!Steam.IsSteamRunning())
            return false;

        Steam.ClearAchievement(achievementId);
        return Steam.StoreStats();
    }
}
```

---

## 4. Leaderboards

Leaderboards require posting scores and fetching ranked lists. Key decisions: score direction (higher/lower is better), update policy (always/keep best), and display range (global, friends, near-player).

### GDScript — REST Leaderboard Client

```gdscript
## leaderboard_client.gd
class_name LeaderboardClient
extends Node

signal scores_received(entries: Array[Dictionary])
signal score_submitted(rank: int)
signal request_failed(error: String)

@export var api_url: String = ""

var _http_get: HTTPRequest
var _http_post: HTTPRequest

func _ready() -> void:
    _http_get = HTTPRequest.new()
    _http_post = HTTPRequest.new()
    add_child(_http_get)
    add_child(_http_post)
    _http_get.request_completed.connect(_on_get_completed)
    _http_post.request_completed.connect(_on_post_completed)

## Submit a score. The server decides whether to keep or replace.
func submit_score(board_id: String, player_name: String,
        score: int, metadata: Dictionary = {}) -> void:
    var body := JSON.stringify({
        "board_id": board_id,
        "player_name": player_name,
        "score": score,
        "metadata": metadata,
    })
    var headers: PackedStringArray = ["Content-Type: application/json"]
    _http_post.request(api_url + "/leaderboards/submit",
        headers, HTTPClient.METHOD_POST, body)

## Fetch top scores for a leaderboard.
func fetch_top(board_id: String, count: int = 10, offset: int = 0) -> void:
    var url := "%s/leaderboards/%s?count=%d&offset=%d" % [
        api_url, board_id, count, offset
    ]
    _http_get.request(url)

func _on_get_completed(_result: int, code: int,
        _headers: PackedStringArray, body: PackedByteArray) -> void:
    if code == 200:
        var json := JSON.new()
        if json.parse(body.get_string_from_utf8()) == OK:
            scores_received.emit(json.data.get("entries", []))
            return
    request_failed.emit("Failed to fetch leaderboard: HTTP %d" % code)

func _on_post_completed(_result: int, code: int,
        _headers: PackedStringArray, body: PackedByteArray) -> void:
    if code == 200 or code == 201:
        var json := JSON.new()
        if json.parse(body.get_string_from_utf8()) == OK:
            score_submitted.emit(json.data.get("rank", -1))
            return
    request_failed.emit("Failed to submit score: HTTP %d" % code)
```

### GDScript — Steam Leaderboard Integration

```gdscript
## steam_leaderboard.gd — Steam leaderboard via GodotSteam
class_name SteamLeaderboard
extends Node

signal scores_loaded(entries: Array[Dictionary])

var _leaderboard_handle: int = 0

## Find or create a Steam leaderboard by name.
## Must be called before upload/download.
func find_leaderboard(name: String) -> void:
    Steam.findLeaderboard(name)
    # GodotSteam emits leaderboard_find_result
    Steam.leaderboard_find_result.connect(_on_find_result, CONNECT_ONE_SHOT)

## Upload a score to the current leaderboard.
func upload_score(score: int, keep_best: bool = true) -> void:
    if _leaderboard_handle == 0:
        push_warning("Leaderboard not found yet — call find_leaderboard first")
        return
    var method: int = Steam.LEADERBOARD_UPLOAD_SCORE_METHOD_KEEP_BEST \
        if keep_best \
        else Steam.LEADERBOARD_UPLOAD_SCORE_METHOD_FORCE_UPDATE
    Steam.uploadLeaderboardScore(score, keep_best, PackedInt32Array(),
        _leaderboard_handle)

## Download entries around the player.
func download_scores_around_player(range_before: int = 5,
        range_after: int = 5) -> void:
    if _leaderboard_handle == 0:
        return
    Steam.downloadLeaderboardEntries(
        -range_before, range_after,
        Steam.LEADERBOARD_DATA_REQUEST_GLOBAL_AROUND_USER,
        _leaderboard_handle
    )
    Steam.leaderboard_scores_downloaded.connect(
        _on_scores_downloaded, CONNECT_ONE_SHOT
    )

func _on_find_result(handle: int, found: int) -> void:
    if found == 1:
        _leaderboard_handle = handle

func _on_scores_downloaded(_message: String, leaderboard_entries: Array) -> void:
    var entries: Array[Dictionary] = []
    for entry: Dictionary in leaderboard_entries:
        entries.append({
            "rank": entry.get("global_rank", 0),
            "score": entry.get("score", 0),
            "steam_id": entry.get("steam_id", 0),
        })
    scores_loaded.emit(entries)
```

---

## 5. Unified Service Facade

Combine all backend services behind a single autoload for clean game-logic integration:

### GDScript — Backend Autoload

```gdscript
## backend.gd — Autoload singleton tying services together
extends Node

var auth: AuthService
var cloud_saves: CloudSaveManager
var achievements: AchievementManager
var leaderboards: LeaderboardClient

func _ready() -> void:
    # Detect platform and wire up the correct adapters
    if _is_steam_available():
        auth = SteamAuth.new()
        cloud_saves = _create_steam_cloud_save()
    else:
        auth = _create_rest_auth()
        cloud_saves = _create_rest_cloud_save()

    achievements = AchievementManager.new()
    add_child(achievements)

    leaderboards = LeaderboardClient.new()
    add_child(leaderboards)

    # Register game-specific achievements
    achievements.register("first_kill", "First Blood",
        "Defeat your first enemy")
    achievements.register("speedrun", "Speed Demon",
        "Complete the game in under 30 minutes")
    achievements.register("collector", "Hoarder",
        "Collect 100 items", 100.0)

func _is_steam_available() -> bool:
    # Check if the Steam singleton exists (GodotSteam plugin loaded)
    return Engine.has_singleton("Steam") or ClassDB.class_exists("Steam")

func _create_steam_cloud_save() -> Node:
    var scs := SteamCloudSave.new()
    add_child(scs)
    return scs

func _create_rest_auth() -> AuthService:
    # Placeholder — replace with your BaaS auth adapter
    return AuthService.new()

func _create_rest_cloud_save() -> CloudSaveManager:
    var csm := CloudSaveManager.new()
    add_child(csm)
    return csm
```

---

## 6. Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Score tampering** | Validate scores server-side; never trust client-reported scores for competitive boards |
| **Save file injection** | Checksum or HMAC local saves; encrypt sensitive fields with `Crypto` class |
| **Token theft** | Store session tokens in memory only — never write to unencrypted disk |
| **Replay attacks** | Include nonce/timestamp in API requests; expire tokens after reasonable TTL |
| **Man-in-the-middle** | Always use HTTPS; validate TLS certificates (Godot does this by default) |

### GDScript — Save File Integrity Check

```gdscript
## save_integrity.gd — HMAC-based tamper detection for local saves
class_name SaveIntegrity
extends RefCounted

## Secret key — in production, derive from a machine-specific value
## or retrieve from a secure server. Hard-coded keys can be extracted.
const _HMAC_KEY: String = "your-secret-key-here"

static func sign(data: String) -> String:
    var crypto := HMACContext.new()
    crypto.start(HashingContext.HASH_SHA256,
        _HMAC_KEY.to_utf8_buffer())
    crypto.update(data.to_utf8_buffer())
    var hmac: PackedByteArray = crypto.finish()
    return hmac.hex_encode()

static func save_with_signature(path: String, data: Dictionary) -> void:
    var json_str: String = JSON.stringify(data)
    var signature: String = sign(json_str)
    var envelope := {
        "data": data,
        "signature": signature,
    }
    var file := FileAccess.open(path, FileAccess.WRITE)
    if file:
        file.store_string(JSON.stringify(envelope, "\t"))

static func load_and_verify(path: String) -> Dictionary:
    if not FileAccess.file_exists(path):
        return {}
    var file := FileAccess.open(path, FileAccess.READ)
    if not file:
        return {}
    var json := JSON.new()
    if json.parse(file.get_as_text()) != OK:
        return {}
    var envelope: Dictionary = json.data
    var data: Dictionary = envelope.get("data", {})
    var stored_sig: String = envelope.get("signature", "")
    var computed_sig: String = sign(JSON.stringify(data))
    if stored_sig != computed_sig:
        push_error("Save file tampered! Signatures do not match.")
        return {}
    return data
```

---

## 7. Testing Backend Integration

```gdscript
## test_backend_mock.gd — Mock backend for offline testing
class_name MockBackend
extends Node

var _mock_scores: Array[Dictionary] = []
var _mock_achievements: Dictionary = {}

func submit_score(board_id: String, player: String, score: int) -> int:
    _mock_scores.append({
        "board_id": board_id,
        "player": player,
        "score": score,
    })
    _mock_scores.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
        return a["score"] > b["score"]
    )
    for i: int in _mock_scores.size():
        if _mock_scores[i]["player"] == player:
            return i + 1  # 1-indexed rank
    return -1

func unlock_achievement(id: String) -> void:
    _mock_achievements[id] = true
    print("[MockBackend] Achievement unlocked: %s" % id)

func is_achievement_unlocked(id: String) -> bool:
    return _mock_achievements.get(id, false)
```

---

## Best Practices

- **Local-first**: Always save locally before attempting cloud sync. Network failures must never lose player progress.
- **Idempotent operations**: Achievement unlocks and score submissions should be safe to retry. Design APIs accordingly.
- **Batch API calls**: Avoid per-frame network requests. Queue changes and sync periodically (e.g., on save, on level complete, on quit).
- **Graceful degradation**: If the backend is unreachable, the game must still function. Queue failed operations for retry.
- **Platform-specific overlays**: Steam, PlayStation, Xbox, and Switch each have their own achievement notification systems. Avoid duplicating with in-game popups on platforms that provide native toast notifications.
- **GDPR/privacy**: Leaderboards displaying player names require consent. Provide opt-out or anonymous display options.

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Calling `StoreStats()` on every stat change | Batch stat updates; call `StoreStats()` once per logical event |
| Cloud save conflicts on device switch | Always fetch remote save on launch before loading local |
| Achievement unlocks failing silently | Cache unlock state locally; retry on next session |
| Leaderboard scores rejected by platform | Check score type matches definition (int vs float, ascending vs descending) |
| HTTPRequest node reuse during pending request | Use separate HTTPRequest nodes for concurrent requests |
