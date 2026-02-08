import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SecurityBadge from '@/components/SecurityBadge';
import { Invoice } from '@/lib/storage';

type InvoiceWithExtras = Invoice & {
  items?: Array<{ description?: string; name?: string; quantity: number; unitPrice: number; discount?: number }>;
  clientAddress?: string;
  clientPhone?: string;
};

export interface InvoiceDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceWithExtras | null;
  onPreview?: (invoice: Invoice) => void;
  onDownload?: (invoice: Invoice) => void;
}

export default function InvoiceDetailsModal({ open, onOpenChange, invoice, onPreview, onDownload }: InvoiceDetailsModalProps) {
  if (!invoice) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Détails facture</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">Aucune facture sélectionnée</div>
        </DialogContent>
      </Dialog>
    );
  }

  const invAny = invoice as unknown as Invoice & {
    emcfUid?: string;
    emcfStatus?: string;
    emcfCodeMECeFDGI?: string;
    emcfQrCode?: string;
    emcfDateTime?: string;
    emcfCounters?: unknown;
    emcfNim?: string;
  };

  const items = invoice.items && invoice.items.length > 0
    ? invoice.items
    : [{ description: invoice.productName, quantity: invoice.quantity, unitPrice: invoice.unitPrice }];

  const invoiceDate = format(new Date(invoice.date), 'dd/MM/yyyy', { locale: fr });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Détails facture {invoice.invoiceNumber}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <div className="text-sm">
              <div className="font-semibold">Client</div>
              <div className="text-muted-foreground">{invoice.clientName}</div>
              {invoice.clientIFU ? <div className="text-muted-foreground">IFU: {invoice.clientIFU}</div> : null}
              {(invoice as InvoiceWithExtras).clientPhone ? <div className="text-muted-foreground">Tél: {(invoice as InvoiceWithExtras).clientPhone}</div> : null}
            </div>
          </div>
          <div>
            <div className="text-sm">
              <div className="font-semibold">Infos</div>
              <div className="text-muted-foreground">Date: {invoiceDate}</div>
              <div className="text-muted-foreground">Total: {invoice.totalPrice.toLocaleString('fr-FR')} FCFA</div>
              {invAny.emcfStatus ? <div className="mt-2"><Badge variant="secondary">e‑MCF: {invAny.emcfStatus}</Badge></div> : null}
            </div>
          </div>
        </div>

        <div className="mt-2">
          <div className="text-sm font-semibold mb-2">Articles</div>
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Qté</TableHead>
                  <TableHead className="text-right">P.U</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, idx) => {
                  const desc = it.description || it.name || '-';
                  const total = (it.unitPrice || 0) * (it.quantity || 0) - (it.discount || 0);
                  return (
                    <TableRow key={idx}>
                      <TableCell>{desc}</TableCell>
                      <TableCell>{it.quantity}</TableCell>
                      <TableCell className="text-right">{(it.unitPrice || 0).toLocaleString('fr-FR')} FCFA</TableCell>
                      <TableCell className="text-right">{total.toLocaleString('fr-FR')} FCFA</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <SecurityBadge
              emcfCodeMECeFDGI={invAny.emcfCodeMECeFDGI}
              emcfQrCode={invAny.emcfQrCode}
              nim={invAny.emcfNim}
              invoiceDate={invoiceDate}
              invoiceUid={invAny.emcfUid}
              emcfStatus={invAny.emcfStatus}
              emcfDateTime={invAny.emcfDateTime}
            />
          </div>
          <div className="border rounded-lg p-4 bg-card">
            <div className="text-sm font-semibold">Totaux</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">HT</div>
              <div className="text-right">{(invoice.totalPrice - invoice.tva).toLocaleString('fr-FR')} FCFA</div>
              <div className="text-muted-foreground">TVA</div>
              <div className="text-right">{invoice.tva.toLocaleString('fr-FR')} FCFA</div>
              <div className="font-semibold">TTC</div>
              <div className="text-right font-semibold">{invoice.totalPrice.toLocaleString('fr-FR')} FCFA</div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {onPreview ? (
            <Button variant="ghost" onClick={() => onPreview(invoice)}>
              Prévisualiser
            </Button>
          ) : null}
          {onDownload ? (
            <Button variant="outline" onClick={() => onDownload(invoice)}>
              Télécharger PDF
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
