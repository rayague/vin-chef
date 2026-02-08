import QRCode from 'qrcode';

type CacheEntry = { dataUrl: string; timestamp: number };

class QRCodeCache {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  private cleanup(now = Date.now()): void {
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) this.cache.delete(key);
    }
  }

  async getDataUrl(value: string, opts?: QRCode.QRCodeToDataURLOptions): Promise<string> {
    const key = String(value || '').trim();
    if (!key) throw new Error('QR value is empty');

    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.timestamp <= this.ttlMs) {
      return cached.dataUrl;
    }

    const dataUrl = await QRCode.toDataURL(key, {
      margin: 1,
      width: 300,
      ...(opts || {}),
    });

    this.cache.set(key, { dataUrl, timestamp: now });
    this.cleanup(now);
    return dataUrl;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const qrCodeCache = new QRCodeCache();
export type { QRCodeCache };
