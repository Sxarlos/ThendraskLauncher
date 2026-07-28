# Privacy Policy

**Last updated: July 2026**

Thendrask Launcher is a free and open source Minecraft launcher. This policy describes what data the app handles and where it goes.

---

## Data stored locally on your device

The following is saved to your local app data folder and never leaves your machine unless described below:

- **Microsoft account tokens** - your Xbox/Minecraft refresh token, encrypted using your OS keychain (Windows Data Protection API via Electron's `safeStorage`)
- **Minecraft username and UUID** - stored alongside your account token
- **App settings** - preferences such as window size, Java path, Discord RPC toggle, relay URL, etc.
- **Instance configuration** - your Minecraft instance names, versions, mod loaders, and launch options
- **Friend codes** - locally saved friend entries (display name + friend code)

No account credentials or tokens are ever transmitted to Thendrask Launcher or any third party other than Microsoft's own authentication servers.

## CurseForge API keys from older versions

Older versions of Thendrask Launcher may have stored a user-provided CurseForge API key locally in plaintext in `settings.json`, a backup, or a temporary/legacy settings copy. Current builds temporarily disable CurseForge integration and run a one-time local migration that removes `curseforgeApiKey` from those settings copies without creating another backup containing the key. The key is not transmitted as part of this migration.

---

## External services contacted by the app

### Microsoft / Xbox / Mojang
Used for Minecraft account login and authentication. Thendrask Launcher communicates with:
- `login.microsoftonline.com` - Microsoft OAuth login
- `xsts.auth.xboxlive.com` - Xbox token exchange
- `api.minecraftservices.com` - Minecraft profile and cape management

Your credentials are handled entirely by Microsoft. Thendrask Launcher only stores the resulting refresh token, locally and encrypted.

### GitHub (update checker)
Thendrask Launcher checks `api.github.com/repos/Sxarlos/ThendraskLauncher/releases/latest` on startup and every 5 minutes to detect new versions. No personal data is included in this request.

### Discord (optional)
If you enable Discord Rich Presence in settings, the app connects to your local Discord client via IPC to display your current game activity (instance name, mod loader, Minecraft version). This data goes to Discord directly from your machine - Thendrask Launcher does not relay it through any server.

### Modrinth (optional)
Used when you browse, install, inspect, or update Modrinth modpacks and mods,
and when optional Modrinth-backed features install a supported mod or shader.
Requests go to `api.modrinth.com` and Modrinth's download CDN. Search terms,
selected projects, Minecraft versions, loaders, your IP address, and a
`User-Agent` identifying Thendrask may be visible to Modrinth and its hosting
providers. Thendrask does not add an account token or launcher-specific user ID.

### Feed The Beast (optional)
Used when you browse, install, inspect, or update FTB modpacks. Requests go to
the public FTB modpack API at `api.feed-the-beast.com` and to download hosts
listed by that API. Search terms, selected packs, your IP address, and a
`User-Agent` identifying Thendrask may be visible to those services.

### ATLauncher and Technic
Public builds do not browse or install content from ATLauncher or Technic.
Their catalogue integrations are disabled unless a distributor makes a
separate build after obtaining any permission required by those providers.

### Relay server (optional, self-configured)
The friends feature optionally uses a relay server to share your in-game presence with friends. The relay URL is configured by you in Settings. Thendrask Launcher does not operate a default relay server. The data sent to your configured relay is limited to your current game presence (instance name, status).

---

## What we do not collect

- No analytics or telemetry
- No crash reporting sent to Thendrask Launcher
- No advertising identifiers
- No data is ever sold or shared with third parties by Thendrask Launcher

---

## Open source

Thendrask Launcher is fully open source. You can audit exactly what data is handled by reading the source code at [https://github.com/Sxarlos/ThendraskLauncher](https://github.com/Sxarlos/ThendraskLauncher).

---

## Contact

For questions or concerns, open an issue at [https://github.com/Sxarlos/ThendraskLauncher/issues](https://github.com/Sxarlos/ThendraskLauncher/issues).
