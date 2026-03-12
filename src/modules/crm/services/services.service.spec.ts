import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ServicesService } from './services.service';
import { PrismaService } from '../../../database/prisma.service';

const TENANT_ID = 'tenant-1';

const mockPrisma = {
  service: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const fakeService = {
  id: 'service-1',
  tenantId: TENANT_ID,
  name: 'Diseño de cejas',
  price: 25000,
  duration: 60,
  description: 'Microblading',
  isActive: true,
  daysForNextTouchup: 30,
};

describe('ServicesService', () => {
  let service: ServicesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all services sorted by name', async () => {
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);

      const result = await service.findAll(TENANT_ID);

      expect(mockPrisma.service.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID },
          orderBy: { name: 'asc' },
        }),
      );
      expect(result).toEqual([fakeService]);
    });

    it('filters only active services when activeOnly=true', async () => {
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);

      await service.findAll(TENANT_ID, true);

      expect(mockPrisma.service.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, isActive: true },
        }),
      );
    });

    it('does not filter by isActive when activeOnly=false (default)', async () => {
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);

      await service.findAll(TENANT_ID, false);

      const callArg = mockPrisma.service.findMany.mock.calls[0][0];
      expect(callArg.where).not.toHaveProperty('isActive');
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the service when found for tenant', async () => {
      mockPrisma.service.findFirst.mockResolvedValue(fakeService);

      const result = await service.findOne(TENANT_ID, 'service-1');

      expect(result).toEqual(fakeService);
      expect(mockPrisma.service.findFirst).toHaveBeenCalledWith({
        where: { id: 'service-1', tenantId: TENANT_ID },
      });
    });

    it('throws NotFoundException when service not found', async () => {
      mockPrisma.service.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      name: 'Extensión de pestañas',
      price: 35000,
      duration: 90,
      description: 'Volumen ruso',
      isActive: true,
      daysForNextTouchup: 21,
    };

    it('creates service with all fields and defaults isActive to true', async () => {
      mockPrisma.service.create.mockResolvedValue({ ...dto, id: 'service-2', tenantId: TENANT_ID });

      const result = await service.create(TENANT_ID, dto);

      expect(mockPrisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            name: dto.name,
            price: dto.price,
            isActive: true,
          }),
        }),
      );
      expect(result.name).toBe(dto.name);
    });

    it('defaults isActive to true when not specified', async () => {
      const dtoNoActive = { name: 'Test', price: 1000 };
      mockPrisma.service.create.mockResolvedValue({ ...dtoNoActive, id: 's-1', tenantId: TENANT_ID, isActive: true });

      await service.create(TENANT_ID, dtoNoActive as any);

      expect(mockPrisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates service after ownership check', async () => {
      mockPrisma.service.findFirst.mockResolvedValue(fakeService);
      mockPrisma.service.update.mockResolvedValue({ ...fakeService, name: 'Updated' });

      const result = await service.update(TENANT_ID, 'service-1', {
        ...fakeService,
        name: 'Updated',
      });

      expect(mockPrisma.service.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'service-1' } }),
      );
      expect(result.name).toBe('Updated');
    });

    it('throws NotFoundException when service not found', async () => {
      mockPrisma.service.findFirst.mockResolvedValue(null);
      await expect(
        service.update(TENANT_ID, 'missing', fakeService as any),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.service.update).not.toHaveBeenCalled();
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes service and returns { ok: true }', async () => {
      mockPrisma.service.findFirst.mockResolvedValue(fakeService);
      mockPrisma.service.delete.mockResolvedValue({});

      const result = await service.remove(TENANT_ID, 'service-1');

      expect(mockPrisma.service.delete).toHaveBeenCalledWith({ where: { id: 'service-1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when service not found', async () => {
      mockPrisma.service.findFirst.mockResolvedValue(null);
      await expect(service.remove(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.service.delete).not.toHaveBeenCalled();
    });
  });
});
