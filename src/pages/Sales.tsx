import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Sale, Product, Client, Invoice } from '@/lib/storage';
import db from '@/lib/db';
import logger from '@/lib/logger';
import emcf, { EmcfPointOfSaleSummary } from '@/lib/emcf';
import { Plus, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';

const Sales = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [users, setUsers] = useState<{ id: string; username: string }[]>([]);
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [normalizeWithEmcf, setNormalizeWithEmcf] = useState(false);
  const [emcfActivePos, setEmcfActivePos] = useState<EmcfPointOfSaleSummary | null>(null);

  const [emcfPending, setEmcfPending] = useState<null | {
    uid: string;
    submittedAt: string;
    expiresAtMs: number;
    posId: string;
    statusResponse: unknown;
    invoiceResponse: unknown;
    client: Client;
    validItems: Array<{ productId: string; quantity: number; discount?: number; discountType: 'percentage' | 'fixed' }>;
    itemsPayload: Array<{ description: string; quantity: number; unitPrice: number; discount?: number }>;
    totals: { totalHT: number; tva: number; totalTTC: number; totalDiscount: number };
    emcfPayload: unknown;
  }>(null);
  const [emcfSecondsLeft, setEmcfSecondsLeft] = useState<number>(0);

  const [formData, setFormData] = useState({
    clientId: '',
    invoiceType: 'FV' as NonNullable<Invoice['invoiceType']>,
    originalInvoiceReference: '',
    aibRateOverride: '' as '' | '0' | '1' | '5',
  });

  const [items, setItems] = useState<Array<{ productId: string; quantity: string; discount: string; discountType: 'percentage' | 'fixed' }>>([
    { productId: '', quantity: '1', discount: '', discountType: 'percentage' },
  ]);

  const location = useLocation();

  const loadData = useCallback(async () => {
    const [s, p, c, u, inv] = await Promise.all([db.getSales(), db.getProducts(), db.getClients(), db.getUsers(), db.getInvoices()]);
    const allSales = s as Sale[];
    const visibleSales = (user && user.role !== 'admin') ? allSales.filter(sale => (sale as unknown as Sale).createdBy === user.id) : allSales;
    setSales(visibleSales);
    setProducts(p as Product[]);
    setClients(c as Client[]);
    setUsers((u as unknown as { id: string; username: string }[]) || []);
    setInvoices((inv as Invoice[]) || []);
  }, [user]);

  const taxGroupToTvaRate = (g: NonNullable<Product['taxGroup']>): number => {
    if (g === 'B') return 18;
    if (g === 'C') return 10;
    if (g === 'D') return 5;
    if (g === 'A') return 0;
    if (g === 'E') return 0;
    if (g === 'EXPORT') return 0;
    return 18;
  };

  const parseAibRate = (v: string): 0 | 1 | 5 => {
    if (v === '1') return 1;
    if (v === '5') return 5;
    return 0;
  };

  const parseMoney = (v: unknown): number => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const s = String(v ?? '').trim();
    if (!s) return NaN;
    const cleaned = s
      .replace(/[\s\u00A0\u202F]/g, '')
      .replace(/[^0-9,.-]/g, '')
      .replace(/,(?=\d{1,2}$)/, '.')
      .replace(/,/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadData();

    (async () => {
      try {
        if (!emcf.isAvailable()) {
          setEmcfActivePos(null);
          return;
        }
        const pos = await emcf.getActivePointOfSale();
        setEmcfActivePos(pos);
      } catch (err) {
        setEmcfActivePos(null);
      }
    })();

    // If navigated with a clientId in state, prefill and open the dialog
    const state = (location && (location as unknown as { state?: { clientId?: string } }).state) || undefined;
    const clientIdFromState = state?.clientId;
    if (clientIdFromState) {
      setFormData(prev => ({ ...prev, clientId: clientIdFromState }));
      setIsDialogOpen(true);
    }
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail as { entity: string } | undefined;
        if (!detail) return;
        if (detail.entity === 'products' || detail.entity === 'clients' || detail.entity === 'sales') loadData();
      } catch (e) {
        // ignore
      }
    };
    window.addEventListener('vinchef:data-changed', handler as EventListener);
    return () => window.removeEventListener('vinchef:data-changed', handler as EventListener);
  }, [user, navigate, location, loadData]);

  useEffect(() => {
    if (!emcfPending) {
      setEmcfSecondsLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((emcfPending.expiresAtMs - Date.now()) / 1000));
      setEmcfSecondsLeft(left);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [emcfPending]);

  // Auto-fill discount when client selection changes
  useEffect(() => {
    if (!formData.clientId) return;
    const client = clients.find(c => c.id === formData.clientId);
    if (!client) return;
    const anyClient = client as unknown as { discount?: number; discountType?: 'percentage' | 'fixed' };
    // If client has a default discount, apply it to every existing item as a suggested value
    if (anyClient.discount !== undefined && anyClient.discount !== null) {
      setItems(prev => prev.map(it => ({ ...it, discount: String(anyClient.discount), discountType: anyClient.discountType || 'percentage' })));
    }
  }, [formData.clientId, clients]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate basic client and items
    if (!formData.clientId) {
      toast({ title: 'Erreur', description: 'Veuillez sélectionner un client', variant: 'destructive' });
      return;
    }
    const client = clients.find(c => c.id === formData.clientId);
    if (!client) return;

    // Validate items
    const validItems = items.filter(it => it.productId && parseInt(it.quantity) > 0);
    if (validItems.length === 0) {
      toast({ title: 'Erreur', description: 'Veuillez ajouter au moins un produit', variant: 'destructive' });
      return;
    }

    // Check stock for each
    for (const it of validItems) {
      const prod = products.find(p => p.id === it.productId);
      const q = parseInt(it.quantity);
      if (!prod) {
        toast({ title: 'Erreur', description: 'Produit introuvable', variant: 'destructive' });
        return;
      }
      if (prod.stockQuantity < q) {
        toast({ title: 'Erreur', description: `Stock insuffisant pour ${prod.name}`, variant: 'destructive' });
        return;
      }
    }

    const invoiceType = formData.invoiceType;
    const isAvoir = invoiceType === 'AV' || invoiceType === 'AV_EXPORT';
    const isExport = invoiceType === 'FV_EXPORT' || invoiceType === 'AV_EXPORT';

    if (isAvoir) {
      const ref = String(formData.originalInvoiceReference || '').trim();
      if (!ref) {
        toast({ title: 'Erreur', description: 'Référence facture originale requise pour un avoir', variant: 'destructive' });
        return;
      }

      const exists = invoices.some((inv) => {
        const anyInv = inv as unknown as Invoice & { emcfUid?: string; emcfCodeMECeFDGI?: string };
        const code = String(anyInv.emcfCodeMECeFDGI || '').replace(/-/g, '').trim();
        const uid = String(anyInv.emcfUid || '').trim();
        return ref === uid || ref === code || ref === anyInv.emcfCodeMECeFDGI;
      });
      if (!exists) {
        toast({ title: 'Erreur', description: "Référence inconnue (la facture originale doit exister et être normalisée)", variant: 'destructive' });
        return;
      }
    }

    // compute totals (renderer, for UX only; main process will remain source of truth later)
    let totalHT = 0;
    let totalDiscount = 0;
    let totalVat = 0;
    const itemsPayload: Array<{ description: string; quantity: number; unitPrice: number; discount?: number }> = [];
    const normalizedItems: Array<{ productId: string; quantity: number; discount?: number; discountType: 'percentage' | 'fixed' }> = [];
    for (const it of validItems) {
      const prod = products.find(p => p.id === it.productId)!;
      const q = Number.parseInt(String(it.quantity), 10);
      const unit = parseMoney((prod as unknown as { unitPrice?: unknown }).unitPrice);

      if (!Number.isFinite(q) || q <= 0) {
        toast({ title: 'Erreur', description: 'Quantité invalide', variant: 'destructive' });
        return;
      }

      if (!Number.isFinite(unit) || unit < 0) {
        toast({ title: 'Erreur', description: `Prix unitaire invalide pour ${prod.name}`, variant: 'destructive' });
        return;
      }

      let discountAmount = 0;
      const d = Number.parseFloat(String(it.discount || '')) || 0;
      if (d > 0) {
        if (it.discountType === 'percentage') discountAmount = (unit * q * d) / 100;
        else discountAmount = d * q;
      }
      const lineTotalHT = unit * q - discountAmount;
      totalHT += lineTotalHT;
      totalDiscount += discountAmount;

      const g = ((prod as unknown as Product).taxGroup || (isExport ? 'EXPORT' : 'B')) as NonNullable<Product['taxGroup']>;
      const rate = Number((prod as unknown as Product).tvaRate ?? taxGroupToTvaRate(g));
      const lineVat = Math.round(lineTotalHT * (rate / 100));
      totalVat += lineVat;

      itemsPayload.push({ description: prod.name, quantity: q, unitPrice: unit, discount: discountAmount > 0 ? discountAmount : undefined });
      normalizedItems.push({ productId: it.productId, quantity: q, discount: d > 0 ? d : undefined, discountType: it.discountType });
    }

    if (!Number.isFinite(totalHT) || !Number.isFinite(totalDiscount)) {
      toast({ title: 'Erreur', description: 'Montants invalides (vérifie prix, quantité et remise)', variant: 'destructive' });
      return;
    }

    const selectedClient = clients.find(c => c.id === formData.clientId) as (Client | undefined);
    const clientAibRate = selectedClient && selectedClient.aibRegistration ? (selectedClient.aibRate ?? 0) : 0;
    const override = formData.aibRateOverride ? parseAibRate(formData.aibRateOverride) : null;
    const aibRate = (override !== null ? override : clientAibRate) as 0 | 1 | 5;
    const aibAmount = Math.round(totalHT * (aibRate / 100));

    const tva = totalVat;
    const totalTTC = totalHT + tva + aibAmount;

    if (!Number.isFinite(tva) || !Number.isFinite(totalTTC)) {
      toast({ title: 'Erreur', description: 'Montants invalides (TVA/Total)', variant: 'destructive' });
      return;
    }

    const shouldUseEmcf = normalizeWithEmcf && emcf.isAvailable() && !!emcfActivePos;
    if (shouldUseEmcf) {
      setSaving(true);
      try {
        const submittedAt = new Date().toISOString();
        const statusRes = await emcf.status();
        const statusAny = statusRes as unknown as { status?: boolean; ifu?: string; nim?: string; nime?: string };
        if (statusAny.status === false) {
          toast({ title: 'Erreur', description: "e-MCF indisponible", variant: 'destructive' });
          return;
        }
        const vendorIfu = statusAny.ifu;
        if (!vendorIfu) {
          toast({ title: 'Erreur', description: "Impossible de déterminer l'IFU vendeur via e-MCF", variant: 'destructive' });
          return;
        }

        const operatorName = users.find(u => u.id === user?.id)?.username || user?.username || '';

        const emcfItems = normalizedItems.map(it => {
          const prod = products.find(p => p.id === it.productId)!;
          const unit = parseMoney(prod.unitPrice);
          const unitInt = Math.round(unit);

          const d = Number(it.discount || 0);
          let netUnit = unit;
          if (d > 0) {
            if (it.discountType === 'percentage') netUnit = unit * (1 - d / 100);
            else netUnit = unit - d;
          }

          const price = Math.max(0, Math.round(netUnit));

          const taxGroup = ((prod.taxGroup || (isExport ? 'EXPORT' : 'B')) as NonNullable<Product['taxGroup']>);
          return {
            code: prod.id,
            name: prod.name,
            unitPrice: price,
            price,
            quantity: it.quantity,
            taxGroup,
          };
        });

        const totalHTInt = emcfItems.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
        const tvaInt = emcfItems.reduce((s, it) => {
          const g = String((it as unknown as { taxGroup?: string }).taxGroup || 'B').toUpperCase() as NonNullable<Product['taxGroup']>;
          const rate = taxGroupToTvaRate(g);
          return s + Math.round((it.unitPrice * it.quantity) * (rate / 100));
        }, 0);
        const aibInt = Math.round(totalHTInt * (aibRate / 100));
        const totalTTCInt = totalHTInt + tvaInt + aibInt;

        const paymentMethods: Array<{ type: string; amount: number }> = [{ type: 'ESPECES', amount: totalTTCInt }];

        const ref = String(formData.originalInvoiceReference || '').trim();
        const original = isAvoir
          ? invoices.find((inv) => {
              const anyInv = inv as unknown as Invoice & { emcfUid?: string; emcfCodeMECeFDGI?: string };
              const code = String(anyInv.emcfCodeMECeFDGI || '').replace(/-/g, '').trim();
              const uid = String(anyInv.emcfUid || '').trim();
              return ref === uid || ref === code || ref === anyInv.emcfCodeMECeFDGI;
            })
          : undefined;
        const originalUid = (original as unknown as Invoice & { emcfUid?: string })?.emcfUid;
        const originalCode = (original as unknown as Invoice & { emcfCodeMECeFDGI?: string })?.emcfCodeMECeFDGI;
        const code24 = originalCode ? String(originalCode).replace(/-/g, '').trim() : '';

        const payload = {
          ifu: vendorIfu,
          type: invoiceType === 'FV_EXPORT' ? 'FV' : invoiceType === 'AV_EXPORT' ? 'AV' : invoiceType,
          items: emcfItems,
          customer: {
            name: client.name,
            ifu: (client as unknown as { ifu?: string }).ifu || null,
            address: client.address || '—',
            phone: (client.phone || client.contactInfo || '') as string,
            email: null,
          },
          client: {
            ifu: (client as unknown as { ifu?: string }).ifu || undefined,
            name: client.name,
            contact: (client.phone || client.contactInfo || '') as string,
            address: client.address || undefined,
          },
          operator: {
            id: user?.id || '',
            name: operatorName,
          },
          payment: [
            {
              name: 'ESPECES',
              mode: 'CASH',
              amount: totalTTCInt,
            },
          ],
          paymentMethods,
          aibRate,
          aibAmount,
          ...(isAvoir
            ? {
                originalInvoiceReference: code24 || originalUid || ref,
                reference: originalUid || ref,
                originalInvoiceUid: originalUid || ref,
              }
            : {}),
        };

        const invRes = await emcf.submitInvoice(payload);
        const invAny = invRes as unknown as { uid?: string; total?: number; errorCode?: string; errorDesc?: string };
        if (!invAny.uid) {
          toast({ title: 'Erreur', description: invAny.errorDesc || "Réponse e-MCF invalide", variant: 'destructive' });
          return;
        }
        if (typeof invAny.total === 'number' && Math.round(invAny.total) !== totalTTCInt) {
          toast({
            title: 'Attention',
            description: `Totaux e-MCF différents (e-MCF=${Math.round(invAny.total).toLocaleString('fr-FR')} / App=${totalTTCInt.toLocaleString('fr-FR')}). Vérifie puis confirme ou annule.`,
            variant: 'destructive',
          });
        }

        setEmcfPending({
          uid: invAny.uid,
          submittedAt,
          expiresAtMs: Date.now() + 2 * 60 * 1000,
          posId: emcfActivePos!.id,
          statusResponse: statusRes,
          invoiceResponse: invRes,
          client,
          validItems: normalizedItems,
          itemsPayload,
          totals: { totalHT: totalHTInt, tva: tvaInt, totalTTC: totalTTCInt, totalDiscount: Math.round(totalDiscount) },
          emcfPayload: payload,
        });
        toast({ title: 'Pré-validation e-MCF', description: 'Vérifiez puis confirmez dans les 2 minutes.' });
      } catch (err) {
        logger.error('e-MCF submit failed', err);
        toast({ title: 'Erreur', description: "Échec de l'appel e-MCF", variant: 'destructive' });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!Number.isFinite(totalHT) || !Number.isFinite(tva) || !Number.isFinite(totalTTC)) {
      toast({ title: 'Erreur', description: 'Montants invalides (vérifie prix, quantité et remise)', variant: 'destructive' });
      return;
    }

    const invoiceNumber = await db.getNextInvoiceNumber();

    const saleData: Sale = {
      id: Date.now().toString(),
      productId: validItems[0].productId,
      clientId: formData.clientId,
      quantity: validItems.reduce((s, it) => s + parseInt(it.quantity), 0),
      unitPrice: validItems[0] ? (products.find(p => p.id === validItems[0].productId)?.unitPrice || 0) : 0,
      totalPrice: totalTTC,
      date: new Date().toISOString(),
      invoiceNumber,
      createdBy: user?.id,
      discount: totalDiscount > 0 ? totalDiscount : undefined,
      discountType: totalDiscount > 0 ? 'fixed' : undefined,
      items: validItems.map(it => ({ productId: it.productId, quantity: parseInt(it.quantity), unitPrice: products.find(p => p.id === it.productId)!.unitPrice, discount: parseFloat(it.discount) || undefined, discountType: it.discountType })),
    } as Sale;

    setSaving(true);
    try {
      // Try atomic server-side operation when available (desktop)
      if ((window as unknown as Window).electronAPI?.db && typeof (window as unknown as Window).electronAPI!.db!.createSaleWithInvoice === 'function') {
        const invoicePayload: Record<string, unknown> = {
          id: Date.now().toString(),
          saleId: saleData.id,
          invoiceNumber,
          date: saleData.date,
          clientSnapshot: JSON.stringify(client),
          // for backward compatibility include single product snapshot as first product, and include items array
          productSnapshot: JSON.stringify(itemsPayload.length === 1 ? itemsPayload[0] : itemsPayload),
          totalPrice: totalTTC,
          tva,
          ifu: ((client as unknown) as Client & { ifu?: string }).ifu || undefined,
          tvaRate: 18,
          invoiceType,
          originalInvoiceReference: isAvoir ? (formData.originalInvoiceReference || undefined) : undefined,
          aibRate,
          paymentMethods: [{ type: 'ESPECES', amount: Math.round(totalTTC) }],
          immutableFlag: 1,
          createdBy: user?.id,
          discount: totalDiscount > 0 ? totalDiscount : undefined,
        };
        await db.createSaleWithInvoice(saleData, invoicePayload as unknown as Invoice);
      } else {
        await db.addSale(saleData);
        await db.addInvoice({
          id: Date.now().toString(),
          saleId: saleData.id,
          invoiceNumber,
          date: saleData.date,
          clientName: client.name,
          clientIFU: ((client as unknown) as Client & { ifu?: string }).ifu || undefined,
          productName: itemsPayload.length === 1 ? itemsPayload[0].description : 'Multiple produits',
          quantity: saleData.quantity,
          unitPrice: saleData.unitPrice,
          totalPrice: totalTTC,
          tva,
          tvaRate: 18,
          invoiceType,
          originalInvoiceReference: isAvoir ? (formData.originalInvoiceReference || undefined) : undefined,
          aibRate,
          paymentMethods: [{ type: 'ESPECES', amount: Math.round(totalTTC) }],
          createdBy: user?.id,
          discount: totalDiscount > 0 ? totalDiscount : undefined,
          discountType: totalDiscount > 0 ? 'fixed' : undefined,
        });
      }
    } catch (err) {
      logger.error('Failed to save sale/invoice', err);
      toast({ title: 'Erreur', description: 'Échec lors de l\'enregistrement de la vente', variant: 'destructive' });
      setSaving(false);
      return;
    } finally {
      setSaving(false);
    }

    // Disabled automatic invoice download per user request. Invoice is saved and available in the Invoices page.
    toast({ title: 'Succès', description: 'Vente enregistrée' });
    setIsDialogOpen(false);
    resetForm();
    loadData();
  };

  const handleEmcfFinalize = async (action: 'confirm' | 'cancel') => {
    if (!emcfPending) return;
    if (!emcf.isAvailable()) {
      toast({ title: 'Erreur', description: "e-MCF indisponible", variant: 'destructive' });
      return;
    }
    if (emcfSecondsLeft <= 0) {
      toast({ title: 'Erreur', description: 'La demande e-MCF a expiré', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (action === 'cancel') {
        await emcf.finalizeInvoice(emcfPending.uid, 'cancel', { posId: emcfPending.posId });
        toast({ title: 'Annulée', description: 'Demande e-MCF annulée' });
        setEmcfPending(null);
        return;
      }

      const sec = await emcf.finalizeInvoice(emcfPending.uid, 'confirm', { posId: emcfPending.posId });
      const secAny = sec as unknown as { dateTime?: string; qrCode?: string; codeMECeFDGI?: string; counters?: string; nim?: string; errorDesc?: string };
      if (!secAny.codeMECeFDGI) {
        toast({ title: 'Erreur', description: secAny.errorDesc || 'Finalisation e-MCF invalide', variant: 'destructive' });
        return;
      }

      const nowIso = new Date().toISOString();
      const invoiceNumber = await db.getNextInvoiceNumber();
      const saleId = Date.now().toString();
      const invoiceId = `${saleId}-inv`;

      const saleData: Sale = {
        id: saleId,
        productId: emcfPending.validItems[0].productId,
        clientId: formData.clientId,
        quantity: emcfPending.validItems.reduce((s, it) => s + Number(it.quantity), 0),
        unitPrice: products.find(p => p.id === emcfPending.validItems[0].productId)?.unitPrice || 0,
        totalPrice: emcfPending.totals.totalTTC,
        date: nowIso,
        invoiceNumber,
        createdBy: user?.id,
        discount: emcfPending.totals.totalDiscount > 0 ? emcfPending.totals.totalDiscount : undefined,
        discountType: emcfPending.totals.totalDiscount > 0 ? 'fixed' : undefined,
        items: emcfPending.validItems.map(it => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          unitPrice: products.find(p => p.id === it.productId)!.unitPrice,
          discount: it.discount,
          discountType: it.discountType,
        })),
      } as Sale;

      const invoicePayload: Record<string, unknown> = {
        id: invoiceId,
        saleId: saleId,
        invoiceNumber,
        date: nowIso,
        clientSnapshot: JSON.stringify(emcfPending.client),
        productSnapshot: JSON.stringify(emcfPending.itemsPayload.length === 1 ? emcfPending.itemsPayload[0] : emcfPending.itemsPayload),
        totalPrice: emcfPending.totals.totalTTC,
        tva: emcfPending.totals.tva,
        ifu: ((emcfPending.client as unknown) as Client & { ifu?: string }).ifu || undefined,
        tvaRate: 18,
        invoiceType: formData.invoiceType,
        originalInvoiceReference: (formData.invoiceType === 'AV' || formData.invoiceType === 'AV_EXPORT') ? (formData.originalInvoiceReference || undefined) : undefined,
        aibRate: (() => {
          const c = clients.find(x => x.id === formData.clientId);
          const clientAibRate = c && c.aibRegistration ? (c.aibRate ?? 0) : 0;
          const override = formData.aibRateOverride ? parseAibRate(formData.aibRateOverride) : null;
          return (override !== null ? override : clientAibRate) as 0 | 1 | 5;
        })(),
        paymentMethods: [{ type: 'ESPECES', amount: emcfPending.totals.totalTTC }],
        immutableFlag: 1,
        createdBy: user?.id,
        discount: emcfPending.totals.totalDiscount > 0 ? emcfPending.totals.totalDiscount : undefined,
        emcfUid: emcfPending.uid,
        emcfStatus: 'confirmed',
        emcfCodeMECeFDGI: secAny.codeMECeFDGI,
        emcfQrCode: secAny.qrCode,
        emcfDateTime: secAny.dateTime,
        emcfCounters: secAny.counters,
        emcfNim: secAny.nim,
        emcfPosId: emcfPending.posId,
        emcfRawResponse: { status: emcfPending.statusResponse, invoice: emcfPending.invoiceResponse, finalize: sec },
        emcfSubmittedAt: emcfPending.submittedAt,
        emcfConfirmedAt: nowIso,
      };

      await db.createSaleWithInvoice(saleData, invoicePayload as unknown as Invoice);
      toast({ title: 'Succès', description: `Vente enregistrée (e-MCF: ${secAny.codeMECeFDGI})` });
      setEmcfPending(null);
      setIsDialogOpen(false);
      resetForm();
      loadData();
    } catch (err) {
      logger.error('e-MCF finalize failed', err);
      toast({ title: 'Erreur', description: "Échec lors de la finalisation e-MCF", variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ clientId: '', invoiceType: 'FV', originalInvoiceReference: '', aibRateOverride: '' });
    setItems([{ productId: '', quantity: '1', discount: '', discountType: 'percentage' }]);
  };

  return (
    <PageContainer>
      <PageHeader title="Gestion des Ventes" subtitle="Enregistrer et gérer les ventes" actions={
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
      } />

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Liste des Ventes</CardTitle>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEmcfPending(null);
                setNormalizeWithEmcf(false);
              }
            }}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nouvelle Vente
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Enregistrer une vente</DialogTitle>
                  </DialogHeader>
                  {emcfPending ? (
                    <div className="flex flex-col gap-4 min-h-0">
                      <div className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-4">
                        <div className="rounded-md border p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold">Pré-validation e-MCF en attente</div>
                              <div className="text-xs text-muted-foreground">UID: {emcfPending.uid}</div>
                            </div>
                            <Badge variant={emcfSecondsLeft <= 0 ? 'destructive' : 'secondary'}>
                              {emcfSecondsLeft <= 0 ? 'Expiré' : `Expire dans ${emcfSecondsLeft}s`}
                            </Badge>
                          </div>
                        </div>

                        <div className="rounded-md border p-3">
                          <div className="text-sm font-semibold">Totaux</div>
                          <div className="mt-2 text-sm text-muted-foreground">HT: {emcfPending.totals.totalHT.toLocaleString('fr-FR')} FCFA</div>
                          <div className="text-sm text-muted-foreground">TVA: {emcfPending.totals.tva.toLocaleString('fr-FR')} FCFA</div>
                          <div className="text-sm font-semibold">TTC: {emcfPending.totals.totalTTC.toLocaleString('fr-FR')} FCFA</div>
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-3 border-t">
                        <Button type="button" variant="outline" disabled={saving} onClick={() => void handleEmcfFinalize('cancel')}>
                          Annuler e-MCF
                        </Button>
                        <Button type="button" disabled={saving || emcfSecondsLeft <= 0} onClick={() => void handleEmcfFinalize('confirm')}>
                          {saving ? 'Finalisation...' : 'Confirmer'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 min-h-0">
                      <div className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-4">
                        <div className="space-y-2">
                          <Label>Type de facture *</Label>
                          <Select
                            value={formData.invoiceType}
                            onValueChange={(v) => setFormData((prev) => ({ ...prev, invoiceType: v as NonNullable<Invoice['invoiceType']> }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="FV">Facture de vente (FV)</SelectItem>
                              <SelectItem value="FV_EXPORT">Facture export (FV_EXPORT)</SelectItem>
                              <SelectItem value="AV">Avoir (AV)</SelectItem>
                              <SelectItem value="AV_EXPORT">Avoir export (AV_EXPORT)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {(formData.invoiceType === 'AV' || formData.invoiceType === 'AV_EXPORT') ? (
                          <div className="space-y-2">
                            <Label>Référence facture originale *</Label>
                            <Select
                              value={formData.originalInvoiceReference || '__none'}
                              onValueChange={(v) => setFormData((prev) => ({ ...prev, originalInvoiceReference: v === '__none' ? '' : v }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Sélectionner une facture normalisée" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">—</SelectItem>
                                {invoices
                                  .filter((inv) => {
                                    const anyInv = inv as unknown as Invoice & { emcfCodeMECeFDGI?: string; emcfUid?: string };
                                    return Boolean(anyInv.emcfCodeMECeFDGI || anyInv.emcfUid);
                                  })
                                  .slice(0, 50)
                                  .map((inv) => {
                                    const anyInv = inv as unknown as Invoice & { emcfCodeMECeFDGI?: string; emcfUid?: string };
                                    const label = `${inv.invoiceNumber} — ${anyInv.emcfCodeMECeFDGI || anyInv.emcfUid || ''}`;
                                    const value = String(anyInv.emcfCodeMECeFDGI || anyInv.emcfUid || '');
                                    return (
                                      <SelectItem key={inv.id} value={value}>
                                        {label}
                                      </SelectItem>
                                    );
                                  })}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">On enverra plusieurs variantes de champ (Option C) pour maximiser la compatibilité API.</p>
                          </div>
                        ) : null}

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Label>Client *</Label>
                              <Select value={formData.clientId} onValueChange={(value) => setFormData({ ...formData, clientId: value })}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Sélectionner un client" />
                                </SelectTrigger>
                                <SelectContent>
                                  {clients.map(client => (
                                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="pt-6">
                              <Button type="button" size="sm" variant="outline" onClick={() => setIsClientDialogOpen(true)}>Ajouter client</Button>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-md border p-3">
                          <div className="space-y-1">
                            <div className="text-sm font-medium">Normaliser avec e-MCF</div>
                            <div className="text-xs text-muted-foreground">
                              {emcf.isAvailable() ? (
                                emcfActivePos ? `POS actif: ${emcfActivePos.name}` : 'Aucun POS actif'
                              ) : (
                                'Disponible uniquement sur Electron'
                              )}
                            </div>
                          </div>
                          <Switch
                            checked={normalizeWithEmcf}
                            onCheckedChange={(v) => setNormalizeWithEmcf(v)}
                            disabled={!emcf.isAvailable() || !emcfActivePos}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Produits *</Label>
                          <div className="space-y-2">
                            {items.map((it, idx) => (
                              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-5">
                                  <Label className="text-xs">Produit</Label>
                                  <Select value={it.productId} onValueChange={(value) => setItems(prev => prev.map((p, i) => i === idx ? { ...p, productId: value } : p))}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Sélectionner un produit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {products.map(product => (
                                        <SelectItem key={product.id} value={product.id}>{product.name} - Stock: {product.stockQuantity}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-2">
                                  <Label className="text-xs">Quantité</Label>
                                  <Input type="number" min="1" value={it.quantity} onChange={(e) => setItems(prev => prev.map((p, i) => i === idx ? { ...p, quantity: e.target.value } : p))} />
                                </div>
                                <div className="col-span-2">
                                  <Label className="text-xs">Type Remise</Label>
                                  <Select value={it.discountType} onValueChange={(value: 'percentage' | 'fixed') => setItems(prev => prev.map((p, i) => i === idx ? { ...p, discountType: value } : p))}>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="percentage">%</SelectItem>
                                      <SelectItem value="fixed">FCFA</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-2">
                                  <Label className="text-xs">Valeur Remise</Label>
                                  <Input type="number" min="0" value={it.discount} onChange={(e) => setItems(prev => prev.map((p, i) => i === idx ? { ...p, discount: e.target.value } : p))} />
                                </div>
                                <div className="col-span-1">
                                  <Label className="text-xs"> </Label>
                                  <div className="flex gap-1">
                                    <Button type="button" variant="ghost" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}>Suppr</Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            <div>
                              <Button type="button" variant="outline" size="sm" onClick={() => setItems(prev => [...prev, { productId: '', quantity: '1', discount: '', discountType: 'percentage' }])}>Ajouter un produit</Button>
                            </div>
                          </div>
                        </div>

                        <div className="border-t pt-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-semibold">Récapitulatif</Label>
                          </div>
                          <div className="flex items-center justify-between rounded-md border p-3">
                            <div className="space-y-1">
                              <div className="text-sm font-medium">AIB</div>
                              <div className="text-xs text-muted-foreground">
                                {(() => {
                                  const c = clients.find(x => x.id === formData.clientId);
                                  if (!c) return '—';
                                  if (!c.aibRegistration) return 'Non assujetti (0%)';
                                  return `Assujetti (${c.aibRate ?? 0}%)`;
                                })()}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Override</Label>
                              <select
                                className="rounded border px-2 py-1 text-sm"
                                value={formData.aibRateOverride}
                                onChange={(e) => setFormData((prev) => ({ ...prev, aibRateOverride: e.target.value as '' | '0' | '1' | '5' }))}
                              >
                                <option value="">Auto</option>
                                <option value="0">0%</option>
                                <option value="1">1%</option>
                                <option value="5">5%</option>
                              </select>
                            </div>
                          </div>
                          {(() => {
                            const validItems = items.filter(it => it.productId && Number.parseInt(String(it.quantity), 10) > 0);
                            if (validItems.length === 0) return <p className="text-sm text-muted-foreground">Aucun produit sélectionné</p>;
                            let totalHT = 0;
                            let totalDiscount = 0;
                            let totalVat = 0;
                            for (const it of validItems) {
                              const prod = products.find(p => p.id === it.productId);
                              if (!prod) continue;
                              const q = Number.parseInt(String(it.quantity), 10);
                              const unit = parseMoney((prod as unknown as { unitPrice?: unknown }).unitPrice);
                              if (!Number.isFinite(q) || q <= 0) continue;
                              if (!Number.isFinite(unit) || unit < 0) continue;

                              const d = Number.parseFloat(String(it.discount || '')) || 0;
                              let discountAmount = 0;
                              if (d > 0) {
                                if (it.discountType === 'percentage') discountAmount = (unit * q * d) / 100;
                                else discountAmount = d * q;
                              }
                              totalHT += unit * q - discountAmount;
                              totalDiscount += discountAmount;

                              const g = ((prod as unknown as Product).taxGroup || ((formData.invoiceType === 'FV_EXPORT' || formData.invoiceType === 'AV_EXPORT') ? 'EXPORT' : 'B')) as NonNullable<Product['taxGroup']>;
                              const rate = Number((prod as unknown as Product).tvaRate ?? taxGroupToTvaRate(g));
                              totalVat += Math.round((unit * q - discountAmount) * (rate / 100));
                            }

                            const c = clients.find(x => x.id === formData.clientId);
                            const clientAibRate = c && c.aibRegistration ? (c.aibRate ?? 0) : 0;
                            const override = formData.aibRateOverride ? parseAibRate(formData.aibRateOverride) : null;
                            const aibRate = (override !== null ? override : clientAibRate) as 0 | 1 | 5;
                            const aibAmount = Math.round(totalHT * (aibRate / 100));
                            const tva = totalVat;
                            const totalTTC = totalHT + tva + aibAmount;

                            if (!Number.isFinite(totalHT) || !Number.isFinite(totalDiscount) || !Number.isFinite(tva) || !Number.isFinite(totalTTC)) {
                              return <p className="text-sm text-muted-foreground">Montants invalides (vérifie prix, quantité et remise)</p>;
                            }
                            return (
                              <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span>Total HT:</span>
                                  <span className="font-medium">{totalHT.toLocaleString('fr-FR')} FCFA</span>
                                </div>
                                <div className="flex justify-between text-destructive">
                                  <span>Remise totale:</span>
                                  <span className="font-medium">- {totalDiscount.toLocaleString('fr-FR')} FCFA</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>TVA:</span>
                                  <span className="font-medium">{tva.toLocaleString('fr-FR')} FCFA</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>AIB ({aibRate}%):</span>
                                  <span className="font-medium">{aibAmount.toLocaleString('fr-FR')} FCFA</span>
                                </div>
                                <div className="flex justify-between font-bold text-base pt-1 border-t">
                                  <span>Total TTC:</span>
                                  <span>{totalTTC.toLocaleString('fr-FR')} FCFA</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-3 border-t">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
                        <Button type="submit" disabled={saving}>
                          {saving ? (normalizeWithEmcf ? 'Pré-validation...' : 'Enregistrement...') : (normalizeWithEmcf ? 'Pré-valider e-MCF' : 'Enregistrer')}
                        </Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
                {/* Add client dialog */}
                <Dialog open={isClientDialogOpen} onOpenChange={setIsClientDialogOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nouvel client</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      // No strict validation per request - just save the provided info
                      const fullName = `${(clientForm.lastName || '').trim()} ${(clientForm.firstName || '').trim()}`.trim();
                      const newClient: Client = {
                        id: Date.now().toString(),
                        name: fullName || 'Client',
                        contactInfo: '',
                        email: undefined,
                        phone: clientForm.phone || undefined,
                        address: undefined,
                        ifu: undefined,
                      };
                      try {
                        await db.addClient(newClient);
                        const updated = await db.getClients();
                        setClients(updated as Client[]);
                        setFormData({ ...formData, clientId: newClient.id });
                        toast({ title: 'Succès', description: 'Client ajouté' });
                        setIsClientDialogOpen(false);
                        setClientForm({ firstName: '', lastName: '', phone: '' });
                      } catch (err) {
                        logger.error('Failed to add client', err);
                        toast({ title: 'Erreur', description: 'Impossible d\'ajouter le client', variant: 'destructive' });
                      }
                    }} className="space-y-4">
                      <p className="text-sm text-muted-foreground">Seuls nom, prénom et téléphone sont requis.</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label>Nom</Label>
                          <Input value={clientForm.lastName} onChange={(e) => setClientForm({ ...clientForm, lastName: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Prénom</Label>
                          <Input value={clientForm.firstName} onChange={(e) => setClientForm({ ...clientForm, firstName: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Téléphone</Label>
                        <Input type="tel" placeholder="+229 97 00 00 00" value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={() => setIsClientDialogOpen(false)}>Annuler</Button>
                        <Button type="submit">Ajouter</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {sales.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Facture</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Quantité</TableHead>
                    <TableHead>Remise</TableHead>
                    <TableHead>Montant</TableHead>
                    {user?.role === 'admin' && <TableHead>Opérateur</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map(sale => {
                    const product = products.find(p => p.id === sale.productId);
                    const client = clients.find(c => c.id === sale.clientId);
                    const operator = users.find(u => u.id === (sale as unknown as Sale).createdBy);
                    return (
                      <TableRow key={sale.id}>
                        <TableCell className="font-mono">{sale.invoiceNumber}</TableCell>
                        <TableCell>{format(new Date(sale.date), 'dd/MM/yyyy', { locale: fr })}</TableCell>
                        <TableCell>{client?.name}</TableCell>
                        <TableCell>{(sale.items && sale.items.length > 1) ? 'Multiple produits' : (product?.name || (sale.items && sale.items[0]?.productId) || '—')}</TableCell>
                        <TableCell>{sale.quantity}</TableCell>
                        <TableCell>{(() => {
                          // Prefer per-item discounts when available
                          if (sale.items && sale.items.length) {
                            const itemsWithDiscount = (sale.items || []).filter(it => it.discount !== undefined && it.discount !== null);
                            if (itemsWithDiscount.length === 0) return '-';
                            const allPercent = itemsWithDiscount.every(it => it.discountType === 'percentage');
                            const allFixed = itemsWithDiscount.every(it => it.discountType === 'fixed');
                            if (allPercent) {
                              const vals = itemsWithDiscount.map(it => Number(it.discount));
                              const first = vals[0];
                              const allSame = vals.every(v => v === first);
                              return allSame ? `${first}%` : 'Mix %';
                            }
                            if (allFixed) {
                              const sum = itemsWithDiscount.reduce((s, it) => s + Number(it.discount || 0), 0);
                              return `${sum.toLocaleString('fr-FR')} FCFA`;
                            }
                            return 'Mix';
                          }
                          // Fallback to sale-level discount
                          if (sale.discount) {
                            return sale.discountType === 'percentage' ? `${sale.discount}%` : `${Number(sale.discount).toLocaleString('fr-FR')} FCFA`;
                          }
                          return '-';
                        })()}</TableCell>
                        <TableCell className="font-semibold">{sale.totalPrice.toLocaleString('fr-FR')} FCFA</TableCell>
                        {user?.role === 'admin' && (
                          <TableCell>{operator ? operator.username : '-'}</TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center py-12 text-muted-foreground">Aucune vente enregistrée</p>
            )}
          </CardContent>
        </Card>
      </PageContainer>
  );
};

export default Sales;
