import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Product, getProducts, addProduct, updateProduct, deleteProduct } from '@/lib/storage';
import { Plus, Edit, Trash2, ArrowLeft, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Products = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unitPrice: '',
    stockQuantity: '',
    description: '',
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadProducts();
  }, [user, navigate]);

  const loadProducts = () => {
    setProducts(getProducts());
  };

  const handleSubmit = (e: React.FormEvent) => {
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
    };

    if (editingProduct) {
      updateProduct(editingProduct.id, productData);
      toast({
        title: 'Succès',
        description: 'Produit mis à jour avec succès',
      });
    } else {
      addProduct(productData);
      toast({
        title: 'Succès',
        description: 'Produit ajouté avec succès',
      });
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
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
      deleteProduct(id);
      toast({
        title: 'Succès',
        description: 'Produit supprimé avec succès',
      });
      loadProducts();
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      unitPrice: '',
      stockQuantity: '',
      description: '',
    });
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingProduct(null);
    resetForm();
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground shadow-lg">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Package className="w-6 h-6" />
            <h1 className="text-2xl font-bold">Gestion des Produits</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
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
                    <DialogContent className="max-w-md">
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
                          <Input
                            id="category"
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            placeholder="Bordeaux Rouge"
                          />
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
            {filteredProducts.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Catégorie</TableHead>
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
      </main>
    </div>
  );
};

export default Products;
