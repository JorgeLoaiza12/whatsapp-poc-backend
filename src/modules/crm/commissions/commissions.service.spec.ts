import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { PrismaService } from '../../../database/prisma.service';

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const INCOME_ID = 'income-1';
const COMMISSION_ID = 'commission-1';

const mockPrisma = {
  commissionRule: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  commission: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
};

const fakeUser = {
  id: USER_ID,
  tenantId: TENANT_ID,
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'STAFF',
};

const fakeRule = {
  id: 'rule-1',
  tenantId: TENANT_ID,
  userId: USER_ID,
  percentage: 10,
  createdAt: new Date('2025-01-01'),
  user: { id: USER_ID, name: 'Jane Doe', email: 'jane@example.com', role: 'STAFF' },
};

const fakeCommission = {
  id: COMMISSION_ID,
  tenantId: TENANT_ID,
  userId: USER_ID,
  incomeId: INCOME_ID,
  amount: 4500,
  percentage: 10,
  status: 'PENDING',
  paidAt: null,
  createdAt: new Date('2025-01-15'),
  user: { id: USER_ID, name: 'Jane Doe', email: 'jane@example.com' },
  income: {
    id: INCOME_ID,
    serviceNames: 'Corte de cabello',
    amount: 45000,
    date: new Date('2025-01-15'),
    contact: { name: 'John Client', waPhone: '56911111111' },
  },
};

describe('CommissionsService', () => {
  let service: CommissionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CommissionsService>(CommissionsService);
  });

  // ── getRules ─────────────────────────────────────────────────────────────

  describe('getRules', () => {
    it('returns rules with user info ordered by createdAt asc', async () => {
      mockPrisma.commissionRule.findMany.mockResolvedValue([fakeRule]);

      const result = await service.getRules(TENANT_ID);

      expect(mockPrisma.commissionRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID },
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(result).toEqual([fakeRule]);
    });
  });

  // ── setRule ──────────────────────────────────────────────────────────────

  describe('setRule', () => {
    const dto = { userId: USER_ID, percentage: 10 };

    it('creates rule when none exists for the user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(fakeUser);
      mockPrisma.commissionRule.upsert.mockResolvedValue(fakeRule);

      const result = await service.setRule(TENANT_ID, dto);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: USER_ID, tenantId: TENANT_ID },
      });
      expect(mockPrisma.commissionRule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_userId: { tenantId: TENANT_ID, userId: USER_ID } },
          create: expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID, percentage: 10 }),
          update: { percentage: 10 },
        }),
      );
      expect(result).toEqual(fakeRule);
    });

    it('updates existing rule with new percentage', async () => {
      const updatedRule = { ...fakeRule, percentage: 15 };
      mockPrisma.user.findFirst.mockResolvedValue(fakeUser);
      mockPrisma.commissionRule.upsert.mockResolvedValue(updatedRule);

      const result = await service.setRule(TENANT_ID, { userId: USER_ID, percentage: 15 });

      expect(mockPrisma.commissionRule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { percentage: 15 },
        }),
      );
      expect(result.percentage).toBe(15);
    });

    it('throws NotFoundException when user not found in tenant', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.setRule(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.commissionRule.upsert).not.toHaveBeenCalled();
    });
  });

  // ── removeRule ───────────────────────────────────────────────────────────

  describe('removeRule', () => {
    it('deletes rule and returns { ok: true }', async () => {
      mockPrisma.commissionRule.findUnique.mockResolvedValue(fakeRule);
      mockPrisma.commissionRule.delete.mockResolvedValue(fakeRule);

      const result = await service.removeRule(TENANT_ID, USER_ID);

      expect(mockPrisma.commissionRule.delete).toHaveBeenCalledWith({
        where: { tenantId_userId: { tenantId: TENANT_ID, userId: USER_ID } },
      });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when rule not found', async () => {
      mockPrisma.commissionRule.findUnique.mockResolvedValue(null);

      await expect(service.removeRule(TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.commissionRule.delete).not.toHaveBeenCalled();
    });
  });

  // ── getCommissions ───────────────────────────────────────────────────────

  describe('getCommissions', () => {
    it('returns commissions filtered by tenantId', async () => {
      mockPrisma.commission.findMany.mockResolvedValue([fakeCommission]);

      const result = await service.getCommissions(TENANT_ID);

      expect(mockPrisma.commission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual([fakeCommission]);
    });

    it('supports userId filter', async () => {
      mockPrisma.commission.findMany.mockResolvedValue([fakeCommission]);

      await service.getCommissions(TENANT_ID, USER_ID);

      const callArg = mockPrisma.commission.findMany.mock.calls[0][0];
      expect(callArg.where.userId).toBe(USER_ID);
    });

    it('supports status filter', async () => {
      mockPrisma.commission.findMany.mockResolvedValue([fakeCommission]);

      await service.getCommissions(TENANT_ID, undefined, 'PENDING');

      const callArg = mockPrisma.commission.findMany.mock.calls[0][0];
      expect(callArg.where.status).toBe('PENDING');
    });
  });

  // ── markPaid ─────────────────────────────────────────────────────────────

  describe('markPaid', () => {
    const dto = { commissionIds: [COMMISSION_ID, 'commission-2'] };

    it('updates status to PAID and sets paidAt for given ids', async () => {
      mockPrisma.commission.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.markPaid(TENANT_ID, dto);

      expect(mockPrisma.commission.updateMany).toHaveBeenCalledWith({
        where: { id: { in: dto.commissionIds }, tenantId: TENANT_ID, status: 'PENDING' },
        data: expect.objectContaining({ status: 'PAID', paidAt: expect.any(Date) }),
      });
      expect(result).toEqual({ ok: true, count: 2 });
    });

    it('returns { ok: true, count } equal to the number of ids passed', async () => {
      mockPrisma.commission.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markPaid(TENANT_ID, { commissionIds: [COMMISSION_ID] });

      expect(result).toEqual({ ok: true, count: 1 });
    });
  });

  // ── createForIncome ──────────────────────────────────────────────────────

  describe('createForIncome', () => {
    it('creates commission when rule exists for user', async () => {
      mockPrisma.commissionRule.findUnique.mockResolvedValue(fakeRule);
      mockPrisma.commission.create.mockResolvedValue(fakeCommission);

      const result = await service.createForIncome(TENANT_ID, INCOME_ID, USER_ID, 45000);

      expect(mockPrisma.commission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          incomeId: INCOME_ID,
          amount: 4500,
          percentage: fakeRule.percentage,
          status: 'PENDING',
        }),
      });
      expect(result).toEqual(fakeCommission);
    });

    it('returns null when no rule exists for user', async () => {
      mockPrisma.commissionRule.findUnique.mockResolvedValue(null);

      const result = await service.createForIncome(TENANT_ID, INCOME_ID, USER_ID, 45000);

      expect(mockPrisma.commission.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  // ── getSummary ───────────────────────────────────────────────────────────

  describe('getSummary', () => {
    it('returns array with userId, userName, percentage, pendingAmount, paidAmount', async () => {
      const ruleWithUser = { ...fakeRule, user: { id: USER_ID, name: 'Jane Doe' } };
      mockPrisma.commissionRule.findMany.mockResolvedValue([ruleWithUser]);
      mockPrisma.commission.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 9000 }, _count: 2 })
        .mockResolvedValueOnce({ _sum: { amount: 18000 }, _count: 4 });

      const result = await service.getSummary(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          userId: USER_ID,
          userName: 'Jane Doe',
          percentage: 10,
          pendingAmount: 9000,
          pendingCount: 2,
          paidAmount: 18000,
          paidCount: 4,
        }),
      );
    });

    it('uses 0 for pendingAmount and paidAmount when aggregate returns null sum', async () => {
      const ruleWithUser = { ...fakeRule, user: { id: USER_ID, name: 'Jane Doe' } };
      mockPrisma.commissionRule.findMany.mockResolvedValue([ruleWithUser]);
      mockPrisma.commission.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null }, _count: 0 })
        .mockResolvedValueOnce({ _sum: { amount: null }, _count: 0 });

      const result = await service.getSummary(TENANT_ID);

      expect(result[0].pendingAmount).toBe(0);
      expect(result[0].paidAmount).toBe(0);
    });
  });
});
