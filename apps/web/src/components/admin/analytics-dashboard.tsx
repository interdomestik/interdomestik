'use client';

import { AnalyticsData, getAdminAnalytics } from '@/actions/analytics';
import { GlassCard } from '@/components/ui/glass-card';
import {
  Activity,
  CreditCard,
  Loader2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await getAdminAnalytics();
      if (result.success && result.data) {
        setData(result.data);
      } else {
        toast.error('Failed to load analytics');
      }
      setIsLoading(false);
    }
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      {/* Financial KPIs */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <GlassCard className="p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
            <Wallet className="h-6 w-6 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Total MRR</p>
            <div className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
                data.mrr
              )}
            </div>
            <div className="flex items-center text-xs text-emerald-600 font-medium">
              <TrendingUp className="mr-1 h-3 w-3" />
              +20.1% <span className="text-muted-foreground ml-1">vs last month</span>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500/50 to-emerald-500/0 opacity-50" />
        </GlassCard>

        <GlassCard className="p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
            <Users className="h-6 w-6 text-blue-500" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Active Members</p>
            <div className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
              {data.activeMembers}
            </div>
            <div className="flex items-center text-xs text-blue-600 font-medium">
              <TrendingUp className="mr-1 h-3 w-3" />
              +15 <span className="text-muted-foreground ml-1">new members</span>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-blue-500/0 via-blue-500/50 to-blue-500/0 opacity-50" />
        </GlassCard>

        <GlassCard className="p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
            <CreditCard className="h-6 w-6 text-violet-500" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">LTV (Avg)</p>
            <div className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
              €245.00
            </div>
            <div className="flex items-center text-xs text-violet-600 font-medium">
              <Activity className="mr-1 h-3 w-3" />
              Stable <span className="text-muted-foreground ml-1">performance</span>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-violet-500/0 via-violet-500/50 to-violet-500/0 opacity-50" />
        </GlassCard>

        <GlassCard className="p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
            <TrendingDown className="h-6 w-6 text-orange-500" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Churn Rate</p>
            <div className="text-3xl font-bold tracking-tight bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
              {data.churnRate.toFixed(1)}%
            </div>
            <div className="flex items-center text-xs text-green-600 font-medium">
              <TrendingDown className="mr-1 h-3 w-3" />
              -0.5% <span className="text-muted-foreground ml-1">improvement</span>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-orange-500/0 via-orange-500/50 to-orange-500/0 opacity-50" />
        </GlassCard>
      </div>

      {/* Growth Chart */}
      <GlassCard className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Member Growth</h2>
          <p className="text-sm text-muted-foreground">Net active members over the last 30 days</p>
        </div>
        <div className="h-[350px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={350} aspect={3}>
            <AreaChart data={data.memberGrowth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(255,255,255,0.1)"
              />
              <XAxis
                dataKey="date"
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={value => `${value}`}
                dx={-10}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(23, 23, 23, 0.9)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(10px)',
                }}
                itemStyle={{ color: '#e5e5e5' }}
                cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="url(#strokeGradient)"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorCount)"
                activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2, fill: '#0ea5e9' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>
    </div>
  );
}
