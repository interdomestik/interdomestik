import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { LOCALES } from '@/i18n/locales';
import {
  NOTIFICATION_EVENT_KEYS,
  notificationClaimId,
  notificationDisplayCopy,
} from './display-copy';

vi.unmock('next-intl');
const modules = import.meta.glob('../../messages/*/notifications.json', {
  eager: true,
  import: 'default',
});
const row = {
  type: 'new_message',
  content: 'Update on: member-comms-thread-owned',
  actionUrl: '/member/claims/member-comms-thread-owned',
};

describe('notification presentation mapping', () => {
  it.each(LOCALES)('localizes event titles and bodies without raw thread ids in %s', locale => {
    const messages = modules[`../../messages/${locale}/notifications.json`] as Parameters<
      typeof createTranslator
    >[0]['messages'];
    const t = createTranslator({ locale, messages, namespace: 'notifications' });
    for (const type of Object.keys(NOTIFICATION_EVENT_KEYS)) {
      const copy = notificationDisplayCopy({ ...row, type }, t, 'CLM-2026-123');
      expect(copy.title).not.toMatch(/events\.|notifications\./);
      expect(copy.content).toContain('CLM-2026-123');
      expect(copy.content).not.toContain('member-comms-');
    }
    if (locale !== 'en') expect(notificationDisplayCopy(row, t).title).not.toBe('New Message');
  });
  it('keeps a stored human title and substitutes neutral copy for unavailable claims', () => {
    const t = (key: string, args?: Record<string, string>) => args?.claim ?? key;
    expect(notificationDisplayCopy({ ...row, content: 'Update on: Car damage' }, t).content).toBe(
      'Car damage'
    );
    expect(notificationDisplayCopy(row, t).content).toBe('yourClaim');
    expect(notificationDisplayCopy({ ...row, type: '__proto__' }, t).title).toBe(
      'events.unknown.title'
    );
  });
  it('does not interpret arbitrary, external or nested action URLs as claim references', () => {
    for (const actionUrl of [
      'https://evil.test/member/claims/id',
      '/member/claims/id/documents',
      '/member?claim=id',
      '/member/claims/number/CLM-1',
    ]) {
      expect(notificationClaimId({ ...row, actionUrl })).toBeNull();
    }
    expect(notificationClaimId({ ...row, actionUrl: '/sq/member/claims/id?tab=messages' })).toBe(
      'id'
    );
  });
});
