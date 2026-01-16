import { cleanupByPrefixes } from '../seed-utils/cleanup';
import { hashPassword } from '../seed-utils/hash-password';
import { packId } from '../seed-utils/seed-ids';
// Needed imports for sanity check
import { inArray, sql } from 'drizzle-orm';
import type { SeedConfig } from '../seed-types';

export async function seedKsWorkflowPack(config: SeedConfig) {
  console.log('🇽🇰 Seeding Kosovo Workflow Pack (Overlay)...');

  const { db } = await import('../db');
  const schema = await import('../schema');
  const { at } = config;

  const TENANTS = {
    KS: 'tenant_ks',
  };

  // 1.0 Ensure Tenants Exist (Both KS and MK for Isolation Testing)
  const allTenants = [
    {
      id: TENANTS.KS,
      name: 'Interdomestik (KS)',
      legalName: 'Interdomestik Kosova',
      countryCode: 'XK',
      currency: 'EUR',
      isActive: true,
      createdAt: at(),
      updatedAt: at(),
    },
    {
      id: 'tenant_mk',
      name: 'Interdomestik (MK)',
      legalName: 'Interdomestik Makedonija',
      countryCode: 'MK',
      currency: 'EUR',
      isActive: true,
      createdAt: at(),
      updatedAt: at(),
    },
  ];

  await db
    .insert(schema.tenants)
    .values(allTenants)
    .onConflictDoUpdate({
      target: schema.tenants.id,
      set: { name: sql`excluded.name` },
    });

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
  // Separate admin password for clarity or reuse
  const ADMIN_PASS = hashPassword('AdminPassword123!');

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
    'Arta Dobroshec',
  ];

  // Seed 25 members to cycle through
  const packUsers = [
    // 3.1 Admins for E2E
    {
      id: 'admin-ks',
      name: 'Admin KS',
      email: 'admin-ks@interdomestik.com',
      role: 'admin',
      tenantId: TENANTS.KS,
      passHash: ADMIN_PASS,
    },
    {
      id: 'admin-mk', // Explicit ID for MK Admin - now points to KS for E2E compat
      name: 'Admin User',
      email: 'admin@interdomestik.com', // E2E fixture expects this email
      role: 'admin',
      tenantId: TENANTS.KS, // Changed from tenant_mk to align with E2E expectations
      passHash: ADMIN_PASS,
    },
    // 3.2 Pack Staff
    {
      id: packId('ks', 'staff_extra'),
      name: 'Agim Ramadani',
      email: 'staff.ks.extra@interdomestik.com',
      role: 'staff',
      tenantId: TENANTS.KS,
      passHash: hashedPass,
    },
    // 3.3 Members
    ...ALBANIAN_NAMES.map((name, i) => ({
      id: packId('ks', 'member', i + 1),
      name: name,
      email: `ks.member.pack.${i + 1}@interdomestik.com`,
      role: 'member',
      tenantId: TENANTS.KS,
      passHash: hashedPass,
      memberNumber: `MEM-2026-000${101 + i}`,
      memberNumberIssuedAt: at(),
    })),
  ];

  // Upsert users
  // 3.0 Clean up potential ID conflicts (by Email)
  // Upsert users
  // 3.0 Clean up potential ID conflicts (by Email)
  const allEmails = packUsers.map(u => u.email);
  if (allEmails.length > 0) {
    // Find existing users by email to get their IDs (for FK cleanup)
    const usersToDelete = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(inArray(schema.user.email, allEmails));

    if (usersToDelete.length > 0) {
      const idsToDelete = usersToDelete.map(u => u.id);

      // Delete sessions first
      await db.delete(schema.session).where(inArray(schema.session.userId, idsToDelete));
      // Delete accounts
      await db.delete(schema.account).where(inArray(schema.account.userId, idsToDelete));
      // Delete subscriptions
      if (schema.subscriptions) {
        await db
          .delete(schema.subscriptions)
          .where(inArray(schema.subscriptions.userId, idsToDelete));
      }
      // Delete access logs & audit logs
      if (schema.documentAccessLog) {
        await db
          .delete(schema.documentAccessLog)
          .where(inArray(schema.documentAccessLog.accessedBy, idsToDelete));
      }
      if (schema.auditLog) {
        await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorId, idsToDelete));
      }
      if (schema.memberNotes) {
        await db
          .delete(schema.memberNotes)
          .where(inArray(schema.memberNotes.authorId, idsToDelete));
      }
      if (schema.sharePacks) {
        await db
          .delete(schema.sharePacks)
          .where(inArray(schema.sharePacks.createdByUserId, idsToDelete));
        await db
          .delete(schema.sharePacks)
          .where(inArray(schema.sharePacks.revokedByUserId, idsToDelete));
      }
      if (schema.documents) {
        const userDocIds = await db
          .select({ id: schema.documents.id })
          .from(schema.documents)
          .where(inArray(schema.documents.uploadedBy, idsToDelete));

        const docIds = userDocIds.map(d => d.id);
        if (docIds.length > 0) {
          if (schema.documentAccessLog) {
            await db
              .delete(schema.documentAccessLog)
              .where(inArray(schema.documentAccessLog.documentId, docIds));
          }
          await db.delete(schema.documents).where(inArray(schema.documents.id, docIds));
        }
      }
      // Delete users
      await db.delete(schema.user).where(inArray(schema.user.id, idsToDelete));
    }
  }

  for (const u of packUsers) {
    await db
      .insert(schema.user)
      .values({
        ...u,
        emailVerified: true,
        memberNumber: 'memberNumber' in u ? (u.memberNumber as string) : null,
        memberNumberIssuedAt: 'memberNumberIssuedAt' in u ? (u.memberNumberIssuedAt as Date) : null,
        createdAt: at(),
        updatedAt: at(),
      })
      .onConflictDoUpdate({
        target: schema.user.id,
        set: {
          role: u.role,
          name: u.name,
          memberNumber: 'memberNumber' in u ? (u.memberNumber as string) : null,
          memberNumberIssuedAt:
            'memberNumberIssuedAt' in u ? (u.memberNumberIssuedAt as Date) : null,
        },
      });

    await db
      .insert(schema.account)
      .values({
        id: `${u.id}-credential`,
        accountId: u.email,
        providerId: 'credential',
        userId: u.id,
        password: u.passHash || hashedPass,
        createdAt: at(),
        updatedAt: at(),
      })
      .onConflictDoUpdate({
        target: schema.account.id,
        set: { password: u.passHash || hashedPass },
      });
  }

  // 3a. Seed Documents for Vault/SharePack
  console.log('📄 Seeding Documents for Vault...');
  if (schema.documents) {
    console.log('   Inserting 2 documents...');
    await db
      .insert(schema.documents)
      .values([
        {
          id: 'doc-ks-1',
          tenantId: 'tenant_ks',
          fileName: 'Policy_Manual_KS.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024 * 500,
          category: 'other',
          uploadedBy: 'admin-ks',
          uploadedAt: at(),
          entityType: 'member',
          entityId: 'admin-ks',
          storagePath: 'ks/admin-ks/Policy_Manual_KS.pdf',
          description: 'Standard Policy Manual',
        },
        {
          id: 'doc-ks-2',
          tenantId: 'tenant_ks',
          fileName: 'Claim_Form_Template.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: 1024 * 20,
          category: 'other',
          uploadedBy: 'admin-ks',
          uploadedAt: at(),
          entityType: 'member',
          entityId: 'admin-ks',
          storagePath: 'ks/admin-ks/Claim_Form_Template.docx',
          description: 'Empty Claim Form',
        },
      ])
      .onConflictDoNothing();
  } else {
    console.warn('⚠️ schema.documents is undefined! check imports');
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
            createdAt: at(idx * 600000),
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
            createdAt: at(i * 3600000),
            note: `Tranzicion automatik në ${stages[i]}`,
          })
          .onConflictDoNothing();
      }
    }
  };

  // Offset to avoid colliding with Golden Pack's single claim (800001)
  // Golden Pack uses 800001 explicitly. We start at 800010 to be safe.
  let globalClaimIdx = 10;
  const makeClaimNumber = (idx: number) =>
    `CLM-XK-2026-${(800000 + idx).toString().padStart(6, '0')}`;

  const randomItem = <T>(arr: T[] | readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const randomDatePast = (daysMax: number) => {
    const d = at();
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
    const date = at();
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

  // Update counters to reflect pack users (starting from 101, ending ~126)
  await db
    .insert(schema.memberCounters)
    .values({
      year: 2026,
      lastNumber: 150,
      updatedAt: at(),
    })
    .onConflictDoUpdate({
      target: schema.memberCounters.year,
      set: { lastNumber: sql`GREATEST(${schema.memberCounters.lastNumber}, 150)` },
    });

  console.log('🇽🇰 KS Extended Workflow Pack Applied!');
}

// Pure module - CLI execution removed. Use seed.ts runner only.
