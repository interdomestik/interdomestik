import { Link } from '@/i18n/routing';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'dashboard.home_grid' });
  const handoffT = await getTranslations({
    locale,
    namespace: 'dashboard.member_cta_pages.green_card',
  });
  const sharedT = await getTranslations({
    locale,
    namespace: 'dashboard.member_cta_pages.shared',
  });

  return (
    <div className="container max-w-4xl space-y-6 py-8" data-testid="green-card-page-ready">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{t('cta_green_card')}</h1>
        <p className="max-w-2xl text-muted-foreground">{handoffT('description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{sharedT('next_steps')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{handoffT('boundary')}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/member/diaspora">
                {handoffT('primary')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/member/help">{sharedT('secondary')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
