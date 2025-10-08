import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import db from '@/lib/db';
import { Plus, Edit, Trash2, ArrowLeft, Layers } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';

const Categories = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  type Category = { id: string; name: string; description?: string };
  const [categories, setCategories] = useState<Category[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; description?: string } | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    (async () => {
      const list = await db.getCategories();
      setCategories(list as Category[]);
    })();
  }, [user, navigate]);

  const load = async () => {
    const list = await db.getCategories();
    setCategories(list as Category[]);
  };

  const resetForm = () => setForm({ name: '', description: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      toast({ title: 'Erreur', description: 'Le nom est requis', variant: 'destructive' });
      return;
    }

    const payload = {
      id: editing?.id || Date.now().toString(),
      name: form.name,
      description: form.description || undefined,
    };

    if (editing) {
      await db.updateCategory(editing.id, payload as Category);
      toast({ title: 'Succès', description: 'Catégorie mise à jour' });
    } else {
      await db.addCategory(payload as Category);
      toast({ title: 'Succès', description: 'Catégorie ajoutée' });
    }

    setIsDialogOpen(false);
    setEditing(null);
    resetForm();
    load();
  };

  const handleEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, description: c.description || '' });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Supprimer cette catégorie ?')) {
      await db.deleteCategory(id);
      toast({ title: 'Succès', description: 'Catégorie supprimée' });
      load();
    }
  };

  const filtered = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <PageContainer>
      <PageHeader title="Gestion des Catégories" subtitle="Ajouter et gérer les catégories" actions={
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
      } />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Catégories</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {user?.role === 'admin' && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { resetForm(); setEditing(null); }}>
                      <Plus className="w-4 h-4 mr-2" /> Nouvelle catégorie
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>{editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Nom *</Label>
                        <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Input id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setEditing(null); resetForm(); }}>Annuler</Button>
                        <Button type="submit">{editing ? 'Mettre à jour' : 'Ajouter'}</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Description</TableHead>
                    {user?.role === 'admin' && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.description}</TableCell>
                      {user?.role === 'admin' && (
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => handleEdit(c)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(c.id)}>
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
              <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{search ? 'Aucune catégorie trouvée' : 'Aucune catégorie disponible'}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default Categories;
