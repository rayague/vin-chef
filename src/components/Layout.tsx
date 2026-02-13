import { ReactNode } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Package, Users, TrendingUp, FileText, LogOut, Layers, Warehouse, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import logger from '@/lib/logger';

const SidebarItem = ({ to, icon, label, collapsed }: { to: string; icon: ReactNode; label: string; collapsed?: boolean }) => {
  const loc = useLocation();
  const active = loc.pathname === to;
  return (
    <Link to={to} title={label} className={`flex items-center gap-3 px-4 py-3 rounded-md ${active ? 'bg-sidebar-primary/80 text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-primary/10'}`}>
      <span className="w-5 h-5">{icon}</span>
      {!collapsed && <span className="font-medium">{label}</span>}
    </Link>
  );
};

const Layout = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const sidebarWidth = collapsed ? '5rem' : '16rem';
  const logoSrc = `${import.meta.env.BASE_URL}logo_vin.jpeg`;

  if (import.meta.env.DEV) {
    // quick dev-only debug to help locate sidebar rendering issues
    logger.debug('[DEV] Layout sidebar rendered, collapsed=', collapsed, 'width=', sidebarWidth);
  }

  return (
    <div className="h-screen bg-background relative overflow-hidden">
      <aside
        className={`fixed left-0 top-0 bottom-0 flex flex-col transition-all duration-200 ease-in-out ${collapsed ? 'w-20' : 'w-64'} bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] border-r border-[hsl(var(--sidebar-border))] overflow-y-auto`}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width: sidebarWidth,
          zIndex: import.meta.env.DEV ? 9999 : 50,
          boxShadow: import.meta.env.DEV ? '2px 0 8px rgba(0,0,0,0.08)' : undefined,
          // visual fallback when Tailwind/PostCSS isn't applied: explicit background, border and height
          // Use the same HSL palette as `src/index.css` so colors match the design system
          backgroundColor: 'hsl(var(--sidebar-background))',
          color: 'hsl(var(--sidebar-foreground))',
          borderRight: '1px solid hsl(var(--sidebar-border))',
          minHeight: '100vh',
        }}
        data-dev-sidebar={import.meta.env.DEV ? '1' : '0'}
      >
        <div className="p-4 border-b border-[hsl(var(--sidebar-border))]">
          <div className="flex items-center gap-3">
            <img src={logoSrc} className="w-8 h-8 object-contain rounded-full" alt="Logo" />
            <div>
              <h2 className="text-lg font-bold text-[hsl(var(--sidebar-primary))]">Business Center Fifa</h2>
              <p className="text-sm opacity-90">{user?.username}</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-2">
          <div className="flex justify-end mb-2">
            <Button
              aria-label="Basculer la sidebar"
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-primary/15"
            >
              {collapsed ? '▶' : '◀'}
            </Button>
          </div>
          <div className="space-y-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <SidebarItem collapsed={collapsed} to="/dashboard" icon={<TrendingUp />} label="Tableau de bord" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Tableau de bord</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {user?.role === 'commercial' ? (
              <>
                <SidebarItem collapsed={collapsed} to="/sales" icon={<TrendingUp />} label="Ventes" />
                <SidebarItem collapsed={collapsed} to="/invoices" icon={<FileText />} label="Factures" />
                {/* Allow commerciaux to access Clients page */}
                <SidebarItem collapsed={collapsed} to="/customers" icon={<Users />} label="Clients" />
              </>
            ) : (
              <>
                <SidebarItem collapsed={collapsed} to="/products" icon={<Package />} label="Produits" />
                <SidebarItem collapsed={collapsed} to="/categories" icon={<Layers />} label="Catégories" />
                <SidebarItem collapsed={collapsed} to="/sales" icon={<TrendingUp />} label="Ventes" />
                <SidebarItem collapsed={collapsed} to="/reports" icon={<TrendingUp />} label="Rapports" />
                {user?.role === 'admin' && (
                  <>
                    <SidebarItem collapsed={collapsed} to="/stock" icon={<Warehouse />} label="Gestion de Stock" />
                    <SidebarItem collapsed={collapsed} to="/backups" icon={<Layers />} label="Sauvegardes" />
                    {/* <SidebarItem collapsed={collapsed} to="/audits" icon={<FileText />} label="Audit" /> */}
                    <SidebarItem collapsed={collapsed} to="/emcf" icon={<Settings />} label="Paramètres e-MCF" />
                    <SidebarItem collapsed={collapsed} to="/clients" icon={<Users />} label="Utilisateurs" />
                  </>
                )}
                {/* Clients (customers) page - visible to commercial and admin roles */}
                {(user?.role === 'admin' || user?.role === 'commercial') && (
                  <SidebarItem collapsed={collapsed} to="/customers" icon={<Users />} label="Clients" />
                )}
                <SidebarItem collapsed={collapsed} to="/invoices" icon={<FileText />} label="Factures" />
              </>
            )}
          </div>
        </nav>

        <div className="mt-auto p-4">
          <Dialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
            <DialogTrigger asChild>
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-md bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]">
                <LogOut className="w-4 h-4" />
                <span>Déconnexion</span>
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirmer la déconnexion</DialogTitle>
              </DialogHeader>
              <p>Voulez-vous vraiment vous déconnecter ?</p>
              <DialogFooter>
                <div className="flex gap-2 justify-end mt-4">
                  <Button variant="outline" onClick={() => setIsLogoutOpen(false)}>Annuler</Button>
                  <Button variant="destructive" onClick={() => { setIsLogoutOpen(false); logout(); }}>Déconnexion</Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </aside>

      <main className="transition-all p-6 h-screen overflow-y-auto" style={{ marginLeft: collapsed ? '5rem' : '16rem' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
