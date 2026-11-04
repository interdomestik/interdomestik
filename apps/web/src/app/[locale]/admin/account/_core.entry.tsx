import { AccountSettingsPage } from '@/components/settings/account-settings-page';

interface AccountPageProps {
  params: Promise<{ locale: string }>;
}

/** Administrators edit their own profile here; the admin layout admits only its portal roles. */
export default async function AdminAccountPage({ params }: Readonly<AccountPageProps>) {
  const { locale } = await params;
  return <AccountSettingsPage locale={locale} />;
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
