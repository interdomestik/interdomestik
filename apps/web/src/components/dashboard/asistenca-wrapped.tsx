'use client';

import { Card, CardContent } from '@interdomestik/ui';
import { format } from 'date-fns';
import { Award, Calendar, ShieldCheck, Star, Target, TrendingUp, Zap } from 'lucide-react';

type WrappedStats = {
  userName: string;
  planId: string;
  daysProtected: number;
  totalClaims: number;
  resolvedCount: number;
  totalRecovered: number;
  joinedDate: Date;
};

export function AsistencaWrapped({ stats }: { stats: WrappedStats }) {
  return (
    <div className="max-w-4xl mx-auto space-y-12 py-8 animate-fade-in">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary via-purple-600 to-indigo-700 p-12 text-white shadow-2xl">
        <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
          <Award className="w-64 h-64 rotate-12" />
        </div>

        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-sm font-bold border border-white/30">
            <Zap className="w-4 h-4 text-amber-300" />
            2025 WRAPPED
          </div>

          <h1 className="text-5xl md:text-7xl font-display font-black tracking-tight leading-none">
            {stats.userName.split(' ')[0]},<br />
            You're Protected.
          </h1>

          <p className="text-xl md:text-2xl text-white/80 max-w-xl font-medium">
            Another year of security and expert assistance. Here's a look at your protection journey
            with Interdomestik.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Days Protected */}
        <Card className="relative overflow-hidden border-none bg-emerald-50 shadow-premium hover-lift">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Calendar className="w-24 h-24" />
          </div>
          <CardContent className="pt-8 text-center pb-8">
            <div className="text-5xl font-black text-emerald-600 mb-2">{stats.daysProtected}</div>
            <div className="text-sm font-bold text-emerald-800 uppercase tracking-wider">
              Days of Protection
            </div>
            <p className="text-xs text-emerald-600/70 mt-4 font-medium">
              Active since {format(stats.joinedDate, 'MMMM yyyy')}
            </p>
          </CardContent>
        </Card>

        {/* Claims Handled */}
        <Card className="relative overflow-hidden border-none bg-blue-50 shadow-premium hover-lift">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Target className="w-24 h-24" />
          </div>
          <CardContent className="pt-8 text-center pb-8">
            <div className="text-5xl font-black text-blue-600 mb-2">
              {stats.resolvedCount}/{stats.totalClaims}
            </div>
            <div className="text-sm font-bold text-blue-800 uppercase tracking-wider">
              Resolved Cases
            </div>
            <p className="text-xs text-blue-600/70 mt-4 font-medium">
              Handled with expert mediation
            </p>
          </CardContent>
        </Card>

        {/* Total Recovered */}
        <Card className="relative overflow-hidden border-none bg-purple-50 shadow-premium hover-lift">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <TrendingUp className="w-24 h-24" />
          </div>
          <CardContent className="pt-8 text-center pb-8">
            <div className="text-4xl font-black text-purple-600 mb-2">
              €{stats.totalRecovered.toLocaleString()}
            </div>
            <div className="text-sm font-bold text-purple-800 uppercase tracking-wider">
              Total Amount Managed
            </div>
            <p className="text-xs text-purple-600/70 mt-4 font-medium">
              Your membership value in action
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status Badge */}
      <div className="bg-slate-900 rounded-[2rem] p-8 text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl">
        <div className="flex items-center gap-6 text-center md:text-left">
          <div className="h-20 w-20 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <div>
            <div className="text-2xl font-black">{stats.planId.toUpperCase()} MEMBER</div>
            <p className="text-white/60 font-medium">Highest level of protection secured.</p>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
          <Star className="text-amber-400 fill-amber-400 w-5 h-5" />
          <span className="font-bold">Member Rating: Elite</span>
        </div>
      </div>
    </div>
  );
}
