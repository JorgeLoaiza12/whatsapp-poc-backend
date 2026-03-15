import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UpsertIncomeDto } from './dto/upsert-income.dto';

@Injectable()
export class IncomesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, search?: string) {
    return this.prisma.income.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { serviceNames: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } },
                { contact: { name: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: { contact: true },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const income = await this.prisma.income.findFirst({
      where: { id, tenantId },
      include: { contact: true },
    });
    if (!income) throw new NotFoundException('Income not found');
    return income;
  }

  async create(tenantId: string, dto: UpsertIncomeDto) {
    // Verify the contact belongs to this tenant
    const contact = await this.prisma.contact.findFirst({
      where: { id: dto.contactId, tenantId },
    });
    if (!contact) throw new NotFoundException('Client not found');

    const [income] = await this.prisma.$transaction([
      this.prisma.income.create({
        data: {
          tenantId,
          contactId: dto.contactId,
          userId: dto.userId ?? null,
          serviceNames: dto.serviceNames,
          amount: dto.amount,
          currency: dto.currency,
          paymentMethod: dto.paymentMethod,
          date: new Date(dto.date),
          notes: dto.notes,
        },
        include: { contact: true },
      }),
      // Increment loyalty stamp (capped at 10) and update visit stats
      this.prisma.contact.update({
        where: { id: dto.contactId },
        data: {
          loyaltyStamps: Math.min(10, contact.loyaltyStamps + 1),
          lastVisitAt: new Date(dto.date),
          totalVisits: { increment: 1 },
          totalSpent: { increment: dto.amount },
        },
      }),
    ]);

    // Auto-create commission if agent has a rule
    if (dto.userId) {
      const rule = await this.prisma.commissionRule.findUnique({
        where: { tenantId_userId: { tenantId, userId: dto.userId } },
      });
      if (rule) {
        const commissionAmount = (dto.amount * Number(rule.percentage)) / 100;
        await this.prisma.commission.create({
          data: {
            tenantId,
            userId: dto.userId,
            incomeId: income.id,
            amount: commissionAmount,
            percentage: rule.percentage,
            status: 'PENDING',
          },
        });
      }
    }

    return income;
  }

  async update(tenantId: string, id: string, dto: UpsertIncomeDto) {
    await this.findOne(tenantId, id);

    const contact = await this.prisma.contact.findFirst({
      where: { id: dto.contactId, tenantId },
    });
    if (!contact) throw new NotFoundException('Client not found');

    return this.prisma.income.update({
      where: { id },
      data: {
        contactId: dto.contactId,
        serviceNames: dto.serviceNames,
        amount: dto.amount,
        currency: dto.currency,
        paymentMethod: dto.paymentMethod,
        date: new Date(dto.date),
        notes: dto.notes,
      },
      include: { contact: true },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.income.delete({ where: { id } });
    return { ok: true };
  }

  async exportCsv(tenantId: string): Promise<string> {
    const incomes = await this.prisma.income.findMany({
      where: { tenantId },
      include: { contact: { select: { name: true, waPhone: true } } },
      orderBy: { date: 'desc' },
    });
    const rows = incomes.map(i => ({
      date: i.date.toISOString().split('T')[0],
      clientName: i.contact.name ?? i.contact.waPhone,
      serviceNames: i.serviceNames,
      amount: String(i.amount),
      currency: i.currency,
      paymentMethod: i.paymentMethod,
      notes: i.notes ?? '',
    }));
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { stringify } = require('csv-stringify');
      stringify(rows, { header: true }, (err: any, output: string) => {
        if (err) reject(err); else resolve(output);
      });
    });
  }
}
