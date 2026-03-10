import {
  Injectable,
  ConflictException,
  UnauthorizedException,
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
    return this.issueToken(user.id, user.email, tenant.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueToken(user.id, user.email, user.tenantId);
  }

  private issueToken(userId: string, email: string, tenantId: string) {
    const payload = { sub: userId, email, tenantId };
    return {
      accessToken: this.jwtService.sign(payload),
      userId,
      tenantId,
    };
  }
}
