import type { APIRoute } from 'astro';
import resume from '@/data/resume.json?raw';

/**
 * The raw JSON Resume file, byte for byte. Prerendered to /resume.json.
 * CORS is opened by the web server (Caddyfile, or public/_headers on
 * Cloudflare/Netlify), since a static file can't set its own headers.
 */
export const GET: APIRoute = () =>
  new Response(resume, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
