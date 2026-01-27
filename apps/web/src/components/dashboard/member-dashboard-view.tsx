import { ReferralCard } from '@/components/member/referral-card';
import { HomeGrid } from '@/components/member/HomeGrid';
import { db, eq, subscriptions } from '@interdomestik/database';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { Phone, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

export async function MemberDashboardView({ userId }: { userId: string }) {
  const t = await getTranslations('dashboard');

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  });

  const isActive = subscription?.status === 'active';

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1
            className="text-3xl font-bold tracking-tight text-foreground"
            data-testid="dashboard-heading"
          >
            {t('overview')}
          </h1>
          <p className="text-muted-foreground">{t('welcome_back')}</p>
        </div>

        {/* Protection Status Badge */}
        <div
          data-testid="protection-status"
          data-status={isActive ? 'active' : 'inactive'}
          className="flex items-center gap-2 px-4 py-2 bg-white/50 backdrop-blur-sm border rounded-2xl shadow-sm"
        >
          <div
            className={`p-1.5 rounded-full ${isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
              Status
            </span>
            <span className={`text-sm font-bold ${isActive ? 'text-green-700' : 'text-red-700'}`}>
              {isActive ? 'Protected' : 'No Active Protection'}
            </span>
          </div>
        </div>
      </div>

      {/* Crystal Home 4-CTA Grid */}
      <HomeGrid>
        <Button
          asChild
          variant="destructive"
          className="h-32 text-lg font-bold p-6 whitespace-normal text-center leading-tight flex-col gap-3 shadow-lg hover:shadow-xl transition-all"
          data-testid="home-cta-incident"
        >
          <Link href="/member/incident-guide">
            <span className="text-3xl">🔴</span>
            <span>{t('home_grid.cta_incident')}</span>
          </Link>
        </Button>

        <Button
          asChild
          className="h-32 text-lg font-bold p-6 whitespace-normal text-center leading-tight flex-col gap-3 bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl transition-all text-white"
          data-testid="home-cta-report"
        >
          <Link href="/member/report">
            <span className="text-3xl">🟦</span>
            <span>{t('home_grid.cta_report')}</span>
          </Link>
        </Button>

        <Button
          asChild
          className="h-32 text-lg font-bold p-6 whitespace-normal text-center leading-tight flex-col gap-3 bg-green-600 hover:bg-green-700 shadow-lg hover:shadow-xl transition-all text-white"
          data-testid="home-cta-green-card"
        >
          <Link href="/member/green-card">
            <span className="text-3xl">🟩</span>
            <span>{t('home_grid.cta_green_card')}</span>
          </Link>
        </Button>

        <Button
          asChild
          className="h-32 text-lg font-bold p-6 whitespace-normal text-center leading-tight flex-col gap-3 bg-amber-400 hover:bg-amber-500 text-amber-950 shadow-lg hover:shadow-xl transition-all"
          data-testid="home-cta-benefits"
        >
          <Link href="/member/benefits">
            <span className="text-3xl">⭐</span>
            <span>{t('home_grid.cta_benefits')}</span>
          </Link>
        </Button>
      </HomeGrid>

      {/* Category Tiles (Existing/Placeholder) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['Property Damage', 'Health & Safety', 'My Documents', 'Contact Center'].map((cat, i) => (
          <Card
            key={i}
            className="hover:bg-muted/50 transition-colors cursor-pointer border-none shadow-sm"
          >
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="text-sm font-semibold">{cat}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sidebar / Bottom Widgets (Preserved) */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-premium border-none bg-primary/5 text-primary overflow-hidden">
          <CardHeader className="pb-3 border-b border-primary/10 bg-primary/[0.03]">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Phone className="w-4 h-4" />
              24/7 Hotline
            </CardTitle>
          </CardHeader>
          <div className="p-6 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  MK
                </div>
                <a href="tel:+38970337140" className="text-lg font-black block hover:underline">
                  +389 70 337 140
                </a>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  KS
                </div>
                <a href="tel:+38349900600" className="text-lg font-black block hover:underline">
                  +383 49 900 600
                </a>
              </div>
            </div>
          </div>
        </Card>

        <ReferralCard />
      </div>
    </div>
  );
}
