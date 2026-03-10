import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { WebhookService } from '../whatsapp/webhook.service';

const TENANT_ID = 'tenant-1';
const VALID_TOKEN = 'valid.jwt.token';

const mockJwtService = {
  verify: jest.fn().mockReturnValue({ sub: 'user-1', tenantId: TENANT_ID }),
};

const mockWebhookService = {
  registerEmitter: jest.fn(),
};

const mockServer = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

function makeSocket(token?: string) {
  const rooms = new Set<string>();
  return {
    id: 'socket-1',
    handshake: { auth: { token: token ?? VALID_TOKEN }, headers: {} },
    data: {} as Record<string, string>,
    join: jest.fn((room: string) => rooms.add(room)),
    disconnect: jest.fn(),
    rooms,
  };
}

describe('ChatGateway', () => {
  let gateway: ChatGateway;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    // Inject mock server
    (gateway as any).server = mockServer;
  });

  it('onModuleInit registers gateway as emitter in WebhookService', () => {
    gateway.onModuleInit();
    expect(mockWebhookService.registerEmitter).toHaveBeenCalledWith(gateway);
  });

  describe('handleConnection', () => {
    it('joins tenant room when JWT is valid', async () => {
      const socket = makeSocket(VALID_TOKEN);
      await gateway.handleConnection(socket as any);

      expect(socket.join).toHaveBeenCalledWith(`tenant:${TENANT_ID}`);
      expect(socket.data.tenantId).toBe(TENANT_ID);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects client when JWT is invalid', async () => {
      mockJwtService.verify.mockImplementationOnce(() => {
        throw new Error('invalid token');
      });
      const socket = makeSocket('bad-token');
      await gateway.handleConnection(socket as any);

      expect(socket.disconnect).toHaveBeenCalled();
    });
  });

  describe('emitNewMessage', () => {
    it('broadcasts to the correct tenant room', () => {
      const payload = { id: 'msg-1', body: 'Hello' };
      gateway.emitNewMessage(TENANT_ID, payload);

      expect(mockServer.to).toHaveBeenCalledWith(`tenant:${TENANT_ID}`);
      expect(mockServer.emit).toHaveBeenCalledWith('new-message', payload);
    });
  });

  describe('emitMessageStatus', () => {
    it('broadcasts status update to tenant room', () => {
      gateway.emitMessageStatus(TENANT_ID, 'wamid.abc', 'READ');

      expect(mockServer.to).toHaveBeenCalledWith(`tenant:${TENANT_ID}`);
      expect(mockServer.emit).toHaveBeenCalledWith('message-status', {
        waMessageId: 'wamid.abc',
        status: 'READ',
      });
    });
  });
});
