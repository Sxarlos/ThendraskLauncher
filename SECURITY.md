# Security Policy

## Supported versions

Security fixes are applied to the latest release of Thendrask Launcher. Older
versions may remain available, but are not supported.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |

Install releases only from the
[official GitHub Releases page](https://github.com/Sxarlos/ThendraskLauncher/releases).
Current packages are unsigned, so Windows SmartScreen and macOS Gatekeeper may
display a warning. See [CODE_SIGNING.md](CODE_SIGNING.md) for details.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Report it privately through
[GitHub Security Advisories](https://github.com/Sxarlos/ThendraskLauncher/security/advisories/new).
Include:

- the affected launcher version and operating system;
- a clear description of the issue and its potential impact;
- steps or a minimal proof of concept that reproduce it;
- any suggested mitigation, if known.

Do not include real Microsoft tokens, passwords, API keys, private server
addresses, or other sensitive data. Redact logs and screenshots before
attaching them.

You should receive an acknowledgement within seven days. After confirming the
report, the maintainer will share status updates through the private advisory
and coordinate a release and disclosure timeline where appropriate.

## Scope

Reports about the launcher, its update path, the optional presence relay, local
credential storage, archive handling, or a trust-boundary bypass are in scope.
Vulnerabilities in Minecraft, third-party mods, modpacks, or external services
should be reported to their respective maintainers unless Thendrask handles
them in an unsafe way.

Good-faith security research that avoids privacy violations, data destruction,
service disruption, and access to accounts you do not own is welcome.
