'use client';

import { updateResidenceCountry } from '@/actions/user-settings';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { Input } from '@interdomestik/ui/components/input';
import { Label } from '@interdomestik/ui/components/label';
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

const ISO_COUNTRY = /^[A-Z]{2}$/u;

type ResidenceCountrySettingsProps = {
  initialResidenceCountry?: string | null;
};

export function ResidenceCountrySettings({
  initialResidenceCountry,
}: ResidenceCountrySettingsProps) {
  const t = useTranslations('settings.residenceCountry');
  const [isPending, startTransition] = useTransition();
  const [savedValue, setSavedValue] = useState(initialResidenceCountry ?? '');
  const [value, setValue] = useState(initialResidenceCountry ?? '');
  const [decision, setDecision] = useState<string | null>(null);
  const normalized = useMemo(() => value.trim().toUpperCase(), [value]);
  const canSubmit = ISO_COUNTRY.test(normalized) && normalized !== savedValue && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    startTransition(async () => {
      const result = await updateResidenceCountry(normalized);
      if (result.success !== true) {
        toast.error(t('error'), { description: result.error });
        return;
      }

      setSavedValue(result.decision.toResidenceCountry);
      setValue(result.decision.toResidenceCountry);
      if (result.decision.changeState === 'unchanged') {
        setDecision(null);
        return;
      }
      setDecision(result.decision.changeState);
      toast.success(t('success'));
    });
  }

  return (
    <Card className="border-border/50 bg-card/30 backdrop-blur-md shadow-premium relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
      <CardHeader>
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-xl font-semibold">{t('title')}</CardTitle>
        </div>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="relative">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="residence-country">{t('label')}</Label>
            <Input
              autoCapitalize="characters"
              autoComplete="country"
              id="residence-country"
              maxLength={2}
              onChange={event => {
                setDecision(null);
                setValue(event.target.value.toUpperCase());
              }}
              pattern="[A-Z]{2}"
              placeholder={t('placeholder')}
              value={value}
            />
          </div>
          {decision ? (
            <p className="text-sm text-muted-foreground" data-testid="residence-country-decision">
              {t(`decision.${decision}`)}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit}>
              {isPending ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
