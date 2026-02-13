import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import db from '@/lib/db';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Package, Users, TrendingUp, FileText, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import PageContainer from '@/components/PageContainer';
import { fr } from 'date-fns/locale';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalSales: 0,
    totalProducts: 0,
    totalClients: 0,
    topProducts: [] as { name: string; sales: number }[],
  recentSales: [] as { id: string; date: string; totalPrice: number; productName: string; clientName: string }[],
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Calculate statistics using adapter (Electron / IndexedDB / storage)
    (async () => {
      const [sales, products, clients] = await Promise.all([db.getSales(), db.getProducts(), db.getClients()]);

      // If non-admin, only consider their sales
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allSales = (sales as unknown as any[]) || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visibleSales = user && user.role !== 'admin' ? allSales.filter(s => (s as any).createdBy === user.id) : allSales;

      const totalRevenue = visibleSales.reduce((sum, sale) => sum + (sale.totalPrice || 0), 0);
    
    // Calculate top products
    const productSales = new Map<string, number>();
      visibleSales.forEach(sale => {
        const current = productSales.get(sale.productId) || 0;
        productSales.set(sale.productId, current + sale.quantity);
      });

    const topProducts = Array.from(productSales.entries())
      .map(([productId, quantity]) => {
        const product = products.find(p => p.id === productId);
        return {
          name: product?.name || 'Unknown',
          sales: quantity,
        };
      })
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);

    // Recent sales
      const recentSales = visibleSales
        .slice()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .sort((a, b) => new Date((b as any).date).getTime() - new Date((a as any).date).getTime())
        .slice(0, 5)
        .map(sale => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const product = (products as any[]).find(p => p.id === (sale as any).productId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const client = (clients as any[]).find(c => c.id === (sale as any).clientId);
          return {
            ...sale,
            productName: product?.name || 'N/A',
            clientName: client?.name || 'N/A',
          };
        });

      setStats({
        totalRevenue,
        totalSales: visibleSales.length,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  totalProducts: (products as any[]).length,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  totalClients: (clients as any[]).length,
        topProducts,
        recentSales,
      });
    })();
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#8884d8', '#82ca9d'];

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <img src="/logo_vin.jpeg" className="w-10 h-10 object-contain rounded-full" alt="Logo" />
            <div>
              <h1 className="text-2xl font-bold">Business Center Fifa</h1>
              <p className="text-muted-foreground">Gestion de cave à vin</p>
            </div>
          </div>
        </div>
      </div>

      <PageContainer>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="font-semibold">{user?.username}</p>
            <p className="text-xs opacity-90">{user?.role === 'admin' ? 'Administrateur' : 'Commercial'}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
            <LogOut className="w-4 h-4 mr-2" />
            Déconnexion
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Chiffre d'affaires</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalRevenue.toLocaleString('fr-FR')} FCFA</div>
              <p className="text-xs text-muted-foreground">Total des ventes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ventes</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSales}</div>
              <p className="text-xs text-muted-foreground">Factures générées</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Produits</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProducts}</div>
              <p className="text-xs text-muted-foreground">En stock</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalClients}</div>
              <p className="text-xs text-muted-foreground">Actifs</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Button onClick={() => navigate('/products')} className="h-20 text-lg">
            <Package className="w-5 h-5 mr-2" />
            Produits
          </Button>
          <Button onClick={() => navigate('/clients')} className="h-20 text-lg">
            <Users className="w-5 h-5 mr-2" />
            Clients
          </Button>
          <Button onClick={() => navigate('/sales')} className="h-20 text-lg">
            <TrendingUp className="w-5 h-5 mr-2" />
            Ventes
          </Button>
          <Button onClick={() => navigate('/invoices')} className="h-20 text-lg">
            <FileText className="w-5 h-5 mr-2" />
            Factures
          </Button>
        </div> */}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Produits les plus vendus</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats.topProducts}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="sales" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">Aucune donnée disponible</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Répartition des ventes</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={stats.topProducts}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: unknown) => {
                        const e = entry as { name?: string; percent?: number };
                        return `${e.name || ''} ${((e.percent || 0) * 100).toFixed(0)}%`;
                      }}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="sales"
                    >
                      {stats.topProducts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">Aucune donnée disponible</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <CardTitle>Ventes récentes</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentSales.length > 0 ? (
              <div className="space-y-4">
                {stats.recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between border-b pb-4">
                    <div>
                      <p className="font-medium">{sale.productName}</p>
                      <p className="text-sm text-muted-foreground">{sale.clientName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{sale.totalPrice.toLocaleString('fr-FR')} FCFA</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(sale.date), 'dd MMM yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Aucune vente enregistrée</p>
            )}
          </CardContent>
        </Card>
      </PageContainer>
    </div>
  );
};

export default Dashboard;
