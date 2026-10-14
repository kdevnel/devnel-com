const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Server-side Turnstile check. Plain fetch, so it runs anywhere. */
export async function verifyTurnstile(
  secret: string,
  token: string | null | undefined,
  remoteip?: string,
): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set('remoteip', remoteip);
  try {
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success === true) return true;
    // Cloudflare says why (e.g. invalid-input-secret when the secret belongs
    // to another widget); the visitor only ever sees the generic message.
    console.warn('[contact] Turnstile rejected the token:', data['error-codes']?.join(', '));
    if (/^[123]x0{30,}/.test(secret)) {
      console.warn('[contact] TURNSTILE_SECRET_KEY is a Cloudflare test secret');
    }
    return false;
  } catch (error) {
    console.warn('[contact] Turnstile check failed:', (error as Error).message);
    return false;
  }
}
