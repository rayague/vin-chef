import { useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export interface SecurityBadgeProps {
  emcfCodeMECeFDGI?: string;
  emcfQrCode?: string;
  nim?: string;
  invoiceDate?: string;
  invoiceUid?: string;
  emcfStatus?: string;
  emcfDateTime?: string;
}

const formatMecEfCode = (code?: string) => {
  const raw = String(code || '').replace(/\s+/g, '').trim();
  if (!raw) return '';
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const chunks = clean.match(/.{1,5}/g) || [clean];
  return chunks.join('-');
};

const computeStatus = (emcfStatus?: string, emcfCodeMECeFDGI?: string) => {
  if (emcfCodeMECeFDGI) return { label: 'VALIDE', variant: 'default' as const };
  const s = String(emcfStatus || '').toLowerCase();
  if (!s) return { label: 'EN ATTENTE', variant: 'secondary' as const };
  if (s.includes('confirm')) return { label: 'VALIDE', variant: 'default' as const };
  if (s.includes('reject') || s.includes('error') || s.includes('fail')) return { label: 'ERREUR', variant: 'destructive' as const };
  return { label: 'EN ATTENTE', variant: 'secondary' as const };
};

const makeQrDataUrl = async (value: string) => {
  const v = String(value || '').trim();
  if (!v) return null;
  return QRCode.toDataURL(v, { margin: 1, width: 240 });
};

export default function SecurityBadge(props: SecurityBadgeProps) {
  const { toast } = useToast();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [qrZoomOpen, setQrZoomOpen] = useState(false);

  const formattedCode = useMemo(() => formatMecEfCode(props.emcfCodeMECeFDGI), [props.emcfCodeMECeFDGI]);
  const status = useMemo(() => computeStatus(props.emcfStatus, props.emcfCodeMECeFDGI), [props.emcfStatus, props.emcfCodeMECeFDGI]);

  const ensureQr = async () => {
    if (qrDataUrl || qrError) return;
    try {
      const url = await makeQrDataUrl(String(props.emcfQrCode || ''));
      setQrDataUrl(url);
    } catch {
      setQrError(true);
      setQrDataUrl(null);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copié', description: `${label} copié dans le presse-papiers` });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de copier', variant: 'destructive' });
    }
  };

  return (
    <div className="w-full rounded-lg border p-4 bg-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Sécurité e‑MECeF</div>
          <div className="mt-1 flex flex-wrap gap-2 items-center">
            <Badge variant={status.variant}>{status.label}</Badge>
            {props.nim ? <Badge variant="outline">NIM: {props.nim}</Badge> : null}
            {props.invoiceUid ? <Badge variant="outline">UID: {props.invoiceUid}</Badge> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {props.emcfQrCode ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await ensureQr();
                if (!qrError) setQrZoomOpen(true);
              }}
            >
              Voir QR
            </Button>
          ) : null}
          {formattedCode ? (
            <Button size="sm" variant="outline" onClick={() => copyText(formattedCode, 'Code MECeF')}>
              Copier
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
        <div className="sm:col-span-1">
          <div className="text-xs text-muted-foreground">QR Code</div>
          <div className="mt-2">
            {props.emcfQrCode ? (
              <button
                type="button"
                className="border rounded-md p-2 bg-white"
                onClick={async () => {
                  await ensureQr();
                  if (!qrError) setQrZoomOpen(true);
                }}
              >
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR e‑MECeF" className="w-28 h-28" />
                ) : (
                  <div className="w-28 h-28 flex items-center justify-center text-xs text-muted-foreground">QR</div>
                )}
              </button>
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </div>
        </div>

        <div className="sm:col-span-2">
          <div className="text-xs text-muted-foreground">Code MECeF</div>
          <div className="mt-2 font-mono text-sm break-all">{formattedCode || '—'}</div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Horodatage facture</div>
              <div className="mt-1">{props.invoiceDate || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Horodatage DGI</div>
              <div className="mt-1">{props.emcfDateTime || '—'}</div>
            </div>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Vérification DGI: utilisez le portail e‑MECeF pour contrôler le QR/Code MECeF.
          </div>
        </div>
      </div>

      <Dialog open={qrZoomOpen} onOpenChange={setQrZoomOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code e‑MECeF</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-2 bg-white rounded">
            {qrDataUrl ? <img src={qrDataUrl} alt="QR e‑MECeF" className="w-72 h-72" /> : null}
            {!qrDataUrl && qrError ? <div className="text-sm text-muted-foreground">Impossible de générer le QR</div> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
