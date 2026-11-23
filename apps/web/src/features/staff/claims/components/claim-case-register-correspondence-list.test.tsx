import { action, copy, show, submit } from './claim-case-register.test-support';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClaimAuthoritiesPanel } from './ClaimAuthoritiesPanel';
import { ClaimCorrespondenceList } from './ClaimCorrespondenceList';
import { RegisterReadError } from './case-register-controls';
import { claimId, documents, recovery, outbound } from './claim-case-register.test-fixture';

// Typed form flows run near the 5 s default under CI load; each wait stays well inside this.
vi.setConfig({ testTimeout: 10_000 });

describe('correspondence list', () => {
  it('uses the generic label for citations whose names are unavailable', () => {
    show(
      <>
        <ClaimAuthoritiesPanel
          claimId={claimId}
          canWrite={false}
          authorities={[recovery]}
          documents={documents}
        />
        <ClaimCorrespondenceList
          claimId={claimId}
          canWrite={false}
          documents={documents}
          entries={[{ ...outbound, sharedDocumentIds: [documents[0].id, 'hidden-document'] }]}
        />
      </>
    );
    expect(screen.getAllByText(copy.citedDocument, { exact: true })).toHaveLength(2);
    expect(screen.getByText(documents[0].name)).toBeVisible();
    expect(screen.queryByText('hidden-document')).not.toBeInTheDocument();
  });

  it('renders answered and overdue separately and submits the original follow-up for compare-and-set', async () => {
    action.followUp.mockResolvedValueOnce({ success: false, code: 'conflict' });
    show(
      <ClaimCorrespondenceList
        claimId={claimId}
        canWrite
        entries={[outbound, { ...outbound, id: 'contact-b', answered: true, overdue: false }]}
        documents={[]}
      />
    );
    const row = within(screen.getAllByTestId('staff-correspondence-entry')[0]!);
    expect(screen.getAllByTestId('staff-correspondence-overdue')).toHaveLength(1);
    expect(screen.getByTestId('staff-correspondence-answered')).toBeVisible();
    fireEvent.change(row.getByLabelText(copy.list.followUpUtc), { target: { value: '' } });
    fireEvent.click(row.getByRole('button', { name: copy.list.saveFollowUp }));
    expect(await row.findByRole('alert', {}, { timeout: 2_000 })).toHaveTextContent(
      copy.feedback.conflict
    );
    expect(action.followUp).toHaveBeenCalledExactlyOnceWith({
      claimId,
      correspondenceId: outbound.id,
      expectedFollowUpAt: outbound.followUpAt,
      followUpAt: null,
    });
    expect(action.refresh).toHaveBeenCalledOnce();
  });

  it('shows an admitted empty register and offers a retry for a separate failed read', () => {
    const view = show(
      <ClaimCorrespondenceList claimId={claimId} canWrite={false} entries={[]} documents={[]} />
    );
    expect(screen.getByText(copy.list.empty)).toBeVisible();
    view.unmount();
    show(<RegisterReadError />);
    expect(screen.getByRole('alert')).toHaveTextContent(copy.feedback.readFailed);
    submit(copy.feedback.retry);
    expect(action.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByText(copy.list.empty)).not.toBeInTheDocument();
  });

  it('pages a long register with previous and next links that keep the case', () => {
    show(
      <ClaimCorrespondenceList
        claimId={claimId}
        canWrite={false}
        entries={[outbound]}
        documents={[]}
        page={2}
        evidencePage={4}
        perPage={20}
        total={45}
      />
    );
    const pages = screen.getByRole('navigation', { name: copy.list.pages });
    expect(within(pages).getByText('Page 2 of 3')).toHaveAttribute('aria-current', 'page');
    expect(within(pages).getByRole('link', { name: copy.list.previous })).toHaveAttribute(
      'href',
      `/staff/claims/${claimId}?correspondencePage=1&evidencePage=4`
    );
    expect(within(pages).getByRole('link', { name: copy.list.next })).toHaveAttribute(
      'href',
      `/staff/claims/${claimId}?correspondencePage=3&evidencePage=4`
    );
  });

  it('shows no page links when the register fits on one page', () => {
    show(
      <ClaimCorrespondenceList
        claimId={claimId}
        canWrite={false}
        entries={[outbound]}
        documents={[]}
        page={1}
        perPage={20}
        total={1}
      />
    );
    expect(screen.queryByRole('navigation', { name: copy.list.pages })).not.toBeInTheDocument();
  });

  it('labels an inbound reply whose outbound parent is on an older page', () => {
    show(
      <ClaimCorrespondenceList
        claimId={claimId}
        canWrite={false}
        documents={[]}
        entries={[{ ...outbound, id: 'reply-a', direction: 'inbound', inReplyToId: outbound.id }]}
        replyParents={[outbound]}
        page={1}
        perPage={1}
        total={2}
      />
    );
    expect(screen.getByText(/^Reply to Synthetic insurer/)).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /^Reply to Synthetic insurer/ })
    ).not.toBeInTheDocument();
  });
});
