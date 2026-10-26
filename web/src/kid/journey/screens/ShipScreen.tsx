// prd.md > The Kid's Journey, Ship and My Apps: name the app, ship it (final), and it lands on the
// kid's own My apps shelf, with a link on this device and a QR code for devices on the home Wi-Fi.
// Ported from Build With Me's ShipScreen (whose public share links are gone: apps stay at home).
import { useEffect, useRef, useState } from 'react';
import VisualPane from '../components/VisualPane';
import { limitMessage, myApps, newApp, passEnded, shipApp, type IconChoice, type ShelfApp } from '../lib/api';
import { themeById } from '../themes/themes';
import { speak, stopSpeaking } from '../lib/voice';
import { pauseFor, useSpeech } from '../lib/speech';
import type { Profile } from '../types';

interface Props {
  profile: Profile;
  html: string;
  alreadyShipped?: boolean; // resumed after shipping
  appEmojis?: string[]; // icon choices from the guide
  onBack: () => void;
  onShipped?: () => void;
  voiceOn?: boolean;
  onPassEnded?: () => void;
}

type Shipped = ShelfApp & { url: string };

/** The builder's drawn icon (<svg id="bwm-icon">) as an image address, or null. Shown only as an
 *  <img>, so nothing in it can run; the server checks it again when the app ships. */
function drawnIcon(html: string): string | null {
  const svg = html.match(/<svg\b[^>]*\bid\s*=\s*["']bwm-icon["'][^>]*>[\s\S]*?<\/svg>/i)?.[0];
  if (!svg || svg.length > 8000 || /<\s*(script|foreignObject|image|a|use|style)\b|\son[a-z]+\s*=|javascript:|https?:|\bhref\s*=/i.test(svg)) return null;
  const clean = svg.replace(/\sstyle\s*=\s*["'][^"']*["']/i, '').replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
}

/** Shows an icon choice: the drawing, or an emoji. */
export function IconView({ choice, drawing, size }: { choice: IconChoice; drawing: string | null; size: number }) {
  return choice.kind === 'drawing' && drawing
    ? <img src={drawing} alt="" width={size} height={size} className="rounded-2xl" />
    : <span style={{ fontSize: size * 0.8, lineHeight: 1 }} aria-hidden>{choice.kind === 'emoji' ? choice.emoji : '✨'}</span>;
}

/** A starting name: the app's own page title, if it has one. */
function suggestedName(html: string): string {
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  return title.replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim().slice(0, 60);
}

const EXAMPLE_NAME = { kid: 'Star Pet Party', teen: 'Chord Rush', adult: 'Team Desk Board' };

// QA round 2: Ship couldn't be finished by voice. Spoken words name the app ("call it Three
// Streaks"), ship it ("ship it", "yes"), or go back ("keep building").
const SHIP_WORDS = /\b(ship it|ship|send it|publish( it)?|go ahead|yes|yeah|yep|do it|i'?m done)\b/i;
const BACK_WORDS = /\b(keep building|go back|back to build|not yet)\b/i;

/** The name in what someone said: "cool, ship it, call it Three Streaks" → "Three Streaks". */
export function spokenName(said: string): string {
  const called = said.match(/\b(?:call it|name it|it'?s called|the name is|its name is|called)\s+(.+)/i);
  const name = called ? called[1] : said.replace(/^(ok(ay)?|cool|so|um+|uh+|alright|yeah|yes)[,.!\s]+/i, '');
  return name
    .replace(/\s*\b(and |then )?(ship it|ship|send it|publish it)\b.*$/i, '')
    .replace(/["“”.!?,]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export default function ShipScreen({ profile, html, alreadyShipped = false, appEmojis = [], onBack, onShipped, voiceOn = false, onPassEnded }: Props) {
  const young = profile.ageGroup === 'kid' || (profile.ageGroup === 'teen' && profile.experience <= 1);
  const theme = themeById(profile.theme);
  const suggested = suggestedName(html);
  // The box starts with the suggested name, like the pre-picked icon, so they can just ship it (owner yes D-14, 2026-10-25).
  const [name, setName] = useState(suggested);
  const finalName = name.trim() || suggested;
  const [busy, setBusy] = useState(alreadyShipped);
  const [error, setError] = useState<string | null>(null);
  const [shipped, setShipped] = useState<Shipped | null>(null);
  const [shelfApps, setShelfApps] = useState<ShelfApp[]>([]);
  // The app's icon (family trial): its own drawing first, then emojis that fit it. 🎲 tries the
  // next one; tapping one picks it.
  const drawing = drawnIcon(html);
  const choices: IconChoice[] = [
    ...(drawing ? [{ kind: 'drawing' } as const] : []),
    ...[...new Set([...appEmojis, theme.emoji])].map(emoji => ({ kind: 'emoji', emoji }) as const),
  ];
  const [pick, setPick] = useState(0);
  const icon = choices[pick % choices.length];

  async function ship(withName?: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await shipApp(withName ?? '', icon);
      setShipped({ ...result, url: new URL(result.path, location.origin).href });
      onShipped?.();
      // Talk mode: a spoken "it's shipped" moment (QA round 3).
      if (voiceOn && withName) speak(young ? `Hooray! ${result.name} is on your shelf! Show it to your family.` : `${result.name} is shipped and on your shelf.`, profile.theme, profile.ageGroup ?? 'adult');
      setShelfApps(await myApps().catch(() => []));
    } catch (err) {
      console.error(err);
      if (passEnded(err)) { onPassEnded?.(); return; }
      // The rule checks explain themselves; anything else is a hiccup.
      const e = err as { status?: number; message?: string };
      setError(limitMessage(err) ?? (e?.status === 409 && e.message && e.message !== 'busy' ? e.message : "My brain hiccupped while shipping. Let's try that again!"));
    } finally {
      setBusy(false);
    }
  }

  // Talk mode: say what this screen is for, then listen for a name, "ship it", or "go back".
  const nameRef = useRef('');
  nameRef.current = finalName;
  const [heard, setHeard] = useState('');
  const speech = useSpeech(setHeard, said => onSpoken(said), pauseFor(profile.ageGroup));
  const talk = voiceOn && speech.problem !== 'unsupported' && speech.problem !== 'blocked';
  function reply(text: string, listen = true) {
    speak(text, profile.theme, profile.ageGroup ?? 'adult', () => { if (listen) speech.start(true); });
  }
  function onSpoken(said: string) {
    setHeard('');
    if (BACK_WORDS.test(said)) { onBack(); return; }
    const spoken = spokenName(said);
    const named = spoken && !SHIP_WORDS.test(spoken) ? spoken : '';
    if (named) setName(named.replace(/(^|\s)(\p{Ll})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase()));
    const target = named ? named.replace(/(^|\s)(\p{Ll})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase()) : nameRef.current;
    if (SHIP_WORDS.test(said) && target) { void ship(target); return; }
    if (named) { reply(young ? `${named}! Great name. Say "ship it" when you're ready.` : `Got it: ${named}. Say "ship it" when you're ready.`); return; }
    reply(young ? 'What should your app be called?' : 'What should it be called?');
  }
  useEffect(() => {
    if (!voiceOn || alreadyShipped) return;
    reply(young ? 'Time to ship! What should your app be called? Say its name, then say "ship it".' : 'Name your app, then say "ship it". Shipping is final.');
    return () => { stopSpeaking(); speech.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (busy || shipped) speech.cancel(); }, [busy, shipped, speech]);

  // After a refresh, the app is already shipped: fetch its link again.
  useEffect(() => {
    if (alreadyShipped) void ship();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startOver() {
    stopSpeaking();
    await newApp().catch(() => {});
    window.location.reload();
  }

  const button = 'rounded-full bg-accent px-5 py-2.5 font-extrabold text-white disabled:opacity-40';
  const outline = 'rounded-full border-2 border-line bg-surface px-5 py-2.5 font-bold text-ink hover:border-accent';
  const others = shelfApps.filter(a => a.slug !== shipped?.slug);

  return (
    <main className="grid gap-4 px-4 pb-4 lg:h-[calc(100vh-56px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-3xl border-2 border-line bg-surface p-5">
        {!shipped ? (
          <>
            <div>
              <p className="text-5xl" aria-hidden>🎉</p>
              <h2 className={`mt-2 font-extrabold text-ink ${young ? 'text-3xl' : 'text-2xl'}`}>{young ? 'Time to share your app!' : 'Ship your app'}</h2>
              <p className="mt-2 text-muted">{young
                ? "Give it a name. After you ship it, it's finished and goes on your My apps shelf. You can always make a new one!"
                : 'Name it, then ship. Shipping is final: your shelf always shows this version.'}</p>
            </div>
            <label className="flex flex-col gap-2">
              <span className="font-bold text-ink">{young ? 'What should your app be called?' : 'App name'}</span>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={60} disabled={busy}
                placeholder={suggested ? `Like "${suggested}"` : `Like "${EXAMPLE_NAME[profile.ageGroup ?? 'adult']}"`} onKeyDown={e => { if (e.key === 'Enter' && finalName) void ship(finalName); }}
                className="rounded-2xl border-2 border-line bg-surface px-4 py-3 text-lg text-ink outline-none focus:border-accent" />
            </label>
            <section aria-label="Your app's icon">
              <p className="font-bold text-ink">{young ? "Your app's picture" : 'App icon'}</p>
              <div className="mt-2 flex items-center gap-4">
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-2 border-line bg-surface-2"><IconView choice={icon} drawing={drawing} size={80} /></div>
                {choices.length > 1 && <button disabled={busy} onClick={() => setPick(n => (n + 1) % choices.length)} className="min-h-11 rounded-full border-2 border-line bg-surface px-4 font-bold text-ink hover:border-accent disabled:opacity-40">🎲 Try another</button>}
              </div>
              {choices.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Pick an icon">
                  {choices.map((c, i) => (
                    <button key={c.kind === 'emoji' ? c.emoji : 'drawing'} role="radio" aria-checked={i === pick % choices.length} disabled={busy} onClick={() => setPick(i)}
                      aria-label={c.kind === 'drawing' ? 'The drawing' : c.emoji}
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl border-2 ${i === pick % choices.length ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                      <IconView choice={c} drawing={drawing} size={36} />
                    </button>
                  ))}
                </div>
              )}
            </section>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy || !finalName} onClick={() => void ship(finalName)} className={button}>
                {busy ? (young ? 'Shipping…' : 'Shipping…') : '🚀 Ship it!'}
              </button>
              <button disabled={busy} onClick={onBack} className={outline}>{young ? 'Keep building' : 'Back to Build'}</button>
            </div>
            {talk && (
              <button onClick={() => (speech.listening ? speech.stop() : (stopSpeaking(), speech.start()))} disabled={busy}
                className={`self-start rounded-full border-2 px-4 py-2 font-bold ${speech.listening ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink'}`}>
                {speech.listening ? `🎤 Listening…${heard ? ` "${heard}"` : ''}` : '🎤 Say the name, or "ship it"'}
              </button>
            )}
            {error && <p className="rounded-2xl bg-accent-soft px-4 py-3 font-bold text-ink">{error}</p>}
          </>
        ) : (
          <>
            <div>
              {shipped.iconUrl ? <img src={shipped.iconUrl} alt="" width={72} height={72} className="rounded-2xl" /> : <p className="text-5xl" aria-hidden>{shipped.emoji}</p>}
              <h2 className={`mt-2 font-extrabold text-ink ${young ? 'text-3xl' : 'text-2xl'}`}>{shipped.name} is on your shelf!</h2>
              <p className="mt-1 text-muted">{young ? 'Show it to your family. Open it any time you have a pass.' : 'It lives on this computer: open it here, or on a device on your home Wi-Fi.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={shipped.url} target="_blank" rel="noopener noreferrer" className={button}>Open my app ↗</a>
            </div>
            {shipped.qr && (
              <figure className="flex flex-col items-center gap-1 self-center">
                <img src={shipped.qr} alt={`QR code for ${shipped.name} on the home Wi-Fi`} width={200} height={200} className="rounded-2xl border-2 border-line bg-white p-2" />
                <figcaption className="text-center text-sm font-semibold text-muted">Scan with a tablet or phone at home to play it there!</figcaption>
              </figure>
            )}
            {others.length > 0 && (
              <section>
                <h3 className="font-extrabold text-ink">My apps</h3>
                <ul className="mt-1 space-y-1">
                  {others.slice(0, 8).map(a => (
                    <li key={a.slug}><a href={a.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-semibold text-ink underline">{a.iconUrl ? <img src={a.iconUrl} alt="" width={24} height={24} className="rounded-md" /> : a.emoji} {a.name}</a></li>
                  ))}
                </ul>
              </section>
            )}
            <button onClick={() => void startOver()} className={`${outline} self-start`}>✨ Make another app</button>
          </>
        )}
      </aside>

      <section className="min-h-[60vh] lg:min-h-0">
        <VisualPane title="Your app" html={html} className="h-full min-h-[60vh] lg:min-h-0" />
      </section>
    </main>
  );
}
