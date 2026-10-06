# Security audit brief: Build With Me at Home

Paste this into a fresh Claude Code session (Opus 5.5, Ultracode) opened in `C:\APPS\LearnAIBasics-Local`.

## What you're auditing

**Build With Me at Home** is an open-source **Claude Code plugin for parents**: a parent introduces their own kids to Claude Code and the plan-first approach, on the parent's own Claude account, with the parent supervising. It is about to be published as a **public GitHub repo** (a Devpost hackathon submission).

- **Shape:** a local Node/Express server (TypeScript in `server/`, React front end in `web/src/`, bundled to `app/dist/`) runs on the parent's laptop. The plugin files are `.claude-plugin/`, `skills/setup` and `app/launch.mjs`.
- **Who connects:** the parent on `http://localhost:4747`. Kids connect from the same laptop or from tablets and phones on the home Wi-Fi (`https://<LAN IP>:4748`, using a home certificate authority the parent installs on each tablet).
- **The AI:** the server runs the parent's own `claude` CLI headless (`server/claude/runner.ts`) for the guide, the safety checks, the app builder and the parent report.
- **Data:** stays in plain files in `<home>\Build With Me` (the family folder) and the plugin data folder.

**The goal:** find real vulnerabilities, and anything that would look like a red flag to a technically minded parent or reviewer browsing the public repo. The risk is lower because it's local, but treat the home Wi-Fi as semi-trusted. Assume other devices, a curious teen, or a guest could be on it.

## Rules (must follow)

- **Report first, change nothing.**
  - Write findings to `devpost/security-audit.md`. Don't edit source, don't commit, don't push.
  - Propose fixes as diffs or snippets inside the report. The owner will decide.
- **Credentials:**
  - Never read, print or copy Claude credentials, tokens, API keys or credential files (`~/.claude/.credentials*`, keychain entries, `.env` files). The app must never handle them either. Verify that it doesn't.
- **Git:**
  - Read-only git only (`log`, `show`, `grep` through history). No destructive operations.
- **Real data and the running app:**
  - Don't touch the parent's real install or data: port 4747/4748, `%USERPROFILE%\Build With Me`, and `%USERPROFILE%\.claude\plugins\data\`.
  - For live tests, start a private server on another port:
    - `BWM_DATA=<temp>/family BWM_PLUGIN_DATA=<temp>/plugin BWM_PORT=4791 node app/dist/server/main.mjs`
    - Run `npm run build` first if `app/dist` is stale.
    - Stop it when done.
- **No sound and no microphone** in any browser testing. Pick "Type", never "Talk", and stub `speechSynthesis.speak`.
- **Usage:**
  - Keep real Claude calls modest. Prompt-injection probes are fine, but under ~30 calls and no more than one app build.
  - The `simulate-limit` file in the plugin data folder fakes a plan-limit hit for free.
- **Contact:** the only contact address allowed in public text is `paveliko@gmail.com`. Flag any other email, name or machine-specific detail that appears in tracked files or git history.

## Threat model and where to look

1. **Network exposure.** Both servers listen on `0.0.0.0` (`server/index.ts`).
   - What can an unauthenticated device on the LAN reach? Enumerate every route in `server/index.ts`, `server/parentRoutes.ts`, `server/kidRoutes.ts` and `server/journey/routes.ts`, and check each one's auth.
   - `isLoopback` / `isThisComputer` (`server/auth.ts`): can a LAN client pose as "this computer"? Consider the Host header, X-Forwarded-For, IPv6 and IPv4-mapped addresses, and DNS rebinding against `localhost:4747`.
2. **Parent authentication.**
   - PIN hashing (scrypt) and lockout / brute-force limits over the LAN.
   - Session cookies: flags, lifetime, SameSite, no `Secure` on HTTP.
   - CSRF on state-changing parent routes (create pass, delete app, reset).
   - The "Open on this laptop" parent lock.
3. **Passes (kid access)** (`server/passes.ts`, `server/kidRoutes.ts`).
   - The 128-bit QR token and the 8-character typed code, with "5 wrong → 60 s wait". Is that per IP or global, and can it be bypassed?
   - One-use enforcement, expiry, and the cookie stored as a hash.
   - Can a kid's session reach another kid's projects, apps or reports (IDOR on `kidId`, `projectId`, `slug`), or any parent route?
   - The SSE `/api/events` endpoint.
4. **The home certificate authority** (`server/certs.ts`, stored in the family folder under `.home-certificate/`).
   - Private key storage and file permissions.
   - Name constraints: what exactly can it sign, and could a stolen key MITM other sites on a tablet that trusts it?
   - Validity period, and the uninstall/rotation story. The tablet setup page is `server/tabletSetupPage.ts`.
5. **AI-generated content rendered in the browser.** This is the biggest area: treat everything Claude writes as attacker-controlled, because kids' words steer it.
   - **Kid apps:** served by `server/journey/apps.ts` inside a wrapper with a sandboxed `srcdoc` iframe (`allow-scripts allow-forms`) and a CSP (`APP_CSP`). Check:
     - escaping into `srcdoc`
     - sandbox escapes
     - access to parent cookies or APIs from the app origin
     - `frame-ancestors`
     - the localStorage namespacing shim
   - **The guide's `visualHtml` pictures:** `web/src/kid/journey/components/VisualPane.tsx`.
   - **Parent reports** (`server/report/template.ts`, served with CSP by `server/parentRoutes.ts`), which embed Opus-written text and kids' transcripts. Check every interpolation is escaped.
   - **Markdown rendering** in `web/src/kid/journey/components/Md.tsx`.
6. **Prompt injection and the Claude runner** (`server/claude/runner.ts`, `server/claude/guard.ts`, `server/journey/claude.ts`).
   - Verify the isolation actually holds:
     - flags: `--safe-mode --tools "" --strict-mcp-config --setting-sources "" --no-session-persistence`
     - the cwd is a sandbox folder
     - every `CLAUDE*` / `ANTHROPIC*` environment variable is stripped
   - Can a kid's message get the guide or builder to run tools, read files, reveal the system prompt, or leak the parent's account email? (IS_DEMO is set; check that the output scrubbing in `guard.ts` works.)
   - The "fork check" (mix B): a safety check runs inside the guide's own prompt. Can a crafted kid message make the check say "ok" for unsuitable content? Test a few, cheaply.
   - Is it possible to inject arguments into the spawned process (prompt text, system prompt files, the JSON schema, file paths with spaces)?
7. **Local speech** (`server/speech.ts`, the `/api/speech/:id` routes, `web/public/lib/recorder.js`).
   - Who can upload audio, memory limits and denial of service, utterance ID guessing.
   - The model download from Hugging Face (`allowRemoteModels`): pinning and integrity.
8. **Data at rest and privacy.**
   - What's stored, where, and in what form: transcripts are masked, reports are plain HTML. Check file permissions on Windows and macOS.
   - Nothing should be in OneDrive or iCloud-synced folders.
   - Logs (`server.log`) must never contain kids' words. The speech log was just changed to record only length and loudness; verify it.
   - Retention: passes are pruned after 30 days. What isn't pruned?
9. **Plugin install and launch** (`.claude-plugin/`, `skills/setup`, `app/launch.mjs`, `scripts/stamp-build.mjs`).
   - What runs on install and on launch?
   - The detached server process and the start files it writes (`Start Build With Me.cmd` / `.command`).
   - Path quoting and command injection through usernames or paths with spaces.
   - Firewall rules or prompts.
   - Anything needing admin rights.
10. **Supply chain.**
    - `npm audit` on runtime dependencies, and a review of `package.json`: Express, `@peculiar/x509`, `@huggingface/transformers`, and so on.
    - The committed release build (`app/dist`, planned): could it diverge from the source?
    - The course skills in `app/skills/` (MIT, Copyright (c) 2026 Devpost): license notice present and correct.
11. **Public-repo red flags.**
    - **Secrets and private data in tracked files and the whole git history.** Search history for emails, tokens, machine names, absolute user paths and IPs. `devpost/learner-profile.md` must never have been committed. `.claude/` and `tmp/` are ignored.
    - **Telemetry or network calls** other than Claude Code, the Hugging Face model download and the Google Fonts/CDN use, if any.
    - **Wording** that overclaims safety. The product must not be called "kid-safe", and the 18+ note must be present: Anthropic's terms require users to be 18+, so it's the parent's decision and responsibility.
    - **A missing LICENSE, SECURITY.md or privacy section**, if the owner should add one.

## Deliverable: `devpost/security-audit.md`

- **Summary:** a one-paragraph verdict and the top 3 things to fix before publishing.
- **Findings table:** ID, severity (Critical / High / Medium / Low / Info), area, file:line, and a one-line description.
- **Each finding:**
  - what's wrong
  - how it would be exploited, as a concrete scenario on a home network, with proof-of-concept steps you actually ran where it's safe to
  - the impact
  - a proposed fix (diff or snippet)
  - how to verify the fix
- **Checked and fine:** a short list of what was tested and held up, so the owner knows the coverage.
- **Public-repo hygiene:** the results for area 11.

Calibrate severity to a local, home-network tool: no theoretical padding, but don't dismiss something because it's "only local" if a LAN guest or a kid could do it.
