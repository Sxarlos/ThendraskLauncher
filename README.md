# Thendrask Launcher

**[thendrask.org](https://thendrask.org)** · [![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/zzWF8nBhYD) ·

A custom Minecraft launcher built with Electron and React. It is **just an interface**: it downloads modpacks and spawns the official game; it does not modify Minecraft itself.

> Not affiliated with Mojang, Microsoft, or any modpack catalogue provider.

> **Windows** builds are stable. **macOS and Linux** builds are now available as **public betas**. See [Platform support](#platform-support) below.

> **Signing notice:** current releases are unsigned. Only download Thendrask Launcher from this repository's [Releases page](https://github.com/Sxarlos/ThendraskLauncher/releases), and read [Trust and security](#trust-and-security) before bypassing an operating-system warning.

## Features

- **Microsoft account login:** secure OAuth via `msmc`. Only the refresh token is stored, encrypted with the OS keychain (`safeStorage`). If secure storage is unavailable, the launcher refuses to persist the token rather than falling back to plaintext. Your password is never seen or stored.
- **Modpack browser:** search and install modpacks from Modrinth and, in approved builds, CurseForge. Modrinth supports sort (Popular / Updated / Newest) and category filters.
- **Custom modpack builder:** create a Fabric, Forge, NeoForge, or Quilt instance, search compatible client mods on Modrinth, install required dependencies automatically, and enable, disable, remove, or update mods in-app.

> **CurseForge integration uses the Thendrask relay.** The approved project API key stays on the hosted relay and is never included in the desktop app. CurseForge project distribution restrictions are respected.

> **FTB, FTB Legacy, ATLauncher, and Technic integrations are not included in
> the application source, repository, or public builds** while permission is
> pending. Reference implementations are retained locally in a Git-ignored
> holding directory and cannot be compiled or published accidentally.

## Provider module system

Modpack catalogues are registered centrally in `src/shared/features.ts`. The
registry is the source of truth for which provider modules the renderer may
display. Main-process IPC, preload APIs, shared source types, installers, tests,
and release builds contain only the approved providers:

- **Modrinth** — public API integration, always available.
- **CurseForge** — approved integration, enabled in public builds; its API key
  remains on the Thendrask relay and is never included in the desktop client.

Pending providers are kept in a local, Git-ignored `pending-provider-modules/`
holding directory with a `.disabled` extension. Adding one back requires
documented approval, a current API review, restoration of its isolated provider
module and IPC surface, provider-specific tests, and a clean production build.
This prevents dormant or unapproved provider code from entering a beta simply
because an environment variable was changed.

- **Instance management:** create vanilla or modded instances for any Minecraft version. Each instance has its own isolated `.minecraft` folder.
- **Launch:** downloads the game version and assets on first run via `minecraft-launcher-core`. Progress and live game logs stream onto the instance card.
- **Server monitor:** add servers to watch; the launcher pings them and shows live player counts and status.
- **Friends list:** add friends by code and see if they're online and what they're playing. Uses the same [hosted relay](relay/README.md) as CurseForge.
- **Discord Rich Presence:** shows what instance you're playing in Discord, with a button linking to thendrask.org.
- **In-app updates:** the launcher self-updates via `electron-updater`, checking GitHub Releases and downloading new versions without leaving the app (Windows & Linux apply automatically; macOS pending code-signing).
- **No Chat Restrictions:** optionally injects the No Chat Restrictions mod into all modded instances (required in some regions for unsigned-chat servers).
- **Shader auto-install:** detects missing EuphoriaPatcher shaders from game output and downloads them automatically via Modrinth.
- **New instance defaults:** optionally write default video settings (render distance, graphics, particles, FOV) into fresh instances before first launch.
- **Themes:** Thendrask (default), Amethyst, Ocean, Crimson, Gold, Midnight, Daylight.
- **Play time tracking:** records time played per instance.
- **Safe modpack updates:** verifies required downloads, snapshots the working pack, and automatically rolls back if an update fails.
- **Backups and repair:** create or restore snapshots, export/import portable instance backups, verify broken files, and force a clean modpack reinstall.
- **Diagnostics and storage tools:** inspect per-instance disk usage and export a sanitized diagnostic ZIP with environment details and the latest game log.
- **Library organisation:** favourites, groups, tags, and instant instance search.

## Platform support

| Platform | Status | Install |
|---|---|---|
| **Windows** | ✅ Stable | Download the `.exe` from the [Releases page](https://github.com/Sxarlos/ThendraskLauncher/releases). |
| **macOS** (Apple Silicon & Intel) | 🧪 **Public beta** | Grab the `.dmg` from a **[prerelease](https://github.com/Sxarlos/ThendraskLauncher/releases)**. It's unsigned: try to open it, then go to **System Settings → Privacy & Security → Open Anyway** to get past Gatekeeper (on macOS 14 and earlier, right-click the app → **Open** still works too). |
| **Linux** | 🧪 **Public beta** | Grab the `.AppImage` (or `.deb`) from a **[prerelease](https://github.com/Sxarlos/ThendraskLauncher/releases)**. `chmod +x` the AppImage, then run it. |

The macOS and Linux clients are feature-complete but haven't been battle-tested on real hardware yet. That's what the beta is for. **Please report anything that breaks** by opening an issue at [github.com/Sxarlos/ThendraskLauncher/issues](https://github.com/Sxarlos/ThendraskLauncher/issues) with:

- your OS and version (e.g. macOS 14.5, Ubuntu 24.04)
- the launcher version (shown in Settings)
- what you did, what went wrong, and any error text or logs

> **Auto-update note:** Windows and Linux (AppImage) update themselves in-app. On macOS the update banner and download work, but the update can only *apply itself* once the app is code-signed. Until then, update by downloading the newer `.dmg`. See [CODE_SIGNING.md](CODE_SIGNING.md).

## Requirements

- **Node.js 18+** (for development)
- **Windows, macOS, or Linux:** the launcher builds and runs on all three
- **A Microsoft account that owns Minecraft: Java Edition** (offline fallback is available only after a successful sign-in)
- **No separate Java installation is normally required:** the launcher can find or download a compatible runtime automatically

## Java runtimes

Thendrask selects Java per instance instead of assuming that one system-wide version works for every Minecraft release.

1. It reads the required Java major version from Mojang's version metadata. If that metadata is unavailable, it falls back to Java 21 for Minecraft 1.20.5 and newer, Java 17 for 1.17–1.20.4, and Java 8 for older releases.
2. Imported Prism instances can supply their own compatible Java requirement. NeoForge installations are also checked for a newer runtime requirement.
3. The launcher searches `PATH`, common Java installation directories, and runtimes it previously downloaded.
4. If no compatible runtime is found, it downloads an Eclipse Temurin JRE for the current operating system and CPU architecture from the Eclipse Adoptium API. The archive is verified against Adoptium's SHA-256 checksum before extraction.

Managed runtimes are kept inside the launcher's user-data directory under `java/`; Thendrask does not modify the system Java installation or `PATH`. A JRE is sufficient—you do not need a full JDK.

You can choose a specific `java` or `java.exe` in **Settings → General → Java**. The settings page lists detected installations and their major version/vendor. An invalid configured path stops the launch with an error; a valid but outdated runtime is skipped in favour of a compatible detected or managed runtime.

Because Mojang can raise the runtime requirement for future Minecraft versions (for example, to Java 25), the value from Mojang's metadata takes precedence over the fallback table above.

## Trust and security

Thendrask is open source, so its launcher, update, authentication, and download behaviour can be audited in this repository. That does not eliminate every risk, especially when running community-authored mods, so the relevant trust boundaries are documented here.

- **Unsigned releases:** current Windows and macOS packages are not code-signed. SmartScreen or Gatekeeper may therefore warn even for a genuine build. Download only from the repository's [Releases page](https://github.com/Sxarlos/ThendraskLauncher/releases); see [CODE_SIGNING.md](CODE_SIGNING.md) for the current signing status and platform-specific consequences.
- **Microsoft credentials:** sign-in is handled through Microsoft OAuth. The launcher never receives your password. Only the resulting refresh token is retained, encrypted with Electron `safeStorage` and the operating system's credential protection. If secure storage is unavailable, Thendrask refuses to save the token; tokens are never exposed to the React renderer.
- **Desktop isolation:** the Electron renderer runs sandboxed with context isolation enabled and Node.js integration disabled. A preload bridge exposes the limited launcher API, and the renderer uses a Content Security Policy.
- **Downloads and archives:** managed Java archives are SHA-256 verified, and downloaded pack/mod files are checksum-verified where the provider supplies a supported hash. Manifest and backup paths are checked to prevent writes outside the instance directory, and backup imports enforce size and compression-ratio limits.
- **Recovery:** modpack and custom-mod changes create snapshots where supported and roll back after a failed operation, reducing the chance that an interrupted or invalid update destroys a working instance.
- **Privacy:** there is no analytics, advertising, or launcher-operated telemetry. See [PRIVACY.md](PRIVACY.md) for the local data and external services used by each optional feature.

Minecraft mods and modpacks are third-party executable Java code. Checksums prove that a downloaded file matches the file published by its provider; they do **not** prove that the publisher or code is trustworthy. Review a project's source, authorship, permissions, and reputation before running it, particularly for packs imported from local archives or smaller third-party catalogues.

## Develop

```bash
npm install       # install dependencies
npm run dev       # launch with hot reload
npm run typecheck # type-check main + renderer
npm run build     # production build → ./out
npm run package   # build + package installer
```

## Friends and CurseForge Relay

Friends and CurseForge use one small relay service. Presence writes use a private per-install credential; CurseForge requests use the project API key stored only in the relay's environment. The relay applies endpoint allowlisting, body limits, field validation, caching, capacity limits, and rate limiting. See [`relay/README.md`](relay/README.md) for setup instructions. Once deployed, paste the URL into **Settings → Connections → Combined Relay URL**.

## In-app Updates

The launcher self-updates via [electron-updater](https://www.electron.build/auto-update), checking the GitHub Releases API directly. No token or extra secrets are needed. To release a new version:

1. Bump `version` in `package.json` and `package-lock.json` to `X.Y.Z-beta.1`.
2. Move completed entries from `Unreleased` into the prerelease version in `CHANGELOG.md`, then commit and push to `main`.
3. Publish the beta with `git tag vX.Y.Z-beta.1 && git push origin vX.Y.Z-beta.1`. Use later beta or release-candidate tags for fixes instead of cutting a stable release immediately.
4. Let the prerelease soak for at least 48 hours. Resolve blocker reports before promoting the tested code.
5. If the beta is healthy, change only `package.json`, `package-lock.json`, and `CHANGELOG.md` from the prerelease version to `X.Y.Z`, then commit and tag it with `git tag vX.Y.Z && git push origin vX.Y.Z`. If code changes, publish another prerelease first.
6. The release workflow runs typecheck, lint, tests, and a production build before packaging, then publishes the matching `CHANGELOG.md` section as the GitHub release notes. Prerelease tags build Windows, macOS, and Linux; stable tags publish the Windows stable channel.

> **macOS note:** because the macOS build is currently unsigned, the update banner and download work, but Squirrel.Mac only *applies* the update once the app is code-signed. See [CODE_SIGNING.md](CODE_SIGNING.md).
