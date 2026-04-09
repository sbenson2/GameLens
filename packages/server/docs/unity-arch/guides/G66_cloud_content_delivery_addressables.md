# G66 — Cloud Content Delivery (CCD) with Addressables

> **Category:** guide · **Engine:** Unity 6 (6000.x, Addressables 2.x) · **Related:** [G9 Addressables & Asset Management](G9_addressables_asset_management.md) · [G36 LiveOps: Remote Config & Cloud Save](G36_liveops_remote_config_cloud_save.md) · [G54 Build Automation & CI/CD](G54_build_automation_cicd.md) · [Unity Rules](../unity-arch-rules.md)

Unity's **Cloud Content Delivery (CCD)** is a managed CDN service that hosts and delivers asset bundles to players without requiring app store updates. Combined with the **Addressables** system, it enables live content updates — new levels, seasonal events, balance patches, and DLC — served from Unity's global edge network. This guide covers the end-to-end pipeline from Addressables configuration through CCD deployment and runtime catalog management.

---

## Why CCD + Addressables?

| Without CCD | With CCD |
|-------------|----------|
| Content changes require new app build + store review | Upload bundles to CCD, players get them on next launch |
| All assets baked into install size | Remote assets download on demand, reducing initial install |
| No staged rollouts | Environments + badges enable dev → staging → production flow |
| Custom CDN infrastructure needed | Managed global CDN with 50GB free bandwidth/month |

> **When NOT to use CCD:** If your game is fully offline, has no post-launch content, or has tiny asset footprints, the complexity isn't justified. Use local Addressables groups instead.

---

## Architecture Overview

```
┌────────────────┐     Build &     ┌─────────────────────────────────┐
│ Unity Editor   │     Release     │ Cloud Content Delivery (CCD)    │
│                │────────────────▶│                                 │
│ Addressable    │                 │  Environment: production        │
│ Groups:        │                 │  ├── Bucket: ios-bundles        │
│ ├── Local      │                 │  │   ├── Badge: latest ──┐     │
│ │  (in build)  │                 │  │   ├── Badge: v1.2   ──┤     │
│ └── Remote     │                 │  │   └── Releases ───────┘     │
│    (to CCD)    │                 │  │       ├── rel_abc123         │
│                │                 │  │       └── rel_def456         │
│ Profile:       │                 │  └── Bucket: android-bundles    │
│  Remote.Load = │                 │      └── Badge: latest          │
│  CCD URL       │                 └─────────────┬───────────────────┘
└────────────────┘                               │
                                                 │ CDN edge
                                                 ▼
                                    ┌─────────────────────────┐
                                    │ Player Device           │
                                    │                         │
                                    │ 1. Check remote catalog │
                                    │ 2. Download changed     │
                                    │    bundles              │
                                    │ 3. Cache locally        │
                                    └─────────────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Environment** | Organizational namespace (e.g., `development`, `staging`, `production`) |
| **Bucket** | Storage container within an environment — typically one per platform |
| **Release** | An immutable snapshot of uploaded content at a point in time |
| **Badge** | A named pointer to a release (e.g., `latest`). Updating a badge re-points it to a new release without changing URLs |

---

## Setup

### Prerequisites

```
Required packages (via Package Manager):
├── com.unity.addressables           (2.5.x+)
├── com.unity.services.ccd.management (optional, for Build & Release)
└── Unity Gaming Services project linked (Edit → Project Settings → Services)
```

### Step 1: Configure Addressable Groups

```
Addressables Groups window (Window → Asset Management → Addressables → Groups):

├── Built-In Data              ← Scenes, Resources (always local)
├── Local - Static Assets      ← Core gameplay (included in build)
│   Build & Load Path: Local
│
├── Remote - Seasonal Content  ← Holiday events, limited-time levels
│   Build & Load Path: Remote (CCD)
│
└── Remote - DLC Chapter 2     ← Post-launch content
    Build & Load Path: Remote (CCD)
```

### Step 2: Configure Profile for CCD

Open **Window → Asset Management → Addressables → Profiles** and set the Remote load path:

```
Profile: Production
├── Local.BuildPath:  [UnityEngine.AddressableAssets.Addressables.BuildPath]/[BuildTarget]
├── Local.LoadPath:   {UnityEngine.AddressableAssets.Addressables.RuntimePath}/[BuildTarget]
├── Remote.BuildPath: ServerData/[BuildTarget]
└── Remote.LoadPath:  Cloud Content Delivery Bundle Location
                      ├── Environment: production
                      ├── Bucket: (auto-detected or manual ID)
                      └── Badge: latest
```

The CCD URL follows this pattern:

```
https://{ProjectID}.client-api.unity3dusercontent.com/client_api/v1/
  environments/{EnvironmentName}/buckets/{BucketID}/
  release_by_badge/{BadgeName}/entry_by_path/content/?path=
```

> **Important:** You must perform a full Addressables rebuild when you change the remote load path.

### Step 3: Build & Release

**Option A — CCD Management Package (recommended)**

With `com.unity.services.ccd.management` installed:

1. Open Addressables Groups window
2. Select **Build → Build & Release**
3. The package automatically:
   - Builds asset bundles (catalog `.json`, `.hash`, `.bundle` files)
   - Uploads all remote group bundles to the configured bucket
   - Creates a new release
   - Updates the badge pointer

**Option B — Manual Upload via CLI**

```bash
# WHY CLI: CI/CD pipelines can't use the Editor UI. The UGS CLI
# integrates with build servers for automated deployment.

# Install UGS CLI
npm install -g ugs-cli

# Authenticate
ugs login

# Upload bundles to a bucket
ugs ccd buckets entries upload \
  --bucket-id <BUCKET_ID> \
  --environment <ENV_NAME> \
  --directory ServerData/Android/

# Create a release from current bucket contents
ugs ccd releases create \
  --bucket-id <BUCKET_ID> \
  --environment <ENV_NAME>

# Update badge to point to the new release
ugs ccd badges update \
  --bucket-id <BUCKET_ID> \
  --environment <ENV_NAME> \
  --badge-name latest \
  --release-id <RELEASE_ID>
```

---

## Runtime: Catalog Updates & Downloads

### Checking for Updates

```csharp
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using System.Collections.Generic;

public class ContentUpdateManager : MonoBehaviour
{
    // WHY check catalogs on startup: The remote catalog is a small JSON file
    // that lists all available bundles and their hashes. If the catalog changed,
    // new or updated bundles are available for download.

    public async void CheckForContentUpdates()
    {
        // Step 1: Check if remote catalogs have changed
        AsyncOperationHandle<List<string>> checkHandle =
            Addressables.CheckForCatalogUpdates(autoReleaseHandle: false);

        await checkHandle.Task;

        if (checkHandle.Status == AsyncOperationStatus.Succeeded
            && checkHandle.Result.Count > 0)
        {
            // Step 2: Download updated catalogs
            // WHY UpdateCatalogs: This fetches the new catalog JSON and
            // updates the internal resource locator. Subsequent Load calls
            // will reference the new bundle URLs/hashes.
            AsyncOperationHandle<List<UnityEngine.AddressableAssets
                .ResourceLocators.IResourceLocator>> updateHandle =
                Addressables.UpdateCatalogs(checkHandle.Result,
                    autoReleaseHandle: false);

            await updateHandle.Task;

            Addressables.Release(updateHandle);
        }

        Addressables.Release(checkHandle);
    }
}
```

### Download Size Estimation

```csharp
public async void ShowDownloadSize(string label)
{
    // WHY GetDownloadSizeAsync: Shows the player how much they need to
    // download BEFORE starting. Essential for mobile data awareness.
    // Returns 0 if bundles are already cached locally.

    AsyncOperationHandle<long> sizeHandle =
        Addressables.GetDownloadSizeAsync(label);

    await sizeHandle.Task;

    long bytes = sizeHandle.Result;
    if (bytes > 0)
    {
        float mb = bytes / (1024f * 1024f);
        Debug.Log($"Download required: {mb:F1} MB");
        // Show UI prompt: "New content available (X MB). Download now?"
    }
    else
    {
        Debug.Log("Content is up to date.");
    }

    Addressables.Release(sizeHandle);
}
```

### Downloading with Progress

```csharp
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

public class ContentDownloader : MonoBehaviour
{
    [SerializeField] private string _downloadLabel = "seasonal_event";

    public async void DownloadContent(System.Action<float> onProgress)
    {
        // WHY DownloadDependenciesAsync with a label: Downloads all bundles
        // tagged with this label. The Addressables cache ensures only changed
        // bundles are re-downloaded on subsequent calls.

        AsyncOperationHandle downloadHandle =
            Addressables.DownloadDependenciesAsync(_downloadLabel,
                autoReleaseHandle: false);

        while (!downloadHandle.IsDone)
        {
            // WHY GetDownloadStatus: PercentComplete on the handle itself
            // reports overall progress including already-cached files.
            // GetDownloadStatus gives download-only progress.
            DownloadStatus status = downloadHandle.GetDownloadStatus();
            float progress = status.TotalBytes > 0
                ? (float)status.DownloadedBytes / status.TotalBytes
                : 0f;

            onProgress?.Invoke(progress);
            await System.Threading.Tasks.Task.Yield();
        }

        if (downloadHandle.Status == AsyncOperationStatus.Failed)
        {
            Debug.LogError($"Download failed: {downloadHandle.OperationException}");
        }

        Addressables.Release(downloadHandle);
    }
}
```

### Runtime Environment Switching (CcdManager)

```csharp
using Unity.Services.Ccd.Management;

public class CcdEnvironmentSwitcher
{
    // WHY CcdManager: Allows switching CCD environments at runtime.
    // Useful for QA testing against staging content or A/B testing
    // different content sets.

    public static void SetEnvironment(string envName, string bucketId,
        string badge = "latest")
    {
        // IMPORTANT: Set these BEFORE any Addressables.LoadAssetAsync calls.
        // If the profile uses "Automatic" CCD path, CcdManager values are
        // injected into the URL template at load time.
        CcdManager.EnvironmentName = envName;
        CcdManager.BucketId = bucketId;
        CcdManager.Badge = badge;
    }
}
```

---

## Content Organization Strategy

### Bucket-per-Platform

```
Environment: production
├── Bucket: ios-content
│   └── Badge: latest → release_abc123
├── Bucket: android-content
│   └── Badge: latest → release_def456
└── Bucket: desktop-content
    └── Badge: latest → release_ghi789
```

### Multi-Environment Pipeline

```
┌──────────────┐    promote     ┌──────────────┐    promote     ┌──────────────┐
│ development  │───────────────▶│   staging     │───────────────▶│  production  │
│              │                │              │                │              │
│ Auto-deploy  │                │ QA testing   │                │ Live players │
│ from CI      │                │ Load testing │                │              │
└──────────────┘                └──────────────┘                └──────────────┘
```

```bash
# WHY environment promotion: Same bundles, different environments.
# Avoids rebuilding — you promote a tested release to the next stage.

# Upload to development (CI does this automatically)
ugs ccd badges update --environment development --badge-name latest \
  --release-id $NEW_RELEASE_ID --bucket-id $BUCKET_ID

# QA passes → promote to staging
ugs ccd badges update --environment staging --badge-name latest \
  --release-id $TESTED_RELEASE_ID --bucket-id $BUCKET_ID

# Final approval → promote to production
ugs ccd badges update --environment production --badge-name latest \
  --release-id $APPROVED_RELEASE_ID --bucket-id $BUCKET_ID
```

---

## Best Practices

### Bundle Sizing

| Group Type | Recommended Size | Rationale |
|-----------|-----------------|-----------|
| Core gameplay | 1–5 MB per bundle | Small enough for quick updates |
| Level content | 5–20 MB per bundle | One bundle per level or zone |
| Large assets (cutscenes, VO) | 20–50 MB per bundle | Stream or download on demand |
| Shared materials/shaders | 1–3 MB (shared dependency) | Avoid duplicating across bundles |

### Caching

```csharp
// WHY clear cache selectively: Addressables caches bundles by hash.
// Updated bundles get new hashes, so old versions accumulate.
// Clear stale cache periodically to reclaim disk space.

public void ClearOldCache()
{
    // Clears all cached bundles not referenced by current catalogs
    Caching.ClearCache();
}

// For finer control:
public void ClearSpecificBundle(string bundleName)
{
    // WHY per-bundle clearing: When a player reports a corrupted download,
    // clear just that bundle and re-download instead of wiping everything.
    Caching.ClearAllCachedVersions(bundleName);
}
```

### Error Handling

```csharp
// WHY retry with exponential backoff: Mobile networks are unreliable.
// A single failed download shouldn't block the player permanently.

public async System.Threading.Tasks.Task<bool> DownloadWithRetry(
    string label, int maxRetries = 3)
{
    for (int attempt = 0; attempt < maxRetries; attempt++)
    {
        var handle = Addressables.DownloadDependenciesAsync(label);
        await handle.Task;

        if (handle.Status == AsyncOperationStatus.Succeeded)
        {
            Addressables.Release(handle);
            return true;
        }

        Addressables.Release(handle);

        // Exponential backoff: 1s, 2s, 4s
        float delay = Mathf.Pow(2, attempt);
        await System.Threading.Tasks.Task.Delay(
            (int)(delay * 1000));
    }

    return false;
}
```

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| "Remote catalog not found" on first build | Ensure Build Remote Catalog is enabled in Addressable Asset Settings |
| Bundles not updating for players | Verify the badge was updated to the new release; check catalog hash |
| Massive initial download | Split content into labeled groups; only download what's needed |
| Cache growing unbounded on device | Call `Caching.ClearCache()` periodically or on version change |
| Profile mismatch between Editor and build | Use Build Profiles to lock the correct Addressables profile per target |
| CcdManager values set too late | Set `CcdManager.EnvironmentName` before ANY Addressables call |

---

## Pricing (as of 2025)

| Tier | Bandwidth | Storage | Cost |
|------|-----------|---------|------|
| Free | 50 GB/month | 10 GB | $0 |
| Pro | 500 GB/month | 100 GB | Included with Unity Pro |
| Enterprise | Custom | Custom | Contact Unity |

> **Note:** Bandwidth is measured at the CDN edge, not per-player. A 50 MB update served to 1,000 players = 50 GB of bandwidth.
