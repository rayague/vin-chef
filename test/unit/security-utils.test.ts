import { describe, it, expect } from 'vitest';
import { formatMecEfCode } from '../../src/lib/security-utils';

describe('security-utils', () => {
  it('formats MECeF code into groups of 5', () => {
    expect(formatMecEfCode('ABCDE12345FGHIJ')).toBe('ABCDE-12345-FGHIJ');
  });

  it('strips non-alphanumerics and uppercases', () => {
    expect(formatMecEfCode('ab-cd e!12')).toBe('ABCDE-12');
  });

  it('returns empty string for empty input', () => {
    expect(formatMecEfCode('')).toBe('');
    expect(formatMecEfCode(undefined)).toBe('');
  });
});
