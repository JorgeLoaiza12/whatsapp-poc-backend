// use context7
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../database/prisma.service';
import { AppointmentStatus } from '@prisma/client';

const mockAppointment = {
  id: 'appt-1',
  tenantId: 'tenant-1',
  contactId: 'contact-1',
  serviceName: 'Corte de cabello',
  scheduledAt: new Date('2026-03-20T10:00:00Z'),
  durationMins: 60,
  notes: null,
  status: AppointmentStatus.SCHEDULED,
  reminder24hSent: false,
  reminder1hSent: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  contact: { id: 'contact-1', name: 'Juan', waPhone: '+1234567890' },
};

const mockContact = {
  id: 'contact-1',
  tenantId: 'tenant-1',
  name: 'Juan',
  waPhone: '+1234567890',
};

const mockPrisma = {
  appointment: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  contact: {
    findFirst: jest.fn(),
  },
};

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates appointment for valid contactId in tenant', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(mockContact);
      mockPrisma.appointment.create.mockResolvedValue(mockAppointment);

      const dto = {
        contactId: 'contact-1',
        serviceName: 'Corte de cabello',
        scheduledAt: '2026-03-20T10:00:00Z',
        durationMins: 60,
      };

      const result = await service.create('tenant-1', dto);

      expect(mockPrisma.contact.findFirst).toHaveBeenCalledWith({
        where: { id: 'contact-1', tenantId: 'tenant-1' },
      });
      expect(mockPrisma.appointment.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          contactId: 'contact-1',
          serviceName: 'Corte de cabello',
          scheduledAt: new Date('2026-03-20T10:00:00Z'),
          durationMins: 60,
          notes: undefined,
        },
        include: { contact: { select: { id: true, name: true, waPhone: true } } },
      });
      expect(result).toEqual(mockAppointment);
    });

    it('throws NotFoundException if contact does not belong to tenant', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);

      await expect(
        service.create('tenant-1', {
          contactId: 'contact-999',
          serviceName: 'Corte',
          scheduledAt: '2026-03-20T10:00:00Z',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.appointment.create).not.toHaveBeenCalled();
    });

    it('uses default durationMins of 60 when not provided', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(mockContact);
      mockPrisma.appointment.create.mockResolvedValue(mockAppointment);

      await service.create('tenant-1', {
        contactId: 'contact-1',
        serviceName: 'Corte',
        scheduledAt: '2026-03-20T10:00:00Z',
      });

      expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ durationMins: 60 }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('returns appointments for tenant ordered by scheduledAt asc', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([mockAppointment]);

      const result = await service.findAll('tenant-1');

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        include: { contact: { select: { id: true, name: true, waPhone: true } } },
        orderBy: { scheduledAt: 'asc' },
      });
      expect(result).toEqual([mockAppointment]);
    });

    it('applies date filter when date is provided', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([mockAppointment]);

      await service.findAll('tenant-1', '2026-03-20');

      const callArgs = mockPrisma.appointment.findMany.mock.calls[0][0];
      expect(callArgs.where.scheduledAt).toBeDefined();
      expect(callArgs.where.scheduledAt.gte).toBeInstanceOf(Date);
      expect(callArgs.where.scheduledAt.lte).toBeInstanceOf(Date);

      const gte: Date = callArgs.where.scheduledAt.gte;
      const lte: Date = callArgs.where.scheduledAt.lte;
      expect(gte.getHours()).toBe(0);
      expect(gte.getMinutes()).toBe(0);
      expect(lte.getHours()).toBe(23);
      expect(lte.getMinutes()).toBe(59);
    });

    it('returns empty array when no appointments found', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([]);

      const result = await service.findAll('tenant-1');

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns appointment when found for tenant', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);

      const result = await service.findOne('tenant-1', 'appt-1');

      expect(mockPrisma.appointment.findFirst).toHaveBeenCalledWith({
        where: { id: 'appt-1', tenantId: 'tenant-1' },
        include: { contact: { select: { id: true, name: true, waPhone: true } } },
      });
      expect(result).toEqual(mockAppointment);
    });

    it('throws NotFoundException if appointment not found', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(null);

      await expect(service.findOne('tenant-1', 'appt-999')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if appointment belongs to different tenant', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(null);

      await expect(service.findOne('tenant-other', 'appt-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates appointment fields', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      const updated = { ...mockAppointment, serviceName: 'Tinte' };
      mockPrisma.appointment.update.mockResolvedValue(updated);

      const result = await service.update('tenant-1', 'appt-1', { serviceName: 'Tinte' });

      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { serviceName: 'Tinte' },
        include: { contact: { select: { id: true, name: true, waPhone: true } } },
      });
      expect(result).toEqual(updated);
    });

    it('converts scheduledAt string to Date on update', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.appointment.update.mockResolvedValue(mockAppointment);

      await service.update('tenant-1', 'appt-1', { scheduledAt: '2026-04-01T09:00:00Z' });

      expect(mockPrisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ scheduledAt: new Date('2026-04-01T09:00:00Z') }),
        }),
      );
    });

    it('throws NotFoundException if appointment not found', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(null);

      await expect(
        service.update('tenant-1', 'appt-999', { serviceName: 'Tinte' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes appointment and returns ok', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      mockPrisma.appointment.delete.mockResolvedValue(mockAppointment);

      const result = await service.remove('tenant-1', 'appt-1');

      expect(mockPrisma.appointment.delete).toHaveBeenCalledWith({ where: { id: 'appt-1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException if appointment not found', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(null);

      await expect(service.remove('tenant-1', 'appt-999')).rejects.toThrow(NotFoundException);

      expect(mockPrisma.appointment.delete).not.toHaveBeenCalled();
    });
  });

  describe('markComplete', () => {
    it('sets status to COMPLETED and returns appointment', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      const completed = { ...mockAppointment, status: AppointmentStatus.COMPLETED };
      mockPrisma.appointment.update.mockResolvedValue(completed);

      const result = await service.markComplete('tenant-1', 'appt-1');

      expect(mockPrisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { status: AppointmentStatus.COMPLETED },
        include: { contact: { select: { id: true, name: true, waPhone: true } } },
      });
      expect(result.status).toBe(AppointmentStatus.COMPLETED);
    });

    it('throws NotFoundException if appointment not found', async () => {
      mockPrisma.appointment.findFirst.mockResolvedValue(null);

      await expect(service.markComplete('tenant-1', 'appt-999')).rejects.toThrow(NotFoundException);

      expect(mockPrisma.appointment.update).not.toHaveBeenCalled();
    });
  });
});
