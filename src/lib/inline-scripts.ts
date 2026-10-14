/**
 * The site's two inline scripts. They live here, not in Base.astro, so
 * astro.config.mjs can hash the exact same strings for the CSP: Astro hashes
 * bundled scripts itself, but not inline ones.
 */

/** Prefetch internal pages on hover/press; never downloads or the API. */
export const SPECULATION_RULES = JSON.stringify({
  prefetch: [
    {
      where: {
        and: [
          { href_matches: '/*' },
          { not: { href_matches: '/*.pdf' } },
          { not: { href_matches: '/api/*' } },
        ],
      },
      eagerness: 'moderate',
    },
  ],
});

/**
 * Scroll reveal. Inline in <head> so the class is set before first paint.
 * It opts in only when it can run and motion is welcome, so content is never
 * hidden without JS.
 */
export const REVEAL_SCRIPT = `if('IntersectionObserver'in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.classList.add('js-reveal');addEventListener('DOMContentLoaded',function(){var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});document.querySelectorAll('[data-reveal]').forEach(function(el){io.observe(el)})})}`;
