import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  tenant: {
    create: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('signed.jwt.token'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── register ────────────────────────────────────────────────────────────

  describe('register', () => {
    const dto = {
      name: 'Alice',
      email: 'alice@test.com',
      password: 'Password123',
      companyName: 'Test Corp',
    };

    it('creates tenant + user and returns accessToken', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.create.mockResolvedValue({
        id: 'tenant-1',
        name: 'Test Corp',
        slug: 'test-corp',
        users: [{ id: 'user-1', email: dto.email }],
      });

      const result = await service.register(dto);

      expect(mockPrisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: dto.companyName }),
        }),
      );
      expect(result).toEqual({
        accessToken: 'signed.jwt.token',
        userId: 'user-1',
        tenantId: 'tenant-1',
      });
    });

    it('throws ConflictException when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
    });
  });

  // ── login ────────────────────────────────────────────────────────────────

  describe('login', () => {
    const dto = { email: 'alice@test.com', password: 'Password123' };

    it('returns accessToken for valid credentials', async () => {
      const hashed = await bcrypt.hash(dto.password, 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        password: hashed,
        tenantId: 'tenant-1',
      });

      const result = await service.login(dto);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(mockJwt.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: dto.email,
        tenantId: 'tenant-1',
        role: expect.any(String),
      });
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      const hashed = await bcrypt.hash('different-password', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        password: hashed,
        tenantId: 'tenant-1',
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── inviteAgent ──────────────────────────────────────────────────────────

  describe('inviteAgent', () => {
    const agentData = { email: 'agent@test.com', name: 'Agent Bob', password: 'Secret123' };

    it('creates an AGENT user and returns safe fields', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const created = {
        id: 'user-agent-1',
        email: agentData.email,
        name: agentData.name,
        role: 'AGENT',
        createdAt: new Date(),
      };
      mockPrisma.user.create.mockResolvedValue(created);

      const result = await service.inviteAgent('tenant-1', agentData.email, agentData.name, agentData.password);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: agentData.email,
            name: agentData.name,
            tenantId: 'tenant-1',
            role: 'AGENT',
          }),
          select: { id: true, email: true, name: true, role: true, createdAt: true },
        }),
      );
      expect(result).toEqual(created);
    });

    it('throws ConflictException when email is already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.inviteAgent('tenant-1', agentData.email, agentData.name, agentData.password),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  // ── getTeam ──────────────────────────────────────────────────────────────

  describe('getTeam', () => {
    it('returns all users for the tenant ordered by createdAt asc', async () => {
      const teamMembers = [
        { id: 'user-1', email: 'owner@test.com', name: 'Owner', role: 'OWNER', createdAt: new Date('2024-01-01') },
        { id: 'user-2', email: 'agent@test.com', name: 'Agent', role: 'AGENT', createdAt: new Date('2024-02-01') },
      ];
      mockPrisma.user.findMany.mockResolvedValue(teamMembers);

      const result = await service.getTeam('tenant-1');

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(teamMembers);
    });
  });

  // ── removeTeamMember ─────────────────────────────────────────────────────

  describe('removeTeamMember', () => {
    it('throws BadRequestException when trying to remove yourself', async () => {
      await expect(
        service.removeTeamMember('tenant-1', 'user-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not belong to tenant', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.removeTeamMember('tenant-1', 'user-other', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when trying to remove an OWNER', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-2', role: 'OWNER', tenantId: 'tenant-1' });

      await expect(
        service.removeTeamMember('tenant-1', 'user-2', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it('deletes AGENT user and returns { ok: true }', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-2', role: 'AGENT', tenantId: 'tenant-1' });
      mockPrisma.user.delete.mockResolvedValue({ id: 'user-2' });

      const result = await service.removeTeamMember('tenant-1', 'user-2', 'user-1');

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-2' } });
      expect(result).toEqual({ ok: true });
    });
  });
});
