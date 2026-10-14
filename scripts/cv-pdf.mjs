// Builds the two CV PDFs from src/data/resume.json with headless Chromium:
//
//   npm run cv:pdf             # writes ./cv-pdf/*.pdf for review
//   npm run cv:pdf -- --write  # overwrites public/cv/*.pdf
//
// The layout is for applicant tracking systems as much as for people: one
// column of real text, standard section names, plain bullets, no tables or
// text in images, and the contact details in the body (some ATS skip page
// headers and footers). Branding is colour and the [>·<] mark only; the type
// is Source Sans 3 throughout. No phone number: resume.json can't hold one,
// and `npm run check:dist` checks the PDFs after a build.
//
// Loads the site's own resume schema and track logic, so it needs Node's
// TypeScript type stripping (on by default from Node 23.6; the npm script
// passes the flag for Node 22).
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { resumeSchema } from '../src/lib/content/resume-schema.ts';
import { applyTrack } from '../src/lib/content/resume-tracks.ts';
import { formatPeriod } from '../src/lib/format.ts';

const outDir = process.argv.includes('--write') ? 'public/cv' : 'cv-pdf';
const files = {
  engineering: { file: 'Kyle-Nel_CV_Engineering.pdf', title: 'Engineering' },
  support: { file: 'Kyle-Nel_CV_Support.pdf', title: 'Support' },
};

// Brand tokens (src/styles/tokens.css), all AA on white for text.
const C = {
  ink: '#23302e',
  sageDeep: '#4a615e',
  sage: '#597470',
  clay: '#726258',
  sun: '#fad890',
  stone: '#bfb8af',
};

const raw = JSON.parse(await readFile('src/data/resume.json', 'utf8'));
const resume = resumeSchema.parse(raw);

const font = (
  await readFile(
    'node_modules/@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2',
  )
).toString('base64');
const mark = (await readFile('src/assets/brand/devnel-icon-white.svg', 'utf8'))
  .replace(/<\?xml[^>]*>|<!--[\s\S]*?-->|<title>[\s\S]*?<\/title>|<desc>[\s\S]*?<\/desc>/g, '')
  .replace(/fill="#FFFFFF"/g, `fill="${C.sage}"`)
  .replace(/width="220px" height="112px"/, 'class="mark" aria-hidden="true"');

const esc = (s = '') =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const bare = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const country = new Intl.DisplayNames('en-GB', { type: 'region' });
const join = (...parts) => parts.filter(Boolean).map(esc).join(' · ');

const entry = (title, org, meta, summary, highlights = []) => `
  <article class="entry">
    <h3>${esc(title)} — ${esc(org)}</h3>
    <p class="meta">${meta}</p>
    ${summary ? `<p>${esc(summary)}</p>` : ''}
    ${highlights.length ? `<ul>${highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
  </article>`;

function html(track) {
  const cv = applyTrack(resume, track);
  const { basics } = cv;
  const location = `${basics.location.city}, ${country.of(basics.location.countryCode)}`;
  const links = [basics.url, ...basics.profiles.map((p) => p.url)];

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${esc(basics.name)}: CV (${files[track].title})</title>
<style>
  @font-face {
    font-family: 'Source Sans 3';
    font-weight: 200 900;
    src: url(data:font/woff2;base64,${font}) format('woff2');
  }
  @page { size: A4; margin: 12mm 15mm 13mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 9.3pt/1.34 'Source Sans 3', sans-serif; color: ${C.ink}; }
  a { color: inherit; text-decoration: none; }

  header { padding-bottom: 3mm; border-bottom: 1.6mm solid ${C.sun}; }
  .name { display: flex; align-items: center; justify-content: space-between; gap: 6mm; }
  h1 { font-size: 22pt; line-height: 1.1; font-weight: 700; }
  .mark { width: 15mm; height: auto; flex: none; }
  .label { margin-top: 1mm; font-size: 12pt; font-weight: 600; color: ${C.sageDeep}; }
  .contact { margin-top: 2mm; }
  .contact a { color: ${C.sageDeep}; font-weight: 600; }
  header .meta { margin-top: 0.6mm; }

  section { margin-top: 3.6mm; }
  h2 {
    font-size: 10.5pt; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    color: ${C.sageDeep}; padding-bottom: 1mm; margin-bottom: 2mm;
    border-bottom: 0.3mm solid ${C.stone};
    break-after: avoid;
  }
  p + p { margin-top: 1.6mm; }
  .meta { color: ${C.clay}; }
  .entry + .entry { margin-top: 2.6mm; }
  h3 { font-size: 10.4pt; font-weight: 700; break-after: avoid; }
  .entry .meta { margin-bottom: 0.8mm; break-after: avoid; }
  ul { margin-top: 0.8mm; padding-left: 4.5mm; }
  li { break-inside: avoid; }
  li + li { margin-top: 0.4mm; }
  li::marker { color: ${C.sage}; }
  .skills li { list-style: none; }
  .skills ul { padding-left: 0; }
  .skills strong { font-weight: 700; }
</style>
</head>
<body>
  <header>
    <div class="name"><h1>${esc(basics.name)}</h1>${mark}</div>
    <p class="label">${esc(basics.label)}</p>
    <p class="contact">
      <a href="mailto:${esc(basics.email)}">${esc(basics.email)}</a>
      ${links.map((u) => ` · <a href="${esc(u)}">${esc(bare(u))}</a>`).join('')}
    </p>
    <p class="meta">${join(location, basics['x-workRights'])}</p>
  </header>

  <section>
    <h2>Profile</h2>
    ${basics.summary
      .split(/\n\n+/)
      .map((p) => `<p>${esc(p)}</p>`)
      .join('')}
  </section>

  <section class="skills">
    <h2>Skills</h2>
    <ul>${cv.skills
      .map((s) => `<li><strong>${esc(s.name)}:</strong> ${esc(s.keywords.join(', '))}</li>`)
      .join('')}</ul>
  </section>

  <section>
    <h2>Professional Experience</h2>
    ${cv.work
      .map((w) =>
        entry(
          w.position,
          w.name,
          join(w.location, formatPeriod(w.startDate, w.endDate), w['x-note']),
          w.summary,
          w.highlights,
        ),
      )
      .join('')}
  </section>

  ${
    cv.volunteer.length
      ? `<section>
    <h2>Leadership &amp; Community</h2>
    ${cv.volunteer
      .map((v) =>
        entry(
          v.position,
          v.organization,
          join(v.location, formatPeriod(v.startDate, v.endDate)),
          v.summary,
          v.highlights,
        ),
      )
      .join('')}
  </section>`
      : ''
  }

  <section>
    <h2>Education</h2>
    ${cv.education
      .map((e) =>
        entry(
          `${e.studyType} ${e.area}`,
          e.institution,
          join(e.startDate && formatPeriod(e.startDate, e.endDate), e.score),
        ),
      )
      .join('')}
  </section>
</body>
</html>`;
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
for (const track of /** @type {const} */ (['engineering', 'support'])) {
  const page = await browser.newPage();
  await page.setContent(html(track), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const path = `${outDir}/${files[track].file}`;
  await page.pdf({ path, preferCSSPageSize: true, printBackground: true, tagged: true });
  console.log(path);
}
await browser.close();
