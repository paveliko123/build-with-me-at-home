---
description: Reset the Build With Me parent PIN (kids, apps and reports are kept)
allowed-tools: Bash(node:*)
---

The parent forgot their Build With Me PIN. Run:

`node "${CLAUDE_PLUGIN_ROOT}/app/reset-pin.mjs"`

Then tell them, in one sentence, to open Build With Me on this computer (desktop shortcut or `/build-with-me:start`) and choose a new PIN. Their kids, apps and reports are unchanged.
