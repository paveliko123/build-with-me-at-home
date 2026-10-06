---
description: Start Build With Me at Home (introduce your kids to Claude Code, with you supervising) and open it in the browser
allowed-tools: Bash(node:*)
---

Start Build With Me for the parent. Keep your messages short and friendly; the parent may not be technical.

1. Run the check:
   `node "${CLAUDE_PLUGIN_ROOT}/app/setup-check.mjs" --data "${CLAUDE_PLUGIN_DATA}"`
2. If the JSON says `"ok": true`, start the app:
   `node "${CLAUDE_PLUGIN_ROOT}/app/launch.mjs" --data "${CLAUDE_PLUGIN_DATA}"`
   Then tell the parent in one or two sentences that Build With Me is open at the `url` from the output, and that next time they can double-click **Build With Me** on the desktop (if a shortcut exists) or run `/build-with-me:start`.
3. If anything is not ok, follow the `setup` skill of this plugin (`/build-with-me:setup`) to fix it, then come back to step 2.

Never ask for, read, or handle Claude passwords, tokens or credential files.
