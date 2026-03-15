import { Injectable, NotFoundException } from '@nestjs/common';
import { Direction } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns all conversations for the tenant with unread count, sorted by last activity */
  async getConversations(tenantId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId },
      include: {
        contact: true,
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Attach unreadCount: inbound messages since lastReadAt
    return Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            direction: Direction.INBOUND,
            timestamp: conv.lastReadAt ? { gt: conv.lastReadAt } : undefined,
          },
        });
        return { ...conv, unreadCount };
      }),
    );
  }

  /**
   * Returns all messages for a conversation and marks it as read.
   */
  async getMessages(tenantId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const [messages] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: 'asc' },
      }),
      // Mark as read immediately when messages are fetched
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastReadAt: new Date() },
      }),
    ]);

    return messages;
  }

  /** Searches messages by body text and conversations by contact name */
  async search(tenantId: string, q: string) {
    if (!q || q.trim().length < 2) return [];
    const term = q.trim();
    const messages = await this.prisma.message.findMany({
      where: {
        conversation: { tenantId },
        body: { contains: term, mode: 'insensitive' },
      },
      include: {
        conversation: {
          include: { contact: { select: { id: true, name: true, waPhone: true } } },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
    // Also search by contact name
    const byContact = await this.prisma.conversation.findMany({
      where: {
        tenantId,
        contact: { name: { contains: term, mode: 'insensitive' } },
      },
      include: {
        contact: { select: { id: true, name: true, waPhone: true } },
        messages: { orderBy: { timestamp: 'desc' }, take: 1 },
      },
    });
    return { messages, conversations: byContact };
  }

  /** Explicitly marks a conversation as read (called by frontend on open) */
  async markAsRead(tenantId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastReadAt: new Date() },
    });

    return { ok: true };
  }
}
