// Validates src/data/resume.json against the official JSON Resume schema.
// The site's own Zod schema (src/lib/content/resume-schema.ts) is checked by
// the unit tests and at build time; this is the upstream check.
import { readFile } from 'node:fs/promises';
import resumeSchema from '@jsonresume/schema';

const file = new URL('../src/data/resume.json', import.meta.url);
const resume = JSON.parse(await readFile(file, 'utf8'));

resumeSchema.validate(resume, (errors, valid) => {
  if (valid) {
    console.log('resume.json is valid JSON Resume.');
    return;
  }
  console.error('resume.json failed JSON Resume schema validation:');
  for (const e of errors) console.error(`  ${e.property}: ${e.message}`);
  process.exit(1);
});
