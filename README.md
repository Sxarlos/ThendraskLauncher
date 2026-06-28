# Ender Client

A custom Minecraft launcher built with Electron and React. It is **just an interface** — it downloads modpacks and spawns the official game; it does not modify Minecraft itself.

> Not affiliated with Mojang or Microsoft.

## Features

- **Microsoft account login** — secure OAuth via `msmc`. Only the refresh token is stored, encrypted with the OS keychain (`safeStorage`). Your password is never seen or stored.
- **Modpack browser** — search and install modpacks from Modrinth and CurseForge directly in the launcher.
- **Instance management** — create vanilla or modded instances for any Minecraft version. Each instance has its own isolated `.minecraft` folder.
- **Launch** — downloads the game version and assets on first run via `minecraft-launcher-core`. Progress and live game logs stream onto the instance card.
- **Server monitor** — add servers to watch; the launcher pings them and shows live player counts and status.
- **Friends list** — add friends by code and see if they're online and what they're playing. Requires a [self-hosted relay](relay/README.md).
- **Discord Rich Presence** — shows what instance you're playing in Discord.
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

Updates are distributed via a public GitHub Gist that points to a download URL. To release a new version:

1. Run `npm run package` to build the installer
2. Upload the `.exe` to your chosen host (Google Drive, etc.)
3. Edit your Gist — update `version` and `downloadUrl`
4. Users will see an update banner within a few minutes

The Gist URL is configured in `src/main/updater.ts`.
