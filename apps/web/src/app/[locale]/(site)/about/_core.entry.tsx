import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { useTranslations } from 'next-intl';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

export default function AboutPage() {
  const t = useTranslations('about');

  return (
    <div className="container py-12 md:py-16 mx-auto">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">{t('title')}</h1>
          <p className="text-xl text-muted-foreground">{t('subtitle')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="leading-7 whitespace-pre-wrap">{t('content')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
