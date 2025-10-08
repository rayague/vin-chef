import { describe, it, expect } from 'vitest';
import { filterInvoices, paginate } from '../src/lib/invoiceUtils';
import type { Invoice } from '../src/lib/storage';

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: overrides.id || '1',
  saleId: 's1',
  invoiceNumber: overrides.invoiceNumber || 'FAC-2025-00001',
  date: overrides.date || new Date().toISOString(),
  clientName: overrides.clientName || 'Test Client',
  productName: overrides.productName || 'Test Wine',
  quantity: overrides.quantity ?? 1,
  unitPrice: overrides.unitPrice ?? 1000,
  totalPrice: overrides.totalPrice ?? 1180,
  tva: overrides.tva ?? 180,
});

describe('invoiceUtils', () => {
  it('filters by search and date', () => {
    const a = makeInvoice({ invoiceNumber: 'FAC-2025-00001', clientName: 'Alpha', productName: 'Red' , date: '2025-01-10'});
    const b = makeInvoice({ id: '2', invoiceNumber: 'FAC-2025-00002', clientName: 'Bravo', productName: 'White', date: '2025-03-15'});
    const c = makeInvoice({ id: '3', invoiceNumber: 'FAC-2025-00003', clientName: 'Charlie', productName: 'Sparkling', date: '2025-05-20'});

    // text search
    const res1 = filterInvoices([a, b, c], { search: 'bravo' });
    expect(res1).toHaveLength(1);
    expect(res1[0].clientName).toBe('Bravo');

    // date range
    const res2 = filterInvoices([a, b, c], { fromDate: '2025-03-01', toDate: '2025-04-01' });
    expect(res2).toHaveLength(1);
    expect(res2[0].clientName).toBe('Bravo');
  });

  it('paginates correctly and clamps pages', () => {
    const items = Array.from({ length: 12 }).map((_, i) => makeInvoice({ id: String(i + 1), invoiceNumber: `FAC-2025-${String(i + 1).padStart(5, '0')}` }));
    const p1 = paginate(items, 1, 5);
    expect(p1.total).toBe(12);
    expect(p1.totalPages).toBe(3);
    expect(p1.currentPage).toBe(1);
    expect(p1.items).toHaveLength(5);

    const p3 = paginate(items, 3, 5);
    expect(p3.currentPage).toBe(3);
    expect(p3.items).toHaveLength(2);

    // request page 0 -> clamp to 1
    const p0 = paginate(items, 0, 5);
    expect(p0.currentPage).toBe(1);

    // request page beyond -> clamp to last
    const p999 = paginate(items, 999, 5);
    expect(p999.currentPage).toBe(3);
  });
});
