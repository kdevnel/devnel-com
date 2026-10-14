/**
 * Signed timestamps for the minimum time-to-submit check.
 * Web Crypto only (no node:crypto), so it runs on Node and Workers alike.
 */
import { MIN_SECONDS } from './limits';

export { MIN_SECONDS };
export const MAX_AGE_SECONDS = 2 * 60 * 60;

const encoder = new TextEncoder();

async function key(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

const toBase64Url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64Url = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function signTimestamp(secret: string, now = Date.now()): Promise<string> {
  const ts = String(now);
  const sig = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(ts));
  return `${ts}.${toBase64Url(sig)}`;
}

export type TokenCheck = 'ok' | 'invalid' | 'too-fast' | 'expired';

export async function checkTimestamp(
  secret: string,
  token: string | null | undefined,
  now = Date.now(),
): Promise<TokenCheck> {
  const [ts, sig] = (token ?? '').split('.');
  if (!ts || !sig || !/^\d+$/.test(ts)) return 'invalid';

  let valid: boolean;
  try {
    // subtle.verify compares in constant time.
    valid = await crypto.subtle.verify(
      'HMAC',
      await key(secret),
      fromBase64Url(sig),
      encoder.encode(ts),
    );
  } catch {
    return 'invalid';
  }
  if (!valid) return 'invalid';

  const age = (now - Number(ts)) / 1000;
  if (age < MIN_SECONDS) return 'too-fast';
  if (age > MAX_AGE_SECONDS) return 'expired';
  return 'ok';
}
