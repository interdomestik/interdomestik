'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { Label } from '@interdomestik/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { Check, Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';

const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'sq', name: 'Shqip', flag: '🇦🇱' },
  { code: 'sr', name: 'Srpski', flag: '🇷🇸' },
  { code: 'mk', name: 'Македонски', flag: '🇲🇰' },
] as const;

export function LanguageSettings() {
  const t = useTranslations('settings');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const handleLocaleChange = (newLocale: string) => {
    startTransition(() => {
      // usePathname from @/i18n/routing returns the path WITHOUT the locale prefix
      // useRouter from @/i18n/routing handles adding the new locale prefix automatically
      router.replace(pathname, { locale: newLocale });
    });
  };

  const currentLocale = SUPPORTED_LOCALES.find(l => l.code === locale);

  return (
    <Card className="border-border/50 bg-card/30 backdrop-blur-md shadow-premium relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-xl font-semibold">{t('language.title')}</CardTitle>
        </div>
        <CardDescription>{t('language.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="language-select">{t('language.selectLabel')}</Label>
          <Select value={locale} onValueChange={handleLocaleChange} disabled={isPending}>
            <SelectTrigger
              id="language-select"
              className="w-full max-w-xs bg-background/50 border-border/50 focus:ring-primary/20 transition-all duration-300 hover:border-primary/50"
              data-testid="language-select"
            >
              <SelectValue>
                {currentLocale ? (
                  <span className="flex items-center gap-2">
                    <span>{currentLocale.flag}</span>
                    <span>{currentLocale.name}</span>
                  </span>
                ) : (
                  t('language.selectPlaceholder')
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LOCALES.map(loc => (
                <SelectItem
                  key={loc.code}
                  value={loc.code}
                  data-testid={`language-option-${loc.code}`}
                >
                  <span className="flex items-center gap-2">
                    <span>{loc.flag}</span>
                    <span>{loc.name}</span>
                    {loc.code === locale && <Check className="h-4 w-4 text-primary ml-auto" />}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">{t('language.hint')}</p>
      </CardContent>
    </Card>
  );
}
