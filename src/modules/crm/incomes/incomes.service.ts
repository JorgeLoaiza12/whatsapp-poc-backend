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
          serviceNames: dto.serviceNames,
          amount: dto.amount,
          currency: dto.currency,
          paymentMethod: dto.paymentMethod,
          date: new Date(dto.date),
          notes: dto.notes,
        },
        include: { contact: true },
      }),
      // Increment loyalty stamp (capped at 10)
      this.prisma.contact.update({
        where: { id: dto.contactId },
        data: {
          loyaltyStamps: Math.min(10, contact.loyaltyStamps + 1),
        },
      }),
    ]);

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
}
