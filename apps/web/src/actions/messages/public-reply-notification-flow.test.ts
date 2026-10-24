/** In-memory model only; not PostgreSQL/RLS attestation. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errors, reply, noNotification } from './public-reply-flow.test-setup';
import { ids, reset, session, state } from './public-reply-notification-flow.fixture';
import { sendMessage } from '@/actions/messages';
import { sendMessage as sendMessageCore } from '@/actions/messages.core';
import { revalidatePath } from 'next/cache';

it('executes the real mounted server-action export', () => {
  expect(typeof sendMessage).toBe('function');
  expect(sendMessage).toBe(sendMessageCore);
});
for (const mode of ['restricted', 'permissive'] as const) {
  describe(`${mode} ambient boundary model (not PostgreSQL attestation)`, () => {
    beforeEach(() => reset(mode));
    it('persists exactly one notification for the admitted claim owner', async () => {
      expect(await reply()).toMatchObject({ success: true });
      expect(state.rows.claimMessages).toHaveLength(1);
      expect(state.rows.notifications).toHaveLength(1);
      expect(state.rows.notifications[0]).toMatchObject({
        tenantId: ids.tenant,
        userId: ids.member,
        type: 'new_message',
      });
      expect(state.ambientReads).toEqual([]);
      expect(state.scheduled).toEqual([{ commits: 2, notifications: 1 }]);
      expect(state.external).toHaveLength(1);
      expect(state.external[0]).toMatchObject({
        kind: 'delivery',
        args: [{ tenantId: ids.tenant, recipientId: ids.member }],
      });
      expect(state.rows.notifications[0].actionUrl).toBe(`/member/claims/${ids.claim}`);
    });
    it.each([0, 1, 2])(
      'keeps committed success and healthy effects when cache path %i throws',
      async failed => {
        const paths = [
          `/member/claims/${ids.claim}`,
          `/staff/claims/${ids.claim}`,
          '/agent/workspace/claims',
        ];
        vi.mocked(revalidatePath).mockImplementation(path => {
          if (path === paths[failed]) throw new Error('private cache error');
        });
        const result = await reply();
        expect(state.rows.claimMessages).toHaveLength(1);
        expect(result).toMatchObject({
          success: true,
          message: { id: state.rows.claimMessages[0].id },
        });
        expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(paths);
        expect(state.rows.notifications).toHaveLength(1);
        expect(state.scheduled).toHaveLength(1);
        expect(state.external).toHaveLength(1);
        expect(errors).toHaveBeenCalledWith('Message cache refresh failed after commit');
      }
    );
    it('blocks a missing tenant before notification effects', async () => {
      state.session = session('staff', { tenantId: undefined });
      expect(await reply()).toMatchObject({ success: false });
      expect(state.rows.claimMessages).toEqual([]);
      noNotification();
    });
    it('blocks a foreign-tenant case before notification effects', async () => {
      expect(await reply('claim-b')).toMatchObject({ success: false });
      expect(state.rows.claimMessages).toEqual([]);
      noNotification();
    });
    it('does not notify an out-of-tenant recipient on an admitted case', async () => {
      state.rows.claims[0].userId = ids.foreign;
      await reply();
      noNotification();
    });
    it('blocks a staff actor in the wrong branch', async () => {
      state.session = session('staff', { branchId: 'branch-b' });
      expect(await reply()).toMatchObject({ success: false });
      noNotification();
    });
    it('does not notify for an internal staff note', async () => {
      expect(await reply(ids.claim, true)).toMatchObject({ success: true });
      noNotification();
    });
    it.each(['member', 'agent'])('does not send a staff notification for %s', async role => {
      state.session = session(role);
      expect(await reply()).toMatchObject({ success: true });
      noNotification();
    });
    it('rolls back the message on projection failure without notification effects', async () => {
      state.projectionFault = true;
      expect(await reply()).toMatchObject({ success: false });
      expect(state.rows.claimMessages).toEqual([]);
      expect(state.rollbacks).toBe(1);
      noNotification();
    });
  });
}
