import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { WhatsAppService } from './whatsapp.service';
import { PrismaService } from '../../database/prisma.service';
import { Direction, MessageType, MessageStatus } from '@prisma/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockPrisma = {
  whatsAppAccount: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  message: {
    create: jest.fn(),
  },
  conversation: {
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockConfig = {
  getOrThrow: jest.fn((key: string) => {
    const map: Record<string, string> = {
      META_APP_ID: 'APP123',
      META_APP_SECRET: 'SECRET456',
    };
    return map[key];
  }),
};

const TENANT_ID = 'tenant-1';
const PHONE_NUMBER_ID = 'PHONE_001';

describe('WhatsAppService', () => {
  let service: WhatsAppService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<WhatsAppService>(WhatsAppService);
  });

  // ── connectAccount ───────────────────────────────────────────────────────

  describe('connectAccount', () => {
    const dto = {
      accessToken: 'short-lived-token',
      wabaId: 'WABA_001',
      phoneNumberId: PHONE_NUMBER_ID,
    };

    it('validates token, exchanges for long-lived, upserts account', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({ data: { data: { is_valid: true } } })   // debug_token
        .mockResolvedValueOnce({ data: { access_token: 'long-token' } }) // exchange
        .mockResolvedValueOnce({                                          // phone details
          data: {
            display_phone_number: '+1 555 000 0001',
            verified_name: 'Test Business',
          },
        });

      const fakeAccount = { id: 'acc-1', phoneNumberId: PHONE_NUMBER_ID };
      mockPrisma.whatsAppAccount.upsert.mockResolvedValue(fakeAccount);

      const result = await service.connectAccount(TENANT_ID, dto);

      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
      expect(mockPrisma.whatsAppAccount.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { phoneNumberId: dto.phoneNumberId },
          create: expect.objectContaining({
            tenantId: TENANT_ID,
            accessToken: 'long-token',
          }),
        }),
      );
      expect(result).toEqual(fakeAccount);
    });

    it('throws BadRequestException when Meta token is invalid', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { data: { is_valid: false } },
      });

      await expect(service.connectAccount(TENANT_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.whatsAppAccount.upsert).not.toHaveBeenCalled();
    });
  });

  // ── sendMessage ──────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    const fakeAccount = {
      id: 'acc-1',
      tenantId: TENANT_ID,
      phoneNumberId: PHONE_NUMBER_ID,
      accessToken: 'long-token',
    };
    const fakeMessage = {
      id: 'msg-1',
      conversationId: 'conv-1',
      direction: Direction.OUTBOUND,
      type: MessageType.TEXT,
      body: 'Hello!',
      status: MessageStatus.SENT,
      timestamp: new Date(),
    };

    it('sends message via Meta API and persists it', async () => {
      mockPrisma.whatsAppAccount.findFirst.mockResolvedValue(fakeAccount);
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: { messages: [{ id: 'wamid.abc123' }] },
      });
      mockPrisma.$transaction.mockResolvedValue([fakeMessage, {}]);

      const result = await service.sendMessage(
        TENANT_ID,
        PHONE_NUMBER_ID,
        '5491112345678',
        'Hello!',
        'conv-1',
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining(PHONE_NUMBER_ID),
        expect.objectContaining({ type: 'text', to: '5491112345678' }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${fakeAccount.accessToken}`,
          }),
        }),
      );
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual(fakeMessage);
    });

    it('throws NotFoundException when account not linked to tenant', async () => {
      mockPrisma.whatsAppAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.sendMessage(TENANT_ID, PHONE_NUMBER_ID, '123', 'Hi', 'conv-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getAccountsForTenant ─────────────────────────────────────────────────

  describe('getAccountsForTenant', () => {
    it('returns filtered accounts for tenant', async () => {
      const accounts = [{ id: 'acc-1', phoneNumber: '+1 555' }];
      mockPrisma.whatsAppAccount.findMany.mockResolvedValue(accounts);

      const result = await service.getAccountsForTenant(TENANT_ID);

      expect(mockPrisma.whatsAppAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, isActive: true },
        }),
      );
      expect(result).toEqual(accounts);
    });
  });
});
