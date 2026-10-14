// Checks what actually ships. Run after `npm run build`.
//
// - No `TODO(kyle)` placeholder in any HTML page, so an unfinished <Todo> or a
//   wording reminder can't reach production.
// - No email address in plain text in any HTML page (EmailLink encodes it).
// - No phone-number-like strings in the HTML or in the CV PDFs, which are the
//   files most likely to pick one up when they're replaced by hand.
//
// /resume.json is allowed its email (JSON Resume expects basics.email); its
// phone check is scripts/check-resume-privacy.mjs.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const DIST = 'dist/client';
const TODO = 'TODO(kyle)';
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// Same rule as check-resume-privacy.mjs: 9+ digits joined by separators.
const PHONE = /\+?\(?\d[\d\s().-]{6,}\d/g;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const phones = (text) =>
  (text.match(PHONE) ?? []).filter((m) => m.replace(/\D/g, '').length >= 9).map((m) => m.trim());

async function pdfText(path) {
  const doc = await getDocument({ data: new Uint8Array(await readFile(path)), verbosity: 0 })
    .promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
  }
  return text;
}

const problems = [];
let pages = 0;
let pdfs = 0;

for await (const file of walk(DIST)) {
  if (file.endsWith('.html')) {
    pages++;
    const html = await readFile(file, 'utf8');
    const todos = html.split(TODO).length - 1;
    if (todos) problems.push(`${file}: ${todos} × "${TODO}"`);
    for (const email of html.match(EMAIL) ?? []) problems.push(`${file}: email "${email}"`);
    // Phones: check what a reader sees (text and link targets), not SVG path
    // data, CSS or script code, whose numbers look like phone numbers.
    const visible = html
      .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g, ' ')
      .replace(/<[^>]*?\bhref="([^"]*)"[^>]*>/g, ' $1 ')
      .replace(/<[^>]+>/g, ' ');
    for (const phone of phones(visible)) problems.push(`${file}: phone-like "${phone}"`);
  } else if (file.endsWith('.pdf')) {
    pdfs++;
    for (const phone of phones(await pdfText(file)))
      problems.push(`${file}: phone-like "${phone}"`);
  }
}

if (problems.length) {
  console.error('Dist check failed:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `Dist check passed: ${pages} pages and ${pdfs} PDFs, no TODO(kyle), plain-text email or phone numbers.`,
);
