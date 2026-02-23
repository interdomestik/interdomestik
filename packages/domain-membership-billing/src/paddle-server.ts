import { Environment, Paddle } from '@paddle/paddle-node-sdk';

export type BillingTenantId = 'tenant_ks' | 'tenant_mk' | 'tenant_al';
export type BillingEntity = 'ks' | 'mk' | 'al';

const LEGACY_PADDLE_API_KEY_ENV = 'PADDLE_API_KEY';
const LEGACY_PADDLE_WEBHOOK_SECRET_ENV = 'PADDLE_WEBHOOK_SECRET_KEY';
const DEFAULT_BILLING_ENTITY_ENV = 'PADDLE_DEFAULT_BILLING_ENTITY';

type BillingEntityEnvVars = {
  apiKey: string;
  webhookSecret: string;
};

type ResolveBillingEntityConfigOptions = {
  allowLegacyFallback?: boolean;
};

export type GetPaddleOptions = ResolveBillingEntityConfigOptions & {
  tenantId?: string | null;
  entity?: string | null;
};

export type BillingEntityConfig = {
  // Sensitive: never log this object directly (contains secrets).
  entity: BillingEntity;
  tenantId: BillingTenantId;
  apiKey: string;
  webhookSecret: string;
  apiKeyEnvVar: string;
  webhookSecretEnvVar: string;
  source: 'entity' | 'legacy-fallback';
};

const BILLING_ENTITY_BY_TENANT: Record<BillingTenantId, BillingEntity> = {
  tenant_ks: 'ks',
  tenant_mk: 'mk',
  tenant_al: 'al',
};

const BILLING_TENANT_BY_ENTITY: Record<BillingEntity, BillingTenantId> = {
  ks: 'tenant_ks',
  mk: 'tenant_mk',
  al: 'tenant_al',
};

const BILLING_ENTITY_ENV_VARS: Record<BillingEntity, BillingEntityEnvVars> = {
  ks: {
    apiKey: 'PADDLE_API_KEY_KS',
    webhookSecret: 'PADDLE_WEBHOOK_SECRET_KEY_KS',
  },
  mk: {
    apiKey: 'PADDLE_API_KEY_MK',
    webhookSecret: 'PADDLE_WEBHOOK_SECRET_KEY_MK',
  },
  al: {
    apiKey: 'PADDLE_API_KEY_AL',
    webhookSecret: 'PADDLE_WEBHOOK_SECRET_KEY_AL',
  },
};

const BILLING_ENTITIES: readonly BillingEntity[] = ['ks', 'mk', 'al'];
const BILLING_TENANTS: readonly BillingTenantId[] = ['tenant_ks', 'tenant_mk', 'tenant_al'];

type PaddleClientCacheEntry = {
  cacheKey: string;
  client: Paddle;
};

const paddleEntityClients = new Map<BillingEntity, PaddleClientCacheEntry>();

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function isBillingEntity(value: string): value is BillingEntity {
  return (BILLING_ENTITIES as readonly string[]).includes(value);
}

function isBillingTenantId(value: string): value is BillingTenantId {
  return (BILLING_TENANTS as readonly string[]).includes(value);
}

function isProductionLikeBillingMode(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.NEXT_PUBLIC_PADDLE_ENV === 'production'
  );
}

function shouldAllowLegacyFallback(options: ResolveBillingEntityConfigOptions): boolean {
  if (options.allowLegacyFallback !== undefined) {
    return options.allowLegacyFallback;
  }
  return !isProductionLikeBillingMode();
}

function resolvePaddleEnvironment(): Environment {
  const value = getOptionalEnv('NEXT_PUBLIC_PADDLE_ENV');
  // The env var is string-based; map known values to SDK Environment values explicitly.
  if (!value || value === 'sandbox') {
    return Environment.sandbox;
  }
  if (value === 'production') {
    return Environment.production;
  }
  throw new Error(`NEXT_PUBLIC_PADDLE_ENV must be "sandbox" or "production", received "${value}".`);
}

export function resolveBillingEntityFromPathSegment(
  value: string | null | undefined
): BillingEntity | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return isBillingEntity(normalized) ? normalized : null;
}

export function resolveBillingEntityForTenantId(
  tenantId: string | null | undefined
): BillingEntity | null {
  if (!tenantId || !isBillingTenantId(tenantId)) return null;
  return BILLING_ENTITY_BY_TENANT[tenantId];
}

export function resolveBillingTenantIdForEntity(entity: BillingEntity): BillingTenantId {
  return BILLING_TENANT_BY_ENTITY[entity];
}

export function resolveBillingEntityConfig(
  entity: BillingEntity,
  options: ResolveBillingEntityConfigOptions = {}
): BillingEntityConfig {
  const envVars = BILLING_ENTITY_ENV_VARS[entity];
  const apiKey = getOptionalEnv(envVars.apiKey);
  const webhookSecret = getOptionalEnv(envVars.webhookSecret);

  if (apiKey && webhookSecret) {
    return {
      entity,
      tenantId: resolveBillingTenantIdForEntity(entity),
      apiKey,
      webhookSecret,
      apiKeyEnvVar: envVars.apiKey,
      webhookSecretEnvVar: envVars.webhookSecret,
      source: 'entity',
    };
  }

  const allowLegacyFallback = shouldAllowLegacyFallback(options);
  if (allowLegacyFallback) {
    const fallbackApiKey = getOptionalEnv(LEGACY_PADDLE_API_KEY_ENV);
    const fallbackWebhookSecret = getOptionalEnv(LEGACY_PADDLE_WEBHOOK_SECRET_ENV);
    if (fallbackApiKey && fallbackWebhookSecret) {
      return {
        entity,
        tenantId: resolveBillingTenantIdForEntity(entity),
        apiKey: fallbackApiKey,
        webhookSecret: fallbackWebhookSecret,
        apiKeyEnvVar: LEGACY_PADDLE_API_KEY_ENV,
        webhookSecretEnvVar: LEGACY_PADDLE_WEBHOOK_SECRET_ENV,
        source: 'legacy-fallback',
      };
    }
  }

  const missingEnvVars: string[] = [];
  if (!apiKey) {
    missingEnvVars.push(envVars.apiKey);
  }
  if (!webhookSecret) {
    missingEnvVars.push(envVars.webhookSecret);
  }
  const missingEnv = missingEnvVars.join(', ');
  const mode = isProductionLikeBillingMode() ? 'production-like mode' : 'non-production mode';
  const fallbackHint = allowLegacyFallback
    ? ' Set entity-scoped values or set PADDLE_API_KEY + PADDLE_WEBHOOK_SECRET_KEY for explicit local fallback.'
    : ' Legacy fallback is disabled in production-like mode.';

  throw new Error(
    `Missing billing configuration for entity ${entity}. Missing env: ${missingEnv} (${mode}).${fallbackHint}`
  );
}

export function assertBillingEntityEnvConfigured(
  options: ResolveBillingEntityConfigOptions = {}
): void {
  for (const entity of BILLING_ENTITIES) {
    resolveBillingEntityConfig(entity, options);
  }
}

function resolveRequestedBillingEntity(options: GetPaddleOptions): BillingEntity {
  const entityFromOption = resolveBillingEntityFromPathSegment(options.entity);
  if (options.entity !== undefined && options.entity !== null && !entityFromOption) {
    throw new Error(
      `Unknown billing entity "${options.entity}". Expected one of: ${BILLING_ENTITIES.join(', ')}`
    );
  }
  if (entityFromOption) {
    return entityFromOption;
  }

  const entityFromTenant = resolveBillingEntityForTenantId(options.tenantId);
  if (options.tenantId !== undefined && options.tenantId !== null && !entityFromTenant) {
    throw new Error(
      `Unknown billing tenant "${options.tenantId}". Expected one of: ${BILLING_TENANTS.join(', ')}`
    );
  }
  if (entityFromTenant) {
    return entityFromTenant;
  }

  const defaultEntity = resolveBillingEntityFromPathSegment(
    getOptionalEnv(DEFAULT_BILLING_ENTITY_ENV)
  );
  if (defaultEntity) {
    return defaultEntity;
  }

  if (isProductionLikeBillingMode()) {
    throw new Error(
      `Unable to resolve billing entity. Provide tenant/entity context or set ${DEFAULT_BILLING_ENTITY_ENV}.`
    );
  }

  return 'ks';
}

function buildPaddleClientCacheKey(config: BillingEntityConfig, environment: Environment): string {
  return `${environment}:${config.apiKey}`;
}

export function resetPaddleClientCacheForTests(): void {
  paddleEntityClients.clear();
}

export function getPaddleForEntity(
  entity: BillingEntity,
  options: ResolveBillingEntityConfigOptions = {}
): Paddle {
  const config = resolveBillingEntityConfig(entity, options);
  const environment = resolvePaddleEnvironment();
  const cacheKey = buildPaddleClientCacheKey(config, environment);
  const existing = paddleEntityClients.get(entity);

  if (existing && existing.cacheKey === cacheKey) {
    return existing.client;
  }

  const paddle = new Paddle(config.apiKey, {
    environment,
  });
  paddleEntityClients.set(entity, { cacheKey, client: paddle });
  return paddle;
}

export function getPaddle(options: GetPaddleOptions = {}): Paddle {
  const allowLegacyFallback = shouldAllowLegacyFallback(options);

  if (!allowLegacyFallback) {
    assertBillingEntityEnvConfigured({ allowLegacyFallback: false });
  }

  const entity = resolveRequestedBillingEntity(options);
  return getPaddleForEntity(entity, { allowLegacyFallback });
}
