import en from '@/messages/en/admin-users.json';
import mk from '@/messages/mk/admin-users.json';

function translate(messages: unknown, key: string): string {
  const value = key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, messages);
  return typeof value === 'string' ? value : key;
}

export const translationFns = {
  en: (key: string) => translate(en.admin.users_page.roles_panel, key),
  mk: (key: string) => translate(mk.admin.users_page.roles_panel, key),
};
