# Thendrask Launcher

[Website](https://thendrask.org) · [Discord](https://discord.gg/zzWF8nBhYD) · [Downloads](https://github.com/Sxarlos/ThendraskLauncher/releases)

An open-source Minecraft launcher built with Electron and React. Thendrask manages instances, modpacks, Java runtimes, backups, and updates; it launches the official Minecraft game without modifying it.

> Not affiliated with Mojang, Microsoft, or any modpack catalogue provider. Current releases are unsigned, so download them only from the official [Releases page](https://github.com/Sxarlos/ThendraskLauncher/releases).

## Highlights

- Microsoft OAuth login with refresh tokens protected by the operating system keychain.
- Modpack browsing and installation from Modrinth and approved CurseForge builds.
- Isolated vanilla, Fabric, Forge, NeoForge, and Quilt instances.
- Custom modpack building with dependency resolution and in-app mod management.
- Safe pack updates, snapshots, rollback, backups, repair, and diagnostics.
- Automatic Java runtime selection and verified Eclipse Temurin downloads.
- Friends presence, server monitoring, Discord Rich Presence, themes, and play-time tracking.
- In-app updates on Windows and Linux; macOS updates require manual installation until releases are signed.

## Supported providers

| Provider | Status | Notes |
|---|---|---|
| Modrinth | Enabled | Public API integration. |
| CurseForge | Enabled | Approved project key is held by the Thendrask relay, never the desktop app. |
| FTB / FTB Legacy | Not included | Awaiting permission and API review. |
| ATLauncher | Not included | Awaiting permission and API review. |
| Technic | Not included | Awaiting permission and API review. |

### Provider modules

Approved catalogues are registered centrally in [`src/shared/features.ts`](src/shared/features.ts). The renderer, IPC bridge, installers, tests, and public builds expose only providers in that registry.

Pending implementations are stored locally outside Git with a `.disabled` extension. Restoring one requires documented permission, a current API review, provider-specific tests, and a clean production build. Unapproved provider code is therefore absent from this repository and its beta releases.

## Platform support

| Platform | Status | Package |
|---|---|---|
| Windows | Stable | `.exe` |
| macOS (Intel and Apple Silicon) | Public beta, unsigned | `.dmg` |
| Linux | Public beta | `.AppImage` or `.deb` |

Download packages from [GitHub Releases](https://github.com/Sxarlos/ThendraskLauncher/releases). On unsigned macOS builds, use **System Settings → Privacy & Security → Open Anyway** after the first launch attempt. Linux AppImages may need `chmod +x`.

Please report platform issues through [GitHub Issues](https://github.com/Sxarlos/ThendraskLauncher/issues) with your OS, launcher version, steps to reproduce, and relevant errors or logs.

## Requirements and Java

- A Microsoft account that owns Minecraft: Java Edition.
- Windows, macOS, or Linux.
- Node.js 22 for development only.

A separate Java installation is normally unnecessary. Thendrask reads Mojang's runtime requirement, searches compatible local installations, and can download a checksum-verified Eclipse Temurin JRE. Managed runtimes stay inside the launcher's user-data directory and do not modify the system `PATH`. A custom Java executable can be selected under **Settings → General → Java**.

## Security and privacy

- The Electron renderer is sandboxed with context isolation enabled and Node.js integration disabled.
- Microsoft passwords never pass through the launcher; only the OAuth refresh token is retained securely.
- Provider files and managed Java archives are checksum-verified when supported metadata is available.
- The launcher contains no advertising, analytics, or launcher-operated telemetry.
- Community mods are third-party executable code; a valid checksum does not guarantee that a mod is trustworthy.

Read [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), and [CODE_SIGNING.md](CODE_SIGNING.md) for the detailed policies and trust boundaries.

## Development

```bash
npm ci            # install locked dependencies
npm run dev       # start with hot reload
npm run typecheck # check main and renderer types
npm test          # run the test suite
npm run build     # create the production build in ./out
npm run package   # build and package an installer
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance.

## Relay

Friends presence and CurseForge access share the Thendrask relay. Presence uses a private per-install credential; the approved CurseForge API key remains in the relay environment. Endpoint allowlists, validation, limits, and rate limiting are applied server-side. See [`relay/README.md`](relay/README.md) for deployment details.

## Releases

1. Update the version in `package.json` and `package-lock.json`.
2. Move completed changelog entries into the matching version section.
3. Merge the release commit, then push a matching `vX.Y.Z-beta.N` or `vX.Y.Z` tag.
4. GitHub Actions validates, packages, publishes checksums and updater metadata, and uses the matching changelog section as release notes.

Prereleases build Windows, macOS, and Linux packages. Stable releases require a successful same-version prerelease and at least 48 hours of testing.
