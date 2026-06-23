import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { CommercialBillingTerms } from '@/components/commercial/billing-terms';
import { buildCommercialTermsProps } from '@/components/commercial/billing-terms-content';
import { ProfileForm } from '@/components/auth/profile-form';
import { getSessionSafe } from '@/components/shell/session';
import { LanguageSettings } from '@/components/settings/language-settings';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { ResidenceCountrySettings } from '@/components/settings/residence-country-settings';
import { redirect } from '@/i18n/routing';
import { db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { Separator } from '@interdomestik/ui/components/separator';
import { Skeleton } from '@interdomestik/ui/components/skeleton';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[200px] w-full max-w-xl rounded-lg" />
    </div>
  );
}

interface SettingsPageProps {
  params: Promise<{ locale: string }>;
}

type MemberSettingsSession = NonNullable<Awaited<ReturnType<typeof getSessionSafe>>>;

async function getResidenceCountry(session: MemberSettingsSession) {
  const tenantId = session.user.tenantId;
  if (!tenantId) return null;

  try {
    // db-access-guard: tenant-scoped -- reason: member settings reads the signed-in user by session tenant and user id
    const row = await db.query.user.findFirst({
      where: withTenant(tenantId, user.tenantId, eq(user.id, session.user.id)),
      columns: { residenceCountry: true },
    });
    return row?.residenceCountry ?? null;
  } catch (error) {
    console.error('Failed to load residence country:', error);
    return null;
  }
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { locale } = await params;
  const session = await getSessionSafe('MemberSettingsPage');

  if (!session) {
    redirect({ href: '/login', locale });
  }

  const [t, commercialTerms, residenceCountry] = await Promise.all([
    getTranslations('settings'),
    getTranslations({ locale, namespace: 'commercialTerms' }),
    getResidenceCountry(session as MemberSettingsSession),
  ]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <Separator />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left Column - Profile & Security */}
        <div className="space-y-8">
          {/* Profile Section */}
          <section id="profile">
            <h3 className="text-lg font-medium mb-4">{t('profile.sectionTitle')}</h3>
            <Suspense fallback={<SettingsSkeleton />}>
              <ProfileForm
                user={{
                  name: session!.user.name || '',
                  image: session!.user.image,
                }}
              />
            </Suspense>
          </section>

          <section id="residence-country">
            <h3 className="text-lg font-medium mb-4">{t('residenceCountry.sectionTitle')}</h3>
            <Suspense fallback={<SettingsSkeleton />}>
              <ResidenceCountrySettings initialResidenceCountry={residenceCountry} />
            </Suspense>
          </section>

          {/* Security Section */}
          <section>
            <h3 className="text-lg font-medium mb-4">{t('security.sectionTitle')}</h3>
            <Suspense fallback={<SettingsSkeleton />}>
              <ChangePasswordForm />
            </Suspense>
          </section>
        </div>

        {/* Right Column - Preferences */}
        <div className="space-y-8">
          {/* Language Section */}
          <section>
            <h3 className="text-lg font-medium mb-4">{t('language.sectionTitle')}</h3>
            <Suspense fallback={<SettingsSkeleton />}>
              <LanguageSettings />
            </Suspense>
          </section>

          {/* Notifications Section */}
          <section id="notifications">
            <h3 className="text-lg font-medium mb-4">{t('notifications.sectionTitle')}</h3>
            <Suspense fallback={<SettingsSkeleton />}>
              <NotificationSettings />
            </Suspense>
          </section>
        </div>
      </div>

      <CommercialBillingTerms
        {...buildCommercialTermsProps(commercialTerms, 'settings-billing-terms')}
      />
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
