'use client';

import { getAgentLeaderboard, type LeaderboardEntry } from '@/actions/leaderboard';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Skeleton } from '@interdomestik/ui/components/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@interdomestik/ui/components/tabs';
import { Crown, Medal, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';

type Period = 'week' | 'month' | 'all';

const RANK_ICONS = {
  1: <Trophy className="h-4 w-4 text-yellow-500" />,
  2: <Medal className="h-4 w-4 text-gray-400" />,
  3: <Medal className="h-4 w-4 text-amber-600" />,
};

const RANK_COLORS = {
  1: 'bg-gradient-to-r from-yellow-50 to-yellow-100 border-yellow-200',
  2: 'bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200',
  3: 'bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200',
};

export function LeaderboardCard() {
  const t = useTranslations('agent.leaderboard');
  const [period, setPeriod] = useState<Period>('month');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const skeletonId = useId();

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const result = await getAgentLeaderboard(period);
        if (result.success) {
          setEntries(result.data.topAgents);
          setCurrentUserRank(result.data.currentUserRank);
        }
      } catch (error) {
        console.error('Failed to load leaderboard:', error);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [period]);

  const renderContent = () => {
    if (isLoading) {
      return [0, 1, 2, 3, 4].map(i => (
        <Skeleton key={`${skeletonId}-${i}`} className="h-12 w-full" />
      ));
    }
    if (entries.length === 0) {
      return <p className="text-sm text-muted-foreground text-center py-4">{t('noData')}</p>;
    }
    return entries.map(entry => (
      <div
        key={entry.agentId}
        className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${
          entry.isCurrentUser
            ? 'ring-2 ring-primary ring-offset-1 bg-primary/5'
            : RANK_COLORS[entry.rank as keyof typeof RANK_COLORS] || 'bg-muted/30'
        }`}
      >
        {/* Rank */}
        <div className="w-6 text-center font-bold text-sm">
          {RANK_ICONS[entry.rank as keyof typeof RANK_ICONS] || (
            <span className="text-muted-foreground">{entry.rank}</span>
          )}
        </div>

        {/* Avatar */}
        <Avatar className="h-8 w-8">
          <AvatarImage src={entry.agentImage || undefined} />
          <AvatarFallback className="text-xs">
            {entry.agentName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {entry.agentName}
            {entry.isCurrentUser && <span className="ml-1 text-xs text-primary">({t('you')})</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {entry.dealCount} {t('deals')}
          </p>
        </div>

        {/* Earnings */}
        <div className="text-right">
          <p className="text-sm font-bold text-green-600">€{entry.totalEarned.toFixed(2)}</p>
        </div>
      </div>
    ));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Crown className="h-4 w-4 text-yellow-500" />
            {t('title')}
          </CardTitle>
          <Tabs value={period} onValueChange={v => setPeriod(v as Period)}>
            <TabsList className="h-8">
              <TabsTrigger value="week" className="text-xs px-2">
                {t('week')}
              </TabsTrigger>
              <TabsTrigger value="month" className="text-xs px-2">
                {t('month')}
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs px-2">
                {t('allTime')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {renderContent()}

        {/* Current user rank if not in top 10 */}
        {currentUserRank && currentUserRank > 10 && (
          <div className="pt-2 border-t mt-2">
            <p className="text-xs text-center text-muted-foreground">
              {t('yourRank')}: <span className="font-bold">#{currentUserRank}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
