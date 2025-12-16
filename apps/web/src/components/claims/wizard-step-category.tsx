import { analytics } from '@/lib/analytics';
import { flags } from '@/lib/flags';
import type { CreateClaimValues } from '@/lib/validators/claims';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { FormControl, FormField, FormItem, FormMessage } from '@interdomestik/ui/components/form';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@interdomestik/ui/components/tooltip';
import { cn } from '@interdomestik/ui/lib/utils';
import { Info, Package, Plane, RefreshCw, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { CallMeNowDialog } from './call-me-now-dialog';

const categories = [
  {
    id: 'flight_delay',
    label: 'Flight Delay',
    icon: Plane,
    description: 'EU261 Compensation up to €600',
    experiment: true,
  },
  {
    id: 'damaged_goods',
    label: 'Damaged Goods',
    icon: Package,
    description: 'Items arrived broken or not as described',
  },
  {
    id: 'service_issue',
    label: 'Service Issue',
    icon: Wrench,
    description: 'Poor service from utilities, telecom, etc.',
  },
  { id: 'other', label: 'Other', icon: RefreshCw, description: 'Any other consumer dispute' },
] as const;

export function WizardStepCategory() {
  const form = useFormContext<CreateClaimValues>();

  useEffect(() => {
    analytics.track('claim_intake_viewed');
    if (flags.flightDelay) {
      analytics.track('flight_delay_tile_viewed');
    }
    if (flags.callMeNow) {
      analytics.track('call_me_now_viewed');
    }
  }, []);

  const t = useTranslations('wizard.categories');

  const visibleCategories = categories.filter(cat => {
    if (cat.id === 'flight_delay') return flags.flightDelay;
    return true;
  });

  const handleSelect = (id: (typeof categories)[number]['id']) => {
    analytics.track('claim_category_selected', { category: id });
    if (id === 'flight_delay') {
      analytics.track('flight_delay_tile_clicked');
    }
    form.setValue('category', id);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
        <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
        <div className="mt-4 inline-flex items-center rounded-full border border-[hsl(var(--success))] px-3 py-1 text-sm font-medium text-[hsl(var(--success))] bg-[hsl(var(--success))]/10">
          {t('freeConsultation')}
        </div>
      </div>

      <FormField
        control={form.control}
        name="category"
        render={({ field }) => (
          <FormItem className="space-y-4">
            <FormControl>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleCategories.map(category => {
                  const Icon = category.icon;
                  const isSelected = field.value === category.id;
                  const showCallMe =
                    flags.callMeNow &&
                    (category.id === 'damaged_goods' || category.id === 'service_issue');

                  const label = t(`${category.id}.label`);
                  const description = t(`${category.id}.description`);
                  const examples = t(`${category.id}.examples`);

                  return (
                    <Card
                      key={category.id}
                      data-testid={`category-${category.id}`}
                      className={cn(
                        'cursor-pointer transition-all hover:border-[hsl(var(--primary))] hover:shadow-md interactive-press',
                        isSelected
                          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 ring-2 ring-[hsl(var(--primary))] ring-offset-2'
                          : ''
                      )}
                      onClick={() => handleSelect(category.id)}
                    >
                      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              'p-2 rounded-full',
                              isSelected
                                ? 'bg-[hsl(var(--primary))] text-white'
                                : 'bg-[hsl(var(--muted))]'
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <CardTitle className="text-base">{label}</CardTitle>
                        </div>

                        {/* Info Tooltip */}
                        <div onClick={e => e.stopPropagation()}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground -mt-1 -mr-2"
                                >
                                  <Info className="h-4 w-4" />
                                  <span className="sr-only">Info</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-[200px] text-xs">{examples}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-2">{description}</p>
                        {showCallMe && <CallMeNowDialog category={category.id} />}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
