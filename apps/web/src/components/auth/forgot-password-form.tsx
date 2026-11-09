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
  Input,
  Label,
} from '@interdomestik/ui';
import { ChevronLeft, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export function ForgotPasswordForm(): React.JSX.Element {
  const common = useTranslations('common');
  const t = useTranslations('auth.passwordRecovery');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;

    try {
      const currentUrl = new URL(window.location.href);
      currentUrl.pathname = currentUrl.pathname.replace(/\/forgot-password$/, '/reset-password');
      currentUrl.search = '';
      currentUrl.hash = '';

      const { error: requestError } = await authClient.requestPasswordReset({
        email,
        redirectTo: currentUrl.toString(),
      });

      if (requestError) {
        setError(requestError.message || t('requestFailed'));
        return;
      }

      // Always show success to avoid account enumeration.
      setSuccess(true);
    } catch {
      setError(t('unexpected'));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Card
        className="w-full max-w-md animate-fade-in shadow-xl border-none ring-1 ring-white/10 bg-white/5 backdrop-blur-lg"
        data-testid="forgot-password-success"
      >
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle
            className="text-2xl font-bold tracking-tight"
            data-testid="forgot-password-success-title"
          >
            {t('checkEmail')}
          </CardTitle>
          <CardDescription
            className="text-muted-foreground"
            data-testid="forgot-password-success-body"
          >
            {t('requestSuccess')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild variant="link" className="text-primary">
            <Link href="/login" data-testid="forgot-password-return-to-login">
              {t('returnToLogin')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md animate-fade-in shadow-xl border-none ring-1 ring-white/10 bg-white/5 backdrop-blur-lg">
      <CardHeader className="text-center space-y-1">
        <CardTitle className="text-2xl font-bold tracking-tight">{t('forgotTitle')}</CardTitle>
        <CardDescription className="text-muted-foreground">{t('forgotBody')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t('emailLabel')}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@example.com"
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
            {loading ? common('loading') : t('sendLink')}
          </Button>
          <div className="text-center">
            <Button asChild variant="link" size="sm" className="text-muted-foreground">
              <Link href="/login" className="flex items-center gap-2">
                <ChevronLeft className="h-4 w-4" />
                {t('back')}
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
