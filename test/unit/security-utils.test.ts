import { describe, it, expect } from 'vitest';
import { formatMecEfCode } from '../../src/lib/security-utils';

describe('security-utils', () => {
  it('formats a 24-char MECeF code into 6 groups of 4 (format officiel DGI)', () => {
    expect(formatMecEfCode('TESTRKVXMUU3LUA2KHOGFEFB')).toBe('TEST-RKVX-MUU3-LUA2-KHOG-FEFB');
  });

  it('keeps an already-dashed DGI code identical', () => {
    expect(formatMecEfCode('TEST-RKVX-MUU3-LUA2-KHOG-FEFB')).toBe('TEST-RKVX-MUU3-LUA2-KHOG-FEFB');
  });

  it('strips non-alphanumerics and uppercases', () => {
    expect(formatMecEfCode('ab-cd e!12')).toBe('ABCD-E12');
  });

  it('returns empty string for empty input', () => {
    expect(formatMecEfCode('')).toBe('');
    expect(formatMecEfCode(undefined)).toBe('');
  });
});
