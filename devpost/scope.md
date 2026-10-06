---
doc: scope
status: approved
---

# Build With Me at Home (working name)

A parent and their kid build real apps together through the plan-first journey. It runs entirely on the family's computer, using the parent's own Claude Code login.

## The Unique Kernel
**A parent introducing their kid to Claude, with the parent kept in the loop.**
- The kid talks through the friendly plan-first journey (start → scope → PRD → spec → build → ship) and ends with a real app.
- Everything runs on the parent's own Claude, on the family's own computer. There is no per-app cost and no data on someone else's server.
- Every finished app ends in two places:
  - **for the kid:** a link to try the app
  - **for the parent:** a report from a separate Opus 5.5 review of the whole conversation, from the idea to the final app. It covers what was built, any red flags (the kid trying to do something they shouldn't), and the app's link.

## Who It's For
- **The parent:** has a Claude subscription and Claude Code installed, and "likes coding or at least is not afraid of it." They install it once and own the account it runs on.
- **Their kids:** under 13 and 13–17, guided by that parent. No adults as users. The consumer terms don't allow sharing an account with other grown-ups.
- **What they do today:** the hosted Build With Me charged about $2 per app on the owner's API key. That doesn't work for a kid who "was ready to build 5 apps a day." The plan-first course itself runs in a terminal and is written for adults.

## The Core Loop
1. The parent double-clicks to start the app (no terminal) and passes the parent sign-in. That screen says plainly, with no legal language, that the parent is responsible for how their kid uses it.
2. The kid picks a theme and talks (or types) through the six steps, with the guide adjusted to their age group.
3. A live safety check watches the conversation as it happens.
4. The finished app gets a local link and a place on the **My apps** shelf, where it stays for weeks or months.
5. The parent gets the Opus report.

They come back because it costs nothing extra per app, and each app is about them.

## Inspiration & Identity
- Keep the existing Build With Me visual design and app flow. "They work great," with minor tweaks.
- Simple for everyone: "the simpler the better, both for the users and for the installer."

## Why This Matters to the Learner
- **Cost:** "Claude Code API is great but the cost is prohibitive. Charging $2 per each app is not practical."
- **Kid safety without the compliance burden:** "instead of dealing with policies, account deletion, data retention and so on, this becomes a personal project for each parent where everything stays local."
- **Learning goal:** understand the pros, cons and limitations of running local copies.

## What "Working" Looks Like
The parent signs in, and the kid talks through the journey and builds a real app. The app opens from its local link and stays on the My apps shelf. **The "oh, that's cool" moment: the parent's report appears.** It says what was built, gives the red flags (or "none"), and includes the link.

## The POC Boundary
- **A local wrapper** that the parent starts with a double-click. It runs its own small local server for its screens and the kids' apps, so nobody types server commands.
- It runs on the parent's **unmodified, already-signed-in Claude Code**. The app never handles the Claude sign-in or its tokens.
- **A parent sign-in gate**, with a plain-language "you're responsible" screen.
- **The kid and teen paths,** with the existing design and flow, through all six steps.
- **Talking** (speech in, voice out) without API keys.
- **Safety, in three layers, all on the parent's Claude:**
  - the guide is told it's talking with a kid of that age group
  - a live check on what the kid says and what the guide replies
  - the parent's Opus report
- **Local storage:** each app is one HTML file in a folder, plus the My apps shelf and local links. Ten or more apps, kept for weeks or months.

## Later
- **Sharing outside the home (hosting).** Optional, to evaluate in step 5. For now, a link works only on that computer, while the wrapper is running.
- A more natural voice than the browser's own voices.
- The "behind the scenes" learning session after an app is finished.

## Explicitly Cut
- **Firestore and the Firebase setup.** Replaced by files on the family's computer.
- **API keys, App Check, and the Google Cloud voice.** They all need keys and accounts. The goal is the simplest possible install.
- **Invite codes and the allowance.** No per-app cost, so nothing to meter.
- **Adults as users.** The consumer terms bar making an account "available to anyone else."
- **Public-service compliance work** (account deletion, data retention, a public privacy page). Each install is a parent's own project. The conversation still reaches Anthropic under the parent's own account and terms.

## Terms Check (2026-10-06)
- **Allowed:** the [Claude Code legal page](https://code.claude.com/docs/en/legal-and-compliance) allows a user to sign in to the unmodified Claude Code program with their own subscription, even when another product runs Claude Code. Apps may not offer Claude login themselves, or collect, store or intermediate sign-in tokens.
- **The constraint:** the [Consumer Terms](https://www.anthropic.com/legal/consumer-terms) say "You must be at least 18 years old…" and "You also may not make your Account available to anyone else." Pro and Max limits also assume "ordinary, individual usage."
- **The learner's decision:** narrow the scope to the parent guiding their own kids, with a parent gate and plain-language responsibility, and no sharing with other adults.
- Not legal advice. The learner reviews the terms themselves.

## Open Questions for the PRD and Spec
- **What the parent gate actually is:** the Claude sign-in on the machine, plus an app-level parent step (a PIN, for example).
- **Whether "talking" stays local.** Chrome's built-in speech recognition sends audio to Google's servers, which would need disclosing or replacing.
- **How the wrapper runs Claude Code** for the guide, the builder, the safety check, and the report. This also covers how much of the parent's subscription usage each app takes.
