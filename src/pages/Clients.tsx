import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Client, getClients, addClient, updateClient, deleteClient } from '@/lib/storage';
import { Plus, Edit, Trash2, ArrowLeft, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Clients = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    contactInfo: '',
    email: '',
    phone: '',
    address: '',
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadClients();
  }, [user, navigate]);

  const loadClients = () => {
    setClients(getClients());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.contactInfo) {
      toast({
        title: 'Erreur',
        description: 'Veuillez remplir tous les champs obligatoires',
        variant: 'destructive',
      });
      return;
    }

    const clientData: Client = {
      id: editingClient?.id || Date.now().toString(),
      name: formData.name,
      contactInfo: formData.contactInfo,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
    };

    if (editingClient) {
      updateClient(editingClient.id, clientData);
      toast({
        title: 'Succès',
        description: 'Client mis à jour avec succès',
      });
    } else {
      addClient(clientData);
      toast({
        title: 'Succès',
        description: 'Client ajouté avec succès',
      });
    }

    setIsDialogOpen(false);
    setEditingClient(null);
    resetForm();
    loadClients();
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      contactInfo: client.contactInfo,
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) {
      deleteClient(id);
      toast({
        title: 'Succès',
        description: 'Client supprimé avec succès',
      });
      loadClients();
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contactInfo: '',
      email: '',
      phone: '',
      address: '',
    });
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingClient(null);
    resetForm();
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.contactInfo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground shadow-lg">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Users className="w-6 h-6" />
            <h1 className="text-2xl font-bold">Gestion des Clients</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <CardTitle>Liste des Clients</CardTitle>
              <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                <Input
                  placeholder="Rechercher un client..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-64"
                />
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { resetForm(); setEditingClient(null); }}>
                      <Plus className="w-4 h-4 mr-2" />
                      Nouveau Client
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>{editingClient ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Nom du client *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Restaurant Le Gourmet"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contactInfo">Contact principal *</Label>
                        <Input
                          id="contactInfo"
                          value={formData.contactInfo}
                          onChange={(e) => setFormData({ ...formData, contactInfo: e.target.value })}
                          placeholder="+229 97 00 00 00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder="contact@example.com"
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
                        <Label htmlFor="address">Adresse</Label>
                        <Input
                          id="address"
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          placeholder="Cotonou, Bénin"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={handleDialogClose}>
                          Annuler
                        </Button>
                        <Button type="submit">
                          {editingClient ? 'Mettre à jour' : 'Ajouter'}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredClients.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Adresse</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">{client.name}</TableCell>
                        <TableCell>{client.contactInfo}</TableCell>
                        <TableCell>{client.email || '-'}</TableCell>
                        <TableCell>{client.phone || '-'}</TableCell>
                        <TableCell>{client.address || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => handleEdit(client)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(client.id)}>
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
                <p>{searchTerm ? 'Aucun client trouvé' : 'Aucun client enregistré'}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Clients;
