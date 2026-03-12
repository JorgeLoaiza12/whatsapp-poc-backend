import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { PrismaService } from '../../../database/prisma.service';

const TENANT_ID = 'tenant-1';

const mockPrisma = {
  tenantCurrency: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
};

describe('CurrenciesService', () => {
  let service: CurrenciesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrenciesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CurrenciesService>(CurrenciesService);
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all 3 currencies (CLP, USD, VES) with their active state', async () => {
      mockPrisma.tenantCurrency.findMany.mockResolvedValue([
        { currency: 'USD', isActive: true },
        { currency: 'VES', isActive: false },
      ]);

      const result = await service.findAll(TENANT_ID);

      expect(result).toHaveLength(3);
      const currencies = result.map((r) => r.currency);
      expect(currencies).toContain('CLP');
      expect(currencies).toContain('USD');
      expect(currencies).toContain('VES');
    });

    it('defaults CLP to active when no DB record exists for it', async () => {
      mockPrisma.tenantCurrency.findMany.mockResolvedValue([]);

      const result = await service.findAll(TENANT_ID);

      const clp = result.find((r) => r.currency === 'CLP');
      expect(clp?.isActive).toBe(true);
    });

    it('defaults USD and VES to inactive when no DB record exists', async () => {
      mockPrisma.tenantCurrency.findMany.mockResolvedValue([]);

      const result = await service.findAll(TENANT_ID);

      const usd = result.find((r) => r.currency === 'USD');
      const ves = result.find((r) => r.currency === 'VES');
      expect(usd?.isActive).toBe(false);
      expect(ves?.isActive).toBe(false);
    });
  });

  // ── toggle ───────────────────────────────────────────────────────────────

  describe('toggle', () => {
    it('upserts currency active state', async () => {
      mockPrisma.tenantCurrency.findMany.mockResolvedValue([
        { currency: 'CLP', isActive: true },
        { currency: 'USD', isActive: false },
      ]);
      mockPrisma.tenantCurrency.upsert.mockResolvedValue({ currency: 'USD', isActive: true });

      const result = await service.toggle(TENANT_ID, 'USD', true);

      expect(mockPrisma.tenantCurrency.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_currency: { tenantId: TENANT_ID, currency: 'USD' } },
          update: { isActive: true },
          create: expect.objectContaining({ tenantId: TENANT_ID, currency: 'USD', isActive: true }),
        }),
      );
      expect(result).toEqual({ currency: 'USD', isActive: true });
    });

    it('throws BadRequestException for unsupported currency code', async () => {
      await expect(service.toggle(TENANT_ID, 'EUR', true)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.tenantCurrency.upsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when disabling the last active currency', async () => {
      // Only CLP is active; trying to disable it
      mockPrisma.tenantCurrency.findMany.mockResolvedValue([
        { currency: 'CLP', isActive: true },
        { currency: 'USD', isActive: false },
        { currency: 'VES', isActive: false },
      ]);

      await expect(service.toggle(TENANT_ID, 'CLP', false)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.tenantCurrency.upsert).not.toHaveBeenCalled();
    });

    it('allows disabling a currency when at least one other remains active', async () => {
      mockPrisma.tenantCurrency.findMany.mockResolvedValue([
        { currency: 'CLP', isActive: true },
        { currency: 'USD', isActive: true },
        { currency: 'VES', isActive: false },
      ]);
      mockPrisma.tenantCurrency.upsert.mockResolvedValue({ currency: 'USD', isActive: false });

      await expect(service.toggle(TENANT_ID, 'USD', false)).resolves.not.toThrow();
    });
  });

  // ── getActiveCurrencies ──────────────────────────────────────────────────

  describe('getActiveCurrencies', () => {
    it('returns only active currency codes as strings', async () => {
      mockPrisma.tenantCurrency.findMany.mockResolvedValue([
        { currency: 'USD', isActive: true },
        { currency: 'VES', isActive: false },
      ]);

      const result = await service.getActiveCurrencies(TENANT_ID);

      expect(result).toContain('CLP'); // default active
      expect(result).toContain('USD'); // explicitly active
      expect(result).not.toContain('VES'); // inactive
    });
  });
});
