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
import { Code, Eye, EyeOff, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

export function RegisterForm({ tenantId }: { tenantId?: string }) {
  const t = useTranslations('auth.register');
  const common = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantIdFromQuery = searchParams.get('tenantId') || undefined;
  const planIdFromQuery = searchParams.get('plan') || undefined;
  const resolvedTenantId = tenantId ?? tenantIdFromQuery;
  const loginParams = new URLSearchParams();
  if (resolvedTenantId) {
    loginParams.set('tenantId', resolvedTenantId);
  }
  if (planIdFromQuery) {
    loginParams.set('plan', planIdFromQuery);
  }
  const loginHref = loginParams.size > 0 ? `/login?${loginParams.toString()}` : '/login';
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [passwordValue, setPasswordValue] = React.useState('');
  const [confirmPasswordValue, setConfirmPasswordValue] = React.useState('');
  const [passwordTouched, setPasswordTouched] = React.useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = React.useState(false);

  const getErrorMessage = React.useCallback(
    (key: string, fallback: string) => {
      const translated = t(key);
      return translated === key ? fallback : translated;
    },
    [t]
  );

  const passwordsMismatchMessage = getErrorMessage(
    'errors.passwordsMismatch',
    'Passwords do not match.'
  );
  const missingTenantMessage = getErrorMessage(
    'errors.missingTenant',
    'Tenant context is missing. Please select a tenant to continue.'
  );
  const userExistsMessage = getErrorMessage(
    'errors.userExists',
    'This email already exists. Please use a different one.'
  );
  const unexpectedErrorMessage = getErrorMessage(
    'errors.unexpected',
    'An unexpected error occurred.'
  );

  const showPasswordMismatch =
    passwordValue.length > 0 &&
    confirmPasswordValue.length > 0 &&
    passwordValue !== confirmPasswordValue &&
    (passwordTouched || confirmPasswordTouched);
  const passwordMismatchHintId = 'register-password-mismatch';
  const isSubmitDisabled = loading || showPasswordMismatch;

  React.useEffect(() => {
    if (!showPasswordMismatch && error === passwordsMismatchMessage) {
      setError(null);
    }
  }, [error, passwordsMismatchMessage, showPasswordMismatch]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordTouched(true);
    setConfirmPasswordTouched(true);
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const name = formData.get('fullName') as string;
    const passwordConfirm = formData.get('confirmPassword') as string;

    if (password !== passwordConfirm) {
      setError(passwordsMismatchMessage);
      setLoading(false);
      return;
    }

    if (!resolvedTenantId) {
      setError(missingTenantMessage);
      setLoading(false);
      return;
    }

    try {
      const signUpPayload = {
        email,
        password,
        name,
        callbackURL: loginHref,
        tenantId: resolvedTenantId,
      };

      const { error: signUpError } = await authClient.signUp.email(signUpPayload);

      if (signUpError) {
        // Translate common error messages
        const errorMessage = signUpError.message?.toLowerCase() || '';
        if (errorMessage.includes('already exists') || errorMessage.includes('user exists')) {
          setError(userExistsMessage);
        } else {
          setError(signUpError.message || unexpectedErrorMessage);
        }
        setLoading(false);
      } else {
        // Leave loading true while redirecting to avoid flicker
        router.push(loginHref);
      }
    } catch {
      setError(unexpectedErrorMessage);
      setLoading(false);
    }
  };

  const handleSocialSignIn = async (provider: 'github') => {
    await authClient.signIn.social({
      provider,
      callbackURL: `${window.location.origin}${loginHref}`,
      ...(resolvedTenantId ? { additionalData: { tenantId: resolvedTenantId } } : {}),
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
        <form className="space-y-4" onSubmit={handleSubmit} aria-busy={loading}>
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md"
            >
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
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                className="bg-background/50 pr-10"
                suppressHydrationWarning
                disabled={loading}
                value={passwordValue}
                onChange={e => {
                  setPasswordValue(e.target.value);
                  setPasswordTouched(true);
                }}
                onBlur={() => setPasswordTouched(true)}
                aria-invalid={showPasswordMismatch || undefined}
                aria-describedby={showPasswordMismatch ? passwordMismatchHintId : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={loading}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                className="bg-background/50 pr-10"
                suppressHydrationWarning
                disabled={loading}
                value={confirmPasswordValue}
                onChange={e => {
                  setConfirmPasswordValue(e.target.value);
                  setConfirmPasswordTouched(true);
                }}
                onBlur={() => setConfirmPasswordTouched(true)}
                aria-invalid={showPasswordMismatch || undefined}
                aria-describedby={showPasswordMismatch ? passwordMismatchHintId : undefined}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                disabled={loading}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {showPasswordMismatch && (
              <p id={passwordMismatchHintId} className="text-xs text-red-500">
                {passwordsMismatchMessage}
              </p>
            )}
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
            <Button
              type="submit"
              className="w-full font-semibold"
              size="lg"
              disabled={isSubmitDisabled}
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

          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-xs uppercase text-muted-foreground/70 tracking-wider">
              {common('or')}
            </span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          <Button
            variant="outline"
            type="button"
            className="w-full bg-background/50"
            disabled={loading}
            onClick={() => handleSocialSignIn('github')}
          >
            <Code className="mr-2 h-4 w-4" />
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
