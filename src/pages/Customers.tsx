import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import db from '@/lib/db';
import logger from '@/lib/logger';
import { Client } from '@/lib/storage';
import { useToast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';

const Customers = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', discount: '', discountType: 'percentage' as 'percentage' | 'fixed' });

  const load = async () => {
    const c = await db.getClients();
    setClients((c as Client[]) || []);
  };

  useEffect(() => {
    load();
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail as { entity: string } | undefined;
        if (!detail) return;
        if (detail.entity === 'clients' || detail.entity === 'categories' || detail.entity === 'products' || detail.entity === 'sales') load();
      } catch (e) {
        // ignore
      }
    };
    window.addEventListener('vinchef:data-changed', handler as EventListener);
    return () => window.removeEventListener('vinchef:data-changed', handler as EventListener);
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
                    <TableHead>Remise</TableHead>
                    <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id} className={c.id === highlightedId ? 'bg-yellow-100' : undefined}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.phone || '-'}</TableCell>
                      <TableCell>
                        {(() => {
                          if (c.discount === undefined || c.discount === null) return <span className="text-muted-foreground">-</span>;
                          const label = c.discountType === 'percentage' ? `${c.discount}%` : `${Number(c.discount).toLocaleString('fr-FR')} FCFA`;
                          return (
                            <div className="flex items-center gap-3">
                              <Badge variant="secondary">{label}</Badge>
                              <span className="text-sm font-medium">{label}</span>
                            </div>
                          );
                        })()}
                      </TableCell>
                        <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => navigate('/sales', { state: { clientId: c.id } })}>Vendre</Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          // open edit modal
                          const [last, first] = (c.name || '').split(/\s+/, 2).concat(['']).slice(0,2);
                          setForm({ firstName: first || '', lastName: last || '', phone: c.phone || '', discount: c.discount ? String(c.discount) : '', discountType: c.discountType || 'percentage' });
                          setEditingId(c.id);
                          setIsEditing(true);
                        }}>Modifier</Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(c.id)}>Supprimer</Button>
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
          <div className="bg-card p-6 rounded w-[900px] max-w-[95%]">
            <h3 className="text-lg font-semibold mb-2">{isEditing ? 'Modifier le client' : 'Nouveau client'}</h3>
            <p className="text-sm text-muted-foreground mb-4">Seuls nom, prénom et téléphone sont requis. Vous pouvez aussi définir une remise client (pourcentage ou montant fixe).</p>
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
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div>
                <Label>Type de remise</Label>
                <select className="input" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as 'percentage' | 'fixed' })}>
                  <option value="percentage">Pourcentage (%)</option>
                  <option value="fixed">Montant fixe (FCFA)</option>
                </select>
              </div>
              <div>
                <Label>Valeur de la remise</Label>
                <Input type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} placeholder={form.discountType === 'percentage' ? 'Ex: 10' : 'Ex: 5000'} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsAdding(false); setIsEditing(false); setEditingId(null); setForm({ firstName: '', lastName: '', phone: '', discount: '', discountType: 'percentage' }); }}>Annuler</Button>
              <Button onClick={async () => {
                const fullName = `${(form.lastName||'').trim()} ${(form.firstName||'').trim()}`.trim() || 'Client';
                if (isEditing && editingId) {
                  try {
                    const updated = await db.updateClient(editingId, { name: fullName, phone: form.phone || undefined, discount: form.discount ? parseFloat(form.discount) : undefined, discountType: form.discount ? form.discountType : undefined });
                    // Immediately update local state so UI reflects changes even if underlying storage is slow
                    if (updated) {
                      setClients(prev => (prev || []).map(c => c.id === editingId ? (updated as Client) : c));
                      // debug log and highlight the updated row briefly
                      console.log('Client updated (local):', updated);
                      setHighlightedId(editingId);
                      setTimeout(() => setHighlightedId(null), 2000);
                    }
                    toast({ title: 'Modifié', description: 'Client modifié' });
                    setIsEditing(false);
                    setEditingId(null);
                    setForm({ firstName: '', lastName: '', phone: '', discount: '', discountType: 'percentage' });
                    // Reload to ensure persistence sources are in sync
                    load();
                  } catch (err) {
                    logger.error('Failed to update client', err);
                    toast({ title: 'Erreur', description: 'Impossible de modifier le client', variant: 'destructive' });
                  }
                } else {
                  const client: Client = {
                    id: Date.now().toString(),
                    name: fullName,
                    contactInfo: '',
                    phone: form.phone || undefined,
                    discount: form.discount ? parseFloat(form.discount) : undefined,
                    discountType: form.discount ? form.discountType : undefined,
                  } as Client;
                  try {
                    await db.addClient(client);
                    toast({ title: 'Succès', description: 'Client ajouté' });
                    setIsAdding(false);
                    setForm({ firstName: '', lastName: '', phone: '', discount: '', discountType: 'percentage' });
                    load();
                  } catch (err) {
                    logger.error('Failed to add client', err);
                    toast({ title: 'Erreur', description: 'Impossible d\'ajouter le client', variant: 'destructive' });
                  }
                }
              }}>{isEditing ? 'Enregistrer' : 'Ajouter'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <div>
        {/* simple fixed dialog pattern */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-card p-6 rounded w-[420px]">
              <h3 className="text-lg font-semibold mb-2">Confirmer la suppression</h3>
              <p className="text-sm text-muted-foreground mb-4">Voulez-vous vraiment supprimer ce client ? Cette action est irréversible.</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button>
                <Button variant="destructive" onClick={async () => {
                  try {
                    await db.deleteClient(deleteTarget);
                    toast({ title: 'Supprimé', description: 'Client supprimé' });
                    setDeleteTarget(null);
                    load();
                  } catch (err) {
                    logger.error('Failed to delete client', err);
                    toast({ title: 'Erreur', description: 'Impossible de supprimer le client', variant: 'destructive' });
                  }
                }}>Supprimer</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default Customers;
