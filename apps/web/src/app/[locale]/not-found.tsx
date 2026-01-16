import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const tCommon = await getTranslations('common');
  const tNav = await getTranslations('nav');

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center text-center space-y-4"
      data-testid="not-found-page"
    >
      <div>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">404</p>
        <h1 className="text-3xl font-bold">{tCommon('notFound.title')}</h1>
        <p className="text-muted-foreground mt-2">{tCommon('notFound.description')}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button asChild variant="outline">
          <Link href="/member">{tCommon('back')}</Link>
        </Button>
        <Button asChild>
          <Link href="/">{tNav('home')}</Link>
        </Button>
      </div>
    </div>
  );
}
