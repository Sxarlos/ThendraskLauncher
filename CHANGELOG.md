# Changelog

All notable changes to Thendrask Launcher are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Sxarlos/ThendraskLauncher/compare/v0.5.8-beta.1...HEAD
[0.5.8-beta.1]: https://github.com/Sxarlos/ThendraskLauncher/compare/v0.5.7...v0.5.8-beta.1
[0.5.7]: https://github.com/Sxarlos/ThendraskLauncher/compare/v0.5.6...v0.5.7
[0.5.6]: https://github.com/Sxarlos/ThendraskLauncher/compare/v0.5.5...v0.5.6
[0.5.5]: https://github.com/Sxarlos/ThendraskLauncher/releases/tag/v0.5.5
