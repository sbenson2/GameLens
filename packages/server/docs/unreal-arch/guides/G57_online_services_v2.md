# Online Services v2 (OSSv2)

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G30 Online Subsystem EOS](G30_online_subsystem_eos.md), [G5 Networking Replication](G5_networking_replication.md), [G38 Iris Replication System](G38_iris_replication_system.md)

The Online Services framework (commonly called OSSv2) is Unreal Engine's modern replacement for the legacy Online Subsystem (OSSv1). Introduced in UE 4.27 and maturing through UE 5.x, OSSv2 provides a cleaner, more modular architecture for integrating platform services like authentication, matchmaking, lobbies, leaderboards, and friends lists across PC, console, and mobile.

## OSSv1 vs OSSv2 — Why the Rewrite?

The original Online Subsystem (OSSv1) served UE4 well but accumulated technical debt:

- **Monolithic interfaces:** A single `IOnlineSubsystem` object owned every service (sessions, friends, stats, etc.), making it hard to swap individual backends.
- **Platform coupling:** Porting to a new platform often required touching unrelated service code.
- **Synchronous patterns:** Many OSSv1 APIs used blocking delegates that complicated async-heavy modern platforms (EOS, Steam, PlayStation Network, Xbox Live).

OSSv2 addresses these by splitting each service into an independent module with its own interface, lifecycle, and configuration.

## Architecture Overview

```
┌─────────────────────────────────────────┐
│              Game Code                   │
│   (uses IAuth, ILobbies, ISessions...) │
├─────────────────────────────────────────┤
│         Online Services API              │
│   IAuth │ ILobbies │ ISessions │ ...    │
├────┬────┴────┬─────┴────┬───────────────┤
│ EOS│  Steam  │  PSN/XBL │  Null/Custom  │
│impl│  impl   │   impl   │    impl       │
└────┴─────────┴──────────┴───────────────┘
```

Each service interface (e.g., `UE::Online::IAuth`, `UE::Online::ILobbies`) is independent. Your game code programs against the interface; the active backend is selected via configuration.

## Key Service Interfaces

| Interface | Namespace | Purpose |
|-----------|-----------|---------|
| `IAuth` | `UE::Online` | Authentication, login flows, token management |
| `ILobbies` | `UE::Online` | Lobby creation, discovery, join/leave |
| `ISessions` | `UE::Online` | Game session management, matchmaking integration |
| `IFriends` | `UE::Online` | Friends list, presence, invites |
| `ILeaderboards` | `UE::Online` | Score submission and queries |
| `IStats` | `UE::Online` | Player statistics tracking |
| `IAchievements` | `UE::Online` | Achievement unlock and progress |
| `IPresence` | `UE::Online` | Rich presence / activity status |
| `IEntitlements` | `UE::Online` | DLC / product ownership checks |
| `IUserCloud` | `UE::Online` | Cloud save / user file storage |
| `IVoiceChat` | `UE::Online` | Voice communication channels |

## Getting Started

### Plugin Setup

Enable the Online Services plugins in your `.uproject` file:

```json
{
  "Plugins": [
    { "Name": "OnlineServicesEOS", "Enabled": true },
    { "Name": "OnlineServicesNull", "Enabled": true }
  ]
}
```

### Configuration (DefaultEngine.ini)

```ini
[OnlineServices]
DefaultServiceProvider=EOS

[OnlineServices.EOS]
ProductId=<your_product_id>
SandboxId=<your_sandbox_id>
DeploymentId=<your_deployment_id>
ClientId=<your_client_id>
ClientSecret=<your_client_secret>
```

### C++ — Authenticating a Player

```cpp
#include "Online/OnlineServices.h"
#include "Online/Auth.h"

void UMyGameInstance::LoginWithEOS()
{
    UE::Online::IOnlineServicesPtr Services = UE::Online::GetServices();
    if (!Services)
    {
        UE_LOG(LogTemp, Error, TEXT("Online Services not available"));
        return;
    }

    UE::Online::IAuthPtr Auth = Services->GetAuthInterface();

    UE::Online::FAuthLogin::Params LoginParams;
    LoginParams.PlatformUserId = GetLocalPlatformUserId();
    // CredentialsType and additional params vary by platform

    Auth->Login(MoveTemp(LoginParams))
        .OnComplete([this](const UE::Online::TOnlineResult<UE::Online::FAuthLogin>& Result)
        {
            if (Result.IsOk())
            {
                UE_LOG(LogTemp, Log, TEXT("Login succeeded"));
            }
            else
            {
                UE_LOG(LogTemp, Error, TEXT("Login failed: %s"),
                    *Result.GetErrorValue().GetLogString());
            }
        });
}
```

### C++ — Creating a Lobby

```cpp
#include "Online/Lobbies.h"

void UMyGameInstance::CreateLobby()
{
    UE::Online::IOnlineServicesPtr Services = UE::Online::GetServices();
    UE::Online::ILobbiesPtr Lobbies = Services->GetLobbiesInterface();

    UE::Online::FCreateLobby::Params Params;
    Params.LocalAccountId = GetLocalAccountId();
    Params.MaxMembers = 4;
    Params.JoinPolicy = UE::Online::ELobbyJoinPolicy::PublicAdvertised;

    // Set custom attributes
    Params.Attributes.Emplace(TEXT("GameMode"), FString(TEXT("Cooperative")));
    Params.Attributes.Emplace(TEXT("MapName"), FString(TEXT("ForestLevel")));

    Lobbies->CreateLobby(MoveTemp(Params))
        .OnComplete([](const UE::Online::TOnlineResult<UE::Online::FCreateLobby>& Result)
        {
            if (Result.IsOk())
            {
                // Lobby created — share LobbyId with friends or matchmaker
            }
        });
}
```

## Migration from OSSv1

### Step-by-Step

1. **Audit OSSv1 usage:** Search for `IOnlineSubsystem::Get()`, `Online::GetSubsystem()`, and OSSv1 interface headers like `OnlineSessionInterface.h`.
2. **Replace headers:** Swap `#include "OnlineSubsystem.h"` with `#include "Online/OnlineServices.h"` and specific interface headers.
3. **Update API calls:** OSSv2 uses `TOnlineResult<>` futures instead of delegate-based callbacks. Refactor completion handlers.
4. **Configuration:** Move platform credentials from `[OnlineSubsystem]` sections to `[OnlineServices]` sections in `DefaultEngine.ini`.
5. **Test with Null provider:** Use `DefaultServiceProvider=Null` for offline testing before connecting to live services.

### Key API Differences

| Concept | OSSv1 | OSSv2 |
|---------|-------|-------|
| Get service | `IOnlineSubsystem::Get()` | `UE::Online::GetServices()` |
| Auth | `GetIdentityInterface()` | `GetAuthInterface()` |
| Sessions | `GetSessionInterface()` | `GetSessionsInterface()` |
| Completion | `FOnComplete` delegates | `TOnlineResult<>` futures |
| Namespace | Global / `IOnline*` | `UE::Online::` |
| Error handling | Bool + error string | `TOnlineResult<>::GetErrorValue()` |

## Lobbies vs Sessions

A common point of confusion: OSSv2 separates **Lobbies** and **Sessions** into distinct interfaces.

- **Lobbies** (`ILobbies`): Social gathering spaces. Players browse, join, and chat before gameplay starts. No built-in host address concept — you provide connection info via custom attributes.
- **Sessions** (`ISessions`): Represent active gameplay. Support host addresses, matchmaking queues, and player tracking. Used by `AGameSession` and travel.

For listen-server games, create a Lobby for the social layer, then transition to a Session when gameplay begins. The `bUseLobbiesIfAvailable` pattern from OSSv1 is replaced by explicit Lobby → Session transitions in OSSv2.

## Platform-Specific Backends

| Backend Plugin | Platforms | Notes |
|---------------|-----------|-------|
| `OnlineServicesEOS` | PC, Console | Epic Online Services — cross-platform default |
| `OnlineServicesSteam` | PC | Steam API integration |
| `OnlineServicesNull` | All | Offline testing, no network calls |

Console-specific backends (PSN, Xbox Live, Nintendo) are available under NDA in platform-specific UE distributions.

## Current Status (as of UE 5.7)

- OSSv2 is **API-complete** — all major service interfaces are defined and functional.
- OSSv2 has **not yet shipped in a major title** — Epic recommends it for new projects but notes that battle-tested OSSv1 remains supported.
- Both OSSv1 and OSSv2 coexist in the engine. There is no forced migration timeline.
- Active development continues on EOS backend maturity and console platform support.

## Best Practices

1. **Program against interfaces, not backends.** Never cast to EOS-specific types in game code.
2. **Use the Null provider for CI/CD.** Automated tests should not depend on live platform services.
3. **Handle login failures gracefully.** Platform auth can fail for many reasons (network, expired tokens, parental controls). Always provide retry and offline-mode paths.
4. **Separate social (Lobbies) from gameplay (Sessions).** This maps cleanly to most platform models and simplifies cross-play.
5. **Monitor deprecation notes.** As OSSv2 matures, some OSSv1 interfaces may be deprecated. Check release notes each engine version.

## Further Reading

- Epic Documentation: [Online Services Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-online-services-in-unreal-engine)
- Epic Documentation: [Online Subsystem EOS Plugin](https://dev.epicgames.com/documentation/en-us/unreal-engine/online-subsystem-eos-plugin-in-unreal-engine)
- Redpoint Games: [EOS Online Framework](https://docs.redpoint.games/)
