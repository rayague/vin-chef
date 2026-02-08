import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Product } from '@/lib/storage';
import db from '@/lib/db';
import logger from '@/lib/logger';
import { Plus, Edit, Trash2, ArrowLeft, Package } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';

const Products = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unitPrice: '',
    stockQuantity: '',
    description: '',
    taxGroup: 'B' as NonNullable<Product['taxGroup']>,
  });
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const taxGroupToTvaRate = (g: NonNullable<Product['taxGroup']>): number => {
    if (g === 'B') return 18;
    if (g === 'C') return 10;
    if (g === 'D') return 5;
    if (g === 'A') return 0;
    if (g === 'E') return 0;
    if (g === 'EXPORT') return 0;
    return 18;
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    void loadProducts();
    (async () => {
      try {
        const cats = await db.getCategories();
        const typed = cats as Array<{ id: string; name: string }> | undefined;
        setCategories((typed || []).map(c => ({ id: c.id, name: c.name })));
      } catch (err) {
        logger.error('Failed to load categories', err);
        setCategories([]);
      }
    })();
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail as { entity: string } | undefined;
        if (!detail) return;
        if (detail.entity === 'products' || detail.entity === 'categories' || detail.entity === 'stock_movements') void loadProducts();
      } catch (e) {
        // ignore
      }
    };
    window.addEventListener('vinchef:data-changed', handler as EventListener);
    return () => window.removeEventListener('vinchef:data-changed', handler as EventListener);
  }, [user, navigate]);

  const loadProducts = async () => {
    try {
      setLoadError(null);
      const list = await db.getProducts();
      const normalized = (list as Product[]).map((p) => {
        const anyP = p as unknown as {
          id: string;
          name?: unknown;
          category?: unknown;
          unitPrice?: unknown;
          stockQuantity?: unknown;
          description?: unknown;
          taxGroup?: unknown;
          tax_group?: unknown;
          tvaRate?: unknown;
          tva_rate?: unknown;
        };
        const unitPrice = Number(anyP.unitPrice);
        const stockQuantity = Number.parseInt(String(anyP.stockQuantity ?? ''), 10);
        const taxGroupRaw = anyP.taxGroup ?? anyP.tax_group;
        const tvaRateRaw = anyP.tvaRate ?? anyP.tva_rate;
        const tvaRate = Number(tvaRateRaw);
        return {
          ...p,
          name: String(anyP.name ?? ''),
          category: String(anyP.category ?? ''),
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
          stockQuantity: Number.isFinite(stockQuantity) ? stockQuantity : 0,
          description: String(anyP.description ?? ''),
          taxGroup: (typeof taxGroupRaw === 'string' ? taxGroupRaw : undefined) as Product['taxGroup'],
          tvaRate: Number.isFinite(tvaRate) ? tvaRate : undefined,
        } as Product;
      });
      setProducts(normalized);
    } catch (err) {
      logger.error('Failed to load products', err);
      setProducts([]);
      setLoadError("Impossible de charger les produits. Vérifie que la base de données Electron est disponible.");
      toast({ title: 'Erreur', description: "Impossible de charger les produits", variant: 'destructive' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.category || !formData.unitPrice || !formData.stockQuantity) {
      toast({
        title: 'Erreur',
        description: 'Veuillez remplir tous les champs obligatoires',
        variant: 'destructive',
      });
      return;
    }

    const productData: Product = {
      id: editingProduct?.id || Date.now().toString(),
      name: formData.name,
      category: formData.category,
      unitPrice: parseFloat(formData.unitPrice),
      stockQuantity: parseInt(formData.stockQuantity),
      description: formData.description,
      taxGroup: formData.taxGroup,
      tvaRate: taxGroupToTvaRate(formData.taxGroup),
    };

    if (editingProduct) {
      await db.updateProduct(editingProduct.id, productData);
      toast({ title: 'Succès', description: 'Produit mis à jour avec succès' });
    } else {
      await db.addProduct(productData);
      toast({ title: 'Succès', description: 'Produit ajouté avec succès' });
    }

    setIsDialogOpen(false);
    setEditingProduct(null);
    resetForm();
    loadProducts();
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      category: product.category,
      unitPrice: product.unitPrice.toString(),
      stockQuantity: product.stockQuantity.toString(),
      description: product.description,
      taxGroup: (product.taxGroup || 'B') as NonNullable<Product['taxGroup']>,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeleteTarget(id);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      unitPrice: '',
      stockQuantity: '',
      description: '',
      taxGroup: 'B',
    });
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingProduct(null);
    resetForm();
  };

  const filteredProducts = products.filter(product => {
    const name = String((product as unknown as { name?: unknown }).name ?? '').toLowerCase();
    const category = String((product as unknown as { category?: unknown }).category ?? '').toLowerCase();
    const q = searchTerm.toLowerCase();
    return name.includes(q) || category.includes(q);
  });

  return (
    <PageContainer>
      <PageHeader title="Gestion des Produits" subtitle="Liste et gestion des articles" actions={
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
      } />

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <CardTitle>Liste des Produits</CardTitle>
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                <Input
                  placeholder="Rechercher un produit..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-64"
                />
                {user?.role === 'admin' && (
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => { resetForm(); setEditingProduct(null); }}>
                        <Plus className="w-4 h-4 mr-2" />
                        Nouveau Produit
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{editingProduct ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Nom du produit *</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Château Margaux 2015"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="category">Catégorie *</Label>
                          <Select value={formData.category} onValueChange={(val) => setFormData({ ...formData, category: val })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionner une catégorie" />
                            </SelectTrigger>
                            <SelectContent>
                                  {categories.length === 0 ? (
                                    // Avoid empty string value: Radix Select requires non-empty values.
                                    <SelectItem value="__none" disabled>Aucune catégorie</SelectItem>
                                  ) : (
                                    categories.map(cat => (
                                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                                    ))
                                  )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="unitPrice">Prix unitaire (FCFA) *</Label>
                          <Input
                            id="unitPrice"
                            type="number"
                            value={formData.unitPrice}
                            onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                            placeholder="450000"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="stockQuantity">Quantité en stock *</Label>
                          <Input
                            id="stockQuantity"
                            type="number"
                            value={formData.stockQuantity}
                            onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                            placeholder="12"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="description">Description</Label>
                          <Input
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Premier Grand Cru Classé"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Groupe de taxation *</Label>
                          <Select
                            value={formData.taxGroup}
                            onValueChange={(val) => setFormData({ ...formData, taxGroup: val as NonNullable<Product['taxGroup']> })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionner" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="B">B — TVA 18%</SelectItem>
                              <SelectItem value="C">C — TVA 10%</SelectItem>
                              <SelectItem value="D">D — TVA 5%</SelectItem>
                              <SelectItem value="A">A — Exonéré 0%</SelectItem>
                              <SelectItem value="E">E — TVA 0%</SelectItem>
                              <SelectItem value="EXPORT">EXPORT — TVA 0%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button type="button" variant="outline" onClick={handleDialogClose}>
                            Annuler
                          </Button>
                          <Button type="submit">
                            {editingProduct ? 'Mettre à jour' : 'Ajouter'}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadError && (
              <div className="mb-4 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
                {loadError}
              </div>
            )}
            {filteredProducts.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Taxation</TableHead>
                      <TableHead>Prix unitaire</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Description</TableHead>
                      {user?.role === 'admin' && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.category}</TableCell>
                        <TableCell>
                          {(product.taxGroup || 'B')} ({(product.tvaRate ?? taxGroupToTvaRate((product.taxGroup || 'B') as NonNullable<Product['taxGroup']>))}%)
                        </TableCell>
                        <TableCell>{product.unitPrice.toLocaleString('fr-FR')} FCFA</TableCell>
                        <TableCell>
                          <span className={product.stockQuantity < 5 ? 'text-destructive font-semibold' : ''}>
                            {product.stockQuantity}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{product.description}</TableCell>
                        {user?.role === 'admin' && (
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="outline" onClick={() => handleEdit(product)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleDelete(product.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{searchTerm ? 'Aucun produit trouvé' : 'Aucun produit disponible'}</p>
              </div>
            )}
          </CardContent>
        </Card>
        {/* Delete confirmation dialog */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-card p-6 rounded w-[420px]">
              <h3 className="text-lg font-semibold mb-2">Confirmer la suppression</h3>
              <p className="text-sm text-muted-foreground mb-4">Voulez-vous vraiment supprimer ce produit ? Cette action est irréversible.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button>
                <Button variant="destructive" onClick={async () => {
                  try {
                    await db.deleteProduct(deleteTarget!);
                    toast({ title: 'Succès', description: 'Produit supprimé avec succès' });
                    setDeleteTarget(null);
                    loadProducts();
                  } catch (err) {
                    logger.error('delete product', err);
                    toast({ title: 'Erreur', description: 'Impossible de supprimer le produit', variant: 'destructive' });
                  }
                }}>Supprimer</Button>
              </div>
            </div>
          </div>
        )}
    </PageContainer>
  );
};

export default Products;
