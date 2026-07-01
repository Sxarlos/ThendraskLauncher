# Code Signing Policy

Thendrask Launcher releases are currently **unsigned**. We applied for free code signing via [SignPath Foundation](https://signpath.org/), a nonprofit that provides free code signing for open source projects, but the application was declined. We may reapply or pursue another signing option in the future.

## What this means for you

- Windows SmartScreen will likely show an "Unrecognized publisher" warning when running the installer. This is expected for an unsigned open-source app and does not indicate malware.
- You can verify you're downloading the genuine installer by only using links from the [Releases page](https://github.com/Sxarlos/ThendraskLauncher/releases).

## If signing is reinstated

Once code signing is available again, this document will be updated to describe the CI signing pipeline (built by electron-builder → signed in CI → attached to the GitHub Release).
