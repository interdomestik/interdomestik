'use client';

import { analytics } from '@/lib/analytics';
import { flags } from '@/lib/flags';
import type { CreateClaimValues } from '@/lib/validators/claims';
import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { FormControl, FormField, FormItem, FormMessage } from '@interdomestik/ui/components/form';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@interdomestik/ui/components/tooltip';
import { cn } from '@interdomestik/ui/lib/utils';
import { Car, Home, Info, Plane, Stethoscope } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';

const mainCategories = [
  {
    id: 'vehicle',
    icon: Car,
  },
  {
    id: 'property',
    icon: Home,
  },
  {
    id: 'injury',
    icon: Stethoscope,
  },
  {
    id: 'travel',
    icon: Plane,
  },
] as const;

// Quick-select tags for common specific claims
const quickSelectTags = [
  { id: 'flight_delay', label: 'Flight Delay', category: 'travel' },
  { id: 'car_accident', label: 'Car Accident', category: 'vehicle' },
  { id: 'water_damage', label: 'Water Damage', category: 'property' },
  { id: 'workplace_injury', label: 'Workplace Injury', category: 'injury' },
  { id: 'theft', label: 'Theft', category: 'property' },
  { id: 'medical_malpractice', label: 'Medical Malpractice', category: 'injury' },
] as const;

export function WizardStepCategory() {
  const form = useFormContext<CreateClaimValues>();

  useEffect(() => {
    analytics.track('claim_intake_viewed');
  }, []);

  const t = useTranslations('claimCategories');
  const tTags = useTranslations('wizard.quickTags');

  const handleCategorySelect = (id: (typeof mainCategories)[number]['id']) => {
    analytics.track('claim_category_selected', { category: id });
    form.setValue('category', id);
  };

  const handleTagSelect = (tag: (typeof quickSelectTags)[number]) => {
    // analytics.track('claim_quick_tag_selected', { tag: tag.id, category: tag.category });
    form.setValue('category', tag.category);
    // Optionally set a subcategory field if you have one
    // form.setValue('subcategory', tag.id);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
        <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
        {flags.callMeNow && (
          <div className="mt-4 inline-flex items-center rounded-full border border-[hsl(var(--success))] px-3 py-1 text-sm font-medium text-[hsl(var(--success))] bg-[hsl(var(--success))]/10">
            ✨ {t('startClaim')}
          </div>
        )}
      </div>

      <FormField
        control={form.control}
        name="category"
        render={({ field }) => (
          <FormItem className="space-y-6">
            <FormControl>
              <div className="space-y-6">
                {/* Main Category Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mainCategories.map(category => {
                    const Icon = category.icon;
                    const isSelected = field.value === category.id;
                    const label = t(`${category.id}.title`);
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
                        onClick={() => handleCategorySelect(category.id)}
                      >
                        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                          <div className="flex items-center gap-4">
                            <div
                              className={cn(
                                'p-3 rounded-xl',
                                isSelected
                                  ? 'bg-[hsl(var(--primary))] text-white'
                                  : 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                              )}
                            >
                              <Icon className="h-6 w-6" />
                            </div>
                            <CardTitle className="text-lg">{label}</CardTitle>
                          </div>

                          {/* Info Tooltip */}
                          <div onClick={e => e.stopPropagation()}>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
                                  >
                                    <Info className="h-4 w-4" />
                                    <span className="sr-only">Info</span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-[200px] text-xs">{examples}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">{description}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Quick Select Tags */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">
                    {t('quickSelectLabel')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {quickSelectTags.map(tag => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className={cn(
                          'cursor-pointer px-4 py-2 text-sm hover:bg-[hsl(var(--primary))]/10 hover:border-[hsl(var(--primary))] transition-all',
                          field.value === tag.category &&
                            'bg-[hsl(var(--primary))]/10 border-[hsl(var(--primary))]'
                        )}
                        onClick={() => handleTagSelect(tag)}
                      >
                        {tTags(tag.id)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
