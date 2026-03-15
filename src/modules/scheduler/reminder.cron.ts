// use context7
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

const REMINDER_COOLDOWN_DAYS = 7;

@Injectable()
export class ReminderCron {
  private readonly logger = new Logger(ReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsApp: WhatsAppService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyReminders(): Promise<void> {
    this.logger.log('Running daily reminder cron');
    const tenants = await this.prisma.tenant.findMany({
      where: { reminderEnabled: true },
      select: { id: true },
    });

    for (const tenant of tenants) {
      await this.processRemindersForTenant(tenant.id);
    }
  }

  private async processRemindersForTenant(tenantId: string): Promise<void> {
    const services = await this.prisma.service.findMany({
      where: { tenantId, isActive: true, daysForNextTouchup: { not: null } },
    });
    if (!services.length) return;

    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { tenantId, isActive: true },
    });
    if (!account) return;

    const today = new Date();

    for (const service of services) {
      await this.processServiceReminders(tenantId, service, account, today);
    }
  }

  private async processServiceReminders(
    tenantId: string,
    service: { id: string; name: string; daysForNextTouchup: number | null },
    account: { id: string; phoneNumberId: string; accessToken: string },
    today: Date,
  ): Promise<void> {
    const days = service.daysForNextTouchup!;
    const cutoff = new Date(today.getTime() - days * 86_400_000);
    const cooldownCutoff = new Date(today.getTime() - REMINDER_COOLDOWN_DAYS * 86_400_000);

    const [dismissals, recentLogs, overdueIncomes] = await Promise.all([
      this.prisma.reminderDismissal.findMany({
        where: { tenantId, serviceName: service.name },
        select: { contactId: true },
      }),
      this.prisma.reminderLog.findMany({
        where: {
          tenantId,
          serviceName: service.name,
          sentAt: { gte: cooldownCutoff },
        },
        select: { contactId: true },
      }),
      this.prisma.income.findMany({
        where: { tenantId, serviceNames: { contains: service.name }, date: { lte: cutoff } },
        orderBy: { date: 'desc' },
        include: { contact: { select: { id: true, name: true, waPhone: true } } },
      }),
    ]);

    const dismissedIds = new Set(dismissals.map((d) => d.contactId));
    const recentLogIds = new Set(recentLogs.map((l) => l.contactId));
    const seenContacts = new Set<string>();

    for (const income of overdueIncomes) {
      const contactId = income.contactId;

      if (seenContacts.has(contactId)) continue;
      seenContacts.add(contactId);

      if (dismissedIds.has(contactId) || recentLogIds.has(contactId)) continue;

      await this.sendReminderToContact(
        tenantId,
        income.contact,
        service.name,
        account,
      );
    }
  }

  private async sendReminderToContact(
    tenantId: string,
    contact: { id: string; name: string | null; waPhone: string },
    serviceName: string,
    account: { phoneNumberId: string; accessToken: string },
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { tenantId, contactId: contact.id },
    });
    if (!conversation) return;

    const name = contact.name ?? contact.waPhone;
    const body = `Hola ${name} 💫 te recordamos que ya es hora de tu retoque de ${serviceName}. ¡Escríbenos para agendar!`;

    let waMessageId: string | undefined;
    let status = 'SENT';
    let errorMsg: string | undefined;

    try {
      const result = await this.whatsApp.sendMessage(
        tenantId,
        account.phoneNumberId,
        contact.waPhone,
        body,
        conversation.id,
      );
      waMessageId = result?.waMessageId ?? undefined;
    } catch (err: any) {
      status = 'FAILED';
      errorMsg = err?.message ?? 'Unknown error';
      this.logger.error(`Reminder failed for contact ${contact.id}: ${errorMsg}`);
    }

    await this.prisma.reminderLog.create({
      data: {
        tenantId,
        contactId: contact.id,
        serviceName,
        waMessageId,
        status,
        errorMsg,
      },
    });
  }
}
