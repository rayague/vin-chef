import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('qrcode', () => {
  return {
    default: {
      toDataURL: vi.fn(async (text: string) => `data:image/png;base64,${text}`),
    },
  };
});

describe('qrCodeCache', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('Mise en cache et récupération (même valeur)', async () => {
    const { qrCodeCache } = await import('../../src/lib/qr-cache');

    qrCodeCache.clear();

    const r1 = await qrCodeCache.getDataUrl('TEST_QR_DATA');
    const r2 = await qrCodeCache.getDataUrl('TEST_QR_DATA');

    expect(r1).toBe(r2);
    expect(r1).toContain('data:image/png');
  });

  it('Regénère quand expiré (TTL)', async () => {
    const { qrCodeCache } = await import('../../src/lib/qr-cache');
    const QRCode = (await import('qrcode')).default as unknown as { toDataURL: ReturnType<typeof vi.fn> };

    qrCodeCache.clear();

    const realNow = Date.now;
    try {
      // 1) first gen
      Date.now = () => 0;
      const r1 = await qrCodeCache.getDataUrl('X');

      // 2) force expiration by jumping > 1h
      Date.now = () => 2 * 60 * 60 * 1000;
      const r2 = await qrCodeCache.getDataUrl('X');

      expect(QRCode.toDataURL).toHaveBeenCalledTimes(2);
      expect(r2).toContain('data:image/png');
    } finally {
      Date.now = realNow;
    }
  });

  it('Refuse une valeur vide', async () => {
    const { qrCodeCache } = await import('../../src/lib/qr-cache');

    await expect(qrCodeCache.getDataUrl('')).rejects.toThrow('QR value is empty');
  });
});
