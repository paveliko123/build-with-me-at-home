---
doc: prd
status: approved
---

# Build With Me at Home — Product Requirements

A local app on the family's computer. A parent gives one of their kids a timed, one-use pass, and the kid **talks** their way through the plan-first journey (start → idea → design → tech plan → build → ship) to a real working app, on the laptop or a tablet on the home Wi-Fi. Everything runs on the parent's own signed-in Claude Code. Every finished app ends in two places: a link on the kid's **My apps** shelf, and a **parent report** in the Parent area.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

**Mockups (reference designs, approved in the interview):**
- `devpost/parent-mockup.html`: the opening screen and the parent home
- `devpost/report-mockup.html`: all reports and one report

## The Core Journey
Source: `scope.md > The Core Loop`, `scope.md > What "Working" Looks Like`.

**First run (once).**
1. The parent installs it as a **Claude Code plugin** from the public GitHub repo, with one install command in Claude Code, and starts it with `/build-with-me:start` (see **Installing and Updating**).
2. The app checks that Claude Code is installed and signed in. If it isn't, it explains how to fix that before going on.
3. The parent reads the responsibility note, creates a **PIN**, and adds each kid: a nickname, **Kid (under 13)** or **Teen (13–17)**, and an emoji.
4. Setup offers to add a **desktop shortcut**, so later starts are a double-click.

**Every time.**
1. **Opening (laptop).** The parent double-clicks the shortcut (or types `/build-with-me:start` in Claude Code). The browser opens, and the opening screen shows the **"You're responsible"** note, the PIN, and **Enter**, which leads to the **parent home**.
2. **Give a pass.** The parent picks the kid and a length of time (a preset or any custom length) and presses **Create pass**. A **QR code** appears, with "open on this laptop" as an alternative.
3. **The kid opens the pass.** They scan the QR code on a tablet on the home Wi-Fi, or the parent opens it on the laptop. That device gets the pass, and the QR code stops working.
4. **The kid's journey.** Welcome ("your helper is an AI, not a person," talk or type), then Theme, then the six steps. The guide adjusts to the kid's age group from their profile (see **The Kid's Journey**).
5. **Ship.** The kid names the app. It goes on their **My apps** shelf with a link and a home-Wi-Fi QR code.
6. **The parent report.** A separate Opus 5.5 review of the whole conversation is saved in the Parent area and in the reports folder. Flags also show under **Needs your attention**.
7. **Time.** Ten minutes before the pass ends, the kid sees a countdown. The parent can extend the pass from the parent home on the laptop. At zero, a friendly "Time's up" screen appears, and the work waits for the next pass.

**Success:** a kid has a working app on their shelf, and the parent has a report for it.

## Screens and Layout

**Parent side (laptop only).** Laid out as in `parent-mockup.html`.
1. **First-run setup:**
   - the Claude Code check
   - the responsibility note
   - create the PIN
   - add the kids
2. **Opening screen,** top to bottom:
   - the app name
   - the "You're responsible" note
   - the PIN pad
   - **Enter**
3. **Parent home:**
   - **status strip:**
     - Claude Code signed in, and the plan
     - the **5-hour limit** with % used and the reset time
     - the **weekly limit** with % used and the reset day
   - **🎟️ Give a pass:** pick the kid, pick a duration (presets plus custom), Create pass, then the QR code
   - **⏱️ Active passes:** one row per kid, with the live time left, the device, the current step, and **+30 min / +1 hr / End now**
   - **🔔 Needs your attention:** flags and limit-reached alerts
   - **📄 Latest reports:** with "All reports →"
   - **🧒 Kids & their apps:** Manage, Add a kid, and **📱 Set up a tablet for talking**
   - **⚙️ Settings** (change the PIN) and **🔒 Lock**
4. **All reports:** a table with when, who, what was built, safety, and the app link (`report-mockup.html`, first tab).
5. **One report:** described in **The Parent Report** (`report-mockup.html`, second tab).

**Kid side (laptop or tablet).** Build With Me's screens, kept as they are:
1. **Welcome:** "your helper is an AI, not a person," talk or type.
2. **Theme:** large picture buttons.
3. **Guide conversation** (Intro to Tech plan):
   - a large question card
   - answer cards
   - a picture or mock-up area
   - the talk button and answer box
   - for teens, the plan to approve
4. **Build:** about ⅔ app, ⅓ chat.
5. **Ship:** name, link, home-Wi-Fi QR code, celebration.
6. **My apps:** this kid's apps only.

Overlays and messages: the countdown, Time's up, Limit reached, Pass already used, and Can't reach the computer.

## Look and Feel
Source: `scope.md > Inspiration & Identity`.
- **Kid side:** Build With Me's existing design, as is ("they work great"):
  - very graphical but clean, with large clear fonts (largest for kids)
  - themes that set the helper's style only (unicorns, princesses, robots, cars, space, neon arcade, music, sports, nature, office)
  - ideas that turn into pictures early
  - finished apps that look great: drawn characters, depth, animation, sound with a mute button
  - **Avoid:** walls of text, anything that looks like a terminal, and generic AI-app styling.
- **Parent side:** calm and clear, like `parent-mockup.html`:
  - rounded cards on a warm off-white background, with a green accent
  - plain words and emoji section icons
  - light and dark modes
  - glanceable: the time left, % used, and flags readable in a second
- Minor tweaks to either side come after the learner sees it running (see **Open Questions**).

## Features and Behavior

### Installing and Updating
Source: learner discussion after the first PRD draft. Delivery replaces a share link for a local app.
- As a parent who already uses Claude Code, I want to add Build With Me with one command, on Windows or a Mac.
  - [ ] **Install:** one Claude Code plugin install command, pointing at the public GitHub repo, adds Build With Me. No other downloads, accounts or keys, unless a required runtime is missing; the Spec checks for one.
  - [ ] **Start:** `/build-with-me:start` in Claude Code starts the app and opens the browser to the opening screen (or to first-run setup the first time).
  - [ ] **Desktop shortcut:** setup offers one. Afterwards a double-click starts the app with no terminal and no Claude Code window to manage.
  - [ ] **Windows and Mac:** the same steps and the same screens on both.
  - [ ] **Updating:** Claude Code's normal plugin update brings the new version. Kids' apps, reports, kids and the PIN are kept.
  - [ ] **Uninstalling:** removing the plugin removes the app. The kids' apps and reports stay in their folder until the parent deletes them *(assumption)*.
  - [ ] **The repo's README** explains install, start, tablet setup and uninstall in plain words for a parent.

### Parent Gate and Responsibility
Source: `scope.md > The POC Boundary`, `scope.md > Terms Check`.
- As a parent, I want the app to open only for me, so my kids can't use my Claude account without my say-so.
  - [ ] The opening screen shows the "You're responsible" note in plain words, above the PIN and Enter. It says:
    - the app runs on your Claude account
    - kids get in only with your pass
    - you get a report for each app
    - stay nearby
  - [ ] Nothing on the parent side works without the right PIN.
  - [ ] **🔒 Lock** returns to the opening screen.
  - [ ] The app never asks for or shows a Claude password or sign-in. The Claude sign-in stays in Claude Code.

### First-Run Setup
- As a parent installing it, I want a short setup that tells me if anything is missing.
  - [ ] If Claude Code is missing or signed out, a plain message says what to do. Setup can't continue until it's fixed.
  - [ ] The parent creates a PIN (entered twice) and adds at least one kid: nickname, Kid or Teen, and emoji.
  - [ ] After setup, the parent lands on the parent home.

### Kids
- As a parent, I want each kid set up once, so each pass, guide and report fits that kid.
  - [ ] Kids can be added, edited or removed in **Kids & their apps**.
  - [ ] A kid's age group (Kid or Teen) is set only here, by the parent. Nothing the kid says changes it.

### Passes
Source: `scope.md > The Core Loop`.
- As a parent, I want to give one kid access for exactly as long as I choose.
  - [ ] Create pass needs a kid and a duration. Duration has presets (30 min, 1 hour, 2 hours, Rest of today) or any custom length.
  - [ ] The QR code is **single-use**. The first device that opens it holds the pass. Opening it again on any device shows "This pass was already used — ask your parent for a new one."
  - [ ] "Open on this laptop" uses up the pass the same way.
  - [ ] The pass works only on the home Wi-Fi or the laptop itself, and only until it ends.
  - [ ] **Active passes** shows each live pass: kid, device, current step, and a live countdown.
  - [ ] **+30 min / +1 hr** extend the pass right away, and the kid's countdown updates on its own. **End now** ends it right away.
  - [ ] More than one kid can hold a pass at the same time, one pass per kid.
- As a kid, I want to know when time is running out, so I'm not cut off by surprise.
  - [ ] At 10 minutes left, a friendly countdown appears on the kid's screen and stays visible.
  - [ ] At zero, a "Time's up for today!" screen appears. An unfinished conversation is saved. A build that's already running finishes and is saved. The next pass for that kid resumes exactly there.

### The Kid's Journey
Source: `scope.md > The POC Boundary` ("the existing design and flow"). This is Build With Me's journey, kept as is. Only the parent's profile setting changes the guide.

| | Kid (under 13) | Teen (13–17) |
|---|---|---|
| Teaching | None spoken. The process is the lesson | The guide names the ideas: design first, test and fix |
| Questions | Open first; 1–2 picture idea cards if stuck | Open first; cards only when unsure |
| Who decides | The kid owns the idea and the look; the guide does the tech and writes the plans behind the scenes | The teen owns the idea and the look and approves the Idea and Design plans |
| Ideas | Lean toward useful and creative over games | Their own idea first, sharpened |
| Plans | Never shown | Shown in plain words for approval |

- **Welcome:**
  - [ ] Shows "Your helper is an AI, not a person." The guide's first words say it too.
  - [ ] The kid chooses talking or typing.
- **Theme:**
  - [ ] The theme is the only choice. It sets the helper's look and voice.
- **Intro and Start:**
  - [ ] Kids get at most two easy questions.
  - [ ] Teens hear in one or two sentences that we plan first, then build.
- **Idea:**
  - [ ] "I don't know" gets 1–2 opposite-end idea cards with pictures (kids).
  - [ ] A too-big idea gets a friendly pushback and a smaller version.
  - [ ] Teens approve the idea plan.
- **Design:**
  - [ ] "Pick a look" from two mock-ups.
  - [ ] Teens approve the design plan.
  - [ ] The build honors the chosen look.
- **Tech plan:**
  - [ ] The guide makes every tech choice.
  - [ ] It gives a one-line "Here's how I'll build it!"
- **Build:**
  - [ ] About ⅔ app, ⅓ chat.
  - [ ] A themed animation plays while building.
  - [ ] The result is a true working app.
  - [ ] Changes go on a list, and rebuilding applies them. Anything left out is said honestly.
  - [ ] A broken app is repaired automatically, and nobody sees raw errors.
- **Ship:**
  - [ ] The kid names the app, and the name is its title.
  - [ ] It goes on the kid's My apps shelf with its link and home-Wi-Fi QR code.

### Talking
Source: `scope.md > The POC Boundary` ("talking without API keys"), `scope.md > Open Questions`.
- As a kid, I want to talk to my helper on the laptop or the tablet, and hear it talk back.
  - [ ] **On the laptop:** full talking. The guide reads its words aloud, and listening is hands-free after it speaks, with an "I'm done" button.
  - [ ] **On a tablet:** full talking after a **one-time parent setup**. **📱 Set up a tablet for talking** shows a QR code that opens a **guided wizard on the tablet**:
    - one step per screen, with the right path for iPad, Pixel or Samsung
    - a final **Check** that turns green ✅ when the tablet trusts the computer, or names the missed step

    Phones and tablets block websites from installing certificates silently, so a person must approve it once in Settings (learner decision, 2026-10-06, after E2).
  - [ ] **A tablet that isn't set up** falls back to the keyboard's own 🎤 dictation button and the guide still talks. A friendly note tells the parent how to set it up.
  - [ ] **Kids' voices stay in the house.** Speech is turned into text on the family's own devices, not by an outside service.
  - [ ] Each theme has its own voice. Kids get a gentler, slower pace. A ⚙️ menu holds the voice and speed.
  - [ ] No microphone means typing, with a friendly note.

### Safety
Source: `scope.md > The POC Boundary` (three safety layers). Everything runs on the parent's Claude.
1. **The guide knows who it's talking to.**
   - [ ] Each session's guide follows the kid's age group, with age-appropriate rules for content and wording.
2. **A live check on every turn.**
   - [ ] What the kid says and what the guide replies are both checked before anything is shown or built.
   - [ ] An unsuitable request (for example, "make the cat explode with blood") gets a gentle redirect to a kid-friendly alternative. It's never built and never scolded.
   - [ ] The guide never asks for personal details. If one is offered (a full name, school or address), the guide kindly says it doesn't need it, and it doesn't appear in the guide's replies, the plans or the app.
   - [ ] Every redirect and every personal detail becomes a **flag** for the report.
3. **The parent report** (below) is the backstop.

### Limit Reached
- As a parent, I want to know when my kid hits my Claude plan's limit, and my kid shouldn't be confused by it.
  - [ ] The kid sees a friendly "Limit reached — ask your parent about it." The work is saved.
  - [ ] **Needs your attention** shows when it happened, during which kid's session, and when the limit resets.
  - [ ] When the limit resets and the pass is still active, the kid can continue where they stopped.

### My Apps
- As a kid, I want my apps to stay on my shelf so I can play with them any time I have a pass.
  - [ ] Each kid's shelf shows only their own apps, newest first, with name, picture and Open.
  - [ ] Apps stay for weeks or months, until a parent deletes them under **Kids & their apps → Manage**.
  - [ ] An app's link opens on the laptop, or on any device on the home Wi-Fi, while the app is running.

### The Parent Report
Source: `scope.md > The Unique Kernel`. Laid out as in `report-mockup.html`.
- As a parent, I want a report on every app my kid makes, so I know what happened in my account.
  - [ ] A report is made automatically when an app is shipped, by a **separate Opus 5.5 review** of the whole conversation, from the idea to the final app.
  - [ ] A session that ends without shipping (time's up and never resumed, or ended by the parent) gets a "(not finished)" report once the parent ends the pass or it expires.
  - [ ] **Every report contains:**
    - **Header:** the kid, their age group, the date, the safety badge
    - **Facts:** time spent (and the pass length), rounds of changes, device, talking or typing
    - **Plan usage:** % of the **5-hour limit** and % of the **weekly limit** this app used, matching Claude Code's Plan Usage. If that isn't available, tokens and Claude Code's cost estimate instead.
    - **In one paragraph:** what they wanted, what got built, how it went
    - **The app:** a picture, a description and an Open link
    - **Safety:** each flag with what the kid said, what the guide did, and the time and step, plus OK lines for personal details, the guide's output and staying on topic, and a one-line "worth a chat?"
    - **Whose ideas?** The kid's share versus the guide's, with a sentence explaining it
    - **How it went:** a timeline of the steps
    - **Talk about it together:** 1–2 conversation starters
    - **The full conversation,** folded
  - [ ] Each report is saved **both** in the app (**All reports**, behind the PIN) **and** as an HTML file in a dedicated folder (`Documents\Build With Me\Reports`) that opens even when the app isn't running.
  - [ ] **All reports** lists every report newest first: when, who, what was built, a safety badge (No flags / N flags handled / Needs a look), and the app link.
  - [ ] A report with flags also appears under **Needs your attention**.

## States and Boundaries
- **First run, Claude Code missing or signed out:** a plain fix-it message. Nothing else works until it's fixed.
- **Wrong PIN:** "That's not the PIN." After 5 wrong tries, wait 1 minute *(assumption)*.
- **Forgot the PIN:** reset from the laptop, with steps in the app's help *(assumption; Spec decides how)*.
- **No kids added:** Give a pass shows "Add a kid first."
- **QR code opened a second time, or a screenshot of it:** "This pass was already used — ask your parent for a new one."
- **Pass expired or ended:** Time's up. Work saved.
- **App not running, or the laptop asleep:** the tablet shows "Can't reach the computer — ask your parent to start Build With Me." *(The laptop must stay on and awake during a pass.)*
- **Plan limit reached:** described under **Limit Reached**.
- **Plan usage % not available:** the report shows tokens and a cost estimate instead.
- **Unsuitable request:** a gentle redirect, never built, flagged.
- **Personal detail offered:** a kind reminder, not used, flagged.
- **Tablet not set up for talking:** keyboard dictation and a note for the parent.
- **Build fails or the app breaks:** friendly words and an automatic retry. The last working version stays.
- **Coming back:** the kid's next pass resumes their unfinished project. Shipped apps stay on the shelf.
- **Empty states:**
  - My apps: "Your apps will live here!"
  - All reports: "Reports appear after your kids finish an app."

## Product Decisions
- **The parent is the Claude user and brings their kid along.** No adults as users. The consumer terms bar sharing an account, and the age groups already keep adults out.
- **A PIN opens the parent side.** The "You're responsible" note sits above it, in plain words, not legal language.
- **Access is through timed, one-use passes issued to a specific kid.** The parent chooses how much freedom each kid gets each time, "one might want to be there at every sign-in and another might want to give more freedom."
- **The QR code dies once used.** The pass belongs to the first device that opens it.
- **A pass on every device, the laptop included.** One rule everywhere.
- **Extending happens on the laptop,** where the pass was made. The kid gets a 10-minute countdown.
- **Tablet on the home Wi-Fi: in.** Full talking on the tablet is wanted, set up once through a QR code, with keyboard dictation as the fallback.
- **Kids' voices stay in the house.**
- **Reports live locally,** in the app and in a folder. Pushing them into the parent's Claude account isn't possible without the app handling the Claude sign-in, which the terms forbid.
- **Plan usage is shown as % of the 5-hour and weekly limits,** the same scale as Claude Code's Plan Usage.
- **At a limit, the kid sees "ask your parent," and the parent is always told.**
- **The kid side keeps Build With Me's design and flow.** Tweaks come after seeing it run.
- **Delivered as a Claude Code plugin,** because "the target parent is one who already uses Claude Code." It installs from the public GitHub repo, with a desktop shortcut for later starts.
- **Windows and Mac,** "if possible."

## What We're Building
- install as a Claude Code plugin from the GitHub repo, `/build-with-me:start`, a desktop shortcut, on Windows and Mac
- first-run setup: the Claude Code check, PIN, kids
- the opening screen (note, PIN, Enter) and the parent home, as in the mockup
- passes: kid plus any duration, a one-use QR code, active passes with extend and end, the kid's 10-minute countdown, Time's up with resume
- the kid's journey across all six steps, both age groups, Build With Me's design
- talking: full on the laptop; full on a set-up tablet; dictation fallback; voices stay home
- safety: an age-aware guide, a live check both ways, flags
- Limit reached for the kid and an alert for the parent
- My apps per kid, local links, and home-Wi-Fi QR codes
- the parent report (Opus 5.5), All reports, and the reports folder, with plan usage %

## Deferred From the POC
- **Sharing outside the home (hosting):** to evaluate in step 5 (`scope.md > Later`). For now, links work only at home while the app is running.
- **A more natural voice:** beyond the voices available on the device.
- **The "behind the scenes" learning session:** after an app is finished.
- **Reports inside the parent's Claude account:** not possible within the terms. Local reports cover the need.

## Possible Later Enhancements
- Emailing or texting the parent when a report with flags arrives.
- A "pause" button on active passes.
- Per-kid daily time budgets.

## Non-Goals
- **Not for adults as users.** The consumer terms forbid sharing the account.
- **Never handles Claude sign-in or tokens.** It uses the parent's unmodified, signed-in Claude Code.
- **No cloud services, accounts, databases or API keys.** Simplicity was the whole point of going local.
- **No public-service compliance work.** Each install is a parent's own project.
- **Not a game generator,** and not a mock-up tool. The end product is a true working app.

## Open Questions
- **Does the plugin need a runtime (such as Node) the parent might not have, and can a plugin create a desktop shortcut?** For the Spec. If a runtime is needed, setup should detect it and give one plain fix step.
- **Is Mac testing possible?** Mac is "if possible." Windows is the primary test machine. For the Spec and the build.
- **Can a tablet get full talking with a reasonable one-time setup?** For the Spec, proven early in the build. The fallback is keyboard dictation.
- **Can the app read the plan usage % when it runs Claude Code in the background?** For the Spec. The fallback is tokens and a cost estimate.
- **How to reset a forgotten PIN.** For the Spec.
- **Do the report sessions also show up in Claude Code's own history?** Nice to know, and can wait for the build.
- **The learner's minor tweaks:** after the app is running. They don't block the Spec.
