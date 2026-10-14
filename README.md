# devnel.com

The portfolio and CV site for Kyle Nel, senior full-stack engineer and technical support lead in Cape Town.

Built with Astro 7 and TypeScript (strict). Pages are static. The only server code is the contact endpoint, which uses web-standard APIs, so it runs on Node or Cloudflare Workers unchanged.

|                     |                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Lighthouse (mobile) | 100 / 100 / 100 / 100 on home, all case studies, about, CV and contact                                                               |
| Client JS           | ~3.6 KB (1.7 KB gzipped) on the heaviest page; Turnstile loads only when someone starts using the form                               |
| Accessibility       | WCAG 2.2 AA; axe finds no violations in light or dark mode. Text over the slash pattern is checked separately (axe can't measure it) |
| Security            | Content-Security-Policy on every page, proxy-independent form protection, no plain-text email or phone numbers in what ships         |
| Dependencies        | No UI framework; plain CSS with design tokens                                                                                        |

## Contents

- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Content](#content)
- [Resume as data](#resume-as-data)
- [Contact form](#contact-form)
- [Deploying](#deploying)
- [Moving to WordPress](#moving-to-wordpress)
- [Brand and design](#brand-and-design)
- [Quality](#quality)
- [Assumptions](#assumptions)
- [TODO(kyle)](#todokyle)
- [License](#license)

## Local development

You need Node 22.12 or later (`.nvmrc` pins 22).

```sh
npm ci
cp .env.example .env     # Turnstile test keys and MAIL_PROVIDER=log work locally
npm run dev              # http://localhost:4321
```

| Script                    | What it does                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Dev server with hot reload                                                                                                                  |
| `npm run build`           | Cloudflare Workers build: static pages, the Worker, sitemap and OG images, written to `dist/`                                               |
| `npm run build:node`      | The same build for Node (`ASTRO_ADAPTER=node`), used by the e2e tests and Lighthouse                                                        |
| `npm start`               | Runs the Node build (`node dist/server/entry.mjs`)                                                                                          |
| `npm run check`           | `astro check` (TypeScript, strict)                                                                                                          |
| `npm run lint` / `format` | ESLint and Prettier                                                                                                                         |
| `npm run test:unit`       | Vitest: contact schema, signed timestamps, request guards, rate limiter, resume tracks                                                      |
| `npm run test:e2e`        | Playwright against the production build (run `npm run build:node` first), including axe on every page in light and dark mode                |
| `npm run resume:check`    | Phone-number guard plus official JSON Resume schema validation                                                                              |
| `npm run check:dist`      | After a build: fails on any `TODO(kyle)` or plain-text email in the HTML, or anything phone-like in the HTML or CV PDFs                     |
| `npm run contrast`        | Prints the colour contrast report and fails below AA                                                                                        |
| `npm run lighthouse`      | After a build: Lighthouse (mobile) on five key pages; fails below 100 for Accessibility, Best Practices or SEO, or below 90 for Performance |
| `npm run cv:pdf`          | Builds both CV PDFs from `resume.json` (see [CV PDFs](#cv-pdfs))                                                                            |

CI (`.github/workflows/ci.yml`) runs the resume checks, contrast, type check, lint, format check, build, the dist check (no `TODO(kyle)`, no plain-text email or phone numbers), unit tests and e2e tests (including axe) on pushes to `main` and on pull requests. After a merge to `main`, `.github/workflows/lighthouse.yml` runs the Lighthouse smoke test and writes the scores to the run summary. It has read-only permissions, and its actions are pinned to commit SHAs. Playwright starts its own server on port 4329 (`E2E_PORT`), so a running `astro dev` on 4321 is never tested by mistake.

## Environment variables

All secrets live in `.env`, which is gitignored. `.env.example` lists every variable. They are typed and validated through `astro:env` in `astro.config.mjs`.

| Variable                                                          | Needed for | Notes                                                                                                                                      |
| ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `TURNSTILE_SITE_KEY`                                              | Build      | Public; baked into the HTML at build time                                                                                                  |
| `TURNSTILE_SECRET_KEY`                                            | Runtime    | Server-side Turnstile verification                                                                                                         |
| `FORM_SIGNING_SECRET`                                             | Runtime    | HMAC key for the time-to-submit check (`openssl rand -base64 32`)                                                                          |
| `MAIL_PROVIDER`                                                   | Runtime    | `resend` (default), `smtp` (Node only) or `log`                                                                                            |
| `RESEND_API_KEY`                                                  | Runtime    | A sending-access key; `MAIL_FROM` must be on a domain verified in Resend                                                                   |
| `MAIL_FROM`, `MAIL_FROM_NAME`                                     | Runtime    | Defaults: `contact@devnel.com`, "devNel contact form"                                                                                      |
| `CONTACT_TO`                                                      | Runtime    | Default `kyle@devnel.com`                                                                                                                  |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Runtime    | Only when `MAIL_PROVIDER=smtp`                                                                                                             |
| `MAIL_LOG_FILE`                                                   | Runtime    | `log` provider writes JSON lines here (used by the e2e tests)                                                                              |
| `CLIENT_IP_HEADER`                                                | Runtime    | Header holding the visitor's IP: `none` (direct, or Cloudflare adapter), `x-forwarded-for` (Caddy, Nginx), `x-real-ip`, `cf-connecting-ip` |
| `ALLOWED_ORIGINS`                                                 | Runtime    | Extra origins allowed to post the form, comma-separated (e.g. staging). The site and `www` are always allowed                              |

In production, the endpoint fails closed: if `FORM_SIGNING_SECRET` or `TURNSTILE_SECRET_KEY` is missing, it refuses submissions and points visitors to LinkedIn. In `astro dev` both are optional.

## Project structure

```
src/
  assets/brand/        logo, icon and pattern sources, copied from the brand folder
  components/          Header, Footer, CaseCard, ArchDiagram, ContactForm, CvView, Timeline, …
    brand/             BrandSprite.astro (the artwork as SVG symbols, once per page),
                       Logo.astro (wordmark + live subtitle), Mark.astro ([>·<])
  content.config.ts    Zod schemas + loaders: caseStudies, services, site, posts
  content/             case-studies/*.mdx, services.json, site/profile.json, posts-fallback.json
  data/resume.json     the CV: single source of truth
  lib/content/         the ONLY way pages get content (getCaseStudies, getResume, …)
    loaders/wordpress.ts  build-time WordPress REST loader with local fallback
  lib/contact/         schema (Zod), limits, signed timestamps, Turnstile, rate limiter,
                       request guards (cross-site check, body limit, client IP)
  lib/mail/            provider abstraction: Resend (fetch), SMTP + log (Node only)
  lib/seo.ts           JSON-LD builders (WebSite, Person, ProfilePage, CreativeWork)
  lib/inline-scripts.ts  the two inline scripts, shared with astro.config.mjs for CSP hashes
  layouts/Base.astro   head, SEO meta, fonts, skip link, landmarks, scroll reveal
  pages/               index, about, contact, thanks, 404, cv/, work/[slug], resume.json, api/contact
  styles/              tokens.css (design tokens), fonts.css, global.css, diagram.css
integrations/og-images.ts   builds the OG images after the build, from the content layer
                            (via the build-only src/pages/og/manifest.json.ts)
scripts/               resume privacy + schema checks, dist check, contrast report,
                       CV PDF printer
deploy/                Caddyfile, nginx.conf, systemd unit
tests/                 unit/ (Vitest), e2e/ (Playwright)
```

## Content

Pages and components never call `getCollection` or read JSON directly. They use the functions exported from `src/lib/content/index.ts`:

| Function                                                                                 | Source today                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `getCaseStudies({ featuredOnly })`, `getCaseStudy(slug)`, `getAdjacentCaseStudies(slug)` | MDX in `src/content/case-studies/`                                        |
| `getServices()`                                                                          | `src/content/services.json` (the "What I do" blocks)                      |
| `getSite()`, `siteLink(site, id)`                                                        | `src/content/site/profile.json`                                           |
| `getRecentPosts(n)`                                                                      | devnel.blog REST API at build time, falling back to `posts-fallback.json` |
| `getResume(track)`                                                                       | `src/data/resume.json`                                                    |

**Case studies** are MDX files with validated frontmatter (`title`, `slug`, `summary`, `client`, `role`, `period`, `stack`, `links`, `cover?`, `order`, `featured`). Each one uses the same sections: The problem, Constraints, What I built (with an `<ArchDiagram>`), Stack, Results, and What I'd do differently. `<Todo>` renders a deliberately obvious placeholder.

**Posts.** `wordpressPosts()` fetches `https://devnel.blog/wp-json/wp/v2/posts?per_page=3&_fields=id,date,link,title,excerpt` at build time with an 8-second timeout. On any failure (network, HTTP status, an unexpected shape, or a post that fails the schema) it logs a warning and uses `src/content/posts-fallback.json` (a snapshot of real posts), so the build never breaks. Post links must be `https://devnel.blog` URLs, so a compromised feed can't inject `javascript:` or off-site links. Posts refresh on each build; schedule a rebuild if you want them fresher.

## Resume as data

`src/data/resume.json` is JSON Resume v1 and the single source of truth for:

- `/cv` (engineering) and `/cv/support`: HTML CVs with Person JSON-LD and A4 print styles.
- The About page timeline: dates, companies and roles, read from `work`.
- `/resume.json`: the raw file, byte for byte.
- registry.jsonresume.org/kdevnel, through the gist sync below.

**Tracks.** Top-level fields are the engineering track. `x-tracks.support` on `basics` and on each `work` entry overrides `label`, `summary` and `highlights`, and the top-level `x-tracks.support.skills` replaces the skills list; anything not overridden falls back. `getResume('engineering' | 'support')` applies this after validating the file with a Zod schema (`src/lib/content/resume-schema.ts`). The `x-` fields are valid under the official schema's `additionalProperties`.

**Privacy.** The file deliberately has no phone number or street address. `scripts/check-resume-privacy.mjs` fails CI if `basics.phone` is set, or if anything with 9+ digits looks like a phone number. The Zod schema also rejects `basics.phone`. The email address is in the JSON, as JSON Resume expects, but never appears as plain text in the HTML.

**Validation.** CI also validates the file against the official schema (`@jsonresume/schema`).

**CORS for `/resume.json`.** The file is prerendered, so the web server adds the header: `deploy/Caddyfile` or `deploy/nginx.conf` for Node, and `public/_headers` for Cloudflare or Netlify.

### Registry sync (gist)

`.github/workflows/resume-gist-sync.yml` runs on pushes to `main` that change `src/data/resume.json` (or on demand). It re-runs the resume checks, then PATCHes the gist's `resume.json` through the GitHub API. If the secrets are missing it skips with a warning.

**TODO(kyle): add the gist ID and token as repo secrets.**

1. **`RESUME_GIST_ID`**: open the gist that powers registry.jsonresume.org/kdevnel. The ID is the last part of its URL: `https://gist.github.com/kdevnel/<this-part>`.
2. **`GIST_TOKEN`**: GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token. Tick only the **`gist`** scope and set an expiry. Fine-grained tokens can't write gists.
3. Add both under the repo's Settings → Secrets and variables → Actions → New repository secret.

### Redirects on devnel.blog

The `/resume` and `/cv` redirects on devnel.blog currently point to the registry. Change them to `https://devnel.com/cv`.

### CV PDFs

`public/cv/Kyle-Nel_CV_Engineering.pdf` and `Kyle-Nel_CV_Support.pdf` are generated from `resume.json` by `scripts/cv-pdf.mjs` (headless Chromium, A4, two pages each). After editing `resume.json`, regenerate and commit them:

```sh
npm run cv:pdf             # writes ./cv-pdf/*.pdf for review
npm run cv:pdf -- --write  # overwrites public/cv/*.pdf
```

The layout is built for applicant tracking systems as well as people: one column of real, selectable text, standard section names (Profile, Skills, Professional Experience, Leadership & Community, Education), plain bullets, no tables or text in images, and the contact details in the body rather than a page header. The branding is colour (sage headings, clay dates, a sun rule) and the [>·<] mark; the type is Source Sans 3 throughout, with no Quando. The email is in plain text, since recruiters and ATS need it; there's no phone number, and `npm run check:dist` fails if one appears.

It loads the site's resume schema and track logic (`resume-tracks.ts`) directly, using Node's TypeScript type stripping. The support CV takes its skills from the top-level `x-tracks.support.skills`.

## Contact form

`src/components/ContactForm.astro` posts to `src/pages/api/contact.ts`, the only on-demand route (`prerender = false`).

**Request guards** (`src/lib/contact/request.ts`), which don't depend on any proxy:

- **Cross-site check**: the browser's own `Sec-Fetch-Site` header must be `same-origin`. Older browsers that don't send it fall back to comparing `Origin` with the site's origins: `https://devnel.com`, `www`, anything in `ALLOWED_ORIGINS`, and the URL the server saw (for direct access). Astro's built-in `checkOrigin` is turned off: it compares `Origin` with the Host header, which depends on what a proxy forwards, and it rejected every real submission behind Caddy.
- **Size limit**: bodies over 16 KB are refused, by `Content-Length` or by counting bytes as they stream in, so a chunked upload can't dodge it. The unread rest of a rejected body (up to 1 MB) is drained before responding; answering mid-upload broke the next request under Wrangler's local Workers runtime. The Node adapter, Caddy and Nginx add their own 64 KB limits.

**Spam defences, in order:**

1. **Honeypot**: a visually hidden `website` field (`tabindex="-1"`, `autocomplete="off"`, `aria-hidden`). If it's filled in, the bot gets a normal-looking success and nothing is sent.
2. **Minimum time-to-submit**: the browser fetches an HMAC-signed timestamp (`GET /api/contact/`). Anything under 3 seconds is silently dropped like the honeypot; tokens older than 2 hours are refused. The page refreshes the timestamp hourly, and if it has still expired (say, after the laptop slept) the form gets a new one and retries once.
3. **Validation**: a Zod schema with trimming, length limits (message up to 2,000 characters) and at most 2 links. The browser only gets a tiny Zod-free check (`limits.ts`); the server is authoritative.
4. **Rate limit**: 5 plausible messages per IP per hour (`MemoryRateLimiter`), counted after validation so typos don't use up the allowance, and before the expensive steps. The limiter tracks at most 5,000 addresses (least recently seen are evicted). The visitor's IP comes from the one header named in `CLIENT_IP_HEADER` (for `X-Forwarded-For`, the last entry, which your own proxy appended), so spoofed headers are ignored. In memory, it's exact on a single Node process and best-effort on Workers or serverless; `rate-limit.ts` explains how to move it to Redis, KV or a Cloudflare rate-limiting binding.
5. **Cloudflare Turnstile**: verified server-side with the secret key. The script loads on the visitor's first interaction with the form (focus, tap or key press), so it never costs anything for people who are only reading. On submit, the form waits for Turnstile's token.

**Progressive enhancement.** The form is a normal `method="post"` form. Without JavaScript, the server answers with redirects: to `/thanks/`, or to `/contact/#error-<code>`, which shows the message via CSS `:target`. Turnstile and the signed timestamp need JavaScript, so no-JS visitors see a note pointing them to LinkedIn. With JavaScript, the form submits with `fetch` and shows inline, field-level errors (`aria-invalid`, `aria-describedby`, an `aria-live` status). It moves focus to the first invalid field, or to the success message.

**Email address.** It never appears as plain text in the HTML. "Email me" links carry it reversed and base64-encoded, and a few lines of JS turn them into `mailto:` links. Without JS they link to the contact form.

### Mail delivery

`src/lib/mail/` picks a provider from `MAIL_PROVIDER`:

- **`resend`** (default): the Resend HTTP API with plain `fetch`, no SDK. Works on Node and Workers.
- **`smtp`**: Nodemailer, Node only. It's imported with a computed specifier, so bundlers never pull it into a Workers build.
- **`log`**: writes messages to the console or `MAIL_LOG_FILE`. Used for development and tests.

Messages come from `"devNel contact form" <contact@devnel.com>` with `Reply-To` set to the visitor.

### Verifying devnel.com in Resend

devnel.com is verified in Resend. `MAIL_FROM` must stay on a verified domain, or Resend refuses the message. The steps below are kept for reference.

> **Important:** `kyle@devnel.com` already receives mail. Resend's records don't touch that: its bounce MX and SPF live on the `send.devnel.com` subdomain and DKIM on its own selector, so devnel.com's existing MX and SPF records stay as they are. Mail still comes _from_ `contact@devnel.com`, and DMARC passes through DKIM.

1. Resend → Domains → **Add domain**: `devnel.com`. Pick the region closest to the server; the API endpoint is the same for all of them.
2. Add the DNS records Resend lists, wherever devnel.com's DNS is hosted:
   - **DKIM**: TXT on `resend._domainkey.devnel.com` with the key it gives you
   - **SPF**: MX on `send.devnel.com` → the `feedback-smtp.<region>.amazonses.com` host it shows, priority 10, and TXT on `send.devnel.com`: `v=spf1 include:amazonses.com ~all`
3. **DMARC** on the root domain, if there isn't one yet. Start in monitor mode, then tighten to `p=quarantine` once the reports look clean:
   `_dmarc.devnel.com` TXT `v=DMARC1; p=none; rua=mailto:kyle@devnel.com; adkim=r; aspf=r`
4. Click **Verify DNS Records** in Resend, then create an API key (Resend → API Keys, **Sending access**, restricted to devnel.com) and set `RESEND_API_KEY`.

## Deploying

Production runs on Cloudflare Workers. The contact endpoint behaves the same whatever sits in front of it. I tested each setup below against the production build. The Caddy and Nginx runs used the full set of checks: pages, 301s to the trailing-slash URL, the branded 404, security and cache headers, CORS on `/resume.json`, a form post with the real public `Origin` (accepted), a foreign `Origin` (403), a 200 KB body (413 or refused) and rate limiting with spoofed IP headers (the 6th submission gets 429).

| Setup              | How it was tested                                                             | Result                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node behind Caddy  | `deploy/Caddyfile` in the official `caddy:2` container (HTTP-only copy)       | All checks pass                                                                                                                                                                                                                                                                        |
| Node behind Nginx  | `deploy/nginx.conf` in the official `nginx:stable` container (HTTP-only copy) | All checks pass                                                                                                                                                                                                                                                                        |
| Cloudflare Workers | `npm run build`, then `wrangler dev` (workerd), pages prerendered in workerd  | Pages, the 404, `_headers` (security headers, CORS), trailing-slash redirects (307), the 403 and the size limit pass. Earlier, in a copy of the project, rate limiting and a submission through the real Turnstile siteverify and on to Mailgun passed too; not yet re-run with Resend |

In every setup, set `CLIENT_IP_HEADER` so rate limiting sees visitors rather than the proxy. If you forget, the server logs a warning on the first submission from a loopback address.

### Node behind Caddy

```sh
# on the server, e.g. /srv/devnel-com
git pull && npm ci && npm run build:node  # TURNSTILE_SITE_KEY must be set at build time
npm prune --omit=dev                      # keeps runtime deps (nodemailer) only
sudo cp deploy/devnel-com.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now devnel-com
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

- Caddy serves `dist/client` itself and proxies only `/api/*` to the app on `127.0.0.1:4321`. It handles TLS, the `www` redirect, zstd/gzip compression, trailing-slash redirects, the 404 page, security headers (including `frame-ancestors`, which can't go in the page's CSP meta tag), immutable caching for `/_astro/*`, CORS for `/resume.json`, and a 64 KB body limit on `/api/*`.
- The systemd unit sets `CLIENT_IP_HEADER=x-forwarded-for` and reads secrets from `/srv/devnel-com/.env`. It's hardened (read-only filesystem, no capabilities, `MemoryMax=256M`); to use `MAIL_LOG_FILE`, add a `ReadWritePaths=` line for its directory.

### Node behind Nginx

Same steps, with `deploy/nginx.conf` in place of the Caddyfile:

- Create `/etc/nginx/snippets/devnel-security-headers.conf` with the `add_header` lines listed in the config's comments. Nginx drops inherited `add_header`s in any block that sets its own, so each location includes the snippet.
- The certificate paths assume certbot; adjust to suit.
- Nginx appends the visitor to `X-Forwarded-For` and sets `X-Real-IP`, so `CLIENT_IP_HEADER` can be `x-forwarded-for` (as in the systemd unit) or `x-real-ip`.

### Cloudflare Workers (default)

`npm run build` uses the Cloudflare adapter. It reads `wrangler.jsonc`, prerenders the pages in workerd, and writes the deployable config to `dist/server/wrangler.json`, which `wrangler deploy` picks up. The contact endpoint uses only `fetch`, Web Crypto, streams and `FormData`, so it runs unchanged.

**First deploy:**

```sh
npx wrangler login
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put FORM_SIGNING_SECRET       # openssl rand -base64 32
npx wrangler secret put RESEND_API_KEY
TURNSTILE_SITE_KEY=<site key> npm run deploy      # build + wrangler deploy
```

`wrangler secret put` creates the Worker if it doesn't exist yet. After that, `npm run deploy` is the whole release.

**The Turnstile site key** is baked into the HTML at build time. It's public, so the simplest place for it is `TURNSTILE_SITE_KEY` in `wrangler.jsonc` `vars`; then `npm run deploy` needs nothing else. Don't rely on `.env` for it: the Cloudflare adapter copies `.env` into the build environment over anything set in the shell, so a local test key would win. `npm run deploy` therefore builds with `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`, and `scripts/check-deploy.mjs` stops the deploy if the contact page has no key or one of Cloudflare's test keys.

**Domain.** In the dashboard: Workers & Pages → devnel-com → Settings → Domains & Routes → Add → Custom domain: `devnel.com` (the zone must be on Cloudflare). Then add a Redirect Rule (Rules → Redirect Rules → "Redirect from WWW to root", 301) and a proxied DNS record for `www` (e.g. `AAAA www 100::`) so the rule has something to catch.

**What `wrangler.jsonc` sets:**

- `vars`: `MAIL_PROVIDER=resend` and `CLIENT_IP_HEADER=none` (the adapter sets the client address from `CF-Connecting-IP`). Override `MAIL_FROM`, `CONTACT_TO` and the others there if the defaults don't suit.
- `assets.html_handling: force-trailing-slash`: `/about` redirects to `/about/`. Workers static assets answer with 307, not 301; canonicals and the sitemap already use the slash form.
- `assets.not_found_handling: 404-page`: unknown paths get the branded 404 with a 404 status.

**Notes:**

- `public/_headers` applies the security, CORS and cache headers. Workers compresses responses itself.
- `smtp` and `log` are Node-only and never bundled. OG images are generated after the build in Node, so the native `resvg` module is never deployed.
- Rate limiting is per isolate on Workers, so the in-memory limit is best-effort. Turnstile is the real gate. For a hard limit, add a WAF rate-limiting rule for `POST /api/contact/`, or implement `RateLimiter` with a Workers Rate Limiting binding.
- The build copies `.env` into `dist/server/.dev.vars` for the prerender worker. It isn't uploaded: `.assetsignore` excludes it, and `wrangler deploy` never sends `.dev.vars`.

### Netlify or Vercel

Swap the adapter in `astro.config.mjs` (`@astrojs/netlify` or `@astrojs/vercel`), set the env vars in the dashboard, and use `MAIL_PROVIDER=resend`. Netlify honours `public/_headers`. On Vercel, add the `/resume.json` CORS and security headers in `vercel.json`. Start with `CLIENT_IP_HEADER=none`: both adapters set the client address themselves. Check that before relying on the rate limit, since I haven't tested either platform. The rate-limit caveat for serverless applies to both.

## Moving to WordPress

The data layer is built so the WordPress switch only touches `src/content.config.ts` (and maybe `src/lib/content/*`), never pages or components.

**Already done:** `posts` comes from WordPress through `wordpressPosts()` in `src/lib/content/loaders/wordpress.ts`. It fetches from the REST API at build time, strips the HTML, validates against the collection schema, and falls back locally on failure. Copy that loader for each new content type.

**What to replace:**

| Collection    | Today                  | WordPress                                                                                                                   |
| ------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `posts`       | WP REST (done)         | Same; or WPGraphQL `posts(first: 3)`                                                                                        |
| `caseStudies` | `glob()` over MDX      | A `case_study` custom post type with ACF fields. New loader fetching `/wp-json/wp/v2/case_study?_embed&acf_format=standard` |
| `services`    | `file()` JSON          | An ACF repeater on an options page, or a small `service` CPT                                                                |
| `site`        | `file()` JSON          | An ACF options page (`/wp-json/acf/v3/options/options`, or WPGraphQL with ACF)                                              |
| `resume`      | `src/data/resume.json` | **Keep it in git.** It also drives the gist and the registry                                                                |

**Field mapping for case studies (ACF):**

| Schema field               | WordPress / ACF                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                    | `title.rendered` (strip HTML)                                                                                                                                                 |
| `slug`                     | `slug`                                                                                                                                                                        |
| `summary`                  | ACF text `summary` (or `excerpt.rendered`)                                                                                                                                    |
| `client`, `role`, `period` | ACF text fields                                                                                                                                                               |
| `stack: string[]`          | A `stack` taxonomy (`_embedded['wp:term']`) or an ACF repeater of text                                                                                                        |
| `links: {label,url}[]`     | ACF repeater with `label` (text) and `url` (url)                                                                                                                              |
| `cover`                    | `featured_media` → `_embedded['wp:featuredmedia'][0]`. Today it's a base name for pre-sized files in `public/images/work/`; with WordPress, use the media sizes' URLs instead |
| `order`                    | `menu_order`                                                                                                                                                                  |
| `featured`                 | ACF true/false (or WordPress "sticky")                                                                                                                                        |
| body                       | `content.rendered`: HTML, not MDX. Store it with `store.set({ …, rendered: { html } })` and render it with `render()` as now                                                  |

**Diagrams.** `<ArchDiagram>` takes plain `nodes` and `edges` arrays. In WordPress, store them as an ACF JSON or repeater field and render the component from the case-study template instead of inline in the body.

**Rebuilds.** Content is fetched at build time. Trigger a rebuild on publish, e.g. a WP webhook calling GitHub's `repository_dispatch` and running the deploy workflow. If you need content to change without a rebuild, Astro's live collections (`defineLiveCollection`) can fetch at request time on the server, at the cost of making those pages on-demand.

## Brand and design

The 2018 devNel identity, with updated positioning:

- **Logo**: the original outlined paths from `devnellogo-01.svg`, with the old `<wordpress specialist>` subtitle removed, are defined once per page as SVG symbols (`BrandSprite.astro`). `Logo.astro` and `Mark.astro` draw them with `<use>`, which saves about 13 KB per page. Colours come from tokens (`--logo-word`, `--logo-mark`). The new subtitle `<full-stack engineer>` is live Quando text.
- **[>·<] mark**: a bowtie made of code brackets, drawn from `devnel-icon-white.svg`. Used for the mobile header, the favicon (`public/favicon.svg`: circular, sun on sage), section dividers, the 404 and `/thanks`. Alt text: "devNel mark: a bowtie made of code brackets".
- **Type**: Quando (display, single weight; hierarchy comes from size and colour), Source Sans 3 (body), IBM Plex Mono (labels). All are self-hosted Latin subsets from Fontsource, Quando and Source Sans are preloaded, and there are no runtime font requests to third parties.
  - **Why Source Sans 3**: I compared it with Instrument Sans and Open Sans. Instrument Sans is a narrow neo-grotesque that looks thin beside Quando's wide letterforms. Open Sans, from the old guideline, is generic and heavier to load. Source Sans 3 is a true humanist sans whose open shapes match Quando, it reads well at length, and as one variable file it's light.
- **Motifs**: the `// \\` slash pattern is a CSS mask, recoloured with tokens. It appears behind the hero and case-study headers (stone on `--paper-2`) and in the footer (sage on pine), never behind body text. Section eyebrows are mono `<angle brackets>` in clay. The code joke appears once, on the 404.
- **Motion**: native cross-document view transitions (a CSS-only crossfade, with a shared-element transition on case-study titles), a one-time 8px fade-and-rise as sections scroll into view, an animated highlighter underline, and a one-time "straighten" wiggle of the bowtie on logo hover. All of it is off under `prefers-reduced-motion`.

## Quality

**Lighthouse** (mobile, local production build, Lighthouse 12). Home, IGrow, About, CV and Contact were re-measured after the CSP, font and Turnstile changes; the other two case studies were last measured just before them:

| Page                             | Performance | Accessibility | Best Practices | SEO |
| -------------------------------- | ----------- | ------------- | -------------- | --- |
| `/`                              | 100         | 100           | 100            | 100 |
| `/work/igrow/`                   | 100         | 100           | 100            | 100 |
| `/work/woocommerce-marketplace/` | 100         | 100           | 100            | 100 |
| `/work/quiver-cafe/`             | 100         | 100           | 100            | 100 |
| `/about/`                        | 100         | 100           | 100            | 100 |
| `/cv/`                           | 100         | 100           | 100            | 100 |
| `/contact/`                      | 100         | 100           | 100            | 100 |

`/thanks` scores 66 for SEO by design: it's `noindex`. The only remaining flag is text compression: the Node server doesn't compress, and Caddy or Nginx does in production. On `/contact/`, Turnstile now loads on first interaction, so it no longer affects the score.

**Contrast** (`npm run contrast`, which also runs in CI). WCAG AA needs 4.5:1 for normal text and 3:1 for large text and UI.

| Pair                                  | Ratio  | Use                                            |
| ------------------------------------- | ------ | ---------------------------------------------- |
| ink on paper                          | 12.8:1 | Body text                                      |
| ink on paper-2                        | 11.5:1 | Body text on cards                             |
| sage on paper                         | 4.7:1  | Headings, links                                |
| sage on paper-2                       | 4.3:1  | **Large headings on cards only**               |
| sage-deep on paper-2                  | 5.6:1  | Links and small headings on cards              |
| sage-deep on paper                    | 6.2:1  | Link hover, focus ring                         |
| clay on paper                         | 5.5:1  | Meta, eyebrows                                 |
| clay on paper-2                       | 4.9:1  | Meta on cards                                  |
| ink on sun                            | 10.0:1 | Primary button                                 |
| ink on #F7CC6F                        | 9.0:1  | Primary button (hover)                         |
| sage-deep on sun                      | 4.8:1  | Text on yellow                                 |
| sage on sun                           | 3.7:1  | Large text / graphics only                     |
| sun on pine                           | 8.2:1  | Footer and contact band accents                |
| paper on pine                         | 10.5:1 | Footer and contact band text                   |
| #9E3A2B on paper                      | 6.3:1  | Form errors                                    |
| Dark: paper on pine                   | 10.5:1 | Body text                                      |
| Dark: sun on pine                     | 8.2:1  | Headings, links                                |
| Dark: sun on #283533                  | 9.3:1  | Links on cards                                 |
| Dark: #D9CFC0 on pine                 | 7.3:1  | Meta                                           |
| Dark: #F2A594 on pine                 | 5.6:1  | Form errors                                    |
| Dark: sun on sage                     | 3.7:1  | Hero highlight (large text only)               |
| stone-2 on paper                      | 2.9:1  | Pattern only, never text                       |
| #67584F on a pattern stroke (light)   | 5.0:1  | Small text over the slash pattern (worst case) |
| sage-deep on a pattern stroke (light) | 4.9:1  | Links and buttons over the pattern             |
| #D9CFC0 on a pattern stroke (footer)  | 5.5:1  | Footer meta over the pattern                   |
| Dark: #D9CFC0 on a pattern stroke     | 6.3:1  | Meta over the pattern                          |

Two findings shaped the tokens:

- `--sage` on `--paper-2` is only 4.3:1, so links and small headings on cards and alternate sections use `--sage-deep` (the `--link-alt` and `--heading-alt` tokens). The hero now does too: its outline "Download CV" button was 4.26:1 before.
- Text sitting directly on a slash-pattern stroke loses contrast: `--clay` drops to 4.3:1 there. In light mode, small text in the pattern bands (hero, case-study header) uses `--muted-on-pattern` (#67584F), and the pattern is at 0.3 opacity. The "stroke" rows above are the worst case, calculated from the stroke colour at its opacity.

axe runs in the e2e suite on every page, in light and dark mode, at desktop and mobile widths, and fails CI on any WCAG 2.2 A/AA violation (`tests/e2e/a11y.spec.ts`). It can't measure text over the `::before` pattern (it reports those as "needs review"), which is why the pattern cases are calculated in the contrast script instead.

**Tests**: 24 unit tests (Vitest) and 73 e2e tests (Playwright, desktop and mobile), 40 of them axe checks. The e2e tests also cover: home loads with landmarks and a skip link, the branded 404, nav works, each case study renders with its sections and diagram, the CV track switch and PDFs, `/resume.json`, form validation, honeypot rejection, a no-JS submission without a token, a full send, and the cross-site and size guards with proxy-style headers. The unit tests cover the request guards (including a chunked upload with no length), the rate limiter's key cap, the schema, signed timestamps and resume tracks.

## Assumptions

- **resume.json** wasn't in the repo root. I used `~/Documents/Employment/Job Hunting/Profiles/resume.json` (edited 13 Oct 2026), copied unchanged.
- **Commits** are signed through your 1Password SSH agent, as configured. Nothing has been pushed and no remote exists yet.
- **View transitions** are native and CSS-only rather than `<ClientRouter />`, to keep within the JS budget. Firefox and older browsers simply navigate without the crossfade.
- **Contact endpoint** is an API route rather than an Astro Action. Actions' no-JS fallback needs on-demand pages, and an API route ports to any adapter.
- **No-JS submissions** can't pass Turnstile or the signed timestamp. Those visitors get a note pointing to LinkedIn.
- **Submissions under 3 seconds** are dropped silently (like the honeypot) rather than shown an error, so bots learn nothing.
- **Rate limiting** is in memory: accurate on the single Node process, best-effort elsewhere (documented). It trusts only the header named in `CLIENT_IP_HEADER`.
- **Astro's `checkOrigin` is off**, replaced by the endpoint's own cross-site check, which doesn't depend on what a proxy forwards (see [Contact form](#contact-form)).
- **CSP** is a `<meta>` tag generated by Astro, so it works on any host. `frame-ancestors` can't go in a meta tag, so it's sent as a header by the proxy configs and `_headers`.
- **URLs** always end in a slash (`trailingSlash: 'always'`), matching canonicals and the sitemap; the old forms 301 to them.
- **Personality lines** are kept to three: footer "Tailored in Cape Town.", the About bowtie line, and the 404 "come undone". `/thanks` is plain.
- **Hero "Download CV"** and the footer link go straight to the engineering PDF. `/cv` offers both PDFs and the web versions.
- **Hero highlight**: the sun "highlighter" marks "useful tools" in the hero statement.
- **Dark theme** is included (pine background, cream text, sun accents, no toggle). Every pair is in the contrast report, and axe finds no violations.
- **Writing section** shows a 4-line excerpt per post. Posts refresh on each build.
- **Case-study links**: IGrow links to rentals.igrow.co.za (named in the brief). The Quiver period is a visible TODO.
- **WooCommerce diagram** shows only what the brief states (React front end, product cards, interaction tracking, WordPress/PHP behind it) and is flagged for checking.
- **Resend**: devnel.com is verified. That's safe for its existing inbound mail, since Resend's MX and SPF records go on `send.devnel.com`.
- **`/resume.json`** is prerendered; CORS comes from Caddy, Nginx or `_headers`, so plain `npm start` locally doesn't send it.
- **Email in resume.json**: the JSON keeps `basics.email`, as the standard expects, and the gist sync publishes it to the registry. It's left out of the HTML and the JSON-LD. You've confirmed it's a public address and should stay.
- **Time zone and locale**: dates display in `en-GB` for Africa/Johannesburg.

## TODO(kyle)

Search the code for `TODO(kyle)` to find every one.

**Accounts and setup**

- [x] Verify devnel.com in Resend (DKIM, SPF on `send.devnel.com`, DMARC) and set `RESEND_API_KEY`. See [Resend](#verifying-devnelcom-in-resend) and `.env.example`.
- [ ] Add the `RESUME_GIST_ID` and `GIST_TOKEN` repo secrets: `.github/workflows/resume-gist-sync.yml`.
- [x] Create production Turnstile keys and set `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and `FORM_SIGNING_SECRET`.
- [ ] Change devnel.blog's `/resume` and `/cv` redirects to `https://devnel.com/cv`.

**Wording and brand**

- [ ] Confirm the tagline `<full-stack engineer>`, or use `<web engineer & support lead>`: `src/components/brand/Logo.astro`, `integrations/og-images.ts`.
- [x] Confirm the footer line "Tailored in Cape Town.": `src/components/Footer.astro`.
- [ ] Confirm the About line "You'll usually find me in a bowtie.": `src/pages/about.astro`.
- [x] Confirm the 404 wording "This page has come undone. Let's get you back home.": `src/pages/404.astro`.
- [ ] Confirm the `/thanks` wording: `src/pages/thanks.astro`.

**IGrow case study** (`src/content/case-studies/igrow.mdx`)

- [ ] Any other constraints (budget, timeline, team size, existing hosting).
- [ ] Which parts of the booking tool are TypeScript vs PHP, and whether it runs inside WordPress.
- [ ] Numbers on the booking-rate improvement from self-service.
- [ ] What you'd do differently.

**WooCommerce.com Marketplace** (`src/content/case-studies/woocommerce-marketplace.mdx`)

- [ ] What was wrong with the old Marketplace and why it was rebuilt.
- [ ] Team size, timeline, and what the rebuild had to keep working.
- [ ] Your specific share of the rebuild.
- [ ] Check the diagram matches the real architecture (and where Algolia fits).
- [ ] Any public numbers.
- [ ] What you'd do differently.

**Quiver Café** (`src/content/case-studies/quiver-cafe.mdx`)

- [ ] Confirm the owner is happy for it to be featured, and whether quiverfoundation.org is part of it.
- [ ] Project dates (the `period` field).
- [ ] Before/after numbers for the results (Lighthouse or PageSpeed, search rankings, monthly running cost).
- [ ] What you'd do differently.

## License

The code is under the [MIT License](LICENSE): reuse, change and ship it however you like, as long as the copyright notice stays.

The MIT License doesn't cover the site's content: the case-study and page copy, the CV and `resume.json`, photos, the devNel logo and mark, or the client screenshots in `public/images/work/` (those belong to their owners). Please don't reuse those.
