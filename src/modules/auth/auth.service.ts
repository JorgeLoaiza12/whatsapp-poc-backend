import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    // Create tenant + first user atomically
    const slug =
      dto.companyName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.companyName,
        slug,
        users: {
          create: {
            email: dto.email,
            name: dto.name,
            password: await bcrypt.hash(dto.password, 10),
          },
        },
      },
      include: { users: true },
    });

    const user = tenant.users[0];
    return this.issueToken(user.id, user.email, tenant.id, user.role);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueToken(user.id, user.email, user.tenantId, user.role);
  }

  async inviteAgent(tenantId: string, email: string, name: string, password: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const hashed = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email, password: hashed, name, tenantId, role: 'AGENT' },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    return user;
  }

  async getTeam(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async removeTeamMember(tenantId: string, userId: string, requestingUserId: string) {
    if (userId === requestingUserId) throw new BadRequestException('Cannot remove yourself');
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'OWNER') throw new ForbiddenException('Cannot remove owner');
    await this.prisma.user.delete({ where: { id: userId } });
    return { ok: true };
  }

  private issueToken(userId: string, email: string, tenantId: string, role?: string) {
    const payload = { sub: userId, email, tenantId, role: role ?? 'OWNER' };
    return {
      accessToken: this.jwtService.sign(payload),
      userId,
      tenantId,
    };
  }
}
