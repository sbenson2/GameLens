# G42 — Platform Integration & Steamworks

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G16 GDExtension & Native Code](./G16_gdextension_native_code.md) · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) · [G22 Mobile & Web Export](./G22_mobile_and_web_export.md) · [G11 Save/Load Systems](./G11_save_load_systems.md)

---

## What This Guide Covers

Shipping a Godot game on a storefront means integrating platform APIs — achievements, leaderboards, cloud saves, rich presence, overlay, and DRM. Steam is by far the most common target for indie developers, and GodotSteam provides full Steamworks SDK access via GDExtension.

This guide covers installing and initializing GodotSteam, implementing the core Steamworks features (achievements, stats, leaderboards, cloud saves, rich presence, overlay), handling callbacks, testing without the Steam client, and exporting for release. It also covers high-level guidance for other platforms (Epic, GOG, console).

**Use this guide when:** you're publishing a Godot game on Steam and need to integrate Steamworks features, or you're planning multi-platform distribution and want a clean abstraction layer.

---

## Table of Contents

1. [Platform Integration Architecture](#1-platform-integration-architecture)
2. [Installing GodotSteam (GDExtension)](#2-installing-godotsteam-gdextension)
3. [Initializing Steam](#3-initializing-steam)
4. [The Callback Loop](#4-the-callback-loop)
5. [Achievements & Statistics](#5-achievements--statistics)
6. [Leaderboards](#6-leaderboards)
7. [Cloud Saves (Remote Storage)](#7-cloud-saves-remote-storage)
8. [Rich Presence](#8-rich-presence)
9. [Steam Overlay](#9-steam-overlay)
10. [Steam Input (Controller Support)](#10-steam-input-controller-support)
11. [Workshop / UGC Integration](#11-workshop--ugc-integration)
12. [Testing & Debugging](#12-testing--debugging)
13. [Export & Release Checklist](#13-export--release-checklist)
14. [Platform Abstraction Layer](#14-platform-abstraction-layer)
15. [Other Storefronts (Epic, GOG, itch.io)](#15-other-storefronts-epic-gog-itchio)
16. [C# Equivalents](#16-c-equivalents)
17. [Common Mistakes](#17-common-mistakes)

---

## 1. Platform Integration Architecture

Keep platform code **isolated** behind an abstraction layer so your game logic never calls Steam directly:

```
┌─────────────────────────────────────────────┐
│              Game Systems                    │
│  (achievements, saves, leaderboards)         │
│                                             │
│       calls PlatformService (autoload)       │
└─────────────┬───────────────────────────────┘
              │
    ┌─────────┴──────────┐
    │   PlatformService   │  ← Autoload singleton
    │   (abstract layer)  │
    └─────────┬──────────┘
              │
   ┌──────────┼──────────┐
   ▼          ▼          ▼
Steam      GOG       Offline
Backend    Backend    Backend
```

This lets you:
- Ship on multiple storefronts without `#ifdef`-style branching in game code
- Test without the Steam client running
- Swap backends without touching gameplay systems

---

## 2. Installing GodotSteam (GDExtension)

GodotSteam is the standard way to access the Steamworks SDK from Godot 4.x. The GDExtension version requires no engine recompilation.

### Installation Steps

1. **Download** the GodotSteam GDExtension from the [Godot Asset Library](https://godotengine.org/asset-library/asset/2445) or the [GodotSteam releases page](https://codeberg.org/godotsteam/godotsteam/releases).

2. **Place files** in your project:
```
your_project/
├── addons/
│   └── godotsteam/
│       ├── godotsteam.gdextension
│       ├── libgodotsteam.linux.template_debug.x86_64.so
│       ├── libgodotsteam.linux.template_release.x86_64.so
│       ├── libgodotsteam.macos.template_debug.framework/
│       ├── libgodotsteam.macos.template_release.framework/
│       ├── libgodotsteam.windows.template_debug.x86_64.dll
│       └── libgodotsteam.windows.template_release.x86_64.dll
├── project.godot
└── ...
```

3. The GDExtension **does not need to be enabled** in Project Settings — it's available as soon as the addon folder is in place.

4. **Create `steam_appid.txt`** in your project root with your Steam App ID (use `480` for Spacewar, the Steamworks test app):
```
480
```

> **Important:** `steam_appid.txt` is for development only. Remove it from release builds — the Steam client provides the App ID when launching your game.

---

## 3. Initializing Steam

Create an autoload singleton that initializes Steam on startup:

```gdscript
# steam_manager.gd — add as Autoload singleton named "SteamManager"
extends Node

var is_steam_running: bool = false
var steam_id: int = 0
var steam_username: String = ""

func _ready() -> void:
    _initialize_steam()

func _initialize_steam() -> void:
    # Check if GodotSteam is available (won't exist in non-Steam builds)
    if not ClassDB.class_exists(&"Steam"):
        push_warning("GodotSteam not available — running in offline mode")
        return
    
    var init_result: Dictionary = Steam.steamInitEx(false, 480)  # your App ID
    # init_result = { "status": 0, "verbal": "Successfully initialized Steam!" }
    
    if init_result["status"] != 0:
        push_error("Steam init failed: %s" % init_result["verbal"])
        return
    
    is_steam_running = true
    steam_id = Steam.getSteamID()
    steam_username = Steam.getPersonaName()
    
    print("Steam initialized — welcome, %s (ID: %d)" % [steam_username, steam_id])
```

### steamInitEx vs steamInit

- **`steamInit()`** — legacy, returns a `bool`. Use `steamInitEx()` for richer error info.
- **`steamInitEx(restart_if_necessary, app_id)`** — returns a dictionary with status code and verbal message. Set `restart_if_necessary` to `true` in release builds so Steam relaunches your game through the client if needed.

---

## 4. The Callback Loop

Steam uses a callback system — many operations are asynchronous and return results via callbacks. You **must** call `Steam.run_callbacks()` regularly:

```gdscript
# In your SteamManager autoload
func _process(_delta: float) -> void:
    if is_steam_running:
        Steam.run_callbacks()
```

Without this, achievements won't unlock, leaderboard uploads won't complete, and overlay events won't fire.

---

## 5. Achievements & Statistics

### Setup in Steamworks Dashboard

Before coding, configure achievements and stats in the **Steamworks Partner Dashboard**:
1. Go to your app → **Stats & Achievements**.
2. Define achievements (API name, display name, description, icon).
3. Define stats (API name, type: INT or FLOAT).
4. **Publish changes** — unpublished achievements/stats are invisible to the API.

### Unlocking Achievements

```gdscript
# Unlock an achievement
func unlock_achievement(api_name: String) -> void:
    if not SteamManager.is_steam_running:
        return
    
    Steam.setAchievement(api_name)
    Steam.storeStats()  # push to Steam servers

# Check if already unlocked
func is_achievement_unlocked(api_name: String) -> bool:
    if not SteamManager.is_steam_running:
        return false
    
    var result: Dictionary = Steam.getAchievement(api_name)
    return result.get("achieved", false)
```

### Tracking Statistics

```gdscript
# Increment a stat
func add_stat(api_name: String, amount: int) -> void:
    if not SteamManager.is_steam_running:
        return
    
    var current: int = Steam.getStatInt(api_name)
    Steam.setStatInt(api_name, current + amount)
    Steam.storeStats()

# Set a float stat (e.g., fastest time)
func set_stat_float(api_name: String, value: float) -> void:
    if not SteamManager.is_steam_running:
        return
    
    Steam.setStatFloat(api_name, value)
    Steam.storeStats()
```

### Stat-Based Achievements

Configure achievements in the Steamworks dashboard to auto-unlock when a stat threshold is reached. This is handled server-side — no extra code needed. Just update the stat and call `storeStats()`.

> **Note:** Starting with Steamworks SDK 1.61+, stats and achievements sync automatically at startup. You don't need to call `requestCurrentStats()` on init.

---

## 6. Leaderboards

### Finding a Leaderboard

Leaderboards must be created in the Steamworks dashboard first, then found by name:

```gdscript
var _leaderboard_handle: int = 0

func _ready() -> void:
    if SteamManager.is_steam_running:
        Steam.leaderboard_find_result.connect(_on_leaderboard_found)
        Steam.findLeaderboard("HighScores")

func _on_leaderboard_found(handle: int, found: int) -> void:
    if found == 1:
        _leaderboard_handle = handle
        print("Leaderboard found!")
    else:
        push_error("Leaderboard not found — check dashboard config")
```

### Uploading Scores

```gdscript
func upload_score(score: int) -> void:
    if _leaderboard_handle == 0:
        return
    
    # KEEP_BEST = only update if this score is better
    # FORCE_UPDATE = always overwrite
    Steam.uploadLeaderboardScore(
        score,
        true,                   # keep_best
        PackedInt32Array(),     # optional: score details (up to 64 ints)
        _leaderboard_handle
    )
```

### Downloading Scores

```gdscript
func download_scores() -> void:
    if _leaderboard_handle == 0:
        return
    
    Steam.leaderboard_scores_downloaded.connect(_on_scores_downloaded)
    
    # Download top 10 global scores
    Steam.downloadLeaderboardEntries(
        1,      # start rank
        10,     # end rank
        Steam.LEADERBOARD_DATA_REQUEST_GLOBAL,
        _leaderboard_handle
    )

func _on_scores_downloaded(
    message: String, 
    this_handle: int, 
    entries: Array
) -> void:
    for entry in entries:
        print("Rank %d: %s — %d" % [
            entry["global_rank"],
            entry["steam_id"],  # resolve to name with Steam.getFriendPersonaName()
            entry["score"]
        ])
```

---

## 7. Cloud Saves (Remote Storage)

Steam Cloud syncs save files across devices automatically.

### Setup

1. In the Steamworks dashboard: **Cloud** → configure byte quota and file count quota.
2. Define file path patterns (e.g., `saves/*.sav`).

### Writing Save Data

```gdscript
func save_to_cloud(filename: String, data: Dictionary) -> bool:
    if not SteamManager.is_steam_running:
        return _save_local(filename, data)  # fallback to local
    
    var json_string: String = JSON.stringify(data)
    var bytes: PackedByteArray = json_string.to_utf8_buffer()
    
    var success: bool = Steam.fileWrite(filename, bytes)
    if not success:
        push_error("Steam Cloud write failed for: %s" % filename)
    return success

func load_from_cloud(filename: String) -> Dictionary:
    if not SteamManager.is_steam_running:
        return _load_local(filename)
    
    if not Steam.fileExists(filename):
        return {}
    
    var file_size: int = Steam.getFileSize(filename)
    var data: Dictionary = Steam.fileRead(filename, file_size)
    
    if data["ret"]:
        var json_string: String = data["buf"].get_string_from_utf8()
        var parsed: Variant = JSON.parse_string(json_string)
        if parsed is Dictionary:
            return parsed
    
    return {}
```

### Conflict Resolution

Steam handles sync conflicts automatically, but you can check:

```gdscript
func check_cloud_status(filename: String) -> void:
    if Steam.isCloudEnabledForAccount() and Steam.isCloudEnabledForApp():
        var timestamp: int = Steam.getFileTimestamp(filename)
        print("Cloud file last modified: ", timestamp)
```

---

## 8. Rich Presence

Rich presence shows custom status text in the Steam friends list (e.g., "In Battle — Wave 15").

### Setup

1. Create a **localization file** in the Steamworks dashboard under **Community → Rich Presence Localization**.
2. Define tokens like `#StatusInGame`, `#StatusInMenu`, etc.

### Setting Rich Presence

```gdscript
# Simple status
func set_presence_menu() -> void:
    if not SteamManager.is_steam_running:
        return
    Steam.setRichPresence("steam_display", "#StatusInMenu")

# Status with dynamic values
func set_presence_playing(level_name: String, score: int) -> void:
    if not SteamManager.is_steam_running:
        return
    Steam.setRichPresence("level", level_name)
    Steam.setRichPresence("score", str(score))
    Steam.setRichPresence("steam_display", "#StatusPlaying")

# Clear on exit
func clear_presence() -> void:
    if SteamManager.is_steam_running:
        Steam.clearRichPresence()
```

### Localization File Format

In the Steamworks dashboard, your localization file maps tokens to display strings:

```
"lang"
{
    "english"
    {
        "tokens"
        {
            "#StatusInMenu"     "In the Main Menu"
            "#StatusPlaying"    "Playing %level% — Score: %score%"
        }
    }
}
```

---

## 9. Steam Overlay

The Steam overlay (Shift+Tab) is handled automatically when your game runs through the Steam client. However, you may want to react to overlay events:

```gdscript
func _ready() -> void:
    if SteamManager.is_steam_running:
        Steam.overlay_toggled.connect(_on_overlay_toggled)

func _on_overlay_toggled(toggled_on: bool) -> void:
    if toggled_on:
        # Pause the game while overlay is active
        get_tree().paused = true
    else:
        get_tree().paused = false
```

### Opening Specific Overlay Pages

```gdscript
# Open the store page
Steam.activateGameOverlayToStore(480)  # your App ID

# Open a web URL in the overlay browser
Steam.activateGameOverlayToWebPage("https://yourgame.com")

# Open the achievements overlay
Steam.activateGameOverlay("achievements")
# Other options: "friends", "community", "players", "settings",
# "officialgamegroup", "stats"
```

> **Note:** The Steam overlay may not work when running from the Godot editor with the Forward+ renderer. It works correctly in exported builds launched through Steam.

---

## 10. Steam Input (Controller Support)

Steam Input provides unified controller support across all controller types. Configure in the Steamworks dashboard under **Steam Input**.

```gdscript
# Basic Steam Input initialization
func _ready() -> void:
    if SteamManager.is_steam_running:
        Steam.inputInit(false)

func _process(_delta: float) -> void:
    if SteamManager.is_steam_running:
        Steam.runFrame()
```

For most Godot games, using Godot's built-in Input system with Steam Input configured in the dashboard (as a transparent input layer) is simpler than calling the Steam Input API directly. See [G4 Input Handling](./G4_input_handling.md) for Godot's input system.

---

## 11. Workshop / UGC Integration

If your game supports user-generated content (mods, levels, skins):

```gdscript
# Create a Workshop item
func create_workshop_item() -> void:
    Steam.item_created.connect(_on_item_created)
    Steam.createItem(480, Steam.WORKSHOP_FILE_TYPE_COMMUNITY)

func _on_item_created(result: int, file_id: int, accept_tos: bool) -> void:
    if result == Steam.RESULT_OK:
        print("Workshop item created: ", file_id)
        if accept_tos:
            # User needs to accept Steam Workshop TOS
            Steam.activateGameOverlayToWebPage(
                "https://steamcommunity.com/sharedfiles/workshoplegalagreement"
            )
```

---

## 12. Testing & Debugging

### Testing Without Steam

Create a fallback for development:

```gdscript
# In SteamManager autoload
func is_available() -> bool:
    return is_steam_running

# In game code — always check availability
func on_level_complete(score: int) -> void:
    if SteamManager.is_available():
        SteamManager.upload_score(score)
    else:
        print("[Debug] Would upload score: %d" % score)
```

### Using Spacewar (App ID 480)

During development, use App ID `480` (Valve's Spacewar test app). It has pre-configured achievements, stats, and leaderboards for testing.

### Common Debug Steps

1. **Steam not initializing:** Ensure the Steam client is running and `steam_appid.txt` exists in the project root.
2. **Achievements not showing:** Check that they're **published** in the Steamworks dashboard.
3. **Overlay not appearing:** Run the exported game through Steam, not from the Godot editor.
4. **Callbacks not firing:** Verify `Steam.run_callbacks()` is called every frame.

---

## 13. Export & Release Checklist

- [ ] Replace `steam_appid.txt` App ID `480` with your real App ID
- [ ] Remove `steam_appid.txt` from the export (it's only for dev — Steam provides the ID at launch)
- [ ] Set `restart_if_necessary = true` in `steamInitEx()` for release
- [ ] Publish all achievements, stats, and leaderboards in the Steamworks dashboard
- [ ] Configure Steam Cloud quotas in the dashboard
- [ ] Set up rich presence localization tokens
- [ ] Test the exported build launched from Steam (not from the file system)
- [ ] Upload the build via Steamworks' `steamcmd` or the build upload tool
- [ ] Verify the Steam overlay works in the exported build
- [ ] Include the Steamworks SDK redistribution files in your export

---

## 14. Platform Abstraction Layer

To support multiple storefronts, create an interface your game code calls:

```gdscript
# platform_service.gd — base class
class_name PlatformService extends RefCounted

func init() -> bool:
    return false

func unlock_achievement(_id: String) -> void:
    pass

func upload_score(_board: String, _score: int) -> void:
    pass

func save_cloud(_filename: String, _data: Dictionary) -> bool:
    return false

func load_cloud(_filename: String) -> Dictionary:
    return {}

func set_rich_presence(_key: String, _value: String) -> void:
    pass

func get_username() -> String:
    return "Player"
```

```gdscript
# steam_service.gd
class_name SteamService extends PlatformService

func init() -> bool:
    var result: Dictionary = Steam.steamInitEx(true, YOUR_APP_ID)
    return result["status"] == 0

func unlock_achievement(id: String) -> void:
    Steam.setAchievement(id)
    Steam.storeStats()

func get_username() -> String:
    return Steam.getPersonaName()

# ... implement all methods with Steam calls
```

```gdscript
# offline_service.gd — for DRM-free builds or development
class_name OfflineService extends PlatformService

func init() -> bool:
    return true

func get_username() -> String:
    return "Offline Player"

func save_cloud(filename: String, data: Dictionary) -> bool:
    # Fall back to local file saves
    var file := FileAccess.open("user://" + filename, FileAccess.WRITE)
    file.store_string(JSON.stringify(data))
    return true
```

```gdscript
# platform_manager.gd — autoload that picks the right backend
extends Node

var service: PlatformService

func _ready() -> void:
    if ClassDB.class_exists(&"Steam"):
        service = SteamService.new()
    else:
        service = OfflineService.new()
    
    service.init()
```

---

## 15. Other Storefronts (Epic, GOG, itch.io)

### Epic Games Store

- No official Godot plugin exists. Use the **Epic Online Services (EOS) SDK** via GDExtension or native C++ binding.
- EOS provides achievements, leaderboards, matchmaking, and voice chat.
- Consider [GodotEOS](https://github.com/AdriaandeJongh/GodotEOS) community plugin (check for Godot 4.x support).

### GOG Galaxy

- GOG Galaxy SDK can be integrated via GDExtension.
- Provides achievements, leaderboards, cloud saves, multiplayer.
- GOG requires a DRM-free build — your game must work without any storefront backend running.

### itch.io

- No SDK integration needed — itch.io uses web-based distribution.
- For web exports, itch.io embeds the HTML5 build directly.
- Use [G22 Mobile & Web Export](./G22_mobile_and_web_export.md) for web export guidance.

### Console (Nintendo Switch, PlayStation, Xbox)

- Console SDKs are under NDA — integration details cannot be shared publicly.
- You'll need a registered developer account with each platform holder.
- Godot supports console exports through third-party porting services and official partnerships.
- Plan your abstraction layer (Section 14) early if console release is in your roadmap.

---

## 16. C# Equivalents

For C# projects, two approaches exist:

### Option A: GodotSteam (GDExtension — works from C#)

Call GodotSteam through Godot's interop:

```csharp
using Godot;

public partial class SteamManager : Node
{
    private GodotObject _steam;
    public bool IsSteamRunning { get; private set; }

    public override void _Ready()
    {
        if (ClassDB.ClassExists("Steam"))
        {
            _steam = (GodotObject)ClassDB.Instantiate("Steam");
            // Use _steam.Call("methodName", args) for API access
        }
    }
}
```

### Option B: Steamworks.NET (native C# wrapper)

Use [Godot.Steamworks.NET](https://github.com/ryan-linehan/Godot.Steamworks.NET) for a more idiomatic C# experience:

```csharp
using Godot;
using Steamworks;

public partial class SteamManager : Node
{
    public bool IsSteamRunning { get; private set; }

    public override void _Ready()
    {
        IsSteamRunning = SteamAPI.Init();
        if (IsSteamRunning)
        {
            string name = SteamFriends.GetPersonaName();
            GD.Print($"Steam initialized — welcome, {name}");
        }
    }

    public override void _Process(double delta)
    {
        if (IsSteamRunning)
            SteamAPI.RunCallbacks();
    }

    public void UnlockAchievement(string apiName)
    {
        if (!IsSteamRunning) return;
        SteamUserStats.SetAchievement(apiName);
        SteamUserStats.StoreStats();
    }
}
```

---

## 17. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Steam not initializing in editor | Ensure the Steam client is running and `steam_appid.txt` is in the project root (not in `addons/`) |
| `Steam` class not found | GodotSteam GDExtension not installed correctly — check the `addons/godotsteam/` folder structure |
| Achievements don't unlock | Achievements must be **published** in the Steamworks dashboard — saved drafts are invisible to the API |
| `run_callbacks()` not called | Must be called every frame in `_process()`. Without it, no async Steam operations complete |
| Overlay doesn't work in editor | Expected — the overlay requires running the exported build through the Steam client |
| Rich presence text is empty | Localization tokens must be configured in the Steamworks dashboard under Community → Rich Presence Localization |
| Cloud saves lost | Ensure byte/file quotas are set in the Steamworks dashboard. Also check `isCloudEnabledForAccount()` |
| Game crashes on non-Steam launch | Always check `ClassDB.class_exists(&"Steam")` before calling any Steam API — provide an offline fallback |
| `steam_appid.txt` shipped in release | Remove it from exports — the Steam client provides the App ID when launching through the store |
