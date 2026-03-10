import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

const mockChatService = {
  getConversations: jest.fn(),
  getMessages: jest.fn(),
};

const fakeUser = { userId: 'user-1', email: 'a@b.com', tenantId: 'tenant-1' };

describe('ChatController', () => {
  let controller: ChatController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: mockChatService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('getConversations() passes tenantId from JWT to service', async () => {
    const conversations = [{ id: 'conv-1' }];
    mockChatService.getConversations.mockResolvedValue(conversations);

    const result = await controller.getConversations(fakeUser);

    expect(mockChatService.getConversations).toHaveBeenCalledWith(fakeUser.tenantId);
    expect(result).toEqual(conversations);
  });

  it('getMessages() passes tenantId + conversationId to service', async () => {
    const messages = [{ id: 'msg-1' }, { id: 'msg-2' }];
    mockChatService.getMessages.mockResolvedValue(messages);

    const result = await controller.getMessages(fakeUser, 'conv-1');

    expect(mockChatService.getMessages).toHaveBeenCalledWith(fakeUser.tenantId, 'conv-1');
    expect(result).toEqual(messages);
  });
});
