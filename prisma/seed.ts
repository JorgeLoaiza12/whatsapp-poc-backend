import { PrismaClient, Direction, MessageType, MessageStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const hash = async (p: string) => bcrypt.hash(p, 10);

  // ── Tenant 1: Acme Corp ──────────────────────────────────────────────────
  const acme = await prisma.tenant.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
      users: {
        create: [
          {
            email: 'admin@acme.com',
            name: 'Alice Admin',
            password: await hash('Password123'),
          },
          {
            email: 'agent@acme.com',
            name: 'Bob Agent',
            password: await hash('Password123'),
          },
        ],
      },
      whatsappAccounts: {
        create: {
          wabaId: 'WABA_ACME_001',
          phoneNumberId: 'PHONE_ACME_001',
          phoneNumber: '+1 555 000 0001',
          accessToken: 'EAAFakeTokenForAcme',
          displayName: 'Acme Support',
        },
      },
    },
    include: { contacts: true },
  });

  // ── Tenant 2: Beta LLC ───────────────────────────────────────────────────
  const beta = await prisma.tenant.upsert({
    where: { slug: 'beta-llc' },
    update: {},
    create: {
      name: 'Beta LLC',
      slug: 'beta-llc',
      users: {
        create: {
          email: 'admin@beta.com',
          name: 'Carlos Beta',
          password: await hash('Password123'),
        },
      },
      whatsappAccounts: {
        create: {
          wabaId: 'WABA_BETA_001',
          phoneNumberId: 'PHONE_BETA_001',
          phoneNumber: '+1 555 000 0002',
          accessToken: 'EAAFakeTokenForBeta',
          displayName: 'Beta Sales',
        },
      },
    },
  });

  // ── Sample conversations for Acme ────────────────────────────────────────
  const contact1 = await prisma.contact.upsert({
    where: { tenantId_waPhone: { tenantId: acme.id, waPhone: '5491112345678' } },
    update: { name: 'John Customer' },
    create: { tenantId: acme.id, waPhone: '5491112345678', name: 'John Customer' },
  });

  const contact2 = await prisma.contact.upsert({
    where: { tenantId_waPhone: { tenantId: acme.id, waPhone: '5491187654321' } },
    update: { name: 'Maria García' },
    create: { tenantId: acme.id, waPhone: '5491187654321', name: 'Maria García' },
  });

  const conv1 = await prisma.conversation.upsert({
    where: {
      tenantId_contactId_phoneNumberId: {
        tenantId: acme.id,
        contactId: contact1.id,
        phoneNumberId: 'PHONE_ACME_001',
      },
    },
    update: { lastMessageAt: new Date() },
    create: {
      tenantId: acme.id,
      contactId: contact1.id,
      phoneNumberId: 'PHONE_ACME_001',
      lastMessageAt: new Date(),
    },
  });

  const conv2 = await prisma.conversation.upsert({
    where: {
      tenantId_contactId_phoneNumberId: {
        tenantId: acme.id,
        contactId: contact2.id,
        phoneNumberId: 'PHONE_ACME_001',
      },
    },
    update: { lastMessageAt: new Date(Date.now() - 3600000) },
    create: {
      tenantId: acme.id,
      contactId: contact2.id,
      phoneNumberId: 'PHONE_ACME_001',
      lastMessageAt: new Date(Date.now() - 3600000),
    },
  });

  // Messages for conv1
  const messages1 = [
    { direction: Direction.INBOUND, body: 'Hola, necesito ayuda con mi pedido', minutesAgo: 60 },
    { direction: Direction.OUTBOUND, body: '¡Hola John! Con gusto te ayudo. ¿Cuál es tu número de pedido?', minutesAgo: 58 },
    { direction: Direction.INBOUND, body: 'Es el #12345', minutesAgo: 55 },
    { direction: Direction.OUTBOUND, body: 'Perfecto, ya veo tu pedido. Está en camino y llegará mañana.', minutesAgo: 53 },
    { direction: Direction.INBOUND, body: 'Muchas gracias! 🙏', minutesAgo: 50 },
  ];

  for (const [i, m] of messages1.entries()) {
    await prisma.message.upsert({
      where: { waMessageId: `seed_conv1_msg_${i}` },
      update: {},
      create: {
        conversationId: conv1.id,
        waMessageId: `seed_conv1_msg_${i}`,
        direction: m.direction,
        type: MessageType.TEXT,
        body: m.body,
        status: MessageStatus.READ,
        timestamp: new Date(Date.now() - m.minutesAgo * 60000),
      },
    });
  }

  // Messages for conv2
  const messages2 = [
    { direction: Direction.INBOUND, body: 'Buenos días, quiero saber los precios', minutesAgo: 120 },
    { direction: Direction.OUTBOUND, body: 'Buenos días María! Te envío nuestra lista de precios actualizada.', minutesAgo: 115 },
    { direction: Direction.INBOUND, body: 'Gracias, me interesa el plan Premium', minutesAgo: 100 },
  ];

  for (const [i, m] of messages2.entries()) {
    await prisma.message.upsert({
      where: { waMessageId: `seed_conv2_msg_${i}` },
      update: {},
      create: {
        conversationId: conv2.id,
        waMessageId: `seed_conv2_msg_${i}`,
        direction: m.direction,
        type: MessageType.TEXT,
        body: m.body,
        status: m.direction === Direction.INBOUND ? MessageStatus.DELIVERED : MessageStatus.READ,
        timestamp: new Date(Date.now() - m.minutesAgo * 60000),
      },
    });
  }

  console.log('\n✅ Seed completed!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 TEST USERS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('🏢 Tenant: Acme Corp');
  console.log('   Email:    admin@acme.com    | Password: Password123');
  console.log('   Email:    agent@acme.com    | Password: Password123');
  console.log('   WA Phone: +1 555 000 0001');
  console.log('   Conversations: 2 (con datos de ejemplo)');
  console.log('');
  console.log('🏢 Tenant: Beta LLC');
  console.log('   Email:    admin@beta.com    | Password: Password123');
  console.log('   WA Phone: +1 555 000 0002');
  console.log('   Conversations: 0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
