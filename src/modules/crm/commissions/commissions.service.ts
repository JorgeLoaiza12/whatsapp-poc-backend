import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { SetRuleDto } from './dto/set-rule.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRules(tenantId: string) {
    return this.prisma.commissionRule.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async setRule(tenantId: string, dto: SetRuleDto) {
    const user = await this.prisma.user.findFirst({ where: { id: dto.userId, tenantId } });
    if (!user) throw new NotFoundException('User not found in this tenant');

    return this.prisma.commissionRule.upsert({
      where: { tenantId_userId: { tenantId, userId: dto.userId } },
      create: { tenantId, userId: dto.userId, percentage: dto.percentage },
      update: { percentage: dto.percentage },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
  }

  async removeRule(tenantId: string, userId: string) {
    const rule = await this.prisma.commissionRule.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!rule) throw new NotFoundException('Commission rule not found');
    await this.prisma.commissionRule.delete({ where: { tenantId_userId: { tenantId, userId } } });
    return { ok: true };
  }

  async getCommissions(tenantId: string, userId?: string, status?: string) {
    return this.prisma.commission.findMany({
      where: {
        tenantId,
        ...(userId ? { userId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        income: { select: { id: true, serviceNames: true, amount: true, date: true, contact: { select: { name: true, waPhone: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markPaid(tenantId: string, dto: MarkPaidDto) {
    await this.prisma.commission.updateMany({
      where: { id: { in: dto.commissionIds }, tenantId, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    return { ok: true, count: dto.commissionIds.length };
  }

  /** Called by IncomesService after creating an income with userId */
  async createForIncome(tenantId: string, incomeId: string, userId: string, amount: number) {
    const rule = await this.prisma.commissionRule.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!rule) return null;

    const commissionAmount = (amount * Number(rule.percentage)) / 100;
    return this.prisma.commission.create({
      data: {
        tenantId,
        userId,
        incomeId,
        amount: commissionAmount,
        percentage: rule.percentage,
        status: 'PENDING',
      },
    });
  }

  async getSummary(tenantId: string) {
    const rules = await this.prisma.commissionRule.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, name: true } } },
    });

    const summaries = await Promise.all(
      rules.map(async (rule) => {
        const [pending, paid] = await Promise.all([
          this.prisma.commission.aggregate({
            where: { tenantId, userId: rule.userId, status: 'PENDING' },
            _sum: { amount: true },
            _count: true,
          }),
          this.prisma.commission.aggregate({
            where: { tenantId, userId: rule.userId, status: 'PAID' },
            _sum: { amount: true },
            _count: true,
          }),
        ]);
        return {
          userId: rule.userId,
          userName: rule.user.name,
          percentage: rule.percentage,
          pendingAmount: pending._sum.amount ?? 0,
          pendingCount: pending._count,
          paidAmount: paid._sum.amount ?? 0,
          paidCount: paid._count,
        };
      }),
    );

    return summaries;
  }
}
