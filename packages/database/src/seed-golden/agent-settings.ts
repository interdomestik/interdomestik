import { inArray } from 'drizzle-orm';
import { goldenId } from '../seed-utils/seed-ids';
import { TENANTS } from './constants';
import type { SeedGoldenContext } from './types';

export function buildAgentSettingsToSeed() {
  return [
    { agentId: 'ks_agent_a1', tenantId: TENANTS.KS, tier: 'pro' },
    { agentId: 'mk_agent_a1', tenantId: TENANTS.MK, tier: 'pro' },
    { agentId: 'ks_b_agent_1', tenantId: TENANTS.KS, tier: 'office' },
    { agentId: 'ks_c_agent_1', tenantId: TENANTS.KS, tier: 'pro' },
    { agentId: 'agent_balkan_1', tenantId: TENANTS.MK, tier: 'office' },
  ];
}

export async function seedAgentSettings({ at, db, schema }: SeedGoldenContext) {
  console.log('⚙️ Seeding Agent Settings...');
  const agentSettingsTargets = buildAgentSettingsToSeed();

  await db.delete(schema.agentSettings).where(
    inArray(
      schema.agentSettings.agentId,
      agentSettingsTargets.map(t => goldenId(t.agentId))
    )
  );

  await db.insert(schema.agentSettings).values(
    agentSettingsTargets.map(t => ({
      id: goldenId(`${t.agentId}_settings`),
      tenantId: t.tenantId,
      agentId: goldenId(t.agentId),
      tier: t.tier,
      commissionRates: { standard: 15.0 },
      status: 'active',
      createdAt: at(),
      updatedAt: at(),
    })) as any
  );
}
