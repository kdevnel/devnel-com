import { getResume, type CaseStudy } from '@/lib/content';

const SITE = 'https://devnel.com';
const PERSON_ID = `${SITE}/#kyle`;
const WEBSITE_ID = `${SITE}/#website`;

/**
 * schema.org Person: one identity (@id) used everywhere, from the
 * engineering track. The email is left out on purpose: the address never
 * appears as plain text in the HTML.
 */
export function personJsonLd({ cv = false } = {}) {
  const { basics, work, education, skills } = getResume('engineering');
  // The CV pages keep "Senior" (as resume.json does); the rest of the site doesn't.
  const title = basics.label.split(' · ')[0]!;
  return {
    '@type': 'Person',
    '@id': PERSON_ID,
    name: basics.name,
    alternateName: 'Kyle Nel',
    // The label is "Senior Full-Stack Engineer · TypeScript / … · DevOps":
    // the title is the first part.
    jobTitle: cv ? title : title.replace(/^Senior\s+/i, ''),
    description: basics.summary.split('\n\n')[0],
    url: `${SITE}/`,
    image: `${SITE}/images/kyle-nel-800.webp`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: basics.location.city,
      addressRegion: basics.location.region,
      addressCountry: basics.location.countryCode,
    },
    sameAs: basics.profiles.map((p) => p.url),
    worksFor: work
      .filter((w) => !w.endDate)
      .map((w) => ({ '@type': 'Organization', name: w.name, url: w.url })),
    alumniOf: education.map((e) => ({ '@type': 'CollegeOrUniversity', name: e.institution })),
    knowsAbout: skills.flatMap((s) => s.keywords).slice(0, 30),
  };
}

const graph = (...nodes: Record<string, unknown>[]) => ({
  '@context': 'https://schema.org',
  '@graph': nodes,
});

/** Home page: the site and the person it's about. */
export function homeJsonLd() {
  return graph(
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: 'devNel',
      url: `${SITE}/`,
      inLanguage: 'en-GB',
      publisher: { '@id': PERSON_ID },
    },
    personJsonLd(),
  );
}

/** /about and the CV pages: a ProfilePage whose main entity is Kyle. */
export function profilePageJsonLd(url: URL, name: string, { cv = false } = {}) {
  const { meta } = getResume('engineering');
  return graph({
    '@type': 'ProfilePage',
    url: url.href,
    name,
    isPartOf: { '@id': WEBSITE_ID },
    dateModified: meta.lastModified,
    mainEntity: personJsonLd({ cv }),
  });
}

export function caseStudyJsonLd(study: CaseStudy, url: URL, image: URL) {
  const { title, summary, client, stack } = study.data;
  return graph({
    '@type': 'CreativeWork',
    name: title,
    headline: title,
    abstract: summary,
    url: url.href,
    image: image.href,
    keywords: stack.join(', '),
    inLanguage: 'en-GB',
    isPartOf: { '@id': WEBSITE_ID },
    creator: { '@id': PERSON_ID, name: 'Kyle Nel' },
    sourceOrganization: { '@type': 'Organization', name: client },
  });
}

/** JSON for a <script type="application/ld+json">: escapes "<" so content can't close the tag. */
export const serializeJsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
