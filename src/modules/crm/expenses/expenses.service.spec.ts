import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../../../database/prisma.service';

const TENANT_ID = 'tenant-1';

const mockPrisma = {
  expense: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const fakeExpense = {
  id: 'expense-1',
  tenantId: TENANT_ID,
  amount: 15000,
  currency: 'CLP',
  category: 'Insumos',
  description: 'Pigmentos',
  paymentMethod: 'Transferencia',
  date: new Date('2025-01-10'),
  notes: 'Pedido mensual',
};

describe('ExpensesService', () => {
  let service: ExpensesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all expenses ordered by date desc', async () => {
      mockPrisma.expense.findMany.mockResolvedValue([fakeExpense]);

      const result = await service.findAll(TENANT_ID);

      expect(mockPrisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID },
          orderBy: { date: 'desc' },
        }),
      );
      expect(result).toEqual([fakeExpense]);
    });

    it('applies OR search across category, description, and notes', async () => {
      mockPrisma.expense.findMany.mockResolvedValue([fakeExpense]);

      await service.findAll(TENANT_ID, 'insumos');

      const callArg = mockPrisma.expense.findMany.mock.calls[0][0];
      expect(callArg.where.OR).toBeDefined();
      expect(callArg.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: expect.objectContaining({ contains: 'insumos' }) }),
        ]),
      );
    });

    it('does not apply OR filter when no search term', async () => {
      mockPrisma.expense.findMany.mockResolvedValue([]);

      await service.findAll(TENANT_ID);

      const callArg = mockPrisma.expense.findMany.mock.calls[0][0];
      expect(callArg.where).not.toHaveProperty('OR');
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns expense when found for tenant', async () => {
      mockPrisma.expense.findFirst.mockResolvedValue(fakeExpense);

      const result = await service.findOne(TENANT_ID, 'expense-1');

      expect(mockPrisma.expense.findFirst).toHaveBeenCalledWith({
        where: { id: 'expense-1', tenantId: TENANT_ID },
      });
      expect(result).toEqual(fakeExpense);
    });

    it('throws NotFoundException when expense not found', async () => {
      mockPrisma.expense.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      amount: 15000,
      currency: 'CLP',
      category: 'Insumos',
      description: 'Pigmentos',
      paymentMethod: 'Transferencia',
      date: '2025-01-10',
      notes: 'Pedido mensual',
    };

    it('creates expense with correct tenantId and parsed date', async () => {
      mockPrisma.expense.create.mockResolvedValue(fakeExpense);

      const result = await service.create(TENANT_ID, dto);

      expect(mockPrisma.expense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            amount: dto.amount,
            category: dto.category,
            date: expect.any(Date),
          }),
        }),
      );
      expect(result).toEqual(fakeExpense);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    const dto = {
      amount: 20000,
      currency: 'CLP',
      category: 'Marketing',
      description: 'Instagram ads',
      paymentMethod: 'Tarjeta',
      date: '2025-02-01',
    };

    it('updates expense after ownership check', async () => {
      mockPrisma.expense.findFirst.mockResolvedValue(fakeExpense);
      mockPrisma.expense.update.mockResolvedValue({ ...fakeExpense, ...dto });

      const result = await service.update(TENANT_ID, 'expense-1', dto);

      expect(mockPrisma.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'expense-1' } }),
      );
      expect(result.category).toBe('Marketing');
    });

    it('throws NotFoundException when expense not found', async () => {
      mockPrisma.expense.findFirst.mockResolvedValue(null);
      await expect(service.update(TENANT_ID, 'missing', dto)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.expense.update).not.toHaveBeenCalled();
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes expense and returns { ok: true }', async () => {
      mockPrisma.expense.findFirst.mockResolvedValue(fakeExpense);
      mockPrisma.expense.delete.mockResolvedValue({});

      const result = await service.remove(TENANT_ID, 'expense-1');

      expect(mockPrisma.expense.delete).toHaveBeenCalledWith({ where: { id: 'expense-1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when expense not found', async () => {
      mockPrisma.expense.findFirst.mockResolvedValue(null);
      await expect(service.remove(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.expense.delete).not.toHaveBeenCalled();
    });
  });
});
