import { cleanupByPrefixes } from '../seed-utils/cleanup';
import { hashPassword } from '../seed-utils/hash-password';
import { loadEnvFromRoot } from '../seed-utils/load-env';
import { packId } from '../seed-utils/seed-ids';
// Needed imports for sanity check
import { sql } from 'drizzle-orm';

// Force load .env
loadEnvFromRoot();

async function seedKsWorkflowPack() {
  console.log('🇽🇰 Seeding Kosovo Workflow Pack (Overlay)...');

  const { db } = await import('../db');
  const schema = await import('../schema');

  const TENANTS = {
    KS: 'tenant_ks',
  };

  // 1. Cleanup previous Pack Data specifically
  await cleanupByPrefixes(db, schema, ['pack_ks_'], false);

  // 2. Ensure Branches Exist (A/B/C)
  const BRANCHES = [
    {
      id: packId('ks', 'branch_a'),
      name: 'KS Prishtina Qendër',
      tenantId: TENANTS.KS,
      slug: 'ks-prishtina-main',
      code: 'KS-PRI-001', // URGENT target
    },
    {
      id: packId('ks', 'branch_b'),
      name: 'KS Prizren Perëndim',
      tenantId: TENANTS.KS,
      slug: 'ks-prizren-west',
      code: 'KS-PRZ-001', // ATTENTION target
    },
    {
      id: packId('ks', 'branch_c'),
      name: 'KS Peja Veri',
      tenantId: TENANTS.KS,
      slug: 'ks-peja-north',
      code: 'KS-PEJ-001', // HEALTHY target
    },
  ];

  console.log('🌿 Ensuring KS Branches...');
  await db
    .insert(schema.branches)
    .values(BRANCHES)
    .onConflictDoUpdate({
      target: schema.branches.id,
      set: { name: schema.branches.name, code: schema.branches.code },
    });

  // 3. Seed Users
  console.log('👥 Seeding Pack Users...');
  const PACK_PASSWORD = 'GoldenPass123!';
  const hashedPass = hashPassword(PACK_PASSWORD);

  const ALBANIAN_NAMES = [
    'Arianit Gashi',
    'Besa Krasniqi',
    'Driton Berisha',
    'Era Morina',
    'Faton Shala',
    'Genta Hoxha',
    'Ilir Bytyqi',
    'Jeta Kastrati',
    'Kushtrim Rexhepi',
    'Labeat Tolaj',
    'Mimoza Voca',
    'Nderim Zeka',
    'Orhidea Pula',
    'Pellumb Qerimi',
    'Qendresa Loku',
    'Rina Statovci',
    'Shpat Deda',
    'Teuta Rugova',
    'Urim Hyseni',
    'Vesa Luma',
    'Xhevdet Peci',
    'Yllka Kuqi',
    'Zana Avdiu',
    'Arber Zeqiri',
    'Blerta Ismaili',
  ];

  // Seed 25 members to cycle through
  const packUsers = [
    {
      id: packId('ks', 'staff_extra'),
      name: 'Agim Ramadani',
      email: 'staff.ks.extra@interdomestik.com',
      role: 'staff',
      tenantId: TENANTS.KS,
    },
    ...ALBANIAN_NAMES.map((name, i) => ({
      id: packId('ks', 'member', i + 1),
      name: name,
      email: `ks.member.pack.${i + 1}@interdomestik.com`,
      role: 'user',
      tenantId: TENANTS.KS,
    })),
  ];

  // Upsert users
  for (const u of packUsers) {
    await db
      .insert(schema.user)
      .values({
        ...u,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({ target: schema.user.id, set: { role: u.role, name: u.name } });

    await db
      .insert(schema.account)
      .values({
        id: `${u.id}-credential`,
        accountId: u.email,
        providerId: 'credential',
        userId: u.id,
        password: hashedPass,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({ target: schema.account.id, set: { password: hashedPass } });
  }

  // Helper to get random member ID
  const getPackMemberId = (idx: number) =>
    packId('ks', 'member', (idx % ALBANIAN_NAMES.length) + 1);

  // 4. Seeding Logic Helpers
  const CATEGORIES = ['vehicle', 'property', 'medical', 'travel', 'liability'] as const;
  const STATUSES = [
    'submitted',
    'submitted',
    'submitted',
    'verification',
    'evaluation',
    'evaluation',
    'negotiation',
    'resolved',
  ];

  const addEnrichment = async (
    claimId: string,
    mId: string,
    sId: string | null,
    date: Date,
    finalStatus: string
  ) => {
    // A. Add Documents
    const docs = [
      { name: 'repair_invoice_v1.pdf', type: 'application/pdf', cat: 'receipt' },
      { name: 'incident_photo.jpg', type: 'image/jpeg', cat: 'evidence' },
    ];
    for (const d of docs) {
      if (Math.random() > 0.4) {
        await db
          .insert(schema.claimDocuments)
          .values({
            id: `${claimId}-doc-${d.name}`,
            tenantId: TENANTS.KS,
            claimId,
            name: d.name,
            filePath: `seeding/ks/${d.name}`,
            fileType: d.type,
            fileSize: 250000,
            category: d.cat as any,
            uploadedBy: mId,
            createdAt: date,
          })
          .onConflictDoNothing();
      }
    }

    // B. Add Messages
    if (sId) {
      const messages = [
        { senderId: mId, content: 'Përshëndetje, po dërgoj kërkesën.', internal: false },
        { senderId: sId, content: 'Faleminderit. Jemi duke e procesuar.', internal: false },
        { senderId: sId, content: 'SHËNIM: Kontrolloni dokumentet shtesë.', internal: true },
      ];
      for (const [idx, msg] of messages.entries()) {
        await db
          .insert(schema.claimMessages)
          .values({
            id: `${claimId}-msg-${idx}`,
            tenantId: TENANTS.KS,
            claimId,
            senderId: msg.senderId,
            content: msg.content,
            isInternal: msg.internal,
            createdAt: new Date(date.getTime() + idx * 600000),
          })
          .onConflictDoNothing();
      }
    }

    // C. Add History
    const stages = ['draft', 'submitted', 'verification', 'evaluation', 'negotiation', 'resolved'];
    const finalIdx = stages.indexOf(finalStatus);
    if (finalIdx !== -1) {
      for (let i = 0; i <= finalIdx; i++) {
        await db
          .insert(schema.claimStageHistory)
          .values({
            id: `${claimId}-hist-${stages[i]}`,
            tenantId: TENANTS.KS,
            claimId,
            toStatus: stages[i] as any,
            fromStatus: i > 0 ? (stages[i - 1] as any) : null,
            changedById: sId || mId,
            createdAt: new Date(date.getTime() + i * 3600000),
            note: `Tranzicion automatik në ${stages[i]}`,
          })
          .onConflictDoNothing();
      }
    }
  };

  let globalClaimIdx = 0;
  const makeClaimNumber = (idx: number) =>
    `CLM-XK-2026-${(800000 + idx).toString().padStart(6, '0')}`;

  const randomItem = <T>(arr: T[] | readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const randomDatePast = (daysMax: number) => {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * daysMax));
    return d;
  };
  const randomAmount = () => (Math.random() * 2000 + 100).toFixed(2);

  const seedBranchClaims = async (branchId: string, count: number, prefix: string) => {
    const staffId = packId('ks', 'staff_extra');

    for (let i = 0; i < count; i++) {
      globalClaimIdx++;
      const status = randomItem(STATUSES);
      const category = randomItem(CATEGORIES);
      const createdAt = randomDatePast(60);
      const memberId = getPackMemberId(i);

      let title = '';
      let description = '';
      if (category === 'vehicle') {
        title = `Dëm Automjeti - ${randomItem(['BMW', 'Audi', 'VW', 'Mercedes'])}`;
        description =
          'Raportim i aksidentit rrugor me dëme materiale në pjesën e përparme të automjetit.';
      } else if (category === 'property') {
        title = `Dëm Pronë - ${randomItem(['Zjarri', 'Uji', 'Vjedhja'])}`;
        description =
          'Incident i raportuar në lokacionin e banimit. Kërkohet inspektim i menjëhershëm.';
      } else {
        title = `Kërkesë Rimbursimi #${globalClaimIdx}`;
        description =
          'Përshkrim i detajuar i kërkesës së rimbursimit për shpenzimet e bëra sipas policës.';
      }

      const claimId = packId('ks', 'claim', prefix, i);
      await db
        .insert(schema.claims)
        .values({
          id: claimId,
          userId: memberId,
          staffId: status !== 'submitted' ? staffId : null,
          tenantId: TENANTS.KS,
          branchId: branchId,
          claimNumber: makeClaimNumber(globalClaimIdx),
          status: status as any,
          title: title,
          description: description,
          category: category,
          companyName: 'Siguria Kosova',
          claimAmount: randomAmount(),
          currency: 'EUR',
          createdAt: createdAt,
          updatedAt: createdAt,
          statusUpdatedAt: createdAt,
        })
        .onConflictDoUpdate({
          target: schema.claims.id,
          set: {
            status: status as any,
            description,
            title,
            staffId: status !== 'submitted' ? staffId : null,
            updatedAt: createdAt,
          },
        });

      // Enrich 50% of claims for visual depth without slowing down seeding too much
      if (Math.random() > 0.5) {
        await addEnrichment(claimId, memberId, staffId, createdAt, status);
      }
    }
  };

  // === SEED BY BRANCH ===

  // 1. KS-A (Prishtina) - High Volume, Urgent
  console.log('🚨 Seeding KS Prishtina (High Volume)...');
  await seedBranchClaims(packId('ks', 'branch_a'), 45, 'ks_a'); // 45 Random claims

  // Specific SLA Breaches for KS-A
  for (let i = 0; i < 3; i++) {
    globalClaimIdx++;
    const days = 35 + i * 5;
    const date = new Date();
    date.setDate(date.getDate() - days);
    await db
      .insert(schema.claims)
      .values({
        id: packId('ks', 'claim', 'ks_a', 'sla', i),
        userId: getPackMemberId(i),
        tenantId: TENANTS.KS,
        branchId: packId('ks', 'branch_a'),
        claimNumber: makeClaimNumber(globalClaimIdx),
        status: 'submitted',
        title: `Vonesë Kritike SLA - ${days} ditë`,
        category: 'vehicle',
        companyName: 'Siguria Kosova',
        claimAmount: '2500.00',
        currency: 'EUR',
        createdAt: date,
      })
      .onConflictDoUpdate({
        target: schema.claims.id,
        set: { status: 'submitted', createdAt: date },
      });
  }

  // 2. KS-B (Prizren) - Medium Volume
  console.log('⚠️  Seeding KS Prizren (Medium Volume)...');
  await seedBranchClaims(packId('ks', 'branch_b'), 25, 'ks_b');

  // 3. KS-C (Peja) - Low Volume, Healthy
  console.log('✅ Seeding KS Peja (Low Volume)...');
  await seedBranchClaims(packId('ks', 'branch_c'), 10, 'ks_c');

  // === LEADS (Fixed) ===
  const LEAD_NAMES = [
    { first: 'Luan', last: 'Limani' },
    { first: 'Mimoza', last: 'Mula' },
    { first: 'Nertil', last: 'Nura' },
    { first: 'Orges', last: 'Osmani' },
  ];

  for (const [i, lead] of LEAD_NAMES.entries()) {
    const leadId = packId('ks', 'lead', i);
    const date = randomDatePast(10);
    await db
      .insert(schema.memberLeads)
      .values({
        id: leadId,
        tenantId: TENANTS.KS,
        branchId: packId('ks', 'branch_a'), // Assign mostly to main
        agentId: 'golden_ks_admin',
        firstName: lead.first,
        lastName: lead.last,
        email: `lead.${i}@ks.pack`,
        phone: `+3834400010${i}`,
        status: 'payment_pending',
        createdAt: date,
        updatedAt: date,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.leadPaymentAttempts)
      .values({
        id: packId('ks', 'pay', i),
        tenantId: TENANTS.KS,
        leadId: leadId,
        method: 'cash',
        status: 'pending',
        amount: 5000 + i * 1000,
        currency: 'EUR',
        createdAt: date,
      })
      .onConflictDoNothing();
  }

  console.log('\n🔍 --- KS Pack Summary ---');
  const countClaims = async (branchId: string) => {
    const res = await db
      .select({ count: schema.claims.id })
      .from(schema.claims)
      .where(sql`${schema.claims.branchId} = ${branchId}`);
    return res.length;
  };

  console.log(`KS Prishtina: ~${await countClaims(packId('ks', 'branch_a'))} claims`);
  console.log(`KS Prizren:   ~${await countClaims(packId('ks', 'branch_b'))} claims`);
  console.log(`KS Peja:      ~${await countClaims(packId('ks', 'branch_c'))} claims`);

  console.log('🇽🇰 KS Extended Workflow Pack Applied!');
  process.exit(0);
}

seedKsWorkflowPack().catch(e => {
  console.error(e);
  process.exit(1);
});
