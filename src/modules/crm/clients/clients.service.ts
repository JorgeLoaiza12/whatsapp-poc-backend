import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UpsertClientDto } from './dto/upsert-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, search?: string) {
    return this.prisma.contact.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { waPhone: { contains: search } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } },
                { instagram: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const client = await this.prisma.contact.findFirst({
      where: { id, tenantId },
      include: {
        incomes: { orderBy: { date: 'desc' }, take: 10 },
        conversations: { select: { id: true, lastMessageAt: true } },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async create(tenantId: string, dto: UpsertClientDto) {
    const normalized = dto.waPhone.startsWith('+')
      ? dto.waPhone.slice(1)
      : dto.waPhone;

    const existing = await this.prisma.contact.findUnique({
      where: { tenantId_waPhone: { tenantId, waPhone: normalized } },
    });
    if (existing) {
      throw new ConflictException(
        `A client with WhatsApp number ${normalized} already exists`,
      );
    }

    return this.prisma.contact.create({
      data: {
        tenantId,
        waPhone: normalized,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        instagram: dto.instagram,
        notes: dto.notes,
        loyaltyStamps: dto.loyaltyStamps ?? 0,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpsertClientDto) {
    await this.findOne(tenantId, id); // 404 if not found

    const normalized = dto.waPhone.startsWith('+')
      ? dto.waPhone.slice(1)
      : dto.waPhone;

    // Check if waPhone conflicts with another client
    const conflict = await this.prisma.contact.findFirst({
      where: { tenantId, waPhone: normalized, NOT: { id } },
    });
    if (conflict) {
      throw new ConflictException(
        `Another client already has WhatsApp number ${normalized}`,
      );
    }

    return this.prisma.contact.update({
      where: { id },
      data: {
        waPhone: normalized,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        instagram: dto.instagram,
        notes: dto.notes,
        loyaltyStamps: dto.loyaltyStamps,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.contact.delete({ where: { id } });
    return { ok: true };
  }

  async adjustStamp(tenantId: string, id: string, delta: number) {
    const client = await this.findOne(tenantId, id);
    const next = Math.max(0, Math.min(10, client.loyaltyStamps + delta));
    return this.prisma.contact.update({
      where: { id },
      data: { loyaltyStamps: next },
    });
  }
}
