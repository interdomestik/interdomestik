import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserChoices } from '@/actions/admin-users';
import { grantUserRole, listBranches } from '@/actions/admin-rbac.core';
import { ADMIN_NAMESPACES, loadMessagesForNamespaces } from '@/i18n/messages';
import { AddAgentDialog } from './add-agent-dialog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.unmock('next-intl');
vi.mock('@/i18n/routing', () => ({ routing: { defaultLocale: 'en' } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/actions/admin-users', () => ({ getUserChoices: vi.fn() }));
vi.mock('@/actions/admin-rbac.core', () => ({ grantUserRole: vi.fn(), listBranches: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserChoices).mockResolvedValue({ success: true, data: [] });
  vi.mocked(listBranches).mockResolvedValue({ success: true, data: [] });
});

describe('AddAgentDialog actual admin-shell messages', () => {
  it.each(['en', 'sq', 'mk', 'sr'])(
    'renders both empty lists with the actual %s provider and namespace loader',
    async locale => {
      const messages = await loadMessagesForNamespaces(locale, ADMIN_NAMESPACES, { strict: true });
      const t = createTranslator({ locale, messages });
      const onError = vi.fn();
      render(
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="Europe/Berlin"
          now={new Date(0)}
          onError={onError}
        >
          <AddAgentDialog />
        </NextIntlClientProvider>
      );
      expect(getUserChoices).not.toHaveBeenCalled();
      expect(listBranches).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: t('admin.users_page.add_agent') }));
      await waitFor(() => {
        const statuses = screen.getAllByRole('status');
        expect(statuses).toHaveLength(2);
        expect(statuses[0]).toHaveTextContent(t('admin.users_table.no_users'));
        expect(statuses[1]).toHaveTextContent(t('admin.branches.no_branches'));
      });
      expect(screen.getByRole('button', { name: t('admin.users_page.confirm') })).toBeDisabled();
      expect(grantUserRole).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: t('admin.users_page.cancel') }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  );
});
