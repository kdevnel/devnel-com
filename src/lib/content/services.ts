import { getCollection } from 'astro:content';

export async function getServices() {
  const all = await getCollection('services');
  return all.sort((a, b) => a.data.order - b.data.order).map((e) => ({ id: e.id, ...e.data }));
}
