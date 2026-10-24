// Claude Code's sign-in ran out (the OAuth session expired and couldn't refresh). Kids' calls fail
// until the parent signs in again, so the parent gets an alert with a "Sign in to Claude" button
// that runs the CLI's own sign-in (`claude auth login`, Anthropic's page in the browser), no
// terminal needed.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanEnv, findClaude } from './runner.js';
import { pluginDataDir, sandboxDir } from '../paths.js';
import { addAlert, dismissAlertsOfKind } from '../report/alerts.js';

/** A Claude call failed because the sign-in is gone, not because of the request. */
export class SignInError extends Error {
  constructor() { super('signed-out'); }
}

/** Test hook: a file named "simulate-signed-out" in the plugin data folder makes every journey call
 *  act as if the sign-in had expired. */
export const simulatedSignedOut = () => existsSync(join(pluginDataDir(), 'simulate-signed-out'));

const SIGNED_OUT = /OAuth session expired|Failed to authenticate|not logged in|please run \/login|authentication_error|invalid (api key|x-api-key)|OAuth token (has )?(expired|revoked)/i;
export const isSignedOutError = (error: string | undefined) => !!error && SIGNED_OUT.test(error);

/** Records the sign-out once (one alert until it's fixed), with the kid whose turn found it. */
export function reportSignedOut(kid?: { id: string; nickname: string }): void {
  addAlert({
    kind: 'signin', kidId: kid?.id ?? '', kidName: kid?.nickname ?? '',
    text: `Claude Code's sign-in ran out, so the guide can't answer${kid ? ` (found during ${kid.nickname}'s session; their work is saved)` : ''}. Sign in again to fix it.`,
  });
}

// ---------- asking Claude Code whether it's signed in ----------

let loggedInCache: { value: boolean | null; at: number } | null = null;
let loggedInPending: Promise<boolean | null> | null = null;

/** Signed in or not, from `claude auth status` (loggedIn) and the /usage text. That status is only a
 *  local check, so a "true" next to text saying the sign-in is gone (expired, revoked) still counts as signed out. */
export function signedInFrom(loggedIn: boolean | null, usageText: string): boolean {
  if (loggedIn === false) return false;
  return !(/not logged in|please run \/login/i.test(usageText) || isSignedOutError(usageText));
}

/** Asks the claude program itself (`claude auth status`: no model call, nothing read by the app).
 *  true / false = what it says; null = it couldn't answer (older Claude Code, missing, timed out).
 *  The answer is kept for a few seconds so the status strip doesn't start a process every poll;
 *  `fresh` skips that. Never throws. */
export function claudeLoggedIn(fresh = false): Promise<boolean | null> {
  if (!fresh && loggedInCache && Date.now() - loggedInCache.at < 10_000) return Promise.resolve(loggedInCache.value);
  if (loggedInPending) return loggedInPending;
  const run = new Promise<boolean | null>((resolve) => {
    const bin = findClaude();
    if (!bin) { resolve(null); return; }
    let out = '';
    let done = false;
    let p: ChildProcessWithoutNullStreams;
    const finish = (value: boolean | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      loggedInCache = { value, at: Date.now() };
      resolve(value);
    };
    try { p = spawn(bin, ['auth', 'status'], { cwd: sandboxDir(), env: cleanEnv(), windowsHide: true }); }
    catch { resolve(null); return; }
    const timer = setTimeout(() => { p.kill(); finish(null); }, 15_000);
    p.stdout.on('data', (b: Buffer) => { out = (out + b.toString('utf8')).slice(0, 20_000); });
    p.stderr.resume(); // not read, but a chatty CLI mustn't fill the pipe
    p.on('error', () => finish(null));
    p.on('close', () => { // signed out may exit with 1, so the exit code doesn't matter
      try { const v = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1))?.loggedIn; finish(typeof v === 'boolean' ? v : null); }
      catch { finish(null); }
    });
    p.stdin.end();
  });
  loggedInPending = run;
  const clear = () => { if (loggedInPending === run) loggedInPending = null; };
  run.then(clear, clear);
  return run;
}

// ---------- the sign-in button ----------

export type SignInState =
  | { state: 'idle' }
  | { state: 'waiting'; url: string | null } // the browser page is open; a code may be needed
  | { state: 'done' }
  | { state: 'failed'; message: string };

let current: SignInState = { state: 'idle' };
let child: ChildProcessWithoutNullStreams | null = null;

export const signInState = (): SignInState => current;

/** Starts `claude auth login`. It opens Anthropic's sign-in page in this computer's browser; the
 *  link is also kept so the parent can open it, and a code from that page can be passed on. */
export function startSignIn(): SignInState {
  if (child) return current;
  const bin = findClaude();
  if (!bin) return (current = { state: 'failed', message: 'Claude Code was not found on this computer.' });
  let p: ChildProcessWithoutNullStreams;
  try { p = spawn(bin, ['auth', 'login', '--claudeai'], { env: cleanEnv(), windowsHide: true }); }
  catch { return (current = { state: 'failed', message: 'The sign-in could not start.' }); }
  current = { state: 'waiting', url: null };
  child = p;
  let out = '';
  const read = (b: Buffer) => {
    out = (out + b.toString('utf8')).slice(-8000);
    const m = out.match(/https:\/\/\S+oauth\S+/);
    if (m && current.state === 'waiting' && !current.url) current = { state: 'waiting', url: m[0] };
  };
  p.stdout.on('data', read);
  p.stderr.on('data', read);
  const timer = setTimeout(() => p.kill(), 15 * 60_000); // an abandoned sign-in doesn't linger
  p.on('error', () => { current = { state: 'failed', message: 'The sign-in could not start.' }; });
  p.on('close', (code) => {
    clearTimeout(timer);
    child = null;
    console.warn(JSON.stringify({ event: 'signin', ok: code === 0 }));
    if (code === 0) { current = { state: 'done' }; loggedInCache = null; dismissAlertsOfKind('signin'); }
    else if (current.state === 'waiting') current = { state: 'failed', message: 'The sign-in did not finish. Try again.' };
  });
  return current;
}

/** The code Anthropic's page shows, when it asks to paste one. */
export function sendSignInCode(code: string): boolean {
  const c = code.trim();
  if (!child || !/^[\w#.~-]{8,512}$/.test(c)) return false;
  child.stdin.write(c + '\n');
  return true;
}

export function cancelSignIn(): void {
  child?.kill();
  child = null;
  current = { state: 'idle' };
}
