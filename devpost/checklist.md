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

- [ ] **5. A kid talks through Start → Idea → Design → Tech plan, with live safety checks**
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

- [ ] **6. Build, change and ship an app onto the kid's My apps shelf**
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

- [ ] **7. The parent gets a report for every app, with flags, plan usage and alerts**
  Becomes usable:
  - When an app ships, or an unfinished pass ends, Opus writes the report. It appears in the parent home's Latest reports and in All reports, and as a self-contained HTML file in `Documents\Build With Me\Reports` that opens without the app.
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

- [ ] **8. Choose the model mix with real usage numbers (E3)**
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

- [ ] **9. A parent can install it from GitHub using only the README**
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

- [ ] Early usable behavior explored — after slice 5: a kid talks through to Tech plan on the tablet (your "minor tweaks" feedback shapes slices 6–9)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence:
Route and stops:
Edit outcome:
Reflection:
Activity mode:

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
