import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions, op: 'and' })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, op: 'eq', right })),
}));

vi.mock('@interdomestik/database', () => ({
  agentClients: {
    memberId: 'agentClients.memberId',
    tenantId: 'agentClients.tenantId',
  },
  and: dbMocks.and,
  db: {},
  eq: dbMocks.eq,
}));

import {
  createAgentAssistedOwnershipAttribution,
  createSelfServeOwnershipAttribution,
  recordReadOnlyOwnershipAttribution,
  revokeAgentClientReadScope,
} from './ownership-attribution';

describe('ownership attribution helpers', () => {
  beforeEach(() => {
    dbMocks.and.mockClear();
    dbMocks.eq.mockClear();
  });

  it('creates self-serve attribution with optional assisting agent', () => {
    expect(createSelfServeOwnershipAttribution(' agent_1 ')).toEqual({
      agentId: 'agent_1',
      createdBy: 'self',
      assistedByAgentId: 'agent_1',
    });
    expect(createSelfServeOwnershipAttribution()).toEqual({
      agentId: null,
      createdBy: 'self',
      assistedByAgentId: null,
    });
  });

  it('creates agent-assisted attribution for durable assisted ownership writes', () => {
    expect(createAgentAssistedOwnershipAttribution(' agent_2 ')).toEqual({
      agentId: 'agent_2',
      createdBy: 'agent',
      assistedByAgentId: 'agent_2',
    });
  });

  it('rejects blank agent ids for agent-assisted attribution', () => {
    expect(() => createAgentAssistedOwnershipAttribution('   ')).toThrow(
      'Agent-assisted ownership attribution requires an agentId'
    );
  });

  it('records attribution without granting read scope or writing agent-client bindings', async () => {
    const tx = {
      insert: vi.fn(),
      update: vi.fn(),
    };

    await expect(
      recordReadOnlyOwnershipAttribution(tx, {
        tenantId: 'tenant-1',
        memberId: 'member-1',
        agentId: ' agent-1 ',
      })
    ).resolves.toEqual({
      agentId: 'agent-1',
      memberId: 'member-1',
      readScopeGranted: false,
      tenantId: 'tenant-1',
    });
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('revokes stale agent-client read scope without inserting a replacement grant', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    const tx = {
      update: vi.fn(() => ({ set })),
      insert: vi.fn(),
    };

    await expect(
      revokeAgentClientReadScope(
        tx as unknown as Parameters<typeof revokeAgentClientReadScope>[0],
        {
          tenantId: 'tenant-1',
          memberId: 'member-1',
        }
      )
    ).resolves.toEqual({
      memberId: 'member-1',
      readScopeGranted: false,
      tenantId: 'tenant-1',
    });
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ status: 'inactive' });
    expect(dbMocks.eq).toHaveBeenCalledWith('agentClients.tenantId', 'tenant-1');
    expect(dbMocks.eq).toHaveBeenCalledWith('agentClients.memberId', 'member-1');
    expect(dbMocks.and).toHaveBeenCalledWith(
      { left: 'agentClients.tenantId', op: 'eq', right: 'tenant-1' },
      { left: 'agentClients.memberId', op: 'eq', right: 'member-1' }
    );
    expect(where).toHaveBeenCalledWith({
      conditions: [
        { left: 'agentClients.tenantId', op: 'eq', right: 'tenant-1' },
        { left: 'agentClients.memberId', op: 'eq', right: 'member-1' },
      ],
      op: 'and',
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
