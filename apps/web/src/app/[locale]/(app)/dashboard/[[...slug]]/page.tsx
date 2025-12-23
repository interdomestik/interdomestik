import { redirect } from '@/i18n/routing';
import { setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string; slug?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardRedirectPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const query = (await searchParams) ?? {};
  const queryString = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach(item => {
        if (item != null) {
          queryString.append(key, item);
        }
      });
    } else if (value != null) {
      queryString.set(key, value);
    }
  }

  const path = slug?.length ? `/member/${slug.join('/')}` : '/member';
  const suffix = queryString.toString();
  const href = suffix ? `${path}?${suffix}` : path;

  redirect({ href, locale });
}
