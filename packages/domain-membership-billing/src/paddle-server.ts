import { Environment, Paddle } from '@paddle/paddle-node-sdk';

export type BillingTenantId = 'tenant_ks' | 'tenant_mk' | 'tenant_al';
export type BillingEntity = 'ks' | 'mk' | 'al';

const LEGACY_PADDLE_API_KEY_ENV = 'PADDLE_API_KEY';
const LEGACY_PADDLE_WEBHOOK_SECRET_ENV = 'PADDLE_WEBHOOK_SECRET_KEY';
const DEFAULT_BILLING_ENTITY_ENV = 'PADDLE_DEFAULT_BILLING_ENTITY';
const PUBLIC_BILLING_ENTITY_ENV = 'NEXT_PUBLIC_PADDLE_BILLING_ENTITY';
const LEGACY_PUBLIC_PADDLE_CLIENT_TOKEN_ENV = 'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN';
const LEGACY_PUBLIC_STANDARD_PRICE_ENV = 'NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR';
const LEGACY_PUBLIC_FAMILY_PRICE_ENV = 'NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR';
const LEGACY_PUBLIC_BUSINESS_PRICE_ENV = 'NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR';

type BillingEntityEnvVars = {
  apiKey: string;
  webhookSecret: string;
};

type PublicBillingEntityEnvVars = {
  clientToken: string;
  standardYearPriceId: string;
  familyYearPriceId: string;
  businessYearPriceId: string;
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

export type PublicBillingCheckoutConfig = {
  entity: BillingEntity;
  tenantId: BillingTenantId;
  environment: 'sandbox' | 'production';
  clientToken: string;
  priceIds: {
    standardYear: string;
    familyYear: string;
    businessYear: string | null;
  };
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

const PUBLIC_BILLING_ENTITY_ENV_VARS: Record<BillingEntity, PublicBillingEntityEnvVars> = {
  ks: {
    clientToken: 'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_KS',
    standardYearPriceId: 'NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR_KS',
    familyYearPriceId: 'NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR_KS',
    businessYearPriceId: 'NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR_KS',
  },
  mk: {
    clientToken: 'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_MK',
    standardYearPriceId: 'NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR_MK',
    familyYearPriceId: 'NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR_MK',
    businessYearPriceId: 'NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR_MK',
  },
  al: {
    clientToken: 'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN_AL',
    standardYearPriceId: 'NEXT_PUBLIC_PADDLE_PRICE_STANDARD_YEAR_AL',
    familyYearPriceId: 'NEXT_PUBLIC_PADDLE_PRICE_FAMILY_YEAR_AL',
    businessYearPriceId: 'NEXT_PUBLIC_PADDLE_PRICE_BUSINESS_YEAR_AL',
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
    process.env.VERCEL_ENV === 'production' || process.env.NEXT_PUBLIC_PADDLE_ENV === 'production'
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

function resolvePublicPaddleEnvironment(): 'sandbox' | 'production' {
  return resolvePaddleEnvironment() === Environment.production ? 'production' : 'sandbox';
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

function resolveConfiguredPublicBillingEntity(): BillingEntity | null {
  return resolveBillingEntityFromPathSegment(getOptionalEnv(PUBLIC_BILLING_ENTITY_ENV));
}

function resolveConfiguredDefaultBillingEntity(): BillingEntity | null {
  return resolveBillingEntityFromPathSegment(getOptionalEnv(DEFAULT_BILLING_ENTITY_ENV));
}

function resolvePublicCheckoutValue(primaryEnvVar: string, fallbackEnvVar?: string): string | null {
  const primaryValue = getOptionalEnv(primaryEnvVar);
  if (primaryValue) {
    return primaryValue;
  }

  if (!fallbackEnvVar || isProductionLikeBillingMode()) {
    return null;
  }

  return getOptionalEnv(fallbackEnvVar) ?? null;
}

function resolvePublicCheckoutEntity(): BillingEntity {
  const publicEntity = resolveConfiguredPublicBillingEntity();
  const defaultEntity = resolveConfiguredDefaultBillingEntity();

  if (isProductionLikeBillingMode()) {
    assertPublicBillingEntityAlignment();
  }

  return publicEntity ?? defaultEntity ?? 'ks';
}

export function assertPublicBillingEntityAlignment(): void {
  const publicEntity = resolveConfiguredPublicBillingEntity();
  const defaultEntity = resolveConfiguredDefaultBillingEntity();

  if (!isProductionLikeBillingMode()) {
    return;
  }

  if (!publicEntity || !defaultEntity || publicEntity !== defaultEntity) {
    throw new Error(
      'Public Paddle billing entity must match PADDLE_DEFAULT_BILLING_ENTITY in production-like mode.'
    );
  }
}

export function getPublicBillingCheckoutConfig(): PublicBillingCheckoutConfig {
  const entity = resolvePublicCheckoutEntity();
  const publicEnvVars = PUBLIC_BILLING_ENTITY_ENV_VARS[entity];
  const clientToken = resolvePublicCheckoutValue(
    publicEnvVars.clientToken,
    LEGACY_PUBLIC_PADDLE_CLIENT_TOKEN_ENV
  );
  const standardYear = resolvePublicCheckoutValue(
    publicEnvVars.standardYearPriceId,
    LEGACY_PUBLIC_STANDARD_PRICE_ENV
  );
  const familyYear = resolvePublicCheckoutValue(
    publicEnvVars.familyYearPriceId,
    LEGACY_PUBLIC_FAMILY_PRICE_ENV
  );
  const businessYear = resolvePublicCheckoutValue(
    publicEnvVars.businessYearPriceId,
    LEGACY_PUBLIC_BUSINESS_PRICE_ENV
  );

  const missingEnv: string[] = [];
  if (!clientToken) {
    missingEnv.push(publicEnvVars.clientToken);
  }
  if (!standardYear) {
    missingEnv.push(publicEnvVars.standardYearPriceId);
  }
  if (!familyYear) {
    missingEnv.push(publicEnvVars.familyYearPriceId);
  }
  if (missingEnv.length > 0) {
    throw new Error(
      `Missing public Paddle checkout configuration for entity ${entity}. Missing env: ${missingEnv.join(', ')}`
    );
  }

  if (standardYear === familyYear) {
    throw new Error(
      'Public self-serve Paddle price ids must be distinct for the resolved billing entity.'
    );
  }

  return {
    entity,
    tenantId: resolveBillingTenantIdForEntity(entity),
    environment: resolvePublicPaddleEnvironment(),
    clientToken: clientToken as string,
    priceIds: {
      standardYear: standardYear as string,
      familyYear: familyYear as string,
      businessYear,
    },
  };
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

export type PaddleEntityContext = {
  paddle: Paddle;
  config: BillingEntityConfig;
};

export function getPaddleAndConfigForEntity(
  entity: BillingEntity,
  options: ResolveBillingEntityConfigOptions = {}
): PaddleEntityContext {
  const config = resolveBillingEntityConfig(entity, options);
  const environment = resolvePaddleEnvironment();
  const cacheKey = buildPaddleClientCacheKey(config, environment);
  const existing = paddleEntityClients.get(entity);

  if (existing && existing.cacheKey === cacheKey) {
    return {
      paddle: existing.client,
      config,
    };
  }

  const paddle = new Paddle(config.apiKey, {
    environment,
  });
  paddleEntityClients.set(entity, { cacheKey, client: paddle });

  return {
    paddle,
    config,
  };
}

export function getPaddleForEntity(
  entity: BillingEntity,
  options: ResolveBillingEntityConfigOptions = {}
): Paddle {
  const { paddle } = getPaddleAndConfigForEntity(entity, options);
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
