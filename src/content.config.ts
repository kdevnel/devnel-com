import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { wordpressPosts } from '@/lib/content/loaders/wordpress';

const link = z.object({ label: z.string(), url: z.url() });

/**
 * Case studies: MDX files today. With WordPress this becomes a custom post
 * type (or ACF field group): see "Moving to WordPress" in the README.
 */
const caseStudies = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/case-studies' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    summary: z.string().max(200),
    client: z.string(),
    role: z.string(),
    period: z.string(),
    stack: z.array(z.string()).min(1),
    links: z.array(link).default([]),
    // Screenshots: the base name of a set in public/images/work/, as .avif
    // and .webp. Cards use <name>-480/-960 (16:10); the case-study page
    // shows <name>-hero-800/-1200/-2000 (15:8) with coverAlt as its alt.
    // Pre-sized files because the image service is passthrough.
    cover: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    coverAlt: z.string().optional(),
    // 1–12: also names the title's shared-element view transition (.vt-N
    // in global.css), so the card and the page heading morph into each other.
    order: z.number().int().min(1).max(12),
    featured: z.boolean().default(false),
  }),
});

/** The "What I do" blocks on the home page. */
const services = defineCollection({
  loader: file('src/content/services.json'),
  schema: z.object({
    title: z.string(),
    body: z.string(),
    order: z.number().int(),
  }),
});

/** Profile and links shown across the site (header, footer, contact). */
const site = defineCollection({
  loader: file('src/content/site/profile.json', {
    parser: (text) => [{ id: 'profile', ...JSON.parse(text) }],
  }),
  schema: z.object({
    name: z.string(),
    brand: z.string(),
    role: z.string(),
    tagline: z.string(),
    email: z.email(),
    location: z.string(),
    timezone: z.string(),
    citizenship: z.string(),
    availability: z.string(),
    links: z.array(z.object({ id: z.string(), label: z.string(), url: z.url() })),
    cv: z.object({ engineering: z.string(), support: z.string() }),
  }),
});

/** Latest posts from devnel.blog (WordPress REST API), fetched at build time. */
const posts = defineCollection({
  loader: wordpressPosts({
    endpoint: 'https://devnel.blog/wp-json/wp/v2/posts',
    perPage: 3,
    fallback: 'src/content/posts-fallback.json',
  }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    // Only links to the blog itself: a compromised feed can't inject
    // javascript: or off-site URLs into the home page.
    link: z.url({ protocol: /^https$/, hostname: /^devnel\.blog$/ }),
    excerpt: z.string(),
  }),
});

export const collections = { caseStudies, services, site, posts };
