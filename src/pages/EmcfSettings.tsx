import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, ArrowLeft, Settings, CheckCircle, Link as LinkIcon } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import logger from '@/lib/logger';
import emcf, { EmcfPointOfSaleSummary } from '@/lib/emcf';

import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type PosFormState = {
  name: string;
  baseUrl: string;
  token: string;
};

const EmcfSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [pointsOfSale, setPointsOfSale] = useState<EmcfPointOfSaleSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmcfPointOfSaleSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [testingPosId, setTestingPosId] = useState<string | null>(null);

  const [form, setForm] = useState<PosFormState>({ name: '', baseUrl: '', token: '' });

  const activePos = useMemo(() => pointsOfSale.find((p) => p.isActive) || null, [pointsOfSale]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await emcf.listPointsOfSale();
      setPointsOfSale(Array.isArray(list) ? list : []);
    } catch (err) {
      logger.error('emcf.listPointsOfSale failed', err);
      toast({ title: 'Erreur', description: "Impossible de charger la configuration e-MCF", variant: 'destructive' });
      setPointsOfSale([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!emcf.isAvailable()) {
      toast({
        title: 'Non disponible',
        description: "L'API e-MCF est disponible uniquement dans l'application Electron.",
        variant: 'destructive',
      });
      setPointsOfSale([]);
      return;
    }
    void load();
  }, [user, navigate, toast, load]);

  const resetForm = () => setForm({ name: '', baseUrl: '', token: '' });

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const openEdit = (pos: EmcfPointOfSaleSummary) => {
    setEditing(pos);
    setForm({ name: pos.name, baseUrl: pos.baseUrl, token: '' });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.baseUrl.trim()) {
      toast({ title: 'Erreur', description: 'Nom et URL de base sont requis', variant: 'destructive' });
      return;
    }

    try {
      const payload: { id: string; name: string; baseUrl: string; token?: string } = {
        id: editing?.id || Date.now().toString(),
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
      };
      if (form.token.trim()) payload.token = form.token.trim();

      await emcf.upsertPointOfSale(payload);
      toast({ title: 'Succès', description: editing ? 'Point de vente mis à jour' : 'Point de vente ajouté' });
      setIsDialogOpen(false);
      setEditing(null);
      resetForm();
      await load();
    } catch (err) {
      logger.error('emcf.upsertPointOfSale failed', err);
      toast({ title: 'Erreur', description: "Impossible d'enregistrer le point de vente", variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await emcf.deletePointOfSale(id);
      toast({ title: 'Succès', description: 'Point de vente supprimé' });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      logger.error('emcf.deletePointOfSale failed', err);
      toast({ title: 'Erreur', description: 'Impossible de supprimer le point de vente', variant: 'destructive' });
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await emcf.setActivePointOfSale(id);
      toast({ title: 'Succès', description: 'Point de vente actif mis à jour' });
      await load();
    } catch (err) {
      logger.error('emcf.setActivePointOfSale failed', err);
      toast({ title: 'Erreur', description: "Impossible d'activer ce point de vente", variant: 'destructive' });
    }
  };

  const handleTestStatus = async (posId?: string | null) => {
    const pid = posId || null;
    setTestingPosId(pid);
    try {
      const res = await emcf.status(pid ? { posId: pid } : undefined);
      const desc = typeof res === 'string' ? res : JSON.stringify(res);
      toast({ title: 'Status e-MCF', description: desc.length > 220 ? `${desc.slice(0, 220)}…` : desc });
    } catch (err) {
      logger.error('emcf.status failed', err);
      toast({ title: 'Erreur', description: "Appel /status échoué", variant: 'destructive' });
    } finally {
      setTestingPosId(null);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Paramètres e-MCF"
        subtitle="Configurer les points de vente DGI et sélectionner le point de vente actif"
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Points de vente e-MCF
              </CardTitle>
              <div className="text-sm text-muted-foreground">
                {activePos ? (
                  <span>
                    Actif: <span className="font-medium">{activePos.name}</span>
                  </span>
                ) : (
                  <span>Aucun point de vente actif</span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void handleTestStatus(activePos?.id || null)} disabled={!activePos || testingPosId !== null}>
                Tester /status
              </Button>

              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nouveau
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editing ? 'Modifier le point de vente' : 'Nouveau point de vente'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="pos-name">Nom *</Label>
                      <Input id="pos-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="PDV Cotonou" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pos-base-url">Base URL *</Label>
                      <Input id="pos-base-url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.dgi..." />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pos-token">Token JWT {editing ? '(laisser vide pour ne pas changer)' : ''}</Label>
                      <Input id="pos-token" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder={editing ? '••••••••' : 'eyJhbGci...'} />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsDialogOpen(false);
                          setEditing(null);
                          resetForm();
                        }}
                      >
                        Annuler
                      </Button>
                      <Button type="submit">{editing ? 'Mettre à jour' : 'Ajouter'}</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Chargement…</div>
          ) : pointsOfSale.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucun point de vente configuré</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Base URL</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Actif</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pointsOfSale.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="max-w-[380px] truncate">
                        <div className="flex items-center gap-2">
                          <LinkIcon className="w-4 h-4 opacity-70" />
                          <span className="truncate">{p.baseUrl}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.hasToken ? (
                          <div className="flex gap-2 items-center">
                            <Badge variant="secondary">Configuré</Badge>
                            {p.tokenEncrypted ? <Badge variant="outline">Chiffré</Badge> : <Badge variant="outline">Non chiffré</Badge>}
                          </div>
                        ) : (
                          <Badge variant="destructive">Manquant</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.isActive ? (
                          <Badge className="gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Actif
                          </Badge>
                        ) : (
                          <Badge variant="outline">—</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {!p.isActive && (
                            <Button size="sm" variant="outline" onClick={() => void handleSetActive(p.id)}>
                              Définir actif
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => void handleTestStatus(p.id)} disabled={testingPosId !== null}>
                            Tester
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(p.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-card p-6 rounded w-[420px]">
            <h3 className="text-lg font-semibold mb-2">Confirmer la suppression</h3>
            <p className="text-sm text-muted-foreground mb-4">Voulez-vous vraiment supprimer ce point de vente ? Cette action est irréversible.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={() => void handleDelete(deleteTarget)}>
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default EmcfSettings;
