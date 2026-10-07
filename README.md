# Build With Me at Home

A Claude Code plugin for parents. You introduce your own kids to Claude Code and to planning before building: together with a friendly guide, they turn an idea into a small working app of their own. It runs on your computer and your Claude account, with you supervising: kids can only use it with a timed pass you give them, and you get a report after every app they make.

> **You're responsible for how your kids use this.**
> Build With Me runs on *your* Claude account. Anthropic's terms say Claude users must be 18 or older, so letting your kids use it is your decision. They can only use it with a pass you give them, for as long as you choose. You'll get a report after every app they make. The safety check and reports help you supervise; they don't replace you. Stay nearby, especially with younger kids.

## What a kid does

1. You give a pass on your laptop (a QR code, or "Open on this laptop").
2. The kid picks a look, then talks or types with the guide through six steps: **Start, Idea, Design, Tech plan, Build, Ship**. Stuck? **💡 Show me ideas** offers ideas from a built-in list of 128.
3. Claude builds the app while the kid watches their plan turn into code, and can ask for changes.
4. The app goes on the kid's **My apps** shelf, with its own icon.
5. You get a report: what they made, whose ideas they were, anything worth a chat, and how much of your plan it used.

Kids (under 13) get short questions and picture cards; teens (13–17) see and approve the plans.

## What you need

- **Windows or Mac.** Built and tested on Windows 11; the Mac steps are the same but less tested.
- **The Claude Code command-line tool (`claude`)**, signed in, on a plan that includes Claude Code. The Code tab in the Claude desktop app isn't enough on its own; setup offers Anthropic's official installer if `claude` is missing.
- **Node.js 22 or newer.** Setup offers to install it if it's missing.
- For tablets: the tablet and the laptop on the same home Wi-Fi.

## Install

In Claude Code, run these two commands:

```
/plugin marketplace add paveliko123/build-with-me-at-home
/plugin install build-with-me@build-with-me-home
```

Then start it:

```
/build-with-me:start
```

The first time, Claude Code checks everything and fixes what it can, asking you before it installs anything:

- if `claude` isn't signed in, it asks you to run `claude`, type `/login` and finish in the browser (Build With Me never sees your password or tokens);
- it installs the app's packages (about a minute);
- it downloads the speech-to-text model (about 250 MB, once), so talking works on this computer.

Your browser then opens Build With Me. Create a parent PIN and add your kids (a nickname, Kid or Teen, and an emoji). A **Build With Me** shortcut appears on your desktop: from now on, just double-click it.

On Windows, a firewall window may ask about Node.js. Choose **Private networks** so tablets at home can connect.

## Every day

1. Double-click **Build With Me** on the desktop (or run `/build-with-me:start` in Claude Code) and enter your PIN.
2. Under **Give a pass**, pick the kid and how long, then **Create pass**.
3. The kid scans the QR code with a tablet, or you tap **Open on this laptop**. One device per pass; you can extend or end it from your laptop.

## Tablets and phones

Talking from a tablet needs a secure connection, so each tablet is set up once: in the Parent area, open **Kids & their apps → 📱 Set up a tablet or laptop for talking** and follow the steps on the tablet (it installs a certificate that only works on your home network). Typing works without it.

## Forgot your PIN

In Claude Code: `/build-with-me:reset-pin`

## Updating

In a terminal:

```
claude plugin marketplace update build-with-me-home
claude plugin update build-with-me@build-with-me-home
```

The next start picks up the new version by itself (the first start after an update takes about a minute longer). Your kids, their apps, the reports and your PIN are kept.

## Uninstalling

In a terminal:

```
claude plugin uninstall build-with-me@build-with-me-home
```

This removes the app. Your family's folder (see below) stays, so nothing your kids made is lost by accident; delete the folder yourself to remove everything. You can also delete the desktop shortcut.

## Privacy: what's stored and what leaves your computer

- **Everything is stored on your computer**, in your family's folder: `C:\Users\<you>\Build With Me` on Windows, `~/Build With Me` on a Mac. It holds the kids' profiles, their conversations and plans, their apps and the reports (the readable reports are in its `Reports` folder). Build With Me refuses to use a cloud-synced folder (like OneDrive) for it.
- **App files** (the program, the home certificate for tablets, the speech model, a log) live in Claude Code's plugin data folder.
- **What leaves your computer:** the kids' conversations and plans go to Anthropic through *your* Claude Code, the same way your own Claude Code use does, to run the guide, build the apps, check safety and write your reports. Nothing else is sent anywhere: no accounts, no analytics, no tracking.
- **Talking stays local:** speech-to-text runs on this computer; the guide's voice is your device's built-in voice.
- **Personal details are hidden:** obvious personal details a kid types or says (a full name, home address, school, phone number or email) are masked before anything is saved or sent, a safety check looks for ones the masking missed, and the guide kindly says they aren't needed.
- **The kids' apps** run in a sealed-off frame with no internet access.
- **Your home network:** tablets reach the kid side only, with a pass. The Parent area only opens on the laptop itself, behind your PIN.
- **Deleting:** removing a kid in **Kids & their apps** deletes all of their data (conversations, apps, reports and passes) after a warning. Nothing is deleted automatically otherwise.

## Usage of your Claude plan

Build With Me uses your Claude Code plan. A typical app takes a few percent of the 5-hour limit (the reports show each app's share). Each pass is capped (10 requests a minute, 150 an hour, 5 new apps and 30 builds), so one pass can't use up your plan, and the Parent area shows your 5-hour and weekly limits.

## For developers

```bash
npm install
npm run dev:server    # the server on :4747
npm run dev:web       # the front end with hot reload (in a second terminal)
```

- `npm run typecheck` and the checks that make no Claude calls: `npm run verify:revisions`, `npm run verify:security`, `npm run test:guard`.
- `npm run release` type-checks, runs those checks, builds the front end and the server into `app/dist/` and scans it for private data. `app/dist/` is committed, so families never need a build step.
- Try the plugin from this folder with `claude --plugin-dir .`.
- The planning documents (scope, product requirements, technical spec, build checklist, security audit) are in `devpost/`; the `.html` files are the easiest to read.

## Credits and license

MIT License; see [LICENSE](LICENSE). The guide's stage instructions are the Devpost Learn "Build With AI: Basics" course skills, used under their own MIT License (Copyright (c) 2026 Devpost); see [app/skills](app/skills).

Security issues: see [SECURITY.md](SECURITY.md).
