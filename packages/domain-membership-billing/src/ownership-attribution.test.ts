import { describe, expect, it } from 'vitest';
import {
  createAgentAssistedOwnershipAttribution,
  createSelfServeOwnershipAttribution,
} from './ownership-attribution';

describe('ownership attribution helpers', () => {
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
});
