import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Force load .env from project root
dotenv.config({ path: resolve(__dirname, '../../../.env') });

async function seedPlans() {
  console.log('🌱 Seeding membership plans...');

  const DEFAULT_TENANT_ID = 'tenant_mk';

  // Use dynamic import to ensure env vars are loaded first
  const { db } = await import('./db');
  const { membershipPlans } = await import('./schema');

  const plans = [
    {
      id: 'standard',
      tenantId: DEFAULT_TENANT_ID,
      name: 'Standard',
      description: 'Complete protection for individuals',
      tier: 'standard' as const,
      interval: 'year',
      price: '20.00',
      currency: 'EUR',
      membersIncluded: 1,
      legalConsultationsPerYear: 999, // Unlimited
      mediationDiscountPercent: 50,
      successFeePercent: 15,
      features: [
        '24/7 Emergency Hotline',
        'Unlimited Legal Consultations',
        'Damage Calculator Access',
        'Expert Guides & Checklists',
        '50% Mediation Fee Discount',
        'Company Advances Costs',
      ],
      isActive: true,
    },
    {
      id: 'family',
      tenantId: DEFAULT_TENANT_ID,
      name: 'Family',
      description: 'Protection for the whole household',
      tier: 'family' as const,
      interval: 'year',
      price: '35.00',
      currency: 'EUR',
      membersIncluded: 5,
      legalConsultationsPerYear: 999, // Unlimited
      mediationDiscountPercent: 50,
      successFeePercent: 15,
      features: [
        'Everything in Standard',
        'Covers up to 5 family members',
        'Digital Cards for all members',
        'Shared Dashboard',
      ],
      isActive: true,
    },
    {
      id: 'basic',
      tenantId: DEFAULT_TENANT_ID,
      name: 'Bazik',
      description: 'Essential protection for individuals',
      tier: 'basic' as const,
      interval: 'year',
      price: '15.00',
      currency: 'EUR',
      membersIncluded: 1,
      legalConsultationsPerYear: 2,
      mediationDiscountPercent: 25,
      successFeePercent: 15,
      features: [
        '24/7 Emergency Hotline',
        '2 Legal Consultations per year',
        'Damage Calculator Access',
        'Expert Guides & Checklists',
        '25% Mediation Fee Discount',
      ],
      isActive: true,
    },
  ];

  for (const plan of plans) {
    await db
      .insert(membershipPlans)
      .values(plan)
      .onConflictDoUpdate({
        target: membershipPlans.id,
        set: {
          name: plan.name,
          description: plan.description,
          price: plan.price,
          features: plan.features,
          tier: plan.tier,
          membersIncluded: plan.membersIncluded,
          mediationDiscountPercent: plan.mediationDiscountPercent,
        },
      });
  }

  console.log('✅ Membership plans seeded successfully!');
  process.exit(0);
}

seedPlans().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
