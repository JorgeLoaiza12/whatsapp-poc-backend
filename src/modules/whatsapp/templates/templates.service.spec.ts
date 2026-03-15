// use context7
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { PrismaService } from '../../../database/prisma.service';

const TENANT_ID = 'tenant-1';
const WABA_ID = 'waba-1';

const mockPrisma = {
  waTemplate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    createMany: jest.fn(),
  },
  whatsAppAccount: {
    findFirst: jest.fn(),
  },
};

const fakeTemplate = {
  id: 'tpl-1',
  tenantId: TENANT_ID,
  wabaId: WABA_ID,
  name: 'recordatorio_cita',
  language: 'es',
  category: 'UTILITY',
  status: 'APPROVED',
  components: [{ type: 'BODY', text: 'Hola {{1}}, te recordamos tu cita.' }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockHttpService = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
};

describe('TemplatesService', () => {
  let service: TemplatesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'META_HTTP', useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<TemplatesService>(TemplatesService);
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all templates for tenant ordered by name', async () => {
      mockPrisma.waTemplate.findMany.mockResolvedValue([fakeTemplate]);

      const result = await service.findAll(TENANT_ID);

      expect(mockPrisma.waTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_ID } }),
      );
      expect(result).toEqual([fakeTemplate]);
    });
  });

  // ── syncFromMeta ──────────────────────────────────────────────────────────

  describe('syncFromMeta', () => {
    it('returns empty array when tenant has no WhatsApp account', async () => {
      mockPrisma.whatsAppAccount.findFirst.mockResolvedValue(null);

      const result = await service.syncFromMeta(TENANT_ID);

      expect(result).toEqual([]);
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('upserts each template returned by Meta API', async () => {
      mockPrisma.whatsAppAccount.findFirst.mockResolvedValue({
        wabaId: WABA_ID,
        accessToken: 'tok-123',
      });

      const metaTemplates = [
        {
          id: 'meta-tpl-1',
          name: 'recordatorio_cita',
          language: 'es',
          category: 'UTILITY',
          status: 'APPROVED',
          components: [{ type: 'BODY', text: 'Hola.' }],
        },
      ];
      mockHttpService.get.mockResolvedValue({ data: { data: metaTemplates } });
      mockPrisma.waTemplate.upsert.mockResolvedValue(fakeTemplate);

      const result = await service.syncFromMeta(TENANT_ID);

      expect(mockPrisma.waTemplate.upsert).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it('handles Meta API errors gracefully and returns empty array', async () => {
      mockPrisma.whatsAppAccount.findFirst.mockResolvedValue({
        wabaId: WABA_ID,
        accessToken: 'tok-123',
      });
      mockHttpService.get.mockRejectedValue(new Error('Meta API down'));

      const result = await service.syncFromMeta(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('throws NotFoundException when template does not belong to tenant', async () => {
      mockPrisma.waTemplate.findFirst.mockResolvedValue(null);

      await expect(service.remove(TENANT_ID, 'tpl-missing')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.waTemplate.delete).not.toHaveBeenCalled();
    });

    it('deletes template from DB and returns { ok: true }', async () => {
      mockPrisma.waTemplate.findFirst.mockResolvedValue(fakeTemplate);
      mockPrisma.waTemplate.delete.mockResolvedValue(fakeTemplate);
      mockPrisma.whatsAppAccount.findFirst.mockResolvedValue({
        wabaId: WABA_ID,
        accessToken: 'tok-123',
      });
      mockHttpService.delete.mockResolvedValue({ data: { success: true } });

      const result = await service.remove(TENANT_ID, 'tpl-1');

      expect(mockPrisma.waTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } });
      expect(result).toEqual({ ok: true });
    });
  });
});
