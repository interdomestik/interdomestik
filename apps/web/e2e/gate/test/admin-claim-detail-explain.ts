import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import assert from 'node:assert/strict';
import {
  assertPage,
  documentId,
  DOCUMENT_BUDGET,
  measureRead,
  type ClaimDetailReader,
  type ClaimReadFixture,
  type FixtureController,
} from './admin-claim-detail-plans';
import { observeRestrictedPool, type Pool } from './admin-claim-detail-query-probe';

type PlanCase = { claimId: string; tenant: string; size: number; label: string };
type PlanEvidence = Awaited<ReturnType<typeof measureRead>>;

async function seedPlanData<T>(
  controller: FixtureController,
  f: ClaimReadFixture,
  member: string,
  work: (cases: PlanCase[]) => Promise<T>
) {
  const base = `${f.prefix}-volume`;
  const cases = [27, 500].flatMap(size => [
    { claimId: `${base}-null-${size}`, tenant: f.home, size, label: `null-home-${size}` },
    { claimId: `${base}-access-${size}`, tenant: f.access, size, label: `explicit-access-${size}` },
    { claimId: `${base}-mixed-${size}`, tenant: f.home, size, label: `mixed-${size}` },
  ]);
  const noisePrefix = `${base}-noise-`;
  await controller.begin(async tx => {
    await tx`
      insert into public.claim (id, tenant_id, "userId", title, category, "companyName")
      select ${noisePrefix} || n, case when n % 4 < 2 then ${f.home} else ${f.access} end,
        ${member}, 'Synthetic unrelated claim', 'vehicle', 'Synthetic company'
      from generate_series(1, 1000) as series(n)
    `;
    await tx`
      insert into public.claim_documents
        (id, claim_id, tenant_id, access_tenant_id, name, file_path, file_type, file_size, uploaded_by)
      select ${noisePrefix} || n || '-doc-' || d, ${noisePrefix} || n,
        case when n % 4 < 2 then ${f.home} else ${f.access} end,
        case when n % 4 = 0 then ${f.home} when n % 4 = 2 then ${f.access} end,
        'Synthetic document', ${noisePrefix} || n || '/' || d, 'application/pdf', 1, ${member}
      from generate_series(1, 1000) as series(n)
      cross join generate_series(0, 99) as documents(d)
    `;
    for (const { claimId, tenant, size, label } of cases) {
      const accessTenant = tenant === f.home ? null : tenant;
      const branchId = tenant === f.home ? f.branchA : 'mk_branch_a';
      await tx`
        insert into public.claim
          (id, tenant_id, access_tenant_id, branch_id, "userId", title, category, "companyName")
        values (${claimId}, ${f.home}, ${accessTenant}, ${branchId}, ${member},
          'Synthetic measured claim', 'vehicle', 'Synthetic company')
      `;
      await tx`
        insert into public.claim_documents
          (id, claim_id, tenant_id, access_tenant_id, name, file_path, file_type, file_size, uploaded_by)
        select ${claimId} || '-doc-' || lpad(d::text, 4, '0'), ${claimId}, ${f.home},
          case when ${label.startsWith('mixed-')} and d % 2 = 1 then ${f.home} else ${accessTenant} end,
          'Synthetic document', ${claimId} || '/' || d,
          'application/pdf', 1, ${member}
        from generate_series(0, ${size - 1}) as documents(d)
      `;
    }
  });
  try {
    await controller`analyze public.claim_documents`;
    await controller`analyze public.claim`;
    await controller`analyze public."user"`;
    return await work(cases);
  } finally {
    const caseIds = cases.map(({ claimId }) => claimId);
    await controller.begin(async tx => {
      await tx`
        delete from public.claim_documents where claim_id in ${tx(caseIds)}
          or claim_id like ${noisePrefix + '%'}
      `;
      await tx`
        delete from public.claim where id in ${tx(caseIds)}
          or id like ${noisePrefix + '%'}
      `;
    });
  }
}

function assertDocumentPlanRead(
  result: Awaited<ReturnType<ClaimDetailReader>>,
  phase: 'first' | 'continuation' | 'count',
  { size, label }: PlanCase,
  skip: number,
  id: (index: number) => string
) {
  assert.ok(result, label);
  if (phase === 'count') {
    assert.deepEqual(result.documents, { kind: 'summary', count: size }, label);
    return;
  }

  const offset = phase === 'first' ? 0 : skip + 1;
  assertPage(
    result.documents,
    Array.from({ length: Math.min(25, size - offset) }, (_, i) => id(offset + i)),
    phase === 'first' ? id(24) : null
  );
}

async function measureStaffPages(
  f: ClaimReadFixture,
  pool: Pool,
  read: ClaimDetailReader,
  admin: TenantAuthority,
  evidence: PlanEvidence[]
) {
  for (const [label, staffAfter] of [
    ['staff/first', undefined],
    ['staff/continuation', f.staffAfter],
  ] as const) {
    const start = evidence.length;
    const result = await observeRestrictedPool(
      pool,
      () => read({ authority: admin, claimId: f.localId, staffSearch: f.prefix, staffAfter }),
      {
        measurePoolTiming: true,
        afterRead: async (kind, run, query, checkout) => {
          if (kind === 'staff') evidence.push(await measureRead(run, query, label, checkout));
        },
      }
    );
    assert.equal(evidence.length, start + 1);
    assert.equal(result?.staffPage?.items.length, staffAfter ? 1 : 25);
    assert.equal(result.staffPage.nextCursor, staffAfter ? null : f.staffAfter);
  }
}

export async function measureRestrictedClaimReads(
  controller: FixtureController,
  f: ClaimReadFixture,
  member: string,
  pool: Pool,
  read: ClaimDetailReader,
  {
    admin,
    manager,
    current,
    currentManager,
  }: {
    admin: TenantAuthority;
    manager: TenantAuthority;
    current: TenantAuthority;
    currentManager: TenantAuthority;
  }
) {
  const plans = await seedPlanData(controller, f, member, async cases => {
    const evidence: PlanEvidence[] = [];
    for (const planCase of cases) {
      const { claimId, tenant, size, label } = planCase;
      const metadataAuthority = tenant === f.home ? admin : current;
      const countAuthority = tenant === f.home ? manager : currentManager;
      const id = (index: number) => documentId(claimId, index, 4);
      const skip = size === 500 ? 474 : 24;
      for (const [phase, authority, after] of [
        ['first', metadataAuthority, undefined],
        ['continuation', metadataAuthority, id(skip)],
        ['count', countAuthority, undefined],
      ] as const) {
        const start = evidence.length;
        const result = await observeRestrictedPool(
          pool,
          () => read({ authority, claimId, documentsAfter: after }),
          {
            measurePoolTiming: true,
            afterRead: async (kind, run, query, checkout) => {
              if (kind === 'documents') {
                evidence.push(await measureRead(run, query, `${label}/${phase}`, checkout));
              }
            },
          }
        );
        assert.equal(evidence.length, start + 1);
        assertDocumentPlanRead(result, phase, planCase, skip, id);
      }
    }
    await measureStaffPages(f, pool, read, admin, evidence);
    return evidence;
  });
  return {
    restricted: true,
    caseVolume: { unrelatedClaims: 1000, unrelatedDocuments: 100_000 },
    budget: DOCUMENT_BUDGET,
    misses: plans.filter(plan => !plan.passed).map(plan => plan.label),
    plans,
  };
}
