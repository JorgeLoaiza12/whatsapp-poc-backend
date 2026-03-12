import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Direction } from '@prisma/client';
import { ChatService } from './chat.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_ID = 'tenant-1';

const mockPrisma = {
  conversation: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  message: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  // ── getConversations ─────────────────────────────────────────────────────

  describe('getConversations', () => {
    it('returns conversations with unreadCount, filtered by tenantId, sorted by lastMessageAt', async () => {
      const conversations = [
        { id: 'conv-1', tenantId: TENANT_ID, lastReadAt: null, contact: {}, messages: [] },
        { id: 'conv-2', tenantId: TENANT_ID, lastReadAt: new Date(), contact: {}, messages: [] },
      ];
      mockPrisma.conversation.findMany.mockResolvedValue(conversations);
      mockPrisma.message.count.mockResolvedValue(3);

      const result = await service.getConversations(TENANT_ID);

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID },
          orderBy: { lastMessageAt: 'desc' },
        }),
      );
      // message.count called once per conversation
      expect(mockPrisma.message.count).toHaveBeenCalledTimes(2);
      expect(mockPrisma.message.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            direction: Direction.INBOUND,
          }),
        }),
      );
      expect(result[0]).toMatchObject({ id: 'conv-1', unreadCount: 3 });
    });

    it('returns empty array when tenant has no conversations', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);
      const result = await service.getConversations(TENANT_ID);
      expect(result).toEqual([]);
      expect(mockPrisma.message.count).not.toHaveBeenCalled();
    });
  });

  // ── getMessages ──────────────────────────────────────────────────────────

  describe('getMessages', () => {
    const CONV_ID = 'conv-1';

    it('returns messages in chronological order and marks conversation as read', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: CONV_ID, tenantId: TENANT_ID });
      const messages = [
        { id: 'msg-1', body: 'Hello' },
        { id: 'msg-2', body: 'World' },
      ];
      mockPrisma.message.findMany.mockResolvedValue(messages);
      mockPrisma.conversation.update.mockResolvedValue({});

      const result = await service.getMessages(TENANT_ID, CONV_ID);

      expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: CONV_ID, tenantId: TENANT_ID },
      });
      expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: CONV_ID },
          orderBy: { timestamp: 'asc' },
        }),
      );
      // marks as read
      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONV_ID },
          data: expect.objectContaining({ lastReadAt: expect.any(Date) }),
        }),
      );
      expect(result).toEqual(messages);
    });

    it('throws NotFoundException when conversation belongs to a different tenant', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.getMessages(TENANT_ID, 'conv-other-tenant'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });
  });

  // ── markAsRead ───────────────────────────────────────────────────────────

  describe('markAsRead', () => {
    it('updates lastReadAt and returns { ok: true }', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      mockPrisma.conversation.update.mockResolvedValue({});

      const result = await service.markAsRead(TENANT_ID, 'conv-1');

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastReadAt: expect.any(Date) }),
        }),
      );
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when conversation not found', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      await expect(service.markAsRead(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    });
  });
});
