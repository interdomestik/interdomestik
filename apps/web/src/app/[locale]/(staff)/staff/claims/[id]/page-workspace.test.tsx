import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ACKNOWLEDGE_COPY,
  LOAD_ERROR_COPY,
  LOCALES,
  MEMBER_DUTY_COPY,
  REQUEST_DUTY_COPY,
  REQUEST_FIXTURES,
  WORKSPACE_REGIONS,
  claimText,
  hoisted,
  message,
  mockClaimOnce,
  regionNode,
  regionOrder,
  renderWorkspacePage,
  requestsRegion,
  sectionLinks,
  submittedRequest,
  type RequestFixtureName,
  type WorkspaceLocale,
} from './page-workspace-test-support';

// Hoisted above every import so the real translator is bound before any module loads it.
vi.unmock('next-intl');

const STAFF_REGIONS = [...WORKSPACE_REGIONS];
const MANAGER_REGIONS = ['staff-claim-requests', 'staff-claim-context', 'staff-status-history'];
const PRIVATE_ERROR = 'private DB detail at 10.0.0.4';
const REQUEST_CASES = ['absent', 'open', 'submitted', 'fulfilled', 'error'] as const;
type RequestCase = (typeof REQUEST_CASES)[number];
const REQUEST_MATRIX: ReadonlyArray<readonly [WorkspaceLocale, RequestCase]> = LOCALES.flatMap(
  locale => REQUEST_CASES.map(requestCase => [locale, requestCase] as const)
);
const ACKNOWLEDGE_MATRIX: ReadonlyArray<readonly [WorkspaceLocale, string, boolean]> =
  LOCALES.flatMap(locale => [
    [locale, 'staff-1', true] as const,
    [locale, 'other-staff', false] as const,
  ]);

function hasFixture(requestCase: RequestCase): requestCase is RequestFixtureName {
  return requestCase === 'open' || requestCase === 'submitted' || requestCase === 'fulfilled';
}

describe('staff case workspace hierarchy', () => {
  it.each(LOCALES)('puts handling and request work before secondary context (%s)', async locale => {
    await mockClaimOnce({ status: 'verification' });
    await renderWorkspacePage(locale);

    expect(screen.getByTestId('staff-claim-detail-ready')).toBeInTheDocument();
    expect(screen.getByTestId('staff-claim-workspace-reference')).toHaveTextContent('KS-0001');
    expect(screen.getByTestId('staff-claim-workspace-back')).toHaveAttribute(
      'href',
      `/${locale}/staff/claims`
    );
    expect(screen.getByTestId('staff-claim-workspace-back')).toHaveTextContent(
      claimText(locale, 'details.workspace.back')
    );
    expect(screen.getByTestId('staff-claim-workspace-nav')).toHaveAttribute(
      'aria-label',
      claimText(locale, 'details.workspace.nav_label')
    );
    expect(sectionLinks()).toEqual(STAFF_REGIONS);
    expect(regionOrder()).toEqual(STAFF_REGIONS);

    // The route owns the section ids while the shipped panel markers stay unchanged, so both
    // identities are asserted on the same node rather than renaming a product marker for a test.
    expect(regionNode('staff-claim-handling')).toBe(
      screen.getByTestId('staff-claim-detail-actions')
    );
    expect(regionNode('staff-claim-messages')).toBe(
      screen.getByTestId('staff-claim-detail-messaging')
    );
    expect(
      within(regionNode('staff-claim-handling')).getByTestId('staff-claim-action-panel')
    ).toBeInTheDocument();
    expect(requestsRegion().getByTestId('staff-information-request-form')).toBeInTheDocument();
    expect(
      within(regionNode('staff-claim-messages')).getByTestId('staff-claim-messaging-panel')
    ).toBeInTheDocument();
    expect(
      within(regionNode('staff-claim-context')).getByText(
        claimText(locale, 'details.workspace.context')
      )
    ).toBeInTheDocument();
    expect(regionNode('staff-status-history')).toBeInTheDocument();
  });

  it.each(LOCALES)(
    'uses neutral verification guidance instead of the shared incomplete copy (%s)',
    async locale => {
      await mockClaimOnce({ status: 'verification' });
      await renderWorkspacePage(locale);

      const phase = screen.getByTestId('staff-claim-detail-sla-phase');
      expect(phase).toHaveTextContent(claimText(locale, 'details.verification_guidance'));
      expect(phase).not.toHaveTextContent(claimText(locale, 'details.sla_phase.incomplete'));
      expect(
        screen.queryByText(claimText(locale, 'details.sla_phase.incomplete'))
      ).not.toBeInTheDocument();
    }
  );

  it.each(LOCALES)('keeps the operative running phase copy unchanged (%s)', async locale => {
    await mockClaimOnce({ status: 'negotiation' });
    await renderWorkspacePage(locale);

    expect(screen.getByTestId('staff-claim-detail-sla-phase')).toHaveTextContent(
      claimText(locale, 'details.sla_phase.running')
    );
  });

  it('omits the SLA card when the derived phase is not applicable', async () => {
    await mockClaimOnce({ status: 'draft' });
    await renderWorkspacePage('en');

    expect(screen.queryByTestId('staff-claim-detail-sla')).not.toBeInTheDocument();
    expect(screen.getByTestId('staff-claim-context')).toBeInTheDocument();
  });

  it('keeps the requests destination navigable when no request exists', async () => {
    await renderWorkspacePage('en');

    expect(screen.getByTestId('staff-claim-requests')).toBeInTheDocument();
    expect(screen.queryByTestId('claim-information-request')).not.toBeInTheDocument();
    expect(sectionLinks()).toContain('staff-claim-requests');
  });

  it.each(REQUEST_MATRIX)(
    'states only the recorded request duty in real localized copy (%s, %s)',
    async (locale, requestCase) => {
      if (requestCase === 'error') {
        hoisted.getInformationRequestsMock.mockRejectedValueOnce(new Error(PRIVATE_ERROR));
      } else if (hasFixture(requestCase)) {
        hoisted.getInformationRequestsMock.mockResolvedValueOnce([REQUEST_FIXTURES[requestCase]]);
      }
      await mockClaimOnce({ status: 'verification' });
      await renderWorkspacePage(locale);

      const region = requestsRegion();
      expect(
        region.getByRole('heading', { name: claimText(locale, 'details.workspace.requests') })
      ).toBeInTheDocument();
      expect(sectionLinks()).toContain('staff-claim-requests');
      // Real derived phase copy: verification stays neutral, never a generic member duty.
      expect(screen.getByTestId('staff-claim-detail-sla-phase')).toHaveTextContent(
        claimText(locale, 'details.verification_guidance')
      );

      if (hasFixture(requestCase)) {
        const expected = REQUEST_DUTY_COPY[requestCase];
        expect(region.getByTestId('claim-information-request')).toBeInTheDocument();
        expect(region.getByTestId('information-request-status')).toHaveTextContent(
          message(locale, expected.status)
        );
        expect(region.getByTestId('information-request-next-actor')).toHaveTextContent(
          message(locale, expected.actor)
        );
        expect(region.getByTestId('information-request-next-action')).toHaveTextContent(
          message(locale, expected.action)
        );
      } else {
        expect(region.queryByTestId('claim-information-request')).not.toBeInTheDocument();
        expect(region.queryAllByTestId('information-request-next-actor')).toHaveLength(0);
        expect(region.queryAllByTestId('information-request-next-action')).toHaveLength(0);
      }

      if (requestCase === 'error') {
        // The requests region ships two live regions (the form notice and the load error), so the
        // load error is identified by its exact localized copy among the real role=status nodes.
        const loadErrorCopy = message(locale, LOAD_ERROR_COPY);
        const loadErrorStatuses = region
          .getAllByRole('status')
          .filter(node => (node.textContent ?? '').includes(loadErrorCopy));
        expect(loadErrorStatuses).toHaveLength(1);
        expect(loadErrorStatuses[0]).toHaveTextContent(loadErrorCopy);
        expect(regionNode('staff-claim-requests').textContent ?? '').not.toContain(PRIVATE_ERROR);
        expect(document.body.textContent ?? '').not.toContain(PRIVATE_ERROR);
      }

      if (requestCase === 'absent' || requestCase === 'fulfilled') {
        const regionText = regionNode('staff-claim-requests').textContent ?? '';
        for (const path of MEMBER_DUTY_COPY) {
          expect(regionText).not.toContain(message(locale, path));
        }
      }
    }
  );

  it.each(ACKNOWLEDGE_MATRIX)(
    'keeps evidence acknowledgment with the assigned staff (%s, %s)',
    async (locale, staffId, allowed) => {
      hoisted.getInformationRequestsMock.mockResolvedValueOnce([submittedRequest]);
      await mockClaimOnce({ status: 'verification', staffId: String(staffId) });
      await renderWorkspacePage(locale);

      const label = message(locale, ACKNOWLEDGE_COPY);
      const controls = requestsRegion()
        .queryAllByRole('button')
        .filter(button => (button.textContent ?? '').includes(label));
      expect(controls.length > 0).toBe(allowed);
      // The recorded staff review duty is stated either way; only the control is permissioned.
      expect(requestsRegion().getByTestId('information-request-next-action')).toHaveTextContent(
        message(locale, REQUEST_DUTY_COPY.submitted.action)
      );
    }
  );

  it('gives branch managers read-only context without mutation destinations', async () => {
    hoisted.getSessionMock.mockResolvedValueOnce({
      user: {
        id: 'manager-1',
        tenantId: 'tenant-ks',
        role: 'branch_manager',
        branchId: 'branch-a',
      },
    });
    await mockClaimOnce({ status: 'verification' });
    await renderWorkspacePage('en');

    expect(screen.getByTestId('staff-claim-readonly-notice')).toBeInTheDocument();
    expect(sectionLinks()).toEqual(MANAGER_REGIONS);
    expect(regionOrder()).toEqual(MANAGER_REGIONS);
    expect(screen.queryByTestId('staff-claim-detail-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('staff-claim-detail-messaging')).not.toBeInTheDocument();
    expect(screen.queryByTestId('staff-claim-action-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('staff-information-request-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('staff-claim-messaging-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('staff-claim-detail-member')).toBeInTheDocument();
    expect(screen.getByTestId('staff-claim-detail-agent')).toBeInTheDocument();
  });

  it('preserves the authorized reads and their argument shape', async () => {
    await renderWorkspacePage('en');

    expect(hoisted.getStaffClaimDetailMock).toHaveBeenCalledWith({
      branchId: 'branch-a',
      claimId: 'claim-1',
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
    });
    expect(hoisted.getPublicStatusHistoryCoreMock).toHaveBeenCalledWith({
      claimId: 'claim-1',
      tenantId: 'tenant-ks',
    });
    expect(hoisted.getStaffAssignmentOptionsMock).toHaveBeenCalledWith({
      branchId: 'branch-a',
      tenantId: 'tenant-ks',
    });
    expect(hoisted.getInformationRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: 'staff-1' }) }),
      'claim-1'
    );
  });
});
