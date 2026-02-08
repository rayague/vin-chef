import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SecurityBadge from '../../src/components/SecurityBadge';

vi.mock('../../src/hooks/use-toast', () => {
  return {
    useToast: () => ({ toast: vi.fn() }),
  };
});

vi.mock('qrcode', () => {
  return {
    default: {
      toDataURL: vi.fn(async () => 'data:image/png;base64,FAKE'),
    },
  };
});

describe('SecurityBadge Component', () => {
  beforeEach(() => {
    // @ts-expect-error: test clipboard mock
    global.navigator = global.navigator || ({} as any);
    // @ts-expect-error: test clipboard mock
    global.navigator.clipboard = { writeText: vi.fn(async () => {}) };
  });

  it('Affiche QR, code MECeF et bouton copier quand valide', async () => {
    render(
      <SecurityBadge
        emcfCodeMECeFDGI="ABCDE12345FGHIJ"
        emcfQrCode="https://dgi.example/qr"
        nim="NIM001"
        invoiceUid="UID001"
      />
    );

    expect(screen.getByText('Sécurité e‑MECeF')).toBeInTheDocument();
    expect(screen.getByText('VALIDE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voir QR' })).toBeInTheDocument();

    expect(screen.getByText('ABCDE-12345-FGHIJ')).toBeInTheDocument();
    expect(screen.getByText('NIM: NIM001')).toBeInTheDocument();
    expect(screen.getByText('UID: UID001')).toBeInTheDocument();
  });

  it('Affiche badge "EN ATTENTE" sans QR', async () => {
    render(<SecurityBadge />);

    expect(screen.getByText('EN ATTENTE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir QR' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copier' })).toBeNull();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('Affiche badge "ERREUR" avec message approprié', async () => {
    render(<SecurityBadge emcfStatus="ERROR_INVALID" />);

    expect(screen.getByText('ERREUR')).toBeInTheDocument();
  });

  it('Bouton copier fonctionnel', async () => {
    const user = userEvent.setup();

    render(<SecurityBadge emcfCodeMECeFDGI="ABCDE12345" />);

    await user.click(screen.getByRole('button', { name: 'Copier' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABCDE-12345');
  });

  it("Zoom QR Code s'ouvre au clic", async () => {
    const user = userEvent.setup();

    render(<SecurityBadge emcfQrCode="https://dgi.example/qr" />);

    await user.click(screen.getByRole('button', { name: 'Voir QR' }));

    expect(await screen.findByText('QR Code e‑MECeF')).toBeInTheDocument();
    expect(await screen.findByAltText('QR e‑MECeF')).toBeInTheDocument();
  });

  it('Code MECeF formaté en groupes de 5', async () => {
    render(<SecurityBadge emcfCodeMECeFDGI="ab cd-e12_345" />);

    expect(screen.getByText('ABCDE-12345')).toBeInTheDocument();
  });
});
