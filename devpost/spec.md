---
doc: spec
status: approved
---

# Build With Me at Home — Technical Spec

Implements `prd.md` (approved 2026-10-06). It reuses Build With Me's kid screens and prompt layers. The cloud back office (Firebase, Firestore, API key) becomes one small program on the family's computer that talks to the parent's own Claude Code.

## How This Works, In Plain Language

The app has five pieces, all on the parent's computer:

1. **The Claude Code plugin** (the *delivery box*). The parent adds it to their Claude Code from the public GitHub repo. It carries:
   - the whole app
   - a **setup skill**: Claude checks what's missing (Node.js, the speech model, and so on), fixes it using the parent's normal approval prompts, or explains the steps in the chat
   - a `/build-with-me:start` command that starts the app
2. **The server** (the *back office*). A small **Node.js** program, the same kind of code as Build With Me's Cloud Functions, now running on the laptop. It:
   - shows the screens to the laptop's browser and to tablets on the home Wi-Fi
   - keeps the PIN, kids, passes, projects, apps and reports in **plain files** in `<home>\Build With Me`
   - turns kids' speech into text **on this computer** (Whisper), so voices never leave the house
   - asks Claude to guide, check, build and report
3. **The parent's Claude Code** (the *brains*). The server runs the parent's own `claude` program in the background ("non-interactive mode"), one conversation per job:
   - the **guide** (Sonnet), which talks with the kid
   - the **checker** (Haiku), which reads every turn for anything unsuitable or personal
   - the **builder** (Opus), which writes the kid's app
   - the **reporter** (Opus), which writes the parent report

   Each one is **sealed off** from the parent's own setup: no tools, no files, no plugins, no CLAUDE.md. It's just a conversation, and it uses the parent's sign-in. The app never sees the sign-in itself.
4. **The screens** (the *front end*). Build With Me's React screens for the kid, plus new parent screens (PIN, parent home, reports) built from the approved mockups.
5. **The home certificate** (the *tablet key*). The app makes its own small security certificate, made once on the parent's computer. The parent installs it on a tablet once, so the tablet trusts the computer and the microphone is allowed.

**Why this shape:**
- The kid journey already works, so we keep its screens and prompts and change only what the cloud did.
- Everything stays in files on one computer, with no accounts, databases or keys.
- Every Claude call goes through the parent's own unmodified Claude Code, which the terms allow.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.

**Install (once).**
1. The parent pastes the install line from the README into Claude Code. Claude adds the repo as a plugin source and installs `build-with-me` (two short commands).
2. The parent types `/build-with-me:start`. The setup skill runs `setup-check.mjs`, which reports the following as JSON:
   - the Node version
   - `claude` signed in
   - the app's packages
   - the speech model
   - the port
   - the data folder
   - the firewall note
3. Claude fixes each gap: packages and the model download into the plugin's private folder, and Node is installed with `winget` or `brew` (after the parent approves) or explained. Then it runs `launch.mjs`.
4. `launch.mjs` starts the server in the background (it keeps running after Claude Code closes), writes a stable start file, offers a desktop shortcut, and opens `http://localhost:4747`.
5. The browser shows **First-Run Setup**: create the PIN, then add kids. `family.json` is written.

**Every time.**
1. The parent double-clicks **Build With Me** on the desktop. The start file runs `launch.mjs` (it starts the server if needed) and opens the browser.
2. **Opening:** the note, PIN and Enter. The server checks the PIN against the stored hash and sets a parent cookie that's valid only on this laptop.
3. **Give a pass:** the parent picks Maya and 1 hour. The server writes a pass to `passes.json` with a random one-use code. The screen shows a QR code for `https://<laptop's home address>:4748/p/<code>` and an "open on this laptop" link.
4. **The kid scans it:**
   - The tablet opens the link. The server checks the code is unused and unexpired, marks it used, records the device, and sets a **pass cookie**.
   - From now on, that browser is Maya's for an hour.
   - A second scan gets "already used."
5. **Welcome, Theme, then Start → Tech plan.** Each turn:
   1. The kid talks. The browser records and streams audio to the server, and **Whisper turns it into text** on the laptop.
   2. The obvious personal details are masked instantly.
   3. **At the same time:** the **guide** gets the turn, and the **checker** judges the kid's words.
   4. If the checker objects, the guide's reply is thrown away, the kid gets a gentle redirect, and a **flag** is saved.
   5. The checker reads the guide's reply.
   6. The reply goes to the screen, and the browser speaks it with a device voice.
   7. Every turn, plan and flag is saved in the project file, so nothing is lost if the pass ends.
6. **Build:**
   - The **builder** gets its instructions plus the Idea and Design plans and returns one self-contained HTML file, which is saved as a version.
   - The ⅔ pane shows it in a sandboxed frame. Change rounds repeat this.
7. **Ship:** the kid names the app. It's copied to `kids/maya/apps/space-cat-feeder/index.html` and served at `/apps/maya/space-cat-feeder`, along with its QR code.
8. **Report:**
   - The **reporter** gets the whole transcript, the flags, the timeline and the usage numbers, and returns the report content as JSON.
   - The server fills the report template and saves `Reports\2026-10-06 Maya - Space Cat Feeder.html` plus its data.
   - Parent home shows it, and **Needs your attention** shows it too if there are flags.
9. **Time:**
   - The server keeps each pass's end time and pushes updates to every open screen.
   - At 10 minutes left the kid sees the countdown. **+30 min** on the laptop updates it immediately.
   - At zero the kid screen shows Time's up. A running build is allowed to finish and save.

## Stack

| Piece | Choice | Why | Docs |
|---|---|---|---|
| Runtime | **Node.js 22+** | Learner decision: required, checked and installed or explained by setup | [nodejs.org](https://nodejs.org/en/download) |
| Language | TypeScript, compiled to JavaScript before release | Same as Build With Me | [typescriptlang.org](https://www.typescriptlang.org/docs/) |
| Server | **Express 5** (HTTP on the laptop, HTTPS for the home network) | Small, well known; replaces Cloud Functions with plain routes | [expressjs.com](https://expressjs.com/) |
| Live updates | **Server-Sent Events** (built into browsers) | Pushes countdowns, pass changes and build progress without extra libraries | [MDN: EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) |
| Front end | **React 19 + Vite + Tailwind 4**, copied from Build With Me | Reuse the approved kid design | [react.dev](https://react.dev/), [vite.dev](https://vite.dev/) |
| Claude | The parent's **Claude Code CLI**, `claude -p` with stream-json | The terms allow an unmodified Claude Code signed in with the user's own subscription | [Headless mode](https://code.claude.com/docs/en/headless), [CLI reference](https://code.claude.com/docs/en/cli-reference) |
| Speech to text | **Moonshine base** (MIT) through **Transformers.js** in Node (`@huggingface/transformers`); Whisper `base.en` selectable | Runs locally; pure npm install; no Python. E2: 16/16 words, about 1.2 s wait on the learner's laptop (Whisper about 2.7 s). Accuracy on kids' voices is checked on the tablet | [Transformers.js](https://huggingface.co/docs/transformers.js), [Moonshine](https://huggingface.co/onnx-community/moonshine-base-ONNX) |
| Voice out | The browser's **speechSynthesis** with the device's own voices | No keys, works on laptop and tablet, stays local | [MDN: SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) |
| QR codes | `qrcode` (already used in Build With Me) | Reuse | [npm: qrcode](https://www.npmjs.com/package/qrcode) |
| Certificates | `@peculiar/x509` (or `node-forge`) to make the home certificate | Makes a certificate restricted to the home's addresses | [@peculiar/x509](https://github.com/PeculiarVentures/x509) |
| PIN | Node's built-in `crypto.scrypt` | Hashed PIN, no extra library | [Node crypto](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback) |
| Packaging | A **Claude Code plugin** and marketplace in the same GitHub repo | Learner decision: the target parent already uses Claude Code | [Plugins reference](https://code.claude.com/docs/en/plugins-reference) |

**Models (starting setup, to be confirmed by the usage experiment):**
- guide: `sonnet`
- checker: `haiku`
- builder: `opus`
- reporter: `opus`

These come from Build With Me's model comparison. See **Usage Experiment**.

**Unverified, so check these early:** the `--json-schema` + stream-json combination, isolation from the user-level CLAUDE.md, `/usage` output in `-p` mode, Transformers.js Whisper speed on the test laptop, and iPad and Android certificate install steps. Each is a step in **Build Order and Early Experiments**.

## Where It Runs and How Someone Tries It

- **Runs on:** the parent's Windows or Mac computer, with Node.js 22+ and the **standalone Claude Code CLI** (`claude`) installed and signed in (any plan that includes Claude Code).
  - The Claude desktop app's Code tab doesn't count. It doesn't put `claude` on PATH, and its sign-in isn't usable by other programs.
  - Setup offers the official installer and walks the parent through `/login` once (see `checklist.md > Revisions`).
- **Kids use it from:**
  - the laptop's browser at `http://localhost:4747`
  - a tablet on the same Wi-Fi at `https://<laptop's home address>:4748`
- **Install:** paste the README's install line into Claude Code, or run the two commands yourself:
  ```
  /plugin marketplace add <github-user>/build-with-me-home
  /plugin install build-with-me@build-with-me-home
  ```
  Then type `/build-with-me:start`.
- **Start later:** the desktop shortcut, or `/build-with-me:start`.
- **Development (the learner's machine):**
  ```bash
  npm install
  npm run dev
  ```
  This runs the server (`:4747`) and the Vite front end with hot reload. Test the plugin locally with `claude --plugin-dir .`.
- **Release:** `npm run release` builds the front end and the server into `app/dist/`, which is committed so families never need a build step.
- **Demo recording:** the laptop screen (parent home, give a pass, the QR code) side by side with the tablet (scan, talk, build, ship), then back to the laptop for the report. A local app is fine for the required video.
- **Submission:** a public GitHub repo (the plugin repo itself) plus the short demo video. **No deployment.** Hosting is deferred (`prd.md > Deferred From the POC`).

## Look and Feel
PRD ref: `prd.md > Look and Feel`.
- **Kid side:** Build With Me's existing Tailwind styles, themes and components, copied as is. Nothing new to design.
- **Parent side:** follows `devpost/parent-mockup.html` and `devpost/report-mockup.html`:
  - **Colors:** warm off-white `#f6f4ef`, cards `#fff`, ink `#1f2430`, muted `#5d6475`, green accent `#2f9e6e`, kid blue `#3a8ee2`, teen purple `#8a5cd6`, amber for flags, red for blocks, each with a dark-mode partner
  - **Shapes:** rounded 14–16px cards, pill badges, emoji section icons
  - **Type and tone:** the system font stack, plain friendly words, numbers in tabular figures
  - The report HTML file is **self-contained** (inline CSS), so it opens from the folder without the app.

## Components

### Plugin and Setup
Implements `prd.md > Installing and Updating`, `prd.md > First-Run Setup`.
- `.claude-plugin/plugin.json` (name `build-with-me`) and `.claude-plugin/marketplace.json` at the repo root. The repo is its own marketplace.
- **`/build-with-me:start` command** (`commands/build-with-me.md`): tells Claude to run the setup skill if `setup-check.mjs` reports problems, otherwise to run `launch.mjs` and report the address. It stays short to keep the parent's usage low.
- **Setup skill** (`skills/setup/SKILL.md`): runs `node "${CLAUDE_PLUGIN_ROOT}/app/setup-check.mjs"` and then fixes each item:
  - **Node 22+ missing or old:** offer `winget install OpenJS.NodeJS.LTS` (Windows) or `brew install node` (Mac) through the normal permission prompt. Otherwise explain the official installer.
  - **App packages:** run `npm ci --omit=dev` into `${CLAUDE_PLUGIN_DATA}` (kept across updates). This happens automatically.
  - **Speech model:** run `setup-check.mjs --download-model` to fetch it into `${CLAUDE_PLUGIN_DATA}/models`.
  - **`claude` missing from PATH:** common for desktop-app-only parents. Offer Anthropic's official installer (`irm https://claude.ai/install.ps1 | iex` on Windows, `curl -fsSL https://claude.ai/install.sh | bash` on Mac) through the normal permission prompt.
  - **`claude` not signed in:** explain that the parent runs `claude` in their own terminal and types `/login`, which uses Anthropic's own sign-in page. The app and the setup skill never touch credentials.
  - **Firewall (Windows):** explain that Windows will ask once to allow Node on **private** networks, and that tablets need it.
  - **Port taken:** the check suggests the next free port and saves it to `settings.json`.
- **`launch.mjs`:**
  - starts the server detached (if not already running), using the `node_modules` in `${CLAUDE_PLUGIN_DATA}`
  - writes `<home>\Build With Me\.app-location` with the current plugin root, which moves on every update
  - writes the stable start file `Start Build With Me.cmd` (Windows) or `Start Build With Me.command` (Mac), which reads `.app-location`
  - on request, creates the **desktop shortcut** to that start file (a Windows `.lnk` via PowerShell, a Mac alias)
  - opens the browser
- **Updating:** a normal plugin update. The next launch notices a new version, re-runs `npm ci` if `package.json` changed, and restarts the server. Data in `<home>\Build With Me` is untouched.
- **Uninstalling:** removes the plugin and its private folder. `<home>\Build With Me` stays, as the PRD assumed. The README says how to delete it.

### Server Core
Implements the plumbing for every PRD feature.
- `server/index.ts`:
  - **Two listeners:** HTTP on `127.0.0.1:4747` for the laptop, and HTTPS on `0.0.0.0:4748` for the home network.
  - **Static front end:** from `app/dist/web`.
  - **API routes:** under `/api`.
  - **SSE:** at `/api/events`.
  - **Apps:** at `/apps/:kid/:slug`.
- **Who's asking** (`server/auth.ts`):
  - **Parent routes** answer **only on the loopback address**, with a valid parent cookie.
  - **Kid routes** need a valid, unexpired **pass cookie**.
  - **Everything else** gets 401, with a friendly screen.
- **Single instance:** a lock file in the data folder, so a second launch opens the browser instead of starting a second server.
- **Clean shutdown:** running Claude processes are stopped with SIGINT, and the files are flushed.

### Parent Gate
Implements `prd.md > Parent Gate and Responsibility`.
- **The PIN:** 4–8 digits, stored as `scrypt(pin, salt)` in `family.json`. It's never logged.
- **Wrong PIN:** after 5 wrong tries, a 60-second lockout, kept in memory (the PRD assumption).
- **The parent cookie:** `HttpOnly`, `SameSite=Strict`, loopback only. **🔒 Lock** clears it, and so does 12 hours without use.
- **Forgot the PIN:** `/build-with-me:reset-pin` in Claude Code, a small command that clears the PIN hash so the next opening asks for a new PIN. Only someone at the parent's Claude Code can do it. This resolves the PRD open question.
- **Never handles the Claude sign-in:** the server only runs `claude`. It never reads Claude's credential files or tokens.

### Kids and Family Data
Implements `prd.md > Kids`.
- `family.json` holds the kids: id, nickname, Kid or Teen, and emoji. The age group is read **only** from here when a session starts.
- Removing a kid asks for confirmation. Their apps and reports stay in the folder unless the parent picks "also delete their apps."

### Passes
Implements `prd.md > Passes`.
- **Each pass:** `{id, kidId, code, typedCode, createdAt, endsAt, usedAt, device, endedAt}`. The code is 128 random bits (base64url).
- **Opening it:** `/p/:code` shows whose pass it is (`GET /api/pass/peek/:code`, which doesn't use it up, so a link preview can't spend a pass). The kid taps **Start**, which calls `POST /api/pass/open {code}`. If the code is unused and unexpired, the server stores `usedAt` and the device (a friendly label from the browser's user agent, e.g. "iPad," "Windows laptop") and sets the pass cookie: a different random token, stored only as a hash, `HttpOnly`, `SameSite=Lax`, lasting a day past the end so the kid sees Time's up. Otherwise it shows "already used" or "expired." The same device opening it again just goes back in.
- **Open on this laptop:** the same, on `http://localhost`. It also **locks the parent area** in that browser, so a kid is never one tab away from it.
- **Only at home:** opening a pass and every kid request must come from the laptop or a private home address.
- **Typed code (laptops, Chromebooks):** each pass also has `typedCode`, 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as `K7QM-3XPA` (about 40 bits). The kid types it on the no-pass screen, which calls `POST /api/pass/redeem {code}`. It runs the same open logic as `/p/:code`, so either one uses up the pass. 5 wrong codes from one address → a 60-second wait. Only live, unused passes match.
- **Extend and end:** `POST /api/parent/passes/:id/extend {minutes}` and `/end`. Each sends an SSE `pass` event to that kid's screens.
- **Rules:** one live pass per kid. Creating a new one for a kid with a live pass asks "end the old one?"
- **The countdown:** the kid screen shows a countdown when there are ≤10 minutes left. At `endsAt`, the server stops taking new turns for that pass. A **build already running finishes and saves**. The kid screen shows Time's up.

### Kid Journey (ported)
Implements `prd.md > The Kid's Journey`.
- **Copied from Build With Me:** `web/src/screens/*` (Welcome, GuideStage, BuildScreen, ShipScreen), `components/*`, `themes/*`, `lib/speech.ts`, `lib/voice.ts`.
- **Removed:** ParentStep (replaced by passes), the Wallet and allowance strip, Firebase and App Check.
- `web/src/lib/api.ts` is rewritten from Firebase callables to `fetch('/api/...')` plus an `EventSource`.
- **Server side:** `guideTurn`, `startSession`, `getSession`, `changeTurn`, `generateApp`, `edits`, `checklist`, `stages`, `personal`, and the whole `prompt/` folder are ported. Every Firestore read or write becomes a **Store** call, and every Anthropic SDK call becomes a **Claude Runner** call.
- **Removed server code:** `access`, `billing`, `meter`, `pricing`, `appCheck`, `origins`, `publishApp` (hosting), `reportApp`, `speak` (Cloud TTS), and `samples`.
- **The course skills** are copied unchanged into `app/skills/` (the stage instructions), with Devpost's LICENSE. **Verified:** `challengepost/learn-ai-basics` added the MIT license on 2026-10-05 ("Copyright (c) 2026 Devpost"), and the copied SKILL.md files match it byte for byte. The build copies them to `app/dist/skills` next to the server.
- **The kid's app** shows in an `<iframe sandbox="allow-scripts">` served from `/apps/...`, never with same-origin access to the app.

### Claude Runner
Implements the AI behind `prd.md > The Kid's Journey`, `prd.md > Safety`, `prd.md > The Parent Report`.
- `server/claude/runner.ts` starts the parent's `claude` with **isolation flags** on every call:
  ```
  claude -p --safe-mode --input-format stream-json --output-format stream-json --verbose
         --model <sonnet|haiku|opus>
         --system-prompt-file <privacy rule + layer file>
         --tools "" --strict-mcp-config --mcp-config {"mcpServers":{}}
         --setting-sources "" --disable-slash-commands
         --no-session-persistence
  env: CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 CLAUDE_CODE_DISABLE_AUTO_MEMORY=1
       CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1 IS_DEMO=1  (all other CLAUDE*/ANTHROPIC* removed)
  ```
  - **Proven by E1** (`devpost/e1-results.md`, 15/15):
    - no tools, MCP servers, installed plugins, skills or CLAUDE.md
    - multi-turn memory works
    - `--json-schema` works in one-shot and long-lived stream-json conversations
    - Opus is available
    - `/usage` is readable (`Current session` / `Current week` lines)
    - Claude Code's 3 built-in plugins still load, but expose no tools or commands
  - **The account email:** Claude Code adds it to the background by itself, and no switch removes it. So `server/claude/guard.ts` adds a privacy rule to every prompt and **masks any email or user folder** in everything Claude returns. E1 checks that a "kid" asking for the parent's email gets nothing.
  - It runs with its working directory in an empty folder: `${CLAUDE_PLUGIN_DATA}/sandbox`.
  - It runs with a **cleaned environment**: every `CLAUDE*` and `ANTHROPIC*` variable is removed. A server started from a Claude Code session would otherwise inherit that session's sign-in proxy. Kids' runs use only the CLI's own sign-in.
  - It finds `claude` on PATH, then in the official install locations (`~/.local/bin`), with an override setting.
  - The `--setting-sources ""` form and isolation from `~/.claude/CLAUDE.md` are **to verify** in experiment E1. If CLAUDE.md still loads, a fallback is chosen there.
- **One call per turn** (build revision, slice 5): the guide, the plan writer and the checker each run as one sealed-off `claude -p` call with the stage's system prompt (identical for every turn of a stage, so Claude Code's prompt cache reuses it) and the conversation so far as JSON. The ported turn logic asks again with app notes, writes plans in a separate call and changes the system prompt at every stage, which a single long-lived process can't do cleanly. Resume needs nothing special: the transcript is in `project.json`. E3 (slice 8) measures the cost.
  - The checker reads each kid message and each guide reply on its own, as in Build With Me.
- **One-shot jobs:** the **builder** and the **reporter** each start a fresh process per job. The reporter uses `--json-schema` for the report fields. The builder keeps Build With Me's plain-text output (build revision, slice 6): a whole HTML document, or small find-and-replace edits for changes and fixes, checked against the hard rules; what a change left out is found by a separate check and said honestly. Versions are saved as `versions/vN.html`.
- **Structured guide replies:** the guide must return Build With Me's reply shape (say, cards, mock-up, plan). It uses `--json-schema` if that works with stream-json (to verify in E1). Otherwise it's told in its system prompt to answer in JSON, and `replySchema.ts` validates it, with one automatic retry.
- **Limits:** every `rate_limit_event` is watched:
  - `allowed_warning` is recorded.
  - `rejected` triggers **Limit Reached**, keeping `resetsAt`.
  - `api_retry` events with `rate_limit` are treated the same once retries run out.
- **Costs:** `total_cost_usd` and the usage from each result are summed per project for the report fallback.
- **Concurrency:** at most 2 builds at once, with others queued ("Your app is next in line!"). Guide and checker turns run immediately.

### Safety
Implements `prd.md > Safety`.
- **Layer 1, an age-aware guide:** Build With Me's `prompt/safety.ts`, `dial.ts` and `wrapperLayer.ts`, with the age group from `family.json`.
- **Layer 2, the live check** (`server/safety.ts`):
  - `personal.ts` masks the obvious details first.
  - The checker gets "KID SAID: …" at the same time as the guide, then "GUIDE SAID: …" before display. It answers `{ok, kind: unsuitable|personal|offtopic, note}`.
  - **Unsuitable input:** the guide's reply is discarded, and the guide is asked again with a "redirect kindly to a kid-friendly alternative" note.
  - **Unsuitable output:** the reply is regenerated once, and then a safe fallback line is used.
  - Every non-ok verdict appends a **flag** `{time, step, kidSaid, guideDid, kind}` to the project.
- **Layer 3, the report:** described under **Reporter and Reports**.
- **Builder output:** the builder's HTML text also goes through one checker pass before it's shown.

### Speech
Implements `prd.md > Talking`.
- **In the browser** (`web/src/kid/journey/lib/speech.ts`, rewritten over `public/lib/recorder.js`): `getUserMedia` microphone, an AudioWorklet resampling to **16 kHz mono PCM**, sent in ~1-second chunks over `POST /api/speech/:utteranceId`. A quiet-detection step ends the utterance (4 s for kids, 3 s for teens), and there's an "I'm done" button. Build With Me's browser speech recognition (which sends audio to an outside service) is gone.
- **On the server** (`server/speech.ts`): a Transformers.js `automatic-speech-recognition` pipeline with **Moonshine base**, loaded once at startup from `${CLAUDE_PLUGIN_DATA}/models`. Moonshine replaced Whisper after E2 (see `checklist.md > Revisions`). Chunks are transcribed as they arrive, and the final text is returned when the utterance ends. No audio is saved.
- **Voice out:** Build With Me's `voice.ts`, using `speechSynthesis` with a voice chosen per theme from the device's voices and a slower rate for kids. The ⚙️ menu is kept. Neural2 is removed.
- **No microphone, or the tablet isn't set up** (the page isn't secure): the talk button is replaced by the text box with a "tap 🎤 on your keyboard to talk" hint. The parent sees "Set up this tablet for talking" in **Kids & their apps**.

### Home Certificate (tablets)
Implements `prd.md > Talking` (tablet), `prd.md > Product Decisions` (tablet on home Wi-Fi).
- **On first launch,** `server/certs.ts` creates a **home certificate authority**:
  - a key that **never leaves the computer**, stored in the family folder (`.home-certificate/`), so it survives plugin updates and reinstalls. A new authority would silently break every tablet that trusts the old one.
  - named with its creation date ("Build With Me Home (LAPTOP) 6 Oct 2026"), so a parent can tell it apart from an older one on a tablet
  - **name constraints** limiting it to the laptop's private addresses (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) and `*.local`, so it can't vouch for any real website
- **On every start,** it issues a short-lived server certificate for the laptop's current home IP address(es) and hostname. When the address changes, it re-issues, and the tablet keeps trusting it because the authority is the same.
- **📱 Set up a tablet for talking** shows a QR code to `http://<laptop's address>:4747/setup-tablet` (plain HTTP, since there's no certificate yet). That page:
  - detects iPad, Android, Windows, Mac or Chromebook
  - offers the **iPad** profile (`.mobileconfig`) or the certificate (`.crt`) for everything else
  - shows 3–4 picture-free steps ("Settings → General → About → Certificate Trust Settings → turn on Build With Me")

  This one page and the certificate files are the only things served on plain HTTP to the network.
- **The guided wizard** (learner decision after E2: option A, with keyboard dictation as fallback B):
  - `/setup-tablet` is a step-by-step page: platform detection; one step per screen for iPad, Pixel/stock Android, Samsung, Windows (Current User → Trusted Root Certification Authorities, no admin), Mac (Keychain → Always Trust) and Chromebook (Manage certificates → Authorities → Import, "identifying websites" ticked); and a **Check** step. On a failed Check, laptops also get their dictation shortcut. School-managed Chromebooks usually block certificates.
  - The Check loads `https://<laptop>:4748/api/health` with `fetch` (no-cors). If it fails, the certificate isn't trusted, and the page shows which step to redo. If it succeeds, ✅ plus a link to the kid's start page.
  - Silent installs are impossible by OS design.
- **Uninstalling** deletes the authority, and old tablet certificates become useless.
- **Proven first** (experiment E2), with keyboard dictation as the fallback.

### Store (files)
Implements persistence for every PRD feature. See **Data Model**.
- `server/store.ts` reads and writes JSON files atomically (write to a temporary file, then rename), with one write queue per file.
- The data folder is `<home>\Build With Me`: `C:\Users\<name>\Build With Me` (Windows) or `~/Build With Me` (Mac). Not Documents or Desktop, which are often redirected to OneDrive or iCloud (even a work account); kids' data must never sync.

### Reporter and Reports
Implements `prd.md > The Parent Report`, `prd.md > Limit Reached`.
- **Made automatically:** on Ship, and for an unfinished session when its pass ends or is ended and the project wasn't shipped.
- **The input to the reporter:** the transcript (masked), flags, step timeline, change rounds, the device and how they answered, time spent, and the pass length.
- **The output (JSON schema):** `{title, summary, ideasShareKid, ideasNote, flagsAssessment:[…], worthAChat, conversationStarters:[…], okLines:{personal, output, onTopic}}`. "Whose ideas" is labeled an **estimate**.
- **Plan usage** (`server/usage.ts`):
  - Just before the session's first Claude call and just after the report, the server runs `claude -p "/usage"` (same isolation flags) and reads the 5-hour and weekly percentages.
  - The report shows the difference.
  - If two kids' sessions overlapped, the report says "shared with Leo's session" and splits the difference by each session's token share.
  - **If `/usage` can't be read** (E1 decides), the report falls back to Claude Code's token and cost estimate.
  - The parent home's status strip uses the latest `/usage` reading, refreshed when parent home opens (at most once a minute).
- **Rendering:** `server/report/template.ts` builds a **self-contained HTML file** from `report-mockup.html`'s design. It's saved to `Reports\YYYY-MM-DD HHmm <Kid> - <App>.html`, with the data in `reports/<id>.json` for **All reports**.
- **The app picture:** a themed tile with the app's emoji and name (see **What Was Simplified and Why**).
- **Alerts** (`alerts.json`): flags and limit-reached events go to **Needs your attention** until the parent dismisses them.

### Parent Screens
Implements `prd.md > Screens and Layout` (parent side).
- **Screens:** `web/src/parent/Opening.tsx`, `FirstRun.tsx`, `ParentHome.tsx`, `AllReports.tsx`, `ReportView.tsx`, `KidsManage.tsx`, `TabletSetup.tsx`, `Settings.tsx`.
- **The laptop's root `/`** routes to Opening, or to FirstRun when there's no `family.json`. Tablets landing on `/` without a pass see "Ask your parent for a pass 🎟️."
- **Live data:** parent home subscribes to SSE for active passes, steps, alerts and new reports.

### My Apps
Implements `prd.md > My Apps`.
- **Index:** `kids/<kidId>/apps.json` lists `{slug, name, emoji, createdAt, projectId}`. The shelf reads it, newest first.
- **Serving:** `/apps/<kid>/<slug>/` serves `index.html` inside Build With Me's small wrapper page (build revision, slice 6): the app runs in a sandboxed frame with no origin of its own, under a strict Content-Security-Policy (no network, no outside files, no navigation), and its saved data lives in the wrapper's own key space on that device. It needs the laptop or a live pass for that kid. The app's QR code links to it on the home address.
- **Deleting:** **Kids & their apps → Manage** removes the folder and the index entry.

### Usage Experiment
Implements the learner's question about caching and models (see **Decisions and Open Issues**).
- **The script:** `scripts/usage-experiment.ts` runs one scripted kid journey (Kid age group, the same 8 answers, one build and one change round) **three ways**:
  - **A:** a Sonnet guide, Haiku checker, Opus builder
  - **B:** checks as **forks of the guide's conversation** (same model, shared cache)
  - **C:** Opus throughout
- **What it records for each:** the `/usage` 5-hour % before and after, total tokens, cache-read tokens, the `total_cost_usd` estimate, time per turn, and build time.
- **Output:** a short HTML results page in `devpost/usage-experiment.html`.
- **The decision** goes into this spec's **Decisions and Open Issues**. A takes about 5–10% of a 5-hour window per run (estimate), so it runs **when the learner is ready to spend that**.

## Data Model

Everything lives in **`<home>\Build With Me`**, unless noted:

| File | Holds | Updated when | After closing and reopening |
|---|---|---|---|
| `family.json` | PIN hash and salt, kids `[{id, nickname, group, emoji}]`, settings (port) | Setup; Kids & their apps; Settings | Kept |
| `passes.json` | Passes (see **Passes**) | Create, open, extend, end | Expired passes kept 30 days for the reports, then pruned |
| `kids/<kidId>/projects/<projectId>/project.json` | Stage, theme, transcript (masked), plans, change list, flags, timeline, usage readings, token and cost totals | Every turn, step change, build or flag | **Resume point:** the next pass picks up here |
| `kids/<kidId>/projects/<projectId>/versions/vN.html` | Each built version | Each build | Kept; the last working version is shown |
| `kids/<kidId>/apps/<slug>/index.html` and `kids/<kidId>/apps.json` | Shipped apps and the shelf index | Ship; parent delete | Kept until deleted |
| `reports/<reportId>.json` | Report data for All reports | Report written | Kept |
| `Reports/<date> <Kid> - <App>.html` | The readable report file | Report written | Kept; opens without the app |
| `alerts.json` | Needs your attention items | Flag, limit, dismiss | Kept until dismissed |
| `Start Build With Me.cmd` / `.command` and `.app-location` | Stable start file and pointer | Every launch | Kept |
| `.home-certificate/` | The home authority (tablets trust it) | First launch | Kept, so set-up tablets keep working |

In the plugin's private folder (`${CLAUDE_PLUGIN_DATA}`), kept across updates and deleted on uninstall:
- `node_modules/`
- `models/` (Whisper)
- `sandbox/` (an empty working folder for Claude)
- `server.lock`

**Not kept anywhere:** audio, and Claude Code's own session history for these runs (`--no-session-persistence`, which keeps kids' chats out of the parent's history).

## File Structure

```
build-with-me-home/                  # repo root = plugin root = marketplace
├── .claude-plugin/
│   ├── plugin.json                  # name "build-with-me", version, description
│   └── marketplace.json             # this repo as a one-plugin marketplace
├── commands/
│   ├── build-with-me.md             # /build-with-me → check, then launch
│   └── reset-pin.md                 # /build-with-me:reset-pin
├── skills/
│   └── setup/SKILL.md               # guided install: read the check report, fix gaps
├── app/
│   ├── setup-check.mjs              # checks Node, claude login, packages, model, port, folder
│   ├── launch.mjs                   # start the server, write start file and shortcut, open browser
│   ├── skills/                      # course stage instructions (copied at release) + LICENSE
│   └── dist/                        # built server + web (committed at release)
├── server/                          # TypeScript source → app/dist/server
│   ├── index.ts                     # Express, the two listeners, routes, SSE
│   ├── auth.ts                      # parent cookie (loopback), pass cookie
│   ├── store.ts                     # atomic JSON files in <home>\Build With Me
│   ├── passes.ts                    # create / open / extend / end / expire
│   ├── kids.ts                      # family.json kids
│   ├── certs.ts                     # home certificate authority + server cert
│   ├── speech.ts                    # Whisper (Transformers.js) streaming transcription
│   ├── safety.ts                    # checker orchestration, flags
│   ├── usage.ts                     # /usage readings, rate-limit tracking
│   ├── claude/
│   │   └── runner.ts                # isolated claude -p processes (guide, checker, builder, reporter)
│   ├── journey/                     # ported from Build With Me functions/src
│   │   ├── guideTurn.ts  startSession.ts  getSession.ts  changeTurn.ts
│   │   ├── generateApp.ts  edits.ts  checklist.ts  stages.ts  personal.ts
│   │   └── prompt/                  # buildPrompt, wrapperLayer, safety, dial, builderLayer, …
│   └── report/
│       ├── reporter.ts              # reporter call + schema
│       └── template.ts              # self-contained report HTML
├── web/                             # React front end → app/dist/web
│   ├── index.html
│   └── src/
│       ├── main.tsx  App.tsx        # routes: parent (laptop) vs kid (pass)
│       ├── parent/                  # Opening, FirstRun, ParentHome, AllReports, ReportView,
│       │                            # KidsManage, TabletSetup, Settings
│       ├── screens/                 # ported kid screens: Welcome, GuideStage, BuildScreen, ShipScreen
│       │                            # + MyApps, Countdown, TimesUp, LimitReached, PassUsed, CantReach
│       ├── components/  themes/     # ported
│       └── lib/                     # api.ts (fetch + SSE), speech.ts (PCM streaming), voice.ts
├── scripts/
│   ├── usage-experiment.ts          # E3
│   ├── release.mjs                  # build web + server into app/dist, copy skills
│   └── verify-*.ts                  # per-step checks used during the build
├── devpost/                         # planning docs (learner-profile.md is git-ignored)
├── package.json                     # one package for server + web; engines.node ">=22"
├── LICENSE                          # MIT, plus the course skills' notice
└── README.md                        # for parents: install, start, tablets, reset PIN, uninstall
```

## External Services and Dependencies

| Dependency | How it's called | Auth | Limits and cost | Docs |
|---|---|---|---|---|
| **Claude Code CLI** (parent's) | `claude -p` with the isolation flags; stream-json in and out; `--json-schema` for builder and reporter; `claude -p "/usage"` for plan usage | The parent's existing sign-in; the app never touches it | The parent's plan limits (5-hour and weekly); `rate_limit_event` reports status | [Headless](https://code.claude.com/docs/en/headless), [CLI](https://code.claude.com/docs/en/cli-reference), [SDK message types](https://code.claude.com/docs/en/agent-sdk/typescript), [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) |
| **Claude Code plugins** | `.claude-plugin/plugin.json`, `marketplace.json`, `commands/`, `skills/`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` | None | None | [Plugins reference](https://code.claude.com/docs/en/plugins-reference) |
| **Hugging Face model download** (once, during setup) | Transformers.js fetches `Xenova/whisper-base.en` files into the models folder | None | ~75–150 MB once; free | [Transformers.js](https://huggingface.co/docs/transformers.js) |
| **npm registry** (once, during setup and updates) | `npm ci --omit=dev` | None | Free | [npm ci](https://docs.npmjs.com/cli/commands/npm-ci) |
| **Node.js** | Runtime | None | Free | [nodejs.org](https://nodejs.org/) |
| **The Learn AI Basics skills** | Copied into `app/skills/` at release | None | MIT (to verify) | Devpost's skill-pack repo |

No other network calls. Kids' apps get a CSP that blocks network access.

## Important Failure Modes

- **The plan limit is hit mid-session** → the kid sees "Limit reached — ask your parent," the work is saved, and the parent gets an alert with the reset time. Turns resume after `resetsAt` if the pass is still live.
- **`claude` fails** (signed out, crashed, slow) → one automatic retry. Then the kid sees "My brain needs a quick break — try again in a minute," and the parent home shows "Claude Code isn't responding — check that you're signed in." A failed build keeps the last working version.
- **The laptop sleeps or the server stops** → the tablet's SSE drops and it shows "Can't reach the computer — ask your parent to start Build With Me." The work is saved after every turn.
- **The tablet microphone isn't allowed** (no certificate) → typing plus the keyboard-dictation hint.
- **Whisper mishears a kid** → the recognized text shows in the answer box before sending, with an "Oops, say it again" button.
- **The firewall blocks tablets** → the "Set up a tablet" page on the laptop runs a self-test against the home address and explains the Windows firewall "private network" allow step.

## What Was Simplified and Why

- **Pictures:**
  - **The app picture in reports and on the shelf is a themed emoji tile,** instead of a real screenshot. A screenshot would need a headless browser (another big download). The fuller version would add Playwright to setup.
  - **Idea and Design pictures:** Build With Me's mock-ups stay. There's no image service, because the PRD has no keys.
- **Device names come from the browser** ("iPad," "Windows laptop"), instead of names the parent types in. That's enough to tell devices apart in Active passes.
- **The plan usage per app is a before-and-after difference of `/usage`,** split by token share when sessions overlap, instead of exact per-app accounting, which Claude Code doesn't expose.
- **One English Whisper model,** instead of a language picker. The PRD didn't ask for other languages. It's swappable in settings later.
- **Lockout and sessions are in memory:** a restart clears the wrong-PIN counter, which is acceptable for a home app.
- **The release build is committed** (`app/dist`), instead of building on each family's computer. That trades repo size for a no-build install.

## Build Order and Early Experiments

Riskiest first, so nothing depends on an unproven piece:
1. **E1, Claude isolation and plumbing:** run `claude -p` with the isolation flags. Confirm:
   - no CLAUDE.md, tools, plugins or MCP leak in (ask the guide what instructions and tools it has)
   - the stream-json multi-turn conversation works
   - whether `--json-schema` works with stream-json
   - that `/usage` output can be read
   - what `rate_limit_event` looks like
2. **E2, tablet talking:**
   - the home certificate on the learner's tablet
   - the microphone on HTTPS
   - Whisper latency from "stopped talking" to text, on the laptop and the tablet
   - Whisper accuracy on a kid's voice

   If it fails, switch to keyboard dictation and record the result.
3. **The plugin skeleton:** setup check, launch, start file, shortcut, `/build-with-me:start`, on Windows. Mac when a Mac is available.
4. **Store, parent gate, first run, kids.**
5. **Passes:** QR code, one-use, cookie, SSE countdown, extend and end.
6. **The kid journey port:** guide and checker on the Claude Runner, the screens, voice out.
7. **Build and Ship:** the builder, versions, My apps.
8. **Reporter and reports, alerts, Limit Reached.**
9. **E3, the usage experiment.** Then lock in the model mix.
10. **README for parents,** and the demo run-through.

## Decisions and Open Issues

**Learner decisions (this conversation):**
- **Copy Build With Me's code** into this project and replace only the back office. The tradeoff: the two projects go their separate ways.
- **Require Node.js 22+.** Setup checks and installs it (with approval) or explains how. The tradeoff: one prerequisite, but the simplest build and the same on Windows and Mac.
- **Claude Code is the installer:** a setup skill that checks the dependencies and installs them through the parent's own approval settings, or guides in the chat.
- **Speech-to-text runs on the computer** (Whisper), with the tablet only recording. The learner asked whether Wi-Fi adds delay. Clarified: ~20–40 KB per utterance takes hundredths of a second, and transcription time dominates. Measured in E2.
- **A home certificate for tablets,** proven first, with dictation as the fallback.
- **The course skills ship inside the plugin as the app's instructions,** not as skills installed into the parent's Claude Code.

**The learner's useful unknown, cache and model economics:**
- **The question:** "Since my Claude app has a 1-hour cache, is it better for checks to use the same model as the stage, and might designing in Opus carry the cache into build?"
- **What clarified it:**
  - caches are per model and match only an identical beginning
  - a check reuses the guide's cache only if it runs as a fork of the guide's conversation
  - build starts a new conversation anyway
- **What's still unknown:** whether `-p` gets the 1-hour cache, and how much cached tokens count against plan limits.
- **How it gets checked:** **E3** compares setups A, B and C on real plan-usage %. The starting setup is A until then.

**The learner's goal, local versus hosted pros and cons, as it shows up in this blueprint (for the build wrap-up):**
- **Pros:**
  - no per-app cost
  - no accounts, keys or servers to run
  - kids' data and voices stay home
- **Cons:**
  - every family installs and updates their own copy (handled by the setup skill and plugin updates)
  - the laptop must stay on and awake
  - tablets need a one-time certificate
  - Windows firewall prompts
  - apps can't be shared outside the house

**Agent-made implementation choices** (follow from the decisions above; the learner can change them):
- Express, SSE, Transformers.js, `whisper-base.en`, `@peculiar/x509`
- ports 4747 and 4748
- the data folder in Documents
- the guide and checker as long-lived processes
- at most 2 builds at once
- `--no-session-persistence`
- forgotten PIN reset through `/build-with-me:reset-pin` (resolves the PRD open question)

**Open (to resolve in the build, not blocking approval):**
- **E1:** the exact isolation flag set, whether CLAUDE.md is excluded, `--json-schema` with stream-json, and `/usage` parsing.
- **E2:** iPad and Android certificate steps, the microphone, Whisper latency and accuracy.
- **E3:** the final model mix.
- **Mac testing:** only if a Mac is available. Otherwise the README marks Mac as "should work, untested."
- **The course skills' license:** confirm MIT and copy the notice.
- **The learner's minor UI tweaks:** after it's running (`prd.md > Open Questions`).
- **Plan names:** does Pro include Opus in Claude Code? If a parent's plan can't use Opus, the builder and reporter fall back to Sonnet automatically, and the report notes it. To check in E1.
