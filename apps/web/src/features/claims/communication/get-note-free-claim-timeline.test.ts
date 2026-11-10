import { beforeEach, describe, expect, it } from 'vitest';
import { authority, resetQueryModel, state } from './communication-query.test-support';
import { getNoteFreeClaimTimeline } from './get-note-free-claim-timeline';

beforeEach(resetQueryModel);
const read = (claimId = 'own', publicOnly = false, excludeDraft = false) =>
  getNoteFreeClaimTimeline({ claimId, authority, publicOnly, excludeDraft });
describe('independently scoped note-free history', () => {
  it('selects only status metadata and never notes or author text', async () => {
    state.rows.claim_stage_history = [true, false].map((isPublic, index) => ({
      id: `h-${index}`,
      claim_id: 'own',
      tenant_id: 'tenant-a',
      from_status: 'submitted',
      to_status: 'verification',
      is_public: isPublic,
      created_at: new Date('2026-11-01'),
      note: 'PRIVATE-NOTE-SENTINEL',
      changed_by_role: 'PRIVATE-AUTHOR-SENTINEL',
    }));
    const result = await read();
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('Expected history');
    expect(result.data).toHaveLength(2);
    expect(result.data.every(row => !('note' in row) && !('actorRole' in row))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('SENTINEL');
    expect(state.selections[1]).toEqual(['id', 'fromStatus', 'toStatus', 'timestamp', 'isPublic']);
    expect(await read('own', true)).toMatchObject({ kind: 'ok', data: [{ isPublic: true }] });
  });
  it.each(['other-branch', 'foreign', 'missing'])('denies %s before history reads', async id => {
    expect(await read(id)).toEqual({ kind: 'unavailable' });
    expect(state.selections).toHaveLength(1);
  });
  it('denies staff-route drafts but preserves the admin draft policy', async () => {
    state.rows.claim[0].case_lifecycle_state = 'draft';
    expect(await read('own', true, true)).toEqual({ kind: 'unavailable' });
    expect(await read()).toEqual({ kind: 'ok', data: [] });
  });
  it('requires BM authority and reports unavailable and failure distinctly', async () => {
    state.descriptor.principal.role = 'tenant_admin';
    expect(await read()).toEqual({ kind: 'unavailable' });
    expect(state.selections).toHaveLength(0);
    resetQueryModel();
    state.fail = true;
    expect(await read()).toEqual({ kind: 'failed' });
  });
});
