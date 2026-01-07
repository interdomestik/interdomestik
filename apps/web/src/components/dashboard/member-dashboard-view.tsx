import { ReferralCard } from '@/components/member/referral-card';
import { and, claims, db, eq, inArray, subscriptions } from '@interdomestik/database';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { count, sum } from 'drizzle-orm';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Phone,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export async function MemberDashboardView({ userId }: { userId: string }) {
  const t = await getTranslations('dashboard');

  const activeClaimStatuses = CLAIM_STATUSES.filter(
    status => status !== 'draft' && status !== 'resolved' && status !== 'rejected'
  ) as ClaimStatus[];

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  });

  // Count claims by status
  const [totalClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(eq(claims.userId, userId));

  const [activeClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.userId, userId), inArray(claims.status, activeClaimStatuses)));

  const [resolvedClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.userId, userId), eq(claims.status, 'resolved')));

  const [totalRecovered] = await db
    .select({ total: sum(claims.claimAmount) })
    .from(claims)
    .where(and(eq(claims.userId, userId), eq(claims.status, 'resolved')));

  const stats = {
    total: totalClaims?.count || 0,
    active: activeClaims?.count || 0,
    resolved: resolvedClaims?.count || 0,
    recovered: Number(totalRecovered?.total || 0),
  };

  const isActive = subscription?.status === 'active';

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('overview')}</h1>
          <p className="text-muted-foreground">{t('welcome_back')}</p>
        </div>

        {/* Protection Status Badge */}
        <div className="flex items-center gap-2 px-4 py-2 bg-white/50 backdrop-blur-sm border rounded-2xl shadow-sm">
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
          {isActive && (
            <Badge
              variant="outline"
              className="ml-2 bg-green-50 text-green-700 border-green-200 text-[10px] h-5"
            >
              {subscription.planId.toUpperCase().replace('_', ' ')}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Membership Promo / Status Card */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <Card
            className={`relative overflow-hidden border-none shadow-premium transition-all duration-300 ${
              isActive
                ? 'bg-gradient-to-br from-primary/5 via-white to-primary/5'
                : 'bg-gradient-to-br from-amber-50 via-white to-amber-50'
            }`}
          >
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
              <ShieldCheck className="w-48 h-48 rotate-12" />
            </div>

            <CardHeader className="pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`p-2 rounded-xl ${isActive ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-600'}`}
                >
                  <Smartphone className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl">
                  {isActive ? 'Digital Protection Active' : 'Activate Your Protection'}
                </CardTitle>
              </div>
              <CardDescription className="max-w-md text-base">
                {isActive
                  ? 'Your membership provides 24/7 expert mediation and emergency legal support.'
                  : 'Get 24/7 emergency support, free legal consultations, and 50% discount on mediation fees for only €20/year.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="pb-8">
              {isActive ? (
                <div className="flex flex-wrap gap-4 items-center">
                  <Button asChild size="lg" className="h-12 shadow-primary/20">
                    <Link href="/member/membership/card">
                      <Wallet className="mr-2 h-5 w-5" />
                      View Member Card
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-12 border-none bg-white shadow-sm hover:bg-muted"
                    asChild
                  >
                    <Link href="/member/membership">Manage Plan</Link>
                  </Button>
                </div>
              ) : (
                <Button asChild size="lg" className="h-12 bg-amber-600 hover:bg-amber-700">
                  <Link href="/pricing">Activate Protection Now</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="shadow-premium hover:shadow-premium-hover transition-all duration-300 group border-none bg-white/50 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium">{t('activeClaims')}</CardTitle>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                  <FileText className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold">{stats.active}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-premium hover:shadow-premium-hover transition-all duration-300 group border-none bg-white/50 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium">{t('totalSaved')}</CardTitle>
                </div>
                <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success group-hover:bg-success group-hover:text-white transition-colors duration-300">
                  <ArrowUpRight className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold">€{stats.recovered.toFixed(2)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-premium hover:shadow-premium-hover transition-all duration-300 group border-none bg-white/50 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium">{t('actionItems')}</CardTitle>
                </div>
                <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center text-warning group-hover:bg-warning group-hover:text-black transition-colors duration-300">
                  <AlertCircle className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold">{stats.active}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <Card className="shadow-premium border-none bg-primary/5 text-primary overflow-hidden">
            <CardHeader className="pb-3 border-b border-primary/10 bg-primary/[0.03]">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Phone className="w-4 h-4" />
                24/7 Hotline
              </CardTitle>
            </CardHeader>
            <div className="flex flex-col gap-4">
              {/* North Macedonia */}
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">
                  <span>🇲🇰 North Macedonia</span>
                </div>
                <div className="text-xl font-black tracking-tighter">
                  <a href="tel:+38970337140" className="hover:text-primary transition-colors">
                    +389 70 337 140
                  </a>
                </div>
              </div>

              {/* Kosovo */}
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">
                  <span>🇽🇰 Kosovo</span>
                </div>
                <div className="text-xl font-black tracking-tighter">
                  <a href="tel:+38349900600" className="hover:text-primary transition-colors">
                    +383 49 900 600
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button
                  size="sm"
                  variant="default"
                  className="w-full font-bold shadow-lg shadow-primary/30"
                  asChild
                >
                  <a href="tel:+38970337140">Call MK</a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full font-bold bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                  asChild
                >
                  <a
                    href="https://wa.me/38970337140?text=I%20have%20an%20emergency"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          </Card>

          {/* Referral Invite Card */}
          <ReferralCard />

          <Card className="shadow-premium border-none bg-white">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-bold">Your Benefits</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col">
                {[
                  { l: 'Legal Consultations', v: isActive ? 'Unlimited' : '0/2', ok: isActive },
                  { l: 'Damage Calculator', v: 'Active', ok: true },
                  { l: 'Expert Reports', v: isActive ? '50% Off' : 'Locked', ok: isActive },
                ].map(b => (
                  <div
                    key={b.l}
                    className="flex items-center justify-between px-6 py-4 border-t first:border-t-0 group hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                      {b.l}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold ${b.ok ? 'text-green-600' : 'text-muted-foreground'}`}
                      >
                        {b.v}
                      </span>
                      {b.ok ? (
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
