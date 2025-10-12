import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import db from '@/lib/db';
import { Client } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';

const Customers = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });

  const load = async () => {
    const c = await db.getClients();
    setClients((c as Client[]) || []);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = clients.filter(c => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (c.name || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q);
  });

  return (
    <PageContainer>
      <PageHeader title="Clients" subtitle="Rechercher, ajouter ou démarrer une vente" actions={
        <div className="flex items-center gap-2">
          <Input placeholder="Rechercher par nom ou téléphone" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nouveau
          </Button>
        </div>
      } />

      <Card>
        <CardHeader>
          <CardTitle>Liste des clients ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.phone || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => navigate('/sales', { state: { clientId: c.id } })}>Vendre</Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          // open edit modal
                          // split name into last/first by first space heuristic
                          const [last, first] = (c.name || '').split(/\s+/, 2).concat(['']).slice(0,2);
                          setForm({ firstName: first || '', lastName: last || '', phone: c.phone || '' });
                          setEditingId(c.id);
                          setIsEditing(true);
                        }}>Modifier</Button>
                        <Button size="sm" variant="destructive" onClick={async () => {
                          if (!confirm(`Supprimer le client "${c.name}" ? Cette action est irréversible.`)) return;
                          try {
                            await db.deleteClient(c.id);
                            toast({ title: 'Supprimé', description: 'Client supprimé' });
                            load();
                          } catch (err) {
                            console.error('Failed to delete client', err);
                            toast({ title: 'Erreur', description: 'Impossible de supprimer le client', variant: 'destructive' });
                          }
                        }}>Supprimer</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-8 text-muted-foreground">Aucun client trouvé</p>
          )}
        </CardContent>
      </Card>

      {(isAdding || isEditing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-card p-6 rounded w-[600px]">
            <h3 className="text-lg font-semibold mb-2">{isEditing ? 'Modifier le client' : 'Nouveau client'}</h3>
            <p className="text-sm text-muted-foreground mb-4">Seuls nom, prénom et téléphone sont requis.</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <Label>Nom</Label>
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div>
                <Label>Prénom</Label>
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
            </div>
            <div className="mb-4">
              <Label>Téléphone</Label>
              <Input placeholder="+229 97 00 00 00" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsAdding(false); setIsEditing(false); setEditingId(null); setForm({ firstName: '', lastName: '', phone: '' }); }}>Annuler</Button>
              <Button onClick={async () => {
                const fullName = `${(form.lastName||'').trim()} ${(form.firstName||'').trim()}`.trim() || 'Client';
                if (isEditing && editingId) {
                  try {
                    await db.updateClient(editingId, { name: fullName, phone: form.phone || undefined });
                    toast({ title: 'Modifié', description: 'Client modifié' });
                    setIsEditing(false);
                    setEditingId(null);
                    setForm({ firstName: '', lastName: '', phone: '' });
                    load();
                  } catch (err) {
                    console.error('Failed to update client', err);
                    toast({ title: 'Erreur', description: 'Impossible de modifier le client', variant: 'destructive' });
                  }
                } else {
                  const client: Client = {
                    id: Date.now().toString(),
                    name: fullName,
                    contactInfo: '',
                    phone: form.phone || undefined,
                  } as Client;
                  try {
                    await db.addClient(client);
                    toast({ title: 'Succès', description: 'Client ajouté' });
                    setIsAdding(false);
                    setForm({ firstName: '', lastName: '', phone: '' });
                    load();
                  } catch (err) {
                    console.error('Failed to add client', err);
                    toast({ title: 'Erreur', description: 'Impossible d\'ajouter le client', variant: 'destructive' });
                  }
                }
              }}>{isEditing ? 'Enregistrer' : 'Ajouter'}</Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default Customers;
