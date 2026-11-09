import type { AbstractIntlMessages, createTranslator } from 'next-intl';
import { vi } from 'vitest';

export async function createLocaleTranslationsMock(
  language: Readonly<{ locale: string }>,
  getMessages: () => AbstractIntlMessages
): Promise<{ useTranslations: (namespace: string) => ReturnType<typeof createTranslator> }> {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl');
  return {
    useTranslations: (namespace: string) =>
      createTranslator({
        locale: language.locale,
        namespace,
        messages: getMessages(),
      }),
  };
}
