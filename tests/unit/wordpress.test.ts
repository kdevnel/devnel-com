import { describe, expect, it } from 'vitest';
import { htmlToText } from '@/lib/content/loaders/wordpress';

describe('htmlToText', () => {
  it('strips tags and decodes the entities WordPress emits', () => {
    expect(htmlToText('<p>Nginx doesn&#8217;t pass HTTP/3 &amp; more [&hellip;]</p>\n')).toBe(
      'Nginx doesn’t pass HTTP/3 & more…',
    );
  });
});
