import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import db from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const Reports = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  type SaleShape = { id: string; product_id?: string; productId?: string; quantity?: number; total_price?: number; totalPrice?: number; date?: string };
  type ProductShape = { id: string; name?: string };
  const [sales, setSales] = useState<SaleShape[]>([]);
  const [products, setProducts] = useState<ProductShape[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [productFilter, setProductFilter] = useState<string>('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    (async () => {
      const [s, p] = await Promise.all([db.getSales(), db.getProducts()]);
      setSales(s as SaleShape[]);
      setProducts(p as ProductShape[]);
    })();
  }, [user, navigate]);

  const filteredSales = useMemo(() => {
    let out = sales;
    if (productFilter) {
      out = out.filter(s => (s.product_id ?? s.productId ?? '') === productFilter);
    }
    if (!startDate && !endDate) return out;
    const s = startDate ? new Date(startDate) : null;
    const e = endDate ? new Date(endDate) : null;
    return out.filter(sale => {
      const d = sale.date ? new Date(sale.date) : new Date();
      if (s && d < s) return false;
      if (e) {
        const dayEnd = new Date(e);
        dayEnd.setHours(23,59,59,999);
        if (d > dayEnd) return false;
      }
      return true;
    });
  }, [sales, startDate, endDate, productFilter]);

  const totalRevenue = filteredSales.reduce((acc, cur) => acc + (cur.total_price ?? cur.totalPrice ?? 0), 0);
  const totalSales = filteredSales.length;

  // compute top products by count
  const counts: Record<string, number> = {};
  filteredSales.forEach(s => { const id = s.product_id ?? s.productId ?? ''; if (!id) return; counts[id] = (counts[id] || 0) + (s.quantity || 1); });
  const top = Object.entries(counts).map(([id, qty]) => ({ id, qty, product: products.find(p => p.id === id) })).sort((a,b) => b.qty - a.qty).slice(0,5);

  const exportCsv = (salesToExport: SaleShape[]) => {
    const headers = ['id', 'product_id', 'quantity', 'total_price', 'date'];
    const rows = salesToExport.map(s => [s.id, s.product_id ?? s.productId ?? '', String(s.quantity ?? ''), String(s.total_price ?? s.totalPrice ?? ''), s.date ?? '']);
    const csv = [headers.join(','), ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""') }"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vin-chef-rapports-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <PageContainer>
      <PageHeader title="Rapports" subtitle="Résumé des ventes" actions={<button className="btn-ghost" onClick={() => navigate('/dashboard')}><ArrowLeft className="w-5 h-5"/></button>} />
      <div className="flex gap-2 items-center mb-4">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="border rounded px-2 py-1">
          <option value="">-- Filtrer par produit --</option>
          {products.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </select>
        <Button onClick={() => { setStartDate(''); setEndDate(''); }}>Réinitialiser</Button>
        <Button onClick={() => exportCsv(filteredSales)}>Exporter CSV</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total CA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRevenue.toLocaleString('fr-FR')} FCFA</div>
            <div className="text-sm text-muted-foreground">{totalSales} ventes</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top produits</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Produit</TableHead><TableHead>Quantité</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {top.map(t => (
                  <TableRow key={t.id}><TableCell>{t.product?.name || t.id}</TableCell><TableCell>{t.qty}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
};

export default Reports;
