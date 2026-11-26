import { MemberAcceptanceStep } from '@/components/privacy/member-acceptance-step';
import {
  requireAdmittedMember,
  requireMemberAcceptancePage,
} from '@/lib/privacy/require-member-acceptance';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { CommercialBillingTerms } from '@/components/commercial/billing-terms';
import { buildCommercialTermsProps } from '@/components/commercial/billing-terms-content';
import { ProfileForm } from '@/components/auth/profile-form';
import { LanguageSettings } from '@/components/settings/language-settings';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { ResidenceCountrySettings } from '@/components/settings/residence-country-settings';
import { eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import {
  MemberSettingsFrame,
  MemberSettingsUnavailable,
} from '@/components/settings/member-settings-frame';
import { getTranslations } from 'next-intl/server';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

interface SettingsPageProps {
  params: Promise<{ locale: string }>;
}

type ResidenceCountryRead = Readonly<{ ok: true; value: string | null } | { ok: false }>;

async function getResidenceCountry(): Promise<ResidenceCountryRead> {
  const admission = await requireAdmittedMember();
  if (!admission.ok) return { ok: false };
  const { session, authority } = admission.authorized;
  const tenantId = session.user.tenantId;
  if (!tenantId) return { ok: false };

  try {
    // db-access-guard: tenant-scoped -- reason: member settings reads the signed-in user by session tenant and user id
    const row = await withTenantAuthority(authority, tx =>
      tx.query.user.findFirst({
        where: withTenant(tenantId, user.tenantId, eq(user.id, session.user.id)),
        columns: { residenceCountry: true },
      })
    );
    return { ok: true, value: row?.residenceCountry ?? null };
  } catch (error) {
    // A failed read is not an empty value: the form stays closed so it cannot save a blank.
    console.error('Failed to load residence country:', error);
    return { ok: false };
  }
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { locale } = await params;
  const admission = await requireMemberAcceptancePage();
  if (!admission.ok) return <MemberAcceptanceStep locale={locale} refusal={admission} />;
  const { session } = admission.authorized;

  const [t, tPortal, tCommon, commercialTerms, residenceCountry] = await Promise.all([
    getTranslations({ locale, namespace: 'settings' }),
    getTranslations({ locale, namespace: 'dashboard.settings_page' }),
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'commercialTerms' }),
    getResidenceCountry(),
  ]);

  return (
    <MemberSettingsFrame
      title={t('title')}
      description={t('description')}
      account={[
        {
          id: 'profile',
          title: t('profile.sectionTitle'),
          content: (
            <ProfileForm user={{ name: session.user.name || '', image: session.user.image }} />
          ),
        },
        {
          id: 'residence-country-section',
          title: t('residenceCountry.sectionTitle'),
          content: residenceCountry.ok ? (
            <ResidenceCountrySettings initialResidenceCountry={residenceCountry.value} />
          ) : (
            <MemberSettingsUnavailable
              href={`/${locale}/member/settings`}
              message={tPortal('residence_unavailable')}
              retryLabel={tCommon('tryAgain')}
            />
          ),
        },
        { id: 'security', title: t('security.sectionTitle'), content: <ChangePasswordForm /> },
      ]}
      preferences={[
        { id: 'language', title: t('language.sectionTitle'), content: <LanguageSettings /> },
        {
          id: 'notifications',
          title: t('notifications.sectionTitle'),
          content: <NotificationSettings />,
        },
      ]}
      terms={
        <CommercialBillingTerms
          {...buildCommercialTermsProps(commercialTerms, 'settings-billing-terms')}
        />
      }
    />
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
