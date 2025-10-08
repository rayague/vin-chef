import React, { useEffect, useState, useCallback } from 'react';
import db from '@/lib/db';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

const BackupsPage: React.FC = () => {
  const [backups, setBackups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await db.listBackups();
      setBackups(Array.isArray(list) ? (list as string[]) : []);
    } catch (err) {
      console.error('listBackups error', err);
      toast({ title: 'Erreur', description: 'Impossible de lister les sauvegardes.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleRestore = (path: string) => {
    setRestorePath(path);
  };

  const confirmRestore = async () => {
    if (!restorePath) return;
    setRestoring(true);
    setProgress(10);
    try {
      // small fake progress while operations happen
      const res = await db.restoreDatabase(restorePath) as { success?: boolean; error?: string };
      setProgress(80);
      if (res && res.success) {
        // add audit entry for restore
        try { await db.addAudit('restore', 'database', restorePath, undefined, { restoredAt: new Date().toISOString() }); } catch (e) { /* ignore */ }
        setProgress(100);
        toast({ title: 'Succès', description: 'Base restaurée avec succès.' });
      } else {
        toast({ title: 'Échec', description: res?.error || 'Erreur lors de la restauration' });
      }
    } catch (err) {
      console.error('restore error', err);
      toast({ title: 'Échec', description: 'Erreur lors de la restauration' });
    } finally {
      setRestoring(false);
      setRestorePath(null);
      setTimeout(() => setProgress(0), 300);
      // refresh list after restore
      void load();
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Sauvegardes</h1>
      {loading && <p>Chargement...</p>}
      {!loading && backups.length === 0 && <p>Aucune sauvegarde disponible.</p>}
      <div className="space-y-2">
        {backups.map((b) => (
          <div key={b} className="flex items-center justify-between p-3 border rounded">
            <div className="truncate mr-4">{b}</div>
            <div className="flex items-center gap-2">
              {/* Download link: on desktop this is an absolute path; anchor will attempt to open it */}
              <a href={`file://${b}`} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Télécharger</a>
              <button onClick={() => handleRestore(b)} className="px-3 py-1 rounded bg-destructive text-white">Restaurer</button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!restorePath} onOpenChange={(v) => { if (!v) { setRestorePath(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la restauration</DialogTitle>
          </DialogHeader>
          <div className="py-2">Voulez-vous restaurer la sauvegarde sélectionnée ? Cette opération remplacera la base actuelle.</div>
          {restoring && <div className="my-2"><Progress value={progress} /></div>}
          <DialogFooter>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded" onClick={() => setRestorePath(null)} disabled={restoring}>Annuler</button>
              <button className="px-3 py-1 rounded bg-destructive text-white" onClick={() => confirmRestore()} disabled={restoring}>Restaurer</button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BackupsPage;
