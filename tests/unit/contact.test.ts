import { describe, expect, it } from 'vitest';
import { contactSchema, fieldErrors } from '@/lib/contact/schema';
import { checkTimestamp, signTimestamp } from '@/lib/contact/token';
import { MemoryRateLimiter } from '@/lib/contact/rate-limit';

const valid = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  topic: 'job',
  message: 'Hello Kyle, we have a senior role you might like.',
};

describe('contactSchema', () => {
  it('accepts a valid message and trims input', () => {
    const result = contactSchema.parse({ ...valid, name: '  Ada  ' });
    expect(result.name).toBe('Ada');
    expect(result.topic).toBe('job');
  });

  it('treats an empty topic as not specified', () => {
    expect(contactSchema.parse({ ...valid, topic: '' }).topic).toBeUndefined();
  });

  it('rejects unknown topics', () => {
    expect(contactSchema.safeParse({ ...valid, topic: 'crypto' }).success).toBe(false);
  });

  it('reports one error per field', () => {
    const result = contactSchema.safeParse({ name: '', email: 'nope', message: 'hi' });
    expect(result.success).toBe(false);
    const errors = fieldErrors(result.error!);
    expect(Object.keys(errors).sort()).toEqual(['email', 'message', 'name']);
    expect(errors.email).toMatch(/valid email/);
  });

  it('enforces the message length limit', () => {
    expect(contactSchema.safeParse({ ...valid, message: 'x'.repeat(2001) }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, message: 'x'.repeat(2000) }).success).toBe(true);
  });

  it('rejects messages with more than two links', () => {
    const two = 'See https://a.example and www.b.example please.';
    const three = `${two} Also http://c.example`;
    expect(contactSchema.safeParse({ ...valid, message: two }).success).toBe(true);
    const result = contactSchema.safeParse({ ...valid, message: three });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!).message).toMatch(/no more than 2 links/);
  });
});

describe('signed timestamps', () => {
  const secret = 'unit-test-secret';

  it('accepts a token older than 3 seconds', async () => {
    const token = await signTimestamp(secret, 1_000_000);
    expect(await checkTimestamp(secret, token, 1_000_000 + 3_500)).toBe('ok');
  });

  it('flags submissions faster than 3 seconds', async () => {
    const token = await signTimestamp(secret, 1_000_000);
    expect(await checkTimestamp(secret, token, 1_000_000 + 1_000)).toBe('too-fast');
  });

  it('rejects tampered, foreign and expired tokens', async () => {
    const token = await signTimestamp(secret, 1_000_000);
    const [, sig] = token.split('.');
    expect(await checkTimestamp(secret, `999000.${sig}`, 1_010_000)).toBe('invalid');
    expect(await checkTimestamp('other-secret', token, 1_010_000)).toBe('invalid');
    expect(await checkTimestamp(secret, 'garbage', 1_010_000)).toBe('invalid');
    expect(await checkTimestamp(secret, token, 1_000_000 + 3 * 60 * 60 * 1000)).toBe('expired');
  });
});

describe('MemoryRateLimiter', () => {
  it('allows five hits per window per key', async () => {
    const limiter = new MemoryRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) expect((await limiter.hit('1.2.3.4')).allowed).toBe(true);
    const blocked = await limiter.hit('1.2.3.4');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect((await limiter.hit('5.6.7.8')).allowed).toBe(true);
  });
});
