/**
 * Generates the branded Open Graph images (1200×630) after the build:
 *   /og/default.png      logo + tagline, for every page without its own
 *   /og/work/<slug>.png  one per case study, from the content layer (via
 *                        the build-only /og/manifest.json)
 *
 * It runs in the astro:build:done hook, which always runs in Node, so satori
 * and resvg (a native module) never end up in a server or Workers bundle.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { AstroIntegration } from 'astro';
import type { OgManifestEntry } from '../src/pages/og/manifest.json';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const W = 1200;
const H = 630;

const C = {
  paper2: '#F6EBCF',
  ink: '#23302E',
  sage: '#597470',
  sageDeep: '#4A615E',
  clay: '#726258',
  stone: '#BFB8AF',
};

// Kept in sync with src/components/brand/Logo.astro.
const TAGLINE = '<full-stack engineer and support lead>';

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style, children },
});
const img = (src: string, style: Record<string, unknown>): Node => ({
  type: 'img',
  props: { src, style },
});
const dataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/** The logo without its old subtitle, from the original outlined artwork. */
async function logoSvg(root: URL) {
  const svg = await readFile(new URL('src/assets/brand/devnellogo-01.svg', root), 'utf8');
  const paths = [...svg.matchAll(/<path[^>]*?d="([^"]*)"/g)].map((m) => m[1]!);
  const word = paths.slice(0, 6).map((d) => `<path fill="${C.sage}" d="${d}"/>`);
  const mark = paths.slice(27).map((d) => `<path fill="${C.clay}" d="${d}"/>`);
  return dataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 994 182" width="994" height="182">${word.join('')}${mark.join('')}</svg>`,
  );
}

/** The // \\ slash pattern, faded out towards the left. */
function patternSvg() {
  return dataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <pattern id="p" width="48" height="40" patternUnits="userSpaceOnUse">
      <path d="M4 18 10 4M9 18 15 4M28 4l6 14M33 4l6 14M4 24l6 14M9 24l6 14M28 38l6-14M33 38l6-14" stroke="${C.stone}" stroke-width="1.8" stroke-linecap="round"/>
    </pattern>
    <linearGradient id="g" x1="0" x2="1"><stop offset="0.35" stop-color="#fff" stop-opacity="0"/><stop offset="0.85" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="m"><rect width="${W}" height="${H}" fill="url(#g)"/></mask>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#p)" mask="url(#m)" opacity="0.75"/>
</svg>`);
}

function frame(children: Node[], pattern: string): Node {
  return h(
    'div',
    {
      width: W,
      height: H,
      display: 'flex',
      position: 'relative',
      backgroundColor: C.paper2,
      fontFamily: 'Quando',
    },
    [
      img(pattern, { position: 'absolute', top: 0, left: 0, width: W, height: H }),
      h(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flexGrow: 1, // satori boxes are content-box, so no 100% + padding
          padding: '72px 80px',
        },
        children,
      ),
    ],
  );
}

const footer = (text: string) =>
  h('div', { display: 'flex', fontFamily: 'Plex Mono', fontSize: 26, color: C.clay }, text);

function defaultCard(logo: string, pattern: string) {
  return frame(
    [
      h('div', { display: 'flex', flexDirection: 'column', gap: 28, marginTop: 70 }, [
        img(logo, { width: 600, height: 110 }),
        h('div', { display: 'flex', fontSize: 44, color: C.sageDeep }, TAGLINE),
      ]),
      footer('Kyle Nel · Cape Town · devnel.com'),
    ],
    pattern,
  );
}

function caseStudyCard(logo: string, pattern: string, title: string, client: string) {
  return frame(
    [
      img(logo, { width: 280, height: 51 }),
      h('div', { display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 940 }, [
        h('div', { display: 'flex', fontFamily: 'Plex Mono', fontSize: 28, color: C.clay }, [
          '<case study>',
        ]),
        h(
          'div',
          {
            display: 'flex',
            fontSize: title.length > 40 ? 64 : 76,
            lineHeight: 1.12,
            color: C.ink,
          },
          title,
        ),
        h('div', { display: 'flex', fontSize: 30, color: C.sageDeep }, client),
      ]),
      footer(`Kyle Nel · ${TAGLINE}`),
    ],
    pattern,
  );
}

export default function ogImages(): AstroIntegration {
  let root: URL;
  return {
    name: 'devnel-og-images',
    hooks: {
      'astro:config:done': ({ config }) => {
        root = config.root;
      },
      'astro:build:done': async ({ dir, logger }) => {
        const fonts = [
          {
            name: 'Quando',
            data: await readFile(
              require.resolve('@fontsource/quando/files/quando-latin-400-normal.woff'),
            ),
            weight: 400 as const,
          },
          {
            name: 'Plex Mono',
            data: await readFile(
              require.resolve('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff'),
            ),
            weight: 400 as const,
          },
        ];
        const logo = await logoSvg(root);
        const pattern = patternSvg();

        const render = async (node: Node, out: string) => {
          const svg = await satori(node as never, { width: W, height: H, fonts });
          const raw = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
          const png = await sharp(raw)
            .png({ palette: true, quality: 90, compressionLevel: 9 })
            .toBuffer();
          const file = new URL(out, dir);
          await mkdir(new URL('.', file), { recursive: true });
          await writeFile(file, png);
        };

        await render(defaultCard(logo, pattern), 'og/default.png');

        // Case studies come from the content layer via a prerendered manifest
        // (src/pages/og/manifest.json.ts), not from scraping the built pages.
        const manifestFile = new URL('og/manifest.json', dir);
        const studies = JSON.parse(await readFile(manifestFile, 'utf8')) as OgManifestEntry[];
        for (const { path, title, client } of studies) {
          await render(caseStudyCard(logo, pattern, title, client), `og/${path}.png`);
        }
        await rm(manifestFile);
        logger.info(`Generated ${studies.length + 1} Open Graph images`);
      },
    },
  };
}
