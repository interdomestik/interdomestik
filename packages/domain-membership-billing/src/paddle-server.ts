import { Environment, Paddle } from '@paddle/paddle-node-sdk';

export type BillingTenantId = 'tenant_ks' | 'tenant_mk' | 'tenant_al';
export type BillingEntity = 'ks' | 'mk' | 'al';

type BillingEntityEnvVars = {
  apiKey: string;
  webhookSecret: string;
};

type ResolveBillingEntityConfigOptions = {
  allowLegacyFallback?: boolean;
};

export type BillingEntityConfig = {
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

let paddleClient: Paddle | null = null;
const paddleEntityClients = new Map<BillingEntity, Paddle>();

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`${name} is missing`);
  }
  return value;
}

function isBillingEntity(value: string): value is BillingEntity {
  return value === 'ks' || value === 'mk' || value === 'al';
}

function isBillingTenantId(value: string): value is BillingTenantId {
  return value === 'tenant_ks' || value === 'tenant_mk' || value === 'tenant_al';
}

function isProductionLikeBillingMode(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.NEXT_PUBLIC_PADDLE_ENV === Environment.production
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
  if (!value || value === Environment.sandbox) {
    return Environment.sandbox;
  }
  if (value === Environment.production) {
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
    const fallbackApiKey = getOptionalEnv('PADDLE_API_KEY');
    const fallbackWebhookSecret = getOptionalEnv('PADDLE_WEBHOOK_SECRET_KEY');
    if (fallbackApiKey && fallbackWebhookSecret) {
      return {
        entity,
        tenantId: resolveBillingTenantIdForEntity(entity),
        apiKey: fallbackApiKey,
        webhookSecret: fallbackWebhookSecret,
        apiKeyEnvVar: envVars.apiKey,
        webhookSecretEnvVar: envVars.webhookSecret,
        source: 'legacy-fallback',
      };
    }
  }

  const missingEnv = [
    !apiKey ? envVars.apiKey : null,
    !webhookSecret ? envVars.webhookSecret : null,
  ]
    .filter((name): name is string => Boolean(name))
    .join(', ');
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

export function getPaddleForEntity(
  entity: BillingEntity,
  options: ResolveBillingEntityConfigOptions = {}
): Paddle {
  const existing = paddleEntityClients.get(entity);
  if (existing) return existing;

  const config = resolveBillingEntityConfig(entity, options);
  const paddle = new Paddle(config.apiKey, {
    environment: resolvePaddleEnvironment(),
  });
  paddleEntityClients.set(entity, paddle);
  return paddle;
}

export function getPaddle(): Paddle {
  if (paddleClient) return paddleClient;

  if (isProductionLikeBillingMode()) {
    assertBillingEntityEnvConfigured({ allowLegacyFallback: false });
  }

  const apiKey = getRequiredEnv('PADDLE_API_KEY');
  const env = resolvePaddleEnvironment();

  paddleClient = new Paddle(apiKey, {
    environment: env,
  });

  return paddleClient;
}
