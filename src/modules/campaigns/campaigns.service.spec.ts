// use context7
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_ID = 'tenant-1';

const mockPrisma = {
  campaign: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  campaignRecipient: {
    createMany: jest.fn(),
    count: jest.fn(),
  },
  contact: {
    findMany: jest.fn(),
  },
  income: {
    groupBy: jest.fn(),
  },
};

const fakeCampaign = {
  id: 'camp-1',
  tenantId: TENANT_ID,
  name: 'Campaña Marzo',
  message: 'Hola! Tenemos novedades para ti 🌸',
  templateId: null,
  segment: 'vip',
  status: 'DRAFT',
  scheduledAt: null,
  startedAt: null,
  completedAt: null,
  sentCount: 0,
  failedCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CampaignsService', () => {
  let service: CampaignsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates campaign with DRAFT status', async () => {
      mockPrisma.campaign.create.mockResolvedValue(fakeCampaign);

      const result = await service.create(TENANT_ID, {
        name: 'Campaña Marzo',
        message: 'Hola!',
        segment: 'vip',
      });

      expect(mockPrisma.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: TENANT_ID, status: 'DRAFT' }),
        }),
      );
      expect(result.status).toBe('DRAFT');
    });

    it('throws BadRequestException when neither message nor templateId provided', async () => {
      await expect(
        service.create(TENANT_ID, { name: 'Test', segment: 'vip' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns campaigns for tenant ordered by createdAt desc', async () => {
      mockPrisma.campaign.findMany.mockResolvedValue([fakeCampaign]);

      const result = await service.findAll(TENANT_ID);

      expect(mockPrisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns campaign with recipients', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue({
        ...fakeCampaign,
        recipients: [],
      });

      const result = await service.findOne(TENANT_ID, 'camp-1');

      expect(result).toHaveProperty('recipients');
    });

    it('throws NotFoundException when campaign not found', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── cancel ────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels a SCHEDULED campaign', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue({ ...fakeCampaign, status: 'SCHEDULED' });
      mockPrisma.campaign.update.mockResolvedValue({ ...fakeCampaign, status: 'FAILED' });

      const result = await service.cancel(TENANT_ID, 'camp-1');

      expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'FAILED' } }),
      );
    });

    it('throws BadRequestException when campaign is already COMPLETED', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue({ ...fakeCampaign, status: 'COMPLETED' });

      await expect(service.cancel(TENANT_ID, 'camp-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes campaign in DRAFT status', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue({ ...fakeCampaign, status: 'DRAFT' });
      mockPrisma.campaign.delete.mockResolvedValue({});

      const result = await service.remove(TENANT_ID, 'camp-1');

      expect(mockPrisma.campaign.delete).toHaveBeenCalledWith({ where: { id: 'camp-1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws BadRequestException when campaign is not DRAFT', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue({ ...fakeCampaign, status: 'COMPLETED' });

      await expect(service.remove(TENANT_ID, 'camp-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── resolveRecipients ──────────────────────────────────────────────────────

  describe('resolveRecipients', () => {
    it('returns all contacts when segment is "all"', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 'c1', waPhone: '1' },
        { id: 'c2', waPhone: '2' },
      ]);
      mockPrisma.income.groupBy.mockResolvedValue([]);

      const result = await service.resolveRecipients(TENANT_ID, 'all', undefined);

      expect(mockPrisma.contact.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('returns contacts from contactIds list when no segment provided', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([{ id: 'c1', waPhone: '1' }]);

      const result = await service.resolveRecipients(TENANT_ID, undefined, ['c1', 'c2']);

      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['c1', 'c2'] } }),
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ── exportRecipientsCsv ───────────────────────────────────────────────────────

  describe('exportRecipientsCsv', () => {
    it('returns CSV string with header and recipient rows', async () => {
      const campaignWithRecipients = {
        ...fakeCampaign,
        recipients: [
          {
            id: 'r-1',
            status: 'SENT',
            sentAt: new Date('2026-03-15T10:00:00Z'),
            contact: { id: 'c-1', name: 'Alice', waPhone: '+56912345678' },
          },
          {
            id: 'r-2',
            status: 'FAILED',
            sentAt: null,
            contact: { id: 'c-2', name: null, waPhone: '+56987654321' },
          },
        ],
      };
      mockPrisma.campaign.findFirst.mockResolvedValue(campaignWithRecipients);

      const result = await service.exportRecipientsCsv(TENANT_ID, 'camp-1');

      expect(result).toContain('"nombre"');
      expect(result).toContain('"telefono"');
      expect(result).toContain('Alice');
      expect(result).toContain('+56912345678');
      expect(result).toContain('SENT');
      expect(result).toContain('+56987654321');
      expect(result).toContain('FAILED');
    });

    it('throws NotFoundException when campaign does not belong to tenant', async () => {
      mockPrisma.campaign.findFirst.mockResolvedValue(null);

      await expect(service.exportRecipientsCsv(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
