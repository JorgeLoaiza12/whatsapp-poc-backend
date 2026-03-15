// use context7
import { Test, TestingModule } from '@nestjs/testing';
import { ReminderCron } from './reminder.cron';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

const TENANT_ID = 'tenant-1';
const NOW = new Date('2026-03-14T09:00:00.000Z');

const mockPrisma = {
  tenant: { findMany: jest.fn() },
  service: { findMany: jest.fn() },
  income: { findMany: jest.fn() },
  reminderDismissal: { findMany: jest.fn() },
  reminderLog: { findMany: jest.fn(), create: jest.fn() },
  contact: { findFirst: jest.fn() },
  whatsAppAccount: { findFirst: jest.fn() },
  conversation: { findFirst: jest.fn() },
};

const mockWhatsAppService = {
  sendMessage: jest.fn(),
};

const fakeService = {
  id: 'svc-1',
  tenantId: TENANT_ID,
  name: 'Diseño de cejas',
  isActive: true,
  daysForNextTouchup: 30,
};

const fakeContact = {
  id: 'contact-1',
  tenantId: TENANT_ID,
  waPhone: '56912345678',
  name: 'Ana García',
};

const fakeAccount = {
  id: 'acc-1',
  tenantId: TENANT_ID,
  phoneNumberId: 'phone-1',
  accessToken: 'tok-123',
};

describe('ReminderCron', () => {
  let cron: ReminderCron;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderCron,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsAppService, useValue: mockWhatsAppService },
      ],
    }).compile();

    cron = module.get<ReminderCron>(ReminderCron);
  });

  afterEach(() => jest.useRealTimers());

  describe('runDailyReminders', () => {
    it('does nothing when no tenants exist', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);

      await cron.runDailyReminders();

      expect(mockPrisma.service.findMany).not.toHaveBeenCalled();
    });

    it('skips tenant when it has no services with daysForNextTouchup', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_ID }]);
      mockPrisma.service.findMany.mockResolvedValue([]);

      await cron.runDailyReminders();

      expect(mockPrisma.income.findMany).not.toHaveBeenCalled();
    });

    it('sends WhatsApp message when contact is overdue and not dismissed', async () => {
      const overdueDate = new Date(NOW.getTime() - 35 * 86_400_000); // 35 days ago > 30 threshold

      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_ID }]);
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);
      mockPrisma.reminderDismissal.findMany.mockResolvedValue([]);
      mockPrisma.reminderLog.findMany.mockResolvedValue([]); // no recent log
      mockPrisma.income.findMany.mockResolvedValue([
        { contactId: 'contact-1', date: overdueDate, contact: fakeContact },
      ]);
      mockPrisma.whatsAppAccount.findFirst.mockResolvedValue(fakeAccount);
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      mockWhatsAppService.sendMessage.mockResolvedValue({ waMessageId: 'wa-msg-1' });
      mockPrisma.reminderLog.create.mockResolvedValue({});

      await cron.runDailyReminders();

      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('skips contact who has a ReminderLog within last 7 days', async () => {
      const overdueDate = new Date(NOW.getTime() - 35 * 86_400_000);
      const recentLogDate = new Date(NOW.getTime() - 3 * 86_400_000); // 3 days ago

      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_ID }]);
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);
      mockPrisma.reminderDismissal.findMany.mockResolvedValue([]);
      mockPrisma.reminderLog.findMany.mockResolvedValue([
        { contactId: 'contact-1', sentAt: recentLogDate },
      ]);
      mockPrisma.income.findMany.mockResolvedValue([
        { contactId: 'contact-1', date: overdueDate, contact: fakeContact },
      ]);

      await cron.runDailyReminders();

      expect(mockWhatsAppService.sendMessage).not.toHaveBeenCalled();
    });

    it('skips dismissed contacts', async () => {
      const overdueDate = new Date(NOW.getTime() - 35 * 86_400_000);

      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_ID }]);
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);
      mockPrisma.reminderDismissal.findMany.mockResolvedValue([
        { contactId: 'contact-1' },
      ]);
      mockPrisma.reminderLog.findMany.mockResolvedValue([]);
      mockPrisma.income.findMany.mockResolvedValue([
        { contactId: 'contact-1', date: overdueDate, contact: fakeContact },
      ]);

      await cron.runDailyReminders();

      expect(mockWhatsAppService.sendMessage).not.toHaveBeenCalled();
    });

    it('saves ReminderLog with FAILED status when WhatsApp send throws', async () => {
      const overdueDate = new Date(NOW.getTime() - 35 * 86_400_000);

      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_ID }]);
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);
      mockPrisma.reminderDismissal.findMany.mockResolvedValue([]);
      mockPrisma.reminderLog.findMany.mockResolvedValue([]);
      mockPrisma.income.findMany.mockResolvedValue([
        { contactId: 'contact-1', date: overdueDate, contact: fakeContact },
      ]);
      mockPrisma.whatsAppAccount.findFirst.mockResolvedValue(fakeAccount);
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      mockWhatsAppService.sendMessage.mockRejectedValue(new Error('Meta API error'));
      mockPrisma.reminderLog.create.mockResolvedValue({});

      await cron.runDailyReminders();

      expect(mockPrisma.reminderLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('deduplicates contacts per service — only sends once per contact', async () => {
      const overdueDate = new Date(NOW.getTime() - 35 * 86_400_000);

      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_ID }]);
      mockPrisma.service.findMany.mockResolvedValue([fakeService]);
      mockPrisma.reminderDismissal.findMany.mockResolvedValue([]);
      mockPrisma.reminderLog.findMany.mockResolvedValue([]);
      // Same contact, two incomes — should only send once
      mockPrisma.income.findMany.mockResolvedValue([
        { contactId: 'contact-1', date: overdueDate, contact: fakeContact },
        { contactId: 'contact-1', date: new Date(overdueDate.getTime() - 5 * 86_400_000), contact: fakeContact },
      ]);
      mockPrisma.whatsAppAccount.findFirst.mockResolvedValue(fakeAccount);
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      mockWhatsAppService.sendMessage.mockResolvedValue({ waMessageId: 'wa-msg-1' });
      mockPrisma.reminderLog.create.mockResolvedValue({});

      await cron.runDailyReminders();

      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledTimes(1);
    });
  });
});
