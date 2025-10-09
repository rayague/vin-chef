import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    productId: '',
    clientId: '',
    quantity: '',
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    const [s, p, c, u] = await Promise.all([db.getSales(), db.getProducts(), db.getClients(), db.getUsers()]);
    setSales(s as Sale[]);
    setProducts(p as Product[]);
    setClients(c as Client[]);
    setUsers((u as unknown as { id: string; username: string }[]) || []);
  };

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
    const tva = totalHT * 0.18;
    const totalTTC = totalHT + tva;

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
    });

    downloadInvoice(invoiceNumber, pdf);

  toast({ title: 'Succès', description: 'Vente enregistrée et facture générée' });
    setIsDialogOpen(false);
    resetForm();
    loadData();
  };

  const resetForm = () => {
    setFormData({ productId: '', clientId: '', quantity: '' });
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
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
                      <Button type="submit">Enregistrer</Button>
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
                        <TableCell>{operator ? operator.username : '-'}</TableCell>
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
