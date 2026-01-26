import { Link } from '@/i18n/routing';
import { Button, Card, CardContent } from '@interdomestik/ui';
import { ArrowRight, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface DailyFocusProps {
  followUpsCount: number;
  newLeadsCount: number;
}

export function DailyFocus({ followUpsCount, newLeadsCount }: DailyFocusProps) {
  const t = useTranslations('agent.dailyFocus');

  // Logic: Priority 1 - Follow Ups
  if (followUpsCount > 0) {
    return (
      <Card
        className="mb-6 border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20"
        data-testid="daily-focus-card-followup"
      >
        <CardContent className="p-6 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center text-orange-600 dark:text-orange-400 font-semibold mb-1">
              <Clock className="w-4 h-4 mr-2" />
              {t('priority')}
            </div>
            <h3 className="text-xl font-bold">{t('followupTitle', { count: followUpsCount })}</h3>
            <p className="text-muted-foreground">{t('followupDesc')}</p>
          </div>
          <Button asChild size="lg" className="shrink-0" data-testid="daily-focus-action">
            <Link href="/agent/follow-ups">
              {t('actionFollowUp')}
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Logic: Priority 2 - New Leads
  if (newLeadsCount > 0) {
    return (
      <Card
        className="mb-6 border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
        data-testid="daily-focus-card-leads"
      >
        <CardContent className="p-6 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center text-blue-600 dark:text-blue-400 font-semibold mb-1">
              <Sparkles className="w-4 h-4 mr-2" />
              {t('start')}
            </div>
            <h3 className="text-xl font-bold">{t('leadsTitle', { count: newLeadsCount })}</h3>
            <p className="text-muted-foreground">{t('leadsDesc')}</p>
          </div>
          <Button asChild size="lg" className="shrink-0" data-testid="daily-focus-action">
            <Link href="/agent/leads?status=new">
              {t('actionLeads')}
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Logic: Priority 3 - All Clear
  return (
    <Card
      className="mb-6 border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20"
      data-testid="daily-focus-card-clear"
    >
      <CardContent className="p-6 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center text-green-600 dark:text-green-400 font-semibold mb-1">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {t('greatJob')}
          </div>
          <h3 className="text-xl font-bold">{t('emptyTitle')}</h3>
          <p className="text-muted-foreground">{t('emptyDesc')}</p>
        </div>
        {/* Optional: Add a secondary action like 'View Analytics' or just hidden */}
      </CardContent>
    </Card>
  );
}
