# Changelog

All notable changes to Thendrask Launcher are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.8-beta.2] - 2026-07-27

### Added

- A renderer recovery screen with a reload action for unexpected client
  crashes.
- Regression coverage for beta-profile startup and archive safety checks.

### Changed

- Launcher startup now continues when an individual settings, account, or
  instance request fails and reports the failed section in the client.
- Lazy client pages are preloaded after startup for faster tab switching.
- Presence updates are serialized and time-limited to prevent overlapping or
  stalled relay requests.
- Safe, non-breaking dependency updates were applied to the lockfile.

### Fixed

- Fixed the blank launcher window caused by a missing saved server result when
  beta-enabled profiles loaded the Home page.
- Prevented the previous tab from flashing underneath while a client page was
  loading.
- Added a visible production fallback if the renderer fails to load or exits
  unexpectedly instead of leaving a hidden or blank window.
- Applied consistent expanded-size, per-entry, entry-count, and compression
  ratio limits to imported backups, modpacks, and Java runtime archives.
- Friends, servers, and account actions now surface asynchronous failures
  instead of failing silently.

## [0.5.8-beta.1] - 2026-07-26

### Added

- Security and contribution policies, a maintained changelog, and structured
  GitHub forms for bug reports and feature requests.

### Changed

- Split the Library instance list and modpack browser into focused modules
  without changing their interface or behaviour.
- Release publishing now requires typecheck, lint, tests, and a production
  build, and publishes the matching changelog section as GitHub release notes.
- Releases now follow a prerelease-first cadence with a minimum 48-hour beta
  soak before stable promotion.

### Fixed

- Prevented stale loader versions from appearing when changing the Minecraft
  version or loader in the new-instance dialog.
- Prevented skin previews and featured-instance server lists from briefly
  showing data belonging to the previous selection.
- Improved initial loading and cleanup for profiles, friends, servers, modpack
  details, and Library navigation.
- Kept modpack search results visible until a debounced replacement search
  begins.

## [0.5.7] - 2026-07-26

### Added

- Offline launch support after a successful Microsoft sign-in.
- Java argument-file handling for launch commands.
- Additional Prism instance compatibility and launch diagnostics.

### Fixed

- Launch command construction and logging edge cases.

## [0.5.6] - 2026-07-21

### Added

- JVM argument normalization with automated coverage.

### Changed

- Improved launcher resilience and reduced the initial renderer bundle.
- Refined account, home, friends, server, splash, and settings interfaces.

### Fixed

- Discord presence, maintenance, and game launch edge cases.

## [0.5.5] - 2026-07-20

### Added

- Prism Launcher instance import support.
- GregTech: New Horizons installation and add-on management.
- Minecraft skin upload, library, full-body thumbnails, and cape previews.
- Custom modpack building and recovery tools.

### Changed

- Java requirements are resolved from Mojang version metadata.
- Background updates are quieter and can be disabled.

Earlier release history is available on the
[GitHub Releases page](https://github.com/Sxarlos/ThendraskLauncher/releases).

[Unreleased]: https://github.com/Sxarlos/ThendraskLauncher/compare/v0.5.8-beta.2...HEAD
[0.5.8-beta.2]: https://github.com/Sxarlos/ThendraskLauncher/compare/v0.5.8-beta.1...v0.5.8-beta.2
[0.5.8-beta.1]: https://github.com/Sxarlos/ThendraskLauncher/compare/v0.5.7...v0.5.8-beta.1
[0.5.7]: https://github.com/Sxarlos/ThendraskLauncher/compare/v0.5.6...v0.5.7
[0.5.6]: https://github.com/Sxarlos/ThendraskLauncher/compare/v0.5.5...v0.5.6
[0.5.5]: https://github.com/Sxarlos/ThendraskLauncher/releases/tag/v0.5.5
