import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import { getTranslations } from 'next-intl/server';

export default async function AdminNotFound() {
  const tCommon = await getTranslations('common');

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center text-center space-y-4"
      data-testid="not-found-page"
    >
      <div>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">Admin 404</p>
        <h1 className="text-3xl font-bold">{tCommon('notFound.title')}</h1>
        <p className="text-muted-foreground mt-2">{tCommon('notFound.description')}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button asChild variant="outline">
          <Link href="/member">{tCommon('back')}</Link>
        </Button>
      </div>
    </div>
  );
}
