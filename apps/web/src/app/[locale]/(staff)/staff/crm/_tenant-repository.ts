import { createAdminCrmReportingTenantRepositories } from '@/app/[locale]/admin/crm/_reporting-tenant';

export function createStaffReportingReader(tenantId: string) {
  return createAdminCrmReportingTenantRepositories(tenantId).reportingRepository;
}
