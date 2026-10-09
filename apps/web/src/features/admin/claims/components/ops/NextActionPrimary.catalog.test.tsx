import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en/admin-claims.json';
import sq from '@/messages/sq/admin-claims.json';
import mk from '@/messages/mk/admin-claims.json';
import sr from '@/messages/sr/admin-claims.json';
import { NextActionPrimary } from './NextActionPrimary';

vi.unmock('next-intl');

const CASES = [
  ['en', en, 'Record reminder', 'Add an internal reminder to the case timeline.'],
  ['sq', sq, 'Regjistro kujtesë', 'Shto një kujtesë të brendshme në historikun e rastit.'],
  ['mk', mk, 'Евидентирај потсетник', 'Додај внатрешен потсетник во историјата на случајот.'],
  ['sr', sr, 'Zabeleži podsetnik', 'Dodaj internu belešku za podsetnik u istoriju predmeta.'],
] as const;

describe('actual localized internal-reminder control', () => {
  it.each(CASES)(
    '%s renders the real catalog record label and internal timeline description',
    async (locale, messages, label, description) => {
      const t = createTranslator({ locale, messages, namespace: 'admin.claims_page.next_actions' });
      expect(t('actions.message_poke.label')).toBe(label);
      expect(t('actions.message_poke.description')).toBe(description);
      const onAction = vi.fn();
      render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <NextActionPrimary
            primary={{ type: 'message_poke' }}
            isPending={false}
            canAssign={false}
            staffOptions={[]}
            onAssign={vi.fn()}
            onAction={onAction}
          />
        </NextIntlClientProvider>
      );
      expect(screen.getByText(description)).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: label }));
      expect(onAction.mock.calls).toEqual([['message_poke']]);
    }
  );
});
