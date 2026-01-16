import { getWrappedStats } from '@/actions/wrapped';
import { AsistencaWrapped } from '@/components/dashboard/asistenca-wrapped';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function WrappedPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const stats = await getWrappedStats();

  if (!stats) {
    redirect('/dashboard');
  }

  // Casting to non-nullable as we've already checked stats existence
  return (
    <div className="container mx-auto">
      <AsistencaWrapped stats={stats} />
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
