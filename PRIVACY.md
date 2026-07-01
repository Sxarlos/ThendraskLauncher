# Privacy Policy

**Last updated: June 2026**

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
If you enable the No Chat Reports feature, the app fetches the mod from `api.modrinth.com`. No personal data is sent - only a `User-Agent` header identifying the app version.

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
