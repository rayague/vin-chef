import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Sale, Product, Client, getProducts, getClients, getSales, addSale, updateProduct, addInvoice, getNextInvoiceNumber } from '@/lib/storage';
import { generateInvoicePDF, downloadInvoice } from '@/lib/pdf';
import { Plus, ArrowLeft, TrendingUp, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const Sales = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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

  const loadData = () => {
    setSales(getSales());
    setProducts(getProducts());
    setClients(getClients());
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

    const invoiceNumber = getNextInvoiceNumber();
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
    };

    addSale(saleData);
    updateProduct(product.id, { stockQuantity: product.stockQuantity - quantity });
    
    addInvoice({
      id: Date.now().toString(),
      saleId: saleData.id,
      invoiceNumber,
      date: saleData.date,
      clientName: client.name,
      productName: product.name,
      quantity,
      unitPrice: product.unitPrice,
      totalPrice: totalTTC,
      tva,
    });

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
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground shadow-lg">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <TrendingUp className="w-6 h-6" />
            <h1 className="text-2xl font-bold">Gestion des Ventes</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
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
                    return (
                      <TableRow key={sale.id}>
                        <TableCell className="font-mono">{sale.invoiceNumber}</TableCell>
                        <TableCell>{format(new Date(sale.date), 'dd/MM/yyyy', { locale: fr })}</TableCell>
                        <TableCell>{client?.name}</TableCell>
                        <TableCell>{product?.name}</TableCell>
                        <TableCell>{sale.quantity}</TableCell>
                        <TableCell className="font-semibold">{sale.totalPrice.toLocaleString('fr-FR')} FCFA</TableCell>
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
      </main>
    </div>
  );
};

export default Sales;
