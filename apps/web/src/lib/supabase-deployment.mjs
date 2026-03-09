const DEPLOYMENT_ENVS = new Set(['preview', 'staging', 'production']);
const SUPABASE_HOST_SUFFIX = '.supabase.co';

function normalizeValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function resolveSupabaseDeploymentEnvironment(env = process.env) {
  const vercelEnv = normalizeValue(env.VERCEL_ENV);
  if (vercelEnv && DEPLOYMENT_ENVS.has(vercelEnv)) {
    return vercelEnv;
  }

  const explicitEnv = normalizeValue(env.INTERDOMESTIK_DEPLOY_ENV);
  if (explicitEnv && DEPLOYMENT_ENVS.has(explicitEnv)) {
    return explicitEnv;
  }

  return 'development';
}

export function extractSupabaseProjectRef(supabaseUrl) {
  if (typeof supabaseUrl !== 'string' || supabaseUrl.trim().length === 0) {
    return null;
  }

  try {
    const parsedUrl = new URL(supabaseUrl);
    const host = parsedUrl.hostname.toLowerCase();

    if (!host.endsWith(SUPABASE_HOST_SUFFIX)) {
      return null;
    }

    const projectRef = host.slice(0, -SUPABASE_HOST_SUFFIX.length);
    return projectRef.length > 0 ? projectRef : null;
  } catch {
    return null;
  }
}

function formatEnvironmentLabel(deploymentEnvironment) {
  if (deploymentEnvironment === 'production') {
    return 'Production';
  }

  return deploymentEnvironment.charAt(0).toUpperCase() + deploymentEnvironment.slice(1);
}

export function validateSupabaseDeploymentSeparation(env = process.env) {
  const deploymentEnvironment = resolveSupabaseDeploymentEnvironment(env);

  if (deploymentEnvironment === 'development') {
    return;
  }

  const currentProjectRef = extractSupabaseProjectRef(
    env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL
  );
  const productionProjectRef = normalizeValue(env.SUPABASE_PRODUCTION_PROJECT_REF);
  const environmentLabel = formatEnvironmentLabel(deploymentEnvironment);

  if (!currentProjectRef) {
    throw new Error(
      `${environmentLabel} deployment must use a hosted Supabase project URL via NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL`
    );
  }

  if (!productionProjectRef) {
    throw new Error(
      `SUPABASE_PRODUCTION_PROJECT_REF must be configured for ${deploymentEnvironment} deployments`
    );
  }

  if (
    (deploymentEnvironment === 'preview' || deploymentEnvironment === 'staging') &&
    currentProjectRef === productionProjectRef
  ) {
    // Preview and staging must never reuse the production hosted Supabase project.
    throw new Error(
      `${environmentLabel} deployment cannot target the production Supabase project`
    );
  }

  if (deploymentEnvironment === 'production' && currentProjectRef !== productionProjectRef) {
    throw new Error('Production deployment must target the production Supabase project');
  }
}
