import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import type { CrmDomainEvent, CrmLeadMergedEvent } from '../outbox/types';
import {
  listDuplicateCandidates,
  mergeCrmLead,
  normalizeLeadDedupeIdentity,
  scoreCrmLeadMatchCandidate,
} from './mutations';
import type { MergeCrmLeadInput, MergeCrmLeadResult } from './mutations';
import {
  CRM_LEAD_MATCH_WEIGHTS,
  CRM_LEAD_MERGEABLE_FIELDS,
  LEAD_DEDUPE_MAX_CANDIDATES,
  LEAD_DEDUPE_MIN_PHONE_DIGITS,
} from './types';
import type {
  CrmLeadDedupeLead,
  CrmLeadDedupeRepository,
  CrmLeadMergeAggregateSummary,
  CrmLeadMergeFieldDecision,
  CrmLeadMergeHistoryRecord,
  CrmLeadMergeableField,
} from './repository';

const now = '2026-05-13T21:10:00.000Z';

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

const managerActor: CrmActorContext = {
  actorId: 'manager-1',
  role: 'branch_manager',
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

const adminActor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: {},
  tenantId: 'tenant-1',
};

const memberActor: CrmActorContext = {
  actorId: 'member-1',
  role: 'member',
  scope: { memberId: 'member-1' },
  tenantId: 'tenant-1',
};

const defaultMergeFieldDecisions: readonly CrmLeadMergeFieldDecision[] = [
  { field: 'email', source: 'winner' },
];

const mergeDependencies = {
  clock: { now: () => now },
  ids: { leadMergeHistoryId: () => 'merge-history-1' },
};

function lead(overrides: Partial<CrmLeadDedupeLead> = {}): CrmLeadDedupeLead {
  return {
    agentId: 'agent-1',
    archivedAt: null,
    branchId: 'branch-1',
    companyName: 'Crystal Home',
    convertedAt: null,
    email: 'Mira@example.com',
    fullName: 'Mira Lila',
    id: 'lead-1',
    lostAt: null,
    mergedIntoLeadId: null,
    notes: 'Prefers afternoon calls',
    phone: '+1 (212) 555-0199',
    source: 'web',
    tenantId: 'tenant-1',
    wonAt: null,
    ...overrides,
  };
}

class InMemoryLeadDedupeRepository implements CrmLeadDedupeRepository {
  readonly aggregateSummaries = new Map<string, CrmLeadMergeAggregateSummary>();
  readonly histories: CrmLeadMergeHistoryRecord[] = [];
  readonly leads = new Map<string, CrmLeadDedupeLead>();

  constructor(leads: readonly CrmLeadDedupeLead[] = []) {
    for (const crmLead of leads) this.leads.set(crmLead.id, crmLead);
  }

  async findLeadForMerge(params: { leadId: string }): Promise<CrmLeadDedupeLead | null> {
    return this.leads.get(params.leadId) ?? null;
  }

  async findLeadMergeAggregateSummary(params: {
    leadId: string;
    tenantId: string;
  }): Promise<CrmLeadMergeAggregateSummary> {
    const leadSummary = this.aggregateSummaries.get(params.leadId);
    return leadSummary ?? { activitiesCount: 0, activeDealsCount: 0, openFollowUpsCount: 0 };
  }

  async listPotentialDuplicateLeads(params: {
    actor: CrmActorContext;
    lead: CrmLeadDedupeLead;
    limit: number;
  }): Promise<readonly CrmLeadDedupeLead[]> {
    return [...this.leads.values()]
      .filter(candidate => candidate.tenantId === params.lead.tenantId)
      .slice(0, params.limit + 10);
  }

  async mergeLeads(params: {
    history: CrmLeadMergeHistoryRecord;
  }): Promise<CrmLeadMergeHistoryRecord> {
    this.histories.push(params.history);
    this.leads.set(params.history.loserLeadId, {
      ...this.leads.get(params.history.loserLeadId)!,
      mergedIntoLeadId: params.history.winnerLeadId,
    });
    return params.history;
  }
}

function mergeAttempt(
  repository: CrmLeadDedupeRepository,
  overrides: Partial<MergeCrmLeadInput> = {}
): Promise<MergeCrmLeadResult> {
  return mergeCrmLead(
    {
      actor: agentActor,
      fieldDecisions: defaultMergeFieldDecisions,
      loserLeadId: 'loser-lead',
      reason: 'duplicate',
      winnerLeadId: 'winner-lead',
      ...overrides,
    },
    repository,
    mergeDependencies
  );
}

describe('CRM lead dedupe domain', () => {
  it('pins exported match and field constants', () => {
    expect(LEAD_DEDUPE_MIN_PHONE_DIGITS).toBe(7);
    expect(LEAD_DEDUPE_MAX_CANDIDATES).toBe(25);
    expect(CRM_LEAD_MATCH_WEIGHTS).toEqual({
      email_exact: 60,
      name_company_exact: 45,
      phone_exact: 35,
    });
    expect(CRM_LEAD_MERGEABLE_FIELDS).toEqual([
      'fullName',
      'companyName',
      'phone',
      'email',
      'source',
      'notes',
    ]);
    expectTypeOf<
      (typeof CRM_LEAD_MERGEABLE_FIELDS)[number]
    >().toEqualTypeOf<CrmLeadMergeableField>();
  });

  it('normalizes identity fields for deterministic matching', () => {
    expect(
      normalizeLeadDedupeIdentity({
        companyName: '  Crystal   Home ',
        email: ' Mira@Example.COM ',
        fullName: '  Mira   Lila ',
        leadId: 'lead-1',
        phone: '+1 (212) 555-0199',
        tenantId: 'tenant-1',
      })
    ).toEqual({
      companyName: 'crystal home',
      email: 'mira@example.com',
      fullName: 'mira lila',
      leadId: 'lead-1',
      phone: '12125550199',
      tenantId: 'tenant-1',
    });

    expect(
      normalizeLeadDedupeIdentity({
        companyName: null,
        email: 'not-email',
        fullName: null,
        leadId: 'lead-1',
        phone: '123456',
        tenantId: 'tenant-1',
      })
    ).toEqual({
      companyName: null,
      email: null,
      fullName: null,
      leadId: 'lead-1',
      phone: null,
      tenantId: 'tenant-1',
    });
  });

  it('scores exact email and phone matches above name and company matches', () => {
    expect(
      scoreCrmLeadMatchCandidate(
        lead({ id: 'source-lead', email: 'mira@example.com', phone: '+1 212 555 0199' }),
        lead({ id: 'candidate-lead', email: 'MIRA@example.com', phone: '12125550199' })
      )
    ).toEqual({
      confidence: 'high',
      leadId: 'candidate-lead',
      reasons: ['email_exact', 'phone_exact', 'name_company_exact'],
      score: 100,
    });

    expect(
      scoreCrmLeadMatchCandidate(
        lead({ id: 'source-lead', email: null, phone: null }),
        lead({ id: 'candidate-lead', email: null, phone: null })
      )
    ).toEqual({
      confidence: 'medium',
      leadId: 'candidate-lead',
      reasons: ['name_company_exact'],
      score: 45,
    });
  });

  it('does not score cross-tenant or insufficient identity candidates', () => {
    expect(
      scoreCrmLeadMatchCandidate(lead(), lead({ id: 'other-tenant', tenantId: 'tenant-2' }))
    ).toBeNull();

    expect(
      scoreCrmLeadMatchCandidate(
        lead({ companyName: null, email: 'bad-email', fullName: null, phone: '12' }),
        lead({
          companyName: null,
          email: null,
          fullName: null,
          id: 'candidate-lead',
          phone: null,
        })
      )
    ).toEqual({
      confidence: 'low',
      leadId: 'candidate-lead',
      reasons: ['insufficient_identity'],
      score: 0,
    });
  });

  it('lists duplicate candidates through the authorized read model', async () => {
    const repository = new InMemoryLeadDedupeRepository([
      lead({ id: 'source-lead' }),
      lead({ id: 'email-match', email: 'mira@example.com', fullName: 'Other Person' }),
      lead({
        companyName: 'Other Co',
        email: 'other@example.com',
        fullName: 'Other Person',
        id: 'phone-match',
        phone: '12125550199',
      }),
      lead({ id: 'name-company-match', email: 'name@example.com', phone: '3035550199' }),
      lead({ id: 'archived-match', archivedAt: now }),
      lead({ id: 'merged-match', mergedIntoLeadId: 'winner-lead' }),
      lead({ id: 'converted-match', convertedAt: now }),
      lead({ id: 'won-match', wonAt: now }),
      lead({ id: 'other-agent-match', agentId: 'agent-2' }),
    ]);

    await expect(
      listDuplicateCandidates({ actor: agentActor, leadId: 'source-lead' }, repository)
    ).resolves.toEqual({
      candidates: [
        {
          confidence: 'high',
          leadId: 'email-match',
          reasons: ['email_exact', 'phone_exact'],
          score: 95,
        },
        {
          confidence: 'medium',
          leadId: 'name-company-match',
          reasons: ['name_company_exact'],
          score: 45,
        },
        {
          confidence: 'low',
          leadId: 'phone-match',
          reasons: ['phone_exact'],
          score: 35,
        },
      ],
      success: true,
    });

    const managerResult = await listDuplicateCandidates(
      { actor: managerActor, leadId: 'source-lead' },
      repository
    );
    expect(managerResult).toEqual(
      expect.objectContaining({
        success: true,
        candidates: expect.arrayContaining([
          expect.objectContaining({ leadId: 'other-agent-match' }),
        ]),
      })
    );
  });

  it('caps duplicate candidates at the exported top-N limit', async () => {
    const repository = new InMemoryLeadDedupeRepository([
      lead({ id: 'source-lead' }),
      ...Array.from({ length: LEAD_DEDUPE_MAX_CANDIDATES + 5 }, (_, index) =>
        lead({ id: `candidate-${index.toString().padStart(2, '0')}`, email: 'mira@example.com' })
      ),
    ]);

    const result = await listDuplicateCandidates(
      { actor: agentActor, leadId: 'source-lead' },
      repository
    );

    expect(result).toEqual({
      success: true,
      candidates: expect.arrayContaining([expect.objectContaining({ leadId: 'candidate-00' })]),
    });
    if (result.success) expect(result.candidates).toHaveLength(LEAD_DEDUPE_MAX_CANDIDATES);
  });

  it('rejects duplicate candidate reads outside actor visibility or eligible lead state', async () => {
    const repository = new InMemoryLeadDedupeRepository([
      lead({ id: 'agent-2-source', agentId: 'agent-2' }),
      lead({ id: 'archived-source', archivedAt: now }),
      lead({ id: 'tenant-2-source', tenantId: 'tenant-2' }),
    ]);

    await expect(
      listDuplicateCandidates({ actor: adminActor, leadId: 'missing-source' }, repository)
    ).resolves.toEqual({ success: false, error: 'not_found' });

    await expect(
      listDuplicateCandidates({ actor: adminActor, leadId: 'tenant-2-source' }, repository)
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'tenant_scope' });

    await expect(
      listDuplicateCandidates({ actor: memberActor, leadId: 'agent-2-source' }, repository)
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'role_scope' });

    await expect(
      listDuplicateCandidates({ actor: agentActor, leadId: 'agent-2-source' }, repository)
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'agent_scope' });

    await expect(
      listDuplicateCandidates({ actor: adminActor, leadId: 'archived-source' }, repository)
    ).resolves.toEqual({
      success: false,
      error: 'invalid_input',
      leadStateReason: 'archived',
      reason: 'lead_state',
    });
  });

  it('merges two eligible leads with append-only history, aggregate policy, and a typed event', async () => {
    const repository = new InMemoryLeadDedupeRepository([
      lead({ id: 'winner-lead' }),
      lead({ id: 'loser-lead', email: 'mira+duplicate@example.com' }),
    ]);
    const fieldDecisions: CrmLeadMergeFieldDecision[] = [
      { field: 'email', source: 'winner' },
      { field: 'phone', source: 'loser' },
      { field: 'notes', source: 'explicit', value: 'Merged from duplicate form submission' },
    ];

    const result = await mergeCrmLead(
      {
        actor: agentActor,
        fieldDecisions,
        idempotencyKey: 'merge-key-1',
        loserLeadId: 'loser-lead',
        matchReasonCodes: ['email_exact', 'phone_exact', 'email_exact'],
        reason: 'Duplicate web form submission',
        winnerLeadId: 'winner-lead',
      },
      repository,
      {
        clock: { now: () => now },
        ids: { leadMergeHistoryId: vi.fn(() => 'merge-history-1') },
      }
    );

    expect(result).toEqual({
      event: expect.objectContaining({
        aggregateId: 'winner-lead',
        aggregateType: 'lead',
        idempotencyKey: 'merge-key-1',
        payload: {
          branchId: 'branch-1',
          loserLeadId: 'loser-lead',
          matchReasonCodes: ['email_exact', 'phone_exact'],
          mergedFieldKeys: ['email', 'phone', 'notes'],
          reason: 'Duplicate web form submission',
          winnerLeadId: 'winner-lead',
        },
        type: 'crm.lead.merged',
      }),
      history: expect.objectContaining({
        actorId: 'agent-1',
        aggregatePolicy: {
          activities: 'reassign_to_winner',
          deals: 'refuse_if_present',
          followUps: 'reassign_to_winner',
          ownershipHistory: 'remain_on_loser_for_audit',
          stageHistory: 'remain_on_loser_for_audit',
        },
        branchId: 'branch-1',
        fieldDecisions,
        id: 'merge-history-1',
        idempotencyKey: 'merge-key-1',
        loserLeadId: 'loser-lead',
        matchReasonCodes: ['email_exact', 'phone_exact'],
        reason: 'Duplicate web form submission',
        tenantId: 'tenant-1',
        winnerLeadId: 'winner-lead',
      }),
      success: true,
    });
    expect(repository.histories).toHaveLength(1);
    expect(repository.leads.get('loser-lead')?.mergedIntoLeadId).toBe('winner-lead');
  });

  it('rejects invalid merge targets without appending history', async () => {
    const repository = new InMemoryLeadDedupeRepository([lead({ id: 'lead-1' })]);

    await expect(
      mergeAttempt(repository, {
        loserLeadId: 'lead-1',
        reason: 'same lead',
        winnerLeadId: 'lead-1',
      })
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'self_merge' });

    await expect(
      mergeAttempt(repository, {
        loserLeadId: '',
        reason: 'missing loser',
        winnerLeadId: 'lead-1',
      })
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'invalid_target' });
    expect(repository.histories).toHaveLength(0);
  });

  it('rejects non-owning agent and cross-branch merges without side effects', async () => {
    const repository = new InMemoryLeadDedupeRepository([
      lead({ id: 'winner-lead' }),
      lead({ id: 'loser-lead', agentId: 'agent-2' }),
      lead({ id: 'tenant-2-loser', tenantId: 'tenant-2' }),
    ]);

    await expect(mergeAttempt(repository, { loserLeadId: 'missing-loser' })).resolves.toEqual({
      success: false,
      error: 'not_found',
    });

    await expect(mergeAttempt(repository, { loserLeadId: 'tenant-2-loser' })).resolves.toEqual({
      success: false,
      error: 'forbidden',
      reason: 'tenant_scope',
    });

    await expect(mergeAttempt(repository, { actor: memberActor })).resolves.toEqual({
      success: false,
      error: 'forbidden',
      reason: 'role_scope',
    });

    await expect(mergeAttempt(repository)).resolves.toEqual({
      success: false,
      error: 'forbidden',
      reason: 'agent_scope',
    });
    expect(repository.histories).toHaveLength(0);

    repository.leads.set('loser-lead', lead({ id: 'loser-lead', branchId: 'branch-2' }));
    await expect(mergeAttempt(repository, { actor: managerActor })).resolves.toEqual({
      success: false,
      error: 'forbidden',
      reason: 'branch_scope',
    });
    expect(repository.histories).toHaveLength(0);
  });

  it('rejects ineligible lead states and loser deals with one typed lead_state reason', async () => {
    const repository = new InMemoryLeadDedupeRepository([
      lead({ id: 'winner-lead' }),
      lead({ archivedAt: now, id: 'loser-lead' }),
    ]);

    async function attempt(): Promise<unknown> {
      return mergeAttempt(repository);
    }

    await expect(attempt()).resolves.toEqual({
      success: false,
      error: 'invalid_input',
      leadStateReason: 'archived',
      reason: 'lead_state',
    });

    repository.leads.set('loser-lead', lead({ id: 'loser-lead', mergedIntoLeadId: 'other-lead' }));
    await expect(attempt()).resolves.toEqual({
      success: false,
      error: 'invalid_input',
      leadStateReason: 'already_merged',
      reason: 'lead_state',
    });

    repository.leads.set('loser-lead', lead({ convertedAt: now, id: 'loser-lead' }));
    await expect(attempt()).resolves.toEqual({
      success: false,
      error: 'invalid_input',
      leadStateReason: 'converted',
      reason: 'lead_state',
    });

    repository.leads.set('loser-lead', lead({ id: 'loser-lead', lostAt: now }));
    await expect(attempt()).resolves.toEqual({
      success: false,
      error: 'invalid_input',
      leadStateReason: 'closed',
      reason: 'lead_state',
    });

    repository.leads.set('loser-lead', lead({ id: 'loser-lead' }));
    repository.aggregateSummaries.set('loser-lead', {
      activitiesCount: 1,
      activeDealsCount: 1,
      openFollowUpsCount: 1,
    });
    await expect(attempt()).resolves.toEqual({
      success: false,
      error: 'invalid_input',
      leadStateReason: 'active_deals_present',
      reason: 'lead_state',
    });
    expect(repository.histories).toHaveLength(0);
  });

  it('rejects empty reason and invalid field-decision sets', async () => {
    const repository = new InMemoryLeadDedupeRepository([
      lead({ id: 'winner-lead' }),
      lead({ id: 'loser-lead' }),
    ]);

    await expect(mergeAttempt(repository, { reason: '   ' })).resolves.toEqual({
      success: false,
      error: 'invalid_input',
      reason: 'empty_reason',
    });

    await expect(mergeAttempt(repository, { fieldDecisions: [] })).resolves.toEqual({
      success: false,
      error: 'invalid_input',
      reason: 'empty_field_decisions',
    });

    await expect(
      mergeAttempt(repository, {
        fieldDecisions: [{ field: 'score' as CrmLeadMergeableField, source: 'winner' }],
      })
    ).resolves.toEqual({
      success: false,
      error: 'invalid_input',
      reason: 'invalid_field_decision',
    });
    expect(repository.histories).toHaveLength(0);
  });

  it('keeps the merged event in the CRM domain event union', () => {
    expectTypeOf<CrmLeadMergedEvent>().toMatchTypeOf<CrmDomainEvent>();
  });
});
