# Ender Client

**[ender-client.xyz](https://ender-client.xyz)** · [![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/zzWF8nBhYD) · [![YouTube](https://img.shields.io/badge/YouTube-Subscribe-FF0000?logo=youtube&logoColor=white)](https://www.youtube.com/@EnderClientApp)

A custom Minecraft launcher built with Electron and React. It is **just an interface** — it downloads modpacks and spawns the official game; it does not modify Minecraft itself.

> Not affiliated with Mojang or Microsoft.

## Features

- **Microsoft account login** — secure OAuth via `msmc`. Only the refresh token is stored, encrypted with the OS keychain (`safeStorage`). Your password is never seen or stored.
- **Modpack browser** — search and install modpacks from Modrinth, CurseForge, FTB, FTB Legacy, ATLauncher, and Technic Launcher. Modrinth and CurseForge support sort (Popular / Updated / Newest) and category filters.
- **Instance management** — create vanilla or modded instances for any Minecraft version. Each instance has its own isolated `.minecraft` folder.
- **Launch** — downloads the game version and assets on first run via `minecraft-launcher-core`. Progress and live game logs stream onto the instance card.
- **Server monitor** — add servers to watch; the launcher pings them and shows live player counts and status.
- **Friends list** — add friends by code and see if they're online and what they're playing. Requires a [self-hosted relay](relay/README.md).
- **Discord Rich Presence** — shows what instance you're playing in Discord, with a button linking to ender-client.xyz.
- **In-app updates** — the launcher checks a Gist manifest and can download and install new versions without leaving the app.
- **No Chat Restrictions** — optionally injects the No Chat Restrictions mod into all modded instances (required in some regions for unsigned-chat servers).
- **Shader auto-install** — detects missing EuphoriaPatcher shaders from game output and downloads them automatically via Modrinth.
- **New instance defaults** — optionally write default video settings (render distance, graphics, particles, FOV) into fresh instances before first launch.
- **Themes** — Ender (default), Amethyst, Ocean, Crimson, Gold, Midnight, Daylight.
- **Play time tracking** — records time played per instance.

## Requirements

- **Node.js 18+** (for development)
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

The friends feature requires a small relay server that you self-host. See [`relay/README.md`](relay/README.md) for setup instructions. Once deployed, paste the URL into **Settings → API Keys → Presence Relay URL**.

## In-app Updates

The updater checks the GitHub Releases API directly — no token or extra secrets needed. To release a new version:

1. Bump `version` in `package.json`
2. Commit and push to `main`
3. `git tag vX.Y.Z && git push origin vX.Y.Z`
4. CI builds the installer and creates a GitHub Release with the `.exe` attached. Users see the update banner within ~5 minutes.

## Acknowledgements

- [Prism Launcher](https://github.com/PrismLauncher/PrismLauncher) — their open-source code was referenced to discover the ATLauncher CDN endpoint and the required User-Agent header used to fetch the pack list.
