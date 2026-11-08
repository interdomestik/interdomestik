import { sendMemberActivationInvite } from '@/lib/member-activation-invite';
import {
  coerceTenantId,
  preferredLocaleForTenant,
  resolveTenantAppOrigin,
} from '@/lib/tenant/tenant-hosts';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { sendEmail } from '@interdomestik/domain-communications/email';
import { renderSponsorMail } from '@interdomestik/domain-communications/sponsor-mail';
import type { SponsorMailDeps } from '@interdomestik/domain-membership-billing/sponsors/mail-sender';
import { readSponsorRosterSecret } from '@interdomestik/domain-membership-billing/sponsors/roster-crypto';
import { sponsorCredentialCheck } from '@interdomestik/domain-membership-billing/sponsors/sponsor-jobs';

const DEFAULT_SUPPORT_EMAIL = 'support@interdomestik.com';
// Every pilot tenant is in Central European time; term dates are shown as calendar dates there.
const DISPLAY_TIME_ZONE = 'Europe/Belgrade';

/**
 * The tenant's dependencies for the ACQ-3b sponsor mail sender (§3.8). Returns null when the tenant
 * has no app origin of this deployment; the roster secret is required and throws when missing, so
 * no opt-out link is ever built from an empty secret.
 */
export function sponsorMailDeps(
  tenantId: string,
  authority: TenantAuthority
): SponsorMailDeps | null {
  const tenant = coerceTenantId(tenantId);
  if (!tenant) return null;
  const locale = preferredLocaleForTenant(tenant);
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: DISPLAY_TIME_ZONE });
  return {
    secret: readSponsorRosterSecret(),
    locale,
    formatDate: date => dates.format(date),
    appUrl: resolveTenantAppOrigin(tenant),
    supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL,
    hasCredential: sponsorCredentialCheck(authority),
    sendMail: async (to, input) => {
      const result = await sendEmail(to, renderSponsorMail(input));
      return result.success ? { ok: true } : { ok: false, code: 'send_failed' };
    },
    sendActivation: async email => {
      const result = await sendMemberActivationInvite({ email, tenantId: tenant });
      return result.sent ? { ok: true } : { ok: false, code: result.reason };
    },
  };
}
