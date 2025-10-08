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
import { Plus, Edit, Trash2, ArrowLeft, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';

type User = { id: string; username: string; role: string; created_at?: string; email?: string; phone?: string };

const UsersPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    phone: '',
    password: '',
    role: 'commercial',
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadUsers();
  }, [user, navigate]);

  const loadUsers = async () => {
    const list = await db.getUsers();
    setUsers(list as User[]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!formData.username) {
      toast({ title: 'Erreur', description: 'Le nom d\'utilisateur est requis', variant: 'destructive' });
      return;
    }
    if (!editingUser && (!formData.password || formData.password.length < 6)) {
      toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 6 caractères', variant: 'destructive' });
      return;
    }
    if (formData.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formData.email)) {
      toast({ title: 'Erreur', description: 'Email invalide', variant: 'destructive' });
      return;
    }

    const userData: User = {
      id: editingUser?.id || Date.now().toString(),
      username: formData.username,
      role: formData.role,
      email: formData.email,
      phone: formData.phone,
    };

    setSaving(true);
    try {
      if (editingUser) {
        await db.updateUser(editingUser.id, { username: formData.username, password: formData.password || undefined, role: formData.role });
        toast({ title: 'Succès', description: 'Utilisateur mis à jour' });
      } else {
        await db.addUser({ id: userData.id, username: userData.username, password: formData.password || 'changeme', role: userData.role });
        toast({ title: 'Succès', description: 'Utilisateur ajouté' });
      }
    } catch (err) {
      console.error('user save error', err);
      toast({ title: 'Erreur', description: 'Impossible d\'enregistrer l\'utilisateur', variant: 'destructive' });
    } finally {
      setSaving(false);
    }

    setIsDialogOpen(false);
    setEditingUser(null);
    resetForm();
    loadUsers();
  };

  const handleEdit = (u: User) => {
    setEditingUser(u);
    setFormData({ username: u.username, email: u.email || '', phone: u.phone || '', password: '', role: u.role || 'commercial' });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    // Use dialog-driven confirmation instead of native confirm
    setDeleteTarget(id);
  };

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await db.deleteUser(deleteTarget);
      toast({ title: 'Succès', description: 'Utilisateur supprimé' });
      loadUsers();
    } catch (err) {
      console.error('delete user error', err);
      toast({ title: 'Erreur', description: 'Impossible de supprimer l\'utilisateur', variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const resetForm = () => {
    setFormData({ username: '', email: '', phone: '', password: '', role: 'commercial' });
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingUser(null);
    resetForm();
  };

  const filtered = users.filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase()) || (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <PageContainer>
      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Voulez-vous vraiment supprimer cet utilisateur ? Cette action est irréversible.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button>
              <Button variant="destructive" onClick={confirmDelete}>Supprimer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <PageHeader title="Gestion des Utilisateurs" subtitle="Comptes et accès" actions={
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
      } />

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <CardTitle>Utilisateurs</CardTitle>
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                <Input
                  placeholder="Rechercher un utilisateur..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-64"
                />
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { resetForm(); setEditingUser(null); }}>
                      <Plus className="w-4 h-4 mr-2" />
                      Nouvel utilisateur
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>{editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="username">Nom d\'utilisateur *</Label>
                        <Input
                          id="username"
                          value={formData.username}
                          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          placeholder="admin"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="user@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Téléphone</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="+229 97 00 00 00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Mot de passe {editingUser ? '(laisser vide pour ne pas changer)' : '*'}</Label>
                        <Input
                          id="password"
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role">Rôle</Label>
                        <Input id="role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={handleDialogClose} disabled={saving}>
                          Annuler
                        </Button>
                        <Button type="submit" disabled={saving}>
                          {saving ? 'Enregistrement...' : (editingUser ? 'Mettre à jour' : 'Ajouter')}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom d\'utilisateur</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.username}</TableCell>
                        <TableCell>{u.role}</TableCell>
                        <TableCell>{u.email || '-'}</TableCell>
                        <TableCell>{u.phone || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => handleEdit(u)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(u.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{searchTerm ? 'Aucun utilisateur trouvé' : 'Aucun utilisateur enregistré'}</p>
              </div>
            )}
          </CardContent>
        </Card>
    </PageContainer>
  );
};

export default UsersPage;
