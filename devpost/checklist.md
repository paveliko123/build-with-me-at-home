---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast — pause only for significant decisions, the planned checkpoints, and steps that physically need the learner (tablet, plugin install)

## Slices

- [x] **1. A sealed-off Claude conversation runs from the app on your own login**
  Becomes usable: Running `npm run e1` starts your `claude` in the background, completely sealed off from your own setup. It holds a short multi-turn conversation in the guide's voice and prints a pass/fail report:
  - isolation: no CLAUDE.md, tools, plugins or MCP
  - structured JSON replies
  - a readable `/usage`
  - rate-limit events
  - whether Opus is available on your plan
  Why now: Every later slice depends on driving your Claude Code safely and isolated. If the isolation can't be sealed, the whole design changes, so this is the one allowed "technical layer" slice: it proves the critical risk and leaves runnable evidence. The project scaffold is bootstrapped here.
  PRD ref: `prd.md > Safety`, `prd.md > The Parent Report` (plan usage), `prd.md > Non-Goals` (never handles Claude sign-in)
  Spec ref: `spec.md > Claude Runner`, `spec.md > Stack`, `spec.md > Build Order and Early Experiments` (E1), `spec.md > File Structure`
  Build:
  - Scaffold `package.json` (Node ≥22, TypeScript, tsx), `tsconfig`, and the folders from the file structure.
  - Write `server/claude/runner.ts`:
    - spawns `claude -p` with the isolation flags
    - streams JSON in and out
    - supports long-lived and one-shot processes
    - parses `result`, `rate_limit_event` and `api_retry`
  - Write `server/usage.ts` (reads and parses `/usage`).
  - Write `scripts/e1-isolation.ts`, which runs the probes and writes `devpost/e1-results.md`.
  - Adjust the flag set until isolation passes, and record the final flags in the spec.
  Verify (mechanical):
  - `npm run e1` exits 0.
  - The results show:
    - the guide reports no tools and no knowledge of the parent's CLAUDE.md (a canary line placed in a temporary user CLAUDE.md is absent from replies)
    - a 3-turn conversation keeps context
    - a structured reply validates
    - `/usage` gives 5-hour and weekly percentages (or the fallback is recorded)
    - Opus availability is recorded
  Learner check: Open `devpost/e1-results.md` and read the plain-language summary: what Claude could and couldn't see, and how much of your 5-hour limit the test used.
  Commit: `Prove sealed-off Claude Code runner (E1)`

- [x] **2. Talking turns into text on this computer, including from a tablet**
  Becomes usable: A small test page, at `http://localhost:4747/talk-test` on the laptop and at `https://<laptop address>:4748/talk-test` on a tablet after the one-time certificate setup from `/setup-tablet`. You talk, and the words appear, transcribed by Whisper on the laptop, with the timing shown.
  Why now: Tablet talking is the second-riskiest unknown (E2). Certificates, the microphone on HTTPS and Whisper speed all need proving before the kid screens depend on them. If it fails, we switch to keyboard dictation now, not late.
  PRD ref: `prd.md > Talking`
  Spec ref: `spec.md > Speech`, `spec.md > Home Certificate (tablets)`, `spec.md > Server Core`, `spec.md > Build Order and Early Experiments` (E2)
  Build:
  - Write `server/index.ts` (Express, HTTP on 4747 and HTTPS on 4748).
  - Write `server/certs.ts` (the home certificate authority with name constraints, plus the server certificate for the current home IPs).
  - Add the `/setup-tablet` page with `.mobileconfig` and `.crt` downloads.
  - Write `server/speech.ts` (Transformers.js Whisper `base.en`, chunked transcription).
  - Write the browser side, `web/src/lib/speech.ts` (16 kHz PCM streaming).
  - Add the minimal `talk-test` page.
  Verify (mechanical):
  - The server starts on both ports.
  - `openssl` / Node TLS check: the server certificate chains to the home authority, and the authority carries the name constraints.
  - A script posts a recorded WAV sample to the speech route and gets the expected text, timing logged.
  - `devpost/e2-results.md` records the laptop latency.
  Learner check: Install the certificate on your tablet from `/setup-tablet`, then open the talk test on the laptop and on the tablet. Say a sentence on each. Tell me whether the words are right and how the wait feels. (Ideally, have one of your kids try a sentence too.)
  Commit: `Prove local speech-to-text and tablet microphone (E2)`

- [x] **3. Install it as a Claude Code plugin and open your Parent area**
  Becomes usable:
  - In Claude Code, `claude --plugin-dir .` (locally) and then `/build-with-me` runs the setup check, fixes or explains anything missing, and starts the app.
  - The browser opens First-Run Setup (create the PIN, add your kids), then the opening screen (note, PIN, Enter), then the parent home with the real status strip (Claude Code signed in, 5-hour and weekly %).
  - The desktop shortcut is offered.
  - `/build-with-me:reset-pin` works.
  Why now: The parent's first experience, and the install path every family will use, sits on top of the riskiest packaging question: packages in the plugin's private folder, a background server that keeps running, and a start file that survives updates. The parent gate is the first half of the kernel (the parent in control).
  PRD ref: `prd.md > Installing and Updating`, `prd.md > First-Run Setup`, `prd.md > Parent Gate and Responsibility`, `prd.md > Kids`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Plugin and Setup`, `spec.md > Parent Gate`, `spec.md > Kids and Family Data`, `spec.md > Store (files)`, `spec.md > Parent Screens`, `spec.md > Look and Feel`
  Build:
  - **Plugin files:** `.claude-plugin/plugin.json` and `marketplace.json`, `commands/build-with-me.md`, `commands/reset-pin.md`, and `skills/setup/SKILL.md`.
  - **Scripts:** `app/setup-check.mjs` (JSON report) and `app/launch.mjs` (detached server, lock file, `.app-location`, start file, shortcut, open browser).
  - **Server:** `server/store.ts` (atomic JSON in Documents), `server/auth.ts` (scrypt PIN, lockout, loopback-only parent cookie) and `server/kids.ts`.
  - **Front end:** the React and Vite scaffold, plus the parent screens Opening, FirstRun, ParentHome (shell with status strip), KidsManage and Settings, in the mockup's design.
  - **Release:** the first `scripts/release.mjs` producing `app/dist`.
  Verify (mechanical):
  - `node app/setup-check.mjs` prints a valid report.
  - `claude plugin validate .` passes.
  - `launch.mjs` starts one server (a second launch doesn't start another).
  - A script covers the APIs:
    - first run creates `family.json`
    - a wrong PIN gives 401, and 5 wrong tries lock for 60s
    - the parent API refuses a non-loopback request
    - reset-pin clears the hash
  - The start file opens the app after the server is stopped.
  Learner check: In Claude Code, load the plugin and type `/build-with-me`. Go through setup, create a PIN, add your kids, lock, then unlock. Does the parent home feel like the mockup? Try the desktop shortcut.
  Commit: `Plugin install, first-run setup and parent gate`

- [x] **4. Give a kid a one-use, timed pass**
  Becomes usable:
  - In the parent home, pick a kid and a duration (presets or custom) and create a pass. A QR code appears.
  - Scanning it on the tablet (or "open on this laptop", or typing its short code on a kid's laptop or Chromebook) lands that kid on their Welcome screen, with their name and age group.
  - Scanning it again, or typing the code again, shows "already used."
  - Active passes shows the device and a live countdown, and +30 min / +1 hr / End now work instantly.
  - The kid sees the countdown at 10 minutes left, and Time's up at zero.
  Why now: The pass is the other half of "the parent in control," and every kid screen sits behind it. Building it before the journey means the journey is born gated.
  PRD ref: `prd.md > Passes`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Passes`, `spec.md > Server Core` (SSE), `spec.md > Parent Screens`
  Build:
  - **Server:** `server/passes.ts` (create, open with `/p/:code` or the typed code via `/api/pass/redeem`, the cookie, extend, end, expire), the SSE `/api/events`, and the kid-route guard in `server/auth.ts`.
  - **Screens:** the Give a pass and Active passes cards (QR code via `qrcode`), plus the kid screens Countdown, TimesUp, PassUsed, CantReach and "Ask your parent for a pass."
  Verify (mechanical): A script covers:
  - create pass → open the code → cookie set
  - a second open → "already used"
  - the typed code opens a pass too, dies with the QR code, and 5 wrong codes → 60 s wait
  - extend → `endsAt` moved and an SSE event received
  - end → the kid API returns 401
  - an expired pass → Time's up state
  - two kids with passes at once
  Learner check: Give a 15-minute pass to one kid and scan it on the tablet. Scan it again on your phone. Then extend it, and watch the tablet's timer change. Shorten a test pass to see the countdown and Time's up.
  Commit: `One-use timed passes with live countdown`

- [x] **5. A kid talks through Start → Idea → Design → Tech plan, with live safety checks**
  Becomes usable: With a pass, the kid goes through Welcome ("an AI, not a person," talk or type), Theme, and the guided steps, all from Build With Me, now on your Claude Code:
  - Kid vs Teen guidance follows the profile you set.
  - Talking uses the slice 2 speech, and the guide speaks with a device voice.
  - An unsuitable request is gently redirected, and a personal detail gets a kind reminder. Both are saved as flags.
  - Ending the pass mid-step and giving a new one resumes exactly there.
  Why now: This is the heart of the kid experience and the biggest port. It needs the runner (1), speech (2) and passes (4) proven first, and its transcript and flags are what the report reads.
  PRD ref: `prd.md > The Kid's Journey`, `prd.md > Safety`, `prd.md > Talking`, `prd.md > States and Boundaries` (coming back)
  Spec ref: `spec.md > Kid Journey (ported)`, `spec.md > Claude Runner`, `spec.md > Safety`, `spec.md > Speech`, `spec.md > Data Model`
  Build:
  - **Copy from Build With Me:** the kid screens, components, themes and `voice.ts`, plus the server's `journey/` and `prompt/`. Copy the course skills into `app/skills/` (confirm the MIT license and add the notice).
  - **Rewire:** `api.ts` to fetch + SSE; Firestore calls to Store; Anthropic SDK calls to the Claude Runner (long-lived guide and checker per session).
  - **Safety:** add `server/safety.ts` (both-way checks, flags).
  - **Remove** the wallet, App Check, Firebase and Cloud TTS.
  Verify (mechanical):
  - `npm run build` passes.
  - A scripted Kid session (8 typed answers) reaches Tech plan with valid replies at each step, and `project.json` holds the transcript and plans.
  - "make the cat explode with blood" → redirected, plus a flag.
  - "my name is Sam and I go to Oak School" → the reminder, the name and school absent from the guide's replies, plus a flag.
  - A Teen session sees and approves the Idea plan.
  - Resume after ending the pass continues from the same step.
  Learner check: Give a pass to one of your kids (or play the kid yourself) and talk through to the Tech plan. Try one "naughty" request and one personal detail. How do the guide's words, the voice and the waiting feel? What would you change?
  Commit: `Kid journey on the parent's Claude Code with live safety checks`

- [x] **6. Build, change and ship an app onto the kid's My apps shelf**
  Becomes usable:
  - The Build screen (⅔ app, ⅓ chat) shows a themed animation, then a true working app built by Opus in a sandboxed frame.
  - The kid asks for changes and the app updates. Leftovers are said honestly, and a broken build keeps the last working version.
  - Ship: the kid names the app, and it lands on their own My apps shelf with a link and a home-Wi-Fi QR code. The parent can delete it under Manage.
  Why now: It completes the kid's half of the kernel, an app made by talking, and produces the artifact the report links to.
  PRD ref: `prd.md > The Kid's Journey` (Build, Ship), `prd.md > My Apps`
  Spec ref: `spec.md > Kid Journey (ported)`, `spec.md > Claude Runner` (builder, concurrency), `spec.md > My Apps`, `spec.md > Data Model`
  Build:
  - **Builder:** port `generateApp`, `changeTurn`, `edits` and `checklist` onto the one-shot builder (with `--json-schema`). Add the build queue (at most 2) and the checker pass on the built HTML.
  - **Files:** versions under `versions/`, the Ship copy to `kids/<kid>/apps/<slug>/`, and `apps.json`.
  - **Serving:** the `/apps/...` route with a strict CSP and a pass-or-laptop guard.
  - **Screens:** MyApps, plus the Manage delete.
  Verify (mechanical):
  - A scripted session continues from slice 5's Tech plan → build → one change → ship.
  - `index.html` exists and is served with the CSP header.
  - The app loads in the frame without console errors (checked through the browser tools).
  - Another kid's pass gets 403 on this app.
  - Delete removes the folder and the index entry.
  Learner check: Have a kid finish a build, ask for one change, and ship it. Open it from My apps on the tablet and on the laptop. Is the app good? Does the shelf feel right?
  Commit: `Build, change rounds, ship and My apps shelf`

- [x] **7. The parent gets a report for every app, with flags, plan usage and alerts**
  Becomes usable:
  - When an app ships, or an unfinished pass ends, Opus writes the report. It appears in the parent home's Latest reports and in All reports, and as a self-contained HTML file in `<home>\Build With Me\Reports` that opens without the app.
  - It has everything from the mockup, including % of your 5-hour and weekly limits.
  - Flags and limit-reached events show under Needs your attention.
  - Hitting the plan limit shows the kid "Limit reached — ask your parent."
  Why now: The report is the kernel's payoff ("the oh, that's cool moment"). It needs a real transcript, flags and a shipped app to report on.
  PRD ref: `prd.md > The Parent Report`, `prd.md > Limit Reached`, `prd.md > Screens and Layout` (All reports, One report)
  Spec ref: `spec.md > Reporter and Reports`, `spec.md > Claude Runner` (limits), `spec.md > Data Model`, `spec.md > Look and Feel`
  Build:
  - **Report:** `server/report/reporter.ts` (schema, the input bundle), `server/report/template.ts` (self-contained HTML from the report mockup's design), and the usage before/after with the overlap split.
  - **Data:** `reports/*.json` and `alerts.json`.
  - **Screens:** AllReports, ReportView, Latest reports and the Needs your attention cards.
  - **Limits:** the LimitReached kid screen, driven by a `rejected` rate-limit event (with a test hook to simulate one).
  Verify (mechanical):
  - Ship in a scripted session → a report file is written, and its HTML opens standalone with every mockup section present (checked by heading).
  - The flagged session → a "1 flag · handled" badge and an alert.
  - An ended, unshipped pass → a "(not finished)" report.
  - A simulated `rejected` event → the kid limit screen and a parent alert with the reset time.
  - The usage % or the fallback is shown.
  Learner check: Open the Parent area and read the report for the app your kid just made. Then open the same report from the Reports folder in File Explorer. Is it what you want to know as a parent? What's missing or too much?
  Commit: `Parent reports, plan usage, alerts and limit reached`

- [x] **8. Choose the model mix with real usage numbers (E3)**
  Becomes usable: `npm run e3` runs the scripted journey three ways (A: Sonnet guide + Haiku checks; B: checks as guide forks; C: Opus throughout). It writes `devpost/usage-experiment.html` with % of the 5-hour limit, cache reads, the cost estimate and speed for each, and you pick the mix.
  Why now: Your caching question needs the real pipeline (slices 5–7) to measure. It runs when you're ready to spend about 15–30% of a 5-hour window.
  PRD ref: `prd.md > The Parent Report` (plan usage)
  Spec ref: `spec.md > Usage Experiment`, `spec.md > Decisions and Open Issues`
  Build:
  - **Script:** `scripts/usage-experiment.ts` (reuses the slice 5–7 session scripts with a model-mix setting), and a config switch for the mix in the runner, including a fork-checker mode.
  - **Results page:** the HTML results page.
  - **Decision:** apply the chosen mix and record it in the spec.
  Verify (mechanical):
  - All three runs complete.
  - The results page has numbers for every column.
  - After you choose, the runner's default mix matches, and a slice 5 scripted session still passes.
  Learner check: Read the results page and choose the mix. Does the winner match your intuition about the cache?
  Commit: `Usage experiment and chosen model mix`

- [x] **9. A parent can install it from GitHub using only the README**
  Becomes usable:
  - `npm run release` produces the committed `app/dist`.
  - The README (for parents) covers install, first start, tablets, reset PIN, update and uninstall.
  - Installing from the GitHub repo through the two plugin commands works on a clean profile and reaches First-Run Setup.
  - The demo run-through is rehearsed.
  Why now: Delivery is how every family gets it, and it's what the submission's public repo must prove.
  PRD ref: `prd.md > Installing and Updating`, `prd.md > What We're Building`
  Spec ref: `spec.md > Plugin and Setup`, `spec.md > Where It Runs and How Someone Tries It`, `spec.md > File Structure`
  Build:
  - **Release:** finish `scripts/release.mjs` (web, server, skills and license into `app/dist`).
  - **README and LICENSE:** the parent README, and the LICENSE plus the course-skill notice.
  - **Updates:** version bump handling in `launch.mjs` (re-run `npm ci` when `package.json` changed, restart the server).
  - **Clean install:** test with a separate `CLAUDE_CONFIG_DIR`.
  Verify (mechanical):
  - `npm run release` is clean.
  - `claude plugin validate .` passes.
  - A clean-profile install from the local marketplace path → `/build-with-me` → setup check green → server answers.
  - The README's commands match the real ones.
  Learner check: Follow the README yourself as if you were another parent (with the separate profile I set up). Is anything unclear?
  Commit: `Release build, parent README and clean install`

## Hands-on Checkpoints

- [x] Early usable behavior explored — after slice 5: a kid talks through to Tech plan on the tablet (your "minor tweaks" feedback shapes slices 6–9)
  - Feedback (2026-10-06): slow but expected (E3 measures it); the device voice is good enough for the POC; "open on this laptop" was hard to find; opening on the laptop through the home address asked for the certificate; the first spoken word was cut; a terminal flashed; wanted a way to stop the automatic mic and type.
  - Fixed: a real "Open on this laptop" button and a code box that survives reloads; this laptop's home address goes to localhost; the voice starts 500 ms later; the `where claude` lookup runs hidden; a "⌨️ Type instead / 🎤 Talk instead" switch, saved on the project.
- [x] Final kick-the-tires exploration and feedback completed — covered by the Final Review below (learner confirmed 2026-10-07)

## Final Review

- [x] Final review complete — feedback resolved and learner confirms ready to ship (2026-10-07: "I'm ready for the next step", after the third round of reviews came back "safe to install")

Feedback and fixes (final review, started 2026-10-07):
- [x] The ⏻ Stop button was out of sight inside Settings: moved to the top of the Parent area; then replaced (below).
- [x] Learner decision: **keep the window open.** Closing the PIN page or the Parent area stops the app about a minute later; both say so in bold; kids' screens show a countdown; the Stop button is gone; missed reports are written at the next start. Built and checked (`verify:revisions` 42/42, live on a launcher-style test server). Waiting for the learner to retry it on the real app.
- [x] Three more safety reviews (learner request): fixed priorities 1-3, see `spec.md > Safety Review Round` (`verify:revisions` 60/60, `verify:security` 23/23).
- [x] A second round of three safety reviews (learner request): fixed priorities 1-2, priority 3 deferred (see `spec.md > Safety Review Round 2`, `verify:revisions` 67/67). The README's "check it before you install" prompt is now a short is-it-safe check, not a full audit (learner request).
- [x] Install check (learner request): three runs of the README's "is it safe to install?" prompt on a fresh clone, all "safe to install"; the one note (any `node` command was pre-approved) is fixed: only the plugin's own scripts are.
- [x] Real-device items (talking in a quiet room, Show me ideas mid-step, two rounds of changes, the build view): the learner moved on to the next step without reporting further problems.

## Code Tour and App Map

- [x] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [x] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [x] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: map generated from commit 55e8013; paths and symbols checked against the source; rendered in the browser pane (no sideways scroll). Learning link: the profile's goal, the pros, cons and limits of running a local copy (the map's "Local versus hosted" section, each point tied to code).
Route and stops: reference route only (the map's three stops); the learner skipped the tour.
Edit outcome: not done (tour skipped).
Reflection: answered (kept in the private learner profile).
Activity mode: brief recap through the app map (not hands-on).

## Revisions

- **The app needs the standalone Claude Code CLI signed in once (`claude` → `/login`).**
  - What the build found: on this machine, Claude Code exists only inside the Claude desktop app. There's no `claude` on PATH, and the bundled binary reports "Not logged in," because the desktop app signs in for its sessions on its own side.
  - What changes: `setup-check` detects a missing or signed-out CLI, and the setup skill offers the official installer and walks the parent through `/login` (Anthropic's own flow).
- **The server and every `claude` it runs start with a cleaned environment** (no `CLAUDE_*` / `ANTHROPIC_*` variables).
  - What the build found: a process launched from a desktop Code session inherits the desktop's sign-in proxy settings.
  - What changes: kids' sessions must never ride on the parent's live desktop session. They use only the CLI's own sign-in.
- **Isolation needed `--safe-mode` and a privacy guard on top of the planned flags.**
  - What E1 found:
    - Claude Code's built-in plugins still loaded.
    - Claude Code adds the account email, the working folder and the OS to the background, with no switch to remove the email.
  - What changes:
    - The runner adds `--safe-mode` and the CLAUDE.md, memory and git disable settings, plus `IS_DEMO`.
    - The work folder lives outside any git repo.
    - Every prompt gets a privacy rule, and every output is scrubbed of emails and user folders (`server/claude/guard.ts`).
- **Speech-to-text uses Moonshine base instead of Whisper base** (same Transformers.js, same on-computer approach).
  - What E2 found: on the learner's laptop, Whisper always processes a padded 30-second window, so a short sentence still took about 2.7 s, and more threads made it slower. In `scripts/whisper-bench.ts`, Moonshine base got the same 16/16 words in about 1.3 s.
  - What changes: Whisper stays selectable with `BWM_SPEECH_MODEL`.
- **The talk-test page has no pass check yet.** The parent gate arrives in slice 3 and passes in slice 4. The page is replaced by the real kid screens in slice 5.
- **The tablet certificate works, but Android installs it only from inside Settings,** not by tapping the downloaded file.
  - What E2 found: the learner confirmed no warnings and a working microphone after installing it from Settings. They found the steps "very not intuitive."
  - What changes: the setup page now gives the exact Settings path, and a friendlier guided setup is being decided with the learner.
- **The start command is `/build-with-me:start`, not `/build-with-me`.**
  - What the build found: Claude Code always prefixes plugin commands with the plugin name. Typing `/build-with-me` autocompletes it. The files are `commands/start.md`, `commands/reset-pin.md` and `skills/setup/SKILL.md` (`/build-with-me:setup`).
- **The app runs from a "runtime" copy inside the plugin's private folder** (`${CLAUDE_PLUGIN_DATA}/runtime`: the built app plus `npm ci --omit=dev`).
  - What the build found: the bundled server must find its packages, and the plugin folder itself moves on every update and shouldn't hold state.
  - What changes: `setup-check --install-packages` refreshes the runtime when the version changes. The desktop start file reads `.app-location.json` in the family folder, so it survives updates.
- **Plugin data paths contain `.claude`, and the web server refused to serve files under dot-folders** (the learner's first browser view was "Not Found").
  - What changes: files are now always sent relative to a root folder, raw error pages are replaced by a friendly page, and `verify-3` runs from a dot-folder path.
- **Updates are automatic:** each build carries an id, and `launch.mjs` refreshes the runtime copy and restarts an outdated server.
- **The desktop shortcut is created automatically** (learner request) on the *real* Desktop, found by asking Windows, since it may be redirected to OneDrive.
- **The family data lives in `<home>\Build With Me`, not Documents** (learner decision).
  - What the build found: on the learner's PC, Desktop and Documents are redirected to a work OneDrive. Kids' data must never sync to any cloud.
  - What changes: the launcher moves an old Documents folder once, if one exists.
- **The home certificate moved to the family folder, and the tablet screen explains itself** (learner test).
  - What the build found: the installed plugin made a new certificate in its own folder. The learner's phone trusted the one from the speech test, which has the same name, so the Check said "Not yet." A reinstall would do the same to every family, because uninstalling deletes the plugin folder.
  - What changes: one certificate per family, in `.home-certificate/`, reusing the oldest one already on the computer. New ones carry a date in their name. The wizard names it and says "Not secure" is expected there. The parent's tablet screen explains what, why and how in plain bullets, including the browser's "doesn't support a secure connection" warning.
- **Kids' own laptops and Chromebooks can join, not only tablets** (learner decision).
  - What changes: the setup wizard adds Windows, Mac and Chromebook steps, with auto-detection and the dictation shortcut as a fallback. Slice 4 adds a short typed pass code next to the QR code, because laptops can't scan. School-managed Chromebooks usually block certificates, so they fall back to dictation.
- **Opening a pass takes one tap, and opening it on the laptop locks the parent area** (slice 4, internal).
  - What the build found: a link that uses itself up on load can be spent by a link preview or a browser prefetch, and a kid on the laptop would be one tab away from the unlocked parent area.
  - What changes: `/p/<code>` shows whose pass it is with a **Start** button. "Open on this laptop" ends the parent session in that browser. Passes and kid requests only work from the laptop or the home network.
- **The course skills are MIT-licensed now** (found during slice 5).
  - What the build found: Build With Me had found no license, so it kept the skill text private. The learner heard from Devpost, and the check confirmed it: `challengepost/learn-ai-basics` added an MIT license on 2026-10-05, and the local copies match it byte for byte.
  - What changes: `app/skills/` holds the five stage folders unchanged, with Devpost's LICENSE and a README. The build copies them next to the server.
- **The guide runs one call per turn, not one long-lived process per session** (slice 5, internal).
  - What the build found: the ported turn logic asks again with app notes, writes plans in a separate call, and changes the system prompt at every stage. A single long-lived conversation can't do that cleanly.
  - What changes: each guide, plan-writer and checker call is one sealed-off `claude -p` run with the stage's prompt (the same for every turn of a stage, so Claude Code caches it) plus the conversation as JSON. System prompt files are named by content, so they don't pile up. E3 measures the cost.
- **Talking in the journey uses the computer's own speech-to-text** (slice 5, internal).
  - What the build found: Build With Me's talk button used the browser's speech recognition, which sends audio to an outside service. That breaks "kids' voices stay in the house."
  - What changes: the same talk button now records on the device and the family's computer turns it into text (slice 2's Moonshine). The guide's voice uses only the device's voices; the cloud voice is gone. The Nunito font is bundled instead of loaded from Google.
- **The builder keeps Build With Me's plain-text output, and operations merge when they save** (slice 6, internal).
  - What the build found: the ported builder returns a whole HTML page, or find-and-replace edits for changes and fixes, tuned in live testing. A JSON wrapper around a 60 KB page would add nothing. A build runs for minutes while the kid chats or adds changes, so whole-project saves could overwrite each other.
  - What changes: no `--json-schema` for the builder. Every journey operation works on a copy of the project and merges only what it changed (new messages, flags, usage, versions, documents, stage) into the newest file. One build at a time per project, at most 2 across the family.
- **Shipped apps run inside Build With Me's wrapper page** (slice 6, internal).
  - What the build found: an app served straight from the family's address would share that address's browser storage and cookies with the app itself.
  - What changes: the app runs in a sandboxed frame with no origin of its own, under the strict policy; its saved data lives in the wrapper's own key space. Each new version's words also go through the safety check before they're shown.
- **Reports keep the facts even without the review, and the usage note is honest** (slice 7, internal).
  - What the build found: the Opus review is one more Claude call, so it can fail at exactly the wrong moment (a limit just hit). And `/usage` measures the whole account, including the parent's own Claude Code use at the same time.
  - What changes: time, rounds, device, flags, timeline and usage always come from the project; if the review can't run, the report says so and shows the facts. The usage line says that anything else on the account counts too, and which kid's session it was shared with. A `simulate-limit` file in the plugin folder simulates a rejected limit for testing.
- **Mix B is the default, and the experiment changed how a "fork" check is built** (slice 8).
  - What the build found: Claude Code turns `--json-schema` into a tool, and tools come first in the prompt cache, so a check with its own reply format can't read the guide's cache at all. A fork check therefore reuses the guide's exact system prompt and reply schema, asks the check at the end of the conversation, and returns its verdict as JSON in the "say" field. Plan % (`/usage`) shows whole percents only, so the mixes were compared by Claude Code's cost estimate and speed.
  - What changes: the learner chose mix B for speed (8.1 s per turn against 12.4 s for A, at 31% more cost; 2–3% of the 5-hour limit per app either way). The mix is one setting (`DEFAULT_MIX`, or `BWM_MIX`). Checks with no conversation (the app's words, the edit check) use the same Sonnet model.
- **Reports show the app's own share of the plan, and keep their data out of the Reports folder** (after slice 8, learner request).
  - What the build found: `/usage` is one number for the whole account, so the parent's own Claude use landed in a kid's report; an app started before plan usage was measured fell back to tokens and dollars; and `reports\` (data) and `Reports\` (the parent's files) are the same folder on Windows and macOS.
  - What changes: the report shows "≈x% of your 5-hour limit: this app's own use", from the app's own calls at a rate learned on the family's plan (seeded from E3, refined by cleanly measured reports), next to the whole account's change, and says when other use was mixed in. Older projects get a usage reading on their next turn. No dollars anywhere. Report data moved to `report-data\`, with a one-time move and upgrade of existing reports.
- **Kid screens fit phones and tablets, the countdown moved to the top bar, and contrast is fixed** (after slice 8, from the independent UI review in `devpost/ui-review.md`; the learner chose the four issues to fix before the family trial).
  - What the review found: on a landscape phone the answer box went off screen; on phones and portrait tablets the Build screen put the whole chat between the app and the change box (Ship around y 1,300–1,450); the 10-minute countdown covered Send; white text on four kid themes and on the parent's green buttons was under 4.5:1.
  - What changes: the guide's answer bar is pinned to the bottom below the large layout and the newest message stops just above it; the Build screen is one screen with no page scrolling (app above chat on upright phones, side by side from tablet width); the countdown sits in the top bar; darker accents for Robots, Cars, Music and Sports, darker parent button and pill colors (and dark text on buttons in dark mode). Kid screens size themselves from the top bar's real height. Checked silently on a seeded test copy at 390×844, 844×390, 820×1180 and 1180×820. The rest of the review waits for the revision round with the family's comments.
- **Security audit fixes, step 1** (after slice 8; the audit is `devpost/security-audit.md`, run by the learner in a separate session).
  - What the audit found: a web page open in the parent's browser could reach the parent area by pointing its own domain at the laptop (DNS rebinding); one pass had no limit on what it could spend; removing a kid left all their data on disk; talking accepted anyone on the laptop without a pass; and a list of smaller hardening items.
  - What changes: the server answers only to this computer's own names; per-pass limits (10 Claude requests a minute, 150 an hour, 5 new apps, 30 builds); removing a kid deletes all their data after a red warning where the parent types the kid's name (learner request: "ensure there is a clear warning"); talking needs a pass; a `Secure` pass cookie on tablets; plus the quick Low items (scrub, `claude` lookup, logs, app checks, prompt-file cleanup, cloud-folder guard). The PIN lockout stays as it is (the audit's suggested change would have defeated it). `npm run verify:security` checks them (23/23).
  - Left for slice 9: the username and home IP in tracked files and git history (C9a: rewriting history needs the learner's go-ahead) and the README, LICENSE, SECURITY.md, privacy section and 18+ note (C9b). The remaining Low and Info items are listed in the audit's fix status.
- **Revision round after the family trial** (learner decisions in `devpost/ui-review.md > Family trial notes`; built in six verified, committed batches).
  - What the trial found: ideas asked "for later" in the waiting chat were lost; "New app" after shipping showed a wrong message in a browser popup; kids got stuck at the Idea stage; teens saw whole Markdown plans with a download and no direction to read them; "Building…" ran for minutes with nothing to learn from; every app showed the theme's emoji; the tablet "Not secure" note.
  - What changes: waiting-chat ideas are kept and offered as cards; an honest in-app "New app" dialog; **💡 Show me ideas** from a 128-idea library (light stuck trigger, glow and a gentle question in talk mode, picking starts the customizing); a short teen plan card with 👍/✏️ and **📄 How I planned it** in My apps; a teaching progress view from the builder's streamed text with the kid's own build steps ticking off; each app's own drawn icon with 🎲 Try another at Ship; and the rest of the UI review (first-run Claude Code check, no browser popups, keyboard access, report and tablet-page fixes, kid-styled pass screens).
  - The PRD's first-run rule stays: setup can't continue until Claude Code is ready.
  - Checked by `npm run verify:revisions` (30/30, no Claude calls), the slice 3 and 4 checks and `verify:security`, and one real build for the streaming. `prd.md`, `spec.md` and their HTML pages are updated.
- **Polish round** (learner notes after trying the revision round; one commit).
  - What the learner found: the step bar's Intro pill and a second "1 · Start" in the chat were confusing; no nudge and no Show me ideas at the first question; an empty picture pane took half the screen and the idea cards didn't fit; after picking Dot to Dot, asking for secret-picture ideas showed new apps; the PIN screen and parent home needed scrolling.
  - What changes: a six-step bar in its own header band (no Intro, ✓ on finished steps); Show me ideas and the glow from the first question, with app ideas only while the app is being chosen and ideas for the current question after that; the picture pane only when there's something to show; the PIN screen and parent home fit one laptop screen.
  - Checked by `npm run verify:revisions` (32/32), the slice 3 and 4 checks, `verify:security`, the guard tests, and the screens on a silent test server at laptop and phone sizes. The guide's real ideas for a question still need a real try.
- **Slice 9: release, README and the private repo** (learner decisions: rewrite history before the first push; start private at github.com/paveliko123/build-with-me-at-home, go public later).
  - History: the Windows username and the home IP were replaced in all 40 commits (`git filter-repo --replace-text`, backup bundle kept); nothing else private was found in any commit (no kids' names, the learner profile and `.claude/` never committed). Audit C9a done.
  - `npm run release` (type-check, the free checks, build, private-data scan of `app/dist`); `app/dist` is committed. README for parents, LICENSE (MIT; the course skills keep Devpost's MIT), SECURITY.md, privacy section and the 18+ note (also said by the setup skill). Audit C9b done.
  - Found in the clean-install test: the launcher stopped with "run setup" after an update that changed packages; it now refreshes them by itself (stopping the old server first, since Windows locks its files). The short `user/repo` install form clones over SSH and failed without GitHub SSH keys; the README uses the full `https://` address. A Node warning in the setup output is gone.
  - Verified: `claude plugin validate .` passes; a clone installed into a separate Claude Code profile ran the setup check, installed packages, started at first-run setup on its own port, and refreshed packages after a pretend update; an install straight from the private GitHub repo over HTTPS brought the latest commit with the built app and without private files.
  - The running app is a runtime copy (in the plugin data folder) refreshed only when it starts; a build in the repo never touches it.
  - Learner check: the learner read the README on GitHub as another parent would and asked for a nicer layout (contents, icons, sections), the safety system and the report's safety level, the Claude membership, "fully local" at the top, the 18+ terms in bold, and an optional review by the parent's own Claude before installing.
  - Pre-install review, run three times in fresh read-only sessions with the README's prompt: "looks safe" every time. Fixed from its findings: a ⏻ Stop Build With Me button (it keeps running after Claude Code closes), the README on network exposure, automatic calls, downloads and the certificate's real location, the early-version folder move removed, and (learner decision) a safety check that can't run now holds the message back instead of letting it through. Also from the README review: an instant wellbeing alert, and kids' apps can't open a website.
  - Moved to 6-ship: rehearsing the demo run-through, done together with recording the video once the app stops changing.
- **Next version idea (not in the proof of concept): match the app to the thumbnail's look.**
  - What came up (6-ship, 2026-10-07): the Devpost thumbnail uses a teal, orange, and navy palette with a paper/felt style.
  - What it would take: the colors are a small token change in `web/src/index.css` (the font is already rounded Nunito); the textured look needs artwork per screen and readability checks. Deferred: the hackathon asks for a proof of concept.
- **Claude Code's sign-in can run out: the parent gets told, and signs in again with a button.**
  - What the trial found (6-ship, 2026-10-19): the guide went silent on the tablet. The server log showed `OAuth session expired and could not be refreshed` on every call; the kid saw nothing useful and the parent wasn't told.
  - What changed: an expired sign-in is recognized on every Claude call (`server/claude/signin.ts`). The kid sees "Your grown-up needs to fix something on the computer… Your work is saved." The parent gets one 🔐 "Claude needs you to sign in again" alert with a **Sign in to Claude** button that runs Claude Code's own `claude auth login` (Anthropic's page opens in the browser, with a link and a code box as fallbacks), no terminal. Signing in clears the alert.
  - Checked: `verify:revisions` 73/73 (simulated sign-out: kid message, one alert, button, kids can't press it), `verify:security` 23/23. The real sign-in flow is for the learner to try.
- **Commit history cleaned before going public (owner yes D-1, 2026-10-22).** The "Co-Authored-By: Claude" line was removed from every commit message (no AI author credits); the code in every commit is unchanged. A local backup branch, `backup/before-trailer-cleanup-2026-10-22`, keeps the old history on the laptop only.
- **Repository made public for feedback (owner yes D-2, 2026-10-22):** https://github.com/paveliko123/build-with-me-at-home (checked signed out: the page and README open).
- **Judges try it through a link to this laptop for a set window (owner yes D-3, 2026-10-22).** Found while starting: the app's own address check answers a tunnel with "This address is not Build With Me" (security audit H1), and making the tunnel look like the laptop would open the Parent area to the internet. So the link needs a small, reviewed "demo link" change first.
- **Tunnel dropped; judges get a landing page with a click-through demo instead (owner yes D-4, 2026-10-22; replaces D-3).** The demo is the real web screens built with canned answers in place of the server ("real screens with fake data"), not hand-drawn mockups. Plan: `devpost/demo-plan.md`.
- **Judges' demo is one hand-made mockup page with transitions, not the real screens (owner yes D-5, 2026-10-22; reverses D-4, "quick and simple").** `site/index.html`: landing section plus about seven mock screens, no server, no app code touched. `devpost/demo-plan.md` is set aside. Publishing on GitHub Pages is a separate yes.
- **Demo published on GitHub Pages (owner yes, 2026-10-22).** https://paveliko123.github.io/build-with-me-at-home/ serves `site/` through `.github/workflows/pages.yml`, which redeploys on every push to `main` that touches `site/`. The demo is now 11 screens.
- **Kids' and teens' "About you" gets its own short template (owner yes D-3, 2026-10-22).**
  - What the learner found: the Start page used the adults' hackathon profile template, so kids' pages were mostly "Not discussed" (kids get at most two questions at Start, by design).
  - What changed: for kids and teens, Start uses `server/journey/prompt/youngProfile.ts` (age group and experience, look, what they like, starting idea, what they'd like to learn if said, notes); sections with nothing to say are left out. Adults keep the course template. The two-question limit and safety rules are unchanged.
  - Checked: one real kid and one real teen Start session (full pages, no "Not discussed"), `verify:revisions` 73/73, `verify:security` 23/23.
  - The same leftovers in the later plans: fixed below (D-5).
- **Kids' and teens' Idea, Design and Tech plans get their own templates (owner yes D-5, 2026-10-22).**
  - What the review found (10 real projects): adult hackathon sections came out "not discussed", stock lines or empty (for example 9 of 10 Design plans ended in a "not discussed" list; Stack and File structure were stock or empty).
  - What changed: the "write 'not discussed'" rule became "leave the section out; list open items once" (all ages). Kids and teens use `server/journey/prompt/youngPlans.ts` for Idea, Design and Tech plan; adults keep the course templates. Question counts, safety rules, the builder and the checklist are unchanged.
  - Checked: a real kid (new to this) and teen (So-so) session through the Tech plan: 0 "not discussed", only filled sections, the plan cards still find their points; the kid's plan built cleanly (no app-check problems). `verify:revisions` 73/73, `verify:security` 23/23.
- **A kid with no idea gets a plain, friendly start to the Idea step (owner yes D-8, 2026-10-22).**
  - What the learner found: a kid who said nothing useful at Start heard "That's enough for me", then "Welcome to the Idea step!" and an open "what app would you like?" question.
  - What changed: two rules for kids and teens in `server/journey/prompt/dial.ts`. Start closes warmly and plainly when they gave little. The first Idea reply, when the profile says no idea yet, is one plain line plus two idea cards, with no step or stage names. A kid who already has an idea gets the normal question.
  - Checked: four real runs (kid with no idea twice, kid with an idea, teen with no idea): cards at once for the three no-idea cases, a normal open question for the kid with an idea. `typecheck` clean, `verify:revisions` 73/73.
- **The guide's voice no longer swallows the first letter (owner yes D-9, 2026-10-22).**
  - What the learner found: on the laptop the first letter of the spoken reply was still cut, even with the half-second wait added on Oct 6.
  - What changed: `web/src/kid/journey/lib/voice.ts` plays a barely audible 0.3-second blip first to wake sleeping speakers, and starts the sentences when the silent warm-up has finished (at least half a second, at most 1.5 seconds). Nothing about the words changed.
  - Checked: `typecheck` clean, `verify:revisions` 73/73, built. Not checked by ear: needs the learner's test on the laptop after a restart.
- **Idea cards were removed by the server; plan card lines stopped mid-sentence (fixed 2026-10-25, small fix under D-8).**
  - What the learner found (teen, piano app): the first Idea reply said "here are two small ideas" with no cards; later "Which of these sounds better?" also came with none. The plan card cut "Leaving out for now" mid-sentence.
  - Cause: `cleanReply` in `server/journey/guideTurn.ts` always removed cards from the first Idea reply, and at So-so removed them unless the person sounded unsure. The D-8 runs checked the guide's raw reply, not this filter, so D-8 only half worked until now. The plan card cut every line at 140 characters.
  - What changed: kids' and teens' first Idea reply and a So-so "Which of these?" reply keep their cards (adults' first Idea reply stays open). Plan card lines keep whole sentences up to 240 characters.
  - Checked: `typecheck` clean, `verify:revisions` 79/79, `verify:security` 23/23.
- **The guide stops asking the same thing twice (owner yes D-10, 2026-10-25; build pending).**
  - What the learner found: "…Which one sounds more fun?" followed by "Which idea sounds more fun to you?" (read aloud twice), and plan drafts asking four ways ("ready to look at", "Does this look right?", the buttons, the box hint).
  - Agreed: the app drops a final question or "Pick…" sentence from the message when a question card is also shown; the So-so and Experienced instructions no longer tell the guide to say the plan is ready to look at, only to ask whether it looks good.
