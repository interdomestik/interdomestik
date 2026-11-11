import 'server-only';

import { readActiveTenantId } from '@interdomestik/database';
import {
  PUBLIC_ONBOARDING_TENANTS,
  type PublicOnboardingTenant,
} from './anonymous-lead-classification';

/** Only the owner-approved pilot roster is eligible; activity is rechecked by each writer. */
export async function loadPublicOnboardingTenants(): Promise<PublicOnboardingTenant[]> {
  const active = await Promise.all(
    PUBLIC_ONBOARDING_TENANTS.map(async tenantId =>
      (await readActiveTenantId(tenantId)) === tenantId ? tenantId : null
    )
  );
  return active.filter((id): id is PublicOnboardingTenant => id !== null);
}
