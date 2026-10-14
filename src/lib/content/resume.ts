import raw from '@/data/resume.json';
import { resumeSchema, type RawResume } from './resume-schema';
import { applyTrack, type Track } from './resume-tracks';

export { TRACKS, type Track } from './resume-tracks';

export type Resume = ReturnType<typeof applyTrack>;
export type WorkEntry = Resume['work'][number];

let parsed: RawResume | undefined;

/** The CV for a track, validated once and with overrides applied. */
export function getResume(track: Track = 'engineering'): Resume {
  parsed ??= resumeSchema.parse(raw);
  return applyTrack(parsed, track);
}
