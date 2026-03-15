// use context7
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpsertAppointmentDto } from './dto/upsert-appointment.dto';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: UpsertAppointmentDto) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: dto.contactId, tenantId },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return this.prisma.appointment.create({
      data: {
        tenantId,
        contactId: dto.contactId,
        serviceName: dto.serviceName,
        scheduledAt: new Date(dto.scheduledAt),
        durationMins: dto.durationMins ?? 60,
        notes: dto.notes,
      },
      include: { contact: { select: { id: true, name: true, waPhone: true } } },
    });
  }

  async findAll(tenantId: string, date?: string) {
    const where: any = { tenantId };
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.scheduledAt = { gte: start, lte: end };
    }
    return this.prisma.appointment.findMany({
      where,
      include: { contact: { select: { id: true, name: true, waPhone: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: { contact: { select: { id: true, name: true, waPhone: true } } },
    });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  async update(tenantId: string, id: string, dto: Partial<UpsertAppointmentDto>) {
    await this.findOne(tenantId, id);
    return this.prisma.appointment.update({
      where: { id },
      data: {
        ...(dto.serviceName !== undefined && { serviceName: dto.serviceName }),
        ...(dto.scheduledAt !== undefined && { scheduledAt: new Date(dto.scheduledAt) }),
        ...(dto.durationMins !== undefined && { durationMins: dto.durationMins }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: { contact: { select: { id: true, name: true, waPhone: true } } },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.appointment.delete({ where: { id } });
    return { ok: true };
  }

  async markComplete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.COMPLETED },
      include: { contact: { select: { id: true, name: true, waPhone: true } } },
    });
  }
}
