'use server';

import { actionFailure, defineAction } from '@/lib/safe-action';
import {
  recipientLocales,
  savePreferredLocale,
} from '@interdomestik/domain-communications/recipient-locale';
import { z } from 'zod';

export const updatePreferredLocale = defineAction({
  name: 'user.updatePreferredLocale',
  basis: { kind: 'self' },
  input: z.strictObject({ locale: z.enum(recipientLocales) }),
  subject: { type: 'self' },
  async handler({ locale }, { authority }) {
    const saved = await savePreferredLocale(authority, locale);
    return saved ? { locale } : actionFailure('conflict');
  },
});
