import { describe, it, expect } from 'vitest';

// CommonJS module under electron/
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  validateInvoicePayload,
  normalizeEmcfPayload,
  calculateVatForItem,
  calculateAIB,
} = require('../../electron/emcf-validation.cjs');

describe('Validation payload e-MCF', () => {
  it('rejette AV sans référence', () => {
    const payload = {
      type: 'AV',
      customer: { name: 'X' },
      items: [{ taxGroup: 'B', name: 'Test', quantity: 1, unitPrice: 1000 }],
    };
    expect(() => validateInvoicePayload(payload)).toThrow(/AVOIR_REFERENCE_MANQUANTE/);
  });

  it('accepte AV avec originalInvoiceReference', () => {
    const payload = {
      type: 'AV',
      originalInvoiceReference: 'ABC-123',
      customer: { name: 'X' },
      items: [{ taxGroup: 'B', name: 'Test', quantity: 1, unitPrice: 1000 }],
    };
    expect(() => validateInvoicePayload(payload)).not.toThrow();
  });

  it('rejette article sans taxGroup', () => {
    const payload = {
      type: 'FV',
      customer: { name: 'X' },
      items: [{ name: 'Test', quantity: 1, unitPrice: 1000 }],
    };
    expect(() => validateInvoicePayload(payload)).toThrow(/ARTICLE_TAXGROUP_INVALIDE/);
  });

  it('rejette taxGroup invalide', () => {
    const payload = {
      type: 'FV',
      customer: { name: 'X' },
      items: [{ name: 'Test', taxGroup: 'Z', quantity: 1, unitPrice: 1000 }],
    };
    expect(() => validateInvoicePayload(payload)).toThrow(/ARTICLE_TAXGROUP_INVALIDE/);
  });

  it('rejette AIB invalide', () => {
    const payload = {
      type: 'FV',
      aibRate: 2,
      customer: { name: 'X' },
      items: [{ name: 'Test', taxGroup: 'B', quantity: 1, unitPrice: 1000 }],
    };
    expect(() => validateInvoicePayload(payload)).toThrow(/AI_RATE_INVALIDE/);
  });

  it('normalise client->customer et paymentMethods->payment', () => {
    const payload = {
      type: 'FV',
      client: { name: 'Client A', ifu: '123' },
      items: [{ name: 'Test', taxGroup: 'B', quantity: 2, unitPrice: 1000 }],
      paymentMethods: [{ name: 'especes', amount: 9999 }],
      aibRate: 0,
    };

    expect(() => validateInvoicePayload(payload)).not.toThrow();
    const n = normalizeEmcfPayload(payload);
    expect(n.customer).toBeDefined();
    expect(n.customer.ifu).toBe('123');
    expect(Array.isArray(n.payment)).toBe(true);
    expect(n.payment[0].name).toBe('ESPECES');
  });
});

describe('Champs obligatoires DGI', () => {
  it('inclut nim et ifuVendeur si fournis via emcfInfo', () => {
    const emcfInfo = {
      nim: 'TS01017752',
      ifu: '0202368226611',
    };

    const payload = {
      type: 'FV',
      customer: { name: 'X' },
      items: [{ name: 'Test', quantity: 1, unitPrice: 1000, taxGroup: 'B' }],
    };

    const normalized = normalizeEmcfPayload(payload, emcfInfo);
    expect(normalized.nim).toBe('TS01017752');
    expect(normalized.ifuVendeur).toBe('0202368226611');
    expect(normalized.dateTime).toBeDefined();
    expect(typeof normalized.dateTime).toBe('string');
  });

  it('sans emcfInfo n\'inclut pas nim/ifuVendeur mais inclut dateTime', () => {
    const payload = {
      type: 'FV',
      customer: { name: 'X' },
      items: [{ name: 'Test', quantity: 1, unitPrice: 1000, taxGroup: 'B' }],
    };

    const normalized = normalizeEmcfPayload(payload, {});
    expect(normalized.nim).toBeUndefined();
    expect(normalized.ifuVendeur).toBeUndefined();
    expect(normalized.dateTime).toBeDefined();
  });
});

describe('Calculs TVA / AIB', () => {
  it('TVA groupe B = 18%', () => {
    const vat = calculateVatForItem({ taxGroup: 'B', quantity: 2, unitPrice: 1000 });
    expect(vat).toBe(360);
  });

  it('TVA groupe C = 10%', () => {
    const vat = calculateVatForItem({ taxGroup: 'C', quantity: 2, unitPrice: 1000 });
    expect(vat).toBe(200);
  });

  it('TVA groupe D = 5%', () => {
    const vat = calculateVatForItem({ taxGroup: 'D', quantity: 2, unitPrice: 1000 });
    expect(vat).toBe(100);
  });

  it('TVA groupes A/E/EXPORT = 0', () => {
    expect(calculateVatForItem({ taxGroup: 'A', quantity: 2, unitPrice: 1000 })).toBe(0);
    expect(calculateVatForItem({ taxGroup: 'E', quantity: 2, unitPrice: 1000 })).toBe(0);
    expect(calculateVatForItem({ taxGroup: 'EXPORT', quantity: 2, unitPrice: 1000 })).toBe(0);
  });

  it('AIB rate 5% sur subtotal', () => {
    const aib = calculateAIB(10000, 5);
    expect(aib).toBe(500);
  });
});
