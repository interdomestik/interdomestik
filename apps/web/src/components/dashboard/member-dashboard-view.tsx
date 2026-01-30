import { HomeGrid } from '@/components/member/HomeGrid';
import { ReferralCard } from '@/components/member/referral-card';
import { Link } from '@/i18n/routing';
import { db, eq, subscriptions } from '@interdomestik/database';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import {
  AlertCircle,
  ArrowRight,
  ClipboardList,
  CreditCard,
  FileText,
  Globe,
  Headphones,
  HeartPulse,
  LayoutDashboard,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export async function MemberDashboardView({ userId }: { userId: string }) {
  const t = await getTranslations('dashboard');

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  });

  const isActive = subscription?.status === 'active';

  return (
    <div className="space-y-10 pb-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1.5">
          <h1
            className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl animate-in fade-in slide-in-from-left-4 duration-500"
            data-testid="dashboard-heading"
          >
            {t('overview')}
          </h1>
          <p className="text-lg text-muted-foreground animate-in fade-in slide-in-from-left-4 duration-700">
            {t('welcome_back')}
          </p>
        </div>

        {/* Protection Status Card */}
        <Card
          data-testid="protection-status"
          data-status={isActive ? 'active' : 'inactive'}
          className={`flex-shrink-0 min-w-[240px] transition-all duration-500 animate-in fade-in slide-in-from-right-4 overflow-hidden ${
            isActive ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'
          }`}
        >
          <div className="px-5 py-4 flex items-center gap-4">
            <div
              className={`p-2.5 rounded-2xl ${
                isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
              }`}
            >
              {isActive ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80 leading-none mb-1">
                {isActive ? 'System Active' : 'Action Required'}
              </span>
              <span
                className={`text-base font-heavy ${isActive ? 'text-green-700' : 'text-red-700'}`}
              >
                {isActive ? 'Fully Protected' : 'Protection Paused'}
              </span>
            </div>
          </div>
          <div className={`h-1 w-full ${isActive ? 'bg-green-500/30' : 'bg-red-500/30'}`}>
            <div
              className={`h-full ${isActive ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}
              style={{ width: isActive ? '100%' : '30%' }}
            />
          </div>
        </Card>
      </div>

      {/* Diaspora Ribbon - Modernized */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-blue-600 rounded-2xl blur opacity-10 group-hover:opacity-20 transition duration-1000 group-hover:duration-200"></div>
        <div
          className="relative bg-card border border-border/50 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm transition-all duration-300 hover:shadow-md"
          data-testid="diaspora-ribbon"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">{t('diaspora_ribbon.text')}</h3>
              <p className="text-xs text-muted-foreground">
                Global coverage for members living abroad
              </p>
            </div>
          </div>
          <Button asChild className="rounded-xl px-6 group/btn">
            <Link
              href="/member/diaspora"
              className="flex items-center gap-2"
              data-testid="diaspora-ribbon-cta"
            >
              {t('diaspora_ribbon.cta')}
              <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Crystal Home 4-CTA Grid - Transformed to premium action cards */}
      <HomeGrid className="lg:grid-cols-4">
        {[
          {
            href: '/member/incident-guide',
            id: 'incident',
            label: t('home_grid.cta_incident'),
            icon: AlertCircle,
            color: 'bg-red-600',
            hoverColor: 'hover:bg-red-700',
            description: 'Immediate help',
          },
          {
            href: '/member/report',
            id: 'report',
            label: t('home_grid.cta_report'),
            icon: ClipboardList,
            color: 'bg-blue-600',
            hoverColor: 'hover:bg-blue-700',
            description: 'Report a claim',
          },
          {
            href: '/member/green-card',
            id: 'green-card',
            label: t('home_grid.cta_green_card'),
            icon: CreditCard,
            color: 'bg-green-600',
            hoverColor: 'hover:bg-green-700',
            description: 'Request card',
          },
          {
            href: '/member/benefits',
            id: 'benefits',
            label: t('home_grid.cta_benefits'),
            icon: Star,
            color: 'bg-amber-400',
            hoverColor: 'hover:bg-amber-500',
            textColor: 'text-amber-950',
            description: 'View perks',
          },
        ].map((action, idx) => (
          <Button
            key={action.id}
            asChild
            className={`h-auto min-h-[160px] p-6 flex-col items-start text-left gap-4 shadow-lg hover:shadow-xl transition-all duration-300 rounded-3xl border-b-4 border-black/10 animate-in fade-in zoom-in-95 delay-${idx * 100} ${action.color} ${action.hoverColor} ${action.textColor || 'text-white'}`}
            data-testid={`home-cta-${action.id}`}
          >
            <Link href={action.href} className="w-full">
              <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-md">
                <action.icon className="w-6 h-6" />
              </div>
              <div className="mt-auto">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                  {action.description}
                </p>
                <span className="text-xl font-black leading-tight">{action.label}</span>
              </div>
            </Link>
          </Button>
        ))}
      </HomeGrid>

      {/* Secondary Service Tiles */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold tracking-tight px-1">Explore Services</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { key: 'property_damage', icon: ShieldCheck, label: 'Property' },
            { key: 'health_safety', icon: HeartPulse, label: 'Health' },
            { key: 'my_documents', icon: FileText, label: 'Documents' },
            { key: 'contact_center', icon: Headphones, label: 'Support' },
          ].map((cat, i) => (
            <Card
              key={i}
              className="group hover:bg-primary hover:text-primary-foreground transition-all duration-300 cursor-pointer border-none shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4"
              style={{ animationDelay: `${(i + 4) * 100}ms` }}
            >
              <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-white/20 group-hover:text-white transition-colors duration-300">
                  <cat.icon className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-bold block">{t(`categories.${cat.key}`)}</span>
                  <p className="text-[10px] opacity-60 group-hover:opacity-100 transition-opacity">
                    Learn more →
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Bottom Widgets */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-premium border-none bg-primary/5 text-primary overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:scale-110 transition-transform duration-700 pointer-events-none">
            <Phone className="w-32 h-32" />
          </div>
          <CardHeader className="pb-3 border-b border-primary/10 bg-primary/[0.03]">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Phone className="w-4 h-4" />
              24/7 Premium Hotline
            </CardTitle>
          </CardHeader>
          <div className="p-8 flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  North Macedonia
                </div>
                <a
                  href="tel:+38970337140"
                  className="text-2xl font-black block hover:text-blue-600 transition-colors"
                >
                  +389 70 337 140
                </a>
                <p className="text-xs text-muted-foreground">Regional service center</p>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Kosovo
                </div>
                <a
                  href="tel:+38349900600"
                  className="text-2xl font-black block hover:text-blue-600 transition-colors"
                >
                  +383 49 900 600
                </a>
                <p className="text-xs text-muted-foreground">Regional service center</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <ReferralCard />
          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-white/10 rounded-lg">
                <LayoutDashboard className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="font-bold">Membership Insight</h3>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Your protection status is monitored in real-time. Keep your documents updated for
              faster claim processing.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
