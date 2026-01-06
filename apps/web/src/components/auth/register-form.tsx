'use client';

import { Link } from '@/i18n/routing';
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
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

export function RegisterForm() {
  const t = useTranslations('auth.register');
  const common = useTranslations('common');
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') || undefined;
  const loginHref = tenantId ? `/login?tenantId=${tenantId}` : '/login';
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const name = formData.get('fullName') as string;
    const passwordConfirm = formData.get('confirmPassword') as string;

    if (password !== passwordConfirm) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (!tenantId) {
      setError('Missing tenant context. Please select a tenant to continue.');
      setLoading(false);
      return;
    }

    try {
      const signUpPayload = {
        email,
        password,
        name,
        callbackURL: '/member',
        tenantId,
      };

      const { error: signUpError } = await authClient.signUp.email(signUpPayload);

      if (signUpError) {
        setError(signUpError.message || 'Something went wrong');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignIn = async (provider: 'github') => {
    await authClient.signIn.social({
      provider,
      callbackURL: `${window.location.origin}/member`,
      ...(tenantId ? { additionalData: { tenantId } } : {}),
    });
  };

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
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="fullName">{t('fullName')}</Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder={t('namePlaceholder')}
              required
              autoComplete="name"
              className="bg-background/50"
              suppressHydrationWarning
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={t('emailPlaceholder')}
              required
              autoComplete="email"
              className="bg-background/50"
              suppressHydrationWarning
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('password')}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              className="bg-background/50"
              suppressHydrationWarning
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              className="bg-background/50"
              suppressHydrationWarning
              disabled={loading}
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="terms" required className="mt-0.5" disabled={loading} />
            <Label
              htmlFor="terms"
              className="text-sm font-normal leading-snug cursor-pointer select-none text-muted-foreground"
            >
              {t('terms')}
            </Label>
          </div>

          <div className="pt-2">
            <Button type="submit" className="w-full font-semibold" size="lg" disabled={loading}>
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
            onClick={() => handleSocialSignIn('github')}
          >
            <Github className="mr-2 h-4 w-4" />
            GitHub
          </Button>

          <p className="text-center text-sm text-[hsl(var(--muted-500))] mt-4">
            {t('hasAccount')}{' '}
            <Link
              href={loginHref}
              className="text-[hsl(var(--primary))] hover:underline font-medium"
            >
              {t('loginLink')}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
