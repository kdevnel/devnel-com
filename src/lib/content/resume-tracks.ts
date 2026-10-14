/**
 * Applies a CV track to the validated resume. No imports beyond types, so
 * scripts/cv-pdf.mjs can load it directly in Node, as well as the site.
 */
import type { RawResume } from './resume-schema';

export type Track = 'engineering' | 'support';
export const TRACKS: readonly Track[] = ['engineering', 'support'];

type Override = { label?: string; summary?: string; highlights?: string[] };

/** Applies x-tracks.<track> overrides; anything not overridden falls back. */
function withTrack<T extends { 'x-tracks'?: { support?: Override } }>(item: T, track: Track) {
  const { 'x-tracks': tracks, ...rest } = item;
  const override = track === 'engineering' ? undefined : tracks?.[track];
  return { ...rest, ...override };
}

export function applyTrack(data: RawResume, track: Track) {
  const { 'x-tracks': tracks, ...rest } = data;
  const basics = withTrack(data.basics, track);
  return {
    ...rest,
    track,
    basics: basics as Omit<RawResume['basics'], 'x-tracks'> & Override,
    work: data.work.map((job) => withTrack(job, track)),
    // Top-level x-tracks.<track>.skills replaces the whole skills list.
    skills: (track === 'engineering' ? undefined : tracks?.[track]?.skills) ?? data.skills,
  };
}
