import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const users = await p.user.findMany({ include: { tenant: { select: { id: true, name: true, slug: true } } } });
  console.log('\n=== Users ===');
  users.forEach(u => console.log(`  ${u.email}  tenantId: ${u.tenantId}  slug: ${u.tenant?.slug}`));

  const tenants = await p.tenant.findMany();
  console.log('\n=== Tenants ===');
  for (const t of tenants) {
    const contacts = await p.contact.count({ where: { tenantId: t.id } });
    const incomes  = await p.income.count({ where: { tenantId: t.id } });
    const services = await p.service.count({ where: { tenantId: t.id } });
    const expenses = await p.expense.count({ where: { tenantId: t.id } });
    console.log(`  ${t.id}  slug: ${t.slug}  contacts: ${contacts}  incomes: ${incomes}  services: ${services}  expenses: ${expenses}`);
  }
}
main().catch(console.error).finally(() => p.$disconnect());
