import { render, screen } from '@testing-library/react';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { notFound, redirect } from 'next/navigation';

const hoisted = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  resolveSponsoredImportAccess: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: hoisted.authorizeSessionTenant,
}));

vi.mock('@/lib/actions/agent/sponsored-import-access', () => ({
  resolveSponsoredImportAccess: hoisted.resolveSponsoredImportAccess,
}));

vi.mock('@/features/agent/import/components/csv-uploader', () => ({
  CSVUploader: () => <div>Mock CSV Uploader</div>,
}));

import AgentImportPage from './page';

describe('AgentImportPage', () => {
  const params = Promise.resolve({ locale: 'sq' });

  it('redirects non-agents to the member portal', async () => {
    hoisted.getSession.mockResolvedValueOnce({ user: { role: 'member' } });

    const redirectMock = vi.mocked(redirect);
    redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(AgentImportPage({ params })).rejects.toThrow('redirect:/sq/member');
  });

  it.each(['not_office', 'dark'])('hides the page when access is %s', async access => {
    const session = { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } };
    hoisted.getSession.mockResolvedValueOnce(session);
    hoisted.authorizeSessionTenant.mockResolvedValueOnce({
      session,
      authority: mintTestTenantAuthority('tenant-1'),
    });
    hoisted.resolveSponsoredImportAccess.mockResolvedValueOnce(access);

    const notFoundMock = vi.mocked(notFound);
    notFoundMock.mockImplementationOnce(() => {
      throw new Error('notFound');
    });

    await expect(AgentImportPage({ params })).rejects.toThrow('notFound');
  });

  it('renders the uploader without the retired aggregate dashboard for office agents', async () => {
    const session = { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } };
    const authority = mintTestTenantAuthority('tenant-1');
    hoisted.getSession.mockResolvedValueOnce(session);
    hoisted.authorizeSessionTenant.mockResolvedValueOnce({ session, authority });
    hoisted.resolveSponsoredImportAccess.mockResolvedValueOnce('allowed');
    render(await AgentImportPage({ params }));

    expect(screen.getByText('Sponsored Member Import')).toBeInTheDocument();
    expect(screen.queryByTestId('group-dashboard-summary')).not.toBeInTheDocument();
    expect(screen.getByText('Mock CSV Uploader')).toBeInTheDocument();
    expect(hoisted.resolveSponsoredImportAccess).toHaveBeenCalledWith({
      agentId: 'agent-1',
      authority,
    });
  });
});
