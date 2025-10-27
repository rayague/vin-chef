/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Import the CommonJS DB module using require for simplicity in tests
const dbModule = require('../../electron/db.cjs');

function makeAppMock(tmpDir: string) {
  return {
    getPath: (_k: string) => tmpDir,
  } as { getPath: (k: string) => string };
}

describe('createSaleWithInvoice transactional behavior', () => {
  const tmp = path.join(__dirname, 'tmp-db-' + Date.now());
  let api: any;

  beforeEach(() => {
    if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
    // remove any existing db file
    const dbFile = path.join(tmp, 'vin-chef', 'data.sqlite');
    if (fs.existsSync(dbFile)) try { fs.unlinkSync(dbFile); } catch { /* noop */ }
    api = dbModule.init(makeAppMock(tmp));
  });

  it('inserts sale and invoice atomically and decrements stock', async () => {
    const now = new Date().toISOString();
    const product: any = { id: 'p-test', name: 'Test', category: 'T', unit_price: 1000, stock_quantity: 10, description: 't', created_at: now };
    api.addProduct(product);

    const sale: any = { id: 's-test', productId: 'p-test', clientId: null, quantity: 2, unitPrice: 1000, totalPrice: 2000, date: now, invoiceId: null, createdBy: '1' };
    const invoice: any = { id: 'i-test', invoiceNumber: api.getNextInvoiceNumber(), saleId: null, date: now, clientSnapshot: null, productSnapshot: JSON.stringify(product), totalPrice: 2000, tva: 0, ifu: null, immutableFlag: true };

    const res: any = api.createSaleWithInvoice(sale, invoice);
    expect(res.sale.id).toBe('s-test');
    expect(res.invoice.id).toBe('i-test');

    const prod = api.getProducts().find((p: any) => p.id === 'p-test');
    expect(prod.stock_quantity).toBe(8);
  });

  it('rolls back if invoice insert fails', async () => {
    const now = new Date().toISOString();
    const product: any = { id: 'p-bad', name: 'Bad', category: 'T', unit_price: 500, stock_quantity: 5, description: 't', created_at: now };
    api.addProduct(product);

    const sale: any = { id: 's-bad', productId: 'p-bad', clientId: null, quantity: 1, unitPrice: 500, totalPrice: 500, date: now, invoiceId: null, createdBy: '1' };
    const invoice: any = { id: 'i-dup', invoiceNumber: api.getNextInvoiceNumber(), saleId: null, date: now, clientSnapshot: null, productSnapshot: JSON.stringify(product), totalPrice: 500, tva: 0, ifu: null, immutableFlag: true };

    api.createInvoice(invoice);

    let threw = false;
    try {
      api.createSaleWithInvoice(sale, invoice);
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(true);

  const sales: any[] = api.getSales();
    expect(sales.find((s: any) => s.id === 's-bad')).toBeUndefined();

    const prod = api.getProducts().find((p: any) => p.id === 'p-bad');
    expect(prod.stock_quantity).toBe(5);
  });
});
