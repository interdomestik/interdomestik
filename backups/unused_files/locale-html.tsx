// Client helper to keep <html lang> in sync with the active locale.
'use client';

import { useEffect } from 'react';

type Props = {
  locale: string;
};

export function LocaleHtmlUpdater({ locale }: Props) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
