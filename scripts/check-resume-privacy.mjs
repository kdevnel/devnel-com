// Fails if resume.json contains a phone number. The file is public (the site,
// /resume.json and the JSON Resume registry), so this is deliberate.
import { readFile } from 'node:fs/promises';

const file = process.argv[2] ?? new URL('../src/data/resume.json', import.meta.url);
const text = await readFile(file, 'utf8');
const resume = JSON.parse(text);
const problems = [];

if (resume.basics?.phone) problems.push('basics.phone is set');

// Anything with 9+ digits joined by spaces, dots, dashes or brackets, with an
// optional + prefix, looks like a phone number. Dates ("2023-09") and counts
// ("300+") have far fewer digits, so they don't trip this.
const candidates = text.match(/\+?\(?\d[\d\s().-]{6,}\d/g) ?? [];
for (const match of candidates) {
  const digits = match.replace(/\D/g, '');
  if (digits.length >= 9) problems.push(`phone-like number: "${match.trim()}"`);
}

if (problems.length) {
  console.error('resume.json must not contain a phone number:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('resume.json privacy check passed (no phone numbers).');
