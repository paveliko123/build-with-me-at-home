# E2 results: local speech and the home certificate

Run on 2026-10-06 15:10 · **10/10 mechanical checks passed**

## In plain words

- **The home certificate** works for this computer's home addresses, and it is **refused for any outside address**, so it can't be misused for real websites.
- **Speech to text** runs on this computer with Moonshine (faster than Whisper for short sentences; see the benchmark). The "warm wait" row is how long a kid waits after they stop talking (the audio itself is only kilobytes on Wi-Fi).
- **Still to do by hand:** install the certificate on a real tablet from `/setup-tablet` and try `/talk-test` there (learner check).

| Result | Check | Detail |
|---|---|---|
| ✅ | home authority has name constraints (critical) | constraints extension present, critical=true |
| ✅ | authority can only sign server certificates (pathLen 0) | ca=true pathLength=0 |
| ✅ | home network address found | <home-ip> |
| ✅ | HTTPS works when the home authority is trusted | GET /api/health → 200 |
| ✅ | HTTPS on the home address | https://<home-ip>:4758 → 200  |
| ✅ | home certificate cannot vouch for an outside address | cert for 8.8.8.8 → permitted subtree violation |
| ✅ | setup-tablet page served | 2595 bytes |
| ✅ | iPad profile download | 200 application/x-apple-aspen-config; charset=utf-8 |
| ✅ | speech-to-text runs on this computer (first run, includes model load/download) | "I want to make an app where my cat flies through space and eats the stars." · 16/16 words · 3.8 s |
| ✅ | warm wait after talking stops < 3 s (laptop) | 1.23 s for 4.6 s of speech (model 1.22 s) |

## Tablet results (learner check)

Tried by the learner on 2026-10-06 (laptop browser and an Android phone standing in for a tablet).

| Device | Spoken | Wait after stopping | Result |
|---|---|---|---|
| Laptop (Chrome/Edge, localhost) | 1.8–5.9 s | 0.1–0.5 s | Correct ("Fest" once for "Test") |
| Android phone, home Wi-Fi, HTTPS | 3.3 s | 0.3 s | Correct |
| Android phone, long message | 20.7 s | 1.8 s | Nearly perfect over 20 seconds |

- **First attempt:** the certificate was never installed. Tapping the downloaded file does nothing on recent Android, where CA certificates must be installed from Settings. The setup page now spells out the Settings path.
- **After installing it from Settings as a CA certificate:** no browser warning, and the microphone works.
- **Learner feedback:** the install steps are "very not intuitive." To be addressed in the parent area's tablet setup (see checklist Revisions).
