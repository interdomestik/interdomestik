import { PwaInstallButton } from '@/components/pwa/install-button';
import { FunnelActivationTracker } from '@/components/analytics/funnel-trackers';
import { CommercialDisclaimerNotice } from '@/components/commercial/commercial-disclaimer-notice';
import { getSessionSafe } from '@/components/shell/session';
import { isUiV2Enabled } from '@/lib/flags';
import { getSupportContacts } from '@/lib/support-contacts';
import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { CheckCircle2, Phone, QrCode, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MockActivationTrigger } from '@/components/billing/mock-activation-trigger';

interface SuccessPageProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{
    test?: string;
    planId?: string;
    priceId?: string;
    activation?: string;
  }>;
}

export default async function MembershipSuccessPage({ params, searchParams }: SuccessPageProps) {
  const { locale } = await params;
  const session = await getSessionSafe('MemberMembershipSuccessPage');

  if (!session) {
    redirect(`/${locale}/login`);
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const isTest = resolvedSearchParams.test === 'true';
  const { planId, priceId } = resolvedSearchParams;
  const uiV2Enabled = isUiV2Enabled();
  const tenantId = session.user.tenantId ?? null;
  const tenantClassificationPending =
    (session.user as { tenantClassificationPending?: boolean | null })
      .tenantClassificationPending === true;
  const activeSubscription = tenantId
    ? await getActiveSubscription(session.user.id, tenantId)
    : null;
  const membershipActive = Boolean(activeSubscription);
  const supportContacts = getSupportContacts({
    tenantId: tenantClassificationPending ? null : tenantId,
    locale,
  });

  const t = await getTranslations({ locale, namespace: 'membership.success' });
  const activationPending = !membershipActive;
  const subtitle = membershipActive ? t('subtitle') : t('pending_subtitle');
  const statusLabel = membershipActive ? t('status_active') : t('status_pending');
  const topNote = membershipActive
    ? tenantClassificationPending
      ? t('classification_note')
      : t('active_note')
    : t('pending_note');
  const helperText = membershipActive ? t('cta_helper') : t('cta_helper_pending');
  const refreshParams = new URLSearchParams();
  if (resolvedSearchParams.test === 'true') refreshParams.set('test', 'true');
  if (planId) refreshParams.set('planId', planId);
  if (priceId) refreshParams.set('priceId', priceId);
  refreshParams.set('activation', 'pending');
  refreshParams.set('check', Date.now().toString());
  const refreshHref = `/${locale}/member/membership/success?${refreshParams.toString()}`;

  return (
    <div className="container min-h-svh max-w-4xl px-4 py-12" data-testid="success-page-ready">
      {/* 
          🧪 BILLING TEST MODE TRIGGER
          If we are in test mode and have plan info, trigger the activation 
          on the client side to avoid revalidatePath-during-render errors.
      */}
      {isTest && planId && priceId && <MockActivationTrigger planId={planId} priceId={priceId} />}
      <FunnelActivationTracker
        tenantId={tenantId}
        locale={locale}
        uiV2Enabled={uiV2Enabled}
        planId={planId ?? null}
      />

      <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">{subtitle}</p>
        <p className="mt-4 mx-auto max-w-2xl rounded-2xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {topNote}
        </p>
        <p className="mt-3 mx-auto max-w-2xl text-sm font-medium text-muted-foreground">
          {t('onboarding_note')}
        </p>
      </div>

      {activationPending ? (
        <div
          data-testid="success-activation-pending"
          className="mb-8 rounded-[1.75rem] border border-amber-200 bg-amber-50/80 px-5 py-4 text-left shadow-sm"
        >
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">
            {t('activation_pending_title')}
          </p>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-700">
            {t('activation_pending_body')}
          </p>
        </div>
      ) : null}

      <div className="grid gap-8 md:grid-cols-2">
        {/* Digital Card Promo */}
        <Card
          data-testid="success-card"
          className="shadow-lg hover:shadow-xl transition-shadow duration-300 border-2"
        >
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center justify-between">
              {t('card_label')}
              <Badge variant={membershipActive ? 'secondary' : 'outline'}>{statusLabel}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-6 pb-6 pt-2">
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-2xl relative overflow-hidden aspect-[1.586/1]">
                <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/5 skew-y-[-15deg] origin-top-left" />

                <div className="flex justify-between items-start relative z-10">
                  <div className="text-sm font-bold tracking-widest opacity-80 uppercase">
                    Asistenca
                  </div>
                  <ShieldCheck className="w-8 h-8 text-primary shadow-sm" />
                </div>

                <div className="mt-8 relative z-10">
                  <div className="text-xs opacity-50 mb-1">{t('card_id_prefix')}</div>
                  <div className="text-lg font-mono tracking-widest">
                    {(session.user as any).memberNumber ||
                      `ID-${session.user.id.slice(0, 8).toUpperCase()}`}
                  </div>
                </div>

                <div className="mt-auto flex justify-between items-end relative z-10">
                  <div className="text-xl font-bold">{session.user.name}</div>
                  <div className="bg-white p-1 rounded-md">
                    <QrCode className="w-8 h-8 text-black" />
                  </div>
                </div>
              </div>

              <Button className="w-full mt-6 h-12 font-bold" variant="outline">
                <Wallet className="mr-2 h-5 w-5" />
                {t('cta_wallet')}
              </Button>
              <PwaInstallButton label={t('cta_install')} className="mt-3 font-bold" />
            </div>
          </CardContent>
        </Card>

        {/* Hotline Promo */}
        <Card
          data-testid="success-hotline"
          className="border-primary shadow-xl overflow-hidden group hover:scale-[1.01] transition-transform duration-300"
        >
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              {t('hotline_label')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                <p className="text-sm font-bold text-primary uppercase tracking-wider mb-1">
                  {t('hotline_label')}
                </p>
                <a
                  href={supportContacts.telHref}
                  className="text-2xl font-black tracking-tighter text-foreground"
                >
                  {supportContacts.phoneDisplay}
                </a>
                <p className="mt-2 text-sm text-muted-foreground">{t('hotline_hint')}</p>
              </div>
              <CommercialDisclaimerNotice
                sectionTestId="success-hotline-disclaimer"
                items={[
                  {
                    title: t('hotline_disclaimer.title'),
                    body: t('hotline_disclaimer.body'),
                  },
                ]}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-16 bg-muted/30 border rounded-3xl p-10">
        <h2 className="text-2xl font-bold mb-8 text-center">{t('benefits_title')}</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="flex flex-col items-center text-center space-y-3 p-4 bg-white rounded-2xl border shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center">
                <span className="text-primary font-bold">{i}</span>
              </div>
              <p className="text-sm font-medium leading-relaxed">{t(`benefits_${i}` as any)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild size="lg" className="min-h-[44px] rounded-2xl px-6 font-bold">
            <Link href={`/${locale}/member`}>{t('cta_open_dashboard')}</Link>
          </Button>
          {membershipActive ? (
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-[44px] rounded-2xl px-6 font-bold"
            >
              <Link href={`/${locale}/member/claims/new`}>{t('cta_start_claim')}</Link>
            </Button>
          ) : (
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-[44px] rounded-2xl px-6 font-bold"
            >
              <Link href={refreshHref}>{t('cta_refresh_status')}</Link>
            </Button>
          )}
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">{helperText}</p>
      </div>
    </div>
  );
}

function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
