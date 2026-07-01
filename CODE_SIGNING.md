# Code Signing Policy

Thendrask Launcher releases are signed via [SignPath Foundation](https://signpath.org/), a nonprofit that provides free code signing for open source projects.

## How signing works

- Only builds triggered by a version tag (`v*.*.*`) pushed to the `main` branch are submitted for signing
- Signing is performed automatically in CI via GitHub Actions — no developer has access to the private key
- The private key is stored exclusively on SignPath Foundation's Hardware Security Module (HSM)
- The unsigned installer is built by electron-builder, uploaded as a GitHub Actions artifact, submitted to SignPath for signing, and the signed artifact is then attached to the GitHub Release

## Verifying a release

Each release on the [Releases page](https://github.com/Sxarlos/ThendraskLauncher/releases) contains a signed `.exe` installer. You can verify the signature in Windows by right-clicking the file → Properties → Digital Signatures.
