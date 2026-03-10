import { Test, TestingModule } from '@nestjs/testing';
import { MessagesController } from './messages.controller';
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Direction, MessageType, MessageStatus } from '@prisma/client';

const mockWhatsAppService = { sendMessage: jest.fn() };

const fakeUser = { userId: 'user-1', email: 'a@b.com', tenantId: 'tenant-1' };
const fakeMessage = {
  id: 'msg-1',
  direction: Direction.OUTBOUND,
  type: MessageType.TEXT,
  body: 'Hello!',
  status: MessageStatus.SENT,
  timestamp: new Date(),
};

describe('MessagesController', () => {
  let controller: MessagesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [{ provide: WhatsAppService, useValue: mockWhatsAppService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MessagesController>(MessagesController);
  });

  it('send() delegates to WhatsAppService with tenantId from JWT', async () => {
    mockWhatsAppService.sendMessage.mockResolvedValue(fakeMessage);

    const dto = {
      conversationId: 'conv-1',
      to: '5491112345678',
      phoneNumberId: 'PHONE_001',
      body: 'Hello!',
    };

    const result = await controller.send(fakeUser, dto);

    expect(mockWhatsAppService.sendMessage).toHaveBeenCalledWith(
      fakeUser.tenantId, // tenantId from JWT — never from client body
      dto.phoneNumberId,
      dto.to,
      dto.body,
      dto.conversationId,
    );
    expect(result).toEqual(fakeMessage);
  });
});
