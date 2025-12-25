import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { ProfileForm } from '@/components/auth/profile-form';
import { LanguageSettings } from '@/components/settings/language-settings';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { Separator } from '@interdomestik/ui/components/separator';
import { Skeleton } from '@interdomestik/ui/components/skeleton';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
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

export default async function AgentSettingsPage({ params }: SettingsPageProps) {
  const { locale } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect({ href: '/login', locale });
  }

  const tCommon = await getTranslations('settings');

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{tCommon('title')}</h2>
        <p className="text-muted-foreground">{tCommon('description')}</p>
      </div>

      <Separator />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left Column - Profile & Security */}
        <div className="space-y-8">
          {/* Profile Section */}
          <section>
            <h3 className="text-lg font-medium mb-4">{tCommon('profile.sectionTitle')}</h3>
            <Suspense fallback={<SettingsSkeleton />}>
              <ProfileForm
                user={{
                  name: session!.user.name || '',
                  image: session!.user.image,
                }}
              />
            </Suspense>
          </section>

          {/* Security Section */}
          <section>
            <h3 className="text-lg font-medium mb-4">{tCommon('security.sectionTitle')}</h3>
            <Suspense fallback={<SettingsSkeleton />}>
              <ChangePasswordForm />
            </Suspense>
          </section>
        </div>

        {/* Right Column - Preferences */}
        <div className="space-y-8">
          {/* Language Section */}
          <section>
            <h3 className="text-lg font-medium mb-4">{tCommon('language.sectionTitle')}</h3>
            <Suspense fallback={<SettingsSkeleton />}>
              <LanguageSettings />
            </Suspense>
          </section>
        </div>
      </div>
    </div>
  );
}
