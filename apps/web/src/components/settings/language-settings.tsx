'use client';

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
import { usePathname, useRouter } from 'next/navigation';
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
      // Replace the current locale in the path with the new one
      const segments = pathname.split('/');
      // The locale is typically the first segment after the initial /
      if (segments[1] && SUPPORTED_LOCALES.some(l => l.code === segments[1])) {
        segments[1] = newLocale;
      } else {
        // If no locale in path, prepend it
        segments.splice(1, 0, newLocale);
      }
      const newPath = segments.join('/');
      router.push(newPath);
    });
  };

  const currentLocale = SUPPORTED_LOCALES.find(l => l.code === locale);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <CardTitle>{t('language.title')}</CardTitle>
        </div>
        <CardDescription>{t('language.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="language-select">{t('language.selectLabel')}</Label>
          <Select value={locale} onValueChange={handleLocaleChange} disabled={isPending}>
            <SelectTrigger id="language-select" className="w-full max-w-xs">
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
                <SelectItem key={loc.code} value={loc.code}>
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
