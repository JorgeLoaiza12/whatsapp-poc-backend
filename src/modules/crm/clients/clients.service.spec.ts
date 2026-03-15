import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { PrismaService } from '../../../database/prisma.service';

const TENANT_ID = 'tenant-1';

const mockPrisma = {
  contact: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const fakeContact = {
  id: 'contact-1',
  tenantId: TENANT_ID,
  waPhone: '56912345678',
  name: 'Ana García',
  phone: '56912345678',
  email: 'ana@test.com',
  instagram: '@ana',
  notes: 'VIP client',
  loyaltyStamps: 3,
};

describe('ClientsService', () => {
  let service: ClientsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all contacts for tenant ordered by createdAt desc', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([fakeContact]);

      const result = await service.findAll(TENANT_ID);

      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual([fakeContact]);
    });

    it('applies OR search filter when search param is provided', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([fakeContact]);

      await service.findAll(TENANT_ID, 'ana');

      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.objectContaining({ contains: 'ana' }) }),
            ]),
          }),
        }),
      );
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns contact with incomes and conversations included', async () => {
      const rich = { ...fakeContact, incomes: [], conversations: [] };
      mockPrisma.contact.findFirst.mockResolvedValue(rich);

      const result = await service.findOne(TENANT_ID, 'contact-1');

      expect(mockPrisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'contact-1', tenantId: TENANT_ID },
          include: expect.objectContaining({ incomes: expect.any(Object) }),
        }),
      );
      expect(result).toEqual(rich);
    });

    it('throws NotFoundException when contact does not exist', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      name: 'Ana García',
      waPhone: '+56912345678', // has leading +
      phone: '56912345678',
      email: 'ana@test.com',
      instagram: '@ana',
      notes: undefined,
      loyaltyStamps: 0,
    };

    it('strips leading + from waPhone before saving', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue(null);
      mockPrisma.contact.create.mockResolvedValue({ ...fakeContact });

      await service.create(TENANT_ID, dto);

      expect(mockPrisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ waPhone: '56912345678' }),
        }),
      );
    });

    it('throws ConflictException when waPhone already registered for tenant', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.contact.create).not.toHaveBeenCalled();
    });

    it('accepts waPhone without + prefix', async () => {
      mockPrisma.contact.findUnique.mockResolvedValue(null);
      mockPrisma.contact.create.mockResolvedValue(fakeContact);

      await service.create(TENANT_ID, { ...dto, waPhone: '56912345678' });

      expect(mockPrisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ waPhone: '56912345678' }),
        }),
      );
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    const dto = {
      name: 'Ana Updated',
      waPhone: '56912345678',
      loyaltyStamps: 5,
    };

    it('updates contact fields after ownership check', async () => {
      mockPrisma.contact.findFirst
        .mockResolvedValueOnce({ ...fakeContact, incomes: [], conversations: [] }) // findOne
        .mockResolvedValueOnce(null); // conflict check
      mockPrisma.contact.update.mockResolvedValue({ ...fakeContact, name: 'Ana Updated' });

      const result = await service.update(TENANT_ID, 'contact-1', dto);

      expect(mockPrisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'contact-1' },
          data: expect.objectContaining({ name: 'Ana Updated' }),
        }),
      );
      expect(result.name).toBe('Ana Updated');
    });

    it('throws ConflictException when waPhone is taken by another contact', async () => {
      mockPrisma.contact.findFirst
        .mockResolvedValueOnce({ ...fakeContact, incomes: [], conversations: [] }) // findOne
        .mockResolvedValueOnce({ id: 'other-contact' }); // conflict found

      await expect(service.update(TENANT_ID, 'contact-1', dto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.contact.update).not.toHaveBeenCalled();
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes contact and returns { ok: true }', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue({ ...fakeContact, incomes: [], conversations: [] });
      mockPrisma.contact.delete.mockResolvedValue({});

      const result = await service.remove(TENANT_ID, 'contact-1');

      expect(mockPrisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'contact-1' } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException when contact does not exist', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);
      await expect(service.remove(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.contact.delete).not.toHaveBeenCalled();
    });
  });

  // ── adjustStamp ──────────────────────────────────────────────────────────

  describe('adjustStamp', () => {
    it('increments stamps and caps at 10', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue({ ...fakeContact, loyaltyStamps: 9, incomes: [], conversations: [] });
      mockPrisma.contact.update.mockResolvedValue({ ...fakeContact, loyaltyStamps: 10 });

      await service.adjustStamp(TENANT_ID, 'contact-1', 2);

      expect(mockPrisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { loyaltyStamps: 10 } }),
      );
    });

    it('decrements stamps and floors at 0', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue({ ...fakeContact, loyaltyStamps: 1, incomes: [], conversations: [] });
      mockPrisma.contact.update.mockResolvedValue({ ...fakeContact, loyaltyStamps: 0 });

      await service.adjustStamp(TENANT_ID, 'contact-1', -5);

      expect(mockPrisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { loyaltyStamps: 0 } }),
      );
    });
  });
});
