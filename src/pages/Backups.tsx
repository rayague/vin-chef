import React, { useEffect, useState, useCallback } from 'react';
import db from '@/lib/db';
import { useToast } from '@/components/ui/use-toast';
import logger from '@/lib/logger';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

const BackupsPage: React.FC = () => {
  const [backups, setBackups] = useState<string[]>([]);
  const [dbInfo, setDbInfo] = useState<null | {
    exists?: boolean;
    path?: string;
    sizeBytes?: number;
    mtimeIso?: string | null;
    backupsCount?: number;
  }>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const isDesktop = typeof window !== 'undefined' && !!(window as unknown as Window).electronAPI?.db;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!isDesktop) {
        setBackups([]);
        setDbInfo(null);
        return;
      }
      const [list, info] = await Promise.all([
        db.listBackups(),
        db.getDatabaseInfo(),
      ]);
      setBackups(Array.isArray(list) ? (list as string[]) : []);
      const anyInfo = info as { success?: boolean; exists?: boolean; path?: string; sizeBytes?: number; mtimeIso?: string | null; backupsCount?: number };
      if (anyInfo && anyInfo.success) {
        setDbInfo({
          exists: anyInfo.exists,
          path: anyInfo.path,
          sizeBytes: anyInfo.sizeBytes,
          mtimeIso: anyInfo.mtimeIso ?? null,
          backupsCount: anyInfo.backupsCount,
        });
      } else {
        setDbInfo(null);
      }
    } catch (err) {
      logger.error('listBackups error', err);
      toast({ title: 'Erreur', description: 'Impossible de lister les sauvegardes.' });
    } finally {
      setLoading(false);
    }
  }, [toast, isDesktop]);

  const formatBytes = (n?: number) => {
    const v = Number(n || 0);
    if (!Number.isFinite(v) || v <= 0) return '0 B';
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;
    if (v >= gb) return `${(v / gb).toFixed(2)} GB`;
    if (v >= mb) return `${(v / mb).toFixed(2)} MB`;
    if (v >= kb) return `${(v / kb).toFixed(2)} KB`;
    return `${Math.round(v)} B`;
  };

  useEffect(() => {
    void load();
  }, [load]);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleRestore = (path: string) => {
    setRestorePath(path);
  };

  const handleImportDatabase = async () => {
    if (!isDesktop) {
      toast({ title: 'Non disponible', description: "Disponible uniquement dans l'application Electron." });
      return;
    }
    setImporting(true);
    try {
      const picked = await db.pickRestoreFile() as { success?: boolean; path?: string; canceled?: boolean; error?: string };
      if (!picked || picked.canceled) return;
      if (!picked.success || !picked.path) {
        toast({ title: 'Échec', description: picked?.error || 'Impossible de sélectionner le fichier.' });
        return;
      }

      setRestoring(true);
      setProgress(10);
      const res = await db.restoreDatabase(picked.path) as { success?: boolean; error?: string };
      setProgress(80);
      if (res && res.success) {
        try { await db.addAudit('restore', 'database', picked.path, undefined, { restoredAt: new Date().toISOString(), source: 'import' }); } catch (e) { /* ignore */ }
        setProgress(100);
        toast({ title: 'Succès', description: 'Base importée et restaurée avec succès.' });
      } else {
        toast({ title: 'Échec', description: res?.error || 'Erreur lors de la restauration' });
      }
    } catch (err) {
      logger.error('import database error', err);
      toast({ title: 'Échec', description: 'Erreur lors de l\'import de la base.' });
    } finally {
      setImporting(false);
      setRestoring(false);
      setTimeout(() => setProgress(0), 300);
      void load();
    }
  };

  const handleCreateBackup = async () => {
    if (!isDesktop) {
      toast({ title: 'Non disponible', description: "Disponible uniquement dans l'application Electron." });
      return;
    }
    setCreating(true);
    try {
      const res = await db.backupDatabase() as { success?: boolean; path?: string; error?: string };
      if (res && res.success) {
        try { await db.addAudit('backup', 'database', res.path || 'backup', undefined, { createdAt: new Date().toISOString() }); } catch (e) { /* ignore */ }
        toast({ title: 'Succès', description: 'Sauvegarde créée avec succès.' });
        void load();
      } else {
        toast({ title: 'Échec', description: res?.error || 'Impossible de créer la sauvegarde.' });
      }
    } catch (err) {
      logger.error('backup error', err);
      toast({ title: 'Échec', description: 'Erreur lors de la création de la sauvegarde.' });
    } finally {
      setCreating(false);
    }
  };

  const handleExportDatabase = async () => {
    if (!isDesktop) {
      toast({ title: 'Non disponible', description: "Disponible uniquement dans l'application Electron." });
      return;
    }
    setExporting(true);
    try {
      const res = await db.exportDatabaseAs() as { success?: boolean; path?: string; canceled?: boolean; error?: string };
      if (res && res.canceled) return;
      if (res && res.success) {
        try { await db.addAudit('export', 'database', res.path || 'export', undefined, { exportedAt: new Date().toISOString() }); } catch (e) { /* ignore */ }
        toast({ title: 'Succès', description: 'Base exportée avec succès.' });
      } else {
        toast({ title: 'Échec', description: res?.error || "Impossible d'exporter la base." });
      }
    } catch (err) {
      logger.error('export database error', err);
      toast({ title: 'Échec', description: "Erreur lors de l'export de la base." });
    } finally {
      setExporting(false);
    }
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
      logger.error('restore error', err);
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
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Sauvegardes</h1>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded bg-secondary text-secondary-foreground disabled:opacity-60"
            onClick={() => void handleExportDatabase()}
            disabled={!isDesktop || loading || creating || restoring || importing || exporting}
          >
            {exporting ? 'Export…' : 'Extraire la base'}
          </button>
          <button
            className="px-3 py-1 rounded bg-secondary text-secondary-foreground disabled:opacity-60"
            onClick={() => void handleImportDatabase()}
            disabled={!isDesktop || loading || creating || restoring || importing}
          >
            {importing ? 'Import…' : 'Importer une base'}
          </button>
          <button
            className="px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-60"
            onClick={() => void handleCreateBackup()}
            disabled={!isDesktop || loading || creating || restoring || importing || exporting}
          >
            {creating ? 'Création…' : 'Créer une sauvegarde'}
          </button>
        </div>
      </div>
      {!isDesktop && (
        <div className="mb-4 rounded border p-3 text-sm text-muted-foreground">
          Disponible uniquement dans l'application Electron.
        </div>
      )}

      {isDesktop && dbInfo && (
        <div className="mb-4 rounded border p-3 text-sm">
          <div className="font-semibold mb-2">Informations base de données</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <div className="text-muted-foreground">Chemin</div>
              <div className="break-all">{dbInfo.path || '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Taille</div>
              <div>{formatBytes(dbInfo.sizeBytes)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Dernière modification</div>
              <div>{dbInfo.mtimeIso ? new Date(dbInfo.mtimeIso).toLocaleString('fr-FR') : '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Sauvegardes disponibles</div>
              <div>{typeof dbInfo.backupsCount === 'number' ? dbInfo.backupsCount : '—'}</div>
            </div>
          </div>
        </div>
      )}

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
