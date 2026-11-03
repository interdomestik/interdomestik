import { goldenId } from '../seed-utils/seed-ids';
import { TENANTS } from './constants';
import type { SeedGoldenContext } from './types';

export type AgentAssignmentStatus = 'active' | 'inactive';

export interface AgentAssignmentSeed {
  id: string;
  agent: string;
  member: string;
  tenant: string;
  status: AgentAssignmentStatus;
}

export function buildAgentAssignmentsToSeed(): AgentAssignmentSeed[] {
  const active: Omit<AgentAssignmentSeed, 'status'>[] = [
    {
      id: goldenId('assign_mk_1'),
      agent: 'mk_agent_a1',
      member: 'mk_member_1',
      tenant: TENANTS.MK,
    },
    ...Array.from({ length: 4 }).map((_, i) => ({
      id: goldenId(`assign_ks_a_${i + 1}`),
      agent: 'ks_agent_a1',
      member: `ks_a_member_${i + 1}`,
      tenant: TENANTS.KS,
    })),
    ...Array.from({ length: 7 }).map((_, i) => ({
      id: goldenId(`assign_pilot_prishtina_eset_${i + 1}`),
      agent: 'pilot_mk_agent',
      member: `pilot_prishtina_member_0${i + 1}`,
      tenant: TENANTS.PILOT,
    })),
    ...Array.from({ length: 3 }).map((_, i) => ({
      id: goldenId(`assign_pilot_prishtina_bekim_${i + 8}`),
      agent: 'pilot_mk_agent_2',
      member: `pilot_prishtina_member_${String(i + 8).padStart(2, '0')}`,
      tenant: TENANTS.PILOT,
    })),
  ];

  return [
    ...active.map(a => ({ ...a, status: 'active' as const })),
    // Denial fixture: KS-B agent keeps claim attribution for ks_b_member_1, but the link is inactive.
    {
      id: goldenId('assign_ks_b_1_inactive'),
      agent: 'ks_b_agent_1',
      member: 'ks_b_member_1',
      tenant: TENANTS.KS,
      status: 'inactive',
    },
  ];
}

export async function seedAgentAssignments({ at, db, schema }: SeedGoldenContext) {
  console.log('🤝 Linking Agents to Members...');

  for (const a of buildAgentAssignmentsToSeed()) {
    await db
      .insert(schema.agentClients)
      .values({
        id: a.id,
        tenantId: a.tenant,
        agentId: goldenId(a.agent),
        memberId: goldenId(a.member),
        status: a.status,
        joinedAt: at(),
        createdAt: at(),
      })
      .onConflictDoUpdate({ target: schema.agentClients.id, set: { status: a.status } });
  }
}
