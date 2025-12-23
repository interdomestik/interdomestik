'use client';

import { Link, useRouter } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
} from '@interdomestik/ui';
import { Github, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export function LoginForm() {
  const t = useTranslations('auth.login');
  const common = useTranslations('common');
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Card className="w-full max-w-md animate-fade-in shadow-xl border-none ring-1 ring-white/10 bg-white/5 backdrop-blur-lg">
      <CardHeader className="text-center space-y-1">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 mb-6 transition-transform hover:scale-105 duration-300"
        >
          <Shield className="h-10 w-10 text-primary" />
        </Link>
        <CardTitle className="text-2xl font-bold tracking-tight">{t('title')}</CardTitle>
        <CardDescription className="text-muted-foreground">{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async e => {
            e.preventDefault();
            setError(null);
            setLoading(true);

            const formData = new FormData(e.currentTarget);
            const email = formData.get('email') as string;
            const password = formData.get('password') as string;

            try {
              const { error } = await authClient.signIn.email({
                email,
                password,
              });

              if (error) {
                setError(error.message || t('error'));
                setLoading(false);
                return;
              }

              const { data: session } = await authClient.getSession();
              const role = (session?.user as { role?: string })?.role;

              if (role === 'admin') {
                router.push('/admin');
              } else if (role === 'agent') {
                router.push('/agent');
              } else if (role === 'staff') {
                router.push('/staff');
              } else {
                router.push('/member');
              }
            } catch {
              setError(t('error'));
              setLoading(false);
            } finally {
              setLoading(false);
            }
          }}
        >
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="emri@shembull.com"
              required
              autoComplete="email"
              className="bg-background/50"
              suppressHydrationWarning
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t('password')}</Label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-primary hover:underline transition-all"
              >
                {t('forgotPassword')}
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="bg-background/50"
              suppressHydrationWarning
              disabled={loading}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="remember" disabled={loading} />
            <Label
              htmlFor="remember"
              className="text-sm font-normal cursor-pointer select-none text-muted-foreground"
            >
              {t('rememberMe')}
            </Label>
          </div>
          <div className="pt-2">
            <Button
              type="submit"
              className="w-full font-semibold brand-gradient shadow-lg hover:opacity-90 transition-all border-none"
              size="lg"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {common('loading')}
                </div>
              ) : (
                t('submit')
              )}
            </Button>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">{common('or')}</span>
            </div>
          </div>

          <Button
            variant="outline"
            type="button"
            className="w-full bg-background/50"
            disabled={loading}
            onClick={async () => {
              await authClient.signIn.social({
                provider: 'github',
                callbackURL: `${window.location.origin}/member`,
              });
            }}
          >
            <Github className="mr-2 h-4 w-4" />
            GitHub
          </Button>

          <p className="text-center text-sm text-[hsl(var(--muted-500))]">
            {t('noAccount')}{' '}
            <Link
              href="/register"
              className="text-[hsl(var(--primary))] hover:underline font-medium"
            >
              {t('registerLink')}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
