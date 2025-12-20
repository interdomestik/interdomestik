import { auth } from '@/lib/auth';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { CheckCircle2, Phone, QrCode, Smartphone, Wallet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

interface SuccessPageProps {
  params: Promise<{ locale: string }>;
}

export default async function MembershipSuccessPage({ params }: SuccessPageProps) {
  const { locale } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const t = await getTranslations({ locale, namespace: 'membership.success' });

  return (
    <div className="container max-w-4xl py-12 px-4">
      <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">{t('title')}</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">{t('subtitle')}</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Hotline Promo */}
        <Card className="border-primary shadow-xl overflow-hidden group hover:scale-[1.01] transition-transform duration-300">
          <div className="bg-primary px-6 py-2 text-primary-foreground text-xs font-bold tracking-widest text-center uppercase">
            {t('hotline_label')}
          </div>
          <CardContent className="p-8 text-center flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-primary/5 rounded-full group-hover:bg-primary/10 transition-colors">
              <Phone className="w-12 h-12 text-primary animate-pulse" />
            </div>
            <div className="text-3xl font-black text-primary tracking-tighter">
              {t('hotline_number')}
            </div>
            <p className="text-sm text-muted-foreground">{t('hotline_hint')}</p>
            <Button className="w-full h-12 text-base shadow-lg shadow-primary/20">
              <Smartphone className="mr-2 h-5 w-5" />
              {t('cta_save_contact')}
            </Button>
          </CardContent>
        </Card>

        {/* Digital Card Promo */}
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 border-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center justify-between">
              {t('card_label')}
              <Badge variant="secondary">Active</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* The "Card" UI */}
            <div className="px-6 pb-6 pt-2">
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-2xl relative overflow-hidden aspect-[1.586/1]">
                {/* Glossy overlay */}
                <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/5 skew-y-[-15deg] origin-top-left" />

                <div className="flex justify-between items-start relative z-10">
                  <div className="text-sm font-bold tracking-widest opacity-80 uppercase">
                    Asistenca
                  </div>
                  <ShieldCheck className="w-8 h-8 text-primary shadow-sm" />
                </div>

                <div className="mt-8 relative z-10">
                  <div className="text-xs opacity-50 mb-1">{t('card_id_prefix')}</div>
                  <div className="text-lg font-mono tracking-widest">
                    ID-{session.user.id.slice(0, 8).toUpperCase()}
                  </div>
                </div>

                <div className="mt-auto flex justify-between items-end relative z-10">
                  <div className="text-xl font-bold">{session.user.name}</div>
                  <div className="bg-white p-1 rounded-md">
                    <QrCode className="w-8 h-8 text-black" />
                  </div>
                </div>
              </div>

              <Button className="w-full mt-6 h-12 font-bold" variant="outline">
                <Wallet className="mr-2 h-5 w-5" />
                {t('cta_wallet')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-16 bg-muted/30 border rounded-3xl p-10">
        <h2 className="text-2xl font-bold mb-8 text-center">{t('benefits_title')}</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="flex flex-col items-center text-center space-y-3 p-4 bg-white rounded-2xl border shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center">
                <span className="text-primary font-bold">{i}</span>
              </div>
              <p className="text-sm font-medium leading-relaxed">
                {t(`benefits_${i}` as Parameters<typeof t>[0])}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 text-center">
        <Button
          asChild
          size="lg"
          variant="ghost"
          className="text-muted-foreground hover:text-primary"
        >
          <Link href="/dashboard">{t('cta_dashboard')}</Link>
        </Button>
      </div>
    </div>
  );
}

// Minimal ShieldCheck for the card since lucide-react mock in tests used it
function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
