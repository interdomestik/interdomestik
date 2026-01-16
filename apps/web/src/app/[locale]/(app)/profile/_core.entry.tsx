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
    <div className="container mx-auto max-w-4xl py-10 px-4 md:px-8 space-y-8">
      <div>
        <h3 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          {t('profile.title')}
        </h3>
        <p className="text-base text-muted-foreground mt-2">{t('description')}</p>
      </div>
      <Separator className="bg-border/50" />
      <div className="max-w-2xl mx-auto">
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

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
