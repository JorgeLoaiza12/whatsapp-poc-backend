import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
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
});
