import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Sale, Product, Client, Invoice } from '@/lib/storage';
import db from '@/lib/db';
import logger from '@/lib/logger';
import { generateInvoicePDF, downloadInvoice } from '@/lib/pdf';
import { Plus, ArrowLeft, TrendingUp, Download } from 'lucide-react';
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
  const [users, setUsers] = useState<{ id: string; username: string }[]>([]);
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    clientId: '',
  });

  const [items, setItems] = useState<Array<{ productId: string; quantity: string; discount: string; discountType: 'percentage' | 'fixed' }>>([
    { productId: '', quantity: '1', discount: '', discountType: 'percentage' },
  ]);

  const location = useLocation();

  const loadData = useCallback(async () => {
    const [s, p, c, u] = await Promise.all([db.getSales(), db.getProducts(), db.getClients(), db.getUsers()]);
    const allSales = s as Sale[];
    const visibleSales = (user && user.role !== 'admin') ? allSales.filter(sale => (sale as unknown as Sale).createdBy === user.id) : allSales;
    setSales(visibleSales);
    setProducts(p as Product[]);
    setClients(c as Client[]);
    setUsers((u as unknown as { id: string; username: string }[]) || []);
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadData();

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

    const invoiceNumber = await db.getNextInvoiceNumber();
    // compute totals
    let totalHT = 0;
    let totalDiscount = 0;
    const itemsPayload: Array<{ description: string; quantity: number; unitPrice: number; discount?: number }> = [];
    validItems.forEach(it => {
      const prod = products.find(p => p.id === it.productId)!;
      const q = parseInt(it.quantity);
      const unit = prod.unitPrice;
      let discountAmount = 0;
      const d = parseFloat(it.discount) || 0;
      if (d > 0) {
        if (it.discountType === 'percentage') discountAmount = (unit * q * d) / 100;
        else discountAmount = d;
      }
      const lineTotalHT = unit * q - discountAmount;
      totalHT += lineTotalHT;
      totalDiscount += discountAmount;
      itemsPayload.push({ description: prod.name, quantity: q, unitPrice: unit, discount: discountAmount > 0 ? discountAmount : undefined });
    });

    const tva = totalHT * 0.18;
    const totalTTC = totalHT + tva;

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

  const resetForm = () => {
    setFormData({ clientId: '' });
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
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nouvelle Vente
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Enregistrer une vente</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
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

                    {/* Totals preview */}
                    <div className="border-t pt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-semibold">Récapitulatif</Label>
                      </div>
                      {(() => {
                        const validItems = items.filter(it => it.productId && parseInt(it.quantity) > 0);
                        if (validItems.length === 0) return <p className="text-sm text-muted-foreground">Aucun produit sélectionné</p>;
                        let totalHT = 0;
                        let totalDiscount = 0;
                        validItems.forEach(it => {
                          const prod = products.find(p => p.id === it.productId);
                          if (!prod) return;
                          const q = parseInt(it.quantity);
                          const unit = prod.unitPrice;
                          const d = parseFloat(it.discount) || 0;
                          let discountAmount = 0;
                          if (d > 0) {
                            if (it.discountType === 'percentage') discountAmount = (unit * q * d) / 100;
                            else discountAmount = d;
                          }
                          totalHT += unit * q - discountAmount;
                          totalDiscount += discountAmount;
                        });
                        const tva = totalHT * 0.18;
                        const totalTTC = totalHT + tva;
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
                              <span>TVA (18%):</span>
                              <span className="font-medium">{tva.toLocaleString('fr-FR')} FCFA</span>
                            </div>
                            <div className="flex justify-between font-bold text-base pt-1 border-t">
                              <span>Total TTC:</span>
                              <span>{totalTTC.toLocaleString('fr-FR')} FCFA</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
                      <Button type="submit" disabled={saving}>
                        {saving ? 'Enregistrement...' : 'Enregistrer'}
                      </Button>
                    </div>
                  </form>
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
