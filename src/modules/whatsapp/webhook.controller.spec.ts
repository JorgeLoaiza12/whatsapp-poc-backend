import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

const VERIFY_TOKEN = 'my_test_verify_token';

const mockWebhookService = { processPayload: jest.fn().mockResolvedValue(undefined) };
const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue(VERIFY_TOKEN),
};

const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe('WebhookController', () => {
  let controller: WebhookController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: WebhookService, useValue: mockWebhookService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  describe('verify() — GET /api/webhook', () => {
    it('returns challenge when mode and token match', () => {
      const res = mockRes();
      controller.verify('subscribe', VERIFY_TOKEN, 'challenge123', res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('challenge123');
    });

    it('returns 403 when token does not match', () => {
      const res = mockRes();
      controller.verify('subscribe', 'wrong-token', 'challenge', res as any);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 403 when mode is not subscribe', () => {
      const res = mockRes();
      controller.verify('unsubscribe', VERIFY_TOKEN, 'challenge', res as any);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('receive() — POST /api/webhook', () => {
    it('calls processPayload and returns ok immediately', async () => {
      const body = { entry: [] };
      const result = await controller.receive(body);

      expect(result).toEqual({ status: 'ok' });
      // Fire-and-forget — just check it was called
      await new Promise(setImmediate);
      expect(mockWebhookService.processPayload).toHaveBeenCalledWith(body);
    });
  });
});
