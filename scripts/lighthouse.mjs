// Lighthouse smoke test against the production build. Run after `npm run build:node`:
//
//   npm run lighthouse
//
// Starts the built server, audits a few key pages (mobile, Lighthouse's
// default), and fails only on a real regression:
//   - Accessibility, Best Practices or SEO below 100 (deterministic scores)
//   - Performance below 90 (CI machines are noisy; a miss is retried once)
// Override with LH_MIN_PERFORMANCE / LH_MIN_OTHER (0–100), and LH_PAGES
// (comma-separated paths). Needs Chrome (set CHROME_PATH if it isn't found).
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const LIGHTHOUSE = 'lighthouse@12.8.2';
const PORT = Number(process.env.LH_PORT ?? 4339);
const BASE = `http://127.0.0.1:${PORT}`;
const PAGES = (process.env.LH_PAGES ?? '/,/work/igrow/,/about/,/cv/,/contact/').split(',');
const MIN_PERFORMANCE = Number(process.env.LH_MIN_PERFORMANCE ?? 90);
const MIN_OTHER = Number(process.env.LH_MIN_OTHER ?? 100);

const server = spawn(process.execPath, ['--env-file-if-exists=.env', 'dist/server/entry.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT) },
  stdio: 'ignore',
});

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server didn't start on ${BASE}`);
}

const dir = await mkdtemp(join(tmpdir(), 'lighthouse-'));

async function audit(path) {
  const out = join(dir, `${path.replace(/\W+/g, '_') || 'home'}.json`);
  await run('npx', [
    '-y',
    LIGHTHOUSE,
    BASE + path,
    '--quiet',
    '--chrome-flags=--headless=new --no-sandbox',
    '--output=json',
    `--output-path=${out}`,
  ]);
  const report = JSON.parse(await readFile(out, 'utf8'));
  return Object.fromEntries(
    Object.entries(report.categories).map(([id, c]) => [id, Math.round(c.score * 100)]),
  );
}

const failures = [];
try {
  await waitForServer();
  console.log('| Page | Performance | Accessibility | Best Practices | SEO |');
  console.log('|---|---|---|---|---|');
  for (const path of PAGES) {
    let scores = await audit(path);
    if (scores.performance < MIN_PERFORMANCE) scores = await audit(path); // one retry for noise
    const s = scores;
    console.log(
      `| ${path} | ${s.performance} | ${s.accessibility} | ${s['best-practices']} | ${s.seo} |`,
    );
    if (s.performance < MIN_PERFORMANCE)
      failures.push(`${path}: performance ${s.performance} < ${MIN_PERFORMANCE}`);
    for (const id of ['accessibility', 'best-practices', 'seo']) {
      if (s[id] < MIN_OTHER) failures.push(`${path}: ${id} ${s[id]} < ${MIN_OTHER}`);
    }
  }
} finally {
  server.kill();
  await rm(dir, { recursive: true, force: true });
}

if (failures.length) {
  console.error('\nLighthouse regressions:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nLighthouse smoke test passed.');
