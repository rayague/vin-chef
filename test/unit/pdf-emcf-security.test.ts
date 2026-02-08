import { describe, it, expect, vi } from 'vitest';

// Capture calls made to jsPDF
const calls: {
  texts: string[];
  images: number;
  fonts: Array<{ name: string; style?: string }>;
} = {
  texts: [],
  images: 0,
  fonts: [],
};

vi.mock('jspdf', () => {
  class JsPdfMock {
    internal = {
      pageSize: {
        getHeight: () => 297,
      },
    };

    addImage() {
      calls.images += 1;
    }

    text(txt: unknown) {
      if (Array.isArray(txt)) {
        calls.texts.push(txt.join(' '));
      } else {
        calls.texts.push(String(txt));
      }
    }

    splitTextToSize(txt: string) {
      return [txt];
    }

    setFont(name: string, style?: string) {
      calls.fonts.push({ name, style });
    }

    // no-op drawing methods used by pdf.ts
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    setFillColor() {}
    setLineWidth() {}
    rect() {}
    line() {}
    addPage() {}
    output() {
      return '';
    }
    save() {}
  }

  return { default: JsPdfMock };
});

vi.mock('jspdf-autotable', () => {
  return { default: () => {} };
});

describe('PDF e-MECeF security elements', () => {
  it('renders legal mention, QR image and footer security line when emcf data is present', async () => {
    calls.texts = [];
    calls.images = 0;
    calls.fonts = [];

    const { generateInvoicePDF } = await import('../../src/lib/pdf');

    generateInvoicePDF({
      invoiceNumber: 'FAC-2026-00001',
      date: new Date('2026-02-08T00:00:00.000Z').toISOString(),
      clientName: 'Client Test',
      totalHT: 1000,
      tva: 180,
      totalTTC: 1180,
      productName: 'Produit',
      quantity: 1,
      unitPrice: 1000,
      emcfCodeMECeFDGI: 'ABCDE12345FGHIJ',
      emcfQrCodeDataUrl: 'data:image/png;base64,AAA',
      emcfNim: 'TS01017752',
      emcfDateTime: '2026-02-07T01:20:49.1625145+01:00',
    });

    expect(calls.images).toBeGreaterThan(0);
    expect(calls.texts.join('\n')).toMatch(/FACTURE NORMALISÉE DGI e-MECeF/);
    expect(calls.texts.join('\n')).toMatch(/Code MECeF:/);
    expect(calls.texts.join('\n')).toMatch(/NIM:/);
    expect(calls.texts.join('\n')).toMatch(/Date DGI:/);

    // ensure monospace used at least once
    expect(calls.fonts.some((f) => f.name === 'courier')).toBe(true);
  });
});
