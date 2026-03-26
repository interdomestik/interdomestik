import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AgentVerifiedID, formatVerifiedDate } from './agent-verified-id';

describe('formatVerifiedDate', () => {
  it('formats sq month names without relying on browser locale data', () => {
    expect(formatVerifiedDate('2026-01-01T00:00:00.000Z', 'sq')).toBe('janar 2026');
  });

  it('formats sr month names without relying on browser locale data', () => {
    expect(formatVerifiedDate('2026-01-01T00:00:00.000Z', 'sr')).toBe('јануар 2026');
  });
});

describe('AgentVerifiedID', () => {
  it('renders the localized active-since value', () => {
    render(
      <AgentVerifiedID
        name="Stefan Dimitrioski"
        agentId="golden_m"
        createdAt="2026-01-01T00:00:00.000Z"
        locale="sq"
        verifiedLabel="Agjent i verifikuar"
        activeSinceLabel="Aktiv që nga"
      />
    );

    expect(screen.getByText(/Aktiv që nga: janar 2026/i)).toBeInTheDocument();
  });
});
