# Horde & UBA: Distributed Build System

> **Category:** guide · **Engine:** Unreal Engine · **Related:** [G60 Packaging & Deployment](G60_packaging_cooking_deployment.md), [G43 Source Control](G43_source_control_collaboration.md), [G21 Automated Testing](G21_automated_testing.md)

Horde is Epic's scalable, cloud-ready distributed build framework for Unreal Engine projects. Paired with the Unreal Build Accelerator (UBA), it distributes C++ compilation, shader compilation, and packaging tasks across a pool of machines — transforming multi-hour monolithic builds into parallelized pipelines. Available since UE 5.4 and production-hardened in UE 5.5+.

## Architecture Overview

Horde is a client-server system with three main components:

- **Horde Server** — A .NET service that orchestrates build jobs, manages agent pools, and serves as the central dashboard. It tracks job history, logs, and artifacts.
- **Horde Agent** — A lightweight process running on each build machine that picks up work from the server. Agents advertise their capabilities (platform, pool membership, available resources).
- **Unreal Build Accelerator (UBA)** — A virtualization layer that redirects compiler and tool invocations to remote machines. UBA intercepts calls to `cl.exe`, shader compilers, and other tools, serializing their file dependencies and executing them on available agents.

```
Developer Workstation          Horde Server           Agent Pool
┌─────────────────┐      ┌──────────────────┐    ┌────────────┐
│ UnrealBuildTool  │─────>│  Job Scheduler   │───>│  Agent 1   │
│ (UBA Executor)   │      │  Artifact Store  │    │  Agent 2   │
│                  │<─────│  Dashboard       │<───│  Agent N   │
└─────────────────┘      └──────────────────┘    └────────────┘
```

## Enabling UBA for Local Distributed Compilation

### Step 1: Enable the UBA Executor

Edit or create `BuildConfiguration.xml` in your engine or project config directory:

```xml
<?xml version="1.0" encoding="utf-8" ?>
<Configuration xmlns="https://www.unrealengine.com/BuildConfiguration">
  <BuildConfiguration>
    <bAllowUBAExecutor>true</bAllowUBAExecutor>
  </BuildConfiguration>
  <Horde>
    <Server>http://your-horde-server:13340</Server>
    <WindowsPool>Win-UE5</WindowsPool>
  </Horde>
  <UnrealBuildAccelerator>
    <bForceBuildAllRemote>false</bForceBuildAllRemote>
    <bLaunchVisualizer>true</bLaunchVisualizer>
  </UnrealBuildAccelerator>
</Configuration>
```

Key parameters:

| Parameter | Description |
|-----------|-------------|
| `bAllowUBAExecutor` | Enables UBA as a compilation executor in UnrealBuildTool |
| `Horde.Server` | URL of your Horde server instance |
| `Horde.WindowsPool` | Agent pool name to request machines from |
| `bForceBuildAllRemote` | When `false`, local machine also compiles (recommended) |
| `bLaunchVisualizer` | Opens the UBA visualizer UI showing task distribution |

### Step 2: Configure Engine.ini (UE 5.5+)

For engine-level UBA configuration, add to your `DefaultEngine.ini` or project-specific config:

```ini
[Horde]
Server=http://your-horde-server:13340
UbaPool=Win-UE5
UbaCluster=default
UbaEnabled=true
```

## BuildGraph Integration

BuildGraph is Unreal's XML-based build pipeline scripting system. To distribute compilation steps via UBA within a BuildGraph script:

```xml
<Include Script="Engine/Build/Graph/CommonProperties.xml" />

<Agent Name="Compile Win64" Type="Win-UE5">
  <Node Name="Compile Editor Win64">
    <Compile
      Target="MyGameEditor"
      Platform="Win64"
      Configuration="Development"
      Arguments="$(GenericCompileArguments)"
    />
  </Node>
</Agent>
```

The `$(GenericCompileArguments)` macro automatically passes UBA-related flags when the executor is enabled.

## Setting Up a Horde Server

### Building the Server Image

```bash
# From your engine root
.\Engine\Build\BatchFiles\RunUAT.bat BuildGraph \
  -Script="Engine/Source/Programs/Horde/BuildHorde-DashboardAgentAndBackend.xml" \
  -Target="HordeServer"
```

### Docker Deployment (UE 5.5+)

Horde ships with Docker support. The server requires:
- MongoDB or compatible document store for job metadata
- Redis for caching and pub/sub
- Shared storage (S3, Azure Blob, or NFS) for artifacts

### Agent Registration

Agents self-register when pointed at the server. Install the Horde Agent service on each build machine and configure it with the server URL. Agents automatically join the default pool and begin accepting work.

## What UBA Distributes

| Task Type | UBA Support | Notes |
|-----------|-------------|-------|
| C++ compilation | Full | Primary use case — distributes `cl.exe` invocations |
| Shader compilation | Partial | Supported in UE 5.5; known issues in 5.6 preview |
| Cooking/packaging | Via BuildGraph | Entire cook steps assigned to agents, not individual files |
| Automation tests | Via BuildGraph | Test steps can run on agent pool machines |

## Performance Expectations

- **Small project (50 modules):** 2-3x speedup with 5-10 agents
- **Large project (200+ modules):** 5-10x speedup with 20-50 agents
- **Engine from source:** Multi-hour builds reduced to 15-30 minutes with 100+ agents

Speedup depends on module independence — projects with many independent modules parallelize better.

## Troubleshooting

### Common Issues

1. **UBA not activating** — Verify `bAllowUBAExecutor` is `true` and the Horde server is reachable. Check the UBT log for `UBA executor` messages.
2. **Agents not picking up work** — Confirm agents are in the correct pool and their platform matches the requested pool name.
3. **Shader compilation failures on 5.6** — Known regression in UE 5.6 preview where shader distribution via UBA may fail. Check Epic's release notes for patches.
4. **Firewall issues** — UBA requires bidirectional network access between the initiator and agents on configurable ports (default: 13340 for Horde, dynamic ports for UBA).

### Visualizer

When `bLaunchVisualizer` is `true`, a real-time UI shows which tasks are running on which machines, completion percentages, and any failures. This is invaluable for diagnosing slow builds or unbalanced distribution.

## Best Practices

- **Start small:** Begin with 2-3 extra machines before scaling to a full farm.
- **Homogeneous agents:** Use identical OS, SDK, and compiler versions across all agents to avoid subtle compilation differences.
- **Pool separation:** Create separate pools for CI builds vs. developer iteration to avoid contention.
- **Monitor agent utilization:** The Horde dashboard shows per-agent CPU/memory usage — idle agents waste resources, overloaded agents slow builds.
- **Pin engine versions:** When building engine from source, ensure all agents have the same engine checkout to avoid header mismatches.

## Cloud Deployment

Horde supports auto-scaling agent pools on AWS, Azure, or GCP. Key considerations:

- Use spot/preemptible instances for cost savings (Horde handles agent disconnection gracefully)
- Pre-bake agent AMIs/images with the correct Visual Studio, Windows SDK, and Horde Agent installed
- Configure the Horde server's auto-scaling policy to spin up agents based on job queue depth

## Version Notes

| Version | Status |
|---------|--------|
| UE 5.4 | Horde/UBA introduced, experimental |
| UE 5.5 | Production-ready for C++ and shader distribution |
| UE 5.6 | Shader compilation regression reported; C++ distribution stable |
| UE 5.7 | Continued improvements to BuildGraph and agent management |
