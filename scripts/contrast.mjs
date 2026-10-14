// Prints WCAG 2.x contrast ratios for every text/background pairing the site uses.
// Run: node scripts/contrast.mjs   (fails if any body-text pair drops below 4.5:1)
const hex = (h) =>
  h
    .replace('#', '')
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255);
const lum = (h) => {
  const [r, g, b] = hex(h).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Colour of a pattern stroke (fg at `alpha`) over bg: the worst case for text on it. */
const over = (bg, fg, alpha) =>
  '#' +
  hex(bg)
    .map((b, i) => Math.round((b * (1 - alpha) + hex(fg)[i] * alpha) * 255))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

export const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const c = {
  paper: '#FBF7EE',
  'paper-2': '#F6EBCF',
  ink: '#23302E',
  sage: '#597470',
  'sage-deep': '#4A615E',
  pine: '#2F3E3C',
  clay: '#726258',
  sun: '#FAD890',
  stone: '#BFB8AF',
  'stone-2': '#9B928B',
  'pine-2': '#283533',
  'muted-dark': '#D9CFC0',
  'link-hover-dark': '#FDE6B4',
  error: '#9E3A2B',
  'error-dark': '#F2A594',
  'sun-hover': '#F7CC6F',
  'clay-deep': '#67584F',
};
// Pattern strokes at their opacity, as backgrounds (see .hero, .cs-header, footer).
c['stroke-light'] = over(c['paper-2'], c.stone, 0.3);
c['stroke-footer'] = over(c.pine, c.sage, 0.35);
c['stroke-dark'] = over(c['pine-2'], c.sage, 0.3);

// [foreground, background, use, minimum]  (4.5 = normal text, 3 = large text / UI)
const pairs = [
  ['ink', 'paper', 'Body text', 4.5],
  ['ink', 'paper-2', 'Body text on cards', 4.5],
  ['sage', 'paper', 'Headings, links', 4.5],
  ['sage', 'paper-2', 'Large headings on cards only', 3],
  ['sage-deep', 'paper-2', 'Links and small headings on cards', 4.5],
  ['sage-deep', 'paper', 'Link hover, focus ring', 4.5],
  ['clay', 'paper', 'Meta, eyebrows', 4.5],
  ['clay', 'paper-2', 'Meta on cards', 4.5],
  ['ink', 'sun', 'Primary button', 4.5],
  ['ink', 'sun-hover', 'Primary button (hover)', 4.5],
  ['pine', 'sun', 'Selected CV tab (dark theme)', 4.5],
  ['sage-deep', 'sun', 'Text on yellow', 4.5],
  ['sage', 'sun', 'Large text / graphics only', 3],
  ['sun', 'pine', 'Footer accents', 4.5],
  ['paper', 'pine', 'Footer text', 4.5],
  ['error', 'paper', 'Form errors', 4.5],
  ['stone-2', 'paper', 'Pattern only (never text)', 0],
  ['stone', 'paper', 'Hairlines (decorative)', 0],
  // Dark theme
  ['paper', 'pine', 'Dark: body text', 4.5],
  ['paper', 'pine-2', 'Dark: text on cards', 4.5],
  ['sun', 'pine', 'Dark: headings, links', 4.5],
  ['sun', 'pine-2', 'Dark: links on cards', 4.5],
  ['link-hover-dark', 'pine', 'Dark: link hover', 4.5],
  ['muted-dark', 'pine', 'Dark: meta', 4.5],
  ['muted-dark', 'pine-2', 'Dark: meta on cards', 4.5],
  ['error-dark', 'pine', 'Dark: form errors', 4.5],
  ['sun', 'sage', 'Dark: hero highlight (large text)', 3],
  // Worst case: small text sitting right on a pattern stroke.
  ['clay-deep', 'stroke-light', 'Small text over the pattern (hero, case-study header)', 4.5],
  ['clay-deep', 'paper-2', 'Small text in pattern bands, between strokes', 4.5],
  ['sage-deep', 'stroke-light', 'Links and buttons over the pattern', 4.5],
  ['ink', 'stroke-light', 'Body text over the pattern', 4.5],
  ['muted-dark', 'stroke-footer', 'Footer meta over the pattern', 4.5],
  ['sun', 'stroke-footer', 'Footer links over the pattern', 4.5],
  ['muted-dark', 'stroke-dark', 'Dark: meta over the pattern', 4.5],
  ['sun', 'stroke-dark', 'Dark: links over the pattern', 4.5],
];

let failed = false;
const rows = pairs.map(([fg, bg, use, min]) => {
  const r = ratio(c[fg], c[bg]);
  const ok = r >= min;
  if (!ok) failed = true;
  return `| ${fg} on ${bg} | ${r.toFixed(1)}:1 | ${use} | ${min ? (ok ? 'pass' : 'FAIL') : 'n/a'} |`;
});
console.log('| Pair | Ratio | Use | AA |\n|---|---|---|---|\n' + rows.join('\n'));
if (failed) process.exit(1);
