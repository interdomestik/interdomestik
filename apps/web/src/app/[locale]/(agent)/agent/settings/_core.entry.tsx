import { AccountSettingsPage } from '@/components/settings/account-settings-page';

interface SettingsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AgentSettingsPage({ params }: Readonly<SettingsPageProps>) {
  const { locale } = await params;
  return <AccountSettingsPage locale={locale} />;
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
