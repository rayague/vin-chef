import { useState, useRef } from 'react';
import bcrypt from 'bcryptjs';
import { useNavigate } from 'react-router-dom';
import logger from '@/lib/logger';
import { useAuth } from '@/hooks/useAuth';
import { initializeDemoData } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const usernameRef = useRef<HTMLInputElement | null>(null);
  // Typed accessor for optional Electron DB API (preload may expose this)
  const electronDB = typeof window !== 'undefined'
    ? (window as unknown as Window & { electronAPI?: { db?: { resetDemoData?: () => Promise<boolean> } } }).electronAPI?.db
    : undefined;

  // DEV-only automatic diagnostics: dump users and test bcrypt on page load to help debugging
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    (async () => {
      try {
        const raw = localStorage.getItem('winecellar_users') || '[]';
        const users = JSON.parse(raw);
  logger.debug('DEV [auto]: winecellar_users', users);
        const admin = (users as unknown[]).find((u) => (u as Record<string, unknown>)?.username === 'admin');
        if (!admin) {
          logger.debug('DEV [auto]: admin user not found');
          return;
        }
  const adminHash = String((admin as Record<string, unknown>).passwordHash || '');
  const ok = await bcrypt.compare('admin123', adminHash);
  logger.debug('DEV [auto]: bcrypt.compare(admin123, admin.hash) =>', ok);
      } catch (err) {
  logger.error('DEV [auto] diagnostic error', err);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password) {
      toast({
        title: 'Erreur',
        description: "Veuillez remplir tous les champs",
        variant: 'destructive',
      });
      usernameRef.current?.focus();
      return;
    }

    setIsLoading(true);
    const success = await login(username.trim(), password);
    setIsLoading(false);

    if (success) {
      toast({
        title: 'Connexion réussie',
        description: 'Bienvenue !',
      });
      navigate('/dashboard');
    } else {
      toast({
        title: 'Erreur de connexion',
        description: "Nom d'utilisateur ou mot de passe incorrect",
        variant: 'destructive',
      });
      // Clear password for security and focus it
      setPassword('');
      const pw = document.getElementById('password') as HTMLInputElement | null;
      pw?.focus();
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-6">
      <section
        aria-labelledby="login-title"
        className="w-full max-w-xl p-6 motion-safe-slide-up"
      >
        <Card className="overflow-visible shadow-xl">
          <CardHeader className="space-y-2 text-center pt-6">
            <div className="flex justify-center -mt-12">
              <img src="/logo_vin.jpeg" className="w-16 h-16 object-contain rounded-full ring-4 ring-white/80 dark:ring-black/60 motion-safe-animate" alt="Logo" />
            </div>
            <div>
              <CardTitle id="login-title" className="text-2xl sm:text-3xl font-extrabold">Cave Premium Wines</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">Système de gestion de cave à vin</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5" aria-describedby="demo-accounts">
              <div className="grid gap-2">
                <Label htmlFor="username">Nom d'utilisateur</Label>
                <Input
                  id="username"
                  ref={usernameRef}
                  type="text"
                  placeholder="admin ou commercial"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  autoComplete="username"
                  aria-required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  aria-required
                />
              </div>

              <Button
                type="submit"
                className="w-full motion-safe-button-transform"
                disabled={isLoading}
              >
                {isLoading ? 'Connexion...' : 'Se connecter'}
              </Button>
            </form>

            <div id="demo-accounts" className="mt-6 p-4 bg-muted rounded-lg space-y-2 text-sm">
              <p className="font-semibold text-center">Comptes de démonstration</p>
              <div className="flex justify-between text-sm">
                <div>
                  <p><span className="font-medium">Admin</span></p>
                  <p className="text-muted-foreground">admin / admin123</p>
                </div>
                <div>
                  <p><span className="font-medium">Commercial</span></p>
                  <p className="text-muted-foreground">commercial / demo123</p>
                </div>
              </div>
              {/* Reset demo data button (only when running inside Electron) */}
              {electronDB?.resetDemoData ? (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const ok = await electronDB.resetDemoData();
                      if (ok) {
                        toast({ title: 'Données de démonstration restaurées', description: 'Vous pouvez vous connecter avec admin/admin123' });
                      } else {
                        toast({ title: 'Erreur', description: 'Impossible de réinitialiser les données', variant: 'destructive' });
                      }
                    }}
                  >
                    Réinitialiser les données de démonstration
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      try {
                        initializeDemoData();
                        toast({ title: 'Données de démonstration initialisées', description: 'Vous pouvez vous connecter avec admin/admin123' });
                      } catch (err) {
                        logger.error('reset demo error', err);
                        toast({ title: 'Erreur', description: 'Impossible d\'initialiser les données en mode navigateur', variant: 'destructive' });
                      }
                    }}
                  >
                    Réinitialiser les données de démonstration (navigateur)
                  </Button>
                </div>
              )}
              {/* Dev-only diagnostics: Dump users and test bcrypt compare in browser */}
              {import.meta.env.DEV && (
                <div className="mt-3 flex flex-col items-center space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      try {
                        const raw = localStorage.getItem('winecellar_users') || '[]';
                        debug('DEV: winecellar_users', JSON.parse(raw));
                        toast({ title: 'DEV', description: 'Voir console pour la liste des users' });
                      } catch (err) {
                        logger.error('DEV dump users error', err);
                        toast({ title: 'DEV', description: 'Erreur lors de la lecture des users (voir console)', variant: 'destructive' });
                      }
                    }}
                  >
                    Dump users (dev)
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        const users = JSON.parse(localStorage.getItem('winecellar_users') || '[]');
                        const admin = (users as unknown[]).find((u) => (u as Record<string, unknown>)?.username === 'admin');
                        if (!admin) {
                          toast({ title: 'DEV', description: 'Admin non trouvé', variant: 'destructive' });
                          debug('DEV: admin user not found', users);
                          return;
                        }
                        // dynamic import bcryptjs to ensure it runs in browser bundle
                        const adminHash = String((admin as Record<string, unknown>).passwordHash || '');
                        const ok = await bcrypt.compare('admin123', adminHash);
                        debug('DEV: bcrypt.compare(admin123, admin.hash) =>', ok);
                        toast({ title: 'DEV', description: `bcrypt.compare result: ${ok}` });
                      } catch (err) {
                        logger.error('DEV test bcrypt error', err);
                        toast({ title: 'DEV', description: 'Erreur lors du test bcrypt (voir console)', variant: 'destructive' });
                      }
                    }}
                  >
                    Test bcrypt (admin/admin123)
                  </Button>
                </div>
              )}
            </div>

          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default Login;
