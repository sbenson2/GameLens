# Multi-User Editing (Concert)

> **Category:** guide · **Engine:** Unreal Engine 5.0+ · **Related:** [G43 Source Control Collaboration](G43_source_control_collaboration.md), [G37 Editor Scripting Automation](G37_editor_scripting_automation.md), [G48 Data Layers Level Instancing](G48_data_layers_level_instancing.md)

Multi-User Editing allows multiple Unreal Editor instances on different machines to connect to a shared session and collaborate on level design, asset placement, and Sequencer work in real time. Built on the internal **Concert** plugin architecture, it uses a lightweight transaction server that records changes — no full project copy needed on the host.

## Architecture

```
┌──────────┐   ┌──────────┐   ┌──────────┐
│ Editor A │   │ Editor B │   │ Editor C │
│ (Client) │   │ (Client) │   │ (Client) │
└────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │
     └──────────┬───┘──────────────┘
                │
       ┌────────▼────────┐
       │  Concert Server  │
       │ (Transactions +  │
       │  Asset Changes)  │
       └──────────────────┘
```

### Client-Server Model

- **Server:** A lightweight process (`UnrealMultiUserServer`) that hosts one or more named sessions. It stores only the transaction log and modified assets — it does not need a copy of the project.
- **Clients:** Full Unreal Editor instances with the project loaded. Each client connects to a session and receives/sends change transactions.
- **Sessions:** Isolated workspaces on the server. Multiple sessions can run simultaneously for different teams or work streams.

## Enabling the Plugin

1. Open your project in Unreal Editor.
2. Go to **Edit → Plugins**.
3. Search for **"Multi-User Editing"**.
4. Enable the plugin and restart the editor.

The Multi-User toolbar button appears in the editor toolbar after restart.

## Starting a Session

### From the Editor UI

1. Click the **Multi-User** button in the toolbar.
2. Select **Launch Multi-User Server** (starts the server on your machine).
3. Click **Create Session**, give it a name.
4. Other team members click **Join Session** and select the session from the discovered list.

### From the Command Line (Headless Server)

```bash
# Launch the server without a full editor
Engine/Binaries/<Platform>/UnrealMultiUserServer \
    -CONCERTSERVER=MyServer \
    -CONCERTSESSION=TeamSession \
    -messaging
```

This is useful for dedicated collaboration servers running on a studio LAN or cloud VM.

## What Synchronizes in Real Time

### Immediate Sync (Transaction-Based)

| Category | Examples |
|----------|---------|
| Actor transforms | Position, rotation, scale changes in the viewport |
| Actor properties | Component values, material assignments |
| Level changes | Adding/removing actors, sublevel loading |
| Sequencer | Track changes, keyframe edits, clip adjustments |
| World settings | Lighting, fog, post-process volume properties |
| User presence | Avatars showing each user's viewport position and cursor |

### Deferred Sync (Requires Manual Persist)

These asset types are **not** automatically synchronized to other clients:

- Material and Material Instance assets
- Static Mesh / Skeletal Mesh assets (the actual mesh data)
- Blueprint class definitions
- Data Tables and Curve Tables
- Texture assets

Changes to these assets are local until the user **persists** the session (saves the transaction log to the project) and other users pull from source control.

## Network Configuration

### Default Settings

| Setting | Default | Location |
|---------|---------|----------|
| Server Port | 6666 | Edit → Project Settings → Multi-User Editing |
| Discovery Port | Auto | UDP broadcast on LAN |

### Custom Configuration (DefaultEngine.ini)

```ini
[/Script/ConcertSyncClient.ConcertClientSettings]
DefaultServerURL=192.168.1.100
ServerPort=6666
bAutoConnect=false
DisplayName=ArtistWorkstation01
```

### Remote / WAN Setup

For teams not on the same LAN:

1. Run `UnrealMultiUserServer` on a cloud VM or studio server with a static IP.
2. Set `DefaultServerURL` to the server's IP in each client's config.
3. Ensure the server port (default 6666) and UDP discovery port are open.
4. Consider a VPN for security — Concert does not encrypt traffic by default.

## Collaboration Best Practices

### Divide the World

Use **World Partition** (see [G12](G12_world_partition_streaming.md)) and **Data Layers** (see [G48](G48_data_layers_level_instancing.md)) to assign spatial regions or feature layers to different team members. This reduces conflicts:

- Artist A works on the village region.
- Artist B works on the forest region.
- Designer C works on gameplay actors in a separate Data Layer.

### Use Presence Awareness

Each connected user appears as a colored avatar in the viewport. Laser indicators show what objects their cursor is highlighting. Use this to avoid editing the same actor simultaneously — while Concert handles conflict resolution, spatial awareness prevents confusion.

### Session Management

- **Persist frequently:** Click **Persist Session** to write accumulated changes to the project on disk. This is the bridge between the live session and source control.
- **Snapshot before risky changes:** Create a session snapshot before large-scale edits. You can restore the session to a snapshot if something goes wrong.
- **Name sessions descriptively:** Use names like `LevelBlockout-Sprint12` to avoid confusion when multiple sessions are active.

## Conflict Resolution

When two users modify the same property on the same actor simultaneously, Concert uses **last-write-wins** semantics — the most recent transaction takes precedence. The system does not merge property changes.

To minimize conflicts:
1. Communicate with your team (voice chat, Slack) about who is editing what.
2. Use Data Layers to isolate work areas.
3. Avoid editing the same actor's properties at the same time.

## Sequencer Integration

Multi-User Editing has first-class Sequencer support:

- Track additions, keyframe changes, and clip edits sync in real time.
- Multiple users can work on different tracks of the same Sequence simultaneously.
- Camera cuts and playback position are per-user (you don't see someone else's playback scrubbing).

This makes Concert particularly valuable for **virtual production** workflows where multiple operators collaborate on a scene in real time.

## Limitations (as of UE 5.7)

1. **No asset-level merging:** Blueprint, Material, and Mesh changes are not transaction-synced. These still flow through source control.
2. **No built-in encryption:** Use a VPN for WAN deployments.
3. **Server resource usage:** Very large sessions (50+ hours of transactions) can consume significant memory on the server. Persist and restart sessions periodically.
4. **Platform support:** Multi-User Editing is editor-only. It has no runtime / packaged game component.
5. **Performance with large actor counts:** Syncing levels with 100K+ actors may introduce transaction latency. Use World Partition to limit loaded regions.

## Console Commands

| Command | Description |
|---------|-------------|
| `Concert.EnableOpenRemoteSequencer` | Allow remote Sequencer control |
| `Concert.DefaultSessionName <name>` | Set default session name |
| `Concert.AutoConnect 1` | Auto-connect to discovered server on editor start |

## Typical Workflow

1. **Morning:** Team lead starts `UnrealMultiUserServer` on the studio server, creates a session.
2. **Work:** Team members join the session. Each works in their assigned region or Data Layer. Presence avatars show who is where.
3. **Midday checkpoint:** Team lead persists the session. Changes are written to the local project.
4. **Source control:** Team lead commits the persisted changes to Perforce/Git. Others sync.
5. **End of day:** Session is persisted and archived. Server can be stopped.

## Further Reading

- Epic Documentation: [Multi-User Editing Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/multi-user-editing-overview-for-unreal-engine)
- Epic Documentation: [Getting Started with Multi-User Editing](https://dev.epicgames.com/documentation/en-us/unreal-engine/getting-started-with-multi-user-editing-in-unreal-engine)
- Epic Documentation: [Multi-User Editing Reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/multi-user-editing-reference-for-unreal-engine)
