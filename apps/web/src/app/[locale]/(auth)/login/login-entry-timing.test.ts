import { describe, expect, it, vi } from 'vitest';

import {
  createLoginEntryTiming,
  type LoginEntryTiming,
  type LoginEntryTimingEnv,
} from './login-entry-timing';

const SHA = 'a4508910f6eede25643f56659946e2502b66b019';
const ISSUED_AT = 1_800_000_000_000;
const WINDOW_MS = 600_000;
const DISABLED = createLoginEntryTiming({ env: {} });
const UPPER_SHA = SHA.toUpperCase();
const SHORT_SHA = SHA.slice(0, 12);

type EnvOverrides = Partial<Record<keyof LoginEntryTimingEnv, string | undefined>>;

function activeEnv(overrides: EnvOverrides = {}): LoginEntryTimingEnv {
  return {
    VERCEL_ENV: 'preview',
    COMMIT_SHA: SHA,
    LOGIN_ENTRY_TIMING_TARGET_SHA: SHA,
    LOGIN_ENTRY_TIMING_ISSUED_AT: String(ISSUED_AT),
    LOGIN_ENTRY_TIMING_EXPIRES_AT: String(ISSUED_AT + WINDOW_MS),
    ...overrides,
  };
}

const HOUR_ENV = activeEnv({ LOGIN_ENTRY_TIMING_EXPIRES_AT: String(ISSUED_AT + 3_600_000) });

function sequence(values: readonly number[]): () => number {
  const queue = [...values];
  return () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('clock exhausted');
    return next;
  };
}

type HarnessOptions = {
  env?: LoginEntryTimingEnv;
  epoch?: () => number;
  now?: () => number;
  clock?: readonly number[];
  log?: (line: string) => void;
};

function harness(options: HarnessOptions = {}) {
  const now = vi.fn(options.now ?? sequence(options.clock ?? []));
  const epochNow = vi.fn(options.epoch ?? (() => ISSUED_AT + 1_000));
  const log = vi.fn(options.log ?? ((_line: string): void => {}));
  const timing = createLoginEntryTiming({ env: options.env ?? activeEnv(), now, epochNow, log });
  return { timing, now, epochNow, log };
}

function line(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({ event: 'login_entry_timing', v: 1, ...fields });
}

function exercise(timing: LoginEntryTiming): void {
  timing.begin('session')();
  timing.sessionResolved(true);
  timing.mark('redirect_requested');
  timing.mark('entry_returned');
  timing.finishOnce();
}

const NON_STRICT_EPOCHS = [
  ...['', '1.8e12', ' 1800000000000', '1800000000000.0', '+1800000000000'],
  ...['0x1a3185c5000', '01800000000000', '9007199254740993'],
];

const DISABLED_OVERRIDES: ReadonlyArray<readonly [string, EnvOverrides]> = [
  ['production', { VERCEL_ENV: 'production' }],
  ['development', { VERCEL_ENV: 'development' }],
  ['a non-exact preview value', { VERCEL_ENV: 'Preview' }],
  ['a missing deployment env', { VERCEL_ENV: undefined }],
  ['another target commit', { LOGIN_ENTRY_TIMING_TARGET_SHA: 'f'.repeat(40) }],
  ['a missing target commit', { LOGIN_ENTRY_TIMING_TARGET_SHA: undefined }],
  ['a missing actual commit', { COMMIT_SHA: undefined }],
  ['an uppercase commit', { COMMIT_SHA: UPPER_SHA, LOGIN_ENTRY_TIMING_TARGET_SHA: UPPER_SHA }],
  ['an abbreviated commit', { COMMIT_SHA: SHORT_SHA, LOGIN_ENTRY_TIMING_TARGET_SHA: SHORT_SHA }],
  ['a missing issuedAt', { LOGIN_ENTRY_TIMING_ISSUED_AT: undefined }],
  ['a missing expiresAt', { LOGIN_ENTRY_TIMING_EXPIRES_AT: undefined }],
  ['an empty window', { LOGIN_ENTRY_TIMING_EXPIRES_AT: String(ISSUED_AT) }],
  ['a reversed window', { LOGIN_ENTRY_TIMING_EXPIRES_AT: String(ISSUED_AT - 1) }],
  ['a window over one hour', { LOGIN_ENTRY_TIMING_EXPIRES_AT: String(ISSUED_AT + 3_600_001) }],
  ...NON_STRICT_EPOCHS.flatMap<readonly [string, EnvOverrides]>(value => [
    [`issuedAt ${JSON.stringify(value)}`, { LOGIN_ENTRY_TIMING_ISSUED_AT: value }],
    [`expiresAt ${JSON.stringify(value)}`, { LOGIN_ENTRY_TIMING_EXPIRES_AT: value }],
  ]),
];

const STATIC_DISABLED_CASES: ReadonlyArray<{ name: string; env: LoginEntryTimingEnv }> = [
  { name: 'an unconfigured environment', env: {} },
  ...DISABLED_OVERRIDES.map(([name, overrides]) => ({ name, env: activeEnv(overrides) })),
];

describe('createLoginEntryTiming activation', () => {
  it.each(STATIC_DISABLED_CASES)('fails closed for $name without a clock or log', ({ env }) => {
    const h = harness({ env });
    expect(h.timing).toBe(DISABLED);
    expect(h.timing.begin('session')).toBe(DISABLED.begin('translations'));
    exercise(h.timing);
    expect(h.epochNow).not.toHaveBeenCalled();
    expect(h.now).not.toHaveBeenCalled();
    expect(h.log).not.toHaveBeenCalled();
  });
  it.each([
    { name: 'an issuedAt in the future', epoch: () => ISSUED_AT - 1 },
    { name: 'the exact expiry instant', epoch: () => ISSUED_AT + WINDOW_MS },
    { name: 'a later instant', epoch: () => ISSUED_AT + WINDOW_MS + 1 },
    { name: 'a non-finite epoch clock', epoch: () => Number.NaN },
    {
      name: 'a throwing epoch clock',
      epoch: (): number => {
        throw new Error('epoch');
      },
    },
  ])('fails closed at $name', ({ epoch }) => {
    const h = harness({ epoch });
    expect(h.timing).toBe(DISABLED);
    exercise(h.timing);
    expect(h.epochNow).toHaveBeenCalledTimes(1);
    expect(h.now).not.toHaveBeenCalled();
    expect(h.log).not.toHaveBeenCalled();
  });
  it('fails closed without throwing when the environment cannot be read', () => {
    const env = new Proxy(
      {},
      {
        get() {
          throw new Error('env');
        },
      }
    ) as LoginEntryTimingEnv;
    expect(() => createLoginEntryTiming({ env })).not.toThrow();
    expect(createLoginEntryTiming({ env })).toBe(DISABLED);
  });
  it.each([
    { name: 'at issuedAt', env: activeEnv(), epoch: () => ISSUED_AT },
    { name: 'just before expiry', env: activeEnv(), epoch: () => ISSUED_AT + WINDOW_MS - 1 },
    { name: 'inside a full one-hour window', env: HOUR_ENV, epoch: () => ISSUED_AT + 3_599_999 },
  ])('activates $name and accepts legitimate zero durations', ({ env, epoch }) => {
    const h = harness({ env, epoch, clock: [0, 0, 0, 0] });
    expect(h.timing).not.toBe(DISABLED);
    exercise(h.timing);
    expect(h.log).toHaveBeenCalledExactlyOnceWith(
      line({
        entry_ms: 0,
        session_ms: 0,
        session_found: true,
        redirect_requested: true,
        entry_returned: true,
      })
    );
  });
});

describe('createLoginEntryTiming recording', () => {
  it('logs one fixed-order record for every finished phase', () => {
    const h = harness({ clock: [100, 110, 135.5, 140, 150, 151, 151, 160] });
    const endSession = h.timing.begin('session');
    endSession();
    h.timing.sessionResolved(false);
    const endTenantContext = h.timing.begin('tenant_context');
    endTenantContext();
    const endTranslations = h.timing.begin('translations');
    endTranslations();
    h.timing.mark('entry_returned');
    h.timing.finishOnce();
    expect(h.log).toHaveBeenCalledExactlyOnceWith(
      line({
        entry_ms: 60,
        session_ms: 25.5,
        tenant_context_ms: 10,
        translations_ms: 0,
        session_found: false,
        entry_returned: true,
      })
    );
  });
  it('omits unfinished, backward and non-finite measurements instead of faking zero', () => {
    const h = harness({ clock: [100, 120, 110, Number.NaN, 130, Number.POSITIVE_INFINITY] });
    h.timing.begin('session')();
    h.timing.begin('tenant_context')();
    h.timing.begin('translations');
    h.timing.finishOnce();
    expect(h.log).toHaveBeenCalledExactlyOnceWith(line());
  });
  it('keeps measuring phases when an individual clock read throws', () => {
    const reads = sequence([5, 7, 9]);
    let first = true;
    const h = harness({
      now: () => {
        if (first) {
          first = false;
          throw new Error('clock');
        }
        return reads();
      },
    });
    h.timing.begin('session')();
    h.timing.finishOnce();
    expect(h.log).toHaveBeenCalledExactlyOnceWith(line({ session_ms: 2 }));
  });
  it('seals before logging and ignores every later call', () => {
    const h = harness({ clock: [0, 1, 4] });
    const endSession = h.timing.begin('session');
    h.timing.finishOnce();
    endSession();
    h.timing.sessionResolved(true);
    h.timing.mark('entry_returned');
    h.timing.begin('translations')();
    h.timing.finishOnce();
    expect(h.log).toHaveBeenCalledExactlyOnceWith(line({ entry_ms: 4 }));
    expect(h.now).toHaveBeenCalledTimes(3);
  });
  it('finishes each phase once and never overwrites an observed value', () => {
    const h = harness({ clock: [0, 10, 15, 20] });
    const endSession = h.timing.begin('session');
    endSession();
    endSession();
    h.timing.begin('session')();
    h.timing.sessionResolved(true);
    h.timing.sessionResolved(false);
    h.timing.finishOnce();
    expect(h.log).toHaveBeenCalledExactlyOnceWith(
      line({ entry_ms: 20, session_ms: 5, session_found: true })
    );
  });

  it('admits no free-form phase, mark or outcome into the schema', () => {
    const h = harness({ clock: [0, 3] });
    expect(h.timing.begin('database' as never)).toBe(DISABLED.finishOnce);
    h.timing.mark('user_id' as never);
    h.timing.sessionResolved('member' as never);
    h.timing.finishOnce();
    expect(h.log).toHaveBeenCalledExactlyOnceWith(line({ entry_ms: 3 }));
  });

  it('never throws when the logger throws and still logs only once', () => {
    const h = harness({
      clock: [0, 1],
      log: () => {
        throw new Error('log');
      },
    });
    expect(() => h.timing.finishOnce()).not.toThrow();
    expect(() => h.timing.finishOnce()).not.toThrow();
    expect(h.log).toHaveBeenCalledTimes(1);
  });

  it('keeps concurrent recorders isolated', () => {
    const a = harness({ clock: [0, 2, 9, 10] });
    const b = harness({ clock: [100, 101, 150] });
    const endA = a.timing.begin('session');
    const endB = b.timing.begin('session');
    b.timing.sessionResolved(true);
    b.timing.mark('redirect_requested');
    endA();
    a.timing.sessionResolved(false);
    b.timing.finishOnce();
    endB();
    a.timing.finishOnce();
    expect(a.log).toHaveBeenCalledExactlyOnceWith(
      line({ entry_ms: 10, session_ms: 7, session_found: false })
    );
    expect(b.log).toHaveBeenCalledExactlyOnceWith(
      line({ entry_ms: 50, session_found: true, redirect_requested: true })
    );
  });

  it('defaults to the monotonic performance clock and one console.info line', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const dateNow = vi.spyOn(Date, 'now');
    try {
      const issuedAt = Math.floor(performance.timeOrigin + performance.now()) - 1_000;
      const timing = createLoginEntryTiming({
        env: activeEnv({
          LOGIN_ENTRY_TIMING_ISSUED_AT: String(issuedAt),
          LOGIN_ENTRY_TIMING_EXPIRES_AT: String(issuedAt + WINDOW_MS),
        }),
      });
      timing.begin('translations')();
      timing.finishOnce();
      expect(info).toHaveBeenCalledTimes(1);
      const record = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<string, unknown>;
      expect(Object.keys(record)).toEqual(['event', 'v', 'entry_ms', 'translations_ms']);
      expect(record).toMatchObject({ event: 'login_entry_timing', v: 1 });
      expect(record['entry_ms']).toBeGreaterThanOrEqual(0);
      expect(record['translations_ms']).toBeGreaterThanOrEqual(0);
      expect(dateNow).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      dateNow.mockRestore();
    }
  });
});
