import { describe, expect, it, vi } from 'vitest';
import { deps, fake, getAuthority, mail, now } from './mail-sender.test-support';
import { mailLeaseUntil } from './mail-outbox';
import { deliverSponsorMail, runSponsorMailOutbox } from './mail-sender';

describe('dispatch-time roster mail cutoff', () => {
  const delivery = {
    id: 'm1',
    kind: 'opt_out_confirmation',
    rosterEntryId: 'e1',
    handoverIntentId: null,
    userId: null,
    attempts: 1,
  };
  const origin = {
    entry: { id: 'e1', userId: 'u1' },
    // Early termination alone never moves this mail cutoff.
    effectiveEnd: '2025-12-01T00:00:00.000Z',
    termEnd: '2026-01-01T00:00:00.000Z',
  };
  const answerOriginReads = (columns?: Record<string, unknown>): unknown[] | undefined => {
    if (columns?.effectiveEnd) return [origin];
    if (columns?.email) return [{ email: 'current@example.test' }];
    if (columns?.subscription) return [];
    return undefined;
  };

  it.each(['queued', 'reclaimed'])('keeps aged %s work and terminally skips it', async state => {
    const row = { ...delivery, attempts: state === 'queued' ? 1 : 2 };
    fake.rows.push([{ id: row.id }], [row], [row]);
    fake.answerSelect = answerOriginReads;
    const d = deps();
    const outcome = await runSponsorMailOutbox(getAuthority(), d, { now, limit: 1 });
    expect(d.sendMail).not.toHaveBeenCalled();
    expect(d.sendActivation).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      claimed: 1,
      outcomes: { skipped: 1 },
    });
    expect(fake.writes).toHaveLength(2);
    expect(fake.writes[1]).toEqual({
      state: 'skipped',
      terminalAt: now.toISOString(),
      leaseUntil: null,
      lastErrorCode: 'aged_mail',
    });
  });

  it('sends eligible mail and suppresses its next attempt once the cutoff is reached', async () => {
    const before = new Date(now.getTime() - 1);
    vi.setSystemTime(before);
    const d = deps();
    d.sendMail = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    fake.answerSelect = answerOriginReads;
    fake.rows.push([{ id: delivery.id }], [delivery], [delivery]);
    expect(await runSponsorMailOutbox(getAuthority(), d, { now: before, limit: 1 })).toEqual({
      claimed: 1,
      outcomes: { queued: 1 },
    });
    expect(d.sendMail).toHaveBeenCalledWith(
      'current@example.test',
      expect.objectContaining({ kind: 'opt_out_confirmation' }),
      expect.any(Function)
    );
    const retryAt = new Date(before.getTime() + 15 * 60_000);
    vi.setSystemTime(retryAt);
    const retry = { ...delivery, attempts: 2 };
    fake.rows.push([{ id: retry.id }], [retry], [retry]);
    const outcome = await runSponsorMailOutbox(getAuthority(), d, { now: retryAt, limit: 1 });
    expect(d.sendMail).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      claimed: 1,
      outcomes: { skipped: 1 },
    });
    expect(fake.writes.at(-1)).toMatchObject({
      state: 'skipped',
      lastErrorCode: 'aged_mail',
      terminalAt: retryAt.toISOString(),
    });
  });

  it('rechecks the clock after preparing an eligible provider payload', async () => {
    vi.setSystemTime(new Date(now.getTime() - 1));
    const d = deps();
    d.formatDate = date => {
      vi.setSystemTime(now);
      return date.toISOString();
    };
    expect(await deliverSponsorMail(mail({ retentionDeadline: now }), d)).toEqual({
      state: 'skipped',
      reason: 'aged_mail',
    });
    expect(d.sendMail).not.toHaveBeenCalled();
  });

  it('finishes an in-flight attempt as aged when a later provider handoff is refused', async () => {
    const before = new Date(now.getTime() - 1);
    vi.setSystemTime(before);
    const d = deps();
    d.sendMail = vi.fn((_recipient, _input, dispatchBlock) => {
      expect(dispatchBlock?.()).toBeNull();
      vi.setSystemTime(now);
      const code = dispatchBlock?.();
      return Promise.resolve(code ? { ok: false, code } : { ok: true });
    });
    fake.answerSelect = answerOriginReads;
    fake.rows.push([{ id: delivery.id }], [delivery], [delivery]);

    expect(await runSponsorMailOutbox(getAuthority(), d, { now: before, limit: 1 })).toEqual({
      claimed: 1,
      outcomes: { skipped: 1 },
    });
    expect(fake.writes.at(-1)).toMatchObject({
      state: 'skipped',
      lastErrorCode: 'aged_mail',
      terminalAt: now.toISOString(),
    });
  });

  it('leaves an expired lease for recovery if a later provider handoff is refused', async () => {
    const before = new Date(now.getTime() - 10 * 60_000 - 1);
    vi.setSystemTime(before);
    const d = deps();
    d.sendMail = vi.fn((_recipient, _input, dispatchBlock) => {
      expect(dispatchBlock?.()).toBeNull();
      vi.setSystemTime(new Date(mailLeaseUntil(before)));
      const code = dispatchBlock?.();
      return Promise.resolve(code ? { ok: false, code } : { ok: true });
    });
    fake.answerSelect = answerOriginReads;
    fake.rows.push([{ id: delivery.id }], [delivery], [delivery]);

    expect(await runSponsorMailOutbox(getAuthority(), d, { now: before, limit: 1 })).toEqual({
      claimed: 1,
      outcomes: { lease_lost: 1 },
    });
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]).toMatchObject({ state: 'claimed', leaseUntil: mailLeaseUntil(before) });
  });

  it('records missing origin facts as a retryable error without provider calls', async () => {
    const d = deps();
    fake.rows.push([{ id: delivery.id }], [delivery], [], [delivery]);
    expect(await runSponsorMailOutbox(getAuthority(), d, { now, limit: 1 })).toEqual({
      claimed: 1,
      outcomes: { queued: 1 },
    });
    expect(fake.writes.at(-1)).toMatchObject({
      state: 'queued',
      lastErrorCode: 'facts_unavailable',
    });
    expect(d.reportError).toHaveBeenCalledWith(expect.any(Error), 'prepare');
    expect(d.sendMail).not.toHaveBeenCalled();
  });
});
