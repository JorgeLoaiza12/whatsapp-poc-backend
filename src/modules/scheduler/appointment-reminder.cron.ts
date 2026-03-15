// use context7
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { AppointmentStatus } from '@prisma/client';

const WINDOW_MS = 15 * 60 * 1000; // 15 min window matching cron frequency

@Injectable()
export class AppointmentReminderCron {
  private readonly logger = new Logger(AppointmentReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async runAppointmentReminders(): Promise<void> {
    const now = new Date();
    await this.sendWindowReminders(now, 24 * 60 * 60 * 1000, false, '24h');
    await this.sendWindowReminders(now, 60 * 60 * 1000, true, '1h');
  }

  private async sendWindowReminders(
    now: Date,
    windowOffset: number,
    is1h: boolean,
    label: string,
  ): Promise<void> {
    const windowStart = new Date(now.getTime() + windowOffset);
    const windowEnd = new Date(now.getTime() + windowOffset + WINDOW_MS);

    const field = is1h ? 'reminder1hSent' : 'reminder24hSent';

    const appointments = await this.prisma.appointment.findMany({
      where: {
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        scheduledAt: { gte: windowStart, lte: windowEnd },
        [field]: false,
      },
      include: {
        contact: { select: { id: true, name: true, waPhone: true } },
        tenant: { include: { whatsappAccounts: { where: { isActive: true }, take: 1 } } },
      },
    });

    for (const appt of appointments) {
      const account = appt.tenant.whatsappAccounts[0];
      if (!account) continue;

      const nombre = appt.contact.name ?? appt.contact.waPhone;
      const body = is1h
        ? `Hola ${nombre}! 🕐 Tu cita de ${appt.serviceName} es en 1 hora. ¡Te esperamos!`
        : `Hola ${nombre}! 👋 Te recordamos que tienes una cita de ${appt.serviceName} mañana. ¡Te esperamos!`;

      try {
        const conv = await this.prisma.conversation.findFirst({
          where: {
            tenantId: appt.tenantId,
            contactId: appt.contactId,
            phoneNumberId: account.phoneNumberId,
          },
        });
        if (!conv) {
          this.logger.warn(
            `No conversation found for appointment ${appt.id}, skipping ${label} reminder`,
          );
          continue;
        }
        await this.whatsAppService.sendMessage(
          appt.tenantId,
          account.phoneNumberId,
          appt.contact.waPhone,
          body,
          conv.id,
        );
        await this.prisma.appointment.update({
          where: { id: appt.id },
          data: { [field]: true },
        });
        this.logger.log(`Sent ${label} reminder for appointment ${appt.id}`);
      } catch (err) {
        this.logger.error(`Failed to send ${label} reminder for appointment ${appt.id}:`, err);
      }
    }
  }
}
