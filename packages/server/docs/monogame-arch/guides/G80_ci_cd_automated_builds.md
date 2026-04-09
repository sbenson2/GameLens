# G80 — CI/CD & Automated Builds

> **Category:** guide · **Engine:** MonoGame · **Related:** [G32 Deployment & Platform Builds](./G32_deployment_platform_builds.md) · [G44 Version Control](./G44_version_control.md) · [G73 Cross-Platform Deployment](./G73_cross_platform_deployment.md) · [G79 Content Builder Project](./G79_content_builder_project.md)

How to set up continuous integration and delivery pipelines for MonoGame games. Covers GitHub Actions, GitLab CI, and Azure Pipelines configurations for building, testing, and packaging MonoGame projects across Windows, Linux, and macOS. Includes content pipeline compilation in headless environments, NuGet caching, artifact management, and automated release workflows.

---

## Why CI/CD for Game Projects?

Game projects without automated builds accumulate "works on my machine" problems: content pipeline mismatches, missing NuGet packages, platform-specific regressions, and broken builds that only surface when someone tries to build a release. A CI pipeline catches these on every commit.

For MonoGame specifically, automated builds are valuable because:

- The **content pipeline** (MGCB or Content Builder) can fail silently with missing importers or processors that only manifest on clean builds
- **Cross-platform targets** (DesktopGL, WindowsDX, Android, iOS) have different build requirements and failure modes
- **NativeAOT publishing** is sensitive to trimming issues that only appear in release builds
- **.NET version mismatches** between team members cause subtle bugs

## GitHub Actions: Complete Pipeline

### Basic Build + Test

```yaml
# .github/workflows/build.yml
name: Build & Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  DOTNET_VERSION: '9.0.x'
  DOTNET_NOLOGO: true
  DOTNET_CLI_TELEMETRY_OPTOUT: true

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: ${{ env.DOTNET_VERSION }}

      # Cache NuGet packages across runs
      - name: Cache NuGet
        uses: actions/cache@v4
        with:
          path: ~/.nuget/packages
          key: ${{ runner.os }}-nuget-${{ hashFiles('**/*.csproj') }}
          restore-keys: ${{ runner.os }}-nuget-

      - name: Restore
        run: dotnet restore

      - name: Build
        run: dotnet build --configuration Release --no-restore

      - name: Test
        run: dotnet test --configuration Release --no-build --verbosity normal
```

### Content Pipeline in CI

MonoGame's content pipeline requires specific handling in headless CI environments. The MGCB tool needs to be restored as a local .NET tool:

```yaml
      # For MonoGame 3.8.2-3.8.4 (MGCB as dotnet tool)
      - name: Restore .NET tools
        run: dotnet tool restore

      - name: Build content
        run: dotnet mgcb Content/Content.mgcb /platform:DesktopGL
```

For MonoGame 3.8.5+ with the new Content Builder Project system, content builds automatically during `dotnet build` — no separate step needed. The Content Builder Project (`.mgcbproj`) is integrated into MSBuild:

```yaml
      # For MonoGame 3.8.5+ (Content Builder Project)
      # Content builds automatically — just run dotnet build
      - name: Build (includes content)
        run: dotnet build --configuration Release
```

### OpenGL/Vulkan on Headless Linux

MonoGame's DesktopGL and DesktopVK targets need a display server or virtual framebuffer for content compilation that involves shader processing:

```yaml
      # Linux only: install virtual display for content pipeline
      - name: Setup virtual display
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y xvfb libgl1-mesa-dev
          echo "DISPLAY=:99" >> $GITHUB_ENV

      - name: Start Xvfb
        if: runner.os == 'Linux'
        run: Xvfb :99 -screen 0 1024x768x24 &
```

## GitLab CI: Complete Pipeline

```yaml
# .gitlab-ci.yml
image: mcr.microsoft.com/dotnet/sdk:9.0

variables:
  DOTNET_NOLOGO: "true"
  DOTNET_CLI_TELEMETRY_OPTOUT: "true"

stages:
  - build
  - test
  - package

cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - .nuget/packages/

before_script:
  - dotnet restore --packages .nuget/packages/

build:
  stage: build
  script:
    - dotnet build --configuration Release --no-restore
  artifacts:
    paths:
      - "**/bin/Release/"
    expire_in: 1 hour

test:
  stage: test
  needs: [build]
  script:
    - dotnet test --configuration Release --no-build --logger "junit"
  artifacts:
    when: always
    reports:
      junit: "**/TestResults/*.xml"

package-linux:
  stage: package
  needs: [test]
  script:
    - dotnet publish MyGame.DesktopGL -c Release -r linux-x64 --self-contained
  artifacts:
    paths:
      - MyGame.DesktopGL/bin/Release/net9.0/linux-x64/publish/
    expire_in: 1 week
  only:
    - tags

package-windows:
  stage: package
  needs: [test]
  script:
    - dotnet publish MyGame.WindowsDX -c Release -r win-x64 --self-contained
  artifacts:
    paths:
      - MyGame.WindowsDX/bin/Release/net9.0/win-x64/publish/
    expire_in: 1 week
  only:
    - tags
```

## Platform-Specific Build Configurations

### Multi-Platform Project Structure

A typical MonoGame game targeting multiple platforms has this solution structure:

```
MyGame.sln
├── MyGame.Shared/          # Shared game code (class library)
├── MyGame.DesktopGL/       # Linux + macOS target
├── MyGame.WindowsDX/       # Windows DirectX target
├── MyGame.Android/         # Android target
└── MyGame.Tests/           # Unit + integration tests
```

### Build Matrix for All Platforms

```yaml
jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - project: MyGame.DesktopGL
            os: ubuntu-latest
            rid: linux-x64
          - project: MyGame.DesktopGL
            os: macos-latest
            rid: osx-arm64
          - project: MyGame.WindowsDX
            os: windows-latest
            rid: win-x64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '9.0.x'
      - run: dotnet publish ${{ matrix.project }} -c Release -r ${{ matrix.rid }} --self-contained
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.project }}-${{ matrix.rid }}
          path: ${{ matrix.project }}/bin/Release/net9.0/${{ matrix.rid }}/publish/
```

## NativeAOT Builds in CI

NativeAOT publishing requires platform-native toolchains. The CI runner must have the C/C++ compiler for the target platform:

```yaml
  build-aot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '9.0.x'

      # NativeAOT requires clang on Linux
      - name: Install AOT dependencies
        run: sudo apt-get install -y clang zlib1g-dev

      - name: Publish with NativeAOT
        run: |
          dotnet publish MyGame.DesktopGL \
            -c Release \
            -r linux-x64 \
            /p:PublishAot=true \
            /p:StripSymbols=true

      - name: Verify binary
        run: |
          file MyGame.DesktopGL/bin/Release/net9.0/linux-x64/publish/MyGame
          # Should output: ELF 64-bit LSB executable (not a .NET assembly)
```

### NativeAOT Trimming Issues

NativeAOT trims unused code aggressively. Content pipeline readers use reflection and may be trimmed. Add a `rd.xml` file to preserve them:

```xml
<!-- rd.xml — Runtime Directives for NativeAOT -->
<Directives>
  <Application>
    <Assembly Name="MonoGame.Framework">
      <Type Name="Microsoft.Xna.Framework.Content.*" Dynamic="Required All" />
    </Assembly>
    <Assembly Name="MyGame">
      <Type Name="MyGame.Content.*" Dynamic="Required All" />
    </Assembly>
  </Application>
</Directives>
```

Reference in your `.csproj`:

```xml
<ItemGroup>
  <RdXmlFile Include="rd.xml" />
</ItemGroup>
```

## Automated Release Workflow

Create releases automatically when you push a version tag:

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  build:
    # ... (same build matrix as above)

  release:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4

      - name: Create archives
        run: |
          cd MyGame.DesktopGL-linux-x64 && zip -r ../MyGame-linux-x64.zip . && cd ..
          cd MyGame.DesktopGL-osx-arm64 && zip -r ../MyGame-macos-arm64.zip . && cd ..
          cd MyGame.WindowsDX-win-x64 && zip -r ../MyGame-windows-x64.zip . && cd ..

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            MyGame-linux-x64.zip
            MyGame-macos-arm64.zip
            MyGame-windows-x64.zip
          generate_release_notes: true
```

## Content Pipeline Caching

Content compilation is often the slowest part of the build. Cache compiled content to speed up CI runs:

```yaml
      # Cache compiled content (intermediate .xnb files)
      - name: Cache content
        uses: actions/cache@v4
        with:
          path: |
            Content/bin/
            Content/obj/
          key: content-${{ hashFiles('Content/**/*', '!Content/bin/**', '!Content/obj/**') }}
```

This caches the compiled `.xnb` output and only rebuilds when source assets change. For large games with hundreds of textures and audio files, this can cut build times from minutes to seconds.

## Common CI Pitfalls

### 1. Missing MGCB Tool Version

If your `.config/dotnet-tools.json` pins a different MGCB version than your MonoGame NuGet packages, content compilation fails with cryptic errors.

**Fix:** Keep versions in sync:
```json
{
  "tools": {
    "dotnet-mgcb": {
      "version": "3.8.4.1",
      "commands": ["mgcb"]
    }
  }
}
```

### 2. Font Compilation on Linux

SpriteFont compilation requires font files. System fonts differ between CI runners and developer machines.

**Fix:** Include `.ttf` files in your repository and reference them by path in `.spritefont` files rather than by system font name.

### 3. Effect/Shader Compilation

MonoGame's MGFX shader compiler has platform-specific requirements. DesktopGL shaders compile on any OS, but WindowsDX shaders require the DirectX SDK (Windows only).

**Fix:** Build WindowsDX targets only on Windows runners. Use the build matrix to assign platform-appropriate runners.

### 4. Large Binary Assets

Game assets (textures, audio, video) bloat the Git repository and slow CI checkout.

**Fix:** Use Git LFS for binary assets:
```bash
git lfs track "*.png" "*.wav" "*.ogg" "*.mp3" "*.fbx"
```

In CI, ensure LFS files are fetched:
```yaml
      - uses: actions/checkout@v4
        with:
          lfs: true
```
