# Judges' Demo Plan

Owner decision D-4 (2026-10-22): judges try Build With Me without installing it, on a public web page with a click-through demo built from the **real web screens with canned answers** in place of the server. It replaces the tunnel (D-3). Status: **reviewed (2 rounds: Claude + Codex, flags checked and fixed), waiting for the owner's yes.**

**Goals:** (1) a judge understands what the app is in under a minute; (2) a judge can click through a whole kid session and a parent's first run without installing anything; (3) nothing in the real plugin changes for a real family.

## Shared context

- **What stays untouched:** the plugin itself. `npm run build` keeps building `app/dist/` as today; the server, the plugin commands and the kids' real data are not touched. The demo is a second, separate build, and `app/dist/` is not rebuilt or committed for this work.
- **Where the real screens reach the server (Verified):** see the table "Every way the screens reach the server" below. Short version: one `api()` function (`web/src/lib/api.ts`, 43 lines), three live-update feeds, the talk recorder, a report iframe, and links and images that point at server paths.
- **Routing (Verified):** `App.tsx` picks the screen from the page address (`/p/<code>`, `/kid`, otherwise the parent side). The demo skips that: its own start file renders the parent or kid screen directly, so the address doesn't matter.
- **Decisions in force:** D-2 (the repository is public), D-4 (this demo). Publishing a new public page needs the owner's explicit yes (profile › Approvals).

## What judges get

1. **Landing page:** the app's name and one-line description, three or four real screenshots, the "check it's harmless" prompt, the install commands, and a big **Try the demo** button. The words come from the README (and the existing `devpost/` text); nothing is invented. The wording keeps the **parent-tool framing** (an open-source plugin for parents to introduce their own kids to Claude Code, with safety measures as aids, never "a kids' app") and the **18+ note** (the parent's own Claude account). The owner sees the exact text in an HTML mockup before any code (step 1 below) and again before publishing.
2. **Demo:** the real screens, with a fixed top bar that says "Demo: not connected to anything. Replies are scripted.", the Parent / Kid switch, and a **Restart demo** button. Two sides:
   - **Parent laptop:** first run, setting a PIN (any 4 digits work), adding kids, giving a pass, and a finished parent report with a "Worth a chat" note.
   - **Kid tablet:** pick a look, then the six steps (Start → Idea → Design → Tech plan → Build → Ship) with one scripted guide conversation (details below), "Show me ideas" from the real 128-idea list, a pre-made finished app that really runs in its frame, and the *My apps* shelf.
3. **Talking:** typing only (see "Microphone and voice").

## Allowed edits to real web files (the complete list)

Everything else is new files or whole-file swaps in the demo build only. Real-mode behavior must stay identical; each edit below is a re-export, a one-line wrapper or a branch that is dead outside demo mode (`import.meta.env.MODE === 'demo'` is false in a normal build).

| # | File | Edit | Why |
|---|---|---|---|
| E1 | `web/src/lib/api.ts` | Move the types, `ApiError`, `clock` and `timeOfDay` into a new `web/src/lib/apiTypes.ts`; `api.ts` re-exports them with `export * from './apiTypes'` and imports `ApiError` for its own use. `api()` itself is unchanged. | The fake can reuse the real types without importing the file it replaces. |
| E2 | `web/src/App.tsx` | Add `export` to `ParentApp`. | The demo start file renders it directly. |
| E3 | `web/src/parent/Reports.tsx` + new `web/src/parent/reportFrame.ts` | The report iframe line takes its attributes from `reportFrameProps(id)`, which returns the same `src` as today. | The demo build swaps that tiny file for one that returns `srcDoc` (the sample report), so no `/api/` request happens. |
| E4 | `web/src/kid/journey/screens/Welcome.tsx` | In demo mode only, the **Talk** button is disabled with the caption "Talking works in the real app. In the demo, type." | The one place a judge could pick talking. |
| E5 | `package.json`, `.gitignore` | Add `build:demo` (`vite build -c vite.demo.config.ts --mode demo`), add the demo typecheck to `typecheck`, add `demo-dist/` to `.gitignore`. | Build, check and keep the output out of git. |

Whole files swapped **in the demo build only** (a small plugin in `vite.demo.config.ts` swaps by file path, so the real files stay as they are):

- `web/src/lib/api.ts` → `web/demo/fakeApi.ts` (the canned server).
- `web/src/kid/journey/lib/speech.ts` → a stand-in where `speechSupported()` is false and `useSpeech` never records.
- `web/src/kid/journey/lib/voice.ts` → a stand-in where `voiceSupported()` is false and `speak()` ends at once.
- `web/src/parent/reportFrame.ts` → returns `srcDoc`.

If anything beyond E1–E5 turns out to be needed, stop and ask the owner.

## Every way the screens reach the server, and the demo's answer

| Way in | Where (Verified) | Demo's answer |
|---|---|---|
| `api()` calls, about 37 paths under `/api/parent/…`, `/api/kid/…`, `/api/pass/open` | `web/src/lib/api.ts` and the callers | `fakeApi.ts` answers each path from the in-memory store. Unknown paths throw **and** are written to `console.error` and a misses list (some screens swallow errors), so the click-through checks the list is empty. |
| Presence feed `EventSource('/api/presence…')` | `App.tsx:41` | `main.tsx` replaces `window.EventSource` with a stand-in that opens nothing and never fires an event or error (an error would show "Can't reach"). |
| Pass feed `EventSource('/api/events?as=kid')` | `KidApp.tsx:58` | Same stand-in. The fake pass always ends 60 minutes from now, so the countdown never hits zero during a visit. |
| Parent feed `EventSource('/api/events')` | `ParentHome.tsx:46` | Same stand-in. Lists refresh because the screens call `api()` again after each action. |
| Report iframe `src=/api/parent/reports/<id>/html` | `Reports.tsx:136` | E3: `srcDoc` with the sample report. |
| Talking: `import(location.origin + '/lib/recorder.js')` and `/api/speech` | `speech.ts:16` | Stand-in never loads it; `recorder.js` is not in the demo build. |
| Spoken guide voice (`speechSynthesis`) | `voice.ts`, `Journey.tsx:52` | Stand-in: voice off. |
| Images from server data: `qr`, `iconUrl` | `Passes.tsx:100`, `ParentHome.tsx:243,284`, `ShipScreen.tsx:37,204,213`, `MyApps.tsx:65` | The fake returns small `data:` images (a fixed placeholder QR with the text "Demo"), so nothing is fetched. |
| Links to server paths: `laptopUrl`, app `path`, `appPath`, "Open my app" | `Passes.tsx:106`, `ParentHome.tsx:245`, `Reports.tsx:116`, `ShipScreen.tsx:209,222`, `MyApps.tsx:70` | All fake paths start with `/apps/` or `/p/`. `main.tsx` catches clicks on such links and shows "Not in the demo: this opens on the family's computer." |
| `location.replace('/kid')` | `KidApp.tsx:178,187` | Only reached from a pass link (`/p/<code>`); the demo never uses one. No change. |
| `location.reload()` after "New app" | `Journey.tsx:215`, `ShipScreen.tsx:144` | The page reloads, which restarts the demo (memory is cleared). Accepted (A-9). |
| Sign-in page link | `Reports.tsx:65` | The fake sign-in state is always "done", so the link never shows. |
| Fonts, icons, CSS | `@fontsource-variable/nunito` (bundled), `icon.png` | Bundled or copied into the demo build; no outside address. |

The finished app runs in `VisualPane`'s sandboxed frame from `srcDoc`, which already blocks all network (`connect-src 'none'`).

## Hosting in a sub-folder

The address will be `https://paveliko123.github.io/build-with-me-at-home/`, so nothing may use a root-absolute path.

- A separate config, `vite.demo.config.ts` (new file; the real `vite.config.ts` is not edited): `root: 'web'` (so Tailwind finds the same class names as the real build), `base: './'` (relative paths work in any folder), `build.outDir: '../demo-dist'`, two page entries at the `web/` level (`web/demo-index.html` = landing page, no React; `web/demo-try.html` = the demo; the real build only reads `web/index.html`, so it ignores them), and the swap plugin above. The output step renames them to `index.html` and `try.html` in the same folder, so the relative asset paths stay right.
- `publicDir` is off for the demo. Only what the demo needs is copied in: `icon.png`. **Not published:** `talk-test.html` and `lib/recorder.js` (the real `web/public/` files), anything from `server/` except `ideaLibrary.json`, and the repository's other files.
- The landing page's **Try the demo** button links to `try.html` (relative).
- Local test: serve `demo-dist/` from a sub-folder path (for example `/build-with-me-at-home/`) and click through, so a root-absolute path shows up as a broken page.
- Idea list: the demo imports `server/journey/ideaLibrary.json` (128 ideas) as it is, and picks three per tap with the same rules as `server/journey/ideas.ts` (age group, look, and not repeating).

## Microphone and voice

- The demo is typing only. No microphone is requested and no recorder file is loaded.
- The **Talk** button on the Welcome screen is disabled with the caption in E4. "Talk instead" and the voice settings in the journey are hidden because the stand-ins report talking and voice as unsupported.
- The guide's spoken voice is **off** in the demo, because some browsers' voices send the text to an online service (A-6).

## The scripted journey (kid tablet)

The fictional kid is the first kid the judge added on the parent side, or "Sam" (kid, 🚀) if they skipped it. The app is "Star Catcher", a small tap game. Each guide turn is a `GuideTurnResult` in `web/demo/script.ts`. Cards are shown as tap suggestions. A judge can tap a card or type one of the card words.

| Step | Turns | What happens | Shown to review |
|---|---|---|---|
| Welcome, look | 0 | Talk is disabled; **Type** continues; any of the real looks can be picked. | none |
| Start | 1 | Guide greets and asks what to make, with the 💡 button and cards. | none |
| Idea | 3 | "Show me ideas" gives three real ideas. Tapping any of them gets "Great idea! In this demo we'll build Star Catcher together; in the real app the guide builds yours." Then the Star Catcher card leads to two "make it yours" questions with three cards each, then the scope document. | Scope (short markdown) in the document review |
| Design | 3 | Look question, rules question, then the PRD. The visual pane shows a small canned picture of the screen. | PRD (short markdown) |
| Tech plan | 2 | A one-line `techSummary`, five `buildSteps`, appEmojis, then the spec. | Spec (short markdown) |
| Build | n/a | `generateApp` returns the canned game after a fake build: `buildProgress()` walks through the phases (waiting, reading, writing, checking, safety, verifying, done) over about 12 seconds, ticking the five steps. The waiting chat and "change something" box answer with one friendly scripted line. | the running game |
| Ship | n/a | Name and icon choice work; `shipApp` returns the app on the shelf with a placeholder QR. | none |
| My apps | n/a | The shelf shows one pre-made older app and, after Ship, Star Catcher. | none |

Off-script input (anything not matching a card) gets "In the demo the guide follows a script. Tap a suggestion to continue." and the turn does not advance. State lives in memory; **Restart demo** resets the fake store and remounts the screens (a changed React `key` on the demo shell), without reloading the page.

Parent side: the fake state machine goes first run (Claude "found and signed in") → PIN (any 4 digits) → home. Home shows the kids, a pass (start, extend, end; "Open on this laptop" shows "Not in the demo"), one sample report with a "Worth a chat" note (based on `devpost/report-mockup.html`), the apps list (Star Catcher appears after Ship), and a status line. The pass handoff to the kid is an in-page switch to the same kid.

## How it's built

1. **Mockup first:** an HTML mockup of the landing page (profile: UI changes get a mockup before code) and the HTML companion of this plan, shown to the owner; landing words approved before any code.
2. **Plumbing:** `vite.demo.config.ts`, the swap plugin, E1–E5, `web/demo/fakeApi.ts`, `main.tsx` (EventSource stand-in, link catcher, top bar), `web/tsconfig.demo.json`.
3. **Canned content:** `web/demo/script.ts` (family, turns, documents, build phases, game, report).
4. **Landing page and screenshots** from the approved mockup, with screenshots taken from the demo.
5. **Checks and independent code review** of the diff (a separate reviewer agent), then a fix round.
6. **Hosting (after the owner's yes):** GitHub Pages for the public repo (free for public repos on GitHub Free: Researched, https://docs.github.com/en/get-started/learning-about-github/githubs-plans; site limits of 1 GB and about 100 GB a month of traffic: Researched, https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). Proposal: a small GitHub Actions workflow that publishes **only when started by hand (`workflow_dispatch`) after the owner's yes**, not on each push (decision X-3 below). The address is `https://paveliko123.github.io/build-with-me-at-home/` (Estimate: the standard pattern; confirmed once Pages is on). Turning Pages on is a repository setting (Estimate: Settings › Pages › Source "GitHub Actions"; path not checked): the owner clicks it, or Claude does it with `gh` after a yes.

**Typecheck:** `web/tsconfig.demo.json` includes `web/src` and `web/demo`. The canned answers are typed **by route**: one table maps each path to its response type (`ParentState`, `Kid[]`, `GuideTurnResult`, `ShelfApp`, and so on, imported as types), so a wrong shape in a canned answer fails `npm run typecheck`. The real `api<T = any>` call sites are not checked against the table; the click-through test covers that.

## Assumptions (small choices made so the owner doesn't have to; change any by saying so)

- A-1: Demo state lives in memory; page reload restarts it; a visible **Restart demo** button resets it without reloading.
- A-2: Fixed top bar on every demo page: the "Demo: not connected" banner, the Parent / Kid switch, Restart demo.
- A-3: Guide turns per step as in the journey table (one to three); cards are tap suggestions; every idea leads into Star Catcher.
- A-4: Off-script input gets the friendly line and does not advance the turn.
- A-5: The QR is one fixed placeholder image; "Open" links show "Not in the demo".
- A-6: The guide's spoken voice is off in the demo (some browsers' voices go online).
- A-7: The pass handoff is an in-page switch to the same fictional kid.
- A-8: The report is shown through `srcDoc`, not a request.
- A-9: "New app" reloads the page, so it restarts the demo; accepted rather than editing two more real lines.
- A-10: Documents shown at review (scope, PRD, spec) are short, plain-English markdown written for this one app.
- A-11: The build progress takes about 12 seconds so judges can see it.

## Steps and estimates

Figures are scaled from the earlier version of this plan (1.8%, about 63 minutes, six steps), with more steps for the mockup, the fuller scripted journey and the code review; there is no measured baseline for demo-page work yet. The builder runs at medium: this is not a stakes topic (no real data, no AI prompt, no database).

| Step | Category | Model / effort | Est. 5h | Est. week | Est. minutes | Based on |
|---|---|---|---|---|---|---|
| Build the HTML companion of this plan and the landing-page mockup | Build | Opus 5.5 / medium | 0.3% | 0.04% | 8 | scaled |
| Build demo plumbing: config, swaps, E1–E5, fake server routes, start file, typecheck | Build | Sonnet builder / medium | 0.5% | 0.07% | 25 | scaled |
| Build the scripted family, kid journey, documents, game and report | Build | Sonnet builder / medium | 0.6% | 0.08% | 30 | scaled |
| Build the landing page and screenshots | Build | Opus 5.5 / medium | 0.2% | 0.03% | 5 | scaled |
| Test the click-through, phone width and the real build unchanged | Test | Sonnet tester / medium | 0.4% | 0.05% | 25 | scaled |
| Review the code diff with an independent reviewer | Review | Sonnet reviewer / high | 0.3% | 0.04% | 8 | scaled |
| Fix round 1 | Fix | Opus 5.5 / medium | 0.3% | 0.04% | 5 | scaled |
| Build the Pages workflow and publish (after your yes) | Build | Opus 5.5 / medium | 0.2% | 0.03% | 5 | scaled |
| **Total** | | | **≈2.8%** | **≈0.38%** | **≈111** | |

## Checks that prove it done

**The real app is unchanged**
- `npm run typecheck` (now including the demo) and the free checks the release uses (`verify:revisions`, `verify:security`, `test:guard`) pass.
- The git diff of `web/src` shows only E1–E4; `package.json` and `.gitignore` only E5.
- A throwaway real build (`vite build` with an absolute `--outDir` in the temp folder, so `app/dist/` is not touched) contains none of the demo's marker text ("Demo: not connected", "Restart demo", "fakeApi", "In the demo, type", the canned guide lines) and no demo pages, and still contains the report address `/api/parent/reports/…/html` (E3 unchanged in real mode).

**The demo works**
- In the browser pane, from a sub-folder address: Parent first run (any 4-digit PIN) → add a kid → give a pass → Kid side: pick a look, **Type**, Start → Idea (including "Show me ideas") → Design → Tech plan → Build progress → the game runs and is playable → Ship → My apps → back to Parent: the report with "Worth a chat". Also: an off-script sentence, the disabled Talk button, an "Open" link (shows "Not in the demo"), and **Restart demo** pressed mid-Build (back to the Welcome screen). No errors in the console, and the fake server's misses list is empty.
- The network log shows only the demo's own files: no `/api/` calls, no outside addresses, no microphone prompt, no `recorder.js`, no spoken voice.
- `demo-dist/` contains no `talk-test.html`, no `lib/recorder.js` and nothing from `server/` except the idea list; a scan of it finds no username, home address or real names.
- At 360 px wide (and with large text) every screen (landing, kid and parent) fits without sideways scrolling, tap targets are at least 48 × 48 px, and text contrast is at least 4.5:1.

## Open questions

- **Owner (X-3):** how publishing is allowed. Proposal in this plan: runs only when started by hand after the owner's yes (every later update is then a new yes). Alternative: publish on every push to `main` once the owner has said yes once. This is the owner's call; the plan assumes the first until told otherwise.
- **Owner:** the yes to publish the page publicly (asked once the demo works, with the exact landing-page words shown first).
- **Minor (default):** if the demo needs more than E1–E5 in the real web code, stop and ask before going further.
