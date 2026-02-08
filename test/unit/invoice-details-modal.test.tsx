import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import InvoiceDetailsModal from '../../src/pages/InvoiceDetailsModal';

describe('InvoiceDetailsModal Component', () => {
  it('Affiche toutes les sections (articles, totaux, sécurité)', async () => {
    const onOpenChange = () => {};

    render(
      <InvoiceDetailsModal
        open={true}
        onOpenChange={onOpenChange}
        invoice={{
          id: 'i1',
          invoiceNumber: 'FAC-0001',
          date: new Date('2026-02-08T00:00:00.000Z').toISOString(),
          clientName: 'Client A',
          productName: 'Produit',
          quantity: 1,
          unitPrice: 1000,
          tva: 180,
          totalPrice: 1180,
          items: [{ description: 'Produit', quantity: 1, unitPrice: 1000 }],
          emcfStatus: 'confirmed',
          emcfCodeMECeFDGI: 'ABCDE12345',
          emcfQrCode: 'https://dgi.example/qr',
          emcfNim: 'NIM001',
          emcfUid: 'UID001',
          emcfDateTime: '2026-02-08 10:00:00',
        } as any}
      />
    );

    expect(screen.getByText('Détails facture FAC-0001')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Client A')).toBeInTheDocument();

    expect(screen.getByText('Articles')).toBeInTheDocument();
    expect(screen.getByText('Désignation')).toBeInTheDocument();

    expect(screen.getByText('Totaux')).toBeInTheDocument();

    expect(screen.getByText('Sécurité e‑MECeF')).toBeInTheDocument();
  });

  it('Affiche correctement les factures non normalisées', async () => {
    const onOpenChange = () => {};

    render(
      <InvoiceDetailsModal
        open={true}
        onOpenChange={onOpenChange}
        invoice={{
          id: 'i2',
          invoiceNumber: 'FAC-0002',
          date: new Date('2026-02-08T00:00:00.000Z').toISOString(),
          clientName: 'Client B',
          productName: 'Produit',
          quantity: 1,
          unitPrice: 1000,
          tva: 0,
          totalPrice: 1000,
          items: [{ description: 'Produit', quantity: 1, unitPrice: 1000 }],
        } as any}
      />
    );

    expect(screen.getByText('Sécurité e‑MECeF')).toBeInTheDocument();
    expect(screen.getByText('EN ATTENTE')).toBeInTheDocument();
  });

  it('Boutons Prévisualiser et Télécharger fonctionnels', async () => {
    const user = userEvent.setup();
    const onPreview = () => {};
    const onDownload = () => {};

    const spyPreview = vi.fn(onPreview);
    const spyDownload = vi.fn(onDownload);

    render(
      <InvoiceDetailsModal
        open={true}
        onOpenChange={() => {}}
        invoice={{
          id: 'i3',
          invoiceNumber: 'FAC-0003',
          date: new Date('2026-02-08T00:00:00.000Z').toISOString(),
          clientName: 'Client C',
          productName: 'Produit',
          quantity: 1,
          unitPrice: 1000,
          tva: 180,
          totalPrice: 1180,
          items: [{ description: 'Produit', quantity: 1, unitPrice: 1000 }],
        } as any}
        onPreview={spyPreview}
        onDownload={spyDownload}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Prévisualiser' }));
    expect(spyPreview).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Télécharger PDF' }));
    expect(spyDownload).toHaveBeenCalledTimes(1);
  });

  it('Modal se ferme correctement', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <InvoiceDetailsModal
        open={true}
        onOpenChange={onOpenChange}
        invoice={{
          id: 'i4',
          invoiceNumber: 'FAC-0004',
          date: new Date('2026-02-08T00:00:00.000Z').toISOString(),
          clientName: 'Client D',
          productName: 'Produit',
          quantity: 1,
          unitPrice: 1000,
          tva: 180,
          totalPrice: 1180,
          items: [{ description: 'Produit', quantity: 1, unitPrice: 1000 }],
        } as any}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Chargement rapide (< 100ms)', async () => {
    const t0 = performance.now();

    render(
      <InvoiceDetailsModal
        open={true}
        onOpenChange={() => {}}
        invoice={{
          id: 'i5',
          invoiceNumber: 'FAC-0005',
          date: new Date('2026-02-08T00:00:00.000Z').toISOString(),
          clientName: 'Client E',
          productName: 'Produit',
          quantity: 1,
          unitPrice: 1000,
          tva: 180,
          totalPrice: 1180,
          items: [{ description: 'Produit', quantity: 1, unitPrice: 1000 }],
        } as any}
      />
    );

    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(100);
  });
});
