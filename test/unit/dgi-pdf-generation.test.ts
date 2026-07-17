// @vitest-environment node
// Génère les 20 factures PDF de la campagne d'auto-déclaration DGI
// à partir de reports/dgi-cases/results.json (données réelles confirmées sur TEST).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { generateInvoicePDF, InvoiceData } from '@/lib/pdf';

const ROOT = path.resolve(__dirname, '../../');
const RESULTS = path.join(ROOT, 'reports', 'dgi-cases', 'results.json');
const OUT_DIR = path.join(ROOT, 'reports', 'dgi-cases', 'pdf');

type CaseResult = {
  id: number;
  label: string;
  type: string;
  sejour?: boolean;
  payload: {
    aib?: 'A' | 'B';
    reference?: string;
    client: { name: string; ifu?: string; address?: string; contact?: string };
    items: Array<{ name: string; price: number; quantity: number; taxGroup: string; taxSpecific?: number }>;
  };
  submit: { total: number; vab: number; vad: number; aib: number; ts: number };
  confirm: { codeMECeFDGI: string; qrCode: string; dateTime: string; counters: string; nim: string };
};

const parseDgiDate = (s: string): string => {
  // "16/07/2026 01:07:55" -> ISO
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const [, dd, mm, yyyy, h, mi, se] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(h), Number(mi), Number(se)).toISOString();
};

describe('DGI campaign PDF generation', () => {
  // Outil de campagne : ne s'exécute que si les résultats de soumission DGI existent
  // (générés par `node scripts/dgi-cases.mjs`).
  it.skipIf(!fs.existsSync(RESULTS))('generates one PDF per confirmed case', async () => {
    const raw = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
    const cases = Object.values(raw.cases) as CaseResult[];
    fs.mkdirSync(OUT_DIR, { recursive: true });

    let generated = 0;
    for (const c of cases.sort((a, b) => a.id - b.id)) {
      if (!c.confirm) continue;
      const qrDataUrl = await QRCode.toDataURL(String(c.confirm.qrCode), { margin: 1, width: 300 });

      const tva = Number(c.submit.vab || 0) + Number(c.submit.vad || 0);
      const aibAmount = Number(c.submit.aib || 0);
      const totalTTC = Number(c.submit.total || 0);
      const totalHT = totalTTC - tva - aibAmount;
      const aibRate = c.payload.aib === 'A' ? 1 : c.payload.aib === 'B' ? 5 : undefined;

      const typeMap: Record<string, InvoiceData['invoiceType']> = { FV: 'FV', FA: 'AV', EV: 'FV_EXPORT', EA: 'AV_EXPORT' };
      const data: InvoiceData = {
        invoiceType: typeMap[c.type] || 'FV',
        invoiceNumber: `FAC-2026-${String(1000 + c.id).padStart(5, '0')}`,
        date: parseDgiDate(c.confirm.dateTime),
        clientName: c.payload.client.name,
        clientAddress: c.payload.client.address || '',
        clientPhone: c.payload.client.contact || '',
        clientIFU: c.payload.client.ifu || undefined,
        aibRate: aibRate as 0 | 1 | 5 | undefined,
        aibAmount,
        items: c.payload.items.map((it) => ({
          description: c.sejour && (it.taxSpecific || 0) > 0 ? `${it.name} (taxe de séjour incluse)` : it.name,
          quantity: it.quantity,
          unitPrice: it.price,
          taxGroup: it.taxGroup,
          specificTax: it.taxSpecific,
        })),
        totalHT,
        tva,
        totalTTC,
        operatorName: 'admin',
        operatorCode: '1',
        emcfCodeMECeFDGI: c.confirm.codeMECeFDGI,
        emcfQrCode: c.confirm.qrCode,
        emcfQrCodeDataUrl: qrDataUrl,
        emcfDateTime: c.confirm.dateTime,
        emcfCounters: c.confirm.counters,
        emcfNim: c.confirm.nim,
        originalInvoiceReference: c.payload.reference || undefined,
      };

      const doc = generateInvoicePDF(data);
      const buf = Buffer.from(doc.output('arraybuffer'));
      fs.writeFileSync(path.join(OUT_DIR, `test-${String(c.id).padStart(2, '0')}.pdf`), buf);
      generated++;
    }
    expect(generated).toBe(20);
  }, 120_000);
});
