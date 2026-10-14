/**
 * Request guards for the contact endpoint. Web-standard APIs only, and none
 * of them depend on what a reverse proxy forwards, so they behave the same
 * on Node behind Caddy or Nginx, directly on Node, and on Workers.
 */

/**
 * Cross-site POST protection.
 *
 * 1. Sec-Fetch-Site is set by the browser itself (all current browsers), so
 *    it's accurate whatever the proxy does to Host or X-Forwarded-*.
 * 2. Older browsers don't send it: fall back to comparing Origin with the
 *    site's public origins (and the URL the server saw, for direct access).
 * Requests with neither header aren't from a browser form; they're allowed
 * through to the other defences (token, Turnstile), which they can't pass.
 */
export function isSameOrigin(request: Request, allowedOrigins: readonly string[]): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';

  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin || allowedOrigins.includes(origin);
}

export class BodyTooLargeError extends Error {}

/** Beyond this, stop reading a rejected body and drop the connection instead. */
const DISCARD_LIMIT = 1024 * 1024;

/**
 * Reads and throws away the rest of a rejected body (without keeping it in
 * memory) before we respond. Answering while the client is still uploading
 * broke the next request under Wrangler's local Workers runtime; draining
 * modest bodies avoids that everywhere. Anything bigger is cancelled.
 */
async function discard(
  body: ReadableStream<Uint8Array> | null,
  reader = body?.getReader(),
  alreadyRead = 0,
) {
  if (!reader) return;
  let read = alreadyRead;
  try {
    while (read <= DISCARD_LIMIT) {
      const { done, value } = await reader.read();
      if (done) return;
      read += value.byteLength;
    }
    await reader.cancel();
  } catch {
    // The client went away: nothing left to drain.
  }
}

/**
 * Reads a form body, refusing anything over `maxBytes` without buffering it.
 * Checks Content-Length first, then counts bytes as they stream in, so a
 * chunked upload with no length can't get past the limit either.
 */
export async function readFormData(request: Request, maxBytes: number): Promise<FormData> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) {
    await discard(request.body);
    throw new BodyTooLargeError();
  }
  if (!request.body) return new FormData();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await discard(request.body, reader, size);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const contentType = request.headers.get('content-type') ?? '';
  return new Response(body, { headers: { 'content-type': contentType } }).formData();
}

export type ClientIpHeader = 'none' | 'x-forwarded-for' | 'x-real-ip' | 'cf-connecting-ip';

/**
 * The visitor's IP, for rate limiting. Only the header named in
 * CLIENT_IP_HEADER is trusted: a header the proxy doesn't overwrite could be
 * set to anything by the visitor.
 *
 * - none             direct connections, or the Cloudflare adapter (Astro
 *                    already sets clientAddress from CF-Connecting-IP)
 * - x-forwarded-for  Caddy or Nginx ($proxy_add_x_forwarded_for). Uses the
 *                    LAST entry: the one our own proxy appended
 * - x-real-ip        Nginx with `proxy_set_header X-Real-IP $remote_addr`
 * - cf-connecting-ip Node behind Cloudflare's proxy
 */
export function clientIp(request: Request, header: ClientIpHeader, socketAddress: string): string {
  let ip = socketAddress;
  if (header !== 'none') {
    const value = request.headers.get(header);
    const candidate = header === 'x-forwarded-for' ? value?.split(',').at(-1) : value;
    if (candidate?.trim()) ip = candidate.trim();
  }
  // Bound what an attacker can put into the rate limiter's keys.
  return ip.slice(0, 64);
}

export const isLoopback = (ip: string) =>
  ip === '::1' || ip.startsWith('127.') || ip === '::ffff:127.0.0.1' || ip === 'localhost';
