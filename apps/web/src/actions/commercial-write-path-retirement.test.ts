import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSource(relativePath: string) {
  return readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
}

describe('commercial write-path retirement', () => {
  it('routes migrated commercial callers directly to the canonical core server actions', () => {
    expect(readSource('app/[locale]/components/home/free-start-intake-shell.tsx')).toContain(
      "from '@/actions/free-start.core'"
    );
    expect(readSource('components/claims/claim-wizard.tsx')).toContain(
      "from '@/actions/claims.core'"
    );
    expect(readSource('components/dashboard/claims/claim-wizard.tsx')).toContain(
      "from '@/actions/claims.core'"
    );
    expect(readSource('components/staff/claim-action-panel.tsx')).toContain(
      "from '@/actions/staff-claims.core'"
    );
    expect(readSource('components/staff/claim-triage-notes.tsx')).toContain(
      "from '@/actions/staff-claims.core'"
    );
    expect(
      readSource('app/[locale]/(app)/member/membership/components/manage-subscription-button.tsx')
    ).toContain("from '@/actions/subscription.core'");
    expect(
      readSource('app/[locale]/(app)/member/membership/components/update-payment-button.tsx')
    ).toContain("from '@/actions/subscription.core'");
    expect(readSource('features/member/membership/components/MembershipOpsPage.tsx')).toContain(
      "from '@/actions/subscription.core'"
    );
  });

  it('removes the superseded commercial wrapper entrypoints', () => {
    expect(existsSync(path.join(SRC_ROOT, 'actions/free-start.ts'))).toBe(false);
    expect(existsSync(path.join(SRC_ROOT, 'actions/staff-claims.ts'))).toBe(false);
    expect(existsSync(path.join(SRC_ROOT, 'actions/subscription.ts'))).toBe(false);
    expect(existsSync(path.join(SRC_ROOT, 'actions/memberships.ts'))).toBe(false);

    expect(readSource('actions/claims.ts')).not.toContain('submitClaim');
  });
});
