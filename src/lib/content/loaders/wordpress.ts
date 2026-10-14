import { readFile } from 'node:fs/promises';
import type { Loader } from 'astro/loaders';

/** Shape of a post from /wp-json/wp/v2/posts?_fields=id,date,link,title,excerpt */
interface WpPost {
  id: number;
  date: string;
  link: string;
  title: { rendered: string };
  excerpt: { rendered: string };
}

interface Options {
  /** e.g. https://devnel.blog/wp-json/wp/v2/posts */
  endpoint: string;
  perPage?: number;
  /** Local JSON (same shape as the API response) used if the fetch fails. */
  fallback: string;
  timeoutMs?: number;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

/** WordPress returns rendered HTML; we only want plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s*\[…\]\s*$/, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build-time loader for WordPress posts. The first step towards a headless
 * WordPress backend: the same pattern works for pages, CPTs and ACF fields.
 * It never fails the build: on any error it logs a warning and uses the
 * local fallback file instead.
 */
export function wordpressPosts({
  endpoint,
  perPage = 3,
  fallback,
  timeoutMs = 8000,
}: Options): Loader {
  return {
    name: 'wordpress-posts',
    async load({ store, logger, parseData, generateDigest }) {
      const url = new URL(endpoint);
      url.searchParams.set('per_page', String(perPage));
      url.searchParams.set('_fields', 'id,date,link,title,excerpt');

      /** Maps and validates posts; throws if any is malformed or fails the schema. */
      const toEntries = async (posts: unknown) => {
        if (!Array.isArray(posts)) throw new Error('Unexpected response shape');
        const entries = [];
        for (const post of (posts as WpPost[]).slice(0, perPage)) {
          const id = String(post.id);
          const data = await parseData({
            id,
            data: {
              title: htmlToText(post.title.rendered),
              date: post.date,
              link: post.link,
              excerpt: htmlToText(post.excerpt.rendered),
            },
          });
          entries.push({ id, data, digest: generateDigest(data) });
        }
        return entries;
      };

      // Anything wrong with the live response (network, status, shape or a
      // schema failure, e.g. a link that isn't https://devnel.blog) falls back.
      let entries;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        entries = await toEntries(await res.json());
        logger.info(`Fetched ${entries.length} posts from ${url.host}`);
      } catch (error) {
        logger.warn(`Couldn't use live posts (${String(error)}); using ${fallback}`);
        entries = await toEntries(JSON.parse(await readFile(fallback, 'utf8')));
      }

      store.clear();
      for (const entry of entries) store.set(entry);
    },
  };
}
