import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService, IMessageEmitter } from './webhook.service';
import { PrismaService } from '../../database/prisma.service';
import { Direction, MessageType, MessageStatus } from '@prisma/client';

const TENANT_ID = 'tenant-1';
const PHONE_NUMBER_ID = 'PHONE_001';
const FROM = '5491112345678';
const WA_MSG_ID = 'wamid.abc123';

const mockPrisma = {
  whatsAppAccount: { findUnique: jest.fn() },
  contact: { upsert: jest.fn() },
  conversation: { upsert: jest.fn() },
  message: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const buildWebhookPayload = (overrides: Record<string, any> = {}) => ({
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: PHONE_NUMBER_ID },
            messages: [
              {
                id: WA_MSG_ID,
                from: FROM,
                timestamp: String(Math.floor(Date.now() / 1000)),
                text: { body: 'Test message' },
                ...overrides,
              },
            ],
          },
        },
      ],
    },
  ],
});

describe('WebhookService', () => {
  let service: WebhookService;
  let mockEmitter: jest.Mocked<IMessageEmitter>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);

    mockEmitter = { emitNewMessage: jest.fn() };
    service.registerEmitter(mockEmitter);
  });

  describe('processPayload', () => {
    it('resolves tenant, upserts contact+conversation, saves message, emits WS event', async () => {
      mockPrisma.whatsAppAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        tenantId: TENANT_ID,
      });
      mockPrisma.contact.upsert.mockResolvedValue({
        id: 'contact-1',
        waPhone: FROM,
        name: null,
      });
      mockPrisma.conversation.upsert.mockResolvedValue({ id: 'conv-1' });
      mockPrisma.message.findUnique.mockResolvedValue(null); // no duplicate
      const fakeMsg = {
        id: 'msg-1',
        waMessageId: WA_MSG_ID,
        direction: Direction.INBOUND,
        type: MessageType.TEXT,
        body: 'Test message',
        status: MessageStatus.DELIVERED,
      };
      mockPrisma.message.create.mockResolvedValue(fakeMsg);

      await service.processPayload(buildWebhookPayload());

      expect(mockPrisma.whatsAppAccount.findUnique).toHaveBeenCalledWith({
        where: { phoneNumberId: PHONE_NUMBER_ID },
      });
      expect(mockPrisma.contact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_waPhone: { tenantId: TENANT_ID, waPhone: FROM } },
          create: expect.objectContaining({ tenantId: TENANT_ID, waPhone: FROM }),
        }),
      );
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: Direction.INBOUND,
            type: MessageType.TEXT,
            body: 'Test message',
          }),
        }),
      );
      expect(mockEmitter.emitNewMessage).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ id: 'msg-1', conversationId: 'conv-1' }),
      );
    });

    it('ignores payload with no messages array', async () => {
      await service.processPayload({ entry: [{ changes: [{ value: {} }] }] });
      expect(mockPrisma.whatsAppAccount.findUnique).not.toHaveBeenCalled();
    });

    it('logs warning and skips when phoneNumberId is not registered', async () => {
      mockPrisma.whatsAppAccount.findUnique.mockResolvedValue(null);

      await service.processPayload(buildWebhookPayload());

      expect(mockPrisma.contact.upsert).not.toHaveBeenCalled();
      expect(mockEmitter.emitNewMessage).not.toHaveBeenCalled();
    });

    it('skips duplicate messages (same waMessageId)', async () => {
      mockPrisma.whatsAppAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        tenantId: TENANT_ID,
      });
      mockPrisma.contact.upsert.mockResolvedValue({ id: 'contact-1', waPhone: FROM, name: null });
      mockPrisma.conversation.upsert.mockResolvedValue({ id: 'conv-1' });
      mockPrisma.message.findUnique.mockResolvedValue({ id: 'existing-msg' }); // duplicate

      await service.processPayload(buildWebhookPayload());

      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(mockEmitter.emitNewMessage).not.toHaveBeenCalled();
    });
  });
});
