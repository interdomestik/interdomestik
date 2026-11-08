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
  Input,
  Label,
} from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

export function ResetPasswordForm(): React.JSX.Element {
  const common = useTranslations('common');
  const t = useTranslations('auth.passwordRecovery');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!token) {
    return (
      <Card className="w-full max-w-md animate-fade-in shadow-xl border-none ring-1 ring-white/10 bg-white/5 backdrop-blur-lg p-6 text-center">
        <p className="text-red-500 mb-4">{t('invalidToken')}</p>
        <Button asChild variant="outline">
          <Link href="/login">{t('backToLogin')}</Link>
        </Button>
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      setError(t('mismatch'));
      setLoading(false);
      return;
    }

    try {
      const { error } = await authClient.resetPassword(
        {
          newPassword: password,
        },
        {
          query: {
            token: token || '',
          },
        }
      );

      if (error) {
        setError(error.message || t('failed'));
      } else {
        toast.success(t('success'));
        router.push('/login');
      }
    } catch {
      setError(t('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md animate-fade-in shadow-xl border-none ring-1 ring-white/10 bg-white/5 backdrop-blur-lg">
      <CardHeader className="text-center space-y-1">
        <CardTitle className="text-2xl font-bold tracking-tight">{t('resetTitle')}</CardTitle>
        <CardDescription className="text-muted-foreground">{t('resetBody')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={onSubmit}
          aria-label={t('formLabel')}
          data-hydrated={isHydrated ? 'true' : 'false'}
        >
          {error && (
            <div
              className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md"
              id="reset-password-form-error"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">{t('newPassword')}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              className="bg-background/50"
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
              className="bg-background/50"
              disabled={loading}
            />
          </div>
          <Button
            type="submit"
            className="w-full font-semibold brand-gradient shadow-lg hover:opacity-90 transition-all border-none"
            size="lg"
            disabled={loading}
          >
            {loading ? common('loading') : t('resetTitle')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
