import { describe, expect, it } from 'vitest';
import { canReadAgentSettings, isAdmin } from './access.core';

describe('agent-settings access.core', () => {
  it('identifies admin correctly', () => {
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('user')).toBe(false);
  });

  it('canReadAgentSettings logic', () => {
    const adminSession = { user: { role: 'admin', id: 'a1' } };
    const agentSession = { user: { role: 'agent', id: 'ag1' } };
    const otherSession = { user: { role: 'agent', id: 'ag2' } };

    expect(canReadAgentSettings({ session: adminSession as any, agentId: 'ag1' })).toBe(true);
    expect(canReadAgentSettings({ session: agentSession as any, agentId: 'ag1' })).toBe(true);
    expect(canReadAgentSettings({ session: otherSession as any, agentId: 'ag1' })).toBe(false);
    expect(canReadAgentSettings({ session: null, agentId: 'ag1' })).toBe(false);
  });
});
