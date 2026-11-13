import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { LOCALES } from '@/i18n/locales';
import {
  AGENT_NAMESPACES,
  APP_NAMESPACES,
  loadAllMessages,
  loadMessagesForNamespaces,
  pickMessages,
} from '@/i18n/messages';

vi.unmock('next-intl');
vi.mock('@/i18n/routing', () => ({
  routing: { defaultLocale: 'sq', locales: ['sq', 'en', 'sr', 'mk', 'de'] },
}));
const catalogModules = import.meta.glob('../messages/*/*.json', { eager: true, import: 'default' });
function catalog(locale: string, namespace: string): Record<string, unknown> {
  return catalogModules[`../messages/${locale}/${namespace}.json`] as Record<string, unknown>;
}
function valueAt(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (item, key) =>
        item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined,
      value
    );
}
function keys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value)
    .flatMap(([key, item]) => keys(item, `${prefix}.${key}`))
    .sort();
}

describe('staging QA catalog contracts', () => {
  it.each(LOCALES)('has complete role and entity-disclosure parity in %s', locale => {
    for (const [namespace, path] of [
      ['common', 'common.roles'],
      ['entityDisclosure', 'entityDisclosure'],
    ]) {
      const expected = valueAt(catalog('en', namespace), path);
      const actual = valueAt(catalog(locale, namespace), path);
      expect(keys(actual)).toEqual(keys(expected));
      for (const key of keys(actual)) expect(valueAt(actual, key.slice(1))).toBeTruthy();
    }
    const roles = valueAt(catalog(locale, 'common'), 'common.roles');
    expect(roles).toHaveProperty('global_support');
    expect(roles).toHaveProperty('auditor');
  });
  it.each(LOCALES)('supplies real disclosure labels to member clients in %s', async locale => {
    const messages = pickMessages(await loadAllMessages(locale, { strict: true }), APP_NAMESPACES);
    const disclosure = valueAt(messages, 'entityDisclosure') as Record<string, string>;
    const t = createTranslator({
      locale,
      messages: { entityDisclosure: disclosure },
      namespace: 'entityDisclosure',
    });
    for (const key of [
      'title',
      'contractingCompany',
      'governingLaw',
      'unavailableTitle',
      'unavailableBody',
    ]) {
      expect(t(key)).not.toContain('entityDisclosure.');
      expect(t(key)).toBe(valueAt(catalog(locale, 'entityDisclosure'), `entityDisclosure.${key}`));
    }
  });
  it.each(LOCALES)('keeps the new presentation keys complete in %s', locale => {
    const surfaces = [
      ['common', 'common.membershipStatus'],
      ['common', 'common.notFound'],
      ['agent-members', 'agent-members.members.list'],
      ['agent-commissions', 'agent.commissions.description'],
      ['agent-commissions', 'agent.commissions.referralLink.copy'],
      ['agent-toolkit', 'agent-toolkit.guides.other'],
      ['admin-leads', 'admin.leads.events'],
      ['admin-leads', 'admin.leads.drawer.description'],
      ['notifications', 'notifications.events'],
      ['notifications', 'notifications.updateOn'],
    ];
    for (const [namespace, path] of surfaces) {
      const source = valueAt(catalog('en', namespace), path);
      const actual = valueAt(catalog(locale, namespace), path);
      expect(actual, `${locale}.${path}`).toBeTruthy();
      expect(keys(actual)).toEqual(keys(source));
    }
  });
  it.each(LOCALES)('merges the commission catalog into the agent shell in %s', async locale => {
    const messages = pickMessages(
      await loadMessagesForNamespaces(locale, AGENT_NAMESPACES, { strict: true }),
      AGENT_NAMESPACES
    );
    const commissions = valueAt(messages, 'agent.commissions') as {
      title: string;
      description: string;
      referralLink: Record<string, string>;
    };
    const t = createTranslator({ locale, messages: { commissions }, namespace: 'commissions' });
    for (const key of ['description', 'referralLink.copy'] as const) {
      expect(t(key)).toBe(
        valueAt(catalog(locale, 'agent-commissions'), `agent.commissions.${key}`)
      );
      expect(valueAt(catalog(locale, 'agent'), `agent.commissions.${key}`)).toBeUndefined();
    }
    expect(t('title')).toBe(valueAt(catalog(locale, 'agent'), 'agent.commissions.title'));
    expect(t('referralLink.title')).toBe(
      valueAt(catalog(locale, 'agent'), 'agent.commissions.referralLink.title')
    );
  });
});
