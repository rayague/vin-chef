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
    productId: '',
    clientId: '',
    quantity: '',
    discount: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
  });

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
  }, [user, navigate, location, loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.productId || !formData.clientId || !formData.quantity) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }

    const product = products.find(p => p.id === formData.productId);
    const client = clients.find(c => c.id === formData.clientId);
    const quantity = parseInt(formData.quantity);

    if (!product || !client) return;

    if (product.stockQuantity < quantity) {
      toast({ title: 'Erreur', description: 'Stock insuffisant', variant: 'destructive' });
      return;
    }

    const invoiceNumber = await db.getNextInvoiceNumber();
    const totalHT = product.unitPrice * quantity;
    
    // Calcul de la remise
    const discountValue = parseFloat(formData.discount) || 0;
    let discountAmount = 0;
    if (discountValue > 0) {
      if (formData.discountType === 'percentage') {
        discountAmount = (totalHT * discountValue) / 100;
      } else {
        discountAmount = discountValue;
      }
    }
    
    const totalHTAfterDiscount = totalHT - discountAmount;
    const tva = totalHTAfterDiscount * 0.18;
    const totalTTC = totalHTAfterDiscount + tva;

    const saleData: Sale = {
      id: Date.now().toString(),
      productId: formData.productId,
      clientId: formData.clientId,
      quantity,
      unitPrice: product.unitPrice,
      totalPrice: totalTTC,
      date: new Date().toISOString(),
      invoiceNumber,
      createdBy: user?.id,
      discount: discountAmount > 0 ? discountAmount : undefined,
      discountType: discountAmount > 0 ? formData.discountType : undefined,
    };

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
          productSnapshot: JSON.stringify(product),
          totalPrice: totalTTC,
          tva,
            ifu: ((client as unknown) as Client & { ifu?: string }).ifu || undefined,
            tvaRate: 18,
          immutableFlag: 1,
          createdBy: user?.id,
        };
        await db.createSaleWithInvoice(saleData, invoicePayload as unknown as Invoice);
      } else {
        await db.addSale(saleData);
        await db.updateProduct(product.id, { stockQuantity: product.stockQuantity - quantity });
        await db.addInvoice({
          id: Date.now().toString(),
          saleId: saleData.id,
          invoiceNumber,
          date: saleData.date,
          clientName: client.name,
          clientIFU: ((client as unknown) as Client & { ifu?: string }).ifu || undefined,
          productName: product.name,
          quantity,
          unitPrice: product.unitPrice,
          totalPrice: totalTTC,
          tva,
          tvaRate: 18,
          createdBy: user?.id,
          discount: discountAmount > 0 ? discountAmount : undefined,
          discountType: discountAmount > 0 ? formData.discountType : undefined,
        });
      }
    } catch (err) {
      console.error('Failed to save sale/invoice', err);
      toast({ title: 'Erreur', description: 'Échec lors de l\'enregistrement de la vente', variant: 'destructive' });
      setSaving(false);
      return;
    } finally {
      setSaving(false);
    }

    const pdf = generateInvoicePDF({
      invoiceNumber,
      date: saleData.date,
      clientName: client.name,
      clientAddress: client.address,
      clientPhone: client.phone,
      productName: product.name,
      quantity,
      unitPrice: product.unitPrice,
      totalHT,
      tva,
      totalTTC,
      discount: discountAmount,
      discountType: formData.discountType,
    });

    downloadInvoice(invoiceNumber, pdf);

  toast({ title: 'Succès', description: 'Vente enregistrée et facture générée' });
    setIsDialogOpen(false);
    resetForm();
    loadData();
  };

  const resetForm = () => {
    setFormData({ productId: '', clientId: '', quantity: '', discount: '', discountType: 'percentage' });
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
                <DialogContent>
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
                            <Button size="sm" variant="outline" onClick={() => setIsClientDialogOpen(true)}>Ajouter client</Button>
                          </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Produit *</Label>
                      <Select value={formData.productId} onValueChange={(value) => setFormData({ ...formData, productId: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un produit" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(product => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} - Stock: {product.stockQuantity}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Quantité *</Label>
                      <Input type="number" min="1" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} />
                    </div>
                    
                    {/* Section Remise */}
                    <div className="border-t pt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-semibold">Remise (optionnelle)</Label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label>Type de remise</Label>
                          <Select value={formData.discountType} onValueChange={(value: 'percentage' | 'fixed') => setFormData({ ...formData, discountType: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">Pourcentage (%)</SelectItem>
                              <SelectItem value="fixed">Montant fixe (FCFA)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Valeur</Label>
                          <Input 
                            type="number" 
                            min="0" 
                            step={formData.discountType === 'percentage' ? '0.1' : '1'}
                            max={formData.discountType === 'percentage' ? '100' : undefined}
                            value={formData.discount} 
                            onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                            placeholder={formData.discountType === 'percentage' ? 'Ex: 10' : 'Ex: 5000'}
                          />
                        </div>
                      </div>
                      {formData.discount && formData.quantity && formData.productId && (() => {
                        const product = products.find(p => p.id === formData.productId);
                        if (!product) return null;
                        const quantity = parseInt(formData.quantity);
                        const totalHT = product.unitPrice * quantity;
                        const discountValue = parseFloat(formData.discount) || 0;
                        let discountAmount = 0;
                        if (discountValue > 0) {
                          if (formData.discountType === 'percentage') {
                            discountAmount = (totalHT * discountValue) / 100;
                          } else {
                            discountAmount = discountValue;
                          }
                        }
                        const totalHTAfterDiscount = totalHT - discountAmount;
                        const tva = totalHTAfterDiscount * 0.18;
                        const totalTTC = totalHTAfterDiscount + tva;
                        
                        return (
                          <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Total HT:</span>
                              <span className="font-medium">{totalHT.toLocaleString('fr-FR')} FCFA</span>
                            </div>
                            <div className="flex justify-between text-destructive">
                              <span>Remise:</span>
                              <span className="font-medium">- {discountAmount.toLocaleString('fr-FR')} FCFA</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total HT après remise:</span>
                              <span className="font-medium">{totalHTAfterDiscount.toLocaleString('fr-FR')} FCFA</span>
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
                        console.error('Failed to add client', err);
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
                        <TableCell>{product?.name}</TableCell>
                        <TableCell>{sale.quantity}</TableCell>
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
