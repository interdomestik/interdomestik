import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { Mail, MessageSquare, Phone } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function HelpPage() {
  const t = await getTranslations('help');

  return (
    <div className="flex flex-col h-full space-y-8 p-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('description')}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Direct Contact */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('contact.title')}</CardTitle>
            <CardDescription>{t('contact.description')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="h-24 flex-col gap-2" asChild>
              <a href="tel:+38349900600">
                <Phone className="h-6 w-6" />
                <span className="font-semibold text-lg">049 900 600</span>
                <span className="text-xs text-muted-foreground">{t('contact.callUs')}</span>
              </a>
            </Button>

            <Button variant="outline" className="h-24 flex-col gap-2" asChild>
              <a href="mailto:info@interdomestik.com">
                <Mail className="h-6 w-6" />
                <span className="font-semibold text-lg">{t('contact.emailUs')}</span>
                <span className="text-xs text-muted-foreground">info@interdomestik.com</span>
              </a>
            </Button>

            <Button variant="outline" className="h-24 flex-col gap-2" asChild>
              <a href="https://wa.me/38349900600" target="_blank" rel="noopener noreferrer">
                <MessageSquare className="h-6 w-6 text-green-600" />
                <span className="font-semibold text-lg">WhatsApp</span>
                <span className="text-xs text-muted-foreground">{t('contact.chatWithUs')}</span>
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* FAQ Links (Placeholder) */}
        <Card>
          <CardHeader>
            <CardTitle>{t('faq.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium text-sm">{t('faq.q1.question')}</h3>
              <p className="text-sm text-muted-foreground">{t('faq.q1.answer')}</p>
            </div>
            <div>
              <h3 className="font-medium text-sm">{t('faq.q2.question')}</h3>
              <p className="text-sm text-muted-foreground">{t('faq.q2.answer')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('legal.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="link" className="px-0 h-auto" asChild>
              <Link href="/dashboard/rights">{t('legal.consumerRights')} &rarr;</Link>
            </Button>
            <div className="text-sm text-muted-foreground">{t('legal.consumerRightsDesc')}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
