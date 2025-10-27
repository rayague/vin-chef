/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import db from '../../src/lib/db';
import { initializeDemoData, getProducts, getClients } from '../../src/lib/storage';

beforeEach(() => {
  initializeDemoData(true);
});

describe('createSaleWithInvoice fallback (storage)', () => {
  it('adds sale + invoice and decrements product stock using fallback', async () => {
    const products = getProducts();
    expect(products.length).toBeGreaterThan(0);
    const product = products[0];
    const initialStock = product.stockQuantity;

    const clients = getClients();
    const client = clients[0];

    const sale = {
      id: 'fb-sale-1',
      productId: product.id,
      clientId: client.id,
      quantity: 1,
      unitPrice: product.unitPrice,
      totalPrice: product.unitPrice,
      date: new Date().toISOString(),
      invoiceNumber: 'FB-1',
    };

    const invoice = {
      id: 'fb-inv-1',
      saleId: sale.id,
      invoiceNumber: sale.invoiceNumber,
      date: sale.date,
      clientName: client.name,
      productName: product.name,
      quantity: sale.quantity,
      unitPrice: sale.unitPrice,
      totalPrice: sale.totalPrice,
      tva: 0,
    };

    await db.createSaleWithInvoice(sale, invoice);

    const sales = await db.getSales();
    const invs = await db.getInvoices();

    expect(sales.find((s: any) => s.id === sale.id)).toBeDefined();
    expect(invs.find((i: any) => i.id === invoice.id)).toBeDefined();

    const updatedProducts = getProducts();
    const updatedProduct = updatedProducts.find((p: any) => p.id === product.id)!;
    expect(updatedProduct.stockQuantity).toBe(initialStock - sale.quantity);
  });
});
 
