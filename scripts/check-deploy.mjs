// Run by `npm run deploy` between the build and `wrangler deploy`: refuses to
// ship a contact page without a real Turnstile site key. The site key is
// baked into the HTML at build time, and the Cloudflare adapter would
// otherwise pick up the test key from a local .env (which is why the deploy
// script sets CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false).
import { readFile } from 'node:fs/promises';

const html = await readFile('dist/client/contact/index.html', 'utf8');
const key = html.match(/data-sitekey="([^"]*)"/)?.[1];

if (!key || key.startsWith('1x') || key.startsWith('2x') || key.startsWith('3x')) {
  console.error(
    `Deploy stopped: the contact page has ${key ? `Cloudflare's test Turnstile key (${key})` : 'no Turnstile site key'}.\n` +
      'Set TURNSTILE_SITE_KEY in wrangler.jsonc "vars", or run: TURNSTILE_SITE_KEY=<site key> npm run deploy',
  );
  process.exit(1);
}
console.log(`Turnstile site key: ${key}`);
