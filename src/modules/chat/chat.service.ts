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
