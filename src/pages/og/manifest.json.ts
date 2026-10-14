import type { APIRoute } from 'astro';
import { getCaseStudies } from '@/lib/content';

/**
 * Build-time input for integrations/og-images.ts: one entry per case study,
 * straight from the content layer, so the OG images follow whatever source
 * the content comes from (MDX today, WordPress later). The integration
 * deletes this file once the images are drawn; it never ships.
 */
export interface OgManifestEntry {
  /** Output path under /og/, without the extension. */
  path: string;
  title: string;
  client: string;
}

export const GET: APIRoute = async () => {
  const studies = await getCaseStudies();
  const entries: OgManifestEntry[] = studies.map((s) => ({
    path: `work/${s.id}`,
    title: s.data.title,
    client: s.data.client,
  }));
  return Response.json(entries);
};
