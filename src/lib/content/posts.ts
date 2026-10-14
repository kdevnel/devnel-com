import { getCollection } from 'astro:content';

export type Post = { id: string; title: string; date: Date; link: string; excerpt: string };

/** Latest posts from devnel.blog, newest first. */
export async function getRecentPosts(n = 3): Promise<Post[]> {
  const all = await getCollection('posts');
  return all
    .map((e) => ({ id: e.id, ...e.data }))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, n);
}
