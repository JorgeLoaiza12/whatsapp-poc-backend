/**
 * migrate-from-agencl.ts
 *
 * Reads ALL data from the agencl Supabase DB and migrates it into the
 * new multi-tenant Neon DB.
 *
 * Mapping:
 *   agencl users          → tenants  (1 tenant per user) + users (auth record)
 *   agencl clients        → contacts (phone → waPhone, userId → tenantId)
 *   agencl services       → services (userId → tenantId)
 *   agencl incomes        → incomes  (userId → tenantId, clientId → contactId)
 *   agencl expenses       → expenses (userId → tenantId)
 *   agencl reminder_dismissals → reminder_dismissals
 *   agencl user_currencies     → tenant_currencies
 *
 * Run:  npx tsx scripts/migrate-from-agencl.ts
 */

import { Client as PgClient } from 'pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// ── DB connections ────────────────────────────────────────────────────────────

const AGENCL_URL =
  'postgresql://postgres.ozdhtnqzrbqoaqfrbwgb:rgu1pra-beb3vat%40FUZ@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

const agencl = new PgClient({ connectionString: AGENCL_URL, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

function normalizePhone(phone: string): string {
  // Strip leading + so waPhone is always digits-only
  return phone.startsWith('+') ? phone.slice(1) : phone;
}

// ── Main migration ─────────────────────────────────────────────────────────────

async function main() {
  console.log('🔌  Connecting to agencl Supabase...');
  await agencl.connect();
  console.log('✅  Connected.\n');

  // ── 1. Read agencl data ─────────────────────────────────────────────────────

  const [
    { rows: aUsers },
    { rows: aClients },
    { rows: aServices },
    { rows: aIncomes },
    { rows: aExpenses },
    { rows: aDismissals },
    { rows: aCurrencies },
  ] = await Promise.all([
    agencl.query('SELECT * FROM users ORDER BY created_at'),
    agencl.query('SELECT * FROM clients ORDER BY created_at'),
    agencl.query('SELECT * FROM services ORDER BY created_at'),
    agencl.query('SELECT * FROM incomes ORDER BY created_at'),
    agencl.query('SELECT * FROM expenses ORDER BY created_at'),
    agencl.query('SELECT * FROM reminder_dismissals ORDER BY dismissed_at'),
    agencl.query('SELECT * FROM user_currencies ORDER BY created_at'),
  ]);

  console.log('📊  Agencl data counts:');
  console.log(`   users:               ${aUsers.length}`);
  console.log(`   clients:             ${aClients.length}`);
  console.log(`   services:            ${aServices.length}`);
  console.log(`   incomes:             ${aIncomes.length}`);
  console.log(`   expenses:            ${aExpenses.length}`);
  console.log(`   reminder_dismissals: ${aDismissals.length}`);
  console.log(`   user_currencies:     ${aCurrencies.length}`);
  console.log();

  // ── 2. Migrate users → tenants + users (auth) ────────────────────────────────

  console.log('👤  Migrating users → tenants...');

  // Map: agencl userId (UUID) → new tenantId (we keep same UUID for traceability)
  const tenantIdMap = new Map<string, string>(); // agenclUserId → tenantId

  for (const u of aUsers) {
    // Derive a unique slug from email
    const baseSlug = slugify(u.email.split('@')[0]);
    let slug = baseSlug;
    let attempt = 0;
    while (true) {
      const existing = await prisma.tenant.findUnique({ where: { slug } });
      if (!existing) break;
      attempt++;
      slug = `${baseSlug}-${attempt}`;
    }

    const tenant = await prisma.tenant.upsert({
      where: { id: u.id },
      update: { name: u.loyalty_card_name ?? u.email, loyaltyCardName: u.loyalty_card_name ?? 'Lash Studio' },
      create: {
        id: u.id, // Keep same UUID from agencl for traceability
        name: u.loyalty_card_name ?? u.email,
        slug,
        loyaltyCardName: u.loyalty_card_name ?? 'Lash Studio',
        createdAt: new Date(u.created_at),
        updatedAt: new Date(u.created_at),
      },
    });

    tenantIdMap.set(u.id, tenant.id);

    // Create a corresponding auth User so they can log in
    const tempHash = await bcrypt.hash('Asd123-+', 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        password: tempHash,
        name: u.loyalty_card_name ?? u.email,
        tenantId: tenant.id,
        createdAt: new Date(u.created_at),
        updatedAt: new Date(u.created_at),
      },
    });

    console.log(`   ✓ tenant ${tenant.id.slice(0, 8)}…  email: ${u.email}  slug: ${slug}`);
  }

  // ── 3. Migrate clients → contacts ────────────────────────────────────────────

  console.log('\n👩  Migrating clients → contacts...');

  const clientIdMap = new Map<string, string>(); // agenclClientId → contactId

  let clientsInserted = 0;
  let clientsSkipped = 0;

  for (const c of aClients) {
    const tenantId = tenantIdMap.get(c.user_id);
    if (!tenantId) { console.warn(`   ⚠  client ${c.id}: no tenant for user_id ${c.user_id}`); continue; }

    const waPhone = normalizePhone(c.phone);

    try {
      const contact = await prisma.contact.upsert({
        where: { tenantId_waPhone: { tenantId, waPhone } },
        update: {
          name: c.name,
          phone: c.phone,
          email: c.email ?? null,
          instagram: c.instagram ?? null,
          notes: c.notes ?? null,
          loyaltyStamps: c.loyalty_stamps ?? 0,
          googleWalletPassId: c.google_wallet_pass_id ?? null,
          appleWalletPassId: c.apple_wallet_pass_id ?? null,
          applePassUrl: c.apple_pass_url ?? null,
        },
        create: {
          id: c.id, // Keep same UUID
          tenantId,
          waPhone,
          name: c.name,
          phone: c.phone,
          email: c.email ?? null,
          instagram: c.instagram ?? null,
          notes: c.notes ?? null,
          loyaltyStamps: c.loyalty_stamps ?? 0,
          googleWalletPassId: c.google_wallet_pass_id ?? null,
          appleWalletPassId: c.apple_wallet_pass_id ?? null,
          applePassUrl: c.apple_pass_url ?? null,
          createdAt: new Date(c.created_at),
          updatedAt: new Date(c.created_at),
        },
      });
      clientIdMap.set(c.id, contact.id);
      clientsInserted++;
    } catch (e: any) {
      // ID conflict: contact already exists with different waPhone for same tenant
      // Fall back to finding by ID
      const existing = await prisma.contact.findUnique({ where: { id: c.id } });
      if (existing) {
        clientIdMap.set(c.id, existing.id);
        clientsSkipped++;
      } else {
        console.warn(`   ⚠  Skipped client ${c.id}: ${e.message}`);
        clientsSkipped++;
      }
    }
  }

  console.log(`   ✓ ${clientsInserted} inserted, ${clientsSkipped} skipped/already-exist`);

  // ── 4. Migrate services ───────────────────────────────────────────────────────

  console.log('\n🔧  Migrating services...');

  let servicesInserted = 0;
  for (const s of aServices) {
    const tenantId = tenantIdMap.get(s.user_id);
    if (!tenantId) continue;

    await prisma.service.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        price: parseFloat(s.price),
        duration: s.duration ?? null,
        description: s.description ?? null,
        isActive: s.is_active ?? true,
        daysForNextTouchup: s.days_for_next_touchup ?? null,
      },
      create: {
        id: s.id,
        tenantId,
        name: s.name,
        price: parseFloat(s.price),
        duration: s.duration ?? null,
        description: s.description ?? null,
        isActive: s.is_active ?? true,
        daysForNextTouchup: s.days_for_next_touchup ?? null,
        createdAt: new Date(s.created_at),
        updatedAt: new Date(s.created_at),
      },
    });
    servicesInserted++;
  }
  console.log(`   ✓ ${servicesInserted} services migrated`);

  // ── 5. Migrate incomes ────────────────────────────────────────────────────────

  console.log('\n💰  Migrating incomes...');

  let incomesInserted = 0;
  let incomesSkipped = 0;
  for (const i of aIncomes) {
    const tenantId = tenantIdMap.get(i.user_id);
    const contactId = clientIdMap.get(i.client_id);
    if (!tenantId || !contactId) {
      console.warn(`   ⚠  income ${i.id}: missing tenant or contact`);
      incomesSkipped++;
      continue;
    }

    await prisma.income.upsert({
      where: { id: i.id },
      update: {},
      create: {
        id: i.id,
        tenantId,
        contactId,
        serviceNames: i.service_names,
        amount: parseFloat(i.amount),
        currency: i.currency ?? 'CLP',
        paymentMethod: i.payment_method,
        notes: i.notes ?? null,
        date: new Date(i.date),
        createdAt: new Date(i.created_at),
        updatedAt: new Date(i.created_at),
      },
    });
    incomesInserted++;
  }
  console.log(`   ✓ ${incomesInserted} incomes migrated, ${incomesSkipped} skipped`);

  // ── 6. Migrate expenses ───────────────────────────────────────────────────────

  console.log('\n📉  Migrating expenses...');

  let expensesInserted = 0;
  for (const e of aExpenses) {
    const tenantId = tenantIdMap.get(e.user_id);
    if (!tenantId) continue;

    await prisma.expense.upsert({
      where: { id: e.id },
      update: {},
      create: {
        id: e.id,
        tenantId,
        amount: parseFloat(e.amount),
        currency: e.currency ?? 'CLP',
        category: e.category,
        description: e.description,
        paymentMethod: e.payment_method,
        notes: e.notes ?? null,
        date: new Date(e.date),
        createdAt: new Date(e.created_at),
        updatedAt: new Date(e.created_at),
      },
    });
    expensesInserted++;
  }
  console.log(`   ✓ ${expensesInserted} expenses migrated`);

  // ── 7. Migrate reminder_dismissals ────────────────────────────────────────────

  console.log('\n🔔  Migrating reminder dismissals...');

  let dismissalsInserted = 0;
  for (const d of aDismissals) {
    const tenantId = tenantIdMap.get(d.user_id);
    const contactId = clientIdMap.get(d.client_id);
    if (!tenantId || !contactId) continue;

    await prisma.reminderDismissal.upsert({
      where: { id: d.id },
      update: {},
      create: {
        id: d.id,
        tenantId,
        contactId,
        serviceName: d.service_name,
        dismissedAt: new Date(d.dismissed_at),
      },
    });
    dismissalsInserted++;
  }
  console.log(`   ✓ ${dismissalsInserted} dismissals migrated`);

  // ── 8. Migrate user_currencies → tenant_currencies ───────────────────────────

  console.log('\n💱  Migrating currencies...');

  let currenciesInserted = 0;
  for (const c of aCurrencies) {
    const tenantId = tenantIdMap.get(c.user_id);
    if (!tenantId) continue;

    await prisma.tenantCurrency.upsert({
      where: { tenantId_currency: { tenantId, currency: c.currency } },
      update: { isActive: c.is_active },
      create: {
        id: c.id,
        tenantId,
        currency: c.currency,
        isActive: c.is_active,
        createdAt: new Date(c.created_at),
      },
    });
    currenciesInserted++;
  }
  console.log(`   ✓ ${currenciesInserted} currencies migrated`);

  // ── 9. Verification — count comparison ────────────────────────────────────────

  console.log('\n🔍  Verification — comparing counts...\n');

  const [
    newTenants,
    newContacts,
    newServices,
    newIncomes,
    newExpenses,
    newDismissals,
    newCurrencies,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.contact.count(),
    prisma.service.count(),
    prisma.income.count(),
    prisma.expense.count(),
    prisma.reminderDismissal.count(),
    prisma.tenantCurrency.count(),
  ]);

  const checks = [
    { name: 'tenants/users',          agencl: aUsers.length,       new: newTenants },
    { name: 'contacts/clients',       agencl: aClients.length,     new: newContacts },
    { name: 'services',               agencl: aServices.length,    new: newServices },
    { name: 'incomes',                agencl: aIncomes.length,     new: newIncomes },
    { name: 'expenses',               agencl: aExpenses.length,    new: newExpenses },
    { name: 'reminder_dismissals',    agencl: aDismissals.length,  new: newDismissals },
    { name: 'tenant_currencies',      agencl: aCurrencies.length,  new: newCurrencies },
  ];

  let allOk = true;
  for (const c of checks) {
    const ok = c.new >= c.agencl;
    const icon = ok ? '✅' : '❌';
    console.log(`   ${icon}  ${c.name.padEnd(24)} agencl: ${String(c.agencl).padStart(4)}  new DB: ${String(c.new).padStart(4)}`);
    if (!ok) allOk = false;
  }

  console.log();
  if (allOk) {
    console.log('🎉  Migration complete — all counts match or exceed agencl!\n');
  } else {
    console.log('⚠️   Some counts are lower than agencl — check warnings above.\n');
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('\n💥  Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await agencl.end();
    await prisma.$disconnect();
  });
