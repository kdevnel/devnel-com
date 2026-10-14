// The only way pages and components get content. Swap the loaders in
// src/content.config.ts (e.g. for WordPress) without touching callers.
export { getSite, siteLink, type Site } from './site';
export {
  getCaseStudies,
  getCaseStudy,
  getAdjacentCaseStudies,
  renderCaseStudy,
  type CaseStudy,
} from './case-studies';
export { getServices } from './services';
export { getRecentPosts, type Post } from './posts';
export { getResume, TRACKS, type Resume, type Track, type WorkEntry } from './resume';
