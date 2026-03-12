import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UpsertExpenseDto } from './dto/upsert-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, search?: string) {
    return this.prisma.expense.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { category: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async create(tenantId: string, dto: UpsertExpenseDto) {
    return this.prisma.expense.create({
      data: {
        tenantId,
        amount: dto.amount,
        currency: dto.currency,
        category: dto.category,
        description: dto.description,
        paymentMethod: dto.paymentMethod,
        date: new Date(dto.date),
        notes: dto.notes,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpsertExpenseDto) {
    await this.findOne(tenantId, id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        amount: dto.amount,
        currency: dto.currency,
        category: dto.category,
        description: dto.description,
        paymentMethod: dto.paymentMethod,
        date: new Date(dto.date),
        notes: dto.notes,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.expense.delete({ where: { id } });
    return { ok: true };
  }
}
