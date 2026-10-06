'use client';

import {
  resolveLoginTenantHint,
  resolveSocialOnboardingTenantContext,
} from '@/components/auth/login-tenant-hint';
import { Link } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import { startCriticalAction } from '@/lib/observability/critical-action';
import { getValidatedLocaleFromPathname } from '@/lib/canonical-routes';
import { getPublicMembershipEntryHref } from '@/lib/public-membership-entry';
import { isAdmin } from '@/lib/roles.core';
import {
  emitPostLoginFailureTelemetry,
  resolveAuthenticatedRole,
  resolvePostLoginTarget,
} from './login-post-authentication';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Checkbox,
  Input,
  Label,
} from '@interdomestik/ui';
import { Code, Eye, EyeOff, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { buildSocialOnboardingPayload } from './register-onboarding-payload';

export function LoginForm({
  githubOAuthEnabled = false,
  tenantId,
}: {
  githubOAuthEnabled?: boolean;
  tenantId?: string;
}) {
  const t = useTranslations('auth.login');
  const common = useTranslations('common');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const planIdFromQuery = searchParams.get('plan') || undefined;
  const nextPathFromQuery = searchParams.get('next');
  const resolvedTenantId = resolveLoginTenantHint(searchParams, tenantId);
  // Social sign-up needs a validated onboarding intent, which keeps its own booking context; the
  // password payload above stays identity-only.
  const socialOnboarding = resolveSocialOnboardingTenantContext(searchParams, tenantId);
  const signupHref = getPublicMembershipEntryHref(planIdFromQuery);
  const [loading, setLoading] = React.useState(false);
  const activeSubmission = React.useRef<{ handoffStarted: boolean } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const locale = getValidatedLocaleFromPathname(pathname);

  React.useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted && activeSubmission.current?.handoffStarted) {
        activeSubmission.current = null;
        setLoading(false);
      }
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return (
    <Card className="w-full max-w-md animate-fade-in border-none bg-white/80 shadow-xl ring-1 ring-[hsl(var(--border))] backdrop-blur-lg dark:bg-white/5 dark:ring-white/10">
      <CardHeader className="space-y-1 px-5 py-4 text-center sm:p-6">
        <Link
          href="/"
          className="mb-3 flex items-center justify-center gap-2 transition-transform duration-300 hover:scale-105 sm:mb-6"
        >
          <Shield className="h-8 w-8 text-primary sm:h-10 sm:w-10" />
        </Link>
        <h2 className="text-xl font-bold sm:text-2xl">{t('title')}</h2>
        <CardDescription className="text-muted-foreground">{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 sm:p-6 sm:pt-0">
        <form
          method="POST"
          className="space-y-3 sm:space-y-4"
          data-testid="login-form"
          onSubmit={async e => {
            e.preventDefault();
            if (activeSubmission.current) return;
            const submission = { handoffStarted: false };
            activeSubmission.current = submission;
            const monitoring = startCriticalAction('login_submit');
            setError(null);
            setLoading(true);

            const formData = new FormData(e.currentTarget);
            const email = formData.get('email') as string;
            const password = formData.get('password') as string;

            try {
              const { error } = await authClient.signIn.email({
                email,
                password,
                ...(resolvedTenantId ? { additionalData: { tenantId: resolvedTenantId } } : {}),
              });

              if (error) {
                monitoring.finish('rejected');
                setError(error.message || t('error'));
                setLoading(false);
                return;
              }

              const { role, hasAdminAccess, timedOut } = await resolveAuthenticatedRole();

              if (!role || timedOut) {
                monitoring.finish('unexpected');
                emitPostLoginFailureTelemetry(
                  'post_login_sync_timeout',
                  pathname,
                  resolvedTenantId
                );
                setError(t('error'));
                setLoading(false);
                return;
              }

              if (isAdmin(role) && !hasAdminAccess) {
                monitoring.finish('rejected');
                setError(t('error'));
                setLoading(false);
                return;
              }

              const continuation = resolvePostLoginTarget({
                role,
                locale,
                nextPathFromQuery,
                planIdFromQuery,
                hash: globalThis.location.hash,
              });
              if (continuation.kind === 'unsupported_role') {
                monitoring.finish('unexpected');
                emitPostLoginFailureTelemetry(
                  'unsupported_redirect_target',
                  pathname,
                  resolvedTenantId
                );
                setError(`${t('error')} (Unsupported account role)`);
                setLoading(false);
                return;
              }

              // Hard navigation reloads the authenticated session.
              monitoring.finish('navigation_started');
              submission.handoffStarted = true;
              globalThis.location.assign(continuation.target);
            } catch {
              submission.handoffStarted = false;
              monitoring.finish('unexpected');
              setError(t('error'));
              setLoading(false);
            } finally {
              if (activeSubmission.current === submission && !submission.handoffStarted) {
                activeSubmission.current = null;
                setLoading(false);
              }
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
              placeholder={t('emailPlaceholder')}
              required
              autoComplete="email"
              className="bg-background/50"
              suppressHydrationWarning
              disabled={loading}
              data-testid="login-email"
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
                autoComplete="current-password"
                className="bg-background/50 pr-10"
                suppressHydrationWarning
                disabled={loading}
                data-testid="login-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-primary hover:underline transition-all"
              >
                {t('forgotPassword')}
              </Link>
            </div>
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
              data-testid="login-submit"
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

          {githubOAuthEnabled ? (
            <>
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
                onClick={async () => {
                  await authClient.signIn.social({
                    provider: 'github',
                    callbackURL:
                      globalThis.location.href || `${globalThis.location.origin}/${locale}/login`,
                    ...(socialOnboarding
                      ? buildSocialOnboardingPayload(
                          socialOnboarding.tenantId,
                          socialOnboarding.deferred
                        )
                      : {}),
                  });
                }}
              >
                <Code className="mr-2 h-4 w-4" />
                GitHub
              </Button>
            </>
          ) : null}

          <p className="text-center text-sm text-[hsl(var(--muted-500))]">
            {t('noAccount')}{' '}
            <Link
              href={signupHref}
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
