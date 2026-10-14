import { describe, expect, it } from 'vitest';
import { BodyTooLargeError, clientIp, isSameOrigin, readFormData } from '@/lib/contact/request';
import { MemoryRateLimiter } from '@/lib/contact/rate-limit';

const SITE = ['https://devnel.com', 'https://www.devnel.com'];
const req = (headers: Record<string, string>, url = 'http://localhost:4321/api/contact/') =>
  new Request(url, { method: 'POST', headers });

describe('isSameOrigin', () => {
  it('trusts Sec-Fetch-Site over everything else', () => {
    expect(isSameOrigin(req({ 'sec-fetch-site': 'same-origin' }), SITE)).toBe(true);
    expect(isSameOrigin(req({ 'sec-fetch-site': 'same-site' }), SITE)).toBe(false);
    expect(
      isSameOrigin(req({ 'sec-fetch-site': 'cross-site', origin: 'https://devnel.com' }), SITE),
    ).toBe(false);
  });

  it('falls back to Origin: the public site, or the URL the server saw', () => {
    expect(isSameOrigin(req({ origin: 'https://devnel.com' }), SITE)).toBe(true);
    expect(isSameOrigin(req({ origin: 'http://localhost:4321' }), SITE)).toBe(true);
    expect(isSameOrigin(req({ origin: 'https://evil.example' }), SITE)).toBe(false);
    expect(isSameOrigin(req({ origin: 'null' }), SITE)).toBe(false);
  });
});

describe('readFormData', () => {
  it('parses a body under the limit', async () => {
    const body = new URLSearchParams({ name: 'Ada' });
    const r = new Request('http://x/', { method: 'POST', body });
    expect((await readFormData(r, 1024)).get('name')).toBe('Ada');
  });

  it('rejects by Content-Length before reading', async () => {
    const r = new Request('http://x/', {
      method: 'POST',
      headers: { 'content-length': '999999', 'content-type': 'text/plain' },
      body: 'small',
    });
    await expect(readFormData(r, 1024)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('rejects a chunked body with no length, draining at most ~1 MB of it', async () => {
    let pushed = 0;
    // An endless upload: the reader must give up rather than read forever.
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pushed += 1;
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const r = new Request('http://x/', {
      method: 'POST',
      body: stream,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      duplex: 'half',
    } as RequestInit);
    await expect(readFormData(r, 2048)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(pushed * 64 * 1024).toBeLessThan(1.5 * 1024 * 1024);
  });
});

describe('clientIp', () => {
  it('uses the socket address unless a header is configured', () => {
    const r = req({ 'x-forwarded-for': '6.6.6.6', 'cf-connecting-ip': '7.7.7.7' });
    expect(clientIp(r, 'none', '127.0.0.1')).toBe('127.0.0.1');
  });

  it('takes the last X-Forwarded-For entry: the one our proxy appended', () => {
    const r = req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' });
    expect(clientIp(r, 'x-forwarded-for', '127.0.0.1')).toBe('203.0.113.9');
  });

  it('ignores headers it was not told to trust, and caps the length', () => {
    const r = req({ 'cf-connecting-ip': 'spoofed', 'x-real-ip': 'a'.repeat(500) });
    expect(clientIp(r, 'x-forwarded-for', '10.0.0.1')).toBe('10.0.0.1');
    expect(clientIp(r, 'x-real-ip', '10.0.0.1')).toHaveLength(64);
  });
});

describe('MemoryRateLimiter key cap', () => {
  it('never tracks more than maxKeys addresses', async () => {
    const limiter = new MemoryRateLimiter(5, 60_000, 100);
    for (let i = 0; i < 1_000; i++) await limiter.hit(`ip-${i}`);
    expect(limiter.size).toBe(100);
  });
});
