import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns all conversations for the tenant, sorted by last activity */
  async getConversations(tenantId: string) {
    return this.prisma.conversation.findMany({
      where: { tenantId },
      include: {
        contact: true,
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1, // preview of last message
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  /**
   * Returns all messages for a conversation.
   * Validates that the conversation belongs to the requesting tenant (authorization).
   */
  async getMessages(tenantId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'asc' },
    });
  }
}
