/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// The Cloudflare adapter's Vite plugin clashes with Vitest's server; the unit
// tests don't need workerd, so they load the config with the Node adapter.
process.env.ASTRO_ADAPTER = 'node';

export default getViteConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    passWithNoTests: true,
  },
});
