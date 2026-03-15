import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ClinicalService } from './clinical.service';
import { PrismaService } from '../../database/prisma.service';

const mockContact = {
  id: 'contact-1',
  tenantId: 'tenant-1',
  name: 'María García',
  waPhone: '+1234567890',
};

const mockProfile = {
  id: 'profile-1',
  tenantId: 'tenant-1',
  contactId: 'contact-1',
  allergies: 'Penicilina',
  skinType: 'Mixta',
  conditions: null,
  medications: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockEntry = {
  id: 'entry-1',
  tenantId: 'tenant-1',
  profileId: 'profile-1',
  treatment: 'Limpieza facial',
  products: 'Sérum vitamina C',
  technique: 'Ultrasonido',
  observations: 'Piel reactiva',
  nextVisitNotes: 'Repetir en 4 semanas',
  date: new Date('2026-03-15T10:00:00Z'),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  contact: {
    findFirst: jest.fn(),
  },
  clinicalProfile: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  clinicalEntry: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('ClinicalService', () => {
  let service: ClinicalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClinicalService>(ClinicalService);
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('returns existing profile with entries when found', async () => {
      const profileWithEntries = { ...mockProfile, entries: [mockEntry] };
      mockPrisma.contact.findFirst.mockResolvedValue(mockContact);
      mockPrisma.clinicalProfile.findUnique.mockResolvedValue(profileWithEntries);

      const result = await service.getProfile('tenant-1', 'contact-1');

      expect(mockPrisma.contact.findFirst).toHaveBeenCalledWith({
        where: { id: 'contact-1', tenantId: 'tenant-1' },
      });
      expect(mockPrisma.clinicalProfile.findUnique).toHaveBeenCalledWith({
        where: { contactId: 'contact-1' },
        include: { entries: { orderBy: { date: 'desc' } } },
      });
      expect(result).toEqual(profileWithEntries);
    });

    it('returns empty shell when no profile exists', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(mockContact);
      mockPrisma.clinicalProfile.findUnique.mockResolvedValue(null);

      const result = await service.getProfile('tenant-1', 'contact-1');

      expect(result).toEqual({
        contactId: 'contact-1',
        allergies: null,
        skinType: null,
        conditions: null,
        medications: null,
        notes: null,
        entries: [],
      });
    });

    it('throws NotFoundException when contact not found', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);

      await expect(service.getProfile('tenant-1', 'contact-999')).rejects.toThrow(NotFoundException);

      expect(mockPrisma.clinicalProfile.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('upsertProfile', () => {
    it('creates profile when none exists', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(mockContact);
      mockPrisma.clinicalProfile.upsert.mockResolvedValue(mockProfile);

      const dto = { allergies: 'Penicilina', skinType: 'Mixta' };
      const result = await service.upsertProfile('tenant-1', 'contact-1', dto);

      expect(mockPrisma.clinicalProfile.upsert).toHaveBeenCalledWith({
        where: { contactId: 'contact-1' },
        create: { tenantId: 'tenant-1', contactId: 'contact-1', ...dto },
        update: { ...dto },
      });
      expect(result).toEqual(mockProfile);
    });

    it('updates existing profile', async () => {
      const updatedProfile = { ...mockProfile, skinType: 'Seca' };
      mockPrisma.contact.findFirst.mockResolvedValue(mockContact);
      mockPrisma.clinicalProfile.upsert.mockResolvedValue(updatedProfile);

      const dto = { skinType: 'Seca' };
      const result = await service.upsertProfile('tenant-1', 'contact-1', dto);

      expect(mockPrisma.clinicalProfile.upsert).toHaveBeenCalledWith({
        where: { contactId: 'contact-1' },
        create: { tenantId: 'tenant-1', contactId: 'contact-1', ...dto },
        update: { ...dto },
      });
      expect(result.skinType).toBe('Seca');
    });

    it('throws NotFoundException when contact not found', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);

      await expect(
        service.upsertProfile('tenant-1', 'contact-999', { allergies: 'Latex' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.clinicalProfile.upsert).not.toHaveBeenCalled();
    });
  });

  describe('addEntry', () => {
    it('creates entry and auto-creates profile if missing', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(mockContact);
      mockPrisma.clinicalProfile.upsert.mockResolvedValue(mockProfile);
      mockPrisma.clinicalEntry.create.mockResolvedValue(mockEntry);

      const dto = {
        treatment: 'Limpieza facial',
        products: 'Sérum vitamina C',
        technique: 'Ultrasonido',
        observations: 'Piel reactiva',
        nextVisitNotes: 'Repetir en 4 semanas',
        date: '2026-03-15T10:00:00Z',
      };

      const result = await service.addEntry('tenant-1', 'contact-1', dto);

      expect(mockPrisma.clinicalProfile.upsert).toHaveBeenCalledWith({
        where: { contactId: 'contact-1' },
        create: { tenantId: 'tenant-1', contactId: 'contact-1' },
        update: {},
      });
      expect(mockPrisma.clinicalEntry.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          profileId: 'profile-1',
          treatment: 'Limpieza facial',
          products: 'Sérum vitamina C',
          technique: 'Ultrasonido',
          observations: 'Piel reactiva',
          nextVisitNotes: 'Repetir en 4 semanas',
          date: new Date('2026-03-15T10:00:00Z'),
        },
      });
      expect(result).toEqual(mockEntry);
    });

    it('uses current date when date not provided', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(mockContact);
      mockPrisma.clinicalProfile.upsert.mockResolvedValue(mockProfile);
      mockPrisma.clinicalEntry.create.mockResolvedValue(mockEntry);

      const before = new Date();
      await service.addEntry('tenant-1', 'contact-1', { treatment: 'Hidratación' });
      const after = new Date();

      const callArgs = mockPrisma.clinicalEntry.create.mock.calls[0][0];
      const usedDate: Date = callArgs.data.date;
      expect(usedDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(usedDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('throws NotFoundException when contact not found', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);

      await expect(
        service.addEntry('tenant-1', 'contact-999', { treatment: 'Limpieza' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.clinicalEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('updateEntry', () => {
    it('updates entry when found', async () => {
      const updatedEntry = { ...mockEntry, treatment: 'Exfoliación química' };
      mockPrisma.clinicalEntry.findFirst.mockResolvedValue(mockEntry);
      mockPrisma.clinicalEntry.update.mockResolvedValue(updatedEntry);

      const dto = { treatment: 'Exfoliación química' };
      const result = await service.updateEntry('tenant-1', 'entry-1', dto);

      expect(mockPrisma.clinicalEntry.findFirst).toHaveBeenCalledWith({
        where: { id: 'entry-1', tenantId: 'tenant-1' },
      });
      expect(mockPrisma.clinicalEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
        data: { treatment: 'Exfoliación química', date: undefined },
      });
      expect(result).toEqual(updatedEntry);
    });

    it('converts date string to Date object on update', async () => {
      mockPrisma.clinicalEntry.findFirst.mockResolvedValue(mockEntry);
      mockPrisma.clinicalEntry.update.mockResolvedValue(mockEntry);

      await service.updateEntry('tenant-1', 'entry-1', { date: '2026-04-01T09:00:00Z' });

      expect(mockPrisma.clinicalEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ date: new Date('2026-04-01T09:00:00Z') }),
        }),
      );
    });

    it('throws NotFoundException when entry not found', async () => {
      mockPrisma.clinicalEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.updateEntry('tenant-1', 'entry-999', { treatment: 'Algo' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.clinicalEntry.update).not.toHaveBeenCalled();
    });
  });

  describe('removeEntry', () => {
    it('deletes entry and returns { ok: true }', async () => {
      mockPrisma.clinicalEntry.findFirst.mockResolvedValue(mockEntry);
      mockPrisma.clinicalEntry.delete.mockResolvedValue(mockEntry);

      const result = await service.removeEntry('tenant-1', 'entry-1');

      expect(mockPrisma.clinicalEntry.findFirst).toHaveBeenCalledWith({
        where: { id: 'entry-1', tenantId: 'tenant-1' },
      });
      expect(mockPrisma.clinicalEntry.delete).toHaveBeenCalledWith({ where: { id: 'entry-1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when entry not found', async () => {
      mockPrisma.clinicalEntry.findFirst.mockResolvedValue(null);

      await expect(service.removeEntry('tenant-1', 'entry-999')).rejects.toThrow(NotFoundException);

      expect(mockPrisma.clinicalEntry.delete).not.toHaveBeenCalled();
    });
  });
});
