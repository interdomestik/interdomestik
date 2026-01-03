import { redirect } from '@/i18n/routing';
import { setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminStaffPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const merged = new URLSearchParams();
  for (const [key, value] of Object.entries(sp ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        merged.append(key, item);
      }
    } else {
      merged.set(key, value);
    }
  }

  // Destination params win
  merged.delete('role');
  merged.append('role', 'admin,staff');

  const query = merged.toString();
  redirect({ href: query ? `/admin/users?${query}` : '/admin/users?role=admin,staff', locale });
}
