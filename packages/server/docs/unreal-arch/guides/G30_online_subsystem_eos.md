# G30 — Online Subsystem & Epic Online Services (EOS)

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G5 Networking & Replication](G5_networking_replication.md) · [G1 Gameplay Framework](G1_gameplay_framework.md) · [Unreal Rules](../unreal-arch-rules.md)

Unreal Engine's **Online Subsystem (OSS)** is an abstraction layer that separates your game code from specific platform backends (Steam, EOS, PlayStation Network, Xbox Live, etc.). **Epic Online Services (EOS)** is Epic's free, cross-platform backend providing matchmaking, lobbies, sessions, authentication, stats, leaderboards, and voice chat. This guide covers the OSS architecture, EOS integration, session management, dedicated server setup, and cross-platform patterns — all targeting UE5.4+ C++.

> **G5 covers replication** (how replicated properties and RPCs move data between server and clients). This guide covers the **layer above that**: how players find each other, create sessions, authenticate, and connect in the first place.

---

## Architecture: The Online Subsystem Abstraction

```
┌──────────────────────────────────────────────────┐
│                Your Game Code                     │
│  (Uses IOnlineSubsystem, IOnlineSession, etc.)   │
└──────────────────────┬───────────────────────────┘
                       │  Interface calls
                       ▼
┌──────────────────────────────────────────────────┐
│           Online Subsystem Interface              │
│  IOnlineSubsystem, IOnlineSession,               │
│  IOnlineIdentity, IOnlineFriends,                │
│  IOnlineLeaderboards, IOnlineStats               │
└──────────┬──────────┬──────────┬─────────────────┘
           │          │          │
     ┌─────▼──┐ ┌────▼───┐ ┌───▼────┐
     │  EOS   │ │ Steam  │ │  NULL  │
     │  OSS   │ │  OSS   │ │  OSS   │
     │ Plugin │ │ Plugin │ │(LAN/IP)│
     └────────┘ └────────┘ └────────┘
```

### Why This Abstraction Matters

Without the OSS layer, you'd write platform-specific code for every backend:

```cpp
// BAD — platform-specific, not portable
#if PLATFORM_STEAM
    SteamMatchmaking()->CreateLobby(...);
#elif PLATFORM_EOS
    EOS_Lobby_CreateLobby(...);
#endif

// GOOD — platform-agnostic via OSS
IOnlineSubsystem* OSS = Online::GetSubsystem(GetWorld());
IOnlineSessionPtr Sessions = OSS->GetSessionInterface();
Sessions->CreateSession(0, SessionName, SessionSettings);
```

Your game code talks to interfaces. The active OSS plugin handles the platform-specific implementation.

---

## Configuring EOS

### Step 1: Create an EOS Application

1. Go to the [Epic Games Developer Portal](https://dev.epicgames.com/portal)
2. Create a new Product → Application
3. Note your **Product ID**, **Sandbox ID**, **Deployment ID**, **Client ID**, and **Client Secret**

### Step 2: Engine Configuration

Add to your `DefaultEngine.ini`:

```ini
[OnlineSubsystem]
; WHY DefaultPlatformService: This tells the engine which OSS plugin to
; use by default. Set to "EOS" for Epic Online Services.
DefaultPlatformService=EOS

[OnlineSubsystemEOS]
; Your application credentials from the Developer Portal
ProductId=<your_product_id>
SandboxId=<your_sandbox_id>
DeploymentId=<your_deployment_id>
ClientId=<your_client_id>
ClientSecret=<your_client_secret>

; WHY bEnabled: Explicitly enable the EOS subsystem
bEnabled=true
; WHY bUseEAS: Enable Epic Account Services for authentication
bUseEAS=true
; WHY bUseEOSConnect: Enable EOS Connect for cross-platform identity
bUseEOSConnect=true
```

### Step 3: Module Dependencies

```csharp
// MyGame.Build.cs
PublicDependencyModuleNames.AddRange(new string[]
{
    "OnlineSubsystem",       // Core OSS interfaces
    "OnlineSubsystemUtils",  // Helper functions and Blueprint nodes
});

// WHY not depending on OnlineSubsystemEOS directly: Your game code
// should only use the interfaces. The specific backend is loaded
// via config, not compile-time dependency.
```

---

## Authentication

EOS supports multiple authentication methods. The OSS handles them through `IOnlineIdentity`:

```cpp
void AMyPlayerController::LoginWithEOS()
{
    IOnlineSubsystem* OSS = Online::GetSubsystem(GetWorld());
    if (!OSS) return;

    IOnlineIdentityPtr Identity = OSS->GetIdentityInterface();
    if (!Identity) return;

    // Bind the completion delegate BEFORE calling Login
    // WHY delegate first: Login is asynchronous. If you bind after calling
    // Login, you might miss the callback on very fast connections.
    Identity->AddOnLoginCompleteDelegate_Handle(0,
        FOnLoginCompleteDelegate::CreateUObject(
            this, &AMyPlayerController::OnLoginComplete));

    FOnlineAccountCredentials Credentials;
    // WHY AccountPortal type: This launches the Epic account login flow
    // in a browser overlay. Other types include "developer" (for testing
    // with DevAuthTool), "exchangecode", and "persistentauth".
    Credentials.Type = TEXT("accountportal");

    Identity->Login(0, Credentials);
}

void AMyPlayerController::OnLoginComplete(
    int32 LocalUserNum, bool bWasSuccessful,
    const FUniqueNetId& UserId, const FString& Error)
{
    if (bWasSuccessful)
    {
        // Player is authenticated — can now create/join sessions
        UE_LOG(LogOnline, Log, TEXT("EOS Login succeeded for user %s"),
            *UserId.ToString());
    }
    else
    {
        UE_LOG(LogOnline, Error, TEXT("EOS Login failed: %s"), *Error);
    }
}
```

### Authentication Types

| Type | Use Case | Notes |
|------|----------|-------|
| `accountportal` | Player-facing login | Opens browser overlay for Epic account |
| `developer` | Development/testing | Uses DevAuthTool — no real account needed |
| `persistentauth` | Returning players | Auto-login with cached refresh token |
| `exchangecode` | Epic Games Store launch | Code passed via command line at launch |
| `externalauth` | Cross-platform (Steam, PSN, etc.) | Links external platform identity to EOS |

---

## Session Management

Sessions are the core of multiplayer connectivity — they represent a game instance that players can find and join.

### Creating a Session

```cpp
void AMyGameMode::CreateGameSession()
{
    IOnlineSubsystem* OSS = Online::GetSubsystem(GetWorld());
    IOnlineSessionPtr Sessions = OSS->GetSessionInterface();

    // Bind completion delegate
    Sessions->AddOnCreateSessionCompleteDelegate_Handle(
        FOnCreateSessionCompleteDelegate::CreateUObject(
            this, &AMyGameMode::OnCreateSessionComplete));

    FOnlineSessionSettings Settings;

    // WHY bIsLANMatch false: We want this session visible via EOS matchmaking,
    // not just on the local network.
    Settings.bIsLANMatch = false;

    // WHY bShouldAdvertise: Makes the session findable by other players
    // through FindSessions(). Set to false for private/invite-only games.
    Settings.bShouldAdvertise = true;

    // WHY bUsesPresence: Enables presence-based matchmaking (friends can
    // see you're in a game and join via the social overlay).
    Settings.bUsesPresence = true;

    Settings.NumPublicConnections = 8;
    Settings.bAllowJoinInProgress = true;

    // Custom session attributes for filtering during search
    // WHY FOnlineSessionSetting: These key-value pairs are searchable.
    // Players can filter sessions by map, game mode, etc.
    Settings.Set(FName("MapName"), FString("Arena_01"),
        EOnlineDataAdvertisementType::ViaOnlineServiceAndPing);
    Settings.Set(FName("GameMode"), FString("Deathmatch"),
        EOnlineDataAdvertisementType::ViaOnlineServiceAndPing);

    Sessions->CreateSession(0, NAME_GameSession, Settings);
}

void AMyGameMode::OnCreateSessionComplete(
    FName SessionName, bool bWasSuccessful)
{
    if (bWasSuccessful)
    {
        UE_LOG(LogOnline, Log, TEXT("Session '%s' created successfully"),
            *SessionName.ToString());
        // Session is now live — other players can find and join it
    }
}
```

### Finding and Joining Sessions

```cpp
void AMyPlayerController::FindSessions()
{
    IOnlineSubsystem* OSS = Online::GetSubsystem(GetWorld());
    IOnlineSessionPtr Sessions = OSS->GetSessionInterface();

    Sessions->AddOnFindSessionsCompleteDelegate_Handle(
        FOnFindSessionsCompleteDelegate::CreateUObject(
            this, &AMyPlayerController::OnFindSessionsComplete));

    // WHY TSharedRef: The search object is shared between the caller and
    // the async operation. It's populated with results when the search completes.
    SessionSearch = MakeShareable(new FOnlineSessionSearch());
    SessionSearch->MaxSearchResults = 20;
    SessionSearch->bIsLanQuery = false;

    // Filter by game mode
    SessionSearch->QuerySettings.Set(
        FName("GameMode"), FString("Deathmatch"),
        EOnlineComparisonOp::Equals);

    Sessions->FindSessions(0, SessionSearch.ToSharedRef());
}

void AMyPlayerController::OnFindSessionsComplete(bool bWasSuccessful)
{
    if (!bWasSuccessful || !SessionSearch) return;

    for (const FOnlineSessionSearchResult& Result :
         SessionSearch->SearchResults)
    {
        FString MapName;
        Result.Session.SessionSettings.Get(FName("MapName"), MapName);

        UE_LOG(LogOnline, Log, TEXT("Found session on map: %s (Ping: %d)"),
            *MapName, Result.PingInMs);
    }
}

void AMyPlayerController::JoinSession(
    const FOnlineSessionSearchResult& SearchResult)
{
    IOnlineSubsystem* OSS = Online::GetSubsystem(GetWorld());
    IOnlineSessionPtr Sessions = OSS->GetSessionInterface();

    Sessions->AddOnJoinSessionCompleteDelegate_Handle(
        FOnJoinSessionCompleteDelegate::CreateUObject(
            this, &AMyPlayerController::OnJoinSessionComplete));

    Sessions->JoinSession(0, NAME_GameSession, SearchResult);
}

void AMyPlayerController::OnJoinSessionComplete(
    FName SessionName,
    EOnJoinSessionCompleteResult::Type Result)
{
    if (Result == EOnJoinSessionCompleteResult::Success)
    {
        // Get the connect string and travel to the server
        IOnlineSubsystem* OSS = Online::GetSubsystem(GetWorld());
        FString ConnectInfo;
        OSS->GetSessionInterface()->GetResolvedConnectString(
            SessionName, ConnectInfo);

        // WHY ClientTravel: This initiates the network connection to the
        // server. The connect string contains the IP:Port or EOS relay address.
        APlayerController* PC = GetWorld()->GetFirstPlayerController();
        if (PC)
        {
            PC->ClientTravel(ConnectInfo, TRAVEL_Absolute);
        }
    }
}
```

---

## Dedicated Server Setup

### Server Configuration

Dedicated servers don't use `accountportal` login — they use **server credentials**:

```ini
; DefaultEngine.ini — Dedicated Server overrides
[OnlineSubsystemEOS]
; WHY dedicated server credentials: Servers authenticate with their own
; identity, not a player account. This is separate from player auth.
DedicatedServerClientId=<server_client_id>
DedicatedServerClientSecret=<server_client_secret>
```

### Server Session Registration

```cpp
// In your dedicated server GameMode
void AMyDedicatedGameMode::InitGame(
    const FString& MapName,
    const FString& Options,
    FString& ErrorMessage)
{
    Super::InitGame(MapName, Options, ErrorMessage);

    // WHY InitGame: This is the earliest point where the server can register
    // its session. The map is loaded and the GameMode is initialized.
    if (IsRunningDedicatedServer())
    {
        RegisterServerSession();
    }
}

void AMyDedicatedGameMode::RegisterServerSession()
{
    IOnlineSubsystem* OSS = Online::GetSubsystem(GetWorld());
    IOnlineSessionPtr Sessions = OSS->GetSessionInterface();

    FOnlineSessionSettings Settings;
    Settings.bIsDedicated = true;
    Settings.bIsLANMatch = false;
    Settings.bShouldAdvertise = true;
    Settings.bUsesPresence = false; // Dedicated servers don't use presence
    Settings.NumPublicConnections = 16;

    Settings.Set(FName("ServerName"), FString("My Dedicated Server"),
        EOnlineDataAdvertisementType::ViaOnlineServiceAndPing);
    Settings.Set(FName("MapName"), GetWorld()->GetMapName(),
        EOnlineDataAdvertisementType::ViaOnlineServiceAndPing);

    Sessions->AddOnCreateSessionCompleteDelegate_Handle(
        FOnCreateSessionCompleteDelegate::CreateLambda(
            [](FName Name, bool bSuccess)
            {
                UE_LOG(LogOnline, Log,
                    TEXT("Dedicated server session '%s': %s"),
                    *Name.ToString(),
                    bSuccess ? TEXT("Registered") : TEXT("FAILED"));
            }));

    Sessions->CreateSession(0, NAME_GameSession, Settings);
}
```

---

## Cross-Platform with EOS Connect

EOS Connect provides a platform-agnostic identity layer. Players from Steam, PSN, Xbox, and Epic can play together:

```
Steam Player   ──► Steam Auth Token ──► EOS Connect ──► EOS Product User ID
Epic Player    ──► Epic Auth Token  ──► EOS Connect ──► EOS Product User ID
PSN Player     ──► PSN Auth Token   ──► EOS Connect ──► EOS Product User ID
                                                              │
                                        All three share the same
                                        matchmaking pool and sessions
```

> **WHY EOS Connect vs EOS Auth:** EOS Auth is for Epic accounts specifically. EOS Connect wraps *any* platform identity into a unified Product User ID. For cross-platform play, always use EOS Connect.

---

## Lobby System

For social-first games (party formation before matchmaking), use the Lobby interface:

```cpp
void AMyPlayerController::CreateLobby()
{
    IOnlineSubsystem* OSS = Online::GetSubsystem(GetWorld());

    // WHY GetLobbyInterface and not GetSessionInterface: Lobbies are
    // persistent chat rooms where players gather before a match.
    // Sessions represent the actual game server. Players join a lobby
    // first, then the lobby owner starts matchmaking or creates a session.
    IOnlineLobbyPtr Lobbies = OSS->GetLobbyInterface();

    if (!Lobbies) return;

    // Lobby configuration varies by OSS implementation.
    // For EOS, lobbies support up to 64 members with built-in
    // voice chat, presence, and attribute storage.
}
```

---

## Session Lifecycle

Understanding the full lifecycle prevents common multiplayer bugs:

```
1. Host creates session (CreateSession)
        │
2. Session is advertised on backend
        │
3. Clients find session (FindSessions)
        │
4. Client joins (JoinSession → ClientTravel)
        │
5. Players are in-game (Replication layer — see G5)
        │
6. Player leaves (DestroySession on client)
        │
7. Host ends game (DestroySession on server)
        │
8. Session removed from backend
```

### Cleanup

Always destroy sessions when leaving:

```cpp
void AMyPlayerController::LeaveGame()
{
    IOnlineSubsystem* OSS = Online::GetSubsystem(GetWorld());
    IOnlineSessionPtr Sessions = OSS->GetSessionInterface();

    // WHY DestroySession: Failing to destroy leaves ghost sessions on the
    // backend. Other players will see the session in search results but
    // fail to connect. EOS sessions have a TTL but it can take minutes.
    Sessions->DestroySession(NAME_GameSession);
}
```

---

## Common Pitfalls

1. **Calling Login after CreateSession.** You must be authenticated before any session operations. Always ensure `OnLoginComplete` fires successfully before creating or finding sessions.

2. **Missing `bShouldAdvertise`.** Without this flag, sessions are invisible to `FindSessions`. Use it for public matchmaking; omit it only for private invite-only games.

3. **Not destroying sessions on disconnect.** Ghost sessions pollute search results. Always call `DestroySession` in your cleanup flow, including when the application is force-closed (handle `FCoreDelegates::OnExit`).

4. **Using `DefaultPlatformService=NULL` in shipping builds.** The NULL subsystem is for LAN testing only. It doesn't provide real authentication, matchmaking, or cross-play. Always configure a real backend for release.

5. **Hardcoding EOS credentials in source.** Store Product ID, Client ID, and Client Secret in config files (`.ini`) that are excluded from source control, or use environment variables for CI/CD.

6. **Forgetting `GetResolvedConnectString`.** After `JoinSession`, you must get the connect string from the session interface and call `ClientTravel`. The join doesn't automatically connect you to the game server.

7. **Server validation with `_Validate` functions.** When using server RPCs with EOS, always implement the `_Validate` suffix function. Unreal requires it for all `Server` functions, and skipping it causes compile errors in shipping builds.
