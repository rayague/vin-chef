import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { calculateVatForItem, calculateAIB, normalizeEmcfPayload } = require('../../electron/emcf-validation.cjs');

describe('Calculs fiscaux e-MECeF', () => {
  it('Calcul TVA groupe B (18%)', () => {
    expect(calculateVatForItem({ taxGroup: 'B', quantity: 1, unitPrice: 10000 })).toBe(1800);
  });

  it('Calcul TVA groupe C (10%)', () => {
    expect(calculateVatForItem({ taxGroup: 'C', quantity: 2, unitPrice: 5000 })).toBe(1000);
  });

  it('Calcul TVA groupe D (5%)', () => {
    expect(calculateVatForItem({ taxGroup: 'D', quantity: 3, unitPrice: 2000 })).toBe(300);
  });

  it('Calcul TVA groupes A/E/EXPORT = 0', () => {
    expect(calculateVatForItem({ taxGroup: 'A', quantity: 1, unitPrice: 10000 })).toBe(0);
    expect(calculateVatForItem({ taxGroup: 'E', quantity: 1, unitPrice: 10000 })).toBe(0);
    expect(calculateVatForItem({ taxGroup: 'EXPORT', quantity: 1, unitPrice: 10000 })).toBe(0);
  });

  it('Calcul AIB 5% sur 10000 HT', () => {
    expect(calculateAIB(10000, 5)).toBe(500);
  });

  it('Calcul AIB 0% ne modifie pas le total', () => {
    expect(calculateAIB(10000, 0)).toBe(0);
  });

  it('Total avec TVA mixte + AIB', () => {
    const payload = {
      type: 'FV',
      customer: { name: 'X' },
      aibRate: 5,
      items: [
        { name: 'A', quantity: 1, unitPrice: 10000, taxGroup: 'B' }, // VAT 1800
        { name: 'B', quantity: 2, unitPrice: 5000, taxGroup: 'C' },  // VAT 1000
        { name: 'C', quantity: 1, unitPrice: 2000, taxGroup: 'A' },  // VAT 0
      ],
    };

    const n = normalizeEmcfPayload(payload, {});
    // subtotal = 10000 + 10000 + 2000 = 22000
    expect(n.subtotal).toBe(22000);
    // VAT = 1800 + 1000 + 0 = 2800
    const totalVat = n.items.reduce((s: number, it: any) => s + (it.vatAmount || 0), 0);
    expect(totalVat).toBe(2800);
    // AIB 5% of subtotal = 1100
    expect(n.aibAmount).toBe(1100);
    // total = subtotal + vat + aib
    expect(n.total).toBe(22000 + 2800 + 1100);
  });

  it("Arrondis légaux (à l'unité la plus proche)", () => {
    // 3333 * 18% = 599.94 -> 600
    expect(calculateVatForItem({ taxGroup: 'B', quantity: 1, unitPrice: 3333 })).toBe(600);
    // 9999 * 5% = 499.95 -> 500
    expect(calculateAIB(9999, 5)).toBe(500);
  });
});
