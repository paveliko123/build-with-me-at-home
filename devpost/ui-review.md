# Build With Me at Home: UI/UX review

Reviewer: independent design pass, 2026-10-06. Build: `app/dist` (as built), on a private test server (port 4790, temp data folders). The real install was not touched.
What I ran: first-run setup (PIN 2468, kid "Mia" under 13, teen "Leo"), parent home, Give a pass with the QR code, the kid side in a second tab (wrong code, pass page, Welcome, Type, Music theme, Start, Idea, Design, one build, Ship, My apps, the countdown, Time's up after End now), the report in the parent area and as a standalone file, the tablet setup page, light and dark mode, and four viewport sizes. I typed 7 answers (2 of them were card taps), did 1 build and made 1 report. There was no sound and no microphone: I chose Type every time and stubbed out `speechSynthesis`.
Not reached live (I reviewed the code instead): the teen's planning documents, the Tech plan stage, the change list, the limit screen, a flagged report, Needs-your-attention alerts and the Settings PIN change.

## Overall verdict

The product is in good shape. The parent side is calm and clear and follows `parent-mockup.html` closely. The kid journey works end to end: a 9-minute session produced a working app and a useful, well-written report. The wording keeps the right framing (the parent is responsible, and the checks and reports are aids). The serious problems are layout problems on **small or portrait screens on the kid side**. On a landscape phone, the answer box and Send are off screen. On a tablet held portrait, the Build screen's change box and Ship button are off screen. A **contrast** problem runs through both sides: the primary buttons fail AA, and in dark mode badly. There is also a short list of content mismatches: the app "picture" is the theme's emoji, and the usage numbers disagree between the home page and the report. None of these needs a redesign. Most are small CSS or layout changes.

**Top 10 to fix first:** O1, O2, O3 (answer box and Ship off screen on phones and tablets), A1 (contrast), K1 (countdown covers Send), R1/R2 (picture and usage mismatch), P1 (Claude Code check missing from first run), P2 (kids' nickname lost without "Add"), K3 (live End now / extend not reaching a kid tab on the laptop).

---

## 1. Opening and first-run screens

| # | Sev | Where | What I saw | Suggested fix |
|---|---|---|---|---|
| P1 | Medium | First-run, `web/src/parent/FirstRun.tsx:31-36` | prd.md (Screens and Layout, 1) lists **the Claude Code check** as the first step of first-run setup. The flow starts at the responsibility note, so a parent without Claude Code only finds out on the home page ("Not found: run /build-with-me:setup"). | Add a first step that shows the same check as the status strip (✓ Signed in / Not found / Signed out with the exact command), with "Check again". |
| P2 | Medium | Add your kids, `FirstRun.tsx:70-72`, `KidForm.tsx:21-38` | Pressing Enter in the Nickname field does nothing (there's no `<form>`). If a parent types a second nickname and clicks **Finish setup** without **Add**, that kid is silently dropped. **Add** and **Finish setup** are identical green buttons with an empty error gap between them. | Wrap KidForm in a `<form onSubmit>` so Enter adds. Make "Add" secondary (`.ghost`). On Finish, if the nickname field isn't empty, either add it or ask "Add Leo first?". |
| P3 | Low | First-run header `FirstRun.tsx:28` | "Welcome to Build With Me", while the opening screen and the tab title say "Build With Me at Home". | Use one name everywhere: "Welcome to Build With Me at Home". |
| P4 | Low | First-run steps | There's no step indicator and no Back from the kids step to the PIN step. "Add your kids." sits tight under the subtitle with no top margin. | Add "Step 2 of 3" text above each step and 12px of space above the kids paragraph. |
| P5 | Low | PIN entry `PinPad.tsx:5-13` with `FirstRun.tsx:49-53` | PinPad listens on `window`. With focus on the **Next** / **Save new PIN** button, Enter fires both the button click and `onEnter`. With `newPinOnly`, that sends `/api/parent/setup` twice. | Ignore Enter in the window listener when `document.activeElement` is a button, or guard `finish()` with `busy`. |
| P6 | Low | Opening screen after "Open on this laptop" | The parent area locks itself correctly, but there's no message saying why. A parent coming back sees only the PIN pad. | Show one line above the pad: "Locked because Mia's pass was opened on this laptop." |
| P7 | Low | Tablet setup page `server/tabletSetupPage.ts:41-50` | The intro, the "Not secure" tip and the six platform pills sit above the step card **on every step**. On a landscape phone the step's button starts at y≈640 in a 390px-tall view, so every step needs a scroll. | After step 1, collapse the intro and tip into one "ⓘ Why this is safe" line, or put the step card first. |
| P8 | Low | Tablet setup page `:123,125` | Step 1 has two identical full-width green buttons ("Download the certificate" and "Done, next"), so it isn't clear which comes first. | Make "Done, next" secondary until the download link has been clicked. |
| P9 | Low | Tablet setup page `:126,134` | Each step re-renders with `innerHTML`, so keyboard focus drops to `<body>` after Next or Back. The Check result has no live region. | Focus the new `<h2>` after `render()` and add `aria-live="polite"` to `#res`. |
| P10 | Low | Tablet setup page `:30` | The `.tip` text (#b7791f on #fdf2dc) is 3.3:1 at 15px, which fails AA. | Darken the tip text to #8a5a12 (5.3:1), the color the countdown already uses. |

## 2. Parent portal

| # | Sev | Where | What I saw | Suggested fix |
|---|---|---|---|---|
| A1 | **High** | Every primary button: `parent.css:22` (`.btn`), tablet page `button.go` | White on `--brand`: **3.37:1** in light mode and **2.27:1 in dark mode** (#4cc08d), at 15px bold. "Create pass" and "Open on this laptop" are hard to read in dark mode. | Light: brand #23855a for buttons (about 4.6:1). Dark: keep #4cc08d but use dark text (#0f2a1e, about 8:1) on `.btn` / `.go`. |
| A2 | Medium | Pills `parent.css:27-29` (Kid, OK/No flags, flag) | 12px text: Kid pill 2.9:1, "No flags" 2.9:1, warn 3.3:1, bad 4.3:1. These badges carry the safety signal the parent is meant to read at a glance. | Darker text on the same soft fills: kid #1f6fbf, ok #1e7a52, warn #8a5a12, bad #9c3535. Dark mode already passes. |
| A3 | Medium | Give a pass, the pass box (`Passes.tsx:85-97`) | The QR is 150px and sits next to a dense column: three ways to open the pass, an inline green button with a 13px "(locks the parent area here)" that wraps under it, and a 13px fine-print paragraph. The fine print says "set it up with 📱 **below**", but on desktop that button is in the right-hand column. | Order by priority: a large QR (≥200px) and the typed code in big text, then one line per way. Put "Open on this laptop" on its own line as a full button with its note under it. Change "below" to "with 📱 Set up a tablet (Kids & their apps)". |
| A4 | Medium | Modals, `ParentHome.tsx:115-128` | Opening Tablet setup / Settings / Manage leaves focus on the trigger button (checked: `activeElement` is still the button). There's no `aria-modal`, no focus trap, and focus doesn't return on close. Esc works. | Use `<dialog>` with `showModal()`, or focus the Close button on open, trap Tab, and restore focus on close. |
| A5 | Medium | Latest reports rows `Reports.tsx:50`, All reports rows `:72` | Clickable `div`/`tr` with no `tabIndex` or role, so a keyboard user can't open a report. "show code" and "All reports →" are `href="#"` links. | Make the report title a real `<button>` or `<a>` inside the row, keep the row click as a mouse shortcut, and turn the `href="#"` links into buttons. |
| A6 | Medium | Settings → Change PIN, `ParentHome.tsx:199-218` | The new PIN is entered only once (first run asks twice). A typo locks the parent out until `/build-with-me:reset-pin`. | Add the same "Enter it again" step as first run. |
| A7 | Medium | Tablet setup modal `ParentHome.tsx:178-196` | Five dense bullet points come before the action (the QR). Parents will skim past them. | QR and URL first, then "Why the security warning?" in a `<details>`. |
| A8 | Low | Tap targets (parent) | Measured: Settings, Lock, the 30 min / 1 hour / 2 hours / Rest of today pills, +30 min, +1 hr, End now, Manage, Hide and Add a kid are **38-39px** tall. The custom-minutes input is 36px, "Open on this laptop" 36px, the alert ✕ about 28px (`parent.css:110`) and the kid emoji picker about 34px (`:65`). | `min-height:44px` on `.ghost`, `.dur button`, `.emojis button` and `.alert .ghost`. Cheap to do, and it helps on a touch laptop. |
| A9 | Low | Native `confirm()`/`alert()` (`Passes.tsx:46,103-104`, `ParentHome.tsx:148,159`) | Browser dialogs break the calm look, and on Windows they show "localhost:4790 says". | A small in-card confirm ("End Mia's pass now? Her work is saved. [End now] [Cancel]"). |
| A10 | Low | Kids & their apps → **Manage** per kid (`ParentHome.tsx:75`) | Every row's Manage opens the same all-kids modal. | Either scroll the modal to that kid or open that kid's edit form directly. |
| A11 | Low | Status strip on phone width | The three status cards stack and push Give a pass down to y≈520 (the QR to y≈924 on a 390×844 screen). The cards also grow when "Checking…" turns into meters, so the page jumps. | Below 600px, collapse to one compact row (✓ · 46% · 32%). Reserve the meter height while checking. |
| A12 | Low | Header time `ParentHome.tsx:53` | "3:46 PM" doesn't update; it changes only when something else re-renders. | Drop the time, or tick it with `useNow`. |
| A13 | Low | Dark mode links | "show code" uses the muted color and is only told apart by its underline. | Use `color:var(--brand)` for in-text actions. |

## 3. Reports

| # | Sev | Where | What I saw | Suggested fix |
|---|---|---|---|---|
| R1 | **High** (misleading) | Report "The app" `server/report/template.ts:31,70`, My apps `MyApps.tsx:218`, data from `server/journey/apps.ts:89` (`themeEmoji`) | The app's "picture" is the **helper theme's emoji** (🎧 for Music) on a fixed purple gradient. For a singing-animal piano, the parent sees headphones. The mockup shows the app's own emoji (🐱✨) and prd.md asks for "a picture". The same 🎧 is the app's icon on My apps, so every app made with the Music theme looks identical there. | Short term: ask the builder (or the reporter) for one emoji that fits the app and store it as `app.emoji`. Better: store a small screenshot when the app ships and use it in the report, My apps and Kids & their apps. |
| R2 | Medium | Usage, Latest reports `Reports.tsx:51` vs report `template.ts:58-62` | The home card says "4% of 5-hr limit" as if the app itself used it. The report says "+4% · +1%: your whole account while it was made, 5-hour · weekly". Same number, two meanings. The report's fact is also hard to parse, and it wraps alone onto a second row. | Use one label everywhere: "Account +4% of 5-hour limit while Mia worked". Split into two facts ("5-hour limit +4%", "Weekly +1%"). Move the explanation into a small `ⓘ` / `<details>`. |
| R3 | Medium | Report inside the parent area `Reports.tsx:89-95`, `parent.css:117` | The report sits in an iframe of height `100vh-120px`. That gives a scroll inside a scroll, a card around cards, and "Parent report" twice (the page H1 and the report's own header line). On a landscape phone the frame is **270px** tall. | Size the iframe to its content (postMessage the height, or render the HTML inline in a shadow root). Drop the outer border and background, and drop the page H1 or the in-report "Parent report ·" line. |
| R4 | Low | Report title and app card `template.ts:70,88` | "Mia built "Mia Animal Piano"" is followed by the app name twice more in the app card (the label on the tile and an h3). | Keep the name on the tile *or* in the heading, not both. |
| R5 | Low | Times and dates `template.ts:8-9` | Times are forced to en-US ("3:50 pm") and dates to en-GB ("Tue, 6 Oct 2026"). The parent area uses the browser locale ("Tue, Oct 6"). | Use the same locale (the system default) for both. |
| R6 | Low | Timeline on a phone `template.ts:38` | The fixed 120px time column leaves about 150px for text at 390px wide. | `@media (max-width:480px){.timeline li{grid-template-columns:1fr}}`. |
| R7 | Low | Full conversation `template.ts:46,77` | `.quote` has no `white-space:pre-wrap`, so line breaks in the guide's replies are lost. | Add `white-space:pre-wrap`. |
| R8 | Low | Standalone file | There's no print style, and no way back to the parent area from the file. Parents may print or save a report. | `@media print{body{background:#fff}.card{break-inside:avoid;border-color:#ccc}details{display:block}}`, and a header link "Open Build With Me" that works when the app is running. |
| R9 | Low | Report link color `template.ts:33` | `a{color:var(--kid)}` (#3a8ee2 on white) is 3.4:1. | Use #1f6fbf in light mode. |

The report content itself is good: the paragraph, Whose ideas, the timeline and Worth a chat? read well, and the "aid for the parent" framing holds.

## 4. Kid side

| # | Sev | Where | What I saw | Suggested fix |
|---|---|---|---|---|
| K1 | **High** | Countdown `.bwm-countdown` (`index.css` last block, `KidApp.tsx:68-75`) | A fixed pill, 147×44, centered at bottom:18px, appears in the last 10 minutes. On the guide stage at 1180×820, Send spans about x 440-528, y 745-797, and the pill spans about x 517-664, y 758-802, so it **covers the right edge of Send**. On phones it sits over the middle of the answer box whenever the box is at the bottom of the screen. That is the most stressful moment to hide Send. | Put the countdown in the top bar (next to My apps) as a pill. Or keep it at the bottom but add bottom padding to the page and to the answer row equal to its height while it shows. |
| K2 | **High** (contrast) | Theme accents `themes.ts:28,33,48,53` | White text on the accent (Send, my chat bubbles, the current progress step, Ship, Open): Robots 3.7:1, Cars 3.6:1, **Music 3.2:1**, Sports 3.3:1, all at 16-18px text. Kids' own messages are drawn in these bubbles. | Darken those four accents: Robots #0e7490, Cars #c2410c, Music #b45309, Sports #15803d (each ≥4.5:1). The motifs and the soft color stay as they are. |
| K3 | Medium | Live pass updates on the laptop, `server/kidRoutes.ts:36-51` | I unlocked the parent area again while Mia's laptop pass was live, then pressed **End now**. The kid tab kept showing "⏰ 9:25 left" (the server already said `over`) until it reloaded. `/api/events` treats any request with a parent cookie as the parent stream, so a kid tab in the same browser never gets its `pass` events (end, extend). | Give the kid side its own stream (`/api/kid/events`), or prefer the kid session when the page is `/kid`. Also re-check `/api/kid/session` on `visibilitychange`. |
| K4 | Medium | Top bar `Journey.tsx:259-264` | **"＋ New app"** is the first, top-left control on every guide and build screen. One tap brings up a browser `confirm()` that abandons the app. It is 31px tall (as are My apps, Talk instead and Voice off), below the 44px minimum. | Move "New app" into My apps (or behind a "⋯" menu), replace `window.confirm` with an in-theme dialog, and give the top-bar buttons `min-h-11`. |
| K5 | Medium | Progress bar on phones `ProgressBar.tsx:116` | At 390px the bar gets about 150px between the two buttons, and the current step ("2 💡 Idea") is scrolled **out of view**. The kid sees "Intro 1 Start" while on Idea. For kids, "4 Tech plan" also turns "done" although that stage never appears. | Scroll the `aria-current` step into view on change (`scrollIntoView({inline:'center'})`). Below `sm`, show only "Step 2 of 6 · 💡 Idea". Hide or grey out Tech plan for kids. |
| K6 | Medium | Picture pane `GuideStage.tsx:128-143` | The right half (or, on narrow screens, a 420px block under the answer box) shows "Pictures of your idea will show up here" for the first 5 answers. The first picture came at the Design stage. On phones and portrait tablets the picture sits **below** the answer box, so a kid may never see it. | Fill the empty pane with something alive: the theme's WaitingAnimation, or a live "Your idea so far" card. Below `lg`, show the picture as a collapsible strip *above* the question card when it arrives. |
| K7 | Medium | Kid simple screens `KidApp.tsx:55-58,98-159` | Ask for a pass, the pass page, Time's up and Can't reach use the **parent** styles (system font, green button, small grey text, and dark mode when the device is dark). The journey uses Nunito and the theme. The pass page text "Good until 4:16 PM. Only one device can use it." is 15px grey. | Wrap these in `.bwm-journey` with the Office theme (or the kid's last theme) and the same big type as Welcome. Use plain kid words: "This pass is yours until 4:16." |
| K8 | Medium | Error states `KidApp.tsx:93,156`, `Journey.tsx:253` | The wrong-code error isn't announced (no `role="alert"`). On Theme pick, a failed start shows `String(err)`, a raw "Error: …" message, to the kid. | Add `role="alert"`, and map unknown errors to "My brain hiccupped, let's try that again!" with a Try again button (as GuideStage does). |
| K9 | Medium | Time's up wording `KidApp.tsx:113-114` | It says "Time's up **for today**! … next time you'll pick up right where you left off", even when a parent ended the pass mid-afternoon and even after the kid had shipped (there's nothing to pick up). | "Time's up! Great work, Mia. Everything is saved." Add the "pick up where you left off" line only when an unfinished project exists. |
| K10 | Low | Welcome `Welcome.tsx:19-21` | "about **6 hours of work** or less" is a lot for a kid on a 30-minute pass and works against "kept small". | "Projects are small: a few short sessions." |
| K11 | Low | Build placeholder `BuildScreen.tsx:432` | "← Choose learn or fast mode" points left, but below `lg` the chat is *under* the preview. | Below `lg`, use "↓". |
| K12 | Low | Change list ✕ `BuildScreen.tsx:400` | The remove button is `px-2` with no height, about 24px. | `h-9 w-9` or larger, with a visible hit area. |
| K13 | Low | Ship QR caption `ShipScreen.tsx:168` | "(it needs that device set up and your pass)" is parent jargon on a kid screen. | Kid: "Scan with a tablet at home to play it there!" Put the setup detail in the parent's report or help instead. |
| K14 | Low | Limit screen `Journey.tsx:236` | "Limit reached — ask your parent about it." "Limit" means nothing to an 8-year-old. "Try again" is white on the accent (same contrast issue as K2). | "Your helper needs a rest. Ask your parent, and we'll carry on later. Your work is saved." Keep "Limit reached" for the parent's alert. |
| K15 | Low | Shipped app page `server/journey/apps.ts:140-145` | The app opens in a new tab, full screen, with no name and no way back. On a tablet, kids get stuck in a second tab. | A thin top bar: "← My apps · Mia Animal Piano". |

Good things worth keeping: the question card hierarchy (large question, smaller "say" text), the answer cards, the clear "🤖 Your helper is an AI, not a person", the "Your app can be about anything you want!" fix on Theme pick, the waiting chat during the build, and the friendly Ship celebration.

## Orientation and device sweep

Measured with JS in emulated viewports (scrollWidth, element rectangles, tap sizes). The page was reloaded or re-laid-out after each resize.

| Screen | Phone portrait 390×844 | Phone landscape 844×390 | Tablet portrait 820×1180 | Tablet landscape 1180×820 |
|---|---|---|---|---|
| Parent home | OK, no h-scroll. 17 controls 38-39px tall (A8). QR far down (A11) | OK, 2 columns. Same small targets | OK | OK |
| Give a pass with QR | OK. QR at y≈924, needs a scroll | OK | OK | OK |
| Report view (parent area) | Problem: double scroll, the timeline column is cramped (R3, R6). The All reports table wraps word by word | **Problem: report frame only 270px tall** (R3) | OK | OK |
| Kid guide stage with the answer box | OK: answer box and Send in view. **Problem: progress bar hides the current step** (K5). Picture below the box (K6) | **Problem (O1): with the newest reply in view, the answer box sits at y 448-501 in a 390px view, so Send is off screen.** The question card alone fills the screen | OK with a short history. Picture pane under the box (K6) | OK. The countdown overlaps Send (K1) |
| Build screen | **Problem (O2): app preview 504px, then the whole chat (957px tall); the change box is at y≈1392 and Ship at y≈1450.** The kid can't see the app while describing a change | **Problem (O2): preview only 234px tall, change box at y≈760** | **Problem (O3): change box at y≈1301 and Ship at y≈1359 in a 1180px view** | OK. Note (O4): after a resize the chat lost its scroll position and showed the oldest message, not "Ta-da!" |
| Ship | OK | OK ("Open my app" at y≈224) | OK | OK |
| My apps | OK | OK | OK | OK |
| Welcome / Theme pick | OK | Problem (minor): Talk/Type at y≈563, "Let's go" at y≈406, need a scroll | OK | OK |
| Tablet setup page | OK ("Done, next" just below the fold) | Problem (minor): each step needs a scroll (P7) | OK | OK |

| # | Sev | Fix |
|---|---|---|
| O1 | **High** | Guide stage below `lg`: make the controls and answer row `position:sticky; bottom:0` with a background (`GuideStage.tsx:119-125`), and in `keepNewestInView` scroll so the question card's bottom lands just above that bar. Optionally hide the stage chip and shrink the question type when `max-height: 500px`. |
| O2 | **High** | Build screen below `lg` (`BuildScreen.tsx:351-428`): give `main` a fixed height (`h-[100dvh]` minus the top bar). Split it into preview (about 55%) and chat (about 45%) with the chat scrolling inside, and keep the change box and Ship pinned at the bottom of the chat section. On landscape phones (`max-height:500px`), use side by side (`grid-cols-[2fr_3fr]`) like `lg`. |
| O3 | **High** | Tablet portrait (820-1023px) is the main kid device. Apply O2's split there, or switch `lg:` breakpoints to `md:` for the Build and Ship grids so the iPad portrait gets the two-column layout. |
| O4 | Low | Re-run `keepNewestInView` on `resize` and `orientationchange` (GuideStage and BuildScreen). |

## Needs a real device

- **The on-screen keyboard on iPad and Android tablets**: whether the answer box and Send stay visible when the keyboard opens, and whether `100vh` / `lg:h-[calc(100vh-56px)]` jumps when the iOS address bar shows or hides (consider `100dvh`).
- **iOS Safari bottom safe area**: the fixed countdown and the bottom answer row with the home indicator (needs `env(safe-area-inset-bottom)`).
- **Opening a pass by QR on a real iPad or Android phone** over the home Wi-Fi: the certificate warning, the `https://<ip>:4791` URL, and that the pass page is legible.
- **The tablet setup wizard on each platform** (iPad profile install, Android "CA certificate", Samsung, Chromebook), including the Check step. This can't be emulated.
- **Real touch**: the 31px kid top-bar buttons and the ✕ in the change list with a child's finger; double-tap zoom on the pass code input.
- **The talk mode flow** (I did not test it here: no microphone, no sound). The mic button, the voice menu popover (`Journey.tsx:200`), which opens *upward* and may clip at the top on landscape phones, and the speech problem messages.
- **The built app inside the sandboxed iframe on iPad Safari**: touch events, audio unlock on first tap, and the in-memory storage shim.
- **Windows high-contrast / forced-colors mode** on the parent side (pills and meters are color-only).
- **A screen reader pass** (NVDA on the laptop, VoiceOver on iPad): the conversation `aria-live` regions (the guide card and Thinking both announce), and the modals (A4).

## Family trial notes (for the revision round)

- **Samsung tablet, after setup: the pass page still said "Connection is not secure"** although the Check step showed "All set". The cause was Chrome remembering a certificate warning that was tapped through earlier in the same session. Fully closing Chrome and opening a new pass cleared it. Fix: add one line to the setup page's "All set!" message (`server/tabletSetupPage.ts`): "If the kid page still says not secure, close the browser completely and open a new pass."
- **A teaching progress view while the app builds (learner decision: "B plus C").** Today the kid sees "Building your app…" for one to two minutes or more.
  - B: stream the builder's text while Opus writes it (same call, no extra cost), detect what's being written (layout and colors, drawings, the rules of the app, sounds, remembering) and show plain-language milestones with a short teaching line, plus a progress bar by how much has been written. Never show the unchecked code itself. Kids get playful wording; teens may see the real terms (HTML, CSS, JavaScript) and the names of the parts being written. Changes (small edits) get a shorter version.
  - C: at the Tech plan, the guide writes 4–6 build steps in the kid's own words ("the rocket", "the asteroids", "the scoreboard"), and the milestones tick those off, so the kid sees their plan turn into code.
  - Check first: that partial streaming works with the way the builder calls Claude Code. Talk mode reads one or two milestones aloud, not all.
- **An idea library for kids who get stuck (learner request).** More than 100 ideas by age group and theme, each detailed enough for the guide and builder and open to customizing (`devpost/idea-library.json`). Decide how the guide offers them: today the guide is told never to suggest ideas from the theme, because the theme is only Build With Me's look.
- **"Show me ideas" when a kid is stuck (learner decisions).** Very light: the goal is to show quickly what can be done, so the kid starts creating instead of losing interest.
  - An always-visible **💡 Show me ideas** button at the Idea stage, big for kids and smaller for teens ("Need inspiration?"). Not the word "HELP". No Claude call: ideas come straight from the library, instantly.
  - A light trigger with no second question: a first answer like "I don't know", "idk", "nothing", "help" or one or two words shows the ideas right away. In talk mode, after about 20 seconds of silence the button glows **and** the guide asks gently ("Want some ideas?").
  - 3 picture cards matched to age group and theme mood (emoji, title, pitch), a 4th card **✨ Something else** (back to their own idea), and **🔀 More ideas** to shuffle. Talk mode reads the three titles aloud.
  - Picking a card starts the customizing at once: the guide asks the idea's first "make it yours" question, so in two or three taps it's their app.
  - The parent report says it honestly: started from a library idea and how the kid made it theirs.
  - Later, not now: the same button at other stages (Design: "🎨 Show me looks").
