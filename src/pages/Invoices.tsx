import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import db from '@/lib/db';
import { Invoice } from '@/lib/storage';
import { generateInvoicePDF, downloadInvoice, getInvoiceLogoDataUrl } from '@/lib/pdf';
import { ArrowLeft, Eye, Download, Search } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import InvoiceDetailsModal from '@/pages/InvoiceDetailsModal';
import LoadingSpinner from '@/components/LoadingSpinner';
import { qrCodeCache } from '@/lib/qr-cache';

const Invoices = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [gotoPageInput, setGotoPageInput] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsInvoice, setDetailsInvoice] = useState<Invoice | null>(null);
  const [isGeneratingPdfId, setIsGeneratingPdfId] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    try {
      const list = await db.getInvoices();
      setInvoices(list as Invoice[]);
    } catch {
      setInvoices([]);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    void loadInvoices();

    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail as { entity: string } | undefined;
        if (!detail) return;
        if (
          detail.entity === 'invoices' ||
          detail.entity === 'sales' ||
          detail.entity === 'clients' ||
          detail.entity === 'products'
        ) {
          void loadInvoices();
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('vinchef:data-changed', handler as EventListener);
    return () => window.removeEventListener('vinchef:data-changed', handler as EventListener);
  }, [user, navigate, loadInvoices]);

  // Derived filtered + paginated data
  const filtered = invoices.filter(inv => {
    // Date filter
    const invDate = new Date(inv.date);
    if (fromDate) {
      const f = new Date(fromDate + 'T00:00:00');
      if (invDate < f) return false;
    }
    if (toDate) {
      const t = new Date(toDate + 'T23:59:59');
      if (invDate > t) return false;
    }

    // Text search over invoiceNumber, clientName, productName
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.clientName.toLowerCase().includes(q) ||
      inv.productName.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handlePreview = async (invoice: Invoice) => {
    const anyInv = invoice as unknown as Invoice & {
      items?: Array<{ description: string; quantity: number; unitPrice: number; discount?: number }>;
      clientIFU?: string;
      tvaRate?: number;
      clientAddress?: string;
      clientPhone?: string;
      emcfStatus?: string;
      emcfCodeMECeFDGI?: string;
      emcfQrCode?: string;
      emcfDateTime?: string;
      emcfCounters?: string;
      emcfNim?: string;
    };

    let emcfQrCodeDataUrl: string | undefined;
    if (anyInv.emcfQrCode) {
      console.log('Facture', invoice.invoiceNumber, 'emcfQrCode present:', anyInv.emcfQrCode);
      try {
        setIsGeneratingPdfId(String(invoice.id));
        emcfQrCodeDataUrl = await qrCodeCache.getDataUrl(String(anyInv.emcfQrCode), { margin: 1, width: 300 });
        console.log('QR dataURL generated, length:', emcfQrCodeDataUrl.length);
      } catch {
        console.warn('Failed to generate QR dataURL for', invoice.invoiceNumber);
        emcfQrCodeDataUrl = undefined;
      } finally {
        setIsGeneratingPdfId(null);
      }
    } else {
      console.log('Facture', invoice.invoiceNumber, 'NO emcfQrCode field');
    }

    const logoDataUrl = await getInvoiceLogoDataUrl();
    const doc = generateInvoicePDF({
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      clientName: invoice.clientName,
      clientAddress: anyInv.clientAddress || '',
      clientPhone: anyInv.clientPhone || '',
      clientIFU: anyInv.clientIFU || undefined,
      tvaRate: anyInv.tvaRate || undefined,
      items: anyInv.items && anyInv.items.length > 0 ? anyInv.items : undefined,
      productName: invoice.productName,
      quantity: invoice.quantity,
      unitPrice: invoice.unitPrice,
      totalHT: invoice.totalPrice - invoice.tva,
      tva: invoice.tva,
      totalTTC: invoice.totalPrice,
      logoDataUrl: logoDataUrl || undefined,
      emcfCodeMECeFDGI: anyInv.emcfCodeMECeFDGI,
      emcfQrCode: anyInv.emcfQrCode,
      emcfQrCodeDataUrl,
      emcfDateTime: anyInv.emcfDateTime,
      emcfCounters: anyInv.emcfCounters,
      emcfNim: anyInv.emcfNim,
    });
  // Open PDF in new tab
  const url = (doc as unknown as { output: (format: string) => string }).output('bloburl');
  window.open(url, '_blank');
  };

  const handleDownload = async (invoice: Invoice) => {
    const anyInv = invoice as unknown as Invoice & {
      items?: Array<{ description: string; quantity: number; unitPrice: number; discount?: number }>;
      clientIFU?: string;
      tvaRate?: number;
      clientAddress?: string;
      clientPhone?: string;
      emcfCodeMECeFDGI?: string;
      emcfQrCode?: string;
      emcfDateTime?: string;
      emcfCounters?: string;
      emcfNim?: string;
    };

    let emcfQrCodeDataUrl: string | undefined;
    if (anyInv.emcfQrCode) {
      try {
        setIsGeneratingPdfId(String(invoice.id));
        emcfQrCodeDataUrl = await qrCodeCache.getDataUrl(String(anyInv.emcfQrCode), { margin: 1, width: 300 });
      } catch {
        emcfQrCodeDataUrl = undefined;
      } finally {
        setIsGeneratingPdfId(null);
      }
    }

    const logoDataUrl = await getInvoiceLogoDataUrl();
    const doc = generateInvoicePDF({
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      clientName: invoice.clientName,
      clientAddress: anyInv.clientAddress || '',
      clientPhone: anyInv.clientPhone || '',
      clientIFU: anyInv.clientIFU || undefined,
      tvaRate: anyInv.tvaRate || undefined,
      items: anyInv.items && anyInv.items.length > 0 ? anyInv.items : undefined,
      productName: invoice.productName,
      quantity: invoice.quantity,
      unitPrice: invoice.unitPrice,
      totalHT: invoice.totalPrice - invoice.tva,
      tva: invoice.tva,
      totalTTC: invoice.totalPrice,
      logoDataUrl: logoDataUrl || undefined,
      emcfCodeMECeFDGI: anyInv.emcfCodeMECeFDGI,
      emcfQrCode: anyInv.emcfQrCode,
      emcfQrCodeDataUrl,
      emcfDateTime: anyInv.emcfDateTime,
      emcfCounters: anyInv.emcfCounters,
      emcfNim: anyInv.emcfNim,
    });
    downloadInvoice(invoice.invoiceNumber, doc);
  };

  const openDetails = (invoice: Invoice) => {
    setDetailsInvoice(invoice);
    setDetailsOpen(true);
  };

  return (
    <PageContainer>
      <PageHeader title="Factures" subtitle="Liste des factures et téléchargements" actions={
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
      } />

      <Card>
        <CardHeader>
          <CardTitle>Liste des Factures</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label htmlFor="searchInput">Recherche</Label>
              <Input id="searchInput" placeholder="N° facture, client, produit" aria-label="Recherche des factures" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>

            <div className="flex gap-2" role="group" aria-labelledby="date-filter-label">
              <div>
                <Label htmlFor="fromDate">Du</Label>
                <Input id="fromDate" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
              </div>
              <div>
                <Label htmlFor="toDate">Au</Label>
                <Input id="toDate" type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
              </div>
            </div>

            <div className="flex justify-end items-center gap-2">
              <Label htmlFor="pageSizeSelect">Par page</Label>
              <select id="pageSizeSelect" aria-label="Nombre de factures par page" value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(1); }} className="rounded border px-2 py-1">
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
              </select>
            </div>
          </div>
          {invoices.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° Facture</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>e-MCF</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody role="rowgroup">
                    {paged.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono">{inv.invoiceNumber}</TableCell>
                        <TableCell>{format(new Date(inv.date), 'dd/MM/yyyy', { locale: fr })}</TableCell>
                        <TableCell>{inv.clientName}</TableCell>
                        <TableCell>
                          {(() => {
                            const anyInv = inv as unknown as Invoice & { emcfStatus?: string; emcfCodeMECeFDGI?: string };
                            if (!anyInv.emcfStatus && !anyInv.emcfCodeMECeFDGI) return <Badge variant="outline">—</Badge>;
                            if (anyInv.emcfCodeMECeFDGI) return <Badge>{anyInv.emcfCodeMECeFDGI}</Badge>;
                            return <Badge variant="secondary">{anyInv.emcfStatus}</Badge>;
                          })()}
                        </TableCell>
                        <TableCell className="font-semibold">{inv.totalPrice.toLocaleString('fr-FR')} FCFA</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            {isGeneratingPdfId === String(inv.id) ? <LoadingSpinner size="sm" message="Génération PDF..." /> : null}
                            <Button size="sm" variant="ghost" onClick={() => openDetails(inv)} aria-label={`Détails de la facture ${inv.invoiceNumber}`}>
                              <Search className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handlePreview(inv)} aria-label={`Prévisualiser la facture ${inv.invoiceNumber}`} disabled={isGeneratingPdfId !== null}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleDownload(inv)} aria-label={`Télécharger la facture ${inv.invoiceNumber}`} disabled={isGeneratingPdfId !== null}>
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center py-12 text-muted-foreground">Aucune facture disponible</p>
            )}
          {/* Pagination */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div id="invoices-summary" className="text-sm text-muted-foreground" aria-live="polite">Affichage {filtered.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filtered.length)} sur {filtered.length}</div>

            <div className="flex items-center gap-2" role="navigation" aria-label="Pagination des factures">
              <div
                className="inline-flex rounded-md overflow-hidden border bg-card"
                aria-hidden={false}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                    e.preventDefault();
                    setPage((p) => Math.max(1, p - 1));
                  } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                    e.preventDefault();
                    setPage((p) => Math.min(totalPages, p + 1));
                  }
                }}
              >
                <Button size="sm" variant="outline" onClick={() => setPage(1)} disabled={currentPage === 1} aria-label="Aller au début" className="rounded-none first:rounded-l-md last:rounded-r-md px-3 py-1 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary/60">« Début</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Page précédente" className="rounded-none px-3 py-1 border-l focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary/60">Précédent</Button>
                <div className="px-4 py-1 flex items-center" aria-hidden>{currentPage} / {totalPages}</div>
                <Button size="sm" variant="outline" onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Page suivante" className="rounded-none px-3 py-1 border-l focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary/60">Suivant</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(totalPages)} disabled={currentPage === totalPages} aria-label="Aller à la fin" className="rounded-none border-l last:rounded-r-md px-3 py-1 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary/60">Fin »</Button>
              </div>
              {/* Go-to-page control */}
              <div className="ml-2 flex items-center gap-2">
                <label htmlFor="gotoPage" className="sr-only">Aller à la page</label>
                <input
                  id="gotoPage"
                  aria-label="Aller à la page"
                  type="number"
                  min={1}
                  max={totalPages}
                  value={gotoPageInput}
                  onChange={(e) => setGotoPageInput(e.target.value)}
                  className="w-20 rounded border px-2 py-1 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const v = Math.max(1, Math.min(totalPages, Number(gotoPageInput || 1)));
                      setPage(v);
                      setGotoPageInput('');
                    }
                  }}
                />
                <Button size="sm" variant="ghost" onClick={() => {
                  const v = Math.max(1, Math.min(totalPages, Number(gotoPageInput || 1)));
                  setPage(v);
                  setGotoPageInput('');
                }}>Aller</Button>
              </div>
            </div>
          </div>
          </CardContent>
        </Card>

      <InvoiceDetailsModal
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setDetailsInvoice(null);
        }}
        invoice={detailsInvoice as unknown as (Invoice & { items?: Array<{ description?: string; name?: string; quantity: number; unitPrice: number; discount?: number }>; clientAddress?: string; clientPhone?: string; }) | null}
        onPreview={handlePreview}
        onDownload={handleDownload}
      />
    </PageContainer>
  );
};

export default Invoices;
