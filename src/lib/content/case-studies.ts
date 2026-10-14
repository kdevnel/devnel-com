import { getCollection, getEntry, render, type CollectionEntry } from 'astro:content';

export type CaseStudy = CollectionEntry<'caseStudies'>;

const byOrder = (a: CaseStudy, b: CaseStudy) => a.data.order - b.data.order;

export async function getCaseStudies({ featuredOnly = false } = {}): Promise<CaseStudy[]> {
  const all = await getCollection('caseStudies', (e) => !featuredOnly || e.data.featured);
  return all.sort(byOrder);
}

export async function getCaseStudy(slug: string): Promise<CaseStudy | undefined> {
  return getEntry('caseStudies', slug);
}

/** Previous and next case studies (by order), for in-page navigation. */
export async function getAdjacentCaseStudies(slug: string) {
  const all = await getCaseStudies();
  const i = all.findIndex((e) => e.id === slug);
  return { previous: all[i - 1], next: all[i + 1] };
}

export { render as renderCaseStudy };
