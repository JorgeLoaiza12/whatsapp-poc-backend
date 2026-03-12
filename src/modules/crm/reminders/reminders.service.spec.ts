import { Test, TestingModule } from '@nestjs/testing';
import { RemindersService } from './reminders.service';
import { PrismaService } from '../../../database/prisma.service';

const TENANT_ID = 'tenant-1';

const mockPrisma = {
  service: { findMany: jest.fn() },
  reminderDismissal: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  income: { findMany: jest.fn() },
};

const thirtyDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

const fakeService = {
  id: 'service-1',
  tenantId: TENANT_ID,
  name: 'Diseño de cejas',
  isActive: true,
  daysForNextTouchup: 30,
};

describe('RemindersService', () => {
  let service: RemindersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RemindersService>(RemindersService);
  });

  // ── findPending ──────────────────────────────────────────────────────────

  describe('findPending', () => {
    it('returns empty array when no services have daysForNextTouchup configured', async () => {
      mockPrisma.service.findMany.mockResolvedValue([]);

      const result = await service.findPending(TENANT_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.income.findMany).not.toHaveBeenCalled();
    });

    it('returns reminders for clients who exceeded daysForNextTouchup', async () => {
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);
      mockPrisma.reminderDismissal.findMany.mockResolvedValue([]);
      mockPrisma.income.findMany.mockResolvedValue([
        {
          id: 'income-1',
          contactId: 'contact-1',
          date: thirtyDaysAgo,
          contact: { id: 'contact-1', name: 'Ana García', waPhone: '56912345678' },
        },
      ]);

      const result = await service.findPending(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        contactId: 'contact-1',
        contactName: 'Ana García',
        serviceName: 'Diseño de cejas',
        dismissed: false,
      });
      expect(result[0].daysOverdue).toBeGreaterThanOrEqual(0);
    });

    it('marks reminders as dismissed when a dismissal exists', async () => {
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);
      mockPrisma.reminderDismissal.findMany.mockResolvedValue([
        { contactId: 'contact-1' },
      ]);
      mockPrisma.income.findMany.mockResolvedValue([
        {
          id: 'income-1',
          contactId: 'contact-1',
          date: thirtyDaysAgo,
          contact: { id: 'contact-1', name: 'Ana García', waPhone: '56912345678' },
        },
      ]);

      const result = await service.findPending(TENANT_ID);

      expect(result[0].dismissed).toBe(true);
    });

    it('returns non-dismissed reminders before dismissed ones', async () => {
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);
      mockPrisma.reminderDismissal.findMany.mockResolvedValue([
        { contactId: 'contact-2' },
      ]);
      mockPrisma.income.findMany.mockResolvedValue([
        {
          id: 'income-2',
          contactId: 'contact-2',
          date: thirtyDaysAgo,
          contact: { id: 'contact-2', name: 'Dismissed Client', waPhone: '56999999999' },
        },
        {
          id: 'income-1',
          contactId: 'contact-1',
          date: thirtyDaysAgo,
          contact: { id: 'contact-1', name: 'Active Client', waPhone: '56912345678' },
        },
      ]);

      const result = await service.findPending(TENANT_ID);

      // Non-dismissed first
      expect(result[0].dismissed).toBe(false);
      expect(result[1].dismissed).toBe(true);
    });

    it('deduplicates contacts — only the most recent income per contact appears', async () => {
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);
      mockPrisma.reminderDismissal.findMany.mockResolvedValue([]);
      // Same contactId, two incomes — service orders by date desc so first is latest
      mockPrisma.income.findMany.mockResolvedValue([
        {
          id: 'income-2',
          contactId: 'contact-1',
          date: thirtyDaysAgo,
          contact: { id: 'contact-1', name: 'Ana', waPhone: '56912345678' },
        },
        {
          id: 'income-1',
          contactId: 'contact-1',
          date: new Date(thirtyDaysAgo.getTime() - 10 * 86400000), // older
          contact: { id: 'contact-1', name: 'Ana', waPhone: '56912345678' },
        },
      ]);

      const result = await service.findPending(TENANT_ID);

      // Only one entry per contact
      expect(result).toHaveLength(1);
    });
  });

  // ── dismiss ──────────────────────────────────────────────────────────────

  describe('dismiss', () => {
    it('creates a new dismissal when none exists', async () => {
      mockPrisma.reminderDismissal.findFirst.mockResolvedValue(null);
      mockPrisma.reminderDismissal.create.mockResolvedValue({ id: 'dismiss-1' });

      await service.dismiss(TENANT_ID, 'contact-1', 'Diseño de cejas');

      expect(mockPrisma.reminderDismissal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            contactId: 'contact-1',
            serviceName: 'Diseño de cejas',
          }),
        }),
      );
    });

    it('updates dismissedAt when dismissal already exists', async () => {
      mockPrisma.reminderDismissal.findFirst.mockResolvedValue({ id: 'dismiss-1' });
      mockPrisma.reminderDismissal.update.mockResolvedValue({ id: 'dismiss-1' });

      await service.dismiss(TENANT_ID, 'contact-1', 'Diseño de cejas');

      expect(mockPrisma.reminderDismissal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dismiss-1' },
          data: expect.objectContaining({ dismissedAt: expect.any(Date) }),
        }),
      );
      expect(mockPrisma.reminderDismissal.create).not.toHaveBeenCalled();
    });
  });

  // ── undismiss ────────────────────────────────────────────────────────────

  describe('undismiss', () => {
    it('deletes all matching dismissals and returns { ok: true }', async () => {
      mockPrisma.reminderDismissal.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.undismiss(TENANT_ID, 'contact-1', 'Diseño de cejas');

      expect(mockPrisma.reminderDismissal.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, contactId: 'contact-1', serviceName: 'Diseño de cejas' },
      });
      expect(result).toEqual({ ok: true });
    });
  });
});
