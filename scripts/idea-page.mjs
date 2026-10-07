// Writes devpost/idea-library.html (self-contained, data inside) from the app's idea library
// (server/journey/ideaLibrary.json). Run: npm run ideas:page
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lib = JSON.parse(readFileSync(`${ROOT}/server/journey/ideaLibrary.json`, 'utf8'));
const data = JSON.stringify(lib.ideas).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Idea Library</title>
<style>
:root{--bg:#f6f4ef;--card:#fff;--ink:#1f2430;--muted:#5d6475;--line:#e4ded3;--brand:#23855a;--soft:#dff3e9;--kid:#185c9e;--kid-soft:#e2eefa;--teen:#6d3fc0;--teen-soft:#efe8fb;--chip:#f0ece4}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15171c;--card:#1f232b;--ink:#eceef3;--muted:#a3a9b8;--line:#333945;--brand:#4cc08d;--soft:#1b3329;--kid:#6aaef0;--kid-soft:#1a2a3d;--teen:#b08cf0;--teen-soft:#2a2340;--chip:#272c35}}
:root[data-theme="dark"]{--bg:#15171c;--card:#1f232b;--ink:#eceef3;--muted:#a3a9b8;--line:#333945;--brand:#4cc08d;--soft:#1b3329;--kid:#6aaef0;--kid-soft:#1a2a3d;--teen:#b08cf0;--teen-soft:#2a2340;--chip:#272c35}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:28px;margin:0 0 4px}
.muted{color:var(--muted)}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);padding:12px 0;border-bottom:1px solid var(--line);margin-bottom:16px}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}
.row b{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-right:4px;min-width:52px}
button.f{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:6px 12px;font:inherit;font-size:14px;cursor:pointer}
button.f[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
input[type=search]{font:inherit;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);width:100%;max-width:320px}
.count{font-weight:700;margin-left:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:8px}
.card h2{font-size:19px;margin:0}
.pills{display:flex;flex-wrap:wrap;gap:5px}
.pill{font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;background:var(--chip);color:var(--muted)}
.pill.kid{background:var(--kid-soft);color:var(--kid)} .pill.teen{background:var(--teen-soft);color:var(--teen)}
.pitch{font-weight:600}
details summary{cursor:pointer;color:var(--brand);font-weight:700}
details h3{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:12px 0 4px}
details p,details ul{margin:0}
details ul{padding-left:20px}
.empty{padding:40px;text-align:center}
</style>
</head>
<body>
<main>
<h1>💡 Idea Library</h1>
<p class="muted">Ideas a kid who's stuck can pick from (💡 Show me ideas): <span id="total"></span> in all. Every one fits a single page with no internet, and each has questions that let the kid make it their own. Pick filters to browse; open an idea for the details.</p>
<div class="bar">
  <div class="row"><b>Age</b><span id="ages"></span></div>
  <div class="row"><b>Theme</b><span id="themes"></span></div>
  <div class="row"><b>Kind</b><span id="kinds"></span></div>
  <div class="row"><input type="search" id="q" placeholder="Search ideas…" aria-label="Search ideas"><span class="count" id="count"></span></div>
</div>
<div class="grid" id="grid"></div>
</main>
<script>
const IDEAS = ${data};
const THEMES = {unicorns:'🦄 Unicorns',princesses:'👑 Princesses',robots:'🤖 Robots',cars:'🏎️ Cars',space:'🚀 Space',arcade:'👾 Arcade',music:'🎧 Music',sports:'⚽ Sports',nature:'🌿 Nature',office:'💼 Office'};
const KINDS = {game:'🎮 Game',creative:'🎨 Creative',tool:'🧰 Tool',learning:'📚 Learning',story:'📖 Story'};
const AGES = {kid:'Kid (6–12)',teen:'Teen (13–17)'};
const state = {age:null, theme:null, kind:null, q:''};
try { Object.assign(state, JSON.parse(localStorage.getItem('idea-filters') || '{}')); } catch {}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function chips(el, map, key) {
  el.innerHTML = '<button class="f" data-v="">All</button>' + Object.entries(map).map(([v, l]) => '<button class="f" data-v="' + v + '">' + l + '</button>').join(' ');
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { state[key] = b.dataset.v || null; render(); }));
}
chips(document.getElementById('ages'), AGES, 'age');
chips(document.getElementById('themes'), THEMES, 'theme');
chips(document.getElementById('kinds'), KINDS, 'kind');
const q = document.getElementById('q'); q.value = state.q || '';
q.addEventListener('input', () => { state.q = q.value; render(); });
document.getElementById('total').textContent = IDEAS.length;
function card(i) {
  const ages = i.ages.map((a) => '<span class="pill ' + a + '">' + (a === 'kid' ? 'Kid' : 'Teen') + '</span>').join('');
  const themes = i.themes.map((t) => '<span class="pill">' + (THEMES[t] || t) + '</span>').join('');
  const list = (xs) => '<ul>' + xs.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>';
  return '<article class="card"><h2>' + esc(i.emoji || '') + ' ' + esc(i.title) + '</h2><div class="pills">' + ages + '<span class="pill">' + (KINDS[i.kind] || i.kind) + '</span>' + themes + '<span class="pill">' + (i.size === 'medium' ? 'Medium' : 'Small') + '</span></div>'
    + '<p class="pitch">' + esc(i.pitch) + '</p>'
    + '<details><summary>Details</summary>'
    + '<h3>How it works</h3><p>' + esc(i.howItWorks) + '</p>'
    + '<h3>Look and feel</h3><p>' + esc(i.lookAndFeel) + '</p>'
    + '<h3>Make it yours</h3>' + list(i.makeItYours)
    + '<h3>Level up later</h3>' + list(i.levelUp)
    + (i.teenTwist ? '<h3>Teen twist</h3><p>' + esc(i.teenTwist) + '</p>' : '')
    + '<h3>For the builder</h3><p class="muted">' + esc(i.buildNotes) + '</p>'
    + '</details></article>';
}
function render() {
  try { localStorage.setItem('idea-filters', JSON.stringify(state)); } catch {}
  for (const [id, key] of [['ages','age'],['themes','theme'],['kinds','kind']]) document.querySelectorAll('#' + id + ' button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.v || null) === state[key])));
  const words = (state.q || '').toLowerCase().split(/\\s+/).filter(Boolean);
  const shown = IDEAS.filter((i) => (!state.age || i.ages.includes(state.age)) && (!state.theme || i.themes.includes(state.theme)) && (!state.kind || i.kind === state.kind)
    && words.every((w) => JSON.stringify(i).toLowerCase().includes(w)));
  document.getElementById('count').textContent = shown.length + ' shown';
  document.getElementById('grid').innerHTML = shown.length ? shown.map(card).join('') : '<p class="empty muted">No ideas match. Try fewer filters.</p>';
}
render();
</script>
</body>
</html>
`;
writeFileSync(`${ROOT}/devpost/idea-library.html`, html);
console.log('written devpost/idea-library.html', lib.ideas.length, 'ideas');
