import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sqAgent from '@/messages/sq/agent.json';
import sqClaims from '@/messages/sq/claims.json';
import mkAgent from '@/messages/mk/agent.json';
import mkClaims from '@/messages/mk/claims.json';
import { useAgentLeadRows } from '@/features/agent/leads/components/agent-lead-presentation';
import { useAgentClaimRows, type AgentProClaim } from './agent-claim-rows';
import { PILOT_TIME_ZONE } from '@/lib/utils/date';

vi.unmock('next-intl');
const initialZone = process.env.TZ;
afterEach(() => {
  process.env.TZ = initialZone;
});
const createdAt = new Date('2026-11-11T23:30:00Z');
const claim: AgentProClaim = {
  id: 'claim',
  claimNumber: 'CLM-1',
  title: 'Damage',
  status: 'submitted',
  createdAt,
  updatedAt: createdAt,
  member: null,
  branch: null,
};
function Rows() {
  const claims = useAgentClaimRows([claim], () => undefined);
  const leads = useAgentLeadRows(
    [{ id: 'lead', createdAt, updatedAt: createdAt }],
    () => undefined,
    () => 'Status'
  );
  return (
    <>
      {[...claims.rows, ...leads.tableRows].map(row => (
        <div key={row.id}>{row.cells}</div>
      ))}
    </>
  );
}

describe('agent leads and claims hydration', () => {
  it.each(['sq', 'mk'])('keeps %s server/client text identical across host zones', async locale => {
    const view = (
      <NextIntlClientProvider
        locale={locale}
        timeZone={PILOT_TIME_ZONE}
        now={new Date('2026-11-12T12:00:00Z')}
        messages={locale === 'sq' ? { ...sqAgent, ...sqClaims } : { ...mkAgent, ...mkClaims }}
      >
        <Rows />
      </NextIntlClientProvider>
    );
    process.env.TZ = 'UTC';
    const container = document.createElement('div');
    container.innerHTML = renderToString(view);
    document.body.append(container);
    const serverText = container.textContent;
    expect(serverText).toContain('12.11.2026');
    process.env.TZ = 'America/Los_Angeles';
    const errors = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, view, { onRecoverableError: errors });
    });
    expect(container.textContent).toBe(serverText);
    expect(errors).not.toHaveBeenCalled();
    await act(async () => root?.unmount());
    container.remove();
  });
});
