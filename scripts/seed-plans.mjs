import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { fileURLToPath } from 'url';

// Load .env manually if not in env
if (!process.env.DATABASE_URL) {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.resolve(__dirname, '..');
    const envPath = path.resolve(projectRoot, '.env');

    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, 'utf8');
      envFile.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    }
  } catch (e) {
    // Ignore error
  }
}

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required to seed data');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function main() {
  console.log('🌱 Seeding Membership Plans...');

  const plans = [
    {
      id: 'standard',
      name: 'Standard',
      description: 'Complete Peace of Mind',
      tier: 'standard',
      price: 20.0,
      members_included: 1,
      legal_consultations_per_year: null, // Unlimited
      mediation_discount_percent: 50,
      success_fee_percent: 15,
      features: JSON.stringify([
        '24/7 Hotline',
        'Unlimited Consultations',
        'Damage Calculator',
        '50% Mediation Discount',
      ]),
      is_active: true,
    },
    {
      id: 'family',
      name: 'Familja',
      description: 'Whole Family, One Price',
      tier: 'family',
      price: 35.0,
      members_included: 5,
      legal_consultations_per_year: null, // Unlimited
      mediation_discount_percent: 50,
      success_fee_percent: 15,
      features: JSON.stringify([
        'Everything in Standard',
        'Up to 5 Members',
        'Digital Cards',
        'Shared Dashboard',
      ]),
      is_active: true,
    },
  ];

  for (const plan of plans) {
    await sql`
      INSERT INTO membership_plans (
        id, name, description, tier, price, "members_included",
        "legal_consultations_per_year", "mediation_discount_percent",
        "success_fee_percent", features, "is_active", "created_at", "updated_at"
      ) VALUES (
        ${plan.id}, ${plan.name}, ${plan.description}, ${plan.tier}, ${plan.price}, ${plan.members_included},
        ${plan.legal_consultations_per_year}, ${plan.mediation_discount_percent},
        ${plan.success_fee_percent}, ${plan.features}::jsonb, ${plan.is_active}, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = excluded.name,
        price = excluded.price,
        description = excluded.description,
        features = excluded.features,
        members_included = excluded.members_included,
        updated_at = NOW();
    `;
    console.log(`✅ Upserted plan: ${plan.name}`);
  }

  await sql.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
