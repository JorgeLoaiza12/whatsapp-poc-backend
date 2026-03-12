import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UpsertServiceDto } from './dto/upsert-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, activeOnly = false) {
    return this.prisma.service.findMany({
      where: { tenantId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async create(tenantId: string, dto: UpsertServiceDto) {
    return this.prisma.service.create({
      data: {
        tenantId,
        name: dto.name,
        price: dto.price,
        duration: dto.duration,
        description: dto.description,
        isActive: dto.isActive ?? true,
        daysForNextTouchup: dto.daysForNextTouchup,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpsertServiceDto) {
    await this.findOne(tenantId, id);
    return this.prisma.service.update({
      where: { id },
      data: {
        name: dto.name,
        price: dto.price,
        duration: dto.duration,
        description: dto.description,
        isActive: dto.isActive,
        daysForNextTouchup: dto.daysForNextTouchup,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.service.delete({ where: { id } });
    return { ok: true };
  }
}
