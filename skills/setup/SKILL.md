---
name: setup
description: Install or repair Build With Me at Home on this computer. Checks Node.js, the Claude Code command-line tool and its sign-in, the app's packages, the speech model, the data folder and the network port, fixes what it can (with the parent's normal approval prompts) and explains the rest. Use when the parent asks to set up, install, repair or start Build With Me, or when /build-with-me:start reports a problem.
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/app/setup-check.mjs" *)
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/app/launch.mjs" *)
---

# Set up Build With Me at Home

You are helping a parent install Build With Me, a local tool where a parent introduces their own kids to Claude Code by building small apps together, on the parent's own account. Be warm, short and concrete. Explain any step that installs something before you run it. The parent's normal permission prompts apply to everything you run.

**Hard rule:** never ask for, read, copy or handle Claude passwords, tokens, API keys or credential files. Signing in to Claude always happens through Anthropic's own sign-in page, done by the parent.

**Say this once, before the first install step:** Build With Me runs on the parent's own Claude account. Anthropic's terms say Claude users must be 18 or older, so letting their kids use it is the parent's decision and responsibility; passes and reports help them supervise, they don't replace them.

## 1. Check

Run:

`node "${CLAUDE_PLUGIN_ROOT}/app/setup-check.mjs" --data "${CLAUDE_PLUGIN_DATA}"`

It prints JSON with `items`, each with `id`, `ok`, `detail` and, when not ok, a `fix`. Fix the problems **in this order**, re-running the check after each fix.

## 2. Fix

- **`node`**: Node.js 22+ is missing or too old. Offer to install it:
  - Windows: `winget install OpenJS.NodeJS.LTS`
  - Mac: `brew install node` (if Homebrew exists), otherwise point to https://nodejs.org
  After installing, the parent may need to restart Claude Code so the new `node` is found.
- **`claude-installed`**: the `claude` command-line tool isn't installed. This is common when someone only uses the Claude desktop app, whose built-in Claude Code can't be used by other programs. Offer Anthropic's official installer:
  - Windows (PowerShell): `irm https://claude.ai/install.ps1 | iex`
  - Mac: `curl -fsSL https://claude.ai/install.sh | bash`
  If it reports that `~/.local/bin` isn't on PATH, Build With Me still finds it. Mention the PATH tip only if the parent wants `claude` in their own terminals.
- **`claude-signed-in`**: ask the parent to do this themselves, in a separate terminal:
  1. run `claude` (on Windows, if not found: `& "$env:USERPROFILE\.local\bin\claude.exe"`)
  2. type `/login` and finish in the browser
  3. type `/exit`
  Wait for them to say it's done, then re-check.
- **`packages`**: run `node "${CLAUDE_PLUGIN_ROOT}/app/setup-check.mjs" --install-packages --data "${CLAUDE_PLUGIN_DATA}"` (takes a minute).
- **`speech-model`**: run `node "${CLAUDE_PLUGIN_ROOT}/app/setup-check.mjs" --download-model --data "${CLAUDE_PLUGIN_DATA}"` (about 250 MB, once). It needs `packages` first.
- **`data-folder`** or **`port`**: explain the `fix` text in plain words.

## 3. Start

When everything is ok, run:

`node "${CLAUDE_PLUGIN_ROOT}/app/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}"`

It creates a **Build With Me** shortcut on the desktop the first time (the `shortcut` field in its output). Don't ask about it. Tell them:
- The browser opens Build With Me. The first time, they create a parent PIN and add their kids.
- On Windows, a firewall popup may ask about Node.js. Choose **Private networks** so tablets can connect.
- A **Build With Me** shortcut is now on the desktop: next time, just double-click it (or run `/build-with-me:start`).
- Forgot the PIN? `/build-with-me:reset-pin`.
