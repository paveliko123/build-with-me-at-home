// Claude Code's sign-in ran out (the OAuth session expired and couldn't refresh). Kids' calls fail
// until the parent signs in again, so the parent gets an alert with a "Sign in to Claude" button
// that runs the CLI's own sign-in (`claude auth login`, Anthropic's page in the browser), no
// terminal needed.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanEnv, findClaude } from './runner.js';
import { pluginDataDir } from '../paths.js';
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
    if (code === 0) { current = { state: 'done' }; dismissAlertsOfKind('signin'); }
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
