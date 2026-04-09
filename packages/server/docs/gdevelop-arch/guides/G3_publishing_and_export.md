# G3 — Publishing & Export Pipeline

> **Category:** guide · **Engine:** GDevelop · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Events and Behaviors](G1_events_and_behaviors.md) · [G2 Custom Functions & Extensions](G2_custom_functions_and_extensions.md)

---

## Export Overview

GDevelop games are built on web technologies (HTML5/JavaScript), which means they can run almost anywhere. The engine provides both **one-click cloud builds** and **manual export** paths for every target platform.

### Supported Platforms

| Platform | One-Click Build | Manual Export | Distribution Channels |
|----------|:--------------:|:-------------:|----------------------|
| **Web (HTML5)** | ✅ → gd.games | ✅ → folder | itch.io, Newgrounds, Poki, CrazyGames, Kongregate |
| **Android** | ✅ → APK/AAB | ✅ → Cordova project | Google Play Store, Amazon App Store |
| **iOS** | ✅ (via cloud) | ✅ → Cordova project | Apple App Store |
| **Windows** | ✅ → EXE | ✅ → Electron project | Steam, itch.io, direct download |
| **macOS** | ✅ → APP | ✅ → Electron project | Steam, itch.io, Mac App Store |
| **Linux** | ✅ → AppImage | ✅ → Electron project | Steam, itch.io |

> **Note:** One-click builds use GDevelop's cloud service. Free accounts get limited builds per day. Paid plans (Silver, Gold, Pro) increase the build quota and unlock faster build priority.

---

## One-Click Export (Recommended for Most Users)

The fastest path from editor to published game. GDevelop compiles your project in the cloud and gives you a downloadable package or a live URL.

### How to Export

1. Open your project in the GDevelop editor
2. Click **File → Export** (or the Share button)
3. Choose your target under **"Publish your game"**:
   - **Web (gd.games)** — instant URL, hosted by GDevelop
   - **Android** — generates an APK or AAB file
   - **iOS** — generates an IPA file (requires Apple Developer account to distribute)
   - **Desktop** — generates a standalone Windows, macOS, or Linux executable
4. Click **Export** and wait for the cloud build
5. Download the result or copy the live URL

### Web Export to gd.games

GDevelop's built-in hosting platform provides:

- **Permanent URL** for your game (e.g., `gd.games/your-username/your-game`)
- **Creator profile page** listing all your published games
- **Analytics** — play counts, session data
- **Instant updates** — re-export to push changes to the same URL

> This is the fastest way to share a playable build for playtesting or portfolio purposes. No hosting setup required.

---

## Manual Export (For Advanced Control)

Manual export gives you the raw project files so you can build, customize, and sign them yourself.

### Web (HTML5 Folder)

Exports your game as a folder of HTML, JS, and asset files ready to upload anywhere:

1. **File → Export → Build manually → Web**
2. Choose an output folder
3. Upload the contents to any web server, or zip and upload to itch.io

The output folder structure:

```
export/
├── index.html        ← entry point
├── data.js           ← game data and logic
├── gd.js             ← GDevelop runtime
├── pixi-renderers/   ← rendering engine
└── assets/           ← sprites, sounds, fonts
```

### Android / iOS (Cordova)

Manual mobile export produces a Cordova project you build with command-line tools:

1. **File → Export → Build manually → Mobile**
2. GDevelop generates a Cordova project folder
3. Build it with:
   ```bash
   # Install Cordova globally (one-time setup)
   npm install -g cordova

   # Navigate to the exported project
   cd my-game-cordova/

   # Add the Android platform
   cordova platform add android

   # Build the APK
   cordova build android
   # Output: platforms/android/app/build/outputs/apk/debug/app-debug.apk
   ```

**Requirements for Android:**
- Java JDK 11+
- Android SDK (via Android Studio)
- Gradle

**Requirements for iOS:**
- macOS with Xcode installed
- Apple Developer account (for device testing and App Store)
- `cordova platform add ios` then open in Xcode to build

### Desktop (Electron)

Manual desktop export produces an Electron project:

1. **File → Export → Build manually → Desktop**
2. GDevelop generates an Electron project folder
3. Build with:
   ```bash
   cd my-game-electron/
   npm install
   npm run build       # or: npx electron-builder
   ```

---

## Platform-Specific Optimization

### Web Performance

| Setting | Where | Recommendation |
|---------|-------|---------------|
| **Image compression** | Project Properties → Resources | Enable lossy compression for large sprite sheets |
| **Asset preloading** | Scene properties → Resources tab | Preload assets used in the first scene; lazy-load the rest |
| **Minimize draw calls** | Object layering | Group static objects on the same layer; minimize layer count |

### Mobile Optimization

| Concern | Solution |
|---------|---------|
| **APK/AAB size** | Compress audio to OGG/MP3 (not WAV). Use texture atlases. Target AAB for Play Store (smaller downloads via split APKs) |
| **Touch controls** | Use GDevelop's built-in Multitouch or Joystick behaviors. Test on real devices — emulator touch ≠ real touch |
| **Screen sizes** | Set the game resolution in Project Properties and enable **"Update resolution to fill screen"** for automatic scaling |
| **Battery/CPU** | Cap frame rate at 30 or 60 FPS. Avoid particle systems with 500+ particles on mobile |

### Desktop Optimization

| Concern | Solution |
|---------|---------|
| **Executable size** | Electron bundles Chromium (~150 MB). For smaller builds, use the one-click desktop export which is pre-optimized |
| **Fullscreen** | Use the **Fullscreen action** in events. Support Escape to exit fullscreen |
| **Saving data** | Use the **Storage** actions/conditions to persist player data (saves to local filesystem on desktop) |

---

## Monetization Pathways

### Mobile Ads (AdMob)

GDevelop supports Google AdMob integration for interstitial and rewarded video ads:

1. Install the **AdMob extension** from the GDevelop extension store
2. Configure your AdMob app ID and ad unit IDs in the extension properties
3. Use event actions: **"Load interstitial ad"**, **"Show interstitial ad"**, **"Load rewarded video"**
4. Handle the **"Rewarded video reward received"** condition to grant in-game rewards

### Web Game Platforms

Several platforms offer revenue sharing for web games:

| Platform | Revenue Model | Integration |
|----------|--------------|-------------|
| **Poki** | Ad revenue share | Requires Poki SDK integration (extension available) |
| **CrazyGames** | Ad revenue share | CrazyGames SDK extension |
| **Wortal** | Cross-platform ad distribution | Wortal SDK — "build once, launch everywhere" across web, iOS, Android |
| **Newgrounds** | Ad revenue share + fan support | Upload HTML5 build directly |

### Paid Distribution

| Platform | Model | Notes |
|----------|-------|-------|
| **Steam** | Paid download / free-to-play | Requires Steamworks setup. Export as desktop build. $100 app fee per title |
| **itch.io** | Name-your-price / paid / free | Upload web or desktop builds. 0% default platform cut (optional tip) |
| **Google Play** | Paid / free + IAP | One-click Android export. $25 one-time developer fee |
| **Apple App Store** | Paid / free + IAP | Requires Apple Developer account ($99/year) |

---

## Export Checklist

Before publishing, verify these items:

1. **Test on target platform** — Web games should be tested in multiple browsers (Chrome, Firefox, Safari). Mobile builds should be tested on real devices
2. **Set game properties** — Title, author, version number in Project Properties
3. **Configure icons** — Set app icons for each target platform in Project Properties → Icons
4. **Optimize assets** — Compress images and audio. Remove unused resources
5. **Check loading screen** — Customize or brand the loading screen (Project Properties → Loading Screen)
6. **Handle edge cases** — Test window resize, tab switching (web), app backgrounding (mobile), and loss of focus

---

## Related Resources

- [E1 Architecture Overview](../architecture/E1_architecture_overview.md) — GDevelop runtime and project structure
- [G1 Events and Behaviors](G1_events_and_behaviors.md) — Core event system
- [R1 Extensions & Custom Behaviors](../reference/R1_extensions_and_custom_behaviors.md) — Extensions for platform SDKs (AdMob, Poki, etc.)
