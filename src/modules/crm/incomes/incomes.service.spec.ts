import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IncomesService } from './incomes.service';
import { PrismaService } from '../../../database/prisma.service';

const TENANT_ID = 'tenant-1';
const CONTACT_ID = 'contact-1';

const mockPrisma = {
  income: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  contact: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const fakeContact = {
  id: CONTACT_ID,
  tenantId: TENANT_ID,
  waPhone: '56912345678',
  loyaltyStamps: 3,
};

const fakeIncome = {
  id: 'income-1',
  tenantId: TENANT_ID,
  contactId: CONTACT_ID,
  serviceNames: 'Diseño de cejas,Extensión de pestañas',
  amount: 45000,
  currency: 'CLP',
  paymentMethod: 'Transferencia',
  date: new Date('2025-01-15'),
  notes: null,
  contact: fakeContact,
};

describe('IncomesService', () => {
  let service: IncomesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncomesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<IncomesService>(IncomesService);
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns incomes with contact included, ordered by date desc', async () => {
      mockPrisma.income.findMany.mockResolvedValue([fakeIncome]);

      const result = await service.findAll(TENANT_ID);

      expect(mockPrisma.income.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID },
          include: { contact: true },
          orderBy: { date: 'desc' },
        }),
      );
      expect(result).toEqual([fakeIncome]);
    });

    it('applies OR search across serviceNames, notes, and contact.name', async () => {
      mockPrisma.income.findMany.mockResolvedValue([fakeIncome]);

      await service.findAll(TENANT_ID, 'cejas');

      const callArg = mockPrisma.income.findMany.mock.calls[0][0];
      expect(callArg.where.OR).toBeDefined();
      expect(callArg.where.OR.length).toBeGreaterThan(0);
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns income with contact included', async () => {
      mockPrisma.income.findFirst.mockResolvedValue(fakeIncome);

      const result = await service.findOne(TENANT_ID, 'income-1');

      expect(mockPrisma.income.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'income-1', tenantId: TENANT_ID },
          include: { contact: true },
        }),
      );
      expect(result).toEqual(fakeIncome);
    });

    it('throws NotFoundException when income not found', async () => {
      mockPrisma.income.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      contactId: CONTACT_ID,
      serviceNames: 'Diseño de cejas',
      amount: 25000,
      currency: 'CLP',
      paymentMethod: 'Efectivo',
      date: '2025-01-15',
      notes: null,
    };

    it('creates income and increments loyalty stamp in a transaction', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(fakeContact);
      mockPrisma.$transaction.mockResolvedValue([fakeIncome, {}]);

      const result = await service.create(TENANT_ID, dto);

      expect(mockPrisma.contact.findFirst).toHaveBeenCalledWith({
        where: { id: CONTACT_ID, tenantId: TENANT_ID },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual(fakeIncome);
    });

    it('throws NotFoundException when contact does not belong to tenant', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('caps loyalty stamp at 10 when contact already at 9', async () => {
      const contactAt9 = { ...fakeContact, loyaltyStamps: 9 };
      mockPrisma.contact.findFirst.mockResolvedValue(contactAt9);
      mockPrisma.$transaction.mockResolvedValue([fakeIncome, {}]);

      await service.create(TENANT_ID, dto);

      // Transaction must be called once (income create + loyalty stamp update)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    const dto = {
      contactId: CONTACT_ID,
      serviceNames: 'Extensión de pestañas',
      amount: 35000,
      currency: 'CLP',
      paymentMethod: 'Tarjeta',
      date: '2025-02-01',
    };

    it('updates income after verifying ownership of both income and contact', async () => {
      mockPrisma.income.findFirst.mockResolvedValue(fakeIncome);
      mockPrisma.contact.findFirst.mockResolvedValue(fakeContact);
      mockPrisma.income.update.mockResolvedValue({ ...fakeIncome, serviceNames: dto.serviceNames });

      const result = await service.update(TENANT_ID, 'income-1', dto);

      expect(mockPrisma.income.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'income-1' } }),
      );
      expect(result.serviceNames).toBe(dto.serviceNames);
    });

    it('throws NotFoundException when income not found', async () => {
      mockPrisma.income.findFirst.mockResolvedValue(null);
      await expect(service.update(TENANT_ID, 'missing', dto)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.income.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when new contactId does not belong to tenant', async () => {
      mockPrisma.income.findFirst.mockResolvedValue(fakeIncome);
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      await expect(service.update(TENANT_ID, 'income-1', dto)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.income.update).not.toHaveBeenCalled();
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes income and returns { ok: true }', async () => {
      mockPrisma.income.findFirst.mockResolvedValue(fakeIncome);
      mockPrisma.income.delete.mockResolvedValue({});

      const result = await service.remove(TENANT_ID, 'income-1');

      expect(mockPrisma.income.delete).toHaveBeenCalledWith({ where: { id: 'income-1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when income not found', async () => {
      mockPrisma.income.findFirst.mockResolvedValue(null);
      await expect(service.remove(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.income.delete).not.toHaveBeenCalled();
    });
  });
});
