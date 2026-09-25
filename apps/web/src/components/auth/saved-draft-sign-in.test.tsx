import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedDraftSignIn } from './saved-draft-sign-in';

const h = vi.hoisted(() => ({ resume: vi.fn(), assign: vi.fn(), props: vi.fn(), query: '' }));
vi.mock('@/actions/free-start-drafts', () => ({ resumeFreeStartDraft: h.resume }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(h.query) }));
vi.mock('@/app/[locale]/components/home/free-start-intake-shell/secure-save-otp', () => ({
  SecureSaveOtp: (props: { onVerified: () => Promise<void> }) => {
    h.props(props);
    return <button onClick={() => void props.onVerified().catch(() => undefined)}>Verify</button>;
  },
}));
const id = '63ffc31e-8c64-4758-995a-c57f40de7568';
describe('saved draft email-code sign-in recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    h.query = '';
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { hash: `#draft=${id}`, assign: h.assign },
    });
  });
  it.each(['en', 'sq', 'mk', 'sr'])(
    'rechecks exact ownership before returning in %s',
    async locale => {
      h.resume.mockResolvedValue({ ok: true, draft: { id } });
      render(<SavedDraftSignIn locale={locale} tenantId="tenant_ks" />);
      expect(h.resume).not.toHaveBeenCalled();
      expect(h.props).toHaveBeenCalledWith(
        expect.objectContaining({ locale, tenantId: 'tenant_ks' })
      );
      fireEvent.click(screen.getByText('Verify'));
      await waitFor(() =>
        expect(h.assign).toHaveBeenCalledWith(
          `/${locale}/member/claims/new?mode=drafts#draft=${id}`
        )
      );
      expect(h.resume).toHaveBeenCalledExactlyOnceWith({ id });
    }
  );
  it.each(['notFound', 'authRequired', 'accountContext'])(
    'does not navigate for %s and retries the same read',
    async code => {
      h.resume.mockResolvedValueOnce({ ok: false, code }).mockResolvedValueOnce({ ok: true });
      render(<SavedDraftSignIn locale="en" tenantId="tenant_ks" />);
      fireEvent.click(screen.getByText('Verify'));
      await waitFor(() => expect(h.resume).toHaveBeenCalledTimes(1));
      expect(h.assign).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText('Verify'));
      await waitFor(() => expect(h.assign).toHaveBeenCalledTimes(1));
      expect(h.resume.mock.calls).toEqual([[{ id }], [{ id }]]);
    }
  );
  it.each(['', '#draft=bad', `#draft=${id}&next=//foreign.invalid`])(
    'ignores malformed or absent selection %s',
    hash => {
      Object.assign(globalThis.location, { hash });
      render(<SavedDraftSignIn locale="en" tenantId="tenant_ks" />);
      expect(screen.queryByText('Verify')).toBeNull();
      expect(h.resume).not.toHaveBeenCalled();
    }
  );
  it('does not replace an explicit next flow', () => {
    h.query = 'next=/en/member/claims';
    render(<SavedDraftSignIn locale="en" tenantId="tenant_ks" />);
    expect(screen.queryByText('Verify')).toBeNull();
  });
});
