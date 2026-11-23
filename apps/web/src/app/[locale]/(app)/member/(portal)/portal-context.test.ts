import { admitted, own, portalMocks as h, resetPortalMocks } from './portal-context.test-support';
import { beforeEach, describe, expect, it } from 'vitest';
import { setRequestLocale } from 'next-intl/server';
import { LOCALES } from '@/i18n/locales';

import { getMemberPortalContext } from './portal-context';
import PortalLayout from './layout';
import PortalPage from './page';
import PortalDefault from './default';
import CaseSlot from './@case/page';
import CaseDefault from './@case/default';
import ActionsSlot from './@actions/page';
import ActionsDefault from './@actions/default';
import UpdatesSlot from './@updates/page';
import UpdatesDefault from './@updates/default';

describe('member portal request context', () => {
  const expectNoProjections = () =>
    [h.cases, h.membership].forEach(projection => expect(projection).not.toHaveBeenCalled());

  beforeEach(resetPortalMocks);

  it.each(LOCALES)('validates and retains the supported locale %s', async locale => {
    const context = admitted(await getMemberPortalContext(locale));
    expect(context.locale).toBe(locale);
    expect(context.canDraft).toBe(true);
    expect(context.copy.membershipStatus.accessAllowed).toBe('access_allowed');
    expect(setRequestLocale).toHaveBeenCalledExactlyOnceWith(locale);
    expect(h.session).toHaveBeenCalledTimes(1);
    expect(h.cases).toHaveBeenCalledExactlyOnceWith(own('member-a'));
    expect(h.membership).toHaveBeenCalledExactlyOnceWith(own('member-a'));
  });

  it.each(['', 'hr', 'SQ', '../../admin'])(
    'rejects unsupported locale %s before locale setup, identity or projections',
    async locale => {
      await expect(getMemberPortalContext(locale)).rejects.toThrow('notFound');
      expect(setRequestLocale).not.toHaveBeenCalled();
      expect(h.session).not.toHaveBeenCalled();
      expectNoProjections();
    }
  );

  it.each([
    ['member', 'tenant_ks', true, true],
    ['user', 'tenant_ks', true, true],
    ['agent', 'tenant_ks', true, false],
    ['member', 'tenant_mk', true, false],
    ['member', 'tenant_ks', false, false],
  ] as const)('limits draft access for %s in %s', async (role, tenantId, neutral, canDraft) => {
    h.neutral = neutral;
    const id = role === 'agent' ? 'agent-a' : 'member-a';
    h.session.mockResolvedValueOnce({ user: { id, role, tenantId } });
    expect(await getMemberPortalContext('sq')).toEqual(expect.objectContaining({ canDraft }));
    expect(h.cases).toHaveBeenCalledExactlyOnceWith(own(id));
    expect(h.membership).toHaveBeenCalledExactlyOnceWith(own(id));
  });

  it.each([
    { id: 'member-a', role: 'member', tenantId: null },
    { id: '', role: 'member', tenantId: 'tenant_ks' },
    { id: 'member-a', role: 'unknown', tenantId: 'tenant_ks' },
  ])('blocks invalid identity $role before projections', async user => {
    h.session.mockResolvedValueOnce({ user });
    const result = getMemberPortalContext('sq');
    if (user.tenantId) {
      await expect(result).rejects.toThrow('notFound');
    } else {
      await expect(result).resolves.toMatchObject({ ok: false, failure: { code: 'UNAUTHORIZED' } });
    }
    expectNoProjections();
  });

  it.each(['staff', 'admin'])('blocks non-member %s projections', async role => {
    h.session.mockResolvedValueOnce({
      user: { id: `${role}-a`, role, tenantId: 'tenant_ks' },
    });
    await expect(getMemberPortalContext('sq')).rejects.toThrow('redirect:');
    expectNoProjections();
  });

  it('shares one guarded identity and exactly two projections across layout and three slots', async () => {
    const pending = Array.from({ length: 4 }, () => getMemberPortalContext('sq'));
    expect(new Set(pending).size).toBe(1);
    const values = await Promise.all(pending);
    expect(new Set(values).size).toBe(1);
    expect(h.session).toHaveBeenCalledTimes(1);
    expect(h.cases).toHaveBeenCalledExactlyOnceWith(own('member-a'));
    expect(h.membership).toHaveBeenCalledExactlyOnceWith(own('member-a'));
    expect(admitted(values[1]).caseTask).toBe(admitted(values[3]).caseTask);
  });

  it('starts no projection while session authorization is pending', async () => {
    let authorize!: (value: unknown) => void;
    h.session.mockReturnValueOnce(
      new Promise(resolve => {
        authorize = resolve;
      })
    );
    const pending = getMemberPortalContext('sq');
    await Promise.resolve();
    expect(h.cases).not.toHaveBeenCalled();
    expect(h.membership).not.toHaveBeenCalled();
    authorize({ user: { id: 'member-a', role: 'member', tenantId: 'tenant_ks' } });
    await pending;
    expect(h.cases).toHaveBeenCalledTimes(1);
    expect(h.membership).toHaveBeenCalledTimes(1);
  });

  it('passes projection rejection to existing region boundaries', async () => {
    h.cases.mockRejectedValueOnce(new Error('cases unavailable'));
    h.membership.mockRejectedValueOnce(new Error('membership unavailable'));
    const context = admitted(await getMemberPortalContext('sq'));
    await expect(context.caseTask).rejects.toThrow('cases unavailable');
    await expect(context.membershipTask).rejects.toThrow('membership unavailable');
  });

  it('preserves portal-owned next steps and distinct lifecycle warnings', async () => {
    const { copy } = admitted(await getMemberPortalContext('sq'));
    expect(copy.actions.active_in_grace).toEqual({
      description: 'description',
      label: 'active_in_grace',
      warning: 'portal-warning-active_in_grace',
    });
    expect(copy.actions.active_in_grace.warning).not.toBe(copy.actions.active_in_grace.label);
    const summary = { nextStep: 'team_review', status: 'submitted' } as Parameters<
      typeof copy.caseLabels
    >[0];
    expect(copy.caseLabels(summary).nextStepValue).toBe('portal-next-team_review');
    expect(copy.caseLabels({ ...summary, nextStep: 'external_response' }).nextStepValue).toBe(
      'portal-next-external_response'
    );
  });

  it('wires named slots and hard-recovery defaults to the same context and case promise', async () => {
    const params: Promise<{ locale: string }> = Promise.resolve({ locale: 'sq' });
    const [cases, actions, updates] = await Promise.all([
      CaseSlot({ params }),
      ActionsSlot({ params }),
      UpdatesSlot({ params }),
    ]);
    const layout = await PortalLayout({
      params,
      case: cases,
      actions,
      updates,
      children: PortalPage(),
    });
    const context = admitted(await getMemberPortalContext('sq'));
    if (!cases || !updates || !actions) throw new Error('Expected all three admitted regions');
    expect(cases.props.children.props.promise).toBe(context.caseTask);
    expect(updates.props.children.props.promise).toBe(context.caseTask);
    expect(actions.props.children.props.promise).toBe(context.membershipTask);
    expect(actions.props.children.props.canDraft).toBe(true);
    expect(layout.type).toBe(PortalPage);
    const ready = layout.props.content;
    expect(ready.props['data-testid']).toBe('member-dashboard-ready');
    expect(ready.props.children.props).toEqual({
      copy: context.copy,
      caseRegion: cases,
      actionsRegion: actions,
      updatesRegion: updates,
    });
    expect(h.session).toHaveBeenCalledTimes(1);
    expect(h.cases).toHaveBeenCalledTimes(1);
    expect(h.membership).toHaveBeenCalledTimes(1);
    expect(CaseDefault).toBe(CaseSlot);
    expect(ActionsDefault).toBe(ActionsSlot);
    expect(UpdatesDefault).toBe(UpdatesSlot);
    expect(PortalDefault).toBe(PortalPage);
    expect(PortalPage()).toBeNull();
    expect(PortalPage({ content: 'portal' })).toBe('portal');
    h.pathname = '/member/documents';
    expect(PortalPage({ content: 'portal' })).toBeNull();
  });
});
