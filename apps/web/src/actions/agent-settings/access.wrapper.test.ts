import { describe, expect, it } from 'vitest';
import { canReadAgentSettings, isAdmin } from './access.core';

describe('agent-settings access.core', () => {
  it('identifies admin correctly', () => {
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('user')).toBe(false);
  });

  it('canReadAgentSettings logic', () => {
    type ReadParams = Parameters<typeof canReadAgentSettings>[0];
    type AgentSettingsSession = NonNullable<ReadParams['session']>;
    const adminSession = { user: { role: 'admin', id: 'a1' } } as AgentSettingsSession;
    const agentSession = { user: { role: 'agent', id: 'ag1' } } as AgentSettingsSession;
    const otherSession = { user: { role: 'agent', id: 'ag2' } } as AgentSettingsSession;

    expect(canReadAgentSettings({ session: adminSession, agentId: 'ag1' })).toBe(true);
    expect(canReadAgentSettings({ session: agentSession, agentId: 'ag1' })).toBe(true);
    expect(canReadAgentSettings({ session: otherSession, agentId: 'ag1' })).toBe(false);
    expect(canReadAgentSettings({ session: null, agentId: 'ag1' })).toBe(false);
  });
});
