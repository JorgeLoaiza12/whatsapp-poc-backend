import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CampaignsService } from './campaigns.service';

export const CAMPAIGN_SEND_QUEUE = 'campaign-send';

export interface CampaignSendJobData {
  tenantId: string;
  campaignId: string;
}

const SEND_DELAY_MS = 200; // ~5 msg/s — conservative rate to respect Meta limits
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

@Processor(CAMPAIGN_SEND_QUEUE)
export class CampaignSendProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignSendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsApp: WhatsAppService,
    private readonly campaignsService: CampaignsService,
  ) {
    super();
  }

  async process(job: Job<CampaignSendJobData>): Promise<void> {
    const { tenantId, campaignId } = job.data;
    this.logger.log(`Processing campaign ${campaignId} for tenant ${tenantId}`);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
    });
    if (!campaign) {
      this.logger.warn(`Campaign ${campaignId} not found — skipping`);
      return;
    }

    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { tenantId, isActive: true },
    });
    if (!account) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'FAILED' },
      });
      throw new Error('No active WhatsApp account found for tenant');
    }

    const recipients = await this.campaignsService.resolveRecipients(
      tenantId,
      campaign.segment ?? undefined,
      undefined,
    );

    if (recipients.length === 0) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED', startedAt: new Date(), completedAt: new Date() },
      });
      return;
    }

    // Bulk-insert recipients as PENDING
    await this.prisma.campaignRecipient.createMany({
      data: recipients.map((r) => ({
        campaignId,
        contactId: r.id,
        status: 'PENDING',
      })),
      skipDuplicates: true,
    });

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'SENDING', startedAt: new Date() },
    });

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const result = await this.sendToRecipient(
        campaign.message ?? '',
        recipient,
        account.phoneNumberId,
        tenantId,
        campaignId,
        recipient.id,
      );

      if (result.ok) sentCount++;
      else failedCount++;

      // Report progress to BullMQ dashboard
      await job.updateProgress(Math.round(((i + 1) / recipients.length) * 100));

      if (i < recipients.length - 1) await delay(SEND_DELAY_MS);
    }

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED', completedAt: new Date(), sentCount, failedCount },
    });

    this.logger.log(
      `Campaign ${campaignId} completed — sent: ${sentCount}, failed: ${failedCount}`,
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async sendToRecipient(
    messageTemplate: string,
    recipient: { id: string; waPhone: string; name: string | null },
    phoneNumberId: string,
    tenantId: string,
    campaignId: string,
    recipientContactId: string,
  ): Promise<{ ok: boolean }> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { tenantId, contactId: recipient.id },
    });
    if (!conversation) {
      await this.updateRecipient(campaignId, recipientContactId, 'FAILED', undefined, 'No conversation found');
      return { ok: false };
    }

    const body = this.interpolate(messageTemplate, recipient.name ?? recipient.waPhone);

    try {
      const result = await this.whatsApp.sendMessage(
        tenantId,
        phoneNumberId,
        recipient.waPhone,
        body,
        conversation.id,
      );
      await this.updateRecipient(campaignId, recipientContactId, 'SENT', result?.waMessageId ?? undefined);
      return { ok: true };
    } catch (err: any) {
      const errorMessage = err?.message ?? 'Unknown error';
      this.logger.warn(`Campaign ${campaignId} — failed to send to ${recipient.waPhone}: ${errorMessage}`);
      await this.updateRecipient(campaignId, recipientContactId, 'FAILED', undefined, errorMessage);
      return { ok: false };
    }
  }

  private async updateRecipient(
    campaignId: string,
    contactId: string,
    status: 'SENT' | 'FAILED' | 'SKIPPED',
    waMessageId?: string,
    errorMessage?: string,
  ) {
    await this.prisma.campaignRecipient.update({
      where: { campaignId_contactId: { campaignId, contactId } },
      data: {
        status,
        sentAt: status === 'SENT' ? new Date() : undefined,
        waMessageId,
        errorMessage,
      },
    });
  }

  private interpolate(message: string, name: string): string {
    return message.replace(/\{nombre\}/gi, name);
  }
}
