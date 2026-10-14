import { defineConfig, devices } from '@playwright/test';

// A separate port from `astro dev` (4321), so a running dev server is never
// mistaken for the production build. Override with E2E_PORT.
const PORT = Number(process.env.E2E_PORT ?? 4329);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Runs the production build (static pages + the contact endpoint).
    command: `npm run start`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      // Test mode: Turnstile's official always-pass keys and no real email.
      TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
      FORM_SIGNING_SECRET: 'test-only-signing-secret-0123456789',
      MAIL_PROVIDER: 'log',
      MAIL_LOG_FILE: 'test-results/mail.jsonl',
      CONTACT_TO: 'test@example.com',
      MAIL_FROM: 'contact@example.com',
    },
  },
});
