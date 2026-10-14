// @ts-check
import { defineConfig, envField, passthroughImageService } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import { createHash } from 'node:crypto';
import ogImages from './integrations/og-images.ts';
import { REVEAL_SCRIPT, SPECULATION_RULES } from './src/lib/inline-scripts.ts';

/** CSP hash for an inline script Astro doesn't hash itself. */
const sha256 = (/** @type {string} */ text) =>
  /** @type {`sha256-${string}`} */ (
    `sha256-${createHash('sha256').update(text).digest('base64')}`
  );

// Pages are static by default. Only routes that export `prerender = false`
// (the contact endpoint) run on the server. Production is Cloudflare Workers;
// ASTRO_ADAPTER=node builds for Node instead, which the e2e tests and
// Lighthouse use (the `log` mailer they rely on is Node-only). See
// "Deploying" in the README.
const adapter =
  process.env.ASTRO_ADAPTER === 'node'
    ? // bodySizeLimit is Node-specific; the contact endpoint enforces its own
      // 16 KB limit too, so the cap holds on every adapter.
      node({ mode: 'standalone', bodySizeLimit: 64 * 1024 })
    : cloudflare({ imageService: 'passthrough' });

export default defineConfig({
  site: 'https://devnel.com',
  // One URL per page: /about/ (matches canonicals and the sitemap).
  trailingSlash: 'always',
  adapter,
  security: {
    // The contact endpoint does its own cross-site check (Sec-Fetch-Site,
    // then Origin against SITE_ORIGINS). Astro's built-in check compares
    // Origin with the Host it sees, which behind a reverse proxy depends on
    // what the proxy forwards: it rejected every real submission behind
    // Caddy. See src/lib/contact/request.ts.
    checkOrigin: false,
    // Content-Security-Policy as a <meta> tag on every page, so it works on
    // any host. Astro hashes its own scripts and styles; the two inline
    // scripts are hashed here. frame-ancestors can't go in a meta tag: it's
    // sent as a header by the proxy configs (deploy/) and public/_headers.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        'frame-src https://challenges.cloudflare.com',
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://challenges.cloudflare.com'],
        hashes: [sha256(SPECULATION_RULES), sha256(REVEAL_SCRIPT)],
      },
    },
  },
  // No code blocks in the content; Shiki's inline styles would break the CSP.
  markdown: { syntaxHighlight: false },
  // Neither is used: turning them off removes the /_image endpoint and the
  // session storage the Node adapter would otherwise set up.
  session: false,
  integrations: [
    mdx(),
    ogImages(),
    sitemap({
      filter: (page) => !/\/(thanks|404)\/?$/.test(page),
    }),
  ],
  prefetch: false,
  env: {
    // Typed, validated env vars. Secrets are read at runtime on the server
    // only; TURNSTILE_SITE_KEY is public and inlined at build time.
    schema: {
      TURNSTILE_SITE_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      FORM_SIGNING_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      MAIL_PROVIDER: envField.enum({
        context: 'server',
        access: 'secret',
        values: ['resend', 'smtp', 'log'],
        default: 'resend',
      }),
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      MAIL_FROM: envField.string({
        context: 'server',
        access: 'secret',
        default: 'contact@devnel.com',
      }),
      MAIL_FROM_NAME: envField.string({
        context: 'server',
        access: 'secret',
        default: 'devNel contact form',
      }),
      CONTACT_TO: envField.string({
        context: 'server',
        access: 'secret',
        default: 'kyle@devnel.com',
      }),
      SMTP_HOST: envField.string({ context: 'server', access: 'secret', optional: true }),
      SMTP_PORT: envField.number({ context: 'server', access: 'secret', default: 587 }),
      SMTP_SECURE: envField.boolean({ context: 'server', access: 'secret', default: false }),
      SMTP_USER: envField.string({ context: 'server', access: 'secret', optional: true }),
      SMTP_PASS: envField.string({ context: 'server', access: 'secret', optional: true }),
      MAIL_LOG_FILE: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Which header holds the visitor's IP (see src/lib/contact/request.ts).
      CLIENT_IP_HEADER: envField.enum({
        context: 'server',
        access: 'secret',
        values: ['none', 'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'],
        default: 'none',
      }),
      // Extra origins allowed to post the form, comma-separated (e.g. a
      // staging domain). The site URL and www are always allowed.
      ALLOWED_ORIGINS: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  build: {
    inlineStylesheets: 'always',
  },
  image: {
    service: passthroughImageService(),
  },
});
