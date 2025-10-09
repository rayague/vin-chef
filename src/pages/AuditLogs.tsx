import React, { useEffect, useState, useCallback } from 'react';
import db from '@/lib/db';
import { useToast } from '@/components/ui/use-toast';
import { User } from '@/lib/storage';

const AuditLogs: React.FC = () => {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, u] = await Promise.all([db.listAudits(), db.getUsers()]);
      setRows(list || []);
      setUsers((u as unknown as User[]) || []);
    } catch (err) {
      console.error('listAudits error', err);
      toast({ title: 'Erreur', description: 'Impossible de charger les logs.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Journal d'audit</h1>
      {loading && <p>Chargement...</p>}
      {!loading && rows.length === 0 && <p>Aucun log trouvé.</p>}
      <div className="space-y-2">
        {rows.map((r) => {
          const userId = (r as unknown as Record<string, unknown>)['user_id'] ?? (r as unknown as Record<string, unknown>)['userId'] ?? undefined;
          const user = users.find(u => u.id === userId);
          return (
            <div key={String(r.id ?? Math.random())} className="p-3 border rounded">
              <div className="text-sm text-muted mb-1">{String(r.created_at ?? r.createdAt ?? '')}</div>
              <div className="font-medium">{String(r.action ?? '')} — {String(r.entity ?? '')} {r.entity_id ? `(${String(r.entity_id)})` : ''}</div>
              {user && <div className="text-sm text-muted mt-1">Opéré par : <span className="font-medium">{user.username}</span></div>}
              {r.meta && <pre className="mt-2 text-xs bg-surface p-2 rounded overflow-auto">{JSON.stringify(r.meta, null, 2)}</pre>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AuditLogs;
