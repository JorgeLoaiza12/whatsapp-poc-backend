import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { QuickRepliesService } from './quick-replies.service';
import { PrismaService } from '../../../database/prisma.service';

const mockPrisma = {
  quickReply: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('QuickRepliesService', () => {
  let service: QuickRepliesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuickRepliesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<QuickRepliesService>(QuickRepliesService);
  });

  describe('findAll', () => {
    it('returns quick replies for tenant ordered by sortOrder asc', async () => {
      const tenantId = 'tenant-1';
      const replies = [
        { id: '1', tenantId, title: 'Hello', body: 'Hi there!', sortOrder: 0 },
        { id: '2', tenantId, title: 'Thanks', body: 'Thank you!', sortOrder: 1 },
      ];
      mockPrisma.quickReply.findMany.mockResolvedValue(replies);

      const result = await service.findAll(tenantId);

      expect(mockPrisma.quickReply.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual(replies);
    });
  });

  describe('create', () => {
    it('creates quick reply', async () => {
      const tenantId = 'tenant-1';
      const dto = { title: 'Hello', body: 'Hi there!', sortOrder: 0 };
      const created = { id: '1', tenantId, ...dto };
      mockPrisma.quickReply.create.mockResolvedValue(created);

      const result = await service.create(tenantId, dto);

      expect(mockPrisma.quickReply.create).toHaveBeenCalledWith({
        data: { tenantId, title: dto.title, body: dto.body, sortOrder: 0 },
      });
      expect(result).toEqual(created);
    });

    it('defaults sortOrder to 0 when not provided', async () => {
      const tenantId = 'tenant-1';
      const dto = { title: 'Hello', body: 'Hi there!' };
      const created = { id: '1', tenantId, ...dto, sortOrder: 0 };
      mockPrisma.quickReply.create.mockResolvedValue(created);

      await service.create(tenantId, dto);

      expect(mockPrisma.quickReply.create).toHaveBeenCalledWith({
        data: { tenantId, title: dto.title, body: dto.body, sortOrder: 0 },
      });
    });
  });

  describe('update', () => {
    it('updates quick reply when found', async () => {
      const tenantId = 'tenant-1';
      const id = 'reply-1';
      const existing = { id, tenantId, title: 'Old', body: 'Old body', sortOrder: 0 };
      const dto = { title: 'New', body: 'New body' };
      const updated = { ...existing, ...dto };
      mockPrisma.quickReply.findFirst.mockResolvedValue(existing);
      mockPrisma.quickReply.update.mockResolvedValue(updated);

      const result = await service.update(tenantId, id, dto);

      expect(mockPrisma.quickReply.findFirst).toHaveBeenCalledWith({ where: { id, tenantId } });
      expect(mockPrisma.quickReply.update).toHaveBeenCalledWith({
        where: { id },
        data: { title: 'New', body: 'New body' },
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException if not found', async () => {
      const tenantId = 'tenant-1';
      const id = 'nonexistent';
      mockPrisma.quickReply.findFirst.mockResolvedValue(null);

      await expect(service.update(tenantId, id, { title: 'New' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.quickReply.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes quick reply when found', async () => {
      const tenantId = 'tenant-1';
      const id = 'reply-1';
      const existing = { id, tenantId, title: 'Hello', body: 'Hi', sortOrder: 0 };
      mockPrisma.quickReply.findFirst.mockResolvedValue(existing);
      mockPrisma.quickReply.delete.mockResolvedValue(existing);

      const result = await service.remove(tenantId, id);

      expect(mockPrisma.quickReply.findFirst).toHaveBeenCalledWith({ where: { id, tenantId } });
      expect(mockPrisma.quickReply.delete).toHaveBeenCalledWith({ where: { id } });
      expect(result).toEqual({ ok: true });
    });

    it('throws NotFoundException if not found', async () => {
      const tenantId = 'tenant-1';
      const id = 'nonexistent';
      mockPrisma.quickReply.findFirst.mockResolvedValue(null);

      await expect(service.remove(tenantId, id)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.quickReply.delete).not.toHaveBeenCalled();
    });
  });
});
