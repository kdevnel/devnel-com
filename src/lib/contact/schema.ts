import { z } from 'astro/zod';

import { countLinks, MAX_LINKS, MESSAGE_MAX, MESSAGE_MIN } from './limits';

export { countLinks, MAX_LINKS, MESSAGE_MAX, MESSAGE_MIN };

export const TOPICS = {
  job: 'Job opportunity',
  freelance: 'Freelance project',
  other: 'Something else',
} as const;

/** The visitor-supplied fields. Validated on the server for every submission. */
export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Please tell me your name.')
    .max(100, 'Please keep your name under 100 characters.'),
  email: z
    .string()
    .trim()
    .max(254, 'That email address is too long.')
    .pipe(z.email('Please enter a valid email address.')),
  topic: z
    .enum(Object.keys(TOPICS) as [keyof typeof TOPICS, ...(keyof typeof TOPICS)[]])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  message: z
    .string()
    .trim()
    .min(MESSAGE_MIN, `Please write at least ${MESSAGE_MIN} characters.`)
    .max(
      MESSAGE_MAX,
      `Please keep your message under ${MESSAGE_MAX.toLocaleString('en-GB')} characters.`,
    )
    .refine((m) => countLinks(m) <= MAX_LINKS, `Please include no more than ${MAX_LINKS} links.`),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type FieldErrors = Partial<Record<keyof ContactInput, string>>;

/** First error per field, ready to show next to each input. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof ContactInput;
    out[key] ??= issue.message;
  }
  return out;
}
