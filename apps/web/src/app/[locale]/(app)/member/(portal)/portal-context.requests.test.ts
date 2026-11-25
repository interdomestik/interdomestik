import { admitted, own, portalMocks as h, resetPortalMocks } from './portal-context.test-support';
import { MemberAcceptanceStep } from '@/components/privacy/member-acceptance-step';
import { beforeEach, describe, expect, it } from 'vitest';
import ActionsSlot from './@actions/page';
import CaseSlot from './@case/page';
import UpdatesSlot from './@updates/page';
import PortalLayout from './layout';
import { getMemberPortalContext } from './portal-context';

describe('member portal across requests', () => {
  beforeEach(resetPortalMocks);

  it('renders the step and reads neither projection when a later request loses acceptance', async () => {
    admitted(await getMemberPortalContext('sq'));
    h.requests = new Map();
    h.accepted = false;
    const params = Promise.resolve({ locale: 'sq' });
    const [caseRegion, actions, updates] = await Promise.all([
      CaseSlot({ params }),
      ActionsSlot({ params }),
      UpdatesSlot({ params }),
    ]);
    expect([caseRegion, actions, updates]).toEqual([null, null, null]);
    const layout = await PortalLayout({
      params,
      case: caseRegion,
      actions,
      updates,
      children: null,
    });
    expect(layout.type).toBe(MemberAcceptanceStep);
    expect(layout.props.refusal.failure.code).toBe('acceptance_required');
    expect(h.cases).toHaveBeenCalledTimes(1);
    expect(h.membership).toHaveBeenCalledTimes(1);
  });

  it('does not carry identity or projection promises into a second request', async () => {
    const first = admitted(await getMemberPortalContext('sq'));
    h.requests = new Map();
    h.session.mockResolvedValue({
      user: { id: 'member-b', role: 'member', tenantId: 'tenant_mk' },
    });
    const next = admitted(await getMemberPortalContext('sq'));
    expect(next.caseTask).not.toBe(first.caseTask);
    expect(h.cases).toHaveBeenLastCalledWith(own('member-b'));
    expect(h.membership).toHaveBeenLastCalledWith(own('member-b'));
    expect(next.canDraft).toBe(false);
  });

  it.each([null, { user: { id: 'member-a', role: 'member', tenantId: null } }])(
    'rechecks revoked identity on the next request before any new projection',
    async revoked => {
      await getMemberPortalContext('sq');
      h.requests = new Map();
      h.session.mockResolvedValue(revoked);
      await expect(getMemberPortalContext('sq')).resolves.toMatchObject({ ok: false });
      expect(h.cases).toHaveBeenCalledTimes(1);
      expect(h.membership).toHaveBeenCalledTimes(1);
    }
  );

  it('rechecks neutral-host draft eligibility on a later request', async () => {
    expect(admitted(await getMemberPortalContext('sq')).canDraft).toBe(true);
    h.requests = new Map();
    h.neutral = false;
    expect(admitted(await getMemberPortalContext('sq')).canDraft).toBe(false);
  });
});
