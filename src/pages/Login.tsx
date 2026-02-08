import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import logger from '@/lib/logger';
import { useAuth } from '@/hooks/useAuth';
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
  const logoSrc = `${import.meta.env.BASE_URL}logo_vin.jpeg`;

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
        logger.debug('DEV [auto]: admin user found');
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
        description: 'Veuillez remplir tous les champs',
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
      setPassword('');
      const pw = document.getElementById('password') as HTMLInputElement | null;
      pw?.focus();
    }
  };

  return (
    <main className="min-h-screen relative flex items-center justify-center bg-background p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_20%_10%,hsl(var(--primary)/0.22),transparent_55%),radial-gradient(700px_circle_at_80%_70%,hsl(var(--sidebar-background)/0.18),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-background to-muted/40" />
      <section
        aria-labelledby="login-title"
        className="relative z-10 w-full max-w-xl p-6 motion-safe-slide-up"
      >
        <Card className="overflow-visible shadow-xl">
          <CardHeader className="space-y-2 text-center pt-6">
            <div className="flex justify-center -mt-12">
              <img src={logoSrc} className="w-16 h-16 object-contain rounded-full ring-4 ring-background motion-safe-animate" alt="Logo" />
            </div>
            <div>
              <CardTitle id="login-title" className="text-2xl sm:text-3xl font-extrabold">Connexion</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">Accédez à votre espace de gestion</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
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

            <div className="mt-6 p-4 bg-muted rounded-lg space-y-2 text-sm text-muted-foreground">
              <p>
                Vin-Chef est une application de gestion de cave à vin : suivi du stock, des ventes et des mouvements,
                avec une interface simple et rapide.
              </p>
            </div>

          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default Login;
