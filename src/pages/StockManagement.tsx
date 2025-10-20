import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Product, StockMovement } from '@/lib/storage';
import db from '@/lib/db';
import { Plus, ArrowLeft, Package, TrendingUp, TrendingDown, AlertCircle, Download, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import { generateStockReportPDF, downloadStockReport, StockMovementReportData, StockReportFilters } from '@/lib/pdf';

const StockManagement = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [users, setUsers] = useState<{ id: string; username: string }[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [formData, setFormData] = useState({
    productId: '',
    type: 'in' as 'in' | 'out' | 'adjustment',
    quantity: '',
    reason: '',
  });

  const [filters, setFilters] = useState<StockReportFilters>({
    dateFrom: '',
    dateTo: '',
    productId: '',
    movementType: 'all',
  });

  const loadData = useCallback(async () => {
    const [p, m, u] = await Promise.all([
      db.getProducts(),
      db.getStockMovements(),
      db.getUsers(),
    ]);
    setProducts(p as Product[]);
    setMovements((m as StockMovement[]).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setUsers((u as unknown as { id: string; username: string }[]) || []);
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    // Only admin can access stock management
    if (user.role !== 'admin') {
      toast({ title: 'Accès refusé', description: 'Cette page est réservée aux administrateurs', variant: 'destructive' });
      navigate('/dashboard');
      return;
    }
    loadData();
  }, [user, navigate, loadData, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.productId || !formData.quantity || !formData.reason) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }

    const product = products.find(p => p.id === formData.productId);
    const quantity = parseInt(formData.quantity);

    if (!product) return;

    if (quantity <= 0) {
      toast({ title: 'Erreur', description: 'La quantité doit être positive', variant: 'destructive' });
      return;
    }

    // Calculer le nouveau stock
    let newStock = product.stockQuantity;
    let quantityChange = quantity;
    
    if (formData.type === 'in') {
      // Entrée de stock
      newStock = product.stockQuantity + quantity;
    } else if (formData.type === 'out') {
      // Sortie de stock
      if (product.stockQuantity < quantity) {
        toast({ title: 'Erreur', description: 'Stock insuffisant', variant: 'destructive' });
        return;
      }
      newStock = product.stockQuantity - quantity;
      quantityChange = -quantity; // Quantité négative pour sortie
    } else {
      // Ajustement de stock (quantité absolue)
      quantityChange = quantity - product.stockQuantity;
      newStock = quantity;
    }

    const movementData: StockMovement = {
      id: Date.now().toString(),
      productId: formData.productId,
      type: formData.type,
      quantity: quantityChange,
      reason: formData.reason,
      date: new Date().toISOString(),
      createdBy: user?.id,
      previousStock: product.stockQuantity,
      newStock: newStock,
    };

    setSaving(true);
    try {
      await db.addStockMovement(movementData);
      await db.updateProduct(product.id, { stockQuantity: newStock });
      toast({ title: 'Succès', description: 'Mouvement de stock enregistré' });
      setIsDialogOpen(false);
      resetForm();
      loadData();
    } catch (err) {
      console.error('Failed to save stock movement', err);
      toast({ title: 'Erreur', description: 'Échec lors de l\'enregistrement', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ productId: '', type: 'in', quantity: '', reason: '' });
  };

  const getMovementIcon = (type: string) => {
    if (type === 'in') return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (type === 'out') return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <AlertCircle className="w-4 h-4 text-orange-600" />;
  };

  const getMovementLabel = (type: string) => {
    if (type === 'in') return 'Entrée';
    if (type === 'out') return 'Sortie';
    return 'Ajustement';
  };

  const getQuantityColor = (quantity: number) => {
    if (quantity > 0) return 'text-green-600 font-semibold';
    if (quantity < 0) return 'text-red-600 font-semibold';
    return 'text-orange-600 font-semibold';
  };

  const applyFilters = (allMovements: StockMovement[]): StockMovement[] => {
    let filtered = [...allMovements];

    // Filter by date range
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(m => new Date(m.date) >= fromDate);
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(m => new Date(m.date) <= toDate);
    }

    // Filter by product
    if (filters.productId && filters.productId !== 'all') {
      filtered = filtered.filter(m => m.productId === filters.productId);
    }

    // Filter by movement type
    if (filters.movementType && filters.movementType !== 'all') {
      filtered = filtered.filter(m => m.type === filters.movementType);
    }

    return filtered;
  };

  const handleExportPDF = () => {
    const filteredMovements = applyFilters(movements);

    if (filteredMovements.length === 0) {
      toast({ title: 'Aucune donnée', description: 'Aucun mouvement ne correspond aux filtres sélectionnés', variant: 'destructive' });
      return;
    }

    // Transform movements to report data
    const reportData: StockMovementReportData[] = filteredMovements.map(m => {
      const product = products.find(p => p.id === m.productId);
      const operator = users.find(u => u.id === m.createdBy);
      return {
        id: m.id,
        productName: product?.name || 'Produit inconnu',
        type: m.type,
        quantity: m.quantity,
        previousStock: m.previousStock,
        newStock: m.newStock,
        reason: m.reason || '-',
        date: m.date,
        operatorName: operator?.username || 'Inconnu',
      };
    });

    const pdf = generateStockReportPDF(reportData, filters);
    downloadStockReport(pdf, filters);
    toast({ title: 'Succès', description: `Rapport généré avec ${filteredMovements.length} mouvement(s)` });
  };

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      productId: '',
      movementType: 'all',
    });
  };

  const filteredMovements = applyFilters(movements);

  return (
    <PageContainer>
      <PageHeader 
        title="Gestion de Stock" 
        subtitle="Gérer les entrées et sorties de stock" 
        actions={
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        } 
      />

      {/* Stock Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Produits en Stock</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
            <p className="text-xs text-muted-foreground">Nombre total de produits</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.reduce((sum, p) => sum + p.stockQuantity, 0)}</div>
            <p className="text-xs text-muted-foreground">Unités en stock</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mouvements</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{movements.length}</div>
            <p className="text-xs text-muted-foreground">Historique des mouvements</p>
          </CardContent>
        </Card>
      </div>

      {/* Stock by Product */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Stock par Produit</CardTitle>
        </CardHeader>
        <CardContent>
          {products.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="text-right">Stock Actuel</TableHead>
                  <TableHead className="text-right">Prix Unitaire</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map(product => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell className="text-right">
                      <span className={product.stockQuantity < 10 ? 'text-red-600 font-semibold' : ''}>
                        {product.stockQuantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{product.unitPrice.toLocaleString('fr-FR')} FCFA</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-8 text-muted-foreground">Aucun produit disponible</p>
          )}
        </CardContent>
      </Card>

      {/* Filters and Export */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Filtres et Export</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={clearFilters}>
                Réinitialiser
              </Button>
              <Button onClick={handleExportPDF}>
                <Download className="w-4 h-4 mr-2" />
                Exporter PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Date début</Label>
              <Input 
                type="date" 
                value={filters.dateFrom} 
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Date fin</Label>
              <Input 
                type="date" 
                value={filters.dateTo} 
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Produit</Label>
              <Select value={filters.productId || 'all'} onValueChange={(value) => setFilters({ ...filters, productId: value === 'all' ? '' : value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous les produits" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les produits</SelectItem>
                  {products.map(product => (
                    <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type de mouvement</Label>
              <Select value={filters.movementType || 'all'} onValueChange={(value: 'in' | 'out' | 'adjustment' | 'all') => setFilters({ ...filters, movementType: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  <SelectItem value="in">Entrées</SelectItem>
                  <SelectItem value="out">Sorties</SelectItem>
                  <SelectItem value="adjustment">Ajustements</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 p-3 bg-muted rounded-md">
            <p className="text-sm">
              <strong>{filteredMovements.length}</strong> mouvement(s) correspond(ent) aux filtres sélectionnés
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Movement History */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Historique des Mouvements</CardTitle>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nouveau Mouvement
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Enregistrer un mouvement de stock</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Produit *</Label>
                    <Select value={formData.productId} onValueChange={(value) => setFormData({ ...formData, productId: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un produit" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(product => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} (Stock actuel: {product.stockQuantity})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Type de mouvement *</Label>
                    <Select value={formData.type} onValueChange={(value: 'in' | 'out' | 'adjustment') => setFormData({ ...formData, type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-green-600" />
                            Entrée de stock
                          </div>
                        </SelectItem>
                        <SelectItem value="out">
                          <div className="flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-red-600" />
                            Sortie de stock
                          </div>
                        </SelectItem>
                        <SelectItem value="adjustment">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-orange-600" />
                            Ajustement (inventaire)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      {formData.type === 'adjustment' ? 'Nouvelle quantité *' : 'Quantité *'}
                    </Label>
                    <Input 
                      type="number" 
                      min="1" 
                      value={formData.quantity} 
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      placeholder={formData.type === 'adjustment' ? 'Ex: 50' : 'Ex: 10'}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.type === 'in' && 'Quantité à ajouter au stock'}
                      {formData.type === 'out' && 'Quantité à retirer du stock'}
                      {formData.type === 'adjustment' && 'Nouvelle quantité totale après inventaire'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Motif *</Label>
                    <Textarea 
                      value={formData.reason} 
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Ex: Réapprovisionnement fournisseur, Casse, Inventaire annuel..."
                      rows={3}
                    />
                  </div>

                  {/* Preview */}
                  {formData.productId && formData.quantity && (() => {
                    const product = products.find(p => p.id === formData.productId);
                    if (!product) return null;
                    const quantity = parseInt(formData.quantity);
                    let newStock = product.stockQuantity;
                    if (formData.type === 'in') newStock += quantity;
                    else if (formData.type === 'out') newStock -= quantity;
                    else newStock = quantity;

                    return (
                      <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Stock actuel:</span>
                          <span className="font-medium">{product.stockQuantity}</span>
                        </div>
                        <div className="flex justify-between font-semibold">
                          <span>Nouveau stock:</span>
                          <span className={newStock < 0 ? 'text-red-600' : newStock > product.stockQuantity ? 'text-green-600' : ''}>
                            {newStock}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annuler</Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? 'Enregistrement...' : 'Enregistrer'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {filteredMovements.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Stock Avant</TableHead>
                  <TableHead className="text-right">Stock Après</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead>Opérateur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map(movement => {
                  const product = products.find(p => p.id === movement.productId);
                  const operator = users.find(u => u.id === movement.createdBy);
                  return (
                    <TableRow key={movement.id}>
                      <TableCell>{format(new Date(movement.date), 'dd/MM/yyyy HH:mm', { locale: fr })}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getMovementIcon(movement.type)}
                          <span className="text-sm">{getMovementLabel(movement.type)}</span>
                        </div>
                      </TableCell>
                      <TableCell>{product?.name || 'Produit inconnu'}</TableCell>
                      <TableCell className={`text-right ${getQuantityColor(movement.quantity)}`}>
                        {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                      </TableCell>
                      <TableCell className="text-right">{movement.previousStock}</TableCell>
                      <TableCell className="text-right font-semibold">{movement.newStock}</TableCell>
                      <TableCell className="text-sm">{movement.reason}</TableCell>
                      <TableCell>{operator?.username || '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-12 text-muted-foreground">Aucun mouvement enregistré</p>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default StockManagement;
