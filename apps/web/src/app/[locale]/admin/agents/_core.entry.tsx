import { redirect } from '@/i18n/routing';
import { setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AdminAgentsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect({ href: '/admin/users?role=agent', locale });
}
