'use client';

import { Link } from '@/i18n/routing';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { AlertTriangle, FileText, Gavel, Info, Scale, Shield, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function RightsContent(): React.JSX.Element {
  const t = useTranslations('consumerRights');

  const rights = [
    {
      key: 'safety',
      icon: AlertTriangle,
      color: 'text-red-500',
    },
    {
      key: 'information',
      icon: Info,
      color: 'text-blue-500',
    },
    {
      key: 'redress',
      icon: Gavel,
      color: 'text-orange-500',
    },
    {
      key: 'representation',
      icon: Users,
      color: 'text-purple-500',
    },
    {
      key: 'choice',
      icon: Scale,
      color: 'text-green-500',
    },
    {
      key: 'education',
      icon: FileText,
      color: 'text-yellow-500',
    },
  ];

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('intro')}</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2 lg:grid-cols-3">
        {rights.map(right => (
          <Card key={right.key} className="relative overflow-hidden">
            <CardHeader>
              <div className="flex items-center gap-2">
                <right.icon className={`h-5 w-5 shrink-0 ${right.color}`} />
                <CardTitle className="min-w-0 text-lg">{t(`rights.${right.key}.title`)}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-base">
                {t(`rights.${right.key}.description`)}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 shrink-0 text-primary" />
            <CardTitle className="min-w-0">{t('cta')}</CardTitle>
          </div>
          <CardDescription>{t('assistance.helpBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg" className="h-auto min-h-11 max-w-full whitespace-normal py-2">
            <Link href="/member/claims/new">{t('cta')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
