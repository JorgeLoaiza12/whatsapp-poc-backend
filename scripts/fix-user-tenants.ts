import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  // Point each migrated user to their correct migrated tenant (UUID from agencl)
  const fixes = [
    { email: 'jorgeloaiza12@gmail.com', tenantId: '89bcda42-aa71-41f7-9161-e79e1dfe4175' },
    { email: 'scarletsalas8@gmail.com', tenantId: '69c25e6a-7da4-4d23-8a15-a4d9803a39fc' },
  ];

  for (const f of fixes) {
    const u = await p.user.update({
      where: { email: f.email },
      data: { tenantId: f.tenantId },
    });
    console.log(`✅  ${u.email} → tenantId: ${u.tenantId}`);
  }
}
main().catch(console.error).finally(() => p.$disconnect());
