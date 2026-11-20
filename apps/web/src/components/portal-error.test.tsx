import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgentError from '@/app/[locale]/(agent)/agent/error';
import MemberError from '@/app/[locale]/(app)/member/error';
import StaffError from '@/app/[locale]/(staff)/staff/error';
import AdminError from '@/app/[locale]/admin/error';

vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: () => (key: string) => key,
}));

describe('portal error recovery', () => {
  it.each([MemberError, AgentError, StaffError, AdminError])(
    'uses localized safe copy and re-fetches server data',
    Component => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const retry = vi.fn();
      const reset = vi.fn();
      render(
        <Component error={new Error('private provider details')} reset={reset} retry={retry} />
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Faqja nuk mund të ngarkohej');
      expect(screen.queryByText(/private provider details/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Provo përsëri' }));
      expect(retry).toHaveBeenCalledOnce();
      expect(reset).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  );
});
