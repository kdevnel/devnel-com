# devnel.com

The portfolio and CV site for Kyle Nel, senior full-stack engineer and technical support lead in Cape Town. Live at **[devnel.com](https://devnel.com)**.

Built with Astro 7 and TypeScript (strict). Pages are static. The only server code is the contact endpoint, which uses web-standard APIs, so it runs on Cloudflare Workers (production) or Node unchanged.

|                     |                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Lighthouse (mobile) | 100 / 100 / 100 / 100 on home, all case studies, about, CV and contact                                                               |
| Client JS           | ~3.6 KB (1.7 KB gzipped) on the heaviest page; Turnstile loads only when someone starts using the form                               |
| Accessibility       | WCAG 2.2 AA; axe finds no violations in light or dark mode. Text over the slash pattern is checked separately (axe can't measure it) |
| Security            | Content-Security-Policy on every page, proxy-independent form protection, no plain-text email or phone numbers in what ships         |
| Dependencies        | No UI framework; plain CSS with design tokens                                                                                        |

## Contents

- [Local development](#local-development)
- [Project structure](#project-structure)
- [Content](#content)
- [Resume as data](#resume-as-data)
- [Contact form](#contact-form)
- [Brand and design](#brand-and-design)
- [Quality](#quality)
- [Deploying](#deploying)
- [Design decisions](#design-decisions)
- [Moving to WordPress](#moving-to-wordpress)
- [License](#license)

## Local development

You need Node 22.12 or later (`.nvmrc` pins 22).

```sh
npm ci
cp .env.example .env     # works as-is: Turnstile test keys, mail goes to the console
npm run dev              # http://localhost:4321
```

| Script                    | What it does                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Dev server with hot reload                                                                                                                  |
| `npm run build`           | Cloudflare Workers build: static pages, the Worker, sitemap and OG images, written to `dist/`                                               |
| `npm run build:node`      | The same build for Node (`ASTRO_ADAPTER=node`), used by the e2e tests and Lighthouse                                                        |
| `npm start`               | Runs the Node build (`node dist/server/entry.mjs`)                                                                                          |
| `npm run deploy`          | Builds for Workers, checks the Turnstile key, then `wrangler deploy` (see [Deploying](#deploying))                                          |
| `npm run check`           | `astro check` (TypeScript, strict)                                                                                                          |
| `npm run lint` / `format` | ESLint and Prettier                                                                                                                         |
| `npm run test:unit`       | Vitest: contact schema, signed timestamps, request guards, rate limiter, resume tracks, WordPress loader                                    |
| `npm run test:e2e`        | Playwright against the production build (run `npm run build:node` first), including axe on every page in light and dark mode                |
| `npm run resume:check`    | Phone-number guard plus official JSON Resume schema validation                                                                              |
| `npm run check:dist`      | After a build: fails on a leftover draft placeholder or plain-text email in the HTML, or anything phone-like in the HTML or CV PDFs         |
| `npm run contrast`        | Prints the colour contrast report for every text pairing and fails below AA                                                                 |
| `npm run lighthouse`      | After a build: Lighthouse (mobile) on five key pages; fails below 100 for Accessibility, Best Practices or SEO, or below 90 for Performance |
| `npm run cv:pdf`          | Builds both CV PDFs from `resume.json` (see [CV PDFs](#cv-pdfs))                                                                            |

**CI.** `.github/workflows/ci.yml` runs all of the checks above (except Lighthouse) on pushes to `main` and on pull requests. After a merge to `main`, `lighthouse.yml` runs the Lighthouse smoke test and writes the scores to the run summary. Workflows have read-only permissions, and their actions are pinned to commit SHAs. Playwright starts its own server on port 4329 (`E2E_PORT`), so a running `astro dev` on 4321 is never tested by mistake.

### Environment variables

`.env.example` lists every variable; they're typed and validated through `astro:env` in `astro.config.mjs`. Locally they come from `.env` (gitignored). In production they come from `wrangler.jsonc` `vars` and `wrangler secret`.

| Variable                                                          | Needed for | Notes                                                                                                                                      |
| ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `TURNSTILE_SITE_KEY`                                              | Build      | Public; baked into the HTML at build time                                                                                                  |
| `TURNSTILE_SECRET_KEY`                                            | Runtime    | Server-side Turnstile verification                                                                                                         |
| `FORM_SIGNING_SECRET`                                             | Runtime    | HMAC key for the time-to-submit check (`openssl rand -base64 32`)                                                                          |
| `MAIL_PROVIDER`                                                   | Runtime    | `resend` (production), `smtp` (Node only) or `log`                                                                                         |
| `RESEND_API_KEY`                                                  | Runtime    | A sending-access key; `MAIL_FROM` must be on a domain verified in Resend                                                                   |
| `MAIL_FROM`, `MAIL_FROM_NAME`                                     | Runtime    | Defaults: `contact@devnel.com`, "devNel contact form"                                                                                      |
| `CONTACT_TO`                                                      | Runtime    | Default `kyle@devnel.com`                                                                                                                  |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Runtime    | Only when `MAIL_PROVIDER=smtp`                                                                                                             |
| `MAIL_LOG_FILE`                                                   | Runtime    | `log` provider writes JSON lines here (used by the e2e tests)                                                                              |
| `CLIENT_IP_HEADER`                                                | Runtime    | Header holding the visitor's IP: `none` (direct, or Cloudflare adapter), `x-forwarded-for` (Caddy, Nginx), `x-real-ip`, `cf-connecting-ip` |
| `ALLOWED_ORIGINS`                                                 | Runtime    | Extra origins allowed to post the form, comma-separated (e.g. staging). The site and `www` are always allowed                              |

In production the endpoint fails closed: if `FORM_SIGNING_SECRET` or `TURNSTILE_SECRET_KEY` is missing, it refuses submissions and points visitors to LinkedIn. In `astro dev` both are optional.

## Project structure

```
src/
  assets/brand/        logo, icon and pattern sources
  components/          Header, Footer, CaseCard, ArchDiagram, ContactForm, CvView, Timeline, …
    brand/             BrandSprite.astro (the artwork as SVG symbols, once per page),
                       Logo.astro (wordmark + live subtitle), Mark.astro ([>·<])
  content.config.ts    Zod schemas + loaders: caseStudies, services, site, posts
  content/             case-studies/*.mdx, services.json, site/profile.json, posts-fallback.json
  data/resume.json     the CV: single source of truth
  lib/content/         the only way pages get content (getCaseStudies, getResume, …)
    loaders/wordpress.ts  build-time WordPress REST loader with local fallback
  lib/contact/         schema (Zod), limits, signed timestamps, Turnstile, rate limiter,
                       request guards (cross-site check, body limit, client IP)
  lib/mail/            provider abstraction: Resend (fetch), SMTP + log (Node only)
  lib/seo.ts           JSON-LD builders (WebSite, Person, ProfilePage, CreativeWork)
  lib/inline-scripts.ts  the two inline scripts, shared with astro.config.mjs for CSP hashes
  layouts/Base.astro   head, SEO meta, fonts, skip link, landmarks, scroll reveal
  pages/               index, about, contact, thanks, 404, cv/, work/[slug], resume.json, api/contact
  styles/              tokens.css (design tokens), fonts.css, global.css, diagram.css
public/images/work/    pre-sized case-study screenshots (AVIF + WebP)
integrations/og-images.ts   builds the OG images after the build, from the content layer
                            (via the build-only src/pages/og/manifest.json.ts)
scripts/               resume privacy + schema checks, dist check, deploy check,
                       contrast report, Lighthouse runner, CV PDF printer
deploy/                Caddyfile, nginx.conf, systemd unit (for self-hosting on Node)
tests/                 unit/ (Vitest), e2e/ (Playwright)
```

## Content

Pages and components never call `getCollection` or read JSON directly. They use the functions exported from `src/lib/content/index.ts`:

| Function                                                                                 | Source                                                                    |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `getCaseStudies({ featuredOnly })`, `getCaseStudy(slug)`, `getAdjacentCaseStudies(slug)` | MDX in `src/content/case-studies/`                                        |
| `getServices()`                                                                          | `src/content/services.json` (the "What I do" blocks)                      |
| `getSite()`, `siteLink(site, id)`                                                        | `src/content/site/profile.json`                                           |
| `getRecentPosts(n)`                                                                      | devnel.blog REST API at build time, falling back to `posts-fallback.json` |
| `getResume(track)`                                                                       | `src/data/resume.json`                                                    |

**Case studies** are MDX files with validated frontmatter (`title`, `slug`, `summary`, `client`, `role`, `period`, `stack`, `links`, `cover`, `coverAlt`, `order`, `featured`). Each one uses the same sections: The problem, Constraints, What I built (with an `<ArchDiagram>`), Stack, Results, and What I'd do differently. `<Todo>` renders a deliberately obvious placeholder for drafts; `check:dist` stops one from shipping.

**Screenshots.** The image service is passthrough (no build-time resizing on Workers), so screenshots are pre-sized files in `public/images/work/`, named after `cover`:

- `<cover>-480` and `-960` (16:10): the home-page card, and the case-study page on phones.
- `<cover>-hero-800`, `-1200` and `-2000` (15:8): the case-study page from 40rem up, with `coverAlt` as its alt text. On the cards the image is decorative, since the title link already names the project.

Each size exists as AVIF and WebP. Crop them from the top of a full-page capture.

**Posts.** `wordpressPosts()` fetches `https://devnel.blog/wp-json/wp/v2/posts?per_page=3&_fields=id,date,link,title,excerpt` at build time with an 8-second timeout. On any failure (network, HTTP status, an unexpected shape, or a post that fails the schema) it logs a warning and uses `src/content/posts-fallback.json`, so the build never breaks. Post links must be `https://devnel.blog` URLs, so a compromised feed can't inject `javascript:` or off-site links. Posts refresh on each build.

## Resume as data

`src/data/resume.json` is [JSON Resume](https://jsonresume.org) v1 and the single source of truth for:

- `/cv` (engineering) and `/cv/support`: HTML CVs with Person JSON-LD and A4 print styles.
- The About page timeline: dates, companies and roles, read from `work`.
- `/resume.json`: the raw file, byte for byte, with CORS enabled.
- The two CV PDFs.
- [registry.jsonresume.org/kdevnel](https://registry.jsonresume.org/kdevnel), through the gist sync below.

**Tracks.** Top-level fields are the engineering track. `x-tracks.support` on `basics` and on each `work` entry overrides `label`, `summary` and `highlights`, and the top-level `x-tracks.support.skills` replaces the skills list; anything not overridden falls back. `getResume('engineering' | 'support')` applies this after validating the file with a Zod schema (`src/lib/content/resume-schema.ts`). The `x-` fields are valid under the official schema, which allows extra properties. The registry's stricter validator doesn't, so the gist sync strips them.

**Privacy.** The file deliberately has no phone number or street address. `scripts/check-resume-privacy.mjs` fails CI if `basics.phone` is set, or if anything with 9+ digits looks like a phone number, and the Zod schema rejects `basics.phone` too. The email address is in the JSON, as JSON Resume expects, but never appears as plain text in the HTML or the JSON-LD. CI also validates the file against the official schema (`@jsonresume/schema`).

### CV PDFs

`public/cv/Kyle-Nel_CV_Engineering.pdf` and `Kyle-Nel_CV_Support.pdf` are generated from `resume.json` by `scripts/cv-pdf.mjs` (headless Chromium, A4, two pages each). After editing `resume.json`, regenerate and commit them:

```sh
npm run cv:pdf             # writes ./cv-pdf/*.pdf for review
npm run cv:pdf -- --write  # overwrites public/cv/*.pdf
```

The layout is built for applicant tracking systems as well as people: one column of real, selectable text, standard section names (Profile, Skills, Professional Experience, Leadership & Community, Education), plain bullets, no tables or text in images, and the contact details in the body rather than a page header. The branding is colour and the [>·<] mark; the type is Source Sans 3 throughout. The email is in plain text, since recruiters and ATS need it; there's no phone number, and `check:dist` fails if one appears. The script loads the site's resume schema and track logic directly, using Node's TypeScript type stripping.

### Registry sync (gist)

`.github/workflows/resume-gist-sync.yml` runs on pushes to `main` that change `src/data/resume.json` (or on demand). It re-runs the resume checks, strips the site-only `x-` fields (the registry rejects a resume with extra top-level properties), then updates the gist behind the registry through the GitHub API. The registry caches pages for about four hours; [registry.jsonresume.org/privacy](https://registry.jsonresume.org/privacy) clears it. Without these two repository secrets it skips with a warning:

- **`RESUME_GIST_ID`**: the last part of the gist's URL, `https://gist.github.com/kdevnel/<this-part>`.
- **`GIST_TOKEN`**: a classic personal access token with only the **`gist`** scope and an expiry (fine-grained tokens can't write gists). When it expires, generate a new one and paste it over the secret.

## Contact form

`src/components/ContactForm.astro` posts to `src/pages/api/contact.ts`, the only on-demand route (`prerender = false`).

**Request guards** (`src/lib/contact/request.ts`), which don't depend on any proxy:

- **Cross-site check**: the browser's own `Sec-Fetch-Site` header must be `same-origin`. Older browsers that don't send it fall back to comparing `Origin` with the site's origins: `https://devnel.com`, `www`, anything in `ALLOWED_ORIGINS`, and the URL the server saw (for direct access).
- **Size limit**: bodies over 16 KB are refused, by `Content-Length` or by counting bytes as they stream in, so a chunked upload can't dodge it. The unread rest of a rejected body (up to 1 MB) is drained before responding; answering mid-upload broke the next request under Wrangler's local Workers runtime.

**Spam defences, in order:**

1. **Honeypot**: a visually hidden `website` field (`tabindex="-1"`, `autocomplete="off"`, `aria-hidden`). If it's filled in, the bot gets a normal-looking success and nothing is sent.
2. **Minimum time-to-submit**: the browser fetches an HMAC-signed timestamp (`GET /api/contact/`). Anything under 3 seconds is silently dropped like the honeypot, so bots learn nothing; tokens older than 2 hours are refused. The page refreshes the timestamp hourly, and if it has still expired (say, after the laptop slept) the form gets a new one and retries once.
3. **Validation**: a Zod schema with trimming, length limits (message up to 2,000 characters) and at most 2 links. The browser only gets a tiny Zod-free check (`limits.ts`); the server is authoritative.
4. **Rate limit**: 5 plausible messages per IP per hour (`MemoryRateLimiter`), counted after validation so typos don't use up the allowance, and before the expensive steps. It tracks at most 5,000 addresses (least recently seen are evicted). The visitor's IP comes from the one header named in `CLIENT_IP_HEADER` (for `X-Forwarded-For`, the last entry, which your own proxy appended), so spoofed headers are ignored. In memory it's exact on a single Node process and best-effort on Workers; `rate-limit.ts` explains how to move it to KV, Redis or a Workers rate-limiting binding.
5. **Cloudflare Turnstile**: verified server-side with the secret key. The script loads on the visitor's first interaction with the form (focus, tap or key press), so it costs nothing for people who are only reading. On submit, the form waits for Turnstile's token.

**Progressive enhancement.** The form is a normal `method="post"` form. Without JavaScript, the server answers with redirects: to `/thanks/`, or to `/contact/#error-<code>`, which shows the message via CSS `:target`. Turnstile and the signed timestamp need JavaScript, so no-JS visitors see a note pointing them to LinkedIn. With JavaScript, the form submits with `fetch` and shows inline, field-level errors (`aria-invalid`, `aria-describedby`, an `aria-live` status), and moves focus to the first invalid field or to the success message.

**Email address.** It never appears as plain text in the HTML. "Email me" links carry it reversed and base64-encoded, and a few lines of JS turn them into `mailto:` links. Without JS they link to the contact form.

**Mail delivery.** `src/lib/mail/` picks a provider from `MAIL_PROVIDER`:

- **`resend`**: the Resend HTTP API with plain `fetch`, no SDK. Works on Node and Workers. Messages come from `"devNel contact form" <contact@devnel.com>` with `Reply-To` set to the visitor. Resend's bounce MX and SPF records live on `send.devnel.com` and DKIM on its own selector, so they don't touch devnel.com's own inbound mail.
- **`smtp`**: Nodemailer, Node only. It's imported with a computed specifier, so bundlers never pull it into a Workers build.
- **`log`**: writes messages to the console or `MAIL_LOG_FILE`. Used for development and tests.

## Brand and design

The 2018 devNel identity, with updated positioning:

- **Logo**: the original outlined paths, defined once per page as SVG symbols (`BrandSprite.astro`). `Logo.astro` and `Mark.astro` draw them with `<use>`, which saves about 13 KB per page. Colours come from tokens (`--logo-word`, `--logo-mark`). The subtitle `<full-stack engineer and support lead>` is live Quando text, kept in sync with the OG images in `integrations/og-images.ts`.
- **[>·<] mark**: a bowtie made of code brackets. Used for the mobile header, the favicon, section dividers, the 404 and `/thanks`.
- **Type**: Quando (display, single weight; hierarchy comes from size and colour), Source Sans 3 (body) and IBM Plex Mono (labels). All are self-hosted Latin subsets from Fontsource, Quando and Source Sans are preloaded, and there are no runtime font requests to third parties. Source Sans 3 won over Instrument Sans (too narrow beside Quando's wide letterforms) and Open Sans (generic, and heavier to load): its open humanist shapes match Quando, and it's a single variable file.
- **Motifs**: the `// \\` slash pattern is a CSS mask, recoloured with tokens. It sits behind the hero and case-study headers and in the footer, never behind body text. Section eyebrows are mono `<angle brackets>`.
- **Motion**: native cross-document view transitions (a CSS-only crossfade, with a shared-element transition on case-study titles), a one-time 8px fade-and-rise as sections scroll into view, an animated highlighter underline, and a one-time "straighten" wiggle of the bowtie on logo hover. All of it is off under `prefers-reduced-motion`.
- **Dark theme**: follows the system setting (pine background, cream text, sun accents), with no toggle.

## Quality

**Lighthouse** (mobile, production build): 100 in all four categories on `/`, all three case studies, `/about/`, `/cv/` and `/contact/`. `/thanks` scores lower on SEO by design, since it's `noindex`.

**Contrast.** `npm run contrast` prints the ratio for every text pairing in both themes and fails CI below WCAG AA (4.5:1 for normal text, 3:1 for large text and UI). Two findings shaped the tokens:

- `--sage` on `--paper-2` is only 4.3:1, so links and small headings on cards and alternate sections use `--sage-deep` (the `--link-alt` and `--heading-alt` tokens).
- Text sitting directly on a slash-pattern stroke loses contrast: `--clay` drops to 4.3:1 there. Small text in the light-mode pattern bands uses `--muted-on-pattern` (#67584F), and the pattern is at 0.3 opacity. The script calculates these worst cases from the stroke colour at its opacity, because axe can't measure text over a `::before` pattern.

**Accessibility tests.** axe runs in the e2e suite on every page, in light and dark mode, at desktop and mobile widths, and fails CI on any WCAG 2.2 A/AA violation (`tests/e2e/a11y.spec.ts`). Lists styled with `list-style: none` carry `role="list"`, because Safari drops their list semantics otherwise.

**Other tests.** The e2e suite also covers landmarks and the skip link, the branded 404, navigation, every case study's sections and diagram, the CV track switch and PDFs, `/resume.json`, form validation, the honeypot, a no-JS submission, a full send, and the cross-site and size guards with proxy-style headers. The unit tests cover the request guards (including a chunked upload with no length), the rate limiter's key cap, the schema, signed timestamps, resume tracks and the WordPress loader.

## Deploying

### Cloudflare Workers (production)

`npm run build` uses the Cloudflare adapter. It reads `wrangler.jsonc`, prerenders the pages in workerd, and writes the deployable config to `dist/server/wrangler.json`, which `wrangler deploy` picks up. The contact endpoint uses only `fetch`, Web Crypto, streams and `FormData`, so it runs unchanged.

**First deploy:**

```sh
npx wrangler login
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put FORM_SIGNING_SECRET       # openssl rand -base64 32
npx wrangler secret put RESEND_API_KEY
npm run deploy
```

After that, `npm run deploy` is the whole release. Deploys are manual; CI doesn't deploy.

**What `wrangler.jsonc` sets:**

- `vars`: `MAIL_PROVIDER=resend`, the public `TURNSTILE_SITE_KEY`, and `CLIENT_IP_HEADER=none` (the adapter sets the client address from `CF-Connecting-IP`). Override `MAIL_FROM`, `CONTACT_TO` and the others there if the defaults don't suit.
- `routes`: `devnel.com` and `www.devnel.com` as custom domains. Cloudflare creates their DNS records and certificates, and a deploy fails if either hostname already has its own `A`, `AAAA` or `CNAME` record in the zone. Both hostnames serve the site; every page's canonical URL is `https://devnel.com/…`.
- `assets.html_handling: force-trailing-slash`: `/about` redirects to `/about/`. Workers static assets answer with 307, not 301; canonicals and the sitemap already use the slash form.
- `assets.not_found_handling: 404-page`: unknown paths get the branded 404 with a 404 status.

**The Turnstile site key** is baked into the HTML at build time, which is why it lives in `wrangler.jsonc` rather than `.env`. The Cloudflare adapter copies `.env` into the build environment over anything set in the shell, so a local test key would win. `npm run deploy` therefore builds with `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`, and `scripts/check-deploy.mjs` stops the deploy if the contact page has no key or one of Cloudflare's test keys.

**Notes:**

- `public/_headers` applies the security, CORS and cache headers. Workers compresses responses itself.
- `smtp` and `log` are Node-only and never bundled. OG images are generated after the build in Node, so the native `resvg` module is never deployed.
- Rate limiting is per isolate on Workers, so the in-memory limit is best-effort and Turnstile is the real gate. For a hard limit, add a WAF rate-limiting rule for `POST /api/contact/`, or implement `RateLimiter` with a Workers rate-limiting binding.
- The build copies `.env` into `dist/server/.dev.vars` for the prerender worker. It isn't uploaded: `.assetsignore` excludes it, and `wrangler deploy` never sends `.dev.vars`.

### Self-hosting on Node

`deploy/` has configs for running the Node build behind Caddy or Nginx. Both were tested against the production build in their official containers: pages, 301s to the trailing-slash URL, the branded 404, security and cache headers, CORS on `/resume.json`, an accepted same-origin form post, a 403 for a foreign `Origin`, a refused 200 KB body, and rate limiting with spoofed IP headers (the 6th submission gets 429).

```sh
# on the server, e.g. /srv/devnel-com
git pull && npm ci && npm run build:node  # TURNSTILE_SITE_KEY must be set at build time
npm prune --omit=dev                      # keeps runtime deps (nodemailer) only
sudo cp deploy/devnel-com.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now devnel-com
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

- **Caddy** serves `dist/client` itself and proxies only `/api/*` to the app on `127.0.0.1:4321`. It handles TLS, the `www` redirect, compression, trailing-slash redirects, the 404 page, security headers (including `frame-ancestors`, which can't go in the page's CSP meta tag), immutable caching for `/_astro/*`, CORS for `/resume.json`, and a 64 KB body limit on `/api/*`.
- **Nginx**: use `deploy/nginx.conf` instead of the Caddyfile, and create `/etc/nginx/snippets/devnel-security-headers.conf` with the `add_header` lines listed in its comments (Nginx drops inherited `add_header`s in any block that sets its own). The certificate paths assume certbot.
- **The systemd unit** sets `CLIENT_IP_HEADER=x-forwarded-for` and reads secrets from `/srv/devnel-com/.env`. It's hardened (read-only filesystem, no capabilities, `MemoryMax=256M`); to use `MAIL_LOG_FILE`, add a `ReadWritePaths=` line for its directory.

In every setup, set `CLIENT_IP_HEADER` so rate limiting sees visitors rather than the proxy. If you forget, the server logs a warning on the first submission from a loopback address.

**Netlify or Vercel** should work by swapping the adapter in `astro.config.mjs`, but neither is tested. Netlify honours `public/_headers`; on Vercel, add the headers in `vercel.json`. Check what client address the adapter provides before relying on the rate limit.

## Design decisions

- **Native view transitions**, CSS-only, rather than `<ClientRouter />`, to keep within the JS budget. Browsers without support simply navigate without the crossfade.
- **An API route, not an Astro Action**, for the contact endpoint. Actions' no-JS fallback needs on-demand pages, and an API route ports to any adapter.
- **Astro's `checkOrigin` is off**, replaced by the endpoint's own cross-site check. The built-in check compares `Origin` with the Host header, which depends on what a proxy forwards, and it rejected every real submission behind Caddy.
- **CSP as a `<meta>` tag** generated by Astro, so it works on any host. Astro hashes its own scripts and styles; the two inline scripts are hashed in `astro.config.mjs`. `frame-ancestors` can't go in a meta tag, so it's sent as a header by `_headers` and the proxy configs. One consequence: CSS from components used inside MDX isn't hashed, so `ArchDiagram`'s styles live in `src/styles/diagram.css`, and MDX files shouldn't import components they don't use.
- **URLs always end in a slash** (`trailingSlash: 'always'`), matching canonicals and the sitemap.
- **Dates** display in `en-GB` for Africa/Johannesburg.

## Moving to WordPress

The data layer is built so a switch to WordPress as a headless CMS only touches `src/content.config.ts` (and maybe `src/lib/content/*`), never pages or components. `posts` already comes from WordPress through `wordpressPosts()` in `src/lib/content/loaders/wordpress.ts`: it fetches from the REST API at build time, strips the HTML, validates against the collection schema and falls back locally on failure. Copy that loader for each new content type:

| Collection    | Today                  | WordPress                                                                                   |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `posts`       | WP REST (done)         | Same; or WPGraphQL `posts(first: 3)`                                                        |
| `caseStudies` | `glob()` over MDX      | A `case_study` custom post type with ACF fields for the frontmatter, fetched with `?_embed` |
| `services`    | `file()` JSON          | An ACF repeater on an options page, or a small `service` CPT                                |
| `site`        | `file()` JSON          | An ACF options page                                                                         |
| `resume`      | `src/data/resume.json` | **Keep it in git.** It also drives the PDFs and the registry                                |

For case studies, `cover` would map to the featured image's media sizes, the body to `content.rendered` (HTML stored with `store.set({ …, rendered: { html } })`), and `<ArchDiagram>`'s `nodes` and `edges` to an ACF JSON or repeater field rendered from the template. Content is fetched at build time, so trigger a rebuild and deploy when something is published.

## License

The code is under the [MIT License](LICENSE): reuse, change and ship it however you like, as long as the copyright notice stays.

The MIT License doesn't cover the site's content: the case-study and page copy, the CV and `resume.json`, photos, the devNel logo and mark, or the client screenshots in `public/images/work/` (those belong to their owners). Please don't reuse those.
