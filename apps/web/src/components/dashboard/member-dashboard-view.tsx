import { DigitalIDCard } from '@/app/[locale]/components/home/digital-id-card';
import { HomeGrid } from '@/components/member/HomeGrid';
import { ReferralCard } from '@/components/member/referral-card';
import { Link } from '@/i18n/routing';
import { db, eq, subscriptions, user } from '@interdomestik/database';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import {
  Activity,
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
  Zap,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { MatteAnchorCard } from './matte-anchor-card';

const getCachedUser = cache(async (userId: string) => {
  return db.query.user.findFirst({
    where: eq(user.id, userId),
  });
});

const getCachedSubscription = cache(async (userId: string) => {
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  });
});

export async function MemberDashboardView({ userId }: { userId: string }) {
  const t = await getTranslations('dashboard');

  const [userDetails, subscription] = await Promise.all([
    getCachedUser(userId),
    getCachedSubscription(userId),
  ]);

  if (
    userDetails?.role === 'admin' ||
    userDetails?.role === 'super_admin' ||
    userDetails?.role === 'tenant_admin'
  ) {
    redirect('/admin');
  }
  if (userDetails?.role === 'agent') {
    redirect('/agent');
  }
  if (userDetails?.role === 'staff' || userDetails?.role === 'branch_manager') {
    redirect('/staff');
  }

  if (!userDetails) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
        <div className="p-4 rounded-full bg-red-100 text-red-600">
          <ShieldAlert className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold">Account Configuration Error</h2>
        <p className="text-muted-foreground">
          We couldn't retrieve your profile details. Please contact support.
        </p>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/member/help">Get Assistance</Link>
        </Button>
      </div>
    );
  }

  const isActive = subscription?.status === 'active';
  const validThru = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
        month: '2-digit',
        year: '2-digit',
      })
    : 'N/A';

  return (
    <div className="space-y-10 pb-10" data-testid="member-dashboard-ready">
      {/* Adaptive Header Section */}

      <div className="relative overflow-hidden rounded-[3rem] bg-slate-900/80 backdrop-blur-xl border border-white/20 p-8 sm:p-12 shadow-2xl">
        {/* Animated Mesh Background */}

        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-mesh opacity-20" />

          <div
            className={`absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[120px] opacity-20 animate-pulse-soft ${
              isActive ? 'bg-emerald-500' : 'bg-red-500'
            }`}
          />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
          {/* Welcome Lockup */}

          <div className="flex flex-col gap-8 max-w-xl">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <div className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />

                <span
                  className="text-[10px] font-black uppercase tracking-[0.2em]"
                  data-testid="dashboard-heading"
                >
                  {t('overview')}
                </span>
              </div>

              <h1 className="text-4xl md:text-6xl font-display font-black tracking-tight text-white leading-tight">
                Mirësevini,
                <br />
                <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent italic">
                  {userDetails.name.split(' ')[0]}
                </span>
              </h1>
              <p className="text-lg text-slate-400 font-medium leading-relaxed">
                Your global protection network is active and monitoring all systems.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md transition-all hover:bg-white/10">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </span>
                  <span className="text-sm font-black text-white uppercase tracking-tighter">
                    Active
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md transition-all hover:bg-white/10">
                <Zap className="w-5 h-5 text-amber-400" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Level
                  </span>
                  <span className="text-sm font-black text-white uppercase tracking-tighter italic font-display">
                    Premium Elite
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Premium Digital ID Card */}
          <div className="flex-shrink-0 animate-in fade-in zoom-in-95 duration-1000 delay-300">
            <DigitalIDCard
              name={userDetails.name}
              memberNumber={userDetails.memberNumber || 'PENDING'}
              validThru={validThru}
              isActive={isActive}
            />
          </div>
        </div>
      </div>

      {/* Diaspora Ribbon - Modernized with Glass & Gradient */}
      <div className="relative group cursor-pointer">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/40 to-blue-600/40 rounded-[2rem] blur-xl opacity-0 group-hover:opacity-100 transition duration-1000 group-hover:duration-300"></div>
        <div className="relative bg-card/40 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-premium transition-all duration-500 hover:scale-[1.01] hover:border-primary/30">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-lg animate-pulse" />
              <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white shadow-lg">
                <Globe className="w-7 h-7 animate-wiggle" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-display font-bold text-foreground">
                {t('diaspora_ribbon.text')}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Specialized protection architecture for members across Europe and beyond.
              </p>
            </div>
          </div>
          <Button
            asChild
            size="lg"
            className="rounded-2xl px-8 group/btn shadow-lg shadow-primary/20 transition-all active:scale-95"
          >
            <Link href="/member/diaspora" className="flex items-center gap-3">
              <span className="font-bold">{t('diaspora_ribbon.cta')}</span>
              <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1.5 transition-transform duration-300" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Action Center - Primary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <HomeGrid className="sm:grid-cols-2 gap-6">
            {[
              {
                href: '/member/incident-guide',
                id: 'incident',
                label: t('home_grid.cta_incident'),
                icon: AlertCircle,
                color: 'from-red-600 to-red-700',
                description: 'SOS / EMERGENCY',
              },
              {
                href: '/member/report',
                id: 'report',
                label: t('home_grid.cta_report'),
                icon: ClipboardList,
                color: 'from-blue-600 to-blue-700',
                description: 'NEW REPORT',
              },
              {
                href: '/member/green-card',
                id: 'green-card',
                label: t('home_grid.cta_green_card'),
                icon: CreditCard,
                color: 'from-emerald-600 to-emerald-700',
                description: 'TRAVEL DOCS',
              },
              {
                href: '/member/benefits',
                id: 'benefits',
                label: t('home_grid.cta_benefits'),
                icon: Star,
                color: 'from-amber-400 to-orange-400',
                description: 'EXCLUSIVE ACCESS',
              },
            ].map(action => (
              <MatteAnchorCard
                key={action.id}
                href={action.href}
                label={action.label}
                icon={action.icon}
                description={action.description}
                colorClassName={action.color}
              />
            ))}
          </HomeGrid>
        </div>

        {/* Live Intelligence Sidebar */}
        <Card className="rounded-[2.5rem] border-slate-200/60 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl shadow-premium overflow-hidden border-none relative group">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 flex items-center gap-2">
              <Activity className="w-4 h-4 animate-pulse" />
              Live Protection
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-0 space-y-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <span>System Integrity</span>
                  <span className={isActive ? 'text-emerald-500' : 'text-red-500'}>
                    {isActive ? 'Optimal' : 'Low'}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${
                      isActive ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                    style={{ width: isActive ? '100%' : '35%' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                    Nodes
                  </span>
                  <span className="text-xl font-display font-black">124</span>
                </div>
                <div className="p-4 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                    Latency
                  </span>
                  <span className="text-xl font-display font-black">14ms</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Active Protection Nodes
              </h4>
              <div className="space-y-3">
                {['Prishtina-HQ', 'Skopje-East', 'Zürich-Relay'].map(node => (
                  <div key={node} className="flex items-center justify-between">
                    <span className="text-xs font-bold">{node}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-mono text-muted-foreground">Online</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full rounded-2xl border-blue-500/20 hover:bg-blue-500/5 hover:border-blue-500/40 transition-all font-bold group/pulse"
            >
              <Link href="/member/help" className="flex items-center justify-center gap-2">
                <span>View Full Audit</span>
                <ArrowRight className="w-4 h-4 group-hover/pulse:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Service Tiles - Glass Grid */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xl font-display font-black tracking-tight">System Ecosystem</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary"
          >
            Explore All <ArrowRight className="ml-2 w-3 h-3" />
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {[
            {
              key: 'property_damage',
              icon: ShieldCheck,
              desc: 'Damage assessment',
            },
            { key: 'health_safety', icon: HeartPulse, desc: 'Medical guidance' },
            { key: 'my_documents', icon: FileText, desc: 'Policy vault' },
            { key: 'contact_center', icon: Headphones, desc: 'Human support' },
          ].map((cat, i) => (
            <Card
              key={i}
              className="group relative overflow-hidden bg-white/50 dark:bg-white/5 backdrop-blur-sm hover:bg-white dark:hover:bg-white/10 transition-all duration-500 cursor-pointer border-slate-200/60 dark:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4"
              style={{ animationDelay: `${(i + 4) * 100}ms` }}
            >
              <CardContent className="p-7 flex flex-col items-center text-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-2xl blur group-hover:blur-md transition-all duration-500" />
                  <div className="relative w-14 h-14 rounded-2xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-500">
                    <cat.icon className="w-7 h-7" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-sm font-bold block group-hover:text-primary transition-colors">
                    {t(`categories.${cat.key}`)}
                  </span>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {cat.desc}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Bottom Layout - Hybrid Dashboard */}
      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-premium border-none bg-slate-900 text-white overflow-hidden relative group rounded-[2rem]">
          {/* Dynamic Background Grid */}
          <div
            className="absolute inset-0 opacity-[0.05] pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
              backgroundSize: '32px 32px',
            }}
          />

          <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-1000 pointer-events-none">
            <Activity className="w-48 h-48 text-blue-400" />
          </div>

          <CardHeader className="relative p-8 pb-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-display font-black flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                24/7 COMMAND CENTER
              </CardTitle>
              <div className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-[10px] font-black tracking-widest text-blue-400 animate-pulse">
                PRIORITY LINE ACTIVE
              </div>
            </div>
          </CardHeader>

          <div className="relative p-10 flex flex-col gap-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
              <div className="space-y-3 group/link">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400/80">
                  North Macedonia
                </div>
                <a
                  href="tel:+38970337140"
                  className="text-3xl font-display font-black block transition-all group-hover/link:translate-x-2"
                >
                  +389 70 337 140
                </a>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <span>Available now • Avg response 12s</span>
                </div>
              </div>
              <div className="space-y-3 group/link">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400/80">
                  Republic of Kosovo
                </div>
                <a
                  href="tel:+38349900600"
                  className="text-3xl font-display font-black block transition-all group-hover/link:translate-x-2"
                >
                  +383 49 900 600
                </a>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <span>Available now • Avg response 15s</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-8">
          <ReferralCard />
          <Card className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none p-8 shadow-2xl rounded-[2rem] relative overflow-hidden group">
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-1000" />
            <div className="relative space-y-5">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                  <LayoutDashboard className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-display font-black">Status Insight</h3>
              </div>
              <p className="text-sm text-blue-50 leading-relaxed font-medium">
                Your protection status is monitored in real-time by our global operations center.
                Keep your documents in the vault for ultra-fast processing during incidents.
              </p>
              <Button
                variant="secondary"
                className="w-full rounded-xl font-bold bg-white text-blue-600 hover:bg-blue-50"
              >
                Review Security Parameters
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
