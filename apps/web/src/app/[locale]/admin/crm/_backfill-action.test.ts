import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionSafe: vi.fn(),
  headers: vi.fn(async () => new Headers([['x-forwarded-for', '127.0.0.1']])),
  revalidatePath: vi.fn(),
  runCore: vi.fn(),
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionSafe,
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headers,
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));

vi.mock('./_backfill-core', () => ({
  runAdminCrmForecastBackfillOperatorCore: hoisted.runCore,
}));

import { LOCALES } from '@/i18n/locales';

import { triggerCrmForecastSnapshotBackfill } from './_backfill-action';

const input = {
  mode: 'dry_run' as const,
  request: {
    fromDate: '2026-05-14',
    tenantId: 'tenant-1',
    toDate: '2026-05-14',
  },
};

describe('triggerCrmForecastSnapshotBackfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionSafe.mockResolvedValue({
      user: {
        id: 'admin-1',
        role: 'admin',
        tenantId: 'tenant-1',
      },
    });
  });

  it('passes the session and request headers into the server core', async () => {
    hoisted.runCore.mockResolvedValue({ result: null, success: false, errorCode: 'unauthorized' });

    await triggerCrmForecastSnapshotBackfill(input);

    expect(hoisted.getSessionSafe).toHaveBeenCalledWith('AdminCrmForecastBackfillOperatorAction');
    expect(hoisted.runCore).toHaveBeenCalledWith(
      {
        input,
        session: {
          user: {
            id: 'admin-1',
            role: 'admin',
            tenantId: 'tenant-1',
          },
        },
      },
      { headers: expect.any(Headers) }
    );
  });

  it('revalidates admin CRM locale paths only after completed write mode', async () => {
    hoisted.runCore.mockResolvedValue({
      result: {
        mode: 'write',
        status: 'completed',
      },
      success: true,
    });

    await triggerCrmForecastSnapshotBackfill({ ...input, mode: 'write' });

    expect(hoisted.revalidatePath).toHaveBeenCalledTimes(LOCALES.length);
    for (const locale of LOCALES) {
      expect(hoisted.revalidatePath).toHaveBeenCalledWith(`/${locale}/admin/crm`);
    }
  });

  it('does not revalidate after dry-run mode', async () => {
    hoisted.runCore.mockResolvedValue({
      result: {
        mode: 'dry_run',
        status: 'completed',
      },
      success: true,
    });

    await triggerCrmForecastSnapshotBackfill(input);

    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });
});
