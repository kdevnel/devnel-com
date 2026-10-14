import { describe, expect, it } from 'vitest';
import raw from '@/data/resume.json';
import { getResume } from '@/lib/content/resume';
import { formatPeriod } from '@/lib/format';

describe('getResume', () => {
  it('returns the engineering track from the top-level fields', () => {
    const cv = getResume('engineering');
    expect(cv.basics.label).toBe(raw.basics.label);
    expect(cv.work[0]?.highlights).toEqual(raw.work[0]?.highlights);
    expect(cv.basics).not.toHaveProperty('x-tracks');
  });

  it('applies support overrides and falls back for anything not overridden', () => {
    const cv = getResume('support');
    expect(cv.basics.label).toBe(raw.basics['x-tracks'].support.label);
    expect(cv.basics.name).toBe(raw.basics.name);

    // Illustrate Digital overrides highlights only, so position/dates fall back.
    const illustrate = cv.work.find((w) => w.name === 'Illustrate Digital');
    const rawIllustrate = raw.work.find((w) => w.name === 'Illustrate Digital')!;
    expect(illustrate?.highlights).toEqual(rawIllustrate['x-tracks'].support.highlights);
    expect(illustrate?.position).toBe(rawIllustrate.position);
    expect(illustrate?.startDate).toBe(rawIllustrate.startDate);
  });

  it('never exposes a phone number', () => {
    expect(getResume().basics).not.toHaveProperty('phone');
  });
});

describe('formatPeriod', () => {
  it('formats partial dates and open ranges', () => {
    expect(formatPeriod('2023-09', '2025-04')).toBe('Sep 2023 – Apr 2025');
    expect(formatPeriod('2018')).toBe('2018 – present');
  });
});
