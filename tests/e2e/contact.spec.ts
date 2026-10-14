import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

const MAIL_LOG = 'test-results/mail.jsonl';

/** Replaces Cloudflare's Turnstile script with a stub that always "passes". */
async function stubTurnstile(page: Page) {
  await page.route('https://challenges.cloudflare.com/turnstile/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.turnstile = {
        render(el, options) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'cf-turnstile-response';
          input.value = 'XXXX.DUMMY.TOKEN.XXXX';
          el.append(input);
          setTimeout(() => options.callback('XXXX.DUMMY.TOKEN.XXXX'), 50);
          return 'stub';
        },
        reset() {},
      };
      window.onTurnstileReady && window.onTurnstileReady();`,
    }),
  );
}

async function sentMail(): Promise<string> {
  return readFile(MAIL_LOG, 'utf8').catch(() => '');
}

test('shows accessible field-level errors for an empty form', async ({ page }) => {
  await stubTurnstile(page);
  await page.goto('/contact/');
  await page.getByRole('button', { name: 'Send message' }).click();

  const name = page.getByLabel('Name');
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Please tell me your name.')).toBeVisible();
  await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Some fields need another look.');
});

test('rejects too many links before sending', async ({ page }) => {
  await stubTurnstile(page);
  await page.goto('/contact/');
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Email').fill('ada@example.com');
  await page
    .getByLabel('Message')
    .fill('Links: https://a.example https://b.example https://c.example');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Please include no more than 2 links.')).toBeVisible();
});

test('silently rejects a honeypot submission', async ({ request, baseURL }) => {
  const marker = `honeypot-${Date.now()}-${Math.random()}`;
  const res = await request.post('/api/contact/', {
    headers: { Origin: baseURL! },
    form: {
      name: 'Bot',
      email: 'bot@example.com',
      message: `Buy now ${marker}`,
      website: 'https://spam.example',
      ts: '',
    },
    maxRedirects: 0,
  });

  // Looks exactly like a success to the bot...
  expect(res.status()).toBe(303);
  expect(res.headers()['location']).toBe('/thanks/');
  // ...but nothing was sent.
  expect(await sentMail()).not.toContain(marker);
});

test('rejects a no-JS submission without the signed timestamp', async ({ request, baseURL }) => {
  const res = await request.post('/api/contact/', {
    headers: { Origin: baseURL! },
    form: { name: 'Ada', email: 'ada@example.com', message: 'Hello there, Kyle!' },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(303);
  expect(res.headers()['location']).toBe('/contact/#error-verify');
});

test('sends a valid message and shows inline success', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'one send is enough');
  await stubTurnstile(page);
  const marker = `hello-${Date.now()}`;
  await page.goto('/contact/');
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel("What's this about?").selectOption('job');
  await page.getByLabel('Message').fill(`We have a role you might like. ${marker}`);
  await page.waitForTimeout(3200); // the minimum time-to-submit
  await page.getByRole('button', { name: 'Send message' }).click();

  await expect(page.getByRole('heading', { name: 'Message received.' })).toBeVisible();
  await expect.poll(sentMail).toContain(marker);
  const sent = (await sentMail()).split('\n').find((line) => line.includes(marker))!;
  const mail = JSON.parse(sent);
  expect(mail.replyTo.address).toBe('ada@example.com');
  expect(mail.subject).toContain('Job opportunity');
});

test.describe('cross-site protection works behind any proxy', () => {
  const form = { name: 'Ada', email: 'ada@example.com', message: 'Hello there, Kyle!' };

  test('accepts the real site origin even when the proxy rewrites Host', async ({ request }) => {
    // What Caddy or Nginx forwards: the public Origin, while the app itself
    // sees a localhost URL. Astro's built-in check rejected exactly this.
    const res = await request.post('/api/contact/', {
      headers: {
        Origin: 'https://devnel.com',
        'X-Forwarded-Host': 'devnel.com',
        'X-Forwarded-Proto': 'https',
      },
      form,
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    expect(res.headers()['location']).toBe('/contact/#error-verify');
  });

  test('accepts a same-origin browser request by Sec-Fetch-Site alone', async ({ request }) => {
    const res = await request.post('/api/contact/', {
      headers: { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://whatever.example' },
      form,
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
  });

  test('rejects other origins', async ({ request }) => {
    const cases: Record<string, string>[] = [
      { Origin: 'https://evil.example' },
      { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://devnel.com' },
    ];
    for (const headers of cases) {
      const res = await request.post('/api/contact/', { headers, form, maxRedirects: 0 });
      expect(res.status()).toBe(403);
    }
  });

  test('refuses oversized bodies without reading them', async ({ request, baseURL }) => {
    const res = await request.post('/api/contact/', {
      headers: { Origin: baseURL!, Accept: 'application/json' },
      form: { ...form, message: 'x'.repeat(40_000) },
    });
    expect(res.status()).toBe(413);
  });
});
