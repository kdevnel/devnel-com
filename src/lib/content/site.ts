import { getEntry } from 'astro:content';

export type Site = NonNullable<Awaited<ReturnType<typeof getSite>>>;

export async function getSite() {
  const entry = await getEntry('site', 'profile');
  if (!entry) throw new Error('Missing site profile (src/content/site/profile.json)');
  return entry.data;
}

export function siteLink(site: Site, id: string) {
  const link = site.links.find((l) => l.id === id);
  if (!link) throw new Error(`Unknown site link "${id}"`);
  return link;
}
