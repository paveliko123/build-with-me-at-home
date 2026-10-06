// The guided device wizard (tablets, phones, laptops, Chromebooks) (prd.md > Talking; learner decision after E2: option A).
// One step per screen, per platform, ending with a Check that proves the device trusts the
// computer (it loads https://<laptop>:<httpsPort>/api/health; that only works when the home
// certificate is trusted). Served over plain HTTP because the tablet has no certificate yet.

import { homeAddresses } from './certs.js';

export function setupTabletPage(host: string, httpsPort: number, caName: string): string {
  const ips = homeAddresses();
  const ip = ips.includes(host) ? host : ips[0] ?? host;
  const secureBase = `https://${ip}:${httpsPort}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Set Up for Talking</title>
<style>
:root{--bg:#f6f4ef;--card:#fff;--ink:#1f2430;--muted:#5d6475;--line:#e4ded3;--brand:#2f9e6e;--btn:#23855a;--on-btn:#fff;--brand-soft:#dff3e9;--warn:#b7791f;--warn-soft:#fdf2dc;--bad:#b34a4a;--bad-soft:#f9e2e2}
@media (prefers-color-scheme:dark){:root{--bg:#15171c;--card:#1f232b;--ink:#eceef3;--muted:#a3a9b8;--line:#333945;--brand:#4cc08d;--btn:#4cc08d;--on-btn:#0f2a1e;--brand-soft:#1b3329;--warn:#e0a84a;--warn-soft:#3a3020;--bad:#e07a7a;--bad-soft:#3a2222}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:560px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:24px;margin:0 0 4px}.muted{color:var(--muted)}
.tabs{display:flex;gap:8px;margin:14px 0;flex-wrap:wrap}
.tabs button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:8px 14px;font:inherit;font-size:15px;font-weight:700;cursor:pointer}
.tabs button[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px 20px;min-height:250px;display:flex;flex-direction:column}
.stepno{font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.card h2{font-size:22px;margin:6px 0 10px}
.path{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}
.path span{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:6px 10px;font-weight:700;font-size:16px}
.path i{color:var(--muted);font-style:normal}
.tip{background:var(--warn-soft);color:var(--warn);border-radius:12px;padding:10px 12px;font-size:15px;font-weight:600;margin-top:10px}
.nav{display:flex;gap:10px;margin-top:auto;padding-top:18px}
button.go,a.go{flex:1;text-align:center;background:var(--btn);color:var(--on-btn);text-decoration:none;border:none;border-radius:14px;padding:14px 16px;font:inherit;font-weight:800;cursor:pointer}
button.back{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:14px 16px;font:inherit;font-weight:700;cursor:pointer}
.dots{display:flex;gap:6px;justify-content:center;margin:12px 0}
.dots i{width:9px;height:9px;border-radius:50%;background:var(--line)}.dots i.on{background:var(--brand)}
.result{border-radius:14px;padding:14px;font-weight:700;margin-top:12px}
.ok{background:var(--brand-soft);color:var(--brand)}.bad{background:var(--bad-soft);color:var(--bad)}
[hidden]{display:none!important}
</style></head><body><main>
<h1>📱 Set up this device for talking</h1>
<p class="muted">One time per tablet or laptop, about 2 minutes. Devices only let <b>you</b> approve this, in their Settings, which keeps everyone safe. The certificate only works for your home network.</p>
<div class="tip">This page shows “Not secure”. That’s expected: it’s the page that teaches this device to trust your computer. Kids’ pages will be secure once setup is done.</div>
<div class="tabs" id="tabs">
  <button data-p="ipad">iPad / iPhone</button>
  <button data-p="pixel">Android (Pixel & most)</button>
  <button data-p="samsung">Samsung</button>
  <button data-p="windows">Windows laptop</button>
  <button data-p="mac">Mac</button>
  <button data-p="chromebook">Chromebook</button>
</div>
<div class="card" id="card"></div>
<div class="dots" id="dots"></div>
<script>
const SECURE = ${JSON.stringify(secureBase)};
const NAME = ${JSON.stringify(caName.replace(/[<>&]/g, ""))};
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const P = {
  ipad: [
    { t: 'Download the profile', b: 'Tap the button, then tap <b>Allow</b>. You’ll see “Profile Downloaded”.', btn: ['Download the profile', '/home-certificate.mobileconfig'] },
    { t: 'Install it', b: 'Open the <b>Settings</b> app. At the top you’ll see <b>Profile Downloaded</b>. Tap it, then <b>Install</b> (enter the tablet passcode) and <b>Install</b> again.', path: ['Settings', 'Profile Downloaded', 'Install'] },
    { t: 'Turn on full trust', b: 'This switch is the step most people miss.', path: ['Settings', 'General', 'About', 'Certificate Trust Settings'], tip: 'Turn ON “' + esc(NAME) + '”, then tap Continue.' },
    { t: 'Check', check: true },
  ],
  pixel: [
    { t: 'Download the certificate', b: 'Tap the button. The file goes to <b>Downloads</b>. (Tapping the file itself won’t install it. Android only allows this from Settings.)', btn: ['Download the certificate', '/home-certificate.crt'] },
    { t: 'Open the installer in Settings', b: 'Open <b>Settings</b> and search for <b>CA certificate</b>, or go to:', path: ['Security & privacy', 'More security & privacy', 'Encryption & credentials', 'Install a certificate', 'CA certificate'] },
    { t: 'Install it', b: 'Tap <b>Install anyway</b>, unlock if asked, open <b>Downloads</b> and choose <b>build-with-me-home.crt</b>.', tip: 'Android may say “network may be monitored”. That’s its normal message for any home certificate.' },
    { t: 'Restart Chrome', b: 'Fully close Chrome: open recent apps and swipe it away. Then open Chrome again and come back to this page.' },
    { t: 'Check', check: true },
  ],
  samsung: [
    { t: 'Download the certificate', b: 'Tap the button. The file goes to <b>Downloads</b>.', btn: ['Download the certificate', '/home-certificate.crt'] },
    { t: 'Open the installer in Settings', b: 'Open <b>Settings</b> and search for <b>CA certificate</b>, or go to:', path: ['Security and privacy', 'More security settings', 'Install from device storage', 'CA certificate'] },
    { t: 'Install it', b: 'Tap <b>Install anyway</b>, then choose <b>build-with-me-home.crt</b> from Downloads.' },
    { t: 'Restart the browser', b: 'Fully close Chrome or Samsung Internet (swipe it away from recent apps), open it again, and come back to this page.' },
    { t: 'Check', check: true },
  ],
  windows: [
    { t: 'Download the certificate', b: 'Click the button. If the browser asks, choose <b>Keep</b>.', btn: ['Download the certificate', '/home-certificate.crt'] },
    { t: 'Open it', b: 'Open <b>Downloads</b>, double-click <b>build-with-me-home.crt</b> and click <b>Install Certificate…</b>', path: ['Downloads', 'build-with-me-home.crt', 'Install Certificate…'] },
    { t: 'Put it in the right place', b: 'Choose <b>Current User</b> → Next. Choose <b>Place all certificates in the following store</b> → Browse → <b>Trusted Root Certification Authorities</b> → OK → Next → Finish.', tip: 'Windows warns “You are about to install a certificate…” for ' + esc(NAME) + '. Click Yes. No admin password needed.' },
    { t: 'Restart the browser', b: 'Close every Chrome or Edge window, open it again and come back to this page.', tip: 'Use Chrome or Edge. Firefox keeps its own list and may still say no.' },
    { t: 'Check', check: true },
  ],
  mac: [
    { t: 'Download the certificate', b: 'Click the button. The file goes to <b>Downloads</b>.', btn: ['Download the certificate', '/home-certificate.crt'] },
    { t: 'Add it to Keychain', b: 'Open <b>Downloads</b> and double-click <b>build-with-me-home.crt</b>. Keychain Access opens and adds it. If it asks where, choose <b>login</b>.' },
    { t: 'Turn on trust', b: 'In Keychain Access, double-click the certificate, open <b>Trust</b> and set <b>When using this certificate</b> to <b>Always Trust</b>. Close the window and enter the Mac password.', path: ['Keychain Access', 'login', 'Certificates', NAME], tip: 'This switch is the step most people miss.' },
    { t: 'Restart the browser', b: 'Quit the browser fully (⌘Q), open it again and come back to this page.' },
    { t: 'Check', check: true },
  ],
  chromebook: [
    { t: 'Download the certificate', b: 'Click the button. The file goes to <b>Downloads</b>.', btn: ['Download the certificate', '/home-certificate.crt'], tip: 'A school Chromebook usually blocks this setup. Kids can still talk with Chromebook dictation (Search + D).' },
    { t: 'Open certificate settings', b: 'Open <b>Settings</b>, search for <b>certificates</b> and open <b>Manage certificates</b>:', path: ['Settings', 'Privacy and security', 'Security', 'Manage certificates'] },
    { t: 'Import it', b: 'If you see tabs: <b>Authorities</b> → <b>Import</b> → choose <b>build-with-me-home.crt</b> → tick <b>Trust this certificate for identifying websites</b> → OK.<br><br>On the newer screen: <b>Local certificates</b> → <b>Installed by you</b> → <b>Trusted certificates</b> → <b>Import</b>.', tip: 'The “identifying websites” tick is the step most people miss.' },
    { t: 'Restart Chrome', b: 'Close every Chrome window, open Chrome again and come back to this page.' },
    { t: 'Check', check: true },
  ],
};
function detect(ua, touch) {
  if (/iPad|iPhone/.test(ua) || (/Macintosh/.test(ua) && touch)) return 'ipad';
  if (/CrOS/.test(ua)) return 'chromebook';
  if (/Android/.test(ua)) return /SM-|Samsung/i.test(ua) ? 'samsung' : 'pixel';
  if (/Windows/.test(ua)) return 'windows';
  if (/Macintosh/.test(ua)) return 'mac';
  return 'pixel';
}
let plat = detect(navigator.userAgent, 'ontouchend' in document);
let step = 0;
try { const s = JSON.parse(localStorage.getItem('bwm-tablet-setup') || '{}'); if (s.plat && P[s.plat]) { plat = s.plat; step = s.step || 0; } } catch {}
function save() { try { localStorage.setItem('bwm-tablet-setup', JSON.stringify({ plat, step })); } catch {} }
function render() {
  const steps = P[plat]; step = Math.min(step, steps.length - 1); save();
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.p === plat));
  const s = steps[step];
  let h = '<div class="stepno">Step ' + (step + 1) + ' of ' + steps.length + '</div><h2>' + s.t + '</h2>';
  if (s.check) {
    h += '<p>Let’s see if this device trusts your computer now.</p><button class="go" id="check">Check</button><div id="res"></div>';
  } else {
    if (s.b) h += '<p>' + s.b + '</p>';
    if (s.path) h += '<div class="path">' + s.path.map((p) => '<span>' + esc(p) + '</span>').join('<i>›</i>') + '</div>';
    if (s.tip) h += '<div class="tip">' + s.tip + '</div>';
    if (s.btn) h += '<p><a class="go" style="display:block" href="' + s.btn[1] + '">' + s.btn[0] + '</a></p>';
  }
  h += '<div class="nav">' + (step > 0 ? '<button class="back" id="back">Back</button>' : '') + (s.check ? '' : '<button class="go" id="next">Done, next</button>') + '</div>';
  document.getElementById('card').innerHTML = h;
  document.getElementById('dots').innerHTML = steps.map((_, i) => '<i class="' + (i <= step ? 'on' : '') + '"></i>').join('');
  document.getElementById('back')?.addEventListener('click', () => { step--; render(); });
  document.getElementById('next')?.addEventListener('click', () => { step++; render(); });
  document.getElementById('check')?.addEventListener('click', check);
}
async function check() {
  const res = document.getElementById('res');
  res.innerHTML = '<div class="result">Checking…</div>';
  try {
    const r = await fetch(SECURE + '/api/health', { cache: 'no-store' });
    if (!r.ok) throw new Error();
    res.innerHTML = '<div class="result ok">✅ All set! This device can talk to Build With Me. Your kid can now open their pass here.</div><p class="muted" style="font-size:15px">If the kid page still says <b>Not secure</b>, close the browser completely (swipe it away) and open a new pass.</p>';
  } catch {
    const android = 'Most often the certificate was installed as the wrong type (it must be “CA certificate”), or the browser wasn’t fully closed (the last step).';
    const hint = {
      ipad: 'Most often it’s step 3: the “Certificate Trust Settings” switch.',
      pixel: android, samsung: android,
      windows: 'Most often the store wasn’t “Trusted Root Certification Authorities”, or a browser window was still open. In Firefox, try Chrome or Edge instead.',
      mac: 'Most often the trust is still “Use System Defaults”: set it to “Always Trust” (step 3).',
      chromebook: 'Most often the “Trust this certificate for identifying websites” box wasn’t ticked. A school Chromebook may block this altogether.',
    }[plat];
    const dictation = { windows: 'Win + H', mac: 'Fn twice', chromebook: 'Search + D' }[plat];
    res.innerHTML = '<div class="result bad">Not yet. This device doesn’t trust the computer. ' + hint + '</div>'
      + '<p class="muted" style="font-size:15px">Set this up before? This computer’s certificate is called <b>' + esc(NAME) + '</b>. If the one on this device has a different name or date, it’s an older one: remove it in Settings and start again from step 1.</p>'
      + (dictation ? '<p class="muted" style="font-size:15px">Stuck? Kids can still talk using the computer’s own dictation (<b>' + dictation + '</b>) in the text box.</p>' : '');
  }
}
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { plat = b.dataset.p; step = 0; render(); }));
render();
</script>
</main></body></html>`;
}
