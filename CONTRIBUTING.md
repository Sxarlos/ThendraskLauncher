# Contributing to Thendrask Launcher

Thanks for helping improve Thendrask Launcher. Bug reports, focused feature
requests, documentation fixes, tests, and code contributions are all welcome.

## Before you start

- Search existing issues and pull requests to avoid duplicate work.
- Use the issue forms for bugs and feature requests.
- For a substantial change, open an issue first so the approach can be agreed
  before significant work begins.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Development setup

You need Node.js 18 or newer. CI currently runs on Node.js 20.

```bash
git clone https://github.com/Sxarlos/ThendraskLauncher.git
cd ThendraskLauncher
npm ci
npm run dev
```

The Electron main process is in `src/main`, the restricted preload bridge is in
`src/preload`, shared types are in `src/shared`, and the React interface is in
`src/renderer`. The optional friends/presence service lives in `relay`.

Never commit credentials, Microsoft authentication tokens, private relay
addresses, personal game logs, or `.env` files.

## Making a change

1. Create a branch from `main`.
2. Keep the change focused and preserve the launcher's security boundaries:
   renderer sandboxing, context isolation, narrow preload APIs, safe path
   validation, and encrypted token storage.
3. Add or update Vitest coverage for changed behaviour.
4. Update user-facing documentation and `CHANGELOG.md` when appropriate.
5. Run the same checks used by CI:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

If your change affects the relay, also install and test its dependencies from
the `relay` directory.

## Pull requests

In the pull request description, explain what changed, why it changed, how it
was tested, and any platform-specific impact. Include screenshots or a short
recording for visible interface changes. Link the relevant issue with
`Closes #123` when applicable.

Keep unrelated refactors out of the pull request. Do not edit generated output
in `out`, packaged artifacts in `dist`, or dependencies in `node_modules`.
Dependency changes should include the corresponding lockfile update.

## Release cadence

Changes accumulate under `Unreleased` in `CHANGELOG.md`. Releases should start
with a `vX.Y.Z-beta.N` tag and remain in prerelease for at least 48 hours.
Blockers found during that period are fixed in another beta or release
candidate. Stable promotion may change only `package.json`,
`package-lock.json`, and `CHANGELOG.md`; any code change requires another
prerelease. The release workflow enforces this policy.

By contributing, you agree that your contribution may be distributed under the
project's MIT license.
