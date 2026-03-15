import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UpsertQuickReplyDto } from './dto/upsert-quick-reply.dto';

@Injectable()
export class QuickRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.quickReply.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  create(tenantId: string, dto: UpsertQuickReplyDto) {
    return this.prisma.quickReply.create({
      data: { tenantId, title: dto.title, body: dto.body, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async update(tenantId: string, id: string, dto: Partial<UpsertQuickReplyDto>) {
    const existing = await this.prisma.quickReply.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Quick reply not found');
    return this.prisma.quickReply.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.quickReply.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Quick reply not found');
    await this.prisma.quickReply.delete({ where: { id } });
    return { ok: true };
  }
}
