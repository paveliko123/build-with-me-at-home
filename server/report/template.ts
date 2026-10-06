// One parent report as a self-contained HTML file (spec.md > Reporter and Reports), laid out
// like devpost/report-mockup.html ("One report"). No outside files: it opens from the Reports
// folder even when Build With Me isn't running (only the app link needs it running).

import { usageInfo, type ReportData } from './reporter.js';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const time = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', ' ').toLowerCase();
const day = (t: number) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const pct = (x: number | null) => (x === null ? '—' : x < 1 ? '&lt;1%' : `${Math.round(x)}%`);
const plus = (x: number | null) => (x !== null && x >= 1 ? `+${pct(x)}` : pct(x));

const CSS = `:root{--bg:#f6f4ef;--card:#fff;--ink:#1f2430;--muted:#5d6475;--line:#e4ded3;--brand:#2f9e6e;--brand-soft:#dff3e9;--kid:#185c9e;--kid-soft:#e1eefc;--teen:#6d3fc0;--teen-soft:#eee6fb;--warn:#8a5a12;--warn-soft:#fdf2dc;--bad:#9c3535;--bad-soft:#f9e2e2;--ok:#1e7a52;--ok-soft:#dff3e9}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15171c;--card:#1f232b;--ink:#eceef3;--muted:#a3a9b8;--line:#333945;--brand:#4cc08d;--brand-soft:#1b3329;--kid:#6aaef0;--kid-soft:#1d2c3e;--teen:#b08cf0;--teen-soft:#2c2340;--warn:#e0a84a;--warn-soft:#3a3020;--bad:#e07a7a;--bad-soft:#3a2222;--ok:#4cc08d;--ok-soft:#1b3329}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 60px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:14px}
h1{font-size:26px;margin:0 0 4px} h2{font-size:17px;margin:0 0 10px} h3{font-size:15px;margin:0 0 6px}
.muted{color:var(--muted)}
.pill{display:inline-block;font-size:12px;font-weight:700;padding:2px 10px;border-radius:999px}
.ok{background:var(--ok-soft);color:var(--ok)} .warn{background:var(--warn-soft);color:var(--warn)} .bad{background:var(--bad-soft);color:var(--bad)} .kid{background:var(--kid-soft);color:var(--kid)} .teen{background:var(--teen-soft);color:var(--teen)}
.head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:14px}
.fact{background:var(--bg);border-radius:10px;padding:10px 12px}
.fact b{display:block;font-size:18px}
.fact span{font-size:12px;color:var(--muted)}
.app{display:grid;grid-template-columns:200px 1fr;gap:18px;align-items:start}
@media (max-width:640px){.app{grid-template-columns:1fr}}
.shot{aspect-ratio:4/3;border-radius:12px;background:linear-gradient(135deg,#7b5cff,#3a8ee2);display:grid;place-items:center;color:#fff;font-weight:800;text-align:center;padding:10px}
.shot .e{font-size:44px;display:block}
a{color:var(--kid)}
.flag{border-left:4px solid var(--warn);background:var(--warn-soft);padding:10px 14px;border-radius:8px;margin:8px 0}
.flag.look{border-color:var(--bad);background:var(--bad-soft)}
.flag q{font-style:italic}
.timeline{list-style:none;padding:0;margin:0}
.timeline li{display:grid;grid-template-columns:120px 1fr;gap:12px;padding:8px 0;border-bottom:1px dashed var(--line)}
.timeline li:last-child{border-bottom:none}
.timeline .when{font-weight:700;color:var(--muted);font-size:13px}
.bar{height:12px;border-radius:999px;background:var(--line);overflow:hidden;display:flex;margin:6px 0}
.bar i{display:block;height:100%}
.legend{font-size:13px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap}
.legend span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle;background:var(--c)}
details{margin-top:10px} summary{cursor:pointer;font-weight:600}
.quote{background:var(--bg);border-radius:8px;padding:8px 12px;margin:6px 0}
.quote b{font-size:12px;color:var(--muted);display:block}
.note{font-size:13px;color:var(--muted);margin:10px 0 0}`;

export function renderReport(r: ReportData): string {
  const groupPill = r.group === 'teen' ? '<span class="pill teen">Teen (13–17)</span>' : '<span class="pill kid">Kid (under 13)</span>';
  const badge = r.badge === 'none' ? '<span class="pill ok">No flags</span>'
    : r.badge === 'look' ? '<span class="pill bad">Needs a look</span>'
    : `<span class="pill warn">${r.flags.length === 1 ? '1 flag' : `${r.flags.length} flags`} · handled by the guide</span>`;
  const u = usageInfo(r.usage, r);
  const a = u.account;
  const since = a?.late ? `since ${time(a.from)}` : 'while it was made';
  const usageFacts = [
    u.own !== null ? `<div class="fact"><b>≈${pct(u.own)}</b><span>of your 5-hour limit: this app's own use (estimate)</span></div>` : '',
    a ? `<div class="fact"><b>${plus(a.fiveHourPct)} · ${plus(a.weeklyPct)}</b><span>your whole account ${since}, 5-hour · weekly</span></div>` : '',
    u.own === null && !a ? `<div class="fact"><b>${Math.round(u.tokens / 1000)}k tokens</b><span>Claude Code's count for this app</span></div>` : '',
  ].join('');
  const usageNote = [
    u.own !== null ? `This app's share is worked out from Claude Code's count of the app's own calls, at a rate learned from ${u.calibratedFrom} earlier measurement${u.calibratedFrom === 1 ? '' : 's'} on your plan, so your own Claude use isn't in it.` : '',
    a ? `The account change comes from Claude Code's /usage (whole percents) and includes everything on your account ${since}${a.late ? ' (this app started before Build With Me measured plan usage, so the start is missing)' : ''}.` : '',
    u.otherPct !== null ? `About ${u.otherPct}% of that was other use at the same time: ${u.others.length ? `${esc(u.others.join(' and '))}'s session, or ` : ''}your own Claude use.` : u.others.length && a ? `${esc(u.others.join(' and '))} used Build With Me at the same time.` : '',
    u.note && !a ? `${esc(u.note)}${u.own === null ? ' Showing Claude Code\'s token count instead; the app\'s own share appears once Build With Me has learned the rate on your plan.' : ''}` : '',
  ].filter(Boolean).join(' ');
  const shown = r.app
    ? `<div class="app"><div class="shot"><span><span class="e">${esc(r.app.emoji)}</span>${esc(r.app.name)}</span></div><div><h3>${esc(r.app.name)}</h3><p class="muted" style="margin:0 0 8px">${esc(r.app.description)}</p><p style="margin:0"><a href="${esc(r.app.url)}" target="_blank" rel="noopener">Open the app ↗</a> &nbsp;·&nbsp; <span class="muted">works on this computer and on home Wi-Fi while Build With Me is running</span></p></div></div>`
    : `<p style="margin:0">Not finished: stopped at <b>${esc(r.stoppedAt ?? '')}</b>. It's saved, and ${esc(r.kidName)} picks up there with the next pass.</p>`;
  const flags = r.flags.map((f) => `<div class="flag${r.badge === 'look' ? ' look' : ''}"><b>⚠ ${esc(f.headline)}</b> <span class="muted">· ${time(f.at)} · ${esc(f.stage)} step</span><p style="margin:6px 0 0">${esc(r.kidName)} said: <q>${esc(f.text)}</q>. ${esc(f.guideDid)}${f.kidReaction ? ` ${esc(f.kidReaction)}` : ''}</p></div>`).join('');
  const check = (c: { ok: boolean; text: string }) => `<li><span class="pill ${c.ok ? 'ok' : 'warn'}">${c.ok ? 'OK' : 'Look'}</span> ${esc(c.text)}</li>`;
  const ideas = r.ideasShareKid === null ? '<p class="muted" style="margin:0">Not estimated (the report writer did not run).</p>'
    : `<div class="bar"><i style="width:${r.ideasShareKid}%;background:var(--kid)"></i><i style="width:${100 - r.ideasShareKid}%;background:var(--brand)"></i></div><div class="legend"><span style="--c:var(--kid)">${esc(r.kidName)}'s ideas: ${r.ideasShareKid}%</span><span style="--c:var(--brand)">Guide's suggestions: ${100 - r.ideasShareKid}%</span></div><p class="muted" style="margin:8px 0 0">${esc(r.ideasNote)} <i>(an estimate)</i></p>`;
  const waitIdeas = r.laterIdeas?.length ? `<p style="margin:10px 0 0">Ideas ${esc(r.kidName)} had while the app was building: ${r.laterIdeas.map((i) => `<q>${esc(i)}</q>`).join(', ')}.</p>` : '';
  const timeline = r.timeline.map((t) => `<li><span class="when">${time(t.at)} ${esc(t.label)}</span><span>${esc(t.text) || '&nbsp;'}</span></li>`).join('');
  const convo = r.transcript.map((l) => `<div class="quote"><b>${l.who === 'kid' ? esc(r.kidName) : 'Guide'} · ${time(l.at)}</b>${esc(l.text)}</div>`).join('');
  const title = esc(r.title);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Parent report</title>
<style>${CSS}</style></head>
<body><main>
  <div class="card">
    <div class="head"><div>
      <span class="muted">Parent report · ${day(r.createdAt)}${r.finished ? '' : ' · not finished'}</span>
      <h1>${title}</h1>
      ${groupPill} ${badge}
    </div></div>
    <div class="facts">
      <div class="fact"><b>${mins(r.activeMinutes)}</b><span>time spent${r.passMinutes ? ` (pass: ${mins(r.passMinutes)})` : ''}</span></div>
      <div class="fact"><b>${r.rounds}</b><span>rounds of changes</span></div>
      <div class="fact"><b>${esc(r.device)}</b><span>device</span></div>
      <div class="fact"><b>${r.answered === 'talking' ? 'Talking' : 'Typing'}</b><span>how ${esc(r.kidName)} answered</span></div>
      ${usageFacts}
    </div>
    <p class="note">${usageNote}</p>
  </div>
  <div class="card"><h2>In one paragraph</h2><p style="margin:0">${esc(r.summary)}</p></div>
  <div class="card"><h2>The app</h2>${shown}</div>
  <div class="card"><h2>Safety</h2>
    ${flags}
    <ul style="margin:10px 0 0">${check(r.checks.personal)}${check(r.checks.output)}${check(r.checks.onTopic)}</ul>
    ${r.worthAChat ? `<p class="note">Worth a chat? ${esc(r.worthAChat)}</p>` : ''}
  </div>
  <div class="card"><h2>Whose ideas?</h2>${ideas}${waitIdeas}</div>
  <div class="card"><h2>How it went</h2><ul class="timeline">${timeline}</ul></div>
  <div class="card"><h2>Talk about it together</h2>
    ${r.starters.length ? `<ul style="margin:0">${r.starters.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Ask them to show you what they made.</p>'}
    <details><summary>Full conversation (${r.transcript.length} messages)</summary>${convo}</details>
  </div>
  <p class="note">Made by Build With Me on your computer${r.writer === 'opus' ? ' (written by Claude Opus from the whole conversation)' : ''}. Personal details were hidden as [name], [school] and so on.</p>
</main></body></html>`;
}
