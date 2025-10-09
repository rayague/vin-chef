import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../../src/lib/pdf';

describe('formatCurrency', () => {
  it('uses non-breaking space (U+00A0) as thousands separator and not U+202F', () => {
    const s = formatCurrency(1234567);
    // ensure it contains U+00A0
    expect(s.includes('\u00A0')).toBe(true);
    // ensure it does not contain U+202F
    expect(s.includes('\u202F')).toBe(false);
    // basic pattern check
    expect(s).toBe('1\u00A0234\u00A0567'.replace(/\\u00A0/g, '\u00A0'));
  });
});
