/**
 * Contact form endpoint: the only on-demand route on the site.
 *
 * GET  returns a signed timestamp for the minimum time-to-submit check.
 * POST validates and sends a message. It answers JSON to the enhanced form
 *      (Accept: application/json) and redirects for a plain HTML form POST.
 *
 * Uses only web-standard APIs (fetch, Web Crypto, streams, FormData), and
 * nothing here depends on what a reverse proxy forwards, so it runs the same
 * on Node (direct, or behind Caddy or Nginx) and on Cloudflare Workers.
 */
import type { APIContext, APIRoute } from 'astro';
import {
  ALLOWED_ORIGINS,
  CLIENT_IP_HEADER,
  CONTACT_TO,
  FORM_SIGNING_SECRET,
  MAIL_FROM,
  MAIL_FROM_NAME,
  MAIL_LOG_FILE,
  MAIL_PROVIDER,
  RESEND_API_KEY,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  TURNSTILE_SECRET_KEY,
} from 'astro:env/server';
import { contactSchema, fieldErrors, TOPICS, type FieldErrors } from '@/lib/contact/schema';
import { checkTimestamp, signTimestamp } from '@/lib/contact/token';
import { verifyTurnstile } from '@/lib/contact/turnstile';
import { MemoryRateLimiter } from '@/lib/contact/rate-limit';
import {
  BodyTooLargeError,
  clientIp,
  isLoopback,
  isSameOrigin,
  readFormData,
} from '@/lib/contact/request';
import { createMailer, type MailConfig, type Mailer } from '@/lib/mail';

export const prerender = false;

/** The form's fields add up to well under this; anything bigger is abuse. */
const MAX_BODY_BYTES = 16 * 1024;
const DEV_SECRET = 'dev-only-not-secret';
const limiter = new MemoryRateLimiter(5, 60 * 60 * 1000);

/** Origins allowed to post the form: the site (and www), plus ALLOWED_ORIGINS. */
const site = new URL(import.meta.env.SITE);
const allowedOrigins = [
  site.origin,
  `${site.protocol}//www.${site.host}`,
  ...(ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
];

type ErrorCode =
  'invalid' | 'expired' | 'verify' | 'rate' | 'send' | 'config' | 'forbidden' | 'too-large';

const MESSAGES: Record<ErrorCode, string> = {
  invalid: 'Some fields need another look.',
  expired: 'The form timed out. Please try again.',
  verify: "I couldn't confirm you're human. Please try again.",
  rate: "You've sent a few messages already. Please try again in a while.",
  send: "Your message couldn't be sent just now. Please try again in a few minutes.",
  config: "The form isn't working right now. Please reach me on LinkedIn instead.",
  forbidden: 'This form can only be sent from devnel.com.',
  'too-large': 'That message is too long.',
};

const STATUS: Record<ErrorCode, number> = {
  invalid: 422,
  expired: 400,
  verify: 400,
  rate: 429,
  send: 502,
  config: 503,
  forbidden: 403,
  'too-large': 413,
};

/** Codes the no-JS fallback can show on /contact/ (see ContactForm.astro). */
const PAGE_CODES = new Set<ErrorCode>(['invalid', 'expired', 'verify', 'rate', 'send', 'config']);

function signingSecret() {
  return FORM_SIGNING_SECRET ?? (import.meta.env.DEV ? DEV_SECRET : undefined);
}

let warnedAboutProxy = false;
function visitorIp({ request, clientAddress }: APIContext): string {
  let socket = 'unknown';
  try {
    socket = clientAddress;
  } catch {
    // Some adapters can't provide it.
  }
  const ip = clientIp(request, CLIENT_IP_HEADER, socket);
  if (!warnedAboutProxy && CLIENT_IP_HEADER === 'none' && isLoopback(ip) && !import.meta.env.DEV) {
    warnedAboutProxy = true;
    console.warn(
      '[contact] Requests come from a loopback address, so every visitor shares one rate-limit ' +
        'bucket. Behind a reverse proxy, set CLIENT_IP_HEADER (see .env.example).',
    );
  }
  return ip;
}

/** Builds the mailer, or returns undefined if its settings are missing. */
async function mailer(): Promise<Mailer | undefined> {
  const config: MailConfig =
    MAIL_PROVIDER === 'smtp'
      ? {
          provider: 'smtp',
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_SECURE,
          user: SMTP_USER,
          pass: SMTP_PASS,
        }
      : MAIL_PROVIDER === 'log'
        ? { provider: 'log', file: MAIL_LOG_FILE }
        : { provider: 'resend', apiKey: RESEND_API_KEY };
  try {
    return await createMailer(config);
  } catch (error) {
    console.error('[contact] mail is not configured:', (error as Error).message);
    return undefined;
  }
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

export const GET: APIRoute = async () => {
  const secret = signingSecret();
  if (!secret) return json({ ok: false, message: MESSAGES.config }, 503);
  return json({ token: await signTimestamp(secret) });
};

export const POST: APIRoute = async (context) => {
  const { request, redirect } = context;
  const wantsJson = request.headers.get('accept')?.includes('application/json') ?? false;

  const success = () => (wantsJson ? json({ ok: true }) : redirect('/thanks/', 303));
  const fail = (code: ErrorCode, errors?: FieldErrors, headers?: HeadersInit) => {
    if (wantsJson) {
      return json({ ok: false, code, message: MESSAGES[code], errors }, STATUS[code], headers);
    }
    if (code === 'forbidden') return new Response(MESSAGES.forbidden, { status: 403 });
    return redirect(`/contact/#error-${PAGE_CODES.has(code) ? code : 'invalid'}`, 303);
  };

  // Cheap checks first, before reading the body.
  if (!isSameOrigin(request, allowedOrigins)) return fail('forbidden');

  const secret = signingSecret();
  const turnstileSecret = TURNSTILE_SECRET_KEY;
  if (!secret || (!turnstileSecret && !import.meta.env.DEV)) {
    console.error('[contact] FORM_SIGNING_SECRET or TURNSTILE_SECRET_KEY is not set');
    return fail('config');
  }

  let form: FormData;
  try {
    form = await readFormData(request, MAX_BODY_BYTES);
  } catch (error) {
    return fail(error instanceof BodyTooLargeError ? 'too-large' : 'invalid');
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };

  // Honeypot: people never see this field, so anything in it is a bot.
  // Reject silently: the bot gets the same response as a real success.
  if (field('website') !== '') return success();

  // No timestamp at all means the page's script never ran (no JS, or a bot).
  if (!field('ts')) return fail('verify');
  const timing = await checkTimestamp(secret, field('ts'));
  if (timing === 'too-fast') return success(); // Faster than a human: treat like the honeypot.
  if (timing !== 'ok') return fail('expired');

  const parsed = contactSchema.safeParse({
    name: field('name'),
    email: field('email'),
    topic: field('topic'),
    message: field('message'),
  });
  if (!parsed.success) return fail('invalid', fieldErrors(parsed.error));

  // Rate-limit what's left: plausible messages, before the expensive steps
  // (the Turnstile call and sending mail). Typos don't use up the allowance.
  const ip = visitorIp(context);
  const rate = await limiter.hit(ip);
  if (!rate.allowed) {
    return fail('rate', undefined, { 'Retry-After': String(rate.retryAfterSeconds) });
  }

  if (turnstileSecret) {
    const human = await verifyTurnstile(turnstileSecret, field('cf-turnstile-response'), ip);
    if (!human) return fail('verify');
  } else {
    console.warn('[contact] TURNSTILE_SECRET_KEY not set: skipping Turnstile in dev');
  }

  const send = await mailer();
  if (!send) return fail('config');

  const { name, email, topic, message } = parsed.data;
  const topicLabel = topic ? TOPICS[topic] : undefined;
  const cleanName = name.replace(/[\r\n]+/g, ' ');

  try {
    await send.send({
      from: { name: MAIL_FROM_NAME, address: MAIL_FROM },
      to: CONTACT_TO,
      replyTo: { name: cleanName, address: email },
      subject: `${topicLabel ?? 'Message'} from ${cleanName} (devnel.com)`,
      text: [
        `Name: ${cleanName}`,
        `Email: ${email}`,
        `About: ${topicLabel ?? 'Not specified'}`,
        '',
        message,
      ].join('\n'),
    });
  } catch (error) {
    console.error('[contact] send failed:', error);
    return fail('send');
  }

  return success();
};
