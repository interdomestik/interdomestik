import { ProfileForm } from '@/components/auth/profile-form';
import { redirect } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { Separator } from '@interdomestik/ui/components/separator';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

interface ProfilePageProps {
  params: Promise<{ locale: string }>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'settings' });
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect({ href: '/auth/sign-in', locale });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('profile.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <Separator />
      <div className="max-w-xl">
        <ProfileForm
          user={{
            name: session!.user.name,
            image: session!.user.image,
          }}
        />
      </div>
    </div>
  );
}
