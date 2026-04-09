# G26 — Steam & Storefront Integration

> **Category:** guide · **Engine:** FNA · **Related:** [G25 Game Packaging Distribution](./G25_game_packaging_distribution.md) · [G08 Cross Platform Deployment](./G08_cross_platform_deployment.md) · [G02 NativeAOT Publishing](./G02_nativeaot_publishing.md)

Integrating FNA games with Steam, GOG, and other storefronts. Covers Steamworks.NET setup, depot configuration, achievements, cloud saves, and platform-specific distribution strategies. Also covers FNA.Steamworks for XNA-compatible Xbox Live–style API shims.

---

## Table of Contents

1. [Overview](#1--overview)
2. [Steamworks.NET Setup](#2--steamworksnet-setup)
3. [Steam Depot Configuration](#3--steam-depot-configuration)
4. [Achievements and Stats](#4--achievements-and-stats)
5. [Cloud Saves](#5--cloud-saves)
6. [FNA.Steamworks (Xbox Live Shim)](#6--fnasteamworks-xbox-live-shim)
7. [GOG Galaxy Integration](#7--gog-galaxy-integration)
8. [itch.io Distribution](#8--itchio-distribution)
9. [Steam Deck Considerations](#9--steam-deck-considerations)
10. [FNA vs MonoGame: Distribution Differences](#10--fna-vs-monogame-distribution-differences)

---

## 1 — Overview

FNA games ship to storefronts like any native application — the framework imposes no launcher, DRM, or runtime installer requirement. The key integration points are:

- **Native library deployment** — fnalibs must ship alongside the game executable on every platform
- **Storefront SDKs** — Steamworks, GOG Galaxy, etc. are accessed via C# wrappers
- **Single-assembly portability** — FNA's runtime platform detection means the managed game DLL is identical across platforms; only fnalibs and storefront native libraries differ

This guide assumes your game builds and runs locally. See G25 for packaging basics and G08 for cross-platform deployment.

---

## 2 — Steamworks.NET Setup

[Steamworks.NET](https://steamworks.github.io/) is the standard C# wrapper for Valve's Steamworks API. It works with FNA without modification.

### Installation

Add Steamworks.NET as a NuGet package (this is one of the few NuGet dependencies in an FNA project):

```xml
<!-- In your game .csproj -->
<PackageReference Include="Steamworks.NET" Version="20.2.*" />
```

Alternatively, include the Steamworks.NET source directly (some FNA developers prefer this for full control):

```bash
git submodule add https://github.com/rlabrecque/Steamworks.NET.git lib/Steamworks.NET
```

### Native Libraries

Steamworks.NET requires the Steamworks SDK native library alongside your executable:

| Platform | Library | Location |
|----------|---------|----------|
| Windows | `steam_api64.dll` | Next to `.exe` |
| Linux | `libsteam_api.so` | Next to binary or in `lib64/` |
| macOS | `libsteam_api.dylib` | Inside `.app/Contents/MacOS/` |

Download these from the [Steamworks SDK](https://partner.steamgames.com/doc/sdk) (requires a Steamworks partner account).

### Initialization

Initialize Steamworks early in your game, before the game loop starts:

```csharp
using Steamworks;

public class MyGame : Game
{
    public MyGame()
    {
        _graphics = new GraphicsDeviceManager(this);

        // Initialize Steam before anything else
        // 480 is the SpaceWar test AppID — replace with your real AppID
        if (!SteamAPI.Init())
        {
            Console.Error.WriteLine("Steam initialization failed. Is Steam running?");
            // Decide: exit, or run without Steam features
        }
    }

    protected override void Update(GameTime gameTime)
    {
        // Must be called every frame to process Steam callbacks
        SteamAPI.RunCallbacks();
        base.Update(gameTime);
    }

    protected override void OnExiting(object sender, EventArgs args)
    {
        SteamAPI.Shutdown();
        base.OnExiting(sender, args);
    }
}
```

### The `steam_appid.txt` File

During development, place a `steam_appid.txt` file containing your AppID (e.g., `480`) next to the executable. This lets you run the game without launching through Steam. **Remove this file for release builds** — shipped games should always launch through Steam.

---

## 3 — Steam Depot Configuration

FNA's single-assembly model maps well to Steam's depot system. The recommended depot layout:

```
Depot 1 (Shared): Platform-independent files
├── MyGame.dll          (or MyGame.exe for .NET Framework)
├── FNA.dll
├── Content/
│   ├── textures/
│   ├── audio/
│   └── effects/
└── ... (all managed assemblies)

Depot 2 (Windows):
├── steam_api64.dll
├── SDL3.dll
├── FNA3D.dll
├── FAudio.dll
└── ... (Windows fnalibs)

Depot 3 (Linux/SteamOS):
├── libsteam_api.so
├── libSDL3.so.0
├── libFNA3D.so.0
├── libFAudio.so.0
├── run.sh               (launch script)
└── ... (Linux fnalibs)

Depot 4 (macOS):
├── MyGame.app/
│   └── Contents/
│       ├── MacOS/
│       │   ├── MyGame
│       │   ├── libsteam_api.dylib
│       │   └── ... (macOS fnalibs)
│       ├── Resources/
│       └── Info.plist
└── ... (macOS app bundle)
```

The shared depot contains everything platform-independent. Platform depots contain only native libraries and launch scripts. This minimizes upload size since the shared depot (which is typically the largest) is uploaded once.

### Launch Options in Steamworks

```
Windows: MyGame.exe
Linux:   run.sh (or the dotnet publish output binary)
macOS:   MyGame.app
```

For .NET 8+ self-contained publishes, the executable is a native binary — no separate runtime needed.

---

## 4 — Achievements and Stats

```csharp
// Unlock an achievement
SteamUserStats.SetAchievement("ACH_FIRST_BOSS");
SteamUserStats.StoreStats(); // Commits to Steam servers

// Check if already unlocked
bool unlocked;
SteamUserStats.GetAchievement("ACH_FIRST_BOSS", out unlocked);

// Set a stat
SteamUserStats.SetStat("enemies_defeated", 42);
SteamUserStats.StoreStats();

// Read a stat
int enemies;
SteamUserStats.GetStat("enemies_defeated", out enemies);
```

**Best practice:** Batch `StoreStats()` calls rather than calling after every stat change. Once per frame or once per significant event is sufficient.

---

## 5 — Cloud Saves

Steam Cloud provides automatic save synchronization. Configure in Steamworks App Admin, then use the Steam Remote Storage API:

```csharp
// Write a save file to Steam Cloud
byte[] saveData = SerializeSaveGame();
SteamRemoteStorage.FileWrite("save_slot1.dat", saveData, saveData.Length);

// Read a save file from Steam Cloud
int fileSize = SteamRemoteStorage.GetFileSize("save_slot1.dat");
byte[] buffer = new byte[fileSize];
SteamRemoteStorage.FileRead("save_slot1.dat", buffer, fileSize);
var save = DeserializeSaveGame(buffer);

// Check if a file exists
bool exists = SteamRemoteStorage.FileExists("save_slot1.dat");
```

**Alternative: Auto-Cloud.** If your game already saves to a predictable local path, configure Auto-Cloud in Steamworks App Admin to sync that directory automatically — no code changes needed.

For FNA games using SDL3's storage API (see G13/G19), coordinate the save path so Steam Auto-Cloud and SDL3 storage point to the same directory.

---

## 6 — FNA.Steamworks (Xbox Live Shim)

[FNA.Steamworks](https://github.com/FNA-XNA/FNA.Steamworks) reimplements XNA's Xbox Live APIs (`GamerServices`, `SignedInGamer`, etc.) on top of Steamworks. This is primarily useful when porting XNA games that already use Xbox Live APIs.

```csharp
// Original XNA code using GamerServices
SignedInGamer.SignedIn += OnPlayerSignedIn;

// FNA.Steamworks makes this work by mapping Xbox Live concepts to Steam:
// - GamerTag → Steam PersonaName
// - Achievements → Steam Achievements
// - LeaderBoards → Steam Leaderboards
```

For new FNA projects, use Steamworks.NET directly — it's more flexible and better documented. FNA.Steamworks is a compatibility layer for legacy XNA ports.

---

## 7 — GOG Galaxy Integration

GOG Galaxy uses a C++ SDK with community C# wrappers. The integration pattern is similar to Steamworks:

1. Download the GOG Galaxy SDK from the GOG developer portal
2. Use a C# wrapper (e.g., `Galaxy.dll` from the SDK's managed bindings)
3. Initialize in your game constructor, call `ProcessData()` each frame
4. Place native libraries alongside your executable per platform

GOG games must run without any SDK dependency — GOG users may not have Galaxy installed. Wrap all Galaxy calls in try/catch or feature-flag them:

```csharp
public static class GogIntegration
{
    private static bool _initialized;

    public static void Init()
    {
        try
        {
            // Galaxy SDK initialization
            _initialized = true;
        }
        catch (DllNotFoundException)
        {
            // GOG Galaxy not available — run without it
            _initialized = false;
        }
    }

    public static void UnlockAchievement(string id)
    {
        if (!_initialized) return;
        // Galaxy achievement call
    }
}
```

---

## 8 — itch.io Distribution

itch.io is the simplest distribution target. Use the `butler` CLI to push builds:

```bash
# Install butler
curl -L https://broth.itch.ovh/butler/linux-amd64/LATEST/archive/default | tar xz

# Push Windows build
butler push build/windows myname/mygame:windows

# Push Linux build
butler push build/linux myname/mygame:linux

# Push macOS build
butler push build/macos myname/mygame:macos
```

Each platform build is a self-contained directory with the game executable, managed assemblies, content, and the correct platform's fnalibs.

---

## 9 — Steam Deck Considerations

FNA games run well on Steam Deck (Linux/SteamOS) with minimal configuration:

- **Controller input** — FNA's `GamePad` API via SDL3 handles Steam Deck controls automatically
- **Resolution** — Steam Deck's native resolution is 1280×800. Test at this resolution and ensure UI scales appropriately
- **Proton not required** — Native Linux FNA builds run directly on SteamOS without the Proton compatibility layer. This improves performance and battery life
- **Remote debugging** — Visual Studio Code supports remote C# debugging over SSH to a Steam Deck. Set the Steam launch option to: `DOTNET_EnableDiagnostics=1 %command%`

### Verifying Steam Deck Compatibility

Test with these environment variables to simulate Deck conditions:

```bash
# Force the Deck's resolution
SDL_VIDEO_WINDOW_POS=0,0 \
FNA_GRAPHICS_ENABLE_HIGHDPI=1 \
dotnet run --project src/MyGame
```

---

## 10 — FNA vs MonoGame: Distribution Differences

| Aspect | FNA | MonoGame |
|--------|-----|----------|
| Native libraries | Manual (fnalibs) | Bundled via NuGet |
| Runtime requirement | .NET 8+ self-contained or Mono | .NET 8+ or platform-specific |
| Steam depot layout | Shared + per-platform fnalibs | Shared + per-platform runtimes |
| macOS distribution | Manual `.app` bundle | Template-generated `.app` |
| Steamworks.NET | Works identically | Works identically |
| Console stores | NativeAOT binary per platform | Platform-specific project |

The main difference is that FNA requires you to manage native library distribution manually (fnalibs), while MonoGame bundles platform dependencies through NuGet. The tradeoff is more control (FNA) vs. more convenience (MonoGame).
