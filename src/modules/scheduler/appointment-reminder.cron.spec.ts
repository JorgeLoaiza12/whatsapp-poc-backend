// use context7
import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentReminderCron } from './appointment-reminder.cron';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { AppointmentStatus } from '@prisma/client';

const mockContact = { id: 'contact-1', name: 'Juan', waPhone: '+1234567890' };
const mockAccount = { phoneNumberId: 'phone-1', isActive: true };
const mockTenantWithAccount = { whatsappAccounts: [mockAccount] };
const mockTenantNoAccount = { whatsappAccounts: [] };
const mockConversation = { id: 'conv-1' };

const baseAppointment = {
  id: 'appt-1',
  tenantId: 'tenant-1',
  contactId: 'contact-1',
  serviceName: 'Corte de cabello',
  scheduledAt: new Date(),
  status: AppointmentStatus.SCHEDULED,
  reminder24hSent: false,
  reminder1hSent: false,
  contact: mockContact,
  tenant: mockTenantWithAccount,
};

const mockPrisma = {
  appointment: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  conversation: {
    findFirst: jest.fn(),
  },
};

const mockWhatsAppService = {
  sendMessage: jest.fn(),
};

describe('AppointmentReminderCron', () => {
  let cron: AppointmentReminderCron;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentReminderCron,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsAppService, useValue: mockWhatsAppService },
      ],
    }).compile();

    cron = module.get<AppointmentReminderCron>(AppointmentReminderCron);
    jest.clearAllMocks();
  });

  describe('runAppointmentReminders', () => {
    it('does nothing when no appointments are in the window', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([]);

      await cron.runAppointmentReminders();

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledTimes(2); // once for 24h, once for 1h
      expect(mockWhatsAppService.sendMessage).not.toHaveBeenCalled();
      expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    });

    it('sends 24h reminder when appointment is 24h away and reminder not sent', async () => {
      const appt24h = { ...baseAppointment, reminder24hSent: false };
      // Return the 24h appointment on first call, empty on second (1h)
      mockPrisma.appointment.findMany
        .mockResolvedValueOnce([appt24h])
        .mockResolvedValueOnce([]);
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
      mockWhatsAppService.sendMessage.mockResolvedValue({});
      mockPrisma.appointment.update.mockResolvedValue({});

      await cron.runAppointmentReminders();

      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledTimes(1);
      const [tenantId, phoneNumberId, waPhone, body, convId] =
        mockWhatsAppService.sendMessage.mock.calls[0];
      expect(tenantId).toBe('tenant-1');
      expect(phoneNumberId).toBe('phone-1');
      expect(waPhone).toBe('+1234567890');
      expect(body).toContain('mañana');
      expect(body).toContain('Juan');
      expect(body).toContain('Corte de cabello');
      expect(convId).toBe('conv-1');

      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { reminder24hSent: true },
      });
    });

    it('skips 24h reminder when reminder already sent', async () => {
      // The prisma query filters by reminder24hSent: false, so already-sent ones won't be returned
      // Simulate by returning empty (Prisma would not return them due to the where clause)
      mockPrisma.appointment.findMany.mockResolvedValue([]);

      await cron.runAppointmentReminders();

      expect(mockWhatsAppService.sendMessage).not.toHaveBeenCalled();
    });

    it('sends 1h reminder when appointment is 1h away and reminder not sent', async () => {
      const appt1h = { ...baseAppointment, reminder24hSent: true, reminder1hSent: false };
      // Return empty on 24h call, appointment on 1h call
      mockPrisma.appointment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([appt1h]);
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
      mockWhatsAppService.sendMessage.mockResolvedValue({});
      mockPrisma.appointment.update.mockResolvedValue({});

      await cron.runAppointmentReminders();

      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledTimes(1);
      const [, , , body] = mockWhatsAppService.sendMessage.mock.calls[0];
      expect(body).toContain('1 hora');
      expect(body).toContain('Juan');

      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { reminder1hSent: true },
      });
    });

    it('skips appointment when no active WhatsApp account exists for tenant', async () => {
      const apptNoAccount = {
        ...baseAppointment,
        tenant: mockTenantNoAccount,
      };
      mockPrisma.appointment.findMany
        .mockResolvedValueOnce([apptNoAccount])
        .mockResolvedValueOnce([]);

      await cron.runAppointmentReminders();

      expect(mockWhatsAppService.sendMessage).not.toHaveBeenCalled();
      expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    });

    it('skips appointment when no conversation found', async () => {
      const appt = { ...baseAppointment, reminder24hSent: false };
      mockPrisma.appointment.findMany
        .mockResolvedValueOnce([appt])
        .mockResolvedValueOnce([]);
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      await cron.runAppointmentReminders();

      expect(mockWhatsAppService.sendMessage).not.toHaveBeenCalled();
      expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    });

    it('continues processing other appointments if one fails', async () => {
      const appt1 = { ...baseAppointment, id: 'appt-1' };
      const appt2 = { ...baseAppointment, id: 'appt-2', contact: { ...mockContact, name: 'Maria' } };
      mockPrisma.appointment.findMany
        .mockResolvedValueOnce([appt1, appt2])
        .mockResolvedValueOnce([]);
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
      mockWhatsAppService.sendMessage
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({});
      mockPrisma.appointment.update.mockResolvedValue({});

      await cron.runAppointmentReminders();

      // First failed, second succeeded
      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockPrisma.appointment.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-2' },
        data: { reminder24hSent: true },
      });
    });

    it('uses waPhone as name fallback when contact name is null', async () => {
      const apptNoName = {
        ...baseAppointment,
        contact: { id: 'contact-1', name: null, waPhone: '+1234567890' },
      };
      mockPrisma.appointment.findMany
        .mockResolvedValueOnce([apptNoName])
        .mockResolvedValueOnce([]);
      mockPrisma.conversation.findFirst.mockResolvedValue(mockConversation);
      mockWhatsAppService.sendMessage.mockResolvedValue({});
      mockPrisma.appointment.update.mockResolvedValue({});

      await cron.runAppointmentReminders();

      const [, , , body] = mockWhatsAppService.sendMessage.mock.calls[0];
      expect(body).toContain('+1234567890');
    });
  });
});
