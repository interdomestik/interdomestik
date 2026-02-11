const path = require('node:path');

const DEFAULTS = {
  baseUrl: 'https://interdomestik-web.vercel.app',
  envName: 'production',
  locale: 'en',
  suite: 'all',
  outDir: path.join('docs', 'release-gates'),
};

const SUITES = {
  p0: ['P0.1', 'P0.2', 'P0.3', 'P0.4'],
  p1: ['P1.1', 'P1.2', 'P1.3', 'P1.5.1'],
  all: ['P0.1', 'P0.2', 'P0.3', 'P0.4', 'P1.1', 'P1.2', 'P1.3', 'P1.5.1'],
};

const ROUTES = {
  rbacTargets: ['member', 'agent', 'staff', 'admin'],
  memberDocuments: '/member/documents',
  staffClaimsList: '/staff/claims',
  defaultAdminUserUrl: '/admin/users/golden_ks_staff',
  crossTenantProbe: '/admin/users/golden_ks_staff?tenantId=tenant_ks',
};

const MARKERS = {
  member: 'dashboard-page-ready',
  agent: 'action-campaign',
  staff: 'staff-page-ready',
  admin: 'admin-page-ready',
  notFound: 'not-found-page',
};

const SELECTORS = {
  userRolesTable: '[data-testid="user-roles-table"]',
  roleSelectTrigger: '[data-testid="role-select-trigger"]',
  roleSelectContent: '[data-testid="role-select-content"]',
  grantRoleButtonName: /grant role/i,
  removeRoleButtonName: /remove/i,
  memberDocumentsUploadButtons: '[data-testid^="member-documents-upload-"]',
  staffClaimOpenButton: '[data-testid="staff-claims-view"]',
  staffClaimDetailReady: '[data-testid="staff-claim-detail-ready"]',
  staffClaimNote: '[data-testid="staff-claim-detail-note"]',
  staffClaimSection: '[data-testid="staff-claim-detail-claim"]',
  staffClaimActionPanel: '[data-testid="staff-claim-action-panel"]',
  fileInput: 'input[type="file"]',
  claimStatusSelectTrigger: '#claim-status-select',
  claimStatusNote: '#claim-status-note',
  claimStatusListbox: '[role="listbox"]',
  claimStatusOption: '[role="option"]',
  claimUpdateButtonName: /update claim/i,
  uploadDialogName: /upload evidence/i,
  uploadButtonName: /^upload$/i,
  downloadButtonName: /download/i,
  inlineViewButtonName: /view/i,
};

const TIMEOUTS = {
  marker: 12_000,
  quickMarker: 2_000,
  nav: 30_000,
  action: 10_000,
  upload: 45_000,
  download: 8_000,
};

const ROLE_IPS = {
  member: '10.0.0.11',
  agent: '10.0.0.13',
  staff: '10.0.0.14',
  admin: '10.0.0.12',
  admin_mk: '10.0.0.16',
};

const ACCOUNTS = {
  member: {
    key: 'member',
    roleMarker: 'member',
    emailVar: 'RELEASE_GATE_MEMBER_EMAIL',
    passwordVar: 'RELEASE_GATE_MEMBER_PASSWORD',
    label: 'Member-only',
  },
  agent: {
    key: 'agent',
    roleMarker: 'agent',
    emailVar: 'RELEASE_GATE_AGENT_EMAIL',
    passwordVar: 'RELEASE_GATE_AGENT_PASSWORD',
    label: 'Agent',
  },
  staff: {
    key: 'staff',
    roleMarker: 'staff',
    emailVar: 'RELEASE_GATE_STAFF_EMAIL',
    passwordVar: 'RELEASE_GATE_STAFF_PASSWORD',
    label: 'Staff',
  },
  admin_ks: {
    key: 'admin_ks',
    roleMarker: 'admin',
    emailVar: 'RELEASE_GATE_ADMIN_KS_EMAIL',
    passwordVar: 'RELEASE_GATE_ADMIN_KS_PASSWORD',
    label: 'Admin (KS)',
  },
  admin_mk: {
    key: 'admin_mk',
    roleMarker: 'admin',
    emailVar: 'RELEASE_GATE_ADMIN_MK_EMAIL',
    passwordVar: 'RELEASE_GATE_ADMIN_MK_PASSWORD',
    label: 'Admin (MK)',
  },
};

const REQUIRED_ENV_BY_SUITE = {
  p0: [
    ACCOUNTS.member.emailVar,
    ACCOUNTS.member.passwordVar,
    ACCOUNTS.agent.emailVar,
    ACCOUNTS.agent.passwordVar,
    ACCOUNTS.staff.emailVar,
    ACCOUNTS.staff.passwordVar,
    ACCOUNTS.admin_ks.emailVar,
    ACCOUNTS.admin_ks.passwordVar,
    ACCOUNTS.admin_mk.emailVar,
    ACCOUNTS.admin_mk.passwordVar,
  ],
  p1: [
    ACCOUNTS.member.emailVar,
    ACCOUNTS.member.passwordVar,
    ACCOUNTS.staff.emailVar,
    ACCOUNTS.staff.passwordVar,
  ],
  all: [
    ACCOUNTS.member.emailVar,
    ACCOUNTS.member.passwordVar,
    ACCOUNTS.agent.emailVar,
    ACCOUNTS.agent.passwordVar,
    ACCOUNTS.staff.emailVar,
    ACCOUNTS.staff.passwordVar,
    ACCOUNTS.admin_ks.emailVar,
    ACCOUNTS.admin_ks.passwordVar,
    ACCOUNTS.admin_mk.emailVar,
    ACCOUNTS.admin_mk.passwordVar,
  ],
};

const EXPECTED_VERCEL_LOG_NOISE = [
  /PortalAccess.*Authorization check failed/i,
  /Authorization check failed/i,
  /access denied/i,
  /forbidden/i,
  /insufficient permissions/i,
];

const FUNCTIONAL_LOG_ERROR_HINTS = [
  /upload/i,
  /signed upload/i,
  /storage/i,
  /supabase/i,
  /\b5\d\d\b/,
  /uncaught/i,
  /exception/i,
  /TypeError/i,
  /ReferenceError/i,
];

module.exports = {
  DEFAULTS,
  SUITES,
  ROUTES,
  MARKERS,
  SELECTORS,
  TIMEOUTS,
  ROLE_IPS,
  ACCOUNTS,
  REQUIRED_ENV_BY_SUITE,
  EXPECTED_VERCEL_LOG_NOISE,
  FUNCTIONAL_LOG_ERROR_HINTS,
};
