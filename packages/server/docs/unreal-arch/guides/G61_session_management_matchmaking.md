# Session Management & Matchmaking

> **Category:** guide · **Engine:** Unreal Engine · **Related:** [G5 Networking & Replication](G5_networking_replication.md), [G30 Online Subsystem & EOS](G30_online_subsystem_eos.md), [G59 Dedicated Server Setup](G59_dedicated_server_setup.md)

How to implement multiplayer session creation, discovery, joining, and matchmaking using Unreal Engine's Online Subsystem Session Interface. Covers the full session lifecycle, lobby patterns, platform backends, and integration with dedicated servers. Applies to UE 5.4–5.5+.

## Architecture Overview

Unreal's multiplayer session system is built on three abstraction layers:

```
┌─────────────────────────────────┐
│   Game Code (AGameSession)      │  ← Your game's session logic
├─────────────────────────────────┤
│   IOnlineSession Interface      │  ← Platform-agnostic session API
├─────────────────────────────────┤
│   Online Subsystem Backend      │  ← Steam, EOS, Null, Custom
└─────────────────────────────────┘
```

- **IOnlineSession**: The core interface for all session operations. Created and owned by the Online Subsystem — only exists on the server.
- **AGameSession**: The game-level wrapper that your GameMode uses to interact with sessions. Override this for custom join/approval logic.
- **Online Subsystem**: The platform backend (Steam, Epic Online Services, PlayStation Network, Xbox Live, etc.). Only one is active at a time.

## Session Lifecycle

A session follows a well-defined lifecycle:

```
Create → Register Players → Start → [Gameplay] → End → Unregister → Destroy
                                         ↑                    │
                                         └── Update (optional)┘
```

### 1. Creating a Session

```cpp
#include "OnlineSubsystem.h"
#include "OnlineSessionSettings.h"
#include "Interfaces/OnlineSessionInterface.h"

void UMySessionManager::CreateGameSession()
{
    IOnlineSubsystem* OnlineSub = IOnlineSubsystem::Get();
    if (!OnlineSub) return;

    IOnlineSessionPtr Sessions = OnlineSub->GetSessionInterface();
    if (!Sessions.IsValid()) return;

    // Bind the completion delegate
    Sessions->AddOnCreateSessionCompleteDelegate_Handle(
        FOnCreateSessionCompleteDelegate::CreateUObject(
            this, &UMySessionManager::OnCreateSessionComplete));

    // Configure session settings
    FOnlineSessionSettings SessionSettings;
    SessionSettings.bIsLANMatch = false;
    SessionSettings.NumPublicConnections = 8;
    SessionSettings.NumPrivateConnections = 0;
    SessionSettings.bShouldAdvertise = true;
    SessionSettings.bUsesPresence = true;
    SessionSettings.bAllowJoinInProgress = true;
    SessionSettings.bAllowJoinViaPresence = true;
    SessionSettings.bUseLobbiesIfAvailable = true; // UE 5.x lobby support

    // Custom searchable properties
    SessionSettings.Set(
        FName("MAPNAME"), FString("Arena_01"),
        EOnlineDataAdvertisementType::ViaOnlineServiceAndPing);
    SessionSettings.Set(
        FName("GAMEMODE"), FString("Deathmatch"),
        EOnlineDataAdvertisementType::ViaOnlineServiceAndPing);

    Sessions->CreateSession(0, NAME_GameSession, SessionSettings);
}

void UMySessionManager::OnCreateSessionComplete(FName SessionName, bool bWasSuccessful)
{
    if (bWasSuccessful)
    {
        UE_LOG(LogOnline, Log, TEXT("Session '%s' created successfully"), *SessionName.ToString());
        // Server travel to the game map with ?listen to accept connections
        GetWorld()->ServerTravel("/Game/Maps/Arena_01?listen");
    }
}
```

### 2. Finding Sessions

```cpp
void UMySessionManager::FindSessions()
{
    IOnlineSessionPtr Sessions = IOnlineSubsystem::Get()->GetSessionInterface();

    SearchSettings = MakeShareable(new FOnlineSessionSearch());
    SearchSettings->MaxSearchResults = 20;
    SearchSettings->bIsLanQuery = false;
    SearchSettings->QuerySettings.Set(
        SEARCH_PRESENCE, true, EOnlineComparisonOp::Equals);

    // Optional: filter by custom properties
    SearchSettings->QuerySettings.Set(
        FName("GAMEMODE"), FString("Deathmatch"),
        EOnlineComparisonOp::Equals);

    Sessions->AddOnFindSessionsCompleteDelegate_Handle(
        FOnFindSessionsCompleteDelegate::CreateUObject(
            this, &UMySessionManager::OnFindSessionsComplete));

    Sessions->FindSessions(0, SearchSettings.ToSharedRef());
}

void UMySessionManager::OnFindSessionsComplete(bool bWasSuccessful)
{
    if (!bWasSuccessful || !SearchSettings.IsValid()) return;

    for (const FOnlineSessionSearchResult& Result : SearchSettings->SearchResults)
    {
        FString MapName;
        Result.Session.SessionSettings.Get(FName("MAPNAME"), MapName);

        FString OwnerName = Result.Session.OwningUserName;
        int32 MaxPlayers = Result.Session.SessionSettings.NumPublicConnections;
        int32 CurrentPlayers = MaxPlayers - Result.Session.NumOpenPublicConnections;

        UE_LOG(LogOnline, Log, TEXT("Found: %s | Map: %s | Players: %d/%d"),
            *OwnerName, *MapName, CurrentPlayers, MaxPlayers);
    }
}
```

### 3. Joining a Session

```cpp
void UMySessionManager::JoinFoundSession(const FOnlineSessionSearchResult& SearchResult)
{
    IOnlineSessionPtr Sessions = IOnlineSubsystem::Get()->GetSessionInterface();

    Sessions->AddOnJoinSessionCompleteDelegate_Handle(
        FOnJoinSessionCompleteDelegate::CreateUObject(
            this, &UMySessionManager::OnJoinSessionComplete));

    Sessions->JoinSession(0, NAME_GameSession, SearchResult);
}

void UMySessionManager::OnJoinSessionComplete(
    FName SessionName, EOnJoinSessionCompleteResult::Type Result)
{
    if (Result != EOnJoinSessionCompleteResult::Success) return;

    IOnlineSessionPtr Sessions = IOnlineSubsystem::Get()->GetSessionInterface();

    FString ConnectString;
    if (Sessions->GetResolvedConnectString(SessionName, ConnectString))
    {
        // Travel to the server
        APlayerController* PC = GetWorld()->GetFirstPlayerController();
        if (PC)
        {
            PC->ClientTravel(ConnectString, TRAVEL_Absolute);
        }
    }
}
```

### 4. Session Destruction

```cpp
void UMySessionManager::DestroyCurrentSession()
{
    IOnlineSessionPtr Sessions = IOnlineSubsystem::Get()->GetSessionInterface();

    Sessions->AddOnDestroySessionCompleteDelegate_Handle(
        FOnDestroySessionCompleteDelegate::CreateUObject(
            this, &UMySessionManager::OnDestroySessionComplete));

    Sessions->DestroySession(NAME_GameSession);
}
```

## FOnlineSessionSettings — Key Properties

| Property | Type | Description |
|---|---|---|
| `NumPublicConnections` | `int32` | Max public player slots |
| `NumPrivateConnections` | `int32` | Max invite-only slots |
| `bShouldAdvertise` | `bool` | Visible in search results |
| `bAllowJoinInProgress` | `bool` | Allow mid-game joins |
| `bIsLANMatch` | `bool` | LAN-only discovery |
| `bUsesPresence` | `bool` | Tie to platform presence (friends list) |
| `bUseLobbiesIfAvailable` | `bool` | Use platform lobby system (Steam, EOS) |
| `bIsDedicated` | `bool` | Hosted on a dedicated server |
| `bAllowInvites` | `bool` | Allow friend invitations |

Custom properties are added via `Set()` and queried via `Get()` using `FName` keys.

## Lobby System (UE 5.x)

UE 5.x introduced first-class lobby support through `bUseLobbiesIfAvailable`. When enabled, sessions are backed by the platform's lobby system (e.g., Steam Lobbies, EOS Lobbies) instead of traditional matchmaking servers.

### Lobby vs. Session

| Feature | Traditional Session | Lobby |
|---|---|---|
| Pre-game gathering | No | Yes — players join before gameplay starts |
| Chat / messaging | Manual implementation | Platform-provided |
| Host migration | Not built-in | Platform-dependent |
| Player data sync | Via replication after connect | Via lobby member data |
| Persistence | Tied to game server lifetime | Can outlive the game server |

### Using Lobbies

```cpp
FOnlineSessionSettings LobbySettings;
LobbySettings.bUseLobbiesIfAvailable = true;
LobbySettings.bUsesPresence = true;
LobbySettings.NumPublicConnections = 4;
LobbySettings.bShouldAdvertise = true;

// Players join the lobby first, then the host starts the match
// which triggers server travel
Sessions->CreateSession(0, NAME_GameSession, LobbySettings);
```

## Platform Matchmaking

For platforms that provide built-in matchmaking (Xbox Live, PlayStation Network), use the matchmaking API:

```cpp
void UMySessionManager::StartMatchmaking()
{
    IOnlineSessionPtr Sessions = IOnlineSubsystem::Get()->GetSessionInterface();

    // Session settings if we need to create a new session
    FOnlineSessionSettings NewSessionSettings;
    NewSessionSettings.NumPublicConnections = 8;

    // Search parameters for matching
    TSharedRef<FOnlineSessionSearch> SearchParams =
        MakeShared<FOnlineSessionSearch>();
    SearchParams->QuerySettings.Set(
        FName("GAMEMODE"), FString("Ranked"),
        EOnlineComparisonOp::Equals);

    Sessions->AddOnMatchmakingCompleteDelegate_Handle(
        FOnMatchmakingCompleteDelegate::CreateUObject(
            this, &UMySessionManager::OnMatchmakingComplete));

    Sessions->StartMatchmaking(
        TArray<FSessionMatchmakingUser>{{FUniqueNetIdRef()}},
        NAME_GameSession,
        NewSessionSettings,
        SearchParams);
}

void UMySessionManager::OnMatchmakingComplete(
    FName SessionName, bool bWasSuccessful)
{
    if (bWasSuccessful)
    {
        // Automatically placed in a session — travel to it
        IOnlineSessionPtr Sessions = IOnlineSubsystem::Get()->GetSessionInterface();
        FString ConnectString;
        Sessions->GetResolvedConnectString(SessionName, ConnectString);
        GetWorld()->GetFirstPlayerController()->ClientTravel(
            ConnectString, TRAVEL_Absolute);
    }
}
```

Not all platforms implement `StartMatchmaking()` — check `Sessions->GetSessionInterface()` capabilities and plan fallback logic using `FindSessions()` + `JoinSession()`.

## Integration with Dedicated Servers

When using dedicated servers, the session flow changes:

```
Orchestrator allocates server → Server creates session → Clients find/join → Gameplay
```

### Server-Side Session Creation

On the dedicated server, create the session automatically in `GameMode::InitGame()` or a startup function:

```cpp
void AMyServerGameMode::InitGame(const FString& MapName,
    const FString& Options, FString& ErrorMessage)
{
    Super::InitGame(MapName, Options, ErrorMessage);

    // Create an advertised session for this server instance
    FOnlineSessionSettings Settings;
    Settings.bIsDedicated = true;
    Settings.bShouldAdvertise = true;
    Settings.NumPublicConnections = 16;
    Settings.bAllowJoinInProgress = true;
    Settings.Set(FName("MAPNAME"), MapName,
        EOnlineDataAdvertisementType::ViaOnlineServiceAndPing);

    IOnlineSubsystem::Get()->GetSessionInterface()->CreateSession(
        0, NAME_GameSession, Settings);
}
```

### AGameSession Override

Override `AGameSession` to control player approval:

```cpp
UCLASS()
class AMyGameSession : public AGameSession
{
    GENERATED_BODY()

public:
    virtual void RegisterPlayer(APlayerController* NewPlayer,
        const FUniqueNetIdRepl& UniqueId, bool bWasFromInvite) override;
    virtual void UnregisterPlayer(const APlayerController* ExitingPlayer) override;
    virtual bool KickPlayer(APlayerController* KickedPlayer,
        const FText& KickReason) override;
    virtual void ApproveLogin(const FString& Options) override;
};
```

## Online Subsystem Backends

### Configuration (DefaultEngine.ini)

```ini
; Steam
[OnlineSubsystem]
DefaultPlatformService=Steam

[OnlineSubsystemSteam]
bEnabled=true
SteamDevAppId=480  ; Replace with your App ID

; Epic Online Services
[OnlineSubsystem]
DefaultPlatformService=EOS

[OnlineSubsystemEOS]
bEnabled=true

; Null (LAN/offline testing)
[OnlineSubsystem]
DefaultPlatformService=Null
```

### Backend Capabilities

| Backend | Lobbies | Matchmaking | Presence | Voice | P2P |
|---|---|---|---|---|---|
| **Steam** | Yes | Via lobbies | Yes | Yes | Yes |
| **EOS** | Yes | Yes | Yes | Yes (EOS Voice) | Yes |
| **Null** | No | No | No | No | LAN only |
| **Xbox Live** | Yes | Yes (TrueMatch) | Yes | Yes | Yes |
| **PSN** | Yes | Yes | Yes | Yes | Yes |

## Blueprint Integration

All session operations are available in Blueprints through the **Advanced Sessions Plugin** (community) or by exposing your C++ session manager via `BlueprintCallable` functions:

```cpp
UFUNCTION(BlueprintCallable, Category = "Sessions")
void HostGame(int32 MaxPlayers, FString MapName, FString GameMode);

UFUNCTION(BlueprintCallable, Category = "Sessions")
void FindGames();

UFUNCTION(BlueprintCallable, Category = "Sessions")
void JoinGame(int32 SessionIndex);
```

For Blueprint-heavy projects, the **Advanced Sessions** plugin by Code Lyoko provides Blueprint nodes for `CreateAdvancedSession`, `FindSessionsAdvanced`, and `JoinSession` with full access to custom session settings.

## Delegate Management Best Practices

The Online Subsystem relies heavily on asynchronous delegates. Mismanaging them is a common source of crashes:

```cpp
// GOOD: Store delegate handles and clean up
FDelegateHandle CreateHandle;

void UMySessionManager::CreateSession()
{
    IOnlineSessionPtr Sessions = IOnlineSubsystem::Get()->GetSessionInterface();

    // Remove any stale delegate before binding a new one
    Sessions->ClearOnCreateSessionCompleteDelegate_Handle(CreateHandle);

    CreateHandle = Sessions->AddOnCreateSessionCompleteDelegate_Handle(
        FOnCreateSessionCompleteDelegate::CreateUObject(
            this, &UMySessionManager::OnCreateSessionComplete));

    Sessions->CreateSession(0, NAME_GameSession, Settings);
}

// BAD: Binding without tracking handles → leaks and double-fires
```

### Handling Failures

Always handle failure cases — network interruptions, platform outages, and timeouts are common in production:

```cpp
void UMySessionManager::OnJoinSessionComplete(
    FName SessionName, EOnJoinSessionCompleteResult::Type Result)
{
    switch (Result)
    {
    case EOnJoinSessionCompleteResult::Success:
        // Travel to server
        break;
    case EOnJoinSessionCompleteResult::SessionIsFull:
        ShowError(TEXT("Session is full"));
        break;
    case EOnJoinSessionCompleteResult::SessionDoesNotExist:
        ShowError(TEXT("Session no longer exists"));
        FindSessions(); // Refresh the list
        break;
    case EOnJoinSessionCompleteResult::CouldNotRetrieveAddress:
        ShowError(TEXT("Could not connect to server"));
        break;
    default:
        ShowError(TEXT("Failed to join session"));
        break;
    }
}
```

## Common Pitfalls

1. **Forgetting to destroy sessions**: Always destroy the current session before creating or joining a new one, or the operation will silently fail.
2. **Delegate lifetime**: If the object owning the delegate is garbage collected, the callback will crash. Use `AddWeakLambda` or ensure the owner outlives the async operation.
3. **Platform mismatch**: Not all backends support all features. Test with the `Null` subsystem for LAN, then verify on each target platform.
4. **`bUseLobbiesIfAvailable` inconsistency**: When this is `true`, some session properties behave differently (e.g., `NumOpenPublicConnections` updates are lobby-driven). Test lobby flow separately.
5. **UE 5.5 Join Session issue**: Some developers have reported `JoinSession` returning failure with certain Online Subsystem configurations. Verify your `DefaultEngine.ini` has the correct `NetDriverDefinitions` and that the subsystem's `bEnabled` is set to `true`.
