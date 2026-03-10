import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_ID = 'tenant-1';

const mockPrisma = {
  conversation: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  message: {
    findMany: jest.fn(),
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
    it('returns conversations filtered by tenantId sorted by lastMessageAt', async () => {
      const conversations = [
        { id: 'conv-1', tenantId: TENANT_ID, contact: {}, messages: [] },
        { id: 'conv-2', tenantId: TENANT_ID, contact: {}, messages: [] },
      ];
      mockPrisma.conversation.findMany.mockResolvedValue(conversations);

      const result = await service.getConversations(TENANT_ID);

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID },
          orderBy: { lastMessageAt: 'desc' },
        }),
      );
      expect(result).toEqual(conversations);
    });

    it('returns empty array when tenant has no conversations', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);
      const result = await service.getConversations(TENANT_ID);
      expect(result).toEqual([]);
    });
  });

  // ── getMessages ──────────────────────────────────────────────────────────

  describe('getMessages', () => {
    const CONV_ID = 'conv-1';

    it('returns messages in chronological order', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: CONV_ID });
      const messages = [
        { id: 'msg-1', body: 'Hello' },
        { id: 'msg-2', body: 'World' },
      ];
      mockPrisma.message.findMany.mockResolvedValue(messages);

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
      expect(result).toEqual(messages);
    });

    it('throws NotFoundException when conversation belongs to different tenant', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.getMessages(TENANT_ID, 'conv-other-tenant'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });
  });
});
