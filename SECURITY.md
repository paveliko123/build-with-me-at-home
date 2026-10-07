# Security

Build With Me at Home runs on a family's own computer and handles kids' conversations, so security reports are very welcome.

## Reporting a problem

Please email **paveliko@gmail.com** with what you found and how to reproduce it. Please don't open a public issue for a security problem. This is a small open-source project kept up in spare time: you'll get an answer as soon as possible, usually within a week.

Only the latest version is supported.

## What's in scope

- The parent gate: the PIN, and the Parent area being reachable only on the laptop itself.
- Passes: one device per pass, time limits, and the spending caps per pass.
- What a kid's app can do: apps run in a sealed-off frame with no network access.
- The home network: what tablets and other devices on the Wi-Fi can reach (ports 4747 and 4748), and the home certificate.
- The sealed-off Claude Code runs: kids' text never reaching your own Claude settings, memory or files, and personal details being masked.
- Kids' data staying on the computer (see "Privacy" in the README).

## Out of scope

- Someone who already controls the computer or the parent's user account.
- The Claude models' own behavior, beyond the app's safety checks; report those to Anthropic.

The project's own security review, with what was fixed, is in [devpost/security-audit.md](devpost/security-audit.md).
