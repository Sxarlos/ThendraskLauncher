# Thendrask Launcher

**[ender-client.xyz](https://ender-client.xyz)** · [![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/zzWF8nBhYD) · [![YouTube](https://img.shields.io/badge/YouTube-Subscribe-FF0000?logo=youtube&logoColor=white)](https://www.youtube.com/@EnderClientApp)

A custom Minecraft launcher built with Electron and React. It is **just an interface** — it downloads modpacks and spawns the official game; it does not modify Minecraft itself.

> Not affiliated with Mojang or Microsoft.

> **Windows** builds are stable. **macOS and Linux** builds are now available as **public betas** — see [Platform support](#platform-support) below.

## Features

- **Microsoft account login** — secure OAuth via `msmc`. Only the refresh token is stored, encrypted with the OS keychain (`safeStorage`). If secure storage is unavailable, the launcher refuses to persist the token rather than falling back to plaintext. Your password is never seen or stored.
- **Modpack browser** — search and install modpacks from Modrinth, CurseForge, FTB, FTB Legacy, ATLauncher, and Technic Launcher. Modrinth and CurseForge support sort (Popular / Updated / Newest) and category filters.
- **Custom modpack builder** — create a Fabric, Forge, NeoForge, or Quilt instance, search compatible client mods on Modrinth or CurseForge, install required dependencies automatically, and enable, disable, remove, or update mods in-app.
- **Instance management** — create vanilla or modded instances for any Minecraft version. Each instance has its own isolated `.minecraft` folder.
- **Launch** — downloads the game version and assets on first run via `minecraft-launcher-core`. Progress and live game logs stream onto the instance card.
- **Server monitor** — add servers to watch; the launcher pings them and shows live player counts and status.
- **Friends list** — add friends by code and see if they're online and what they're playing. Requires a [self-hosted relay](relay/README.md).
- **Discord Rich Presence** — shows what instance you're playing in Discord, with a button linking to ender-client.xyz.
- **In-app updates** — the launcher self-updates via `electron-updater`, checking GitHub Releases and downloading new versions without leaving the app (Windows & Linux apply automatically; macOS pending code-signing).
- **No Chat Restrictions** — optionally injects the No Chat Restrictions mod into all modded instances (required in some regions for unsigned-chat servers).
- **Shader auto-install** — detects missing EuphoriaPatcher shaders from game output and downloads them automatically via Modrinth.
- **New instance defaults** — optionally write default video settings (render distance, graphics, particles, FOV) into fresh instances before first launch.
- **Themes** — Thendrask (default), Amethyst, Ocean, Crimson, Gold, Midnight, Daylight.
- **Play time tracking** — records time played per instance.
- **Safe modpack updates** — verifies required downloads, snapshots the working pack, and automatically rolls back if an update fails.
- **Backups and repair** — create or restore snapshots, export/import portable instance backups, verify broken files, and force a clean modpack reinstall.
- **Diagnostics and storage tools** — inspect per-instance disk usage and export a sanitized diagnostic ZIP with environment details and the latest game log.
- **Library organisation** — favourites, groups, tags, and instant instance search.

## Platform support

| Platform | Status | Install |
|---|---|---|
| **Windows** | ✅ Stable | Download the `.exe` from the [Releases page](https://github.com/Sxarlos/ThendraskLauncher/releases). |
| **macOS** (Apple Silicon & Intel) | 🧪 **Public beta** | Grab the `.dmg` from a **[prerelease](https://github.com/Sxarlos/ThendraskLauncher/releases)**. It's unsigned: try to open it, then go to **System Settings → Privacy & Security → Open Anyway** to get past Gatekeeper (on macOS 14 and earlier, right-click the app → **Open** still works too). |
| **Linux** | 🧪 **Public beta** | Grab the `.AppImage` (or `.deb`) from a **[prerelease](https://github.com/Sxarlos/ThendraskLauncher/releases)**. `chmod +x` the AppImage, then run it. |

The macOS and Linux clients are feature-complete but haven't been battle-tested on real hardware yet — that's what the beta is for. **Please report anything that breaks** by opening an issue at [github.com/Sxarlos/ThendraskLauncher/issues](https://github.com/Sxarlos/ThendraskLauncher/issues) with:

- your OS and version (e.g. macOS 14.5, Ubuntu 24.04)
- the launcher version (shown in Settings)
- what you did, what went wrong, and any error text or logs

> **Auto-update note:** Windows and Linux (AppImage) update themselves in-app. On macOS the update banner and download work, but the update can only *apply itself* once the app is code-signed — until then, update by downloading the newer `.dmg`. See [CODE_SIGNING.md](CODE_SIGNING.md).

## Requirements

- **Node.js 18+** (for development)
- **Windows, macOS, or Linux** — the launcher builds and runs on all three
- **Java** for launching the game — Java 21 for Minecraft 1.20.5+, Java 17 for 1.17–1.20.4, Java 8 for older versions

## Develop

```bash
npm install       # install dependencies
npm run dev       # launch with hot reload
npm run typecheck # type-check main + renderer
npm run build     # production build → ./out
npm run package   # build + package installer
```

## Friends / Presence Relay

The friends feature requires a small relay server that you self-host. Presence writes use a private per-install credential, and the relay applies body limits, field validation, capacity limits, and rate limiting. See [`relay/README.md`](relay/README.md) for setup instructions. Once deployed, paste the URL into **Settings → API Keys → Presence Relay URL**.

## In-app Updates

The launcher self-updates via [electron-updater](https://www.electron.build/auto-update), checking the GitHub Releases API directly — no token or extra secrets needed. To release a new version:

1. Bump `version` in `package.json`
2. Commit and push to `main`
3. `git tag vX.Y.Z && git push origin vX.Y.Z`
4. CI builds on Windows, macOS, and Linux and publishes a GitHub Release with the per-platform installers (`.exe`, `.dmg`, `.AppImage`, `.deb`) plus the electron-updater metadata (`latest.yml` / `latest-mac.yml` / `latest-linux.yml`) attached. Users see the update banner within ~5 minutes.

> **macOS note:** because the macOS build is currently unsigned, the update banner and download work, but Squirrel.Mac only *applies* the update once the app is code-signed. See [CODE_SIGNING.md](CODE_SIGNING.md).

## Acknowledgements

- [Prism Launcher](https://github.com/PrismLauncher/PrismLauncher) — their open-source code was referenced to discover the ATLauncher CDN endpoint and the required User-Agent header used to fetch the pack list.
