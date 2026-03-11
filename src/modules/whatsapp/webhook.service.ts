import { Injectable, Logger } from '@nestjs/common';
import { Direction, MessageStatus, MessageType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** Minimal interface so WebhookService can emit without importing ChatGateway directly (avoids circular dep) */
export interface IMessageEmitter {
  emitNewMessage(tenantId: string, payload: unknown): void;
  emitMessageStatus(tenantId: string, waMessageId: string, status: string): void;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private emitter: IMessageEmitter | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** ChatGateway calls this once after both providers are initialized */
  registerEmitter(emitter: IMessageEmitter): void {
    this.emitter = emitter;
  }

  /**
   * Entry point for all inbound Meta webhook events (POST /api/webhook).
   * Resolves the tenant from the phoneNumberId, upserts contact/conversation,
   * deduplicates by waMessageId, persists the message, and fires a WebSocket event.
   */
  async processPayload(body: unknown): Promise<void> {
    const payload = body as any;
    const value = payload?.entry?.[0]?.changes?.[0]?.value;

    if (!value) return;

    // Handle status updates (DELIVERED, READ, FAILED)
    if (value.statuses?.length) {
      await this.processStatuses(value.statuses, value.metadata?.phone_number_id);
    }

    if (!value?.messages?.length) return;

    const rawMsg = value.messages[0];
    const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
    const from: string | undefined = rawMsg.from;
    const text: string = rawMsg.text?.body ?? '';
    const waMessageId: string = rawMsg.id;
    const timestamp = new Date(parseInt(rawMsg.timestamp, 10) * 1000);

    if (!phoneNumberId || !from) return;

    // 1. Resolve tenant
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { phoneNumberId },
    });
    if (!account) {
      this.logger.warn(`Unregistered phoneNumberId=${phoneNumberId} — ignoring`);
      return;
    }
    const { tenantId } = account;

    // 2. Upsert contact
    const contact = await this.prisma.contact.upsert({
      where: { tenantId_waPhone: { tenantId, waPhone: from } },
      update: {},
      create: { tenantId, waPhone: from },
    });

    // 3. Upsert conversation
    const conversation = await this.prisma.conversation.upsert({
      where: {
        tenantId_contactId_phoneNumberId: {
          tenantId,
          contactId: contact.id,
          phoneNumberId,
        },
      },
      update: { lastMessageAt: timestamp },
      create: {
        tenantId,
        contactId: contact.id,
        phoneNumberId,
        lastMessageAt: timestamp,
      },
    });

    // 4. Deduplicate
    const duplicate = await this.prisma.message.findUnique({
      where: { waMessageId },
    });
    if (duplicate) return;

    // 5. Persist message
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        waMessageId,
        direction: Direction.INBOUND,
        type: MessageType.TEXT,
        body: text,
        status: MessageStatus.DELIVERED,
        timestamp,
      },
    });

    // 6. Real-time push to tenant room
    this.emitter?.emitNewMessage(tenantId, {
      ...message,
      contact: { id: contact.id, waPhone: from, name: contact.name },
      conversationId: conversation.id,
    });
  }

  private async processStatuses(statuses: any[], phoneNumberId: string): Promise<void> {
    for (const s of statuses) {
      const waMessageId: string = s.id;
      const rawStatus: string = s.status; // sent | delivered | read | failed
      const status = rawStatus.toUpperCase(); // match MessageStatus enum

      // Update DB
      try {
        await this.prisma.message.update({
          where: { waMessageId },
          data: { status: status as any },
        });
      } catch {
        // Message might not exist yet (e.g. race condition) — ignore
        return;
      }

      // Find tenant for this phone number to emit to the right room
      const account = await this.prisma.whatsAppAccount.findUnique({
        where: { phoneNumberId },
      });
      if (!account) return;

      this.emitter?.emitMessageStatus(account.tenantId, waMessageId, status);
    }
  }
}
