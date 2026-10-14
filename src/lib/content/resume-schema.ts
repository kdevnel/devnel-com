import { z } from 'astro/zod';

/**
 * Zod schema for the subset of JSON Resume v1 the site uses.
 * The official schema (validated in CI) remains the source of truth for the
 * full format; unknown fields are ignored here, not rejected.
 */
const trackOverride = z.object({
  label: z.string().optional(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
});

const tracks = z.object({ support: trackOverride.optional() }).optional();

const skills = z.array(z.object({ name: z.string(), keywords: z.array(z.string()) }));

/** JSON Resume dates: YYYY, YYYY-MM or YYYY-MM-DD. */
const date = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/);

export const resumeSchema = z.object({
  basics: z.object({
    name: z.string(),
    label: z.string(),
    email: z.email(),
    url: z.url(),
    summary: z.string(),
    location: z.object({
      city: z.string(),
      region: z.string().optional(),
      countryCode: z.string().length(2),
    }),
    profiles: z.array(
      z.object({ network: z.string(), username: z.string().optional(), url: z.url() }),
    ),
    phone: z.never({ error: 'resume.json must not contain a phone number' }).optional(),
    'x-workRights': z.string().optional(),
    'x-tracks': tracks,
  }),
  work: z.array(
    z.object({
      name: z.string(),
      position: z.string(),
      url: z.url().optional(),
      location: z.string().optional(),
      startDate: date,
      endDate: date.optional(),
      summary: z.string().optional(),
      highlights: z.array(z.string()).default([]),
      'x-tracks': tracks,
      'x-note': z.string().optional(),
    }),
  ),
  volunteer: z
    .array(
      z.object({
        organization: z.string(),
        position: z.string(),
        location: z.string().optional(),
        startDate: date,
        endDate: date.optional(),
        summary: z.string().optional(),
        highlights: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  education: z.array(
    z.object({
      institution: z.string(),
      area: z.string(),
      studyType: z.string(),
      startDate: date.optional(),
      endDate: date.optional(),
      score: z.string().optional(),
    }),
  ),
  skills,
  projects: z
    .array(
      z.object({
        name: z.string(),
        entity: z.string().optional(),
        roles: z.array(z.string()).default([]),
        url: z.url().optional(),
        description: z.string(),
        highlights: z.array(z.string()).default([]),
        keywords: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  // Whole-resume overrides per track (today: the support CV's own skills).
  'x-tracks': z.object({ support: z.object({ skills: skills.optional() }).optional() }).optional(),
  meta: z.object({
    canonical: z.url().optional(),
    version: z.string().optional(),
    lastModified: z.string().optional(),
  }),
});

export type RawResume = z.infer<typeof resumeSchema>;
