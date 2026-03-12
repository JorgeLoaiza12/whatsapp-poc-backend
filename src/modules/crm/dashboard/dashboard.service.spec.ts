import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../../database/prisma.service';

const TENANT_ID = 'tenant-1';

const mockPrisma = {
  income: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  expense: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  contact: {
    count: jest.fn(),
  },
};

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('getStats', () => {
    beforeEach(() => {
      // Month aggregates
      mockPrisma.income.aggregate.mockResolvedValue({ _sum: { amount: 150000 }, _count: 6 });
      mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 40000 }, _count: 3 });
      mockPrisma.contact.count.mockResolvedValue(25);

      // Category breakdown
      mockPrisma.expense.groupBy.mockResolvedValue([
        { category: 'Insumos', _sum: { amount: 25000 } },
        { category: 'Marketing', _sum: { amount: 15000 } },
      ]);

      // Recent transactions
      mockPrisma.income.findMany.mockResolvedValue([
        {
          id: 'income-1',
          amount: 25000,
          currency: 'CLP',
          serviceNames: 'Diseño de cejas',
          date: new Date('2025-01-15'),
          contact: { name: 'Ana García', waPhone: '56912345678' },
        },
      ]);
      mockPrisma.expense.findMany.mockResolvedValue([
        {
          id: 'expense-1',
          amount: 5000,
          currency: 'CLP',
          description: 'Pigmentos',
          date: new Date('2025-01-14'),
        },
      ]);
    });

    it('returns monthIncome, monthExpense, and monthNet correctly', async () => {
      const result = await service.getStats(TENANT_ID);

      expect(result.monthIncome).toBe(150000);
      expect(result.monthExpense).toBe(40000);
      expect(result.monthNet).toBe(110000);
    });

    it('returns totalClients count', async () => {
      const result = await service.getStats(TENANT_ID);
      expect(result.totalClients).toBe(25);
    });

    it('returns 6-month chart data array', async () => {
      const result = await service.getStats(TENANT_ID);

      expect(result.chart).toHaveLength(6);
      result.chart.forEach((entry) => {
        expect(entry).toHaveProperty('month');
        expect(entry).toHaveProperty('income');
        expect(entry).toHaveProperty('expense');
        expect(typeof entry.income).toBe('number');
        expect(typeof entry.expense).toBe('number');
      });
    });

    it('returns expenseByCategory with category and total', async () => {
      const result = await service.getStats(TENANT_ID);

      expect(result.expenseByCategory).toEqual([
        { category: 'Insumos', total: 25000 },
        { category: 'Marketing', total: 15000 },
      ]);
    });

    it('returns recentTransactions merging incomes and expenses sorted by date', async () => {
      const result = await service.getStats(TENANT_ID);

      expect(result.recentTransactions.length).toBeGreaterThan(0);
      expect(result.recentTransactions[0]).toHaveProperty('type');
      expect(result.recentTransactions[0]).toHaveProperty('amount');
      expect(result.recentTransactions[0]).toHaveProperty('date');

      // Verify sorting: latest date first
      for (let i = 1; i < result.recentTransactions.length; i++) {
        expect(result.recentTransactions[i - 1].date.getTime()).toBeGreaterThanOrEqual(
          result.recentTransactions[i].date.getTime(),
        );
      }
    });

    it('labels income transactions with type "income" and expense with "expense"', async () => {
      const result = await service.getStats(TENANT_ID);

      const incomeItems = result.recentTransactions.filter((t) => t.type === 'income');
      const expenseItems = result.recentTransactions.filter((t) => t.type === 'expense');

      expect(incomeItems.length).toBeGreaterThan(0);
      expect(expenseItems.length).toBeGreaterThan(0);
    });

    it('handles zero income/expense gracefully (null _sum.amount)', async () => {
      mockPrisma.income.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: 0 });
      mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: 0 });

      const result = await service.getStats(TENANT_ID);

      expect(result.monthIncome).toBe(0);
      expect(result.monthExpense).toBe(0);
      expect(result.monthNet).toBe(0);
    });
  });
});
