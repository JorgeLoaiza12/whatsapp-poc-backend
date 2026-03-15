import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

export interface ReminderItem {
  contactId: string;
  contactName: string;
  waPhone: string;
  serviceName: string;
  lastIncomeDate: Date;
  daysOverdue: number;
  dismissed: boolean;
}

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async findPending(tenantId: string): Promise<ReminderItem[]> {
    // Load all active services that have a daysForNextTouchup configured
    const services = await this.prisma.service.findMany({
      where: { tenantId, isActive: true, daysForNextTouchup: { not: null } },
    });
    if (!services.length) return [];

    // For each service, find contacts whose last income for that service
    // was more than daysForNextTouchup days ago
    const today = new Date();
    const results: ReminderItem[] = [];

    for (const service of services) {
      const daysForNextTouchup = service.daysForNextTouchup!;
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() - daysForNextTouchup);

      // Get dismissed contact+service pairs
      const dismissals = await this.prisma.reminderDismissal.findMany({
        where: { tenantId, serviceName: service.name },
        select: { contactId: true },
      });
      const dismissedContactIds = new Set(dismissals.map((d) => d.contactId));

      // Find most recent income per contact that includes this service
      const incomes = await this.prisma.income.findMany({
        where: {
          tenantId,
          serviceNames: { contains: service.name },
          date: { lte: cutoff },
        },
        orderBy: { date: 'desc' },
        include: { contact: { select: { id: true, name: true, waPhone: true } } },
      });

      // Deduplicate: only latest income per contact
      const seen = new Set<string>();
      for (const income of incomes) {
        const cid = income.contactId;
        if (seen.has(cid)) continue;
        seen.add(cid);

        const daysOverdue = Math.floor(
          (today.getTime() - income.date.getTime()) / 86_400_000,
        ) - daysForNextTouchup;

        results.push({
          contactId: cid,
          contactName: income.contact.name ?? income.contact.waPhone,
          waPhone: income.contact.waPhone,
          serviceName: service.name,
          lastIncomeDate: income.date,
          daysOverdue: Math.max(0, daysOverdue),
          dismissed: dismissedContactIds.has(cid),
        });
      }
    }

    // Sort: non-dismissed first, then by daysOverdue desc
    results.sort((a, b) => {
      if (a.dismissed !== b.dismissed) return a.dismissed ? 1 : -1;
      return b.daysOverdue - a.daysOverdue;
    });

    return results;
  }

  async dismiss(tenantId: string, contactId: string, serviceName: string) {
    const existing = await this.prisma.reminderDismissal.findFirst({
      where: { tenantId, contactId, serviceName },
    });
    if (existing) {
      return this.prisma.reminderDismissal.update({
        where: { id: existing.id },
        data: { dismissedAt: new Date() },
      });
    }
    return this.prisma.reminderDismissal.create({
      data: { tenantId, contactId, serviceName },
    });
  }

  async undismiss(tenantId: string, contactId: string, serviceName: string) {
    await this.prisma.reminderDismissal.deleteMany({
      where: { tenantId, contactId, serviceName },
    });
    return { ok: true };
  }

  async getLogs(tenantId: string) {
    return this.prisma.reminderLog.findMany({
      where: { tenantId },
      orderBy: { sentAt: 'desc' },
      take: 100,
      include: {
        contact: { select: { name: true, waPhone: true } },
      },
    });
  }

  async getConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { reminderEnabled: true },
    });
    return { reminderEnabled: tenant?.reminderEnabled ?? true };
  }

  async updateConfig(tenantId: string, enabled: boolean) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { reminderEnabled: enabled },
    });
    return { reminderEnabled: enabled };
  }
}
