// Shipped apps and each kid's "My apps" shelf (prd.md > My Apps, spec.md > My Apps).
// Ship copies the newest version to kids/<kidId>/apps/<slug>/index.html (named, with a small
// badge) and lists it in kids/<kidId>/apps.json. /apps/<kidId>/<slug>/ serves it inside a tiny
// wrapper page, as Build With Me's serveApp did: the app runs in a sandboxed frame with no origin
// of its own and a strict Content-Security-Policy (no network, no outside files, no navigation),
// and its saved data lives in the wrapper's own key space on that device.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { dataPath, readJson, writeJson, removePath } from '../store.js';
import { checkApp } from './appCheck.js';
import { latestVersion } from './build.js';
import { leaveCurrent, type Project } from './project.js';
import { themeEmoji } from './themeEmoji.js';

export interface ShelfApp { slug: string; name: string; emoji: string; createdAt: number; projectId: string; version: number }

const SAFE = /^[A-Za-z0-9_-]{1,60}$/;
const shelfFile = (kidId: string) => `kids/${kidId}/apps.json`;
const appFile = (kidId: string, slug: string) => `kids/${kidId}/apps/${slug}/index.html`;

export function shelf(kidId: string): ShelfApp[] {
  if (!SAFE.test(kidId)) return [];
  return readJson<{ apps: ShelfApp[] }>(shelfFile(kidId), { apps: [] }).apps.sort((a, b) => b.createdAt - a.createdAt);
}

export function appPath(kidId: string, slug: string): string | null {
  if (!SAFE.test(kidId) || !SAFE.test(slug)) return null;
  const file = dataPath(appFile(kidId, slug));
  return existsSync(file) ? file : null;
}

export function deleteApp(kidId: string, slug: string): boolean {
  if (!SAFE.test(kidId) || !SAFE.test(slug)) return false;
  const apps = shelf(kidId);
  if (!apps.some((a) => a.slug === slug)) return false;
  removePath(`kids/${kidId}/apps/${slug}`);
  writeJson(shelfFile(kidId), { apps: apps.filter((a) => a.slug !== slug) });
  return true;
}

function slugify(name: string, taken: Set<string>): string {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'my-app';
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const BADGE = `<style>@keyframes bwm-badge{to{opacity:.3}}</style><div aria-hidden="true" style="position:fixed;right:8px;bottom:8px;z-index:2147483647;font:600 11px/1 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.55);padding:5px 9px;border-radius:999px;pointer-events:none;animation:bwm-badge .8s ease 4s forwards">Made with Build With Me</div>`;

/** The shipped page: the chosen name as its title (and in its own headings), plus the badge. */
export function shippedHtml(html: string, name: string): string {
  const title = `<title>${escapeHtml(name)}</title>`;
  let out = /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, title)
    : html.replace(/<head[^>]*>/i, (m) => `${m}${title}`);
  const oldTitle = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim();
  if (oldTitle && oldTitle.length >= 3 && oldTitle !== escapeHtml(name)) {
    out = out.replace(/(<h[12][^>]*>)([\s\S]*?)(<\/h[12]>)/gi, (m, open, inner, close) => (inner.includes(oldTitle) ? open + inner.split(oldTitle).join(escapeHtml(name)) + close : m));
  }
  return /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${BADGE}</body>`) : out.replace(/<\/html>\s*$/i, `${BADGE}</html>`);
}

export type ShipResult = { ok: true; app: ShelfApp } | { ok: false; error: string };

/** Ship: final. A second call returns the same app. */
export function shipApp(p: Project, rawName: string): ShipResult {
  if (p.shipped) {
    const app = shelf(p.kidId).find((a) => a.slug === p.shipped!.slug);
    if (app) return { ok: true, app };
  }
  const name = rawName.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return { ok: false, error: 'Give the app a name first.' };
  const latest = latestVersion(p);
  if (!latest) return { ok: false, error: 'There is no app to ship yet.' };
  const problems = checkApp(latest.html);
  if (problems.length) return { ok: false, error: `This app can't be shipped yet: it ${problems[0]}. Ask for a change to remove that, then ship it.` };

  const apps = shelf(p.kidId);
  const slug = slugify(name, new Set(apps.map((a) => a.slug)));
  const file = dataPath(appFile(p.kidId, slug));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, shippedHtml(latest.html, name), 'utf8');
  const now = Date.now();
  const app: ShelfApp = { slug, name, emoji: themeEmoji(p.profile.theme), createdAt: now, projectId: p.id, version: latest.n };
  writeJson(shelfFile(p.kidId), { apps: [app, ...apps] });
  p.shipped = { name, slug, at: now };
  p.stage = 'ship';
  p.timeline.push({ at: now, stage: 'ship' });
  leaveCurrent(p.kidId); // the next pass starts a new app; this one stays on the shelf
  return { ok: true, app };
}

// ---------- serving (Build With Me's serveApp wrapper, for the home network) ----------

export const APP_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  'font-src data:',
  "connect-src 'none'",
  "frame-src 'none'", // the srcdoc frame still loads; navigating it anywhere is blocked
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ');

/** Inside the frame, first thing: localStorage backed by the wrapper (filled in at load). */
const SHIM = String.raw`(function(){var d=__SAVED__;function post(m){try{parent.postMessage(m,"*")}catch(e){}}var s={getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){k=String(k);v=String(v);d[k]=v;post({bwm:1,op:"set",k:k,v:v})},removeItem:function(k){k=String(k);delete d[k];post({bwm:1,op:"remove",k:k})},clear:function(){d={};post({bwm:1,op:"clear"})},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}};try{Object.defineProperty(window,"localStorage",{value:s,configurable:true})}catch(e){}})();`;

/** The wrapper page's own script: load this app's saved data, start the frame, save writes. */
const WRAPPER_SCRIPT = String.raw`(function(){var P="bwm-app:"+__ID__+":",saved={};
function mine(){var o=[];try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf(P)===0)o.push(k)}}catch(e){}return o}
function used(){var n=0;mine().forEach(function(k){n+=k.length+(localStorage.getItem(k)||"").length});return n}
try{mine().forEach(function(k){saved[k.slice(P.length)]=localStorage.getItem(k)})}catch(e){}
var shim="<script>"+__SHIM__.replace("__SAVED__",function(){return JSON.stringify(saved).replace(/</g,"\\u003c")})+"<\/script>";
var html=__HTML__,f=document.getElementById("app");
window.addEventListener("message",function(e){if(e.source!==f.contentWindow)return;var m=e.data;if(!m||m.bwm!==1)return;try{
if(m.op==="set"&&typeof m.k==="string"&&typeof m.v==="string"&&used()-(localStorage.getItem(P+m.k)||"").length+m.v.length<1000000)localStorage.setItem(P+m.k,m.v);
else if(m.op==="remove"&&typeof m.k==="string")localStorage.removeItem(P+m.k);
else if(m.op==="clear")mine().forEach(function(k){localStorage.removeItem(k)})}catch(err){}});
var h=html.match(/<head(\s[^>]*)?>/i);f.srcdoc=h?html.replace(h[0],function(){return h[0]+shim}):shim+html})();`;

/** Safe inside an inline <script>: no "</script>" or "<!--" can appear. */
function scriptLiteral(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function wrapperPage(id: string, title: string, html: string): string {
  const script = WRAPPER_SCRIPT
    .replace('__ID__', () => scriptLiteral(id))
    .replace('__SHIM__', () => scriptLiteral(SHIM))
    .replace('__HTML__', () => scriptLiteral(html));
  const name = escapeHtml(title || 'Made with Build With Me');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title>
<style>html,body{margin:0;height:100%;background:#fff}body{display:flex;flex-direction:column}iframe{border:0;width:100%;flex:1;min-height:0;display:block}
.bar{display:flex;align-items:center;gap:12px;height:44px;padding:0 12px;background:#1f2430;color:#fff;font:600 16px system-ui,sans-serif}
.bar a{color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:6px 14px;font-size:15px}
.bar span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}</style></head>
<body><div class="bar"><a href="/kid" onclick="if(window.opener){window.close();return false}">← Back</a><span>${name}</span></div><iframe id="app" title="${name}" sandbox="allow-scripts allow-forms"></iframe><script>${script}</script></body></html>`;
}

export function servedApp(kidId: string, slug: string): { html: string; name: string } | null {
  const file = appPath(kidId, slug);
  const app = shelf(kidId).find((a) => a.slug === slug);
  if (!file || !app) return null;
  return { html: wrapperPage(`${kidId}-${slug}`, app.name, readFileSync(file, 'utf8')), name: app.name };
}
