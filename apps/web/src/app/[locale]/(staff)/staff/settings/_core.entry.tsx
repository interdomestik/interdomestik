import { AccountSettingsPage } from '@/components/settings/account-settings-page';

interface SettingsPageProps {
  params: Promise<{ locale: string }>;
}

/** Staff and branch managers edit their own profile here; the staff layout admits only them. */
export default async function StaffSettingsPage({ params }: Readonly<SettingsPageProps>) {
  const { locale } = await params;
  return (
    <div data-testid="staff-page-ready">
      <AccountSettingsPage locale={locale} />
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
