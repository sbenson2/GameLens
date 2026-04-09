# Dedicated Server Setup & Architecture

> **Category:** guide · **Engine:** Unreal Engine · **Related:** [G5 Networking & Replication](G5_networking_replication.md), [G30 Online Subsystem & EOS](G30_online_subsystem_eos.md), [G38 Iris Replication System](G38_iris_replication_system.md)

How to build, configure, and deploy an Unreal Engine dedicated server — covering source builds, target files, GameMode separation, headless packaging, and production deployment patterns. Applies to UE 5.4–5.5+.

## Prerequisites

Dedicated servers **require** a source build of Unreal Engine — the Epic Games Launcher version does not include server targets. Your project must also be a C++ project (Blueprint-only projects lack the necessary `.Target.cs` files).

### Source Build Checklist

1. Clone the Unreal Engine source from Epic's GitHub (requires linked Epic Games account).
2. Run `Setup.bat` (Windows) or `Setup.sh` (Linux/macOS) to fetch dependencies.
3. Generate project files with `GenerateProjectFiles.bat`.
4. Build the `Development Editor` configuration from the generated solution.

## Server Target Configuration

Every UE project has two default target files in its `Source/` directory:

```
Source/
├── MyGame.Target.cs          // Client/Game target
├── MyGameEditor.Target.cs    // Editor target
└── MyGameServer.Target.cs    // YOU CREATE THIS
```

### Creating the Server Target

Copy `MyGame.Target.cs` and rename it `MyGameServer.Target.cs`. Modify it as follows:

```csharp
// MyGameServer.Target.cs
using UnrealBuildTool;

public class MyGameServerTarget : TargetRules
{
    public MyGameServerTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Server;
        DefaultBuildSettings = BuildSettingsVersion.Latest;
        IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

        // Disable rendering on the server — saves memory and CPU
        bUseLoggingInShipping = true;

        // Optional: strip unnecessary modules
        // bCompileNavmeshClusterLinks = false;
        // bCompileRecast = true; // Keep if server needs pathfinding
    }
}
```

After adding this file, regenerate project files. The `MyGameServer` target now appears in your IDE's build target dropdown and in the Editor's packaging menu.

### Build Target Types

| Target Type | Net Mode | Rendering | Use Case |
|---|---|---|---|
| `Game` | `NM_Standalone` or `NM_Client` | Full rendering | Shipped client |
| `Client` | `NM_Client` only | Full rendering | Client that cannot host |
| `Server` | `NM_DedicatedServer` | No rendering | Headless dedicated server |
| `Editor` | Any | Full rendering | Development only |

## Server GameMode Architecture

Dedicated servers run a separate `GameMode` that handles only server-side logic. The client never instantiates this class.

```cpp
// MyServerGameMode.h
UCLASS()
class AMyServerGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    AMyServerGameMode();

    virtual void PreLogin(const FString& Options, const FString& Address,
        const FUniqueNetIdRepl& UniqueId, FString& ErrorMessage) override;
    virtual APlayerController* Login(UPlayer* NewPlayer, ENetRole InRemoteRole,
        const FString& Portal, const FString& Options,
        const FUniqueNetIdRepl& UniqueId, FString& ErrorMessage) override;
    virtual void PostLogin(APlayerController* NewPlayer) override;
    virtual void Logout(AController* Exiting) override;
};
```

### Conditional Compilation

Use `WITH_SERVER_CODE` to guard server-only logic that should never compile into client builds:

```cpp
#if WITH_SERVER_CODE
void AMyServerGameMode::PerformAntiCheatValidation(APlayerController* PC)
{
    // Server-only anti-cheat logic
}
#endif
```

Similarly, use `UE_SERVER` for preprocessor checks:

```cpp
#if UE_SERVER
    // Code only compiled in Server targets
#endif
```

## Network Configuration

### DefaultEngine.ini — Server Settings

```ini
[/Script/Engine.GameEngine]
+NetDriverDefinitions=(DefName="GameNetDriver",DriverClassName="OnlineSubsystemSteam.SteamNetDriver",DriverClassNameFallback="OnlineSubsystemUtils.IpNetDriver")

[/Script/OnlineSubsystemUtils.IpNetDriver]
NetServerMaxTickRate=60
MaxNetTickRate=60
InitialConnectTimeout=120.0
ConnectionTimeout=80.0

[URL]
Port=7777

[/Script/Engine.GameSession]
MaxPlayers=16
```

### DefaultGame.ini — Map Configuration

```ini
[/Script/EngineSettings.GameMapsSettings]
GameDefaultMap=/Game/Maps/MainMenu
ServerDefaultMap=/Game/Maps/GameLevel
GlobalDefaultGameMode=/Script/MyGame.MyGameMode
GlobalDefaultServerGameMode=/Script/MyGame.MyServerGameMode
```

Set `ServerDefaultMap` to the map the dedicated server loads on startup — this is separate from the client's default map.

## Packaging the Server

### From Editor (UE 5.5+)

1. Open **Platforms → Windows/Linux → Server** in the toolbar.
2. Select the `MyGameServer` build target.
3. Choose the `Shipping` build configuration for production.
4. Set the output directory and click **Package**.

### From Command Line (RunUAT)

```bash
# Windows Server — Shipping
RunUAT.bat BuildCookRun \
    -project="C:/Projects/MyGame/MyGame.uproject" \
    -noP4 -platform=Win64 -server -serverplatform=Win64 \
    -build -cook -stage -pak -archive \
    -archivedirectory="C:/Builds/Server" \
    -configuration=Shipping -dedicatedserver -nodebuginfo

# Linux Server — Cross-compile from Windows
RunUAT.bat BuildCookRun \
    -project="C:/Projects/MyGame/MyGame.uproject" \
    -noP4 -platform=Linux -server -serverplatform=Linux \
    -build -cook -stage -pak -archive \
    -archivedirectory="C:/Builds/LinuxServer" \
    -configuration=Shipping -dedicatedserver -nodebuginfo
```

### Cross-Compilation for Linux

Install the Linux cross-compile toolchain from Epic's download page or build `clang` from the bundled source. Set the `LINUX_MULTIARCH_ROOT` environment variable to point to the toolchain.

## Running the Server

```bash
# Basic launch
./MyGameServer.exe -log

# Common command-line arguments
./MyGameServer.exe \
    -log \
    -port=7777 \
    -MaxPlayers=16 \
    Map=/Game/Maps/GameLevel \
    -nosteam         # Skip Steam initialization (for testing)
```

### Essential Server Command-Line Arguments

| Argument | Description |
|---|---|
| `-log` | Open a console window with log output |
| `-port=NNNN` | Override the default listen port (7777) |
| `-MaxPlayers=N` | Set max concurrent players |
| `-MULTIHOME=IP` | Bind to a specific network interface |
| `-bIsLanMatch` | Advertise on LAN only |
| `-nosteam` | Skip Steam subsystem initialization |
| `Map=/Game/Maps/X` | Override the startup map |

### Client Connection

From a client, connect via the console (`~` key):

```
open 192.168.1.100:7777
```

Or programmatically:

```cpp
GetWorld()->GetFirstPlayerController()->ClientTravel(
    TEXT("192.168.1.100:7777"), TRAVEL_Absolute);
```

## Production Deployment Patterns

### Containerized (Docker)

Dedicated servers do not require GPU or rendering libraries, making them ideal for lightweight containers:

```dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y libssl3 libcurl4 && rm -rf /var/lib/apt/lists/*
COPY ./LinuxServer /opt/gameserver
WORKDIR /opt/gameserver
EXPOSE 7777/udp
ENTRYPOINT ["./MyGameServer", "-log", "-port=7777"]
```

### Cloud Hosting Services

| Service | Integration | Notes |
|---|---|---|
| Amazon GameLift | GameLift Server SDK plugin | Auto-scaling, matchmaking via FlexMatch |
| Azure PlayFab MPS | PlayFab GSDK for UE | Container orchestration, global deployment |
| Edgegap | REST API integration | Edge computing, low-latency routing |
| Hathora | Container-based | Simple API, no UE-specific SDK needed |

### Health Monitoring

Implement a heartbeat endpoint or use Unreal's built-in `-messaging` system to report server health:

```cpp
// In your ServerGameMode::Tick
void AMyServerGameMode::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    HeartbeatTimer += DeltaSeconds;
    if (HeartbeatTimer >= HeartbeatInterval)
    {
        HeartbeatTimer = 0.f;
        ReportHealthToOrchestrator(GetNumPlayers(), GetServerStatus());
    }
}
```

## Debugging Tips

- **PIE with Dedicated Server**: In the Editor, set **Play → Net Mode → Play As Client** and check **Run Dedicated Server** to test locally with a headless server process.
- **Server logs**: Check `Saved/Logs/MyGameServer.log` on the server side.
- **Network profiling**: Use `stat net` and the **Network Profiler** tool in Unreal Insights to trace replication traffic.
- **Build size**: A typical UE 5.5 Linux dedicated server build ranges from 200–500 MB depending on content. Strip debug symbols (`-nodebuginfo`) and exclude unneeded plugins to minimize size.

## Common Pitfalls

1. **Missing `Server.Target.cs`**: Without this file the `Server` build target does not exist.
2. **Blueprint-only projects**: Cannot create server targets — add a minimal C++ class to convert.
3. **Rendering code in server path**: Calling `UUserWidget::CreateWidget` or accessing `UMaterialInstanceDynamic` on the server will crash. Guard with `IsRunningDedicatedServer()`.
4. **Firewall / port forwarding**: UDP port 7777 (or your custom port) must be open for inbound traffic.
5. **Content cooking mismatch**: Server and client builds must cook from the same content version or clients will fail to join with asset hash mismatches.
