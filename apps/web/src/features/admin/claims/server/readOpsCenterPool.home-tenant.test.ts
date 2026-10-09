import { beforeEach, describe, expect, it } from 'vitest';

import { hoisted, runInTx } from './ops-pool.test-fixtures';

import { createRecordingTenantTransaction as createRecordingTx } from '@/test/recording-tenant-transaction';
import { mapClaimsToOperationalRows } from '../mappers';
import type { ClaimsVisibilityContext } from './claimVisibility';
import { getOpsCenterData } from './getOpsCenterData';
import { loadOpsCenterPool } from './loadOpsCenterPool';
import type { OpsCenterPoolRow, OpsPoolHomeRefs, TransferredCandidate } from './readOpsCenterPool';

const MK = { tenantId: 'tenant-mk', role: 'admin' };
const KS = { tenantId: 'tenant-ks', role: 'admin' };
const CONTEXT: ClaimsVisibilityContext = {
  tenantId: 'tenant-mk',
  userId: 'admin-1',
  role: 'admin',
  branchId: null,
};
const TRANSFERRED_HOME: OpsPoolHomeRefs = {
  tenantId: 'tenant-ks',
  branchId: 'branch-ks',
  agentId: 'agent-ks',
};
const HOME_USERS = [
  { id: 'member-ks', name: 'Member KS', email: 'member@ks.test', memberNumber: 'MEM-2026-000009' },
  { id: 'staff-ks', name: 'Staff KS', email: 'staff@ks.test', memberNumber: null },
  { id: 'agent-ks', name: 'Agent KS', email: 'agent@ks.test', memberNumber: null },
];
const HOME_BRANCH = { id: 'branch-ks', code: 'KS01', name: 'Prishtina' };
const EXPECTED_DTO = {
  memberId: 'member-ks',
  memberName: 'Member KS',
  memberEmail: 'member@ks.test',
  memberNumber: 'MEM-2026-000009',
  branchCode: 'KS01',
  agentName: 'Agent KS',
  originDisplayName: 'Agent KS',
  assigneeId: 'staff-ks',
  ownerName: 'Staff KS',
};

const flat = (value: string) => value.replace(/\s+/g, ' ');
const whereOf = (value: string) => {
  const text = flat(value);
  return text.slice(text.indexOf(' where '), text.lastIndexOf(' order by '));
};
const sorted = (values: unknown[] | undefined) => [...(values ?? [])].sort();

function poolRow(
  id: string,
  home: OpsPoolHomeRefs,
  overrides: Partial<OpsCenterPoolRow> = {}
): OpsCenterPoolRow {
  const now = new Date('2026-10-01T00:00:00.000Z');
  return {
    claim: {
      id,
      title: `Claim ${id}`,
      status: 'submitted',
      caseLifecycleState: null,
      recoveryLifecycleState: null,
      createdAt: now,
      updatedAt: now,
      assignedAt: null,
      userId: 'member-ks',
      claimNumber: `CLM-${id}`,
      staffId: 'staff-ks',
      category: 'vehicle',
      currency: 'EUR',
      statusUpdatedAt: now,
      origin: 'agent',
      originRefId: null,
    },
    claimant: null,
    staff: null,
    branch: { id: null, code: null, name: null },
    agent: null,
    home,
    ...overrides,
  };
}

function candidate(
  id: string,
  overrides: Partial<TransferredCandidate> = {}
): TransferredCandidate {
  return {
    id,
    tenantId: 'tenant-ks',
    branchId: 'branch-ks',
    userId: 'member-ks',
    localBranchMatch: false,
    localMemberMatch: false,
    ...overrides,
  };
}

describe('ops pool home-tenant references', () => {
  beforeEach(() => {
    hoisted.withTenantContext.mockReset();
    hoisted.captureException.mockReset();
    hoisted.globalDbReads.length = 0;
  });

  it('fills transferred refs from the derived home tenant with batched exact-id reads', async () => {
    const local = poolRow('claim-l', {
      tenantId: 'tenant-mk',
      branchId: 'branch-a',
      agentId: null,
    });
    const { tx, executed } = createRecordingTx([
      [poolRow('claim-t', TRANSFERRED_HOME), local],
      HOME_USERS,
      [HOME_BRANCH],
    ]);
    const tracker = runInTx(tx);

    const rows = await loadOpsCenterPool(CONTEXT, {});

    expect(tracker.contexts).toEqual([MK, KS]);
    expect(tracker.events).toEqual(['open', 'close', 'open', 'close']);
    expect(tracker.getMaxActive()).toBe(1);
    expect(executed).toHaveLength(3);
    // One user and one branch read for the whole home tenant; local rows are never home-read.
    expect(flat(executed[1]?.sql ?? '')).toContain('from "user"');
    expect(sorted(executed[1]?.params)).toEqual(['agent-ks', 'member-ks', 'staff-ks', 'tenant-ks']);
    expect(flat(executed[2]?.sql ?? '')).toContain('from "branches"');
    expect(sorted(executed[2]?.params)).toEqual(['branch-ks', 'tenant-ks']);
    expect(rows.every(row => !('home' in row))).toBe(true);
    const [dto, localDto] = mapClaimsToOperationalRows(rows);
    expect(dto).toMatchObject(EXPECTED_DTO);
    expect(localDto).toMatchObject({ memberName: 'Unknown', memberNumber: null });
    expect(hoisted.globalDbReads).toEqual([]);
  });

  it('keeps access-tenant joined refs and home-reads only the NULL ones', async () => {
    const row = poolRow(
      'claim-t',
      { tenantId: 'tenant-ks', branchId: 'branch-a', agentId: null },
      {
        staff: { name: 'Staff MK', email: 'staff@mk.test' },
        branch: { id: 'branch-a', code: 'A01', name: 'Skopje' },
      }
    );
    const { tx, executed } = createRecordingTx([[row], [HOME_USERS[0]]]);
    runInTx(tx);

    const [dto] = mapClaimsToOperationalRows(await loadOpsCenterPool(CONTEXT, {}));

    expect(executed).toHaveLength(2);
    expect(sorted(executed[1]?.params)).toEqual(['member-ks', 'tenant-ks']);
    expect(dto).toMatchObject({
      memberName: 'Member KS',
      ownerName: 'Staff MK',
      branchCode: 'A01',
    });
  });

  it('applies a home branch-code filter to transferred claims before the pool cap', async () => {
    const { tx, executed } = createRecordingTx([
      [
        candidate('claim-t'),
        candidate('claim-d', { branchId: 'branch-ks-2', userId: 'member-ks-2' }),
      ],
      [{ id: 'branch-ks' }],
      [poolRow('claim-t', TRANSFERRED_HOME)],
      HOME_USERS,
      [HOME_BRANCH],
    ]);
    const tracker = runInTx(tx);

    const rows = await loadOpsCenterPool(CONTEXT, { branch: 'KS01' });

    expect(tracker.contexts).toEqual([MK, KS, MK, KS]);
    expect(tracker.getMaxActive()).toBe(1);
    const scan = flat(executed[0]?.sql ?? '');
    expect(scan).toMatch(/"claim"\."tenant_id" <> \$\d+/);
    expect(scan).toContain('order by "claim"."id" asc');
    expect(executed[0]?.params).toEqual(expect.arrayContaining(['tenant-mk', 'KS01']));
    expect(executed[0]?.params.at(-1)).toBe(500);
    // Home check touches only the admitted candidates' branch ids inside the home tenant.
    expect(sorted(executed[1]?.params)).toEqual(['KS01', 'branch-ks', 'branch-ks-2', 'tenant-ks']);
    const poolWhere = whereOf(executed[2]?.sql ?? '');
    expect(poolWhere).toContain('"branches"."code" = $');
    expect(poolWhere).toContain('"claim"."id" in (');
    expect(executed[2]?.params).toContain('claim-t');
    expect(executed[2]?.params).not.toContain('claim-d');
    expect(executed[2]?.params.at(-1)).toBe(201);
    expect(mapClaimsToOperationalRows(rows)).toEqual([expect.objectContaining(EXPECTED_DTO)]);
  });

  it('pages transferred candidates by keyset and keeps only the newest 201 matches', async () => {
    const page = Array.from({ length: 500 }, (_, i) =>
      candidate(`claim-${String(i).padStart(3, '0')}`, { userId: `member-${i}` })
    );
    const ranked = page.slice(0, 201).map(({ id }) => ({ id }));
    const { tx, executed } = createRecordingTx([
      page,
      page.map(({ userId }) => ({ id: userId })),
      ranked,
      [],
      [],
    ]);
    const tracker = runInTx(tx);

    await loadOpsCenterPool(CONTEXT, { search: 'mem-2026-000009' });

    expect(tracker.contexts).toEqual([MK, KS, MK]);
    expect(executed).toHaveLength(5);
    expect(flat(executed[1]?.sql ?? '')).toContain('from "user"');
    expect(executed[1]?.params).toEqual(expect.arrayContaining(['tenant-ks', 'MEM-2026-000009%']));
    expect(executed[2]?.params).toEqual(expect.arrayContaining(page.map(({ id }) => id)));
    expect(flat(executed[2]?.sql ?? '')).toMatch(/ desc, "claim"\."id" desc limit \$\d+$/);
    expect(executed[2]?.params.at(-1)).toBe(201);
    expect(flat(executed[3]?.sql ?? '')).toContain('"claim"."id" > $');
    expect(executed[3]?.params).toContain('claim-499');
    const poolWhere = whereOf(executed[4]?.sql ?? '');
    expect(poolWhere).toMatch(/"claim"\."userId" in \(select .+ from "user"/);
    expect(poolWhere).toContain('"claim"."id" in (');
    expect(executed[4]?.params).toContain('claim-200');
    expect(executed[4]?.params).not.toContain('claim-201');
    expect(executed[4]?.params.at(-1)).toBe(201);
  });

  it('home-checks only references the access tenant did not already match', async () => {
    const mixed = candidate('claim-t', { branchId: 'branch-a', localBranchMatch: true });
    const { tx, executed } = createRecordingTx([[mixed], [{ id: 'member-ks' }], []]);
    runInTx(tx);

    await loadOpsCenterPool(CONTEXT, { branch: 'A01', search: 'MEM-2026-000009' });

    expect(executed).toHaveLength(3);
    expect(flat(executed[1]?.sql ?? '')).toContain('from "user"');
    expect(executed[1]?.params).not.toContain('branch-a');
    expect(executed[2]?.params).toContain('claim-t');
  });

  it('reads the pool in the scan transaction when no transferred candidate exists', async () => {
    const { tx, executed } = createRecordingTx([[], []]);
    const tracker = runInTx(tx);

    await loadOpsCenterPool(CONTEXT, { branch: 'A01' });

    expect(tracker.contexts).toEqual([MK]);
    expect(executed).toHaveLength(2);
    expect(whereOf(executed[1]?.sql ?? '')).not.toContain('"claim"."id" in (');
  });

  it('propagates a home-tenant read failure without further transactions', async () => {
    const failure = new Error('permission denied for table branches');
    const { tx, executed } = createRecordingTx([[candidate('claim-t')], failure]);
    const tracker = runInTx(tx);

    await expect(loadOpsCenterPool(CONTEXT, { branch: 'KS01' })).rejects.toBe(failure);

    expect(tracker.contexts).toEqual([MK, KS]);
    expect(tracker.events).toEqual(['open', 'close', 'open', 'close']);
    expect(executed).toHaveLength(2);
  });

  it('completes home enrichment before the stats transaction', async () => {
    const statsRow = {
      intake: '1',
      verification: 0,
      processing: 0,
      negotiation: 0,
      legal: 0,
      completed: 0,
    };
    const { tx } = createRecordingTx([
      [poolRow('claim-t', TRANSFERRED_HOME)],
      HOME_USERS,
      [HOME_BRANCH],
      [statsRow],
    ]);
    const tracker = runInTx(tx);

    const result = await getOpsCenterData(CONTEXT);

    expect(tracker.contexts).toEqual([MK, KS, MK]);
    expect(tracker.getMaxActive()).toBe(1);
    expect(result.prioritized).toEqual([expect.objectContaining(EXPECTED_DTO)]);
    expect(result.kpis.totalOpen).toBe(1);
    expect(result.stats.intake).toBe(1);
    expect(hoisted.captureException).not.toHaveBeenCalled();
    expect(hoisted.globalDbReads).toEqual([]);
  });
});
