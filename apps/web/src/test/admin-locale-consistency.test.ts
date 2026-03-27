import mkAdminBranches from '@/messages/mk/admin-branches.json';
import mkAdminClaims from '@/messages/mk/admin-claims.json';
import mkAdminCommon from '@/messages/mk/admin-common.json';
import mkCommon from '@/messages/mk/common.json';
import sqAdminCommon from '@/messages/sq/admin-common.json';
import srAdminBranches from '@/messages/sr/admin-branches.json';
import srAdminClaims from '@/messages/sr/admin-claims.json';
import srAdminCommon from '@/messages/sr/admin-common.json';
import srCommon from '@/messages/sr/common.json';
import { describe, expect, it } from 'vitest';

describe('admin locale consistency', () => {
  it('provides claim detail handler labels for mk and sr', () => {
    expect(mkAdminClaims.admin.claims_page.filters.handler_label).toBeTruthy();
    expect(srAdminClaims.admin.claims_page.filters.handler_label).toBeTruthy();
  });

  it('provides no-results copy for mk and sr common bundles', () => {
    expect(mkCommon.common.no_results).toBeTruthy();
    expect(srCommon.common.no_results).toBeTruthy();
  });

  it('provides branch health and sort labels for mk and sr bundles', () => {
    expect(mkAdminBranches.admin.branches.sort.health_score_asc).toBeTruthy();
    expect(srAdminBranches.admin.branches.sort.health_score_asc).toBeTruthy();
    expect(mkAdminBranches.admin.branches.health.watch).toBeTruthy();
    expect(srAdminBranches.admin.branches.health.watch).toBeTruthy();
  });

  it('keeps the sidebar leads label aligned with payment verification', () => {
    expect(mkAdminCommon.admin.sidebar.leads).toContain('плаќа');
    expect(sqAdminCommon.admin.sidebar.leads).toContain('Pages');
    expect(srAdminCommon.admin.sidebar.leads).toContain('plać');
  });
});
