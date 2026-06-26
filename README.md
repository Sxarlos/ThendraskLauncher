# Ender Client

A custom Minecraft launcher / management hub. It is **just an interface** — it
downloads modpacks and spawns the official game; it does not modify Minecraft.

Features (by phase):

- **Phase 0 ✅** — App shell (Library / Browse / Servers / Settings), secure IPC.
- **Phase 1 ✅** — Microsoft account login + switcher, create vanilla instances, launch the game.
- **Phase 2** (next) — Browse & install Modrinth modpacks.
- **Phase 3** — Server monitoring: live status, RCON console, start/stop.
- **Phase 4** — CurseForge integration + polish.

## Develop

```bash
npm install      # once
npm run dev      # launch the app with hot reload
npm run typecheck
npm run build    # production build into ./out
```

## How Phase 1 works

- **Accounts** (top-right switcher): "Add Microsoft account" opens the official
  Microsoft login window (via `msmc`). We store only the *refresh token*, encrypted
  with the OS keychain (`safeStorage`) in `accounts.json` under the app's user-data
  folder. Your password is never seen or stored.
- **Instances**: "New instance" creates a vanilla install for any Minecraft version
  (fetched live from Mojang's version manifest). Each instance lives in its own
  `.minecraft` folder under the user-data folder.
- **Play**: downloads the version (if needed) via `minecraft-launcher-core` and
  launches it with the active account. Progress streams onto the instance card.
- **Settings**: set the Java path (auto-detected from PATH) and max RAM.

## Requirements

- Node.js 18+ and a Java runtime (JRE) for launching the game. Note: modern
  Minecraft (1.20.5+) needs Java 21; older versions may need Java 8/17.

> Not affiliated with Mojang or Microsoft.
