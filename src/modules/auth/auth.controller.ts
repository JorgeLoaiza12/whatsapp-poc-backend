import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { InviteAgentDto } from './dto/invite-agent.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('team/invite')
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteAgentDto) {
    return this.authService.inviteAgent(user.tenantId, dto.email, dto.name, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('team')
  getTeam(@CurrentUser() user: AuthUser) {
    return this.authService.getTeam(user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('team/:userId')
  removeTeamMember(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.authService.removeTeamMember(user.tenantId, userId, user.id);
  }
}
