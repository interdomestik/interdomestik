const { ROUTES } = require('./config.ts');
const { buildRoute } = require('./shared.ts');

const SAFE_ROLE_PANEL_FALLBACK_PATHS = [
  '/admin/users/golden_ks_a_member_2?tenantId=tenant_ks',
  '/admin/users/golden_ks_a_member_3?tenantId=tenant_ks',
  '/admin/users/golden_ks_a_member_4?tenantId=tenant_ks',
  '/admin/users/golden_ks_a_member_5?tenantId=tenant_ks',
  '/admin/users/golden_ks_a_member_6?tenantId=tenant_ks',
];

function buildRolePanelDiscoveryUrls(runCtx, rolePanelTarget) {
  const urls = [rolePanelTarget.targetUrl];
  if (rolePanelTarget.source !== 'default' && !rolePanelTarget.allowFallbackDiscovery) {
    return urls;
  }

  const fallbackPaths = [ROUTES.defaultAdminUserUrl, ...SAFE_ROLE_PANEL_FALLBACK_PATHS];
  for (const routePath of fallbackPaths) {
    urls.push(buildRoute(runCtx.baseUrl, runCtx.locale, routePath));
  }

  return Array.from(new Set(urls));
}

module.exports = { buildRolePanelDiscoveryUrls };
